import axios from 'axios';
import logger from '../../utils/logger';
import dbService from '../db/dbService';

// Constants
const CACHE_DURATION = {
  SENTIMENT: 60 * 60 * 1000, // 1 hour in milliseconds
  PREDICTION: 15 * 60 * 1000, // 15 minutes in milliseconds
  SIGNAL: 30 * 60 * 1000, // 30 minutes in milliseconds
};

// Create a logger instance for the AI service
const aiLogger = logger.child({ service: 'ai-service' });

/**
 * AI Service - Abstracts calls to external AI models
 */
const aiService = {
  /**
   * Get sentiment analysis for a given token
   * @param tokenSymbol - The token symbol to analyze (e.g., "BTC", "ETH")
   * @param timeframe - The timeframe for analysis ("1h", "24h", "7d")
   * @param forceRefresh - Whether to bypass cache and force a new analysis
   */
  async getSentimentAnalysis(
    tokenSymbol: string,
    timeframe: '1h' | '24h' | '7d' = '24h',
    forceRefresh = false
  ) {
    try {
      // Check if we have a recent sentiment analysis in the database
      if (!forceRefresh) {
        const cachedSentiment = await dbService.getLatestSentiment(tokenSymbol, timeframe);

        if (cachedSentiment) {
          const cacheAge = Date.now() - new Date(cachedSentiment.created_at).getTime();

          // If cache is fresh, return it
          if (cacheAge < CACHE_DURATION.SENTIMENT) {
            aiLogger.info('Using cached sentiment analysis', {
              token: tokenSymbol,
              timeframe,
              age_minutes: Math.round(cacheAge / 60000),
            });

            return {
              score: cachedSentiment.sentiment_score,
              sources: cachedSentiment.sources,
              cached: true,
              timestamp: cachedSentiment.created_at,
            };
          }
        }
      }

      // No valid cache, call the external API
      aiLogger.info('Fetching fresh sentiment analysis', {
        token: tokenSymbol,
        timeframe,
      });

      const sentimentEndpoint = process.env.SENTIMENT_ANALYSIS_ENDPOINT;
      if (!sentimentEndpoint) {
        throw new Error('Sentiment analysis endpoint not configured');
      }

      // Create a timer to measure API response time
      const startTime = Date.now();

      try {
        const response = await axios.post(
          sentimentEndpoint,
          {
            token: tokenSymbol,
            timeframe,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
            },
            timeout: 8000, // 8 second timeout (below Vercel's function timeout)
          }
        );

        const responseTime = Date.now() - startTime;
        aiLogger.info('Sentiment API response received', {
          token: tokenSymbol,
          timeframe,
          response_time_ms: responseTime,
        });

        if (response.status !== 200) {
          throw new Error(`Sentiment API returned status ${response.status}`);
        }

        // Validate response structure
        const result = response.data;
        if (!result || typeof result.score !== 'number' || !Array.isArray(result.sources)) {
          throw new Error('Invalid response format from sentiment API');
        }

        // Store in database for future cache
        await dbService.storeSentimentAnalysis({
          token_symbol: tokenSymbol,
          sentiment_score: result.score,
          timeframe,
          sources: result.sources,
        });

        return {
          score: result.score,
          sources: result.sources,
          cached: false,
          timestamp: new Date().toISOString(),
        };
      } catch (apiError) {
        // Enhanced error logging with request details
        aiLogger.error('Error calling sentiment API', {
          error: apiError,
          token: tokenSymbol,
          timeframe,
          endpoint: sentimentEndpoint,
          response_time_ms: Date.now() - startTime,
        });

        // If it's a timeout error, provide more context
        if (axios.isAxiosError(apiError) && apiError.code === 'ECONNABORTED') {
          throw new Error(`Sentiment analysis timed out after ${Date.now() - startTime}ms`);
        }

        // Pass along a user-friendly error
        throw new Error('Failed to fetch sentiment analysis from external service');
      }
    } catch (error) {
      aiLogger.error('Error in getSentimentAnalysis', {
        error,
        token: tokenSymbol,
        timeframe,
      });
      throw error;
    }
  },

  /**
   * Get price prediction for a given token
   * @param tokenSymbol - The token symbol to predict (e.g., "BTC", "ETH")
   * @param timeHorizon - The time horizon for prediction ("1h", "24h", "7d")
   */
  async getPricePrediction(tokenSymbol: string, timeHorizon: '1h' | '24h' | '7d' = '24h') {
    try {
      aiLogger.info('Requesting price prediction', {
        token: tokenSymbol,
        timeHorizon,
      });

      // Enhanced price prediction API call with better error handling
      const predictionEndpoint = process.env.PRICE_PREDICTION_ENDPOINT;
      if (!predictionEndpoint) {
        throw new Error('Price prediction endpoint not configured');
      }

      // Create a timer to measure API response time
      const startTime = Date.now();

      try {
        const response = await axios.post(
          predictionEndpoint,
          {
            token: tokenSymbol,
            timeHorizon,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
            },
            timeout: 10000, // 10 second timeout (predictions might take longer)
          }
        );

        const responseTime = Date.now() - startTime;
        aiLogger.info('Price prediction API response received', {
          token: tokenSymbol,
          timeHorizon,
          response_time_ms: responseTime,
        });

        if (response.status !== 200) {
          throw new Error(`Price prediction API returned status ${response.status}`);
        }

        // Validate and process the response
        const result = response.data;
        if (
          !result ||
          typeof result.currentPrice !== 'number' ||
          typeof result.predictedPrice !== 'number' ||
          typeof result.percentageChange !== 'number' ||
          typeof result.confidence !== 'number'
        ) {
          throw new Error('Invalid response format from price prediction API');
        }

        return {
          currentPrice: result.currentPrice,
          predictedPrice: result.predictedPrice,
          percentageChange: result.percentageChange,
          confidence: result.confidence,
          timestamp: new Date().toISOString(),
        };
      } catch (apiError) {
        // Enhanced error logging with request details
        aiLogger.error('Error calling price prediction API', {
          error: apiError,
          token: tokenSymbol,
          timeHorizon,
          endpoint: predictionEndpoint,
          response_time_ms: Date.now() - startTime,
        });

        // If it's a timeout error, provide more context
        if (axios.isAxiosError(apiError) && apiError.code === 'ECONNABORTED') {
          throw new Error(`Price prediction timed out after ${Date.now() - startTime}ms`);
        }

        // Pass along a user-friendly error
        throw new Error('Failed to fetch price prediction from external service');
      }
    } catch (error) {
      aiLogger.error('Error in getPricePrediction', {
        error,
        token: tokenSymbol,
        timeHorizon,
      });
      throw error;
    }
  },

  /**
   * Get trading signal for a token
   * @param tokenSymbol - The token to get signal for
   * @param includeAnalysis - Whether to include detailed analysis
   */
  async getTradingSignal(tokenSymbol: string, includeAnalysis = false) {
    try {
      aiLogger.info('Requesting trading signal', {
        token: tokenSymbol,
        includeAnalysis,
      });

      const signalEndpoint = process.env.TRADE_SIGNAL_ENDPOINT;
      if (!signalEndpoint) {
        throw new Error('Trade signal endpoint not configured');
      }

      const response = await axios.post(
        signalEndpoint,
        {
          token: tokenSymbol,
          includeAnalysis,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
          },
          timeout: 8000,
        }
      );

      if (response.status !== 200) {
        throw new Error(`Signal API returned status ${response.status}`);
      }

      return {
        token: tokenSymbol,
        signal: response.data.signal, // 'BUY', 'SELL', or 'HOLD'
        strength: response.data.strength, // 0-1 indicating confidence
        reasons: response.data.reasons || [],
        analysis: response.data.analysis || null,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      aiLogger.error('Failed to get trading signal', error, {
        token: tokenSymbol,
      });

      throw error;
    }
  },

  /**
   * Get a comprehensive analysis combining sentiment, prediction, and signal
   * @param tokenSymbol - The token to analyze
   */
  async getComprehensiveAnalysis(tokenSymbol: string) {
    try {
      aiLogger.info('Generating comprehensive analysis', {
        token: tokenSymbol,
      });

      // Get all three analyses in parallel
      const [sentiment, prediction, signal] = await Promise.all([
        this.getSentimentAnalysis(tokenSymbol),
        this.getPricePrediction(tokenSymbol).catch((err) => {
          aiLogger.warn('Failed to get price prediction during comprehensive analysis', err);
          return null;
        }),
        this.getTradingSignal(tokenSymbol, true).catch((err) => {
          aiLogger.warn('Failed to get trading signal during comprehensive analysis', err);
          return null;
        }),
      ]);

      // Combine the results
      return {
        token: tokenSymbol,
        timestamp: new Date().toISOString(),
        sentiment,
        prediction,
        signal,
        // Overall recommendation based on available data
        recommendation: signal?.signal || 'HOLD',
      };
    } catch (error) {
      aiLogger.error('Failed to generate comprehensive analysis', error, {
        token: tokenSymbol,
      });

      throw error;
    }
  },
};

export default aiService;

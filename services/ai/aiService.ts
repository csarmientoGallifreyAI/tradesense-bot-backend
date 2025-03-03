import axios from 'axios';
import logger from '../../utils/logger';
import {
  SentimentAnalysisResponse,
  PricePredictionResponse,
  TradingSignalResponse,
  ComprehensiveAnalysisResponse,
} from '../../types/api';
import { Tables } from '../db/dbService';
import dbService from '../db/dbService';

// Create a service-specific logger
const aiLogger = logger.child({ service: 'ai-service' });

// Configure cache durations (in milliseconds)
const SENTIMENT_CACHE_DURATION = 3600000; // 1 hour
const PREDICTION_CACHE_DURATION = 1800000; // 30 minutes
const SIGNAL_CACHE_DURATION = 900000; // 15 minutes

class AIService {
  private huggingfaceToken: string;
  private sentimentModelUrl: string;
  private pricePredictionModelUrl: string;
  private tradingSignalModelUrl: string;
  private comprehensiveAnalysisModelUrl: string;

  constructor() {
    this.huggingfaceToken = process.env.HUGGINGFACE_API_TOKEN || '';
    this.sentimentModelUrl = process.env.HUGGINGFACE_SENTIMENT_URL || '';
    this.pricePredictionModelUrl = process.env.HUGGINGFACE_PRICE_PREDICTION_URL || '';
    this.tradingSignalModelUrl = process.env.HUGGINGFACE_TRADING_SIGNAL_URL || '';
    this.comprehensiveAnalysisModelUrl = process.env.HUGGINGFACE_COMPREHENSIVE_ANALYSIS_URL || '';

    if (!this.huggingfaceToken) {
      aiLogger.warn('HUGGINGFACE_API_TOKEN not configured. AI service will not function properly.');
    }

    if (!this.sentimentModelUrl) {
      aiLogger.warn(
        'HUGGINGFACE_SENTIMENT_URL not configured. Sentiment analysis will not be available.'
      );
    }

    if (!this.pricePredictionModelUrl) {
      aiLogger.warn(
        'HUGGINGFACE_PRICE_PREDICTION_URL not configured. Price prediction will not be available.'
      );
    }

    if (!this.tradingSignalModelUrl) {
      aiLogger.warn(
        'HUGGINGFACE_TRADING_SIGNAL_URL not configured. Trading signals will not be available.'
      );
    }

    if (!this.comprehensiveAnalysisModelUrl) {
      aiLogger.warn(
        'HUGGINGFACE_COMPREHENSIVE_ANALYSIS_URL not configured. Comprehensive analysis will not be available.'
      );
    }
  }

  /**
   * Get sentiment analysis for a given token symbol.
   * @param tokenSymbol - e.g., "BTC"
   * @param timeframe - Timeframe for the analysis (1h, 24h, 7d)
   * @param forceRefresh - Whether to bypass cache and force a refresh
   * @returns Object containing score, sources, and whether the result was cached.
   */
  async getSentimentAnalysis(
    tokenSymbol: string,
    timeframe: '1h' | '24h' | '7d' = '24h',
    forceRefresh = false
  ): Promise<SentimentAnalysisResponse> {
    const start = Date.now();
    tokenSymbol = tokenSymbol.toUpperCase();

    aiLogger.info('Getting sentiment analysis', { tokenSymbol, timeframe, forceRefresh });

    try {
      // Check cache if not forcing refresh
      if (!forceRefresh) {
        const cachedResult = await dbService.getLatestSentiment(tokenSymbol, timeframe);

        if (cachedResult) {
          const cacheAge = Date.now() - new Date(cachedResult.created_at).getTime();

          if (cacheAge < SENTIMENT_CACHE_DURATION) {
            aiLogger.info('Using cached sentiment result', {
              tokenSymbol,
              timeframe,
              cacheAge: `${Math.round(cacheAge / 1000)}s`,
            });

            return {
              score: cachedResult.sentiment_score,
              sources: cachedResult.sources,
              cached: true,
              timestamp: cachedResult.created_at,
            };
          }

          aiLogger.info('Cached sentiment result expired', {
            tokenSymbol,
            timeframe,
            cacheAge: `${Math.round(cacheAge / 1000)}s`,
          });
        }
      }

      // Validate model URL configuration
      if (!this.sentimentModelUrl) {
        throw new Error('Sentiment analysis model URL not configured');
      }

      // Make API request to sentiment model
      aiLogger.debug('Making external API request for sentiment analysis', {
        tokenSymbol,
        timeframe,
        url: this.sentimentModelUrl.substring(0, 30) + '...',
      });

      const response = await axios.post(
        this.sentimentModelUrl,
        { inputs: { token: tokenSymbol, timeframe } },
        {
          headers: { Authorization: `Bearer ${this.huggingfaceToken}` },
          timeout: 15000, // 15 second timeout
        }
      );

      // Validate response structure
      if (
        !response.data ||
        typeof response.data.score !== 'number' ||
        !Array.isArray(response.data.sources)
      ) {
        throw new Error('Invalid response structure from sentiment model');
      }

      const result = {
        score: response.data.score,
        sources: response.data.sources || [],
        cached: false,
        timestamp: new Date().toISOString(),
      };

      // Log performance metrics
      const duration = Date.now() - start;
      aiLogger.info('Sentiment analysis completed', {
        tokenSymbol,
        timeframe,
        score: result.score,
        sourceCount: result.sources.length,
        durationMs: duration,
      });

      // Store in cache
      try {
        await dbService.storeSentimentAnalysis({
          token_symbol: tokenSymbol,
          sentiment_score: result.score,
          timeframe: timeframe,
          sources: result.sources,
        });
      } catch (cacheError) {
        aiLogger.error('Failed to store sentiment analysis in cache', {
          error: (cacheError as Error).message,
          tokenSymbol,
          timeframe,
        });
        // Continue despite cache error
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      aiLogger.error('Error getting sentiment analysis', {
        error: errorMessage,
        tokenSymbol,
        timeframe,
        requestDuration: `${Date.now() - start}ms`,
      });

      throw new Error(`Failed to get sentiment analysis for ${tokenSymbol}: ${errorMessage}`);
    }
  }

  /**
   * Get price prediction for a given token symbol.
   * @param tokenSymbol - e.g., "ETH"
   * @param timeHorizon - Timeframe for the prediction (1h, 24h, 7d)
   * @returns Object containing currentPrice, predictedPrice, percentageChange, and confidence.
   */
  async getPricePrediction(
    tokenSymbol: string,
    timeHorizon: '1h' | '24h' | '7d' = '24h'
  ): Promise<PricePredictionResponse> {
    const start = Date.now();
    tokenSymbol = tokenSymbol.toUpperCase();

    aiLogger.info('Getting price prediction', { tokenSymbol, timeHorizon });

    try {
      // Check cache
      const cachedResult = await dbService.getLatestPrediction(tokenSymbol, timeHorizon);

      if (cachedResult) {
        const cacheAge = Date.now() - new Date(cachedResult.created_at).getTime();

        if (cacheAge < PREDICTION_CACHE_DURATION) {
          aiLogger.info('Using cached price prediction', {
            tokenSymbol,
            timeHorizon,
            cacheAge: `${Math.round(cacheAge / 1000)}s`,
          });

          return {
            currentPrice: cachedResult.current_price,
            predictedPrice: cachedResult.predicted_price,
            percentageChange: cachedResult.percentage_change,
            confidence: cachedResult.confidence,
            timestamp: cachedResult.created_at,
          };
        }

        aiLogger.info('Cached price prediction expired', {
          tokenSymbol,
          timeHorizon,
          cacheAge: `${Math.round(cacheAge / 1000)}s`,
        });
      }

      // Validate model URL configuration
      if (!this.pricePredictionModelUrl) {
        throw new Error('Price prediction model URL not configured');
      }

      // Make API request to price prediction model
      aiLogger.debug('Making external API request for price prediction', {
        tokenSymbol,
        timeHorizon,
        url: this.pricePredictionModelUrl.substring(0, 30) + '...',
      });

      const response = await axios.post(
        this.pricePredictionModelUrl,
        { inputs: { token: tokenSymbol, timeframe: timeHorizon } },
        {
          headers: { Authorization: `Bearer ${this.huggingfaceToken}` },
          timeout: 20000, // 20 second timeout for more complex model
        }
      );

      // Validate response structure
      if (
        !response.data ||
        typeof response.data.currentPrice !== 'number' ||
        typeof response.data.predictedPrice !== 'number' ||
        typeof response.data.percentageChange !== 'number' ||
        typeof response.data.confidence !== 'number'
      ) {
        throw new Error('Invalid response structure from price prediction model');
      }

      const result = {
        currentPrice: response.data.currentPrice,
        predictedPrice: response.data.predictedPrice,
        percentageChange: response.data.percentageChange,
        confidence: response.data.confidence,
        timestamp: new Date().toISOString(),
      };

      // Log performance metrics
      const duration = Date.now() - start;
      aiLogger.info('Price prediction completed', {
        tokenSymbol,
        timeHorizon,
        currentPrice: result.currentPrice,
        predictedPrice: result.predictedPrice,
        percentageChange: result.percentageChange,
        confidence: result.confidence,
        durationMs: duration,
      });

      // Store in cache
      try {
        await dbService.storePricePrediction({
          token_symbol: tokenSymbol,
          current_price: result.currentPrice,
          predicted_price: result.predictedPrice,
          percentage_change: result.percentageChange,
          confidence: result.confidence,
          timeframe: timeHorizon,
        });
      } catch (cacheError) {
        aiLogger.error('Failed to store price prediction in cache', {
          error: (cacheError as Error).message,
          tokenSymbol,
          timeHorizon,
        });
        // Continue despite cache error
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      aiLogger.error('Error getting price prediction', {
        error: errorMessage,
        tokenSymbol,
        timeHorizon,
        requestDuration: `${Date.now() - start}ms`,
      });

      throw new Error(`Failed to get price prediction for ${tokenSymbol}: ${errorMessage}`);
    }
  }

  /**
   * Get a trading signal for a given token symbol.
   * @param tokenSymbol - e.g., "SOL"
   * @param includeAnalysis - Whether to include detailed analysis text
   * @returns Object containing signal, strength, and reasons.
   */
  async getTradingSignal(
    tokenSymbol: string,
    includeAnalysis = false
  ): Promise<TradingSignalResponse> {
    const start = Date.now();
    tokenSymbol = tokenSymbol.toUpperCase();

    aiLogger.info('Getting trading signal', { tokenSymbol, includeAnalysis });

    try {
      // Check cache
      const cachedResult = await dbService.getLatestTradeSignal(tokenSymbol);

      if (cachedResult) {
        const cacheAge = Date.now() - new Date(cachedResult.created_at).getTime();

        if (cacheAge < SIGNAL_CACHE_DURATION) {
          aiLogger.info('Using cached trading signal', {
            tokenSymbol,
            cacheAge: `${Math.round(cacheAge / 1000)}s`,
          });

          return {
            token: tokenSymbol,
            signal: cachedResult.signal,
            strength: cachedResult.strength,
            reasons: cachedResult.reasons || [],
            analysis: includeAnalysis ? cachedResult.analysis : null,
            timestamp: cachedResult.created_at,
          };
        }

        aiLogger.info('Cached trading signal expired', {
          tokenSymbol,
          cacheAge: `${Math.round(cacheAge / 1000)}s`,
        });
      }

      // Validate model URL configuration
      if (!this.tradingSignalModelUrl) {
        throw new Error('Trading signal model URL not configured');
      }

      // Make API request to trading signal model
      aiLogger.debug('Making external API request for trading signal', {
        tokenSymbol,
        includeAnalysis,
        url: this.tradingSignalModelUrl.substring(0, 30) + '...',
      });

      const response = await axios.post(
        this.tradingSignalModelUrl,
        { inputs: { token: tokenSymbol, includeAnalysis } },
        {
          headers: { Authorization: `Bearer ${this.huggingfaceToken}` },
          timeout: 15000, // 15 second timeout
        }
      );

      // Validate response structure
      if (
        !response.data ||
        !['BUY', 'SELL', 'HOLD'].includes(response.data.signal) ||
        typeof response.data.strength !== 'number' ||
        !Array.isArray(response.data.reasons)
      ) {
        throw new Error('Invalid response structure from trading signal model');
      }

      const result = {
        token: tokenSymbol,
        signal: response.data.signal as 'BUY' | 'SELL' | 'HOLD',
        strength: response.data.strength,
        reasons: response.data.reasons || [],
        analysis: includeAnalysis ? response.data.analysis : null,
        timestamp: new Date().toISOString(),
      };

      // Log performance metrics
      const duration = Date.now() - start;
      aiLogger.info('Trading signal completed', {
        tokenSymbol,
        signal: result.signal,
        strength: result.strength,
        reasonCount: result.reasons.length,
        includeAnalysis,
        durationMs: duration,
      });

      // Store in cache
      try {
        await dbService.storeTradeSignal({
          token_symbol: tokenSymbol,
          signal: result.signal,
          strength: result.strength,
          reasons: result.reasons,
          analysis: result.analysis,
        });
      } catch (cacheError) {
        aiLogger.error('Failed to store trading signal in cache', {
          error: (cacheError as Error).message,
          tokenSymbol,
        });
        // Continue despite cache error
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      aiLogger.error('Error getting trading signal', {
        error: errorMessage,
        tokenSymbol,
        includeAnalysis,
        requestDuration: `${Date.now() - start}ms`,
      });

      throw new Error(`Failed to get trading signal for ${tokenSymbol}: ${errorMessage}`);
    }
  }

  /**
   * Get a comprehensive analysis for a given token symbol.
   * Combines sentiment, prediction, and signal into an overall recommendation.
   * @param tokenSymbol - e.g., "BNB"
   * @returns Object containing sentiment, prediction, signal, and recommendation.
   */
  async getComprehensiveAnalysis(tokenSymbol: string): Promise<ComprehensiveAnalysisResponse> {
    const start = Date.now();
    tokenSymbol = tokenSymbol.toUpperCase();

    aiLogger.info('Getting comprehensive analysis', { tokenSymbol });

    try {
      // We can either make a single call to a comprehensive model or
      // combine results from multiple models. Here we'll use the dedicated model.

      // Validate model URL configuration
      if (!this.comprehensiveAnalysisModelUrl) {
        throw new Error('Comprehensive analysis model URL not configured');
      }

      // Make API request to comprehensive analysis model
      aiLogger.debug('Making external API request for comprehensive analysis', {
        tokenSymbol,
        url: this.comprehensiveAnalysisModelUrl.substring(0, 30) + '...',
      });

      const response = await axios.post(
        this.comprehensiveAnalysisModelUrl,
        { inputs: { token: tokenSymbol } },
        {
          headers: { Authorization: `Bearer ${this.huggingfaceToken}` },
          timeout: 30000, // 30 second timeout for this complex analysis
        }
      );

      // Validate response structure
      if (!response.data || !['BUY', 'SELL', 'HOLD'].includes(response.data.recommendation)) {
        throw new Error('Invalid response structure from comprehensive analysis model');
      }

      const result = {
        token: tokenSymbol,
        timestamp: new Date().toISOString(),
        sentiment: response.data.sentiment,
        prediction: response.data.prediction,
        signal: response.data.signal,
        recommendation: response.data.recommendation as 'BUY' | 'SELL' | 'HOLD',
      };

      // Log performance metrics
      const duration = Date.now() - start;
      aiLogger.info('Comprehensive analysis completed', {
        tokenSymbol,
        recommendation: result.recommendation,
        hasSentiment: !!result.sentiment,
        hasPrediction: !!result.prediction,
        hasSignal: !!result.signal,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      aiLogger.error('Error getting comprehensive analysis', {
        error: errorMessage,
        tokenSymbol,
        requestDuration: `${Date.now() - start}ms`,
      });

      throw new Error(`Failed to get comprehensive analysis for ${tokenSymbol}: ${errorMessage}`);
    }
  }
}

// Create and export a singleton instance
const aiService = new AIService();
export default aiService;

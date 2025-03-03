import axios from 'axios';
import { HfInference } from '@huggingface/inference';
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
  private inferenceClient: HfInference | null = null;
  private sentimentModelId: string;
  private pricePredictionModelId: string;
  private tradingSignalModelId: string;
  private comprehensiveAnalysisModelId: string;

  constructor() {
    const apiToken = process.env.HUGGINGFACE_API_TOKEN || '';

    // Set up the Inference Client if we have a token
    if (apiToken) {
      this.inferenceClient = new HfInference(apiToken);
    } else {
      aiLogger.warn('HUGGINGFACE_API_TOKEN not configured. AI service will not function properly.');
    }

    // Extract model IDs from URLs or use direct model IDs
    this.sentimentModelId = this.extractModelId(process.env.HUGGINGFACE_SENTIMENT_URL || '');
    this.pricePredictionModelId = this.extractModelId(
      process.env.HUGGINGFACE_PRICE_PREDICTION_URL || ''
    );
    this.tradingSignalModelId = this.extractModelId(
      process.env.HUGGINGFACE_TRADING_SIGNAL_URL || ''
    );
    this.comprehensiveAnalysisModelId = this.extractModelId(
      process.env.HUGGINGFACE_COMPREHENSIVE_ANALYSIS_URL || ''
    );

    if (!this.sentimentModelId) {
      aiLogger.warn(
        'HUGGINGFACE_SENTIMENT_URL not configured. Sentiment analysis will not be available.'
      );
    }

    if (!this.pricePredictionModelId) {
      aiLogger.warn(
        'HUGGINGFACE_PRICE_PREDICTION_URL not configured. Price prediction will not be available.'
      );
    }

    if (!this.tradingSignalModelId) {
      aiLogger.warn(
        'HUGGINGFACE_TRADING_SIGNAL_URL not configured. Trading signals will not be available.'
      );
    }

    if (!this.comprehensiveAnalysisModelId) {
      aiLogger.warn(
        'HUGGINGFACE_COMPREHENSIVE_ANALYSIS_URL not configured. Comprehensive analysis will not be available.'
      );
    }
  }

  /**
   * Extracts the model ID from a Hugging Face URL or returns the ID directly
   * @param urlOrId - Either a full URL or direct model ID
   */
  private extractModelId(urlOrId: string): string {
    if (!urlOrId) return '';

    // If it's a URL, extract the model ID
    if (urlOrId.startsWith('https://api-inference.huggingface.co/models/')) {
      const modelPath = urlOrId.replace('https://api-inference.huggingface.co/models/', '');
      return modelPath;
    }

    // Otherwise, assume it's already a model ID
    return urlOrId;
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

      // Validate model configuration
      if (!this.inferenceClient) {
        throw new Error('Hugging Face API token not configured');
      }

      if (!this.sentimentModelId) {
        throw new Error('Sentiment analysis model not configured');
      }

      // Make API request to sentiment model using the Inference Client
      aiLogger.debug('Making external API request for sentiment analysis', {
        tokenSymbol,
        timeframe,
        model: this.sentimentModelId,
      });

      // Call the Hugging Face API using the client
      const response = await this.inferenceClient.textClassification({
        model: this.sentimentModelId,
        inputs: JSON.stringify({ token: tokenSymbol, timeframe }),
      });

      // Extract the relevant data from the response
      // Note: This assumes the model returns classification results that we need to process
      // Adjust this based on your actual model's response format
      const processedResponse = this.processSentimentResponse(response, tokenSymbol);

      const result = {
        score: processedResponse.score,
        sources: processedResponse.sources || [],
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
   * Process the sentiment model response into the expected format
   * This function translates the Hugging Face classifier output to our internal format
   */
  private processSentimentResponse(
    response: Array<{ label: string; score: number }>,
    tokenSymbol: string
  ): { score: number; sources: string[] } {
    aiLogger.debug('Processing sentiment response', { response });

    // Default values
    let score = 0;
    let sources: string[] = [];

    try {
      // If we got a structured output in expected format
      if (Array.isArray(response) && response.length > 0) {
        // Calculate normalized sentiment score from labels
        // Assuming the model returns labels like POSITIVE, NEUTRAL, NEGATIVE
        const positiveScore = response.find((r) => r.label === 'POSITIVE')?.score || 0;
        const negativeScore = response.find((r) => r.label === 'NEGATIVE')?.score || 0;

        // Normalize to a score between -1 and 1
        score = positiveScore - negativeScore;

        // Generate sources based on the response (this is an example, adjust based on your model)
        sources = [`Hugging Face classification model for ${tokenSymbol}`];
      }
      // If using a custom model that returns a score directly
      else if (typeof response === 'object' && response !== null) {
        const customResponse = response as any;
        if (typeof customResponse.score === 'number') {
          score = customResponse.score;
        }
        if (Array.isArray(customResponse.sources)) {
          sources = customResponse.sources;
        }
      }

      return { score, sources };
    } catch (error) {
      aiLogger.error('Error processing sentiment response', { error, response });
      return { score: 0, sources: [] };
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

      // Validate model configuration
      if (!this.inferenceClient) {
        throw new Error('Hugging Face API token not configured');
      }

      if (!this.pricePredictionModelId) {
        throw new Error('Price prediction model not configured');
      }

      // Make API request to price prediction model using the Inference Client
      aiLogger.debug('Making external API request for price prediction', {
        tokenSymbol,
        timeHorizon,
        model: this.pricePredictionModelId,
      });

      // Call the Hugging Face API using the client
      const response = await this.inferenceClient.textGeneration({
        model: this.pricePredictionModelId,
        inputs: JSON.stringify({ token: tokenSymbol, timeframe: timeHorizon }),
        parameters: {
          max_new_tokens: 512,
          return_full_text: false,
        },
      });

      // Process the response
      const processedResponse = this.processPricePredictionResponse(response, tokenSymbol);

      const result = {
        currentPrice: processedResponse.currentPrice,
        predictedPrice: processedResponse.predictedPrice,
        percentageChange: processedResponse.percentageChange,
        confidence: processedResponse.confidence,
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
   * Process the price prediction model response
   */
  private processPricePredictionResponse(
    response: { generated_text: string } | Array<{ generated_text: string }>,
    tokenSymbol: string
  ): {
    currentPrice: number;
    predictedPrice: number;
    percentageChange: number;
    confidence: number;
  } {
    aiLogger.debug('Processing price prediction response', { response });

    try {
      // Default values
      const defaultResult = {
        currentPrice: 0,
        predictedPrice: 0,
        percentageChange: 0,
        confidence: 0,
      };

      // Get the text from the response
      let generatedText = '';
      if (Array.isArray(response) && response.length > 0) {
        generatedText = response[0].generated_text;
      } else if (typeof response === 'object' && response !== null) {
        generatedText = (response as any).generated_text || '';
      }

      if (!generatedText) {
        throw new Error('No text generated from the price prediction model');
      }

      // Try to parse the JSON from the generated text
      // If the model returns JSON-formatted text
      try {
        const jsonMatch = generatedText.match(/{[\s\S]*}/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[0]);

          // Validate the structure
          if (
            typeof parsedData.currentPrice === 'number' &&
            typeof parsedData.predictedPrice === 'number' &&
            typeof parsedData.percentageChange === 'number' &&
            typeof parsedData.confidence === 'number'
          ) {
            return parsedData;
          }
        }
      } catch (parseError) {
        aiLogger.warn('Could not parse JSON from generated text', {
          error: parseError,
          generatedText,
        });
      }

      // If we couldn't parse JSON or the model returns another format
      // This is a simplified example - you may need more complex parsing logic
      // based on your specific model's output format
      aiLogger.warn('Using fallback parsing for price prediction response', {
        tokenSymbol,
        generatedText: generatedText.substring(0, 100) + '...',
      });

      return defaultResult;
    } catch (error) {
      aiLogger.error('Error processing price prediction response', { error, response });
      throw new Error(
        `Failed to process price prediction response: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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

      // Validate model configuration
      if (!this.inferenceClient) {
        throw new Error('Hugging Face API token not configured');
      }

      if (!this.tradingSignalModelId) {
        throw new Error('Trading signal model not configured');
      }

      // Make API request to trading signal model using the Inference Client
      aiLogger.debug('Making external API request for trading signal', {
        tokenSymbol,
        includeAnalysis,
        model: this.tradingSignalModelId,
      });

      // Call the Hugging Face API using the client
      const response = await this.inferenceClient.textClassification({
        model: this.tradingSignalModelId,
        inputs: JSON.stringify({ token: tokenSymbol, includeAnalysis }),
      });

      // Process the response
      const processedResponse = this.processTradingSignalResponse(
        response,
        tokenSymbol,
        includeAnalysis
      );

      const result = {
        token: tokenSymbol,
        signal: processedResponse.signal,
        strength: processedResponse.strength,
        reasons: processedResponse.reasons || [],
        analysis: processedResponse.analysis,
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
   * Process the trading signal model response
   */
  private processTradingSignalResponse(
    response: Array<{ label: string; score: number }>,
    tokenSymbol: string,
    includeAnalysis: boolean
  ): {
    signal: 'BUY' | 'SELL' | 'HOLD';
    strength: number;
    reasons: string[];
    analysis: string | null;
  } {
    aiLogger.debug('Processing trading signal response', { response });

    try {
      // Default values
      let signalType: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let strength = 0;
      let reasons: string[] = [];
      let analysisText: string | null = null;

      // Get the label from the response
      if (Array.isArray(response) && response.length > 0) {
        const positiveScore = response.find((r) => r.label === 'POSITIVE')?.score || 0;
        const negativeScore = response.find((r) => r.label === 'NEGATIVE')?.score || 0;

        if (positiveScore > negativeScore) {
          signalType = 'BUY';
        } else if (negativeScore > positiveScore) {
          signalType = 'SELL';
        }
      }

      // Generate reasons based on the response (this is an example, adjust based on your model)
      reasons = [`Hugging Face classification model for ${tokenSymbol}`];

      // Calculate strength based on the response (this is an example, adjust based on your model)
      strength = response.reduce((sum, r) => sum + r.score, 0) / response.length;

      // Generate analysis based on the response (this is an example, adjust based on your model)
      if (includeAnalysis) {
        analysisText = `Based on the model's response, the signal is ${signalType}. The strength is ${strength.toFixed(
          2
        )}. Reasons: ${reasons.join(', ')}`;
      }

      return {
        signal: signalType,
        strength,
        reasons,
        analysis: analysisText,
      };
    } catch (error) {
      aiLogger.error('Error processing trading signal response', { error, response });
      throw new Error(
        `Failed to process trading signal response: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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

      // Validate model configuration
      if (!this.inferenceClient) {
        throw new Error('Hugging Face API token not configured');
      }

      if (!this.comprehensiveAnalysisModelId) {
        throw new Error('Comprehensive analysis model not configured');
      }

      // Make API request to comprehensive analysis model using the Inference Client
      aiLogger.debug('Making external API request for comprehensive analysis', {
        tokenSymbol,
        model: this.comprehensiveAnalysisModelId,
      });

      // Call the Hugging Face API using the client
      const response = await this.inferenceClient.textClassification({
        model: this.comprehensiveAnalysisModelId,
        inputs: JSON.stringify({ token: tokenSymbol }),
      });

      // Process the response
      const processedResponse = this.processComprehensiveAnalysisResponse(response, tokenSymbol);

      const result = {
        token: tokenSymbol,
        timestamp: new Date().toISOString(),
        sentiment: processedResponse.sentiment,
        prediction: processedResponse.prediction,
        signal: processedResponse.signal,
        recommendation: processedResponse.recommendation,
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

  /**
   * Process the comprehensive analysis model response
   */
  private processComprehensiveAnalysisResponse(
    response: Array<{ label: string; score: number }>,
    tokenSymbol: string
  ): {
    sentiment?: SentimentAnalysisResponse;
    prediction?: PricePredictionResponse | null;
    signal?: TradingSignalResponse | null;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
  } {
    aiLogger.debug('Processing comprehensive analysis response', { response });

    try {
      // Default return values that match the expected types
      let recommendationType: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';

      // Simple mocked objects that match the type signature - these would need to be
      // replaced with actual implementations based on your model's response format
      const sentimentData: SentimentAnalysisResponse = {
        score: 0,
        sources: [],
        cached: false,
        timestamp: new Date().toISOString(),
      };

      const predictionData: PricePredictionResponse = {
        currentPrice: 0,
        predictedPrice: 0,
        percentageChange: 0,
        confidence: 0,
        timestamp: new Date().toISOString(),
      };

      const signalData: TradingSignalResponse = {
        token: tokenSymbol,
        signal: 'HOLD',
        strength: 0,
        reasons: [],
        timestamp: new Date().toISOString(),
      };

      // Determine recommendation based on response
      if (Array.isArray(response) && response.length > 0) {
        const buyScore = response.find((r) => r.label === 'BUY')?.score || 0;
        const sellScore = response.find((r) => r.label === 'SELL')?.score || 0;
        const holdScore = response.find((r) => r.label === 'HOLD')?.score || 0;

        if (buyScore > sellScore && buyScore > holdScore) {
          recommendationType = 'BUY';
        } else if (sellScore > buyScore && sellScore > holdScore) {
          recommendationType = 'SELL';
        } else {
          recommendationType = 'HOLD';
        }
      }

      return {
        sentiment: sentimentData,
        prediction: predictionData,
        signal: signalData,
        recommendation: recommendationType,
      };
    } catch (error) {
      aiLogger.error('Error processing comprehensive analysis response', { error, response });
      throw new Error(
        `Failed to process comprehensive analysis response: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

// Create and export a singleton instance
const aiService = new AIService();
export default aiService;

import { Client } from '@gradio/client';
import logger from '../../utils/logger';
import { SentimentAnalysisResponse } from '../../types/api';

// Create a service-specific logger
const gradioLogger = logger.child({ service: 'gradio-service' });

/**
 * Service for interacting with Gradio-based Hugging Face Spaces
 * This complements the regular HuggingFace Inference API service
 */
class GradioService {
  private cryptoBertClient: Client | null = null;
  private cryptoBertSpaceId: string;
  private hfToken: string;
  private clientsInitialized: boolean = false;

  constructor() {
    this.cryptoBertSpaceId = process.env.GRADIO_CRYPTOBERT_SPACE_ID || 'csarmiento/kk08-CryptoBERT';
    this.hfToken = process.env.HUGGINGFACE_API_TOKEN || '';

    // Note: We'll lazily initialize clients on first use to improve startup time
  }

  /**
   * Initialize the Gradio clients if they haven't been initialized yet
   */
  private async ensureClientsInitialized(): Promise<void> {
    if (this.clientsInitialized) return;

    try {
      gradioLogger.info('Initializing Gradio clients');

      // Options object for client connection - add token if available
      // Format the token with the required 'hf_' prefix if it doesn't already have it
      const options = this.hfToken
        ? {
            hf_token: this.hfToken.startsWith('hf_')
              ? (this.hfToken as `hf_${string}`)
              : (`hf_${this.hfToken}` as `hf_${string}`),
          }
        : undefined;

      // Initialize the CryptoBERT client
      this.cryptoBertClient = await Client.connect(this.cryptoBertSpaceId, options);

      this.clientsInitialized = true;
      gradioLogger.info('Gradio clients initialized successfully');
    } catch (error) {
      gradioLogger.error('Failed to initialize Gradio clients', {
        error: error instanceof Error ? error.message : String(error),
        cryptoBertSpaceId: this.cryptoBertSpaceId,
      });
      throw new Error(
        `Failed to initialize Gradio clients: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get sentiment analysis using the CryptoBERT Gradio Space
   * @param text Text to analyze
   * @returns Object containing score, confidence, and label
   */
  async analyzeSentiment(text: string): Promise<SentimentAnalysisResponse> {
    const start = Date.now();

    gradioLogger.info('Analyzing sentiment with CryptoBERT Gradio Space', {
      textLength: text.length,
    });

    try {
      // Ensure clients are initialized
      await this.ensureClientsInitialized();

      if (!this.cryptoBertClient) {
        throw new Error('CryptoBERT Gradio client not initialized');
      }

      // Call the /predict endpoint on the Gradio Space
      const result = await this.cryptoBertClient.predict('/predict', {
        param_0: text,
      });

      // Log the raw result for debugging
      gradioLogger.debug('CryptoBERT Gradio raw result', { result });

      // Process the result
      // Note: Adjust based on your specific Gradio Space output format
      const processedResult = this.processCryptoBertResult(result.data, text);

      // Calculate and log duration
      const duration = Date.now() - start;
      gradioLogger.info('CryptoBERT Gradio sentiment analysis completed', {
        textLength: text.length,
        score: processedResult.score,
        durationMs: duration,
      });

      return processedResult;
    } catch (error) {
      const duration = Date.now() - start;
      gradioLogger.error('Error analyzing sentiment with CryptoBERT Gradio', {
        error: error instanceof Error ? error.message : String(error),
        textLength: text.length,
        durationMs: duration,
      });

      throw new Error(
        `Failed to analyze sentiment with CryptoBERT Gradio: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Process the result from the CryptoBERT Gradio Space
   * @param result Raw result from Gradio
   * @param originalText The original text that was analyzed
   * @returns Processed sentiment analysis result
   */
  private processCryptoBertResult(result: any, originalText: string): SentimentAnalysisResponse {
    // Default values
    let score = 0;
    const sources = [`CryptoBERT Gradio analysis of text (${originalText.substring(0, 30)}...)`];

    try {
      // Example: If the Gradio Space returns an array with label and confidence
      // Format might be [label, confidence] or {label: string, confidence: number}
      // Adjust this based on the actual format your Gradio Space returns

      if (Array.isArray(result) && result.length >= 2) {
        // If format is [label, confidence]
        const label = result[0];
        const confidence = parseFloat(result[1]);

        // Convert label to score (-1 to 1 range)
        if (typeof label === 'string') {
          if (label.toLowerCase().includes('positive')) {
            score = confidence;
          } else if (label.toLowerCase().includes('negative')) {
            score = -confidence;
          } else {
            score = 0; // Neutral
          }
        }
      } else if (typeof result === 'object' && result !== null) {
        // If format is {label: string, confidence: number}
        const label = result.label || '';
        const confidence = parseFloat(result.confidence || 0);

        if (label.toLowerCase().includes('positive')) {
          score = confidence;
        } else if (label.toLowerCase().includes('negative')) {
          score = -confidence;
        } else {
          score = 0; // Neutral
        }
      } else if (typeof result === 'string') {
        // If just a string label is returned, assign basic scores
        const label = result.toLowerCase();

        if (label.includes('positive')) {
          score = 0.8; // Default strong positive
        } else if (label.includes('negative')) {
          score = -0.8; // Default strong negative
        } else {
          score = 0; // Neutral
        }
      }

      return {
        score,
        sources,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      gradioLogger.error('Error processing CryptoBERT result', { error, result });

      // Return a safe default
      return {
        score: 0,
        sources,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Load example data from the Gradio Space
   * This is mainly for testing purposes to ensure the Gradio Space is responding
   */
  async loadExample(): Promise<any> {
    try {
      await this.ensureClientsInitialized();

      if (!this.cryptoBertClient) {
        throw new Error('CryptoBERT Gradio client not initialized');
      }

      const result = await this.cryptoBertClient.predict('/load_example', {});
      return result.data;
    } catch (error) {
      gradioLogger.error('Error loading example from CryptoBERT Gradio', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Failed to load example from CryptoBERT Gradio: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

// Create and export a singleton instance
const gradioService = new GradioService();
export default gradioService;

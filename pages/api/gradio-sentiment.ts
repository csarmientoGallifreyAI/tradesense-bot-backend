import { NextApiRequest, NextApiResponse } from 'next';
import logger from '../../utils/logger';
import gradioService from '../../services/ai/gradioService';

// Create a API-specific logger
const apiLogger = logger.child({ service: 'gradio-sentiment-api' });

/**
 * API endpoint for sentiment analysis using the Gradio-based CryptoBERT model
 *
 * Request body should include:
 * - text: The text to analyze
 *
 * Response will include:
 * - score: Sentiment score (-1 to 1)
 * - sources: Array of data sources used for analysis
 * - cached: Whether the result was from cache
 * - timestamp: When the analysis was performed
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const start = Date.now();

  // Only accept POST requests
  if (req.method !== 'POST') {
    apiLogger.warn('Invalid method', { method: req.method });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;

    // Validate required fields
    if (!text || typeof text !== 'string') {
      apiLogger.warn('Missing or invalid text parameter', { receivedText: typeof text });
      return res.status(400).json({ error: 'Missing or invalid text parameter' });
    }

    apiLogger.info('Received sentiment analysis request', {
      textLength: text.length,
      textPreview: text.substring(0, 30) + '...',
    });

    // Call the Gradio service to analyze sentiment
    const result = await gradioService.analyzeSentiment(text);

    // Calculate processing time
    const duration = Date.now() - start;

    // Log the successful request
    apiLogger.info('Sentiment analysis completed', {
      duration,
      score: result.score,
    });

    // Return the result
    return res.status(200).json(result);
  } catch (error) {
    // Calculate processing time even for errors
    const duration = Date.now() - start;

    // Log the error
    apiLogger.error('Error processing sentiment analysis request', {
      error: error instanceof Error ? error.message : String(error),
      duration,
    });

    // Return an appropriate error response
    return res.status(500).json({
      error: 'Failed to analyze sentiment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

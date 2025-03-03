import type { NextApiRequest, NextApiResponse } from 'next';
import aiService from '../../../services/ai/aiService';
import logger from '../../../utils/logger';

const apiLogger = logger.child({ route: 'api/ai/sentiment' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.query.token || req.body?.token) as string | undefined;
  const timeframe = (req.query.timeframe || req.body?.timeframe) as string | undefined;
  const forceRefresh = (req.query.forceRefresh || req.body?.forceRefresh) === 'true';

  // Validate required parameters
  if (!token) {
    apiLogger.warn('Missing token parameter in request');
    return res.status(400).json({ error: 'Token symbol is required' });
  }

  apiLogger.info('Processing sentiment analysis request', {
    token,
    timeframe,
    forceRefresh,
    method: req.method,
  });

  try {
    const result = await aiService.getSentimentAnalysis(
      token,
      (timeframe as '1h' | '24h' | '7d') || '24h',
      forceRefresh
    );

    apiLogger.info('Sentiment analysis successful', {
      token,
      score: result.score,
      cached: result.cached,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    apiLogger.error('Sentiment analysis failed', {
      token,
      error: errorMessage,
    });

    return res.status(500).json({
      error: errorMessage || 'Failed to get sentiment analysis',
      token,
    });
  }
}

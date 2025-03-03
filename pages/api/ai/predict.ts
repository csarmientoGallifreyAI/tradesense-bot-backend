import type { NextApiRequest, NextApiResponse } from 'next';
import aiService from '../../../services/ai/aiService';
import logger from '../../../utils/logger';

const apiLogger = logger.child({ route: 'api/ai/predict' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.query.token || req.body?.token) as string | undefined;
  const horizon = (req.query.horizon || req.body?.horizon) as string | undefined;

  // Validate required parameters
  if (!token) {
    apiLogger.warn('Missing token parameter in request');
    return res.status(400).json({ error: 'Token symbol is required' });
  }

  apiLogger.info('Processing price prediction request', {
    token,
    horizon,
    method: req.method,
  });

  try {
    const result = await aiService.getPricePrediction(
      token,
      (horizon as '1h' | '24h' | '7d') || '24h'
    );

    apiLogger.info('Price prediction successful', {
      token,
      currentPrice: result.currentPrice,
      predictedPrice: result.predictedPrice,
      percentageChange: result.percentageChange,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    apiLogger.error('Price prediction failed', {
      token,
      error: errorMessage,
    });

    return res.status(500).json({
      error: errorMessage || 'Failed to get price prediction',
      token,
    });
  }
}

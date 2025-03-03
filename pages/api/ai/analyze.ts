import type { NextApiRequest, NextApiResponse } from 'next';
import aiService from '../../../services/ai/aiService';
import logger from '../../../utils/logger';

const apiLogger = logger.child({ route: 'api/ai/analyze' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.query.token || req.body?.token) as string | undefined;

  // Validate required parameters
  if (!token) {
    apiLogger.warn('Missing token parameter in request');
    return res.status(400).json({ error: 'Token symbol is required' });
  }

  apiLogger.info('Processing comprehensive analysis request', {
    token,
    method: req.method,
  });

  try {
    const result = await aiService.getComprehensiveAnalysis(token);

    apiLogger.info('Comprehensive analysis successful', {
      token,
      recommendation: result.recommendation,
      hasSentiment: !!result.sentiment,
      hasPrediction: !!result.prediction,
      hasSignal: !!result.signal,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    apiLogger.error('Comprehensive analysis failed', {
      token,
      error: errorMessage,
    });

    return res.status(500).json({
      error: errorMessage || 'Failed to get comprehensive analysis',
      token,
    });
  }
}

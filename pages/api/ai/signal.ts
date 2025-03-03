import type { NextApiRequest, NextApiResponse } from 'next';
import aiService from '../../../services/ai/aiService';
import logger from '../../../utils/logger';

const apiLogger = logger.child({ route: 'api/ai/signal' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.query.token || req.body?.token) as string | undefined;
  const includeAnalysis =
    req.query.includeAnalysis === 'true' ||
    req.query.includeAnalysis === '1' ||
    req.body?.includeAnalysis === true;

  // Validate required parameters
  if (!token) {
    apiLogger.warn('Missing token parameter in request');
    return res.status(400).json({ error: 'Token symbol is required' });
  }

  apiLogger.info('Processing trading signal request', {
    token,
    includeAnalysis,
    method: req.method,
  });

  try {
    const result = await aiService.getTradingSignal(token, includeAnalysis);

    apiLogger.info('Trading signal successful', {
      token,
      signal: result.signal,
      strength: result.strength,
      reasonsCount: result.reasons.length,
      hasAnalysis: !!result.analysis,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    apiLogger.error('Trading signal failed', {
      token,
      error: errorMessage,
    });

    return res.status(500).json({
      error: errorMessage || 'Failed to get trading signal',
      token,
    });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import telegramService from '../../services/telegram/telegramService';
import logger from '../../utils/logger';

// Create a webhook-specific logger
const webhookLogger = logger.child({ service: 'telegram-webhook' });

/**
 * Verify the Telegram webhook request
 * @param req - The incoming request
 * @returns {boolean} Whether the request is valid
 */
const verifyWebhookRequest = (req: NextApiRequest): boolean => {
  // Extract the token from the request
  const token = req.headers['x-telegram-bot-api-secret-token'];

  // Check if the token matches the expected value
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secretToken) {
    webhookLogger.warn('TELEGRAM_WEBHOOK_SECRET not configured');
    return false;
  }

  // Validate the token
  const isValid = token === secretToken;

  if (!isValid) {
    webhookLogger.warn('Invalid webhook token received', {
      received: token,
      expected_length: secretToken.length,
    });
  }

  return isValid;
};

/**
 * Telegram webhook handler
 * This handles incoming updates from the Telegram Bot API
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    webhookLogger.warn('Received non-POST request', { method: req.method });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify the webhook request
    if (!verifyWebhookRequest(req)) {
      webhookLogger.warn('Webhook verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Log the incoming update
    webhookLogger.info('Received Telegram update', {
      update_id: req.body.update_id,
      has_message: Boolean(req.body.message),
      has_callback_query: Boolean(req.body.callback_query),
    });

    // Process the update using our Telegram service
    await telegramService.handleUpdate(req, res);

    // If handleUpdate doesn't send a response, we need to
    if (!res.writableEnded) {
      res.status(200).json({ ok: true });
    }
  } catch (error) {
    // Log the error
    webhookLogger.error('Error processing webhook', error);

    // Ensure we send a response
    if (!res.writableEnded) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

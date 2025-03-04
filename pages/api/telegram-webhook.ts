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
      received: token ? 'token-present' : 'token-missing',
      expected_length: secretToken.length,
    });
  }

  return isValid;
};

/**
 * Utility function to extract the raw body as text
 * This is used only for debugging and doesn't interfere with the main body parsing
 */
const readRawBody = (req: NextApiRequest): Promise<string> => {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
  });
};

/**
 * Disable Next.js body parsing for webhook requests
 * This is necessary for grammy to properly handle the request
 */
export const config = {
  api: {
    bodyParser: false,
  },
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
    // Log request headers for debugging
    webhookLogger.debug('Webhook request headers', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
    });

    // Verify the webhook request
    if (!verifyWebhookRequest(req)) {
      webhookLogger.warn('Webhook verification failed');
      webhookLogger.warn('Webhook request headers', {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'has-secret-token': Boolean(req.headers['x-telegram-bot-api-secret-token']),
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Log that we received a webhook request
    webhookLogger.info('Received Telegram webhook request', {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'],
        'has-secret-token': Boolean(req.headers['x-telegram-bot-api-secret-token']),
      },
    });

    // For debugging: read and log the raw body content in development only
    // This is done in a way that doesn't interfere with the main request processing
    let debugBodyInfo = {};
    if (process.env.NODE_ENV !== 'production') {
      try {
        // Create a clone of the request to read the body without consuming the original
        const rawBody = await readRawBody(req);
        if (rawBody) {
          const bodySize = rawBody.length;
          let bodyPreview = rawBody;

          // Truncate very large bodies for the log
          if (bodySize > 1000) {
            bodyPreview = rawBody.substring(0, 500) + '... [truncated]';
          }

          debugBodyInfo = {
            bodySize,
            bodyPreview,
            hasUpdate: rawBody.includes('"update_id"'),
            hasMessage: rawBody.includes('"message"'),
            hasCallbackQuery: rawBody.includes('"callback_query"'),
          };

          webhookLogger.debug('Webhook raw body', debugBodyInfo);
        } else {
          webhookLogger.warn('Webhook body is empty');
        }
      } catch (bodyError) {
        webhookLogger.error('Error reading raw body', {
          error: bodyError instanceof Error ? bodyError.message : 'Unknown error',
        });
      }
    }

    // Process the update using grammy's webhook callback handler
    // This will automatically parse the body and pass it to the bot instance
    try {
      await telegramService.handleUpdate(req, res);

      // If handleUpdate doesn't send a response, we should end it here
      if (!res.writableEnded) {
        webhookLogger.debug('No response sent by handler, sending default response');
        res.status(200).json({ ok: true });
      }
    } catch (handlerError) {
      webhookLogger.error('Error in handleUpdate', {
        error: handlerError instanceof Error ? handlerError.message : 'Unknown error',
        stack: handlerError instanceof Error ? handlerError.stack : undefined,
        debugBodyInfo,
      });

      // Ensure we send a response
      if (!res.writableEnded) {
        res.status(500).json({ error: 'Error processing Telegram update' });
      }
    }
  } catch (error) {
    // Log the error with details
    webhookLogger.error('Error processing webhook', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Ensure we send a response
    if (!res.writableEnded) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

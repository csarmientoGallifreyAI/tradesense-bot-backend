import { NextApiRequest, NextApiResponse } from 'next';
import telegramService from '../../services/telegram/telegramService';
import logger from '../../utils/logger';

const testLogger = logger.child({ service: 'telegram-test' });

/**
 * Test endpoint for the Telegram bot
 * This endpoint allows you to send a test message to a specific chat
 *
 * Query parameters:
 * - chat_id: The chat ID to send the message to
 * - message: The message to send (optional, defaults to a test message)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const chatId = req.query.chat_id as string;
  const message =
    (req.query.message as string) || 'This is a test message from the TradeSense Bot!';

  if (!chatId) {
    return res.status(400).json({ error: 'chat_id is required' });
  }

  testLogger.info('Sending test message', { chatId, message });

  try {
    // Get the bot instance from the telegramService
    const { bot } = telegramService;

    // Send a message to the specified chat
    await bot.api.sendMessage(chatId, message);

    testLogger.info('Test message sent successfully', { chatId });

    return res.status(200).json({
      success: true,
      message: 'Test message sent successfully',
      details: {
        chatId,
        message,
      },
    });
  } catch (error) {
    testLogger.error('Error sending test message', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      chatId,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to send test message',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

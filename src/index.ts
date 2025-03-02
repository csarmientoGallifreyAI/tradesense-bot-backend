import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { Bot, webhookCallback } from 'grammy';
import logger from '../utils/logger';
import telegramService from '../services/telegram/telegramService';

// Load environment variables
dotenv.config();

// Initialize the logger for the main application
const appLogger = logger.child({ service: 'app' });

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Telegram webhook endpoint
app.use(
  '/api/telegram-webhook',
  (req, res, next) => {
    // Extract and verify the token from the request
    const token = req.headers['x-telegram-bot-api-secret-token'];
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!secretToken) {
      appLogger.warn('TELEGRAM_WEBHOOK_SECRET not configured');
      return res.status(403).json({ error: 'Webhook secret not configured' });
    }

    if (token !== secretToken) {
      appLogger.warn('Invalid webhook token received', {
        received_token: typeof token === 'string' ? `${token.substring(0, 3)}...` : 'none',
      });
      return res.status(403).json({ error: 'Invalid webhook token' });
    }

    // Token is valid, proceed to the telegram service handler
    next();
  },
  webhookCallback(telegramService.bot, 'express')
);

// Start the server
app.listen(port, () => {
  appLogger.info(`Server started on port ${port}`);

  // Log important environment variables (without sensitive values)
  appLogger.info('Environment configuration', {
    node_env: process.env.NODE_ENV,
    has_telegram_token: !!process.env.TELEGRAM_BOT_TOKEN,
    has_webhook_secret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
    has_supabase_config: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    port,
  });

  // Set up the telegram webhook URL if in production
  if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
    const webhookUrl = `${process.env.WEBHOOK_URL}/api/telegram-webhook`;

    // Log the webhook setup intent (without exposing the full URL)
    appLogger.info('Setting up Telegram webhook', {
      url_base: process.env.WEBHOOK_URL,
    });

    // Set the webhook
    telegramService.bot.api
      .setWebhook(webhookUrl, {
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      })
      .then(() => {
        appLogger.info('Telegram webhook set successfully');
      })
      .catch((error) => {
        appLogger.error('Failed to set Telegram webhook', error);
      });
  } else {
    appLogger.info(
      'Running in development mode or WEBHOOK_URL not configured, skipping webhook setup'
    );
  }
});

// Handle termination signals
process.on('SIGTERM', () => {
  appLogger.info('SIGTERM received, shutting down gracefully');
  // Perform cleanup if needed
  process.exit(0);
});

process.on('SIGINT', () => {
  appLogger.info('SIGINT received, shutting down gracefully');
  // Perform cleanup if needed
  process.exit(0);
});

// Global error handler
process.on('uncaughtException', (error) => {
  appLogger.error('Uncaught exception', error);
  // In a production environment, you might want to restart the service
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  appLogger.error('Unhandled promise rejection', { reason, promise });
  // In a production environment, you might want to restart the service
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

export default app;

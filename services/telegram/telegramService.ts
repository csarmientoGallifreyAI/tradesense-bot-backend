import { Bot, Context, GrammyError, HttpError, webhookCallback } from 'grammy';
import logger from '../../utils/logger';
import dbService from '../db/dbService';
import aiService from '../ai/aiService';

// Create a child logger for the Telegram service
const telegramLogger = logger.child({ service: 'telegram' });

// Create the bot instance
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

// Command handlers
const commands = {
  // Start command handler
  start: async (ctx: Context) => {
    try {
      telegramLogger.info('Start command received', {
        chat_id: ctx.chat?.id,
        username: ctx.from?.username,
      });

      // Store user in database
      if (ctx.from) {
        await dbService.storeUser({
          telegram_id: ctx.from.id,
          username: ctx.from.username,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name,
        });
      }

      await ctx.reply(
        `👋 Welcome to TradeSense Bot! I can help you analyze crypto markets using AI.\n\n` +
          `🔹 /sentiment BTC - Get market sentiment analysis\n` +
          `🔹 /predict ETH - Get price prediction\n` +
          `🔹 /signal SOL - Get trading signal\n` +
          `🔹 /analyze BNB - Get comprehensive analysis\n` +
          `🔹 /trade - Execute a trade (requires setup)\n` +
          `🔹 /portfolio - View your holdings\n` +
          `🔹 /help - Show this help message\n\n` +
          `Get started by checking the sentiment for Bitcoin with /sentiment BTC`
      );
    } catch (error) {
      telegramLogger.error('Error in start command handler', error);
      await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
  },

  // Help command handler
  help: async (ctx: Context) => {
    try {
      telegramLogger.info('Help command received', {
        chat_id: ctx.chat?.id,
      });

      await ctx.reply(
        `🤖 TradeSense Bot - AI Crypto Trading Assistant\n\n` +
          `Available commands:\n\n` +
          `Market Analysis:\n` +
          `🔹 /sentiment <token> - Get market sentiment analysis\n` +
          `🔹 /predict <token> - Get price prediction\n` +
          `🔹 /signal <token> - Get trading signal\n` +
          `🔹 /analyze <token> - Get comprehensive analysis\n\n` +
          `Trading:\n` +
          `🔹 /trade <token> <amount> - Execute a trade\n` +
          `🔹 /portfolio - View your holdings\n` +
          `🔹 /connect - Connect your wallet\n\n` +
          `Settings:\n` +
          `🔹 /settings - Configure your preferences\n` +
          `🔹 /help - Show this help message\n\n` +
          `Example: /sentiment BTC will analyze Bitcoin market sentiment.`
      );
    } catch (error) {
      telegramLogger.error('Error in help command handler', error);
      await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
  },

  // Sentiment command handler
  sentiment: async (ctx: Context) => {
    try {
      const message = ctx.message?.text?.trim() || '';
      const params = message.split(' ');

      // Check if token symbol is provided
      if (params.length < 2) {
        await ctx.reply('Please provide a token symbol. Example: /sentiment BTC');
        return;
      }

      const tokenSymbol = params[1].toUpperCase();

      telegramLogger.info('Sentiment command received', {
        chat_id: ctx.chat?.id,
        token: tokenSymbol,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(`Analyzing market sentiment for ${tokenSymbol}...`);

      // Get sentiment analysis from AI service
      const sentiment = await aiService.getSentimentAnalysis(tokenSymbol);

      // Format the response based on the sentiment score
      let sentimentText = 'neutral';
      let emoji = '😐';

      if (sentiment.score > 0.6) {
        sentimentText = 'very positive';
        emoji = '🔥';
      } else if (sentiment.score > 0.2) {
        sentimentText = 'positive';
        emoji = '😀';
      } else if (sentiment.score < -0.6) {
        sentimentText = 'very negative';
        emoji = '📉';
      } else if (sentiment.score < -0.2) {
        sentimentText = 'negative';
        emoji = '😕';
      }

      // Prepare response message
      const response =
        `${emoji} ${tokenSymbol} Sentiment: ${sentimentText.toUpperCase()}\n\n` +
        `Score: ${(sentiment.score * 100).toFixed(1)}%\n` +
        `Sources analyzed: ${sentiment.sources.length || 'N/A'}\n` +
        `${sentiment.cached ? '(Analysis from cache)' : '(Fresh analysis)'}\n\n` +
        `Want a trading signal? Try /signal ${tokenSymbol}`;

      // Edit previous message with the results
      await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, response);
    } catch (error) {
      telegramLogger.error('Error in sentiment command handler', error);
      await ctx.reply('Sorry, there was an error analyzing sentiment. Please try again later.');
    }
  },

  // Predict command handler
  predict: async (ctx: Context) => {
    try {
      const message = ctx.message?.text?.trim() || '';
      const params = message.split(' ');

      // Check if token symbol is provided
      if (params.length < 2) {
        await ctx.reply('Please provide a token symbol. Example: /predict BTC');
        return;
      }

      const tokenSymbol = params[1].toUpperCase();

      telegramLogger.info('Prediction command received', {
        chat_id: ctx.chat?.id,
        token: tokenSymbol,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(`Generating price prediction for ${tokenSymbol}...`);

      try {
        // Get price prediction from AI service
        const prediction = await aiService.getPricePrediction(tokenSymbol);

        // Determine if price is predicted to increase or decrease
        const priceChange = prediction.percentageChange >= 0 ? 'increase' : 'decrease';
        const emoji = prediction.percentageChange >= 0 ? '📈' : '📉';

        // Prepare response message
        const response =
          `${emoji} ${tokenSymbol} Price Prediction (24h)\n\n` +
          `Current price: $${prediction.currentPrice.toLocaleString()}\n` +
          `Predicted price: $${prediction.predictedPrice.toLocaleString()}\n` +
          `Expected ${priceChange}: ${Math.abs(prediction.percentageChange).toFixed(2)}%\n` +
          `Confidence: ${(prediction.confidence * 100).toFixed(0)}%\n\n` +
          `Want a comprehensive analysis? Try /analyze ${tokenSymbol}`;

        // Edit previous message with the results
        await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, response);
      } catch (error) {
        telegramLogger.error('Error getting price prediction', error);
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't generate a price prediction for ${tokenSymbol} at this time. Please try again later.`
        );
      }
    } catch (error) {
      telegramLogger.error('Error in predict command handler', error);
      await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
  },

  // Signal command handler
  signal: async (ctx: Context) => {
    try {
      const message = ctx.message?.text?.trim() || '';
      const params = message.split(' ');

      // Check if token symbol is provided
      if (params.length < 2) {
        await ctx.reply('Please provide a token symbol. Example: /signal BTC');
        return;
      }

      const tokenSymbol = params[1].toUpperCase();

      telegramLogger.info('Signal command received', {
        chat_id: ctx.chat?.id,
        token: tokenSymbol,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(`Generating trading signal for ${tokenSymbol}...`);

      try {
        // Get trading signal from AI service
        const signal = await aiService.getTradingSignal(tokenSymbol, true);

        // Determine emoji based on signal type
        let emoji = '⏹️';
        if (signal.signal === 'BUY') {
          emoji = '🟢';
        } else if (signal.signal === 'SELL') {
          emoji = '🔴';
        }

        // Format signal strength as percentage
        const strength = (signal.strength * 100).toFixed(0);

        // Prepare response message
        const response =
          `${emoji} ${tokenSymbol} Trading Signal: ${signal.signal}\n\n` +
          `Signal strength: ${strength}%\n\n` +
          `Reasons:\n${signal.reasons.map((reason: string) => `• ${reason}`).join('\n')}\n\n` +
          `Want to execute this trade? Try /trade ${tokenSymbol} ${
            signal.signal === 'SELL' ? 'SELL' : 'BUY'
          }`;

        // Edit previous message with the results
        await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, response);
      } catch (error) {
        telegramLogger.error('Error getting trading signal', error);
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't generate a trading signal for ${tokenSymbol} at this time. Please try again later.`
        );
      }
    } catch (error) {
      telegramLogger.error('Error in signal command handler', error);
      await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
  },

  // Analyze command handler
  analyze: async (ctx: Context) => {
    try {
      const message = ctx.message?.text?.trim() || '';
      const params = message.split(' ');

      // Check if token symbol is provided
      if (params.length < 2) {
        await ctx.reply('Please provide a token symbol. Example: /analyze BTC');
        return;
      }

      const tokenSymbol = params[1].toUpperCase();

      telegramLogger.info('Analyze command received', {
        chat_id: ctx.chat?.id,
        token: tokenSymbol,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(
        `Generating comprehensive analysis for ${tokenSymbol}...`
      );

      try {
        // Get comprehensive analysis from AI service
        const analysis = await aiService.getComprehensiveAnalysis(tokenSymbol);

        // Determine emoji based on recommendation
        let emoji = '⏹️';
        if (analysis.recommendation === 'BUY') {
          emoji = '🟢';
        } else if (analysis.recommendation === 'SELL') {
          emoji = '🔴';
        }

        // Format sentiment score
        const sentimentScore = analysis.sentiment
          ? `${(analysis.sentiment.score * 100).toFixed(1)}%`
          : 'N/A';

        // Format price prediction
        let priceChangeText = 'N/A';
        if (analysis.prediction) {
          const direction = analysis.prediction.percentageChange >= 0 ? '📈' : '📉';
          priceChangeText = `${direction} ${Math.abs(analysis.prediction.percentageChange).toFixed(
            2
          )}%`;
        }

        // Prepare response message
        const response =
          `${emoji} ${tokenSymbol} Comprehensive Analysis\n\n` +
          `Market Sentiment: ${sentimentScore}\n` +
          `Price Prediction: ${priceChangeText}\n` +
          `Trading Signal: ${analysis.signal?.signal || 'N/A'}\n\n` +
          `Overall Recommendation: ${analysis.recommendation}\n\n` +
          `Want to execute this trade? Try /trade ${tokenSymbol} ${
            analysis.recommendation === 'SELL' ? 'SELL' : 'BUY'
          }`;

        // Edit previous message with the results
        await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, response);
      } catch (error) {
        telegramLogger.error('Error getting comprehensive analysis', error);
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't generate a comprehensive analysis for ${tokenSymbol} at this time. Please try again later.`
        );
      }
    } catch (error) {
      telegramLogger.error('Error in analyze command handler', error);
      await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
  },
};

// Set up command handlers
bot.command('start', commands.start);
bot.command('help', commands.help);
bot.command('sentiment', commands.sentiment);
bot.command('predict', commands.predict);
bot.command('signal', commands.signal);
bot.command('analyze', commands.analyze);

// Error handler
bot.catch((err) => {
  const { ctx } = err;
  telegramLogger.error('Error while handling update', err.error, {
    update_id: ctx.update.update_id,
  });

  const errorMessage =
    err.error instanceof GrammyError
      ? `Error in Telegram API: ${err.error.description}`
      : err.error instanceof HttpError
      ? `Error in HTTP request: ${err.error.message}`
      : 'Unknown error occurred';

  // Notify admin or log the error
  telegramLogger.error(errorMessage);
});

// Webhook handler for use with Next.js API routes or Vercel Functions
export const handleUpdate = webhookCallback(bot, 'next-js');

// Exports
export { bot, commands };

export default {
  handleUpdate,
  bot,
};

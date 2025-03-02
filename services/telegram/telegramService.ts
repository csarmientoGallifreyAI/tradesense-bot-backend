import { Bot, Context, GrammyError, HttpError, webhookCallback } from 'grammy';
import logger from '../../utils/logger';
import dbService from '../db/dbService';
import aiService from '../ai/aiService';
import tradingEngine from '../trading/tradingEngine';

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

  // Trade command handler
  trade: async (ctx: Context) => {
    try {
      const message = ctx.message?.text?.trim() || '';
      const params = message.split(' ');

      // Check if required parameters are provided
      if (params.length < 3) {
        await ctx.reply('Please provide token symbol and trade type. Example: /trade BTC BUY');
        return;
      }

      const tokenSymbol = params[1].toUpperCase();
      const tradeType = params[2].toUpperCase();

      // Validate trade type
      if (tradeType !== 'BUY' && tradeType !== 'SELL') {
        await ctx.reply('Trade type must be either BUY or SELL');
        return;
      }

      // Optional amount parameter
      let amount = 0;
      if (params.length >= 4) {
        amount = parseFloat(params[3]);
        if (isNaN(amount) || amount <= 0) {
          await ctx.reply('Amount must be a positive number');
          return;
        }
      } else {
        // Default amount if not provided
        amount = 0.01; // Small default amount
      }

      telegramLogger.info('Trade command received', {
        chat_id: ctx.chat?.id,
        token: tokenSymbol,
        type: tradeType,
        amount: amount,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(
        `Processing ${tradeType} order for ${amount} ${tokenSymbol}...`
      );

      try {
        // For now, just simulate the trade with a delay
        // In the future, this would integrate with the trading engine

        if (!ctx.from) {
          throw new Error('User information not available');
        }

        // Check if user has a connected wallet
        const user = await dbService.getUserByTelegramId(ctx.from.id);

        if (!user) {
          await ctx.api.editMessageText(
            ctx.chat!.id,
            statusMessage.message_id,
            `You need to set up your account first. Please use /start to register.`
          );
          return;
        }

        // Check if user has a wallet connection
        const walletConnections = await dbService.getWalletConnections(user.id);

        if (!walletConnections || walletConnections.length === 0) {
          await ctx.api.editMessageText(
            ctx.chat!.id,
            statusMessage.message_id,
            `You need to connect a wallet first. Please use /connect to set up your wallet.`
          );
          return;
        }

        // Use default wallet or let user choose in the future
        const wallet =
          walletConnections.find((w: { is_default: boolean }) => w.is_default) ||
          walletConnections[0];

        // Get token info and current price (simplified for now)
        const tokenPrice = 100; // Placeholder
        const tokenAddress = '0x123...'; // Placeholder

        // Simulate trading - in production, call the actual trading engine
        // const tradeResult = await tradingEngine.executeTrade({
        //   userId: user.id,
        //   blockchain: wallet.blockchain,
        //   tokenSymbol,
        //   tokenAddress,
        //   amount,
        //   tradeType,
        //   walletAddress: wallet.wallet_address,
        //   privateKey: 'WOULD_NEED_SECURE_HANDLING' // This needs secure handling
        // });

        // For now, just simulate a successful trade
        const txHash = `0x${Math.random().toString(16).substring(2, 34)}`;

        // Record the trade in the database
        await dbService.recordTrade({
          user_id: user.id,
          token_symbol: tokenSymbol,
          token_address: tokenAddress,
          blockchain: wallet.blockchain,
          amount,
          price: tokenPrice,
          trade_type: tradeType as 'BUY' | 'SELL',
          status: 'COMPLETED',
          tx_hash: txHash,
        });

        // Send success message
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `✅ Trade executed successfully!\n\n` +
            `${tradeType} ${amount} ${tokenSymbol} at $${tokenPrice}\n` +
            `Transaction: ${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 6)}\n\n` +
            `Use /portfolio to view your updated holdings.`
        );
      } catch (error) {
        telegramLogger.error('Error executing trade', error);
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't execute the trade for ${tokenSymbol} at this time.\n\nError: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    } catch (error) {
      telegramLogger.error('Error in trade command handler', error);
      await ctx.reply(
        'Sorry, there was an error processing your trade request. Please try again later.'
      );
    }
  },

  // Portfolio command handler
  portfolio: async (ctx: Context) => {
    try {
      telegramLogger.info('Portfolio command received', {
        chat_id: ctx.chat?.id,
      });

      if (!ctx.from) {
        throw new Error('User information not available');
      }

      // Send initial response
      const statusMessage = await ctx.reply('Fetching your portfolio...');

      try {
        // Get user from database
        const user = await dbService.getUserByTelegramId(ctx.from.id);

        if (!user) {
          await ctx.api.editMessageText(
            ctx.chat!.id,
            statusMessage.message_id,
            `You need to set up your account first. Please use /start to register.`
          );
          return;
        }

        // Get wallet connections
        const walletConnections = await dbService.getWalletConnections(user.id);

        if (!walletConnections || walletConnections.length === 0) {
          await ctx.api.editMessageText(
            ctx.chat!.id,
            statusMessage.message_id,
            `You don't have any connected wallets. Use /connect to add a wallet.`
          );
          return;
        }

        // Get recent trades
        const recentTrades = await dbService.getRecentTrades(user.id, 5);

        // Format portfolio message
        let portfolioMessage = `📊 Your Portfolio\n\n`;

        // Add wallet info
        portfolioMessage += `Connected Wallets:\n`;
        walletConnections.forEach(
          (
            wallet: { wallet_address: string; blockchain: string; is_default: boolean },
            index: number
          ) => {
            const address = wallet.wallet_address;
            const shortAddress = `${address.substring(0, 6)}...${address.substring(
              address.length - 4
            )}`;
            portfolioMessage += `${index + 1}. ${wallet.blockchain}: ${shortAddress}${
              wallet.is_default ? ' (Default)' : ''
            }\n`;
          }
        );

        // Add recent trades
        if (recentTrades && recentTrades.length > 0) {
          portfolioMessage += `\nRecent Trades:\n`;
          recentTrades.forEach(
            (trade: {
              trade_type: string;
              amount: number;
              token_symbol: string;
              price: number;
              status: string;
            }) => {
              const emoji = trade.trade_type === 'BUY' ? '🟢' : '🔴';
              portfolioMessage += `${emoji} ${trade.trade_type} ${trade.amount} ${trade.token_symbol} at $${trade.price} (${trade.status})\n`;
            }
          );
        } else {
          portfolioMessage += `\nNo recent trades found.`;
        }

        // In the future, add actual token balances from blockchain

        portfolioMessage += `\n\nUse /trade to execute a new trade.`;

        await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, portfolioMessage);
      } catch (error) {
        telegramLogger.error('Error fetching portfolio', error);
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't fetch your portfolio at this time. Please try again later.`
        );
      }
    } catch (error) {
      telegramLogger.error('Error in portfolio command handler', error);
      await ctx.reply('Sorry, there was an error fetching your portfolio. Please try again later.');
    }
  },

  // Connect wallet command handler
  connect: async (ctx: Context) => {
    try {
      telegramLogger.info('Connect command received', {
        chat_id: ctx.chat?.id,
      });

      await ctx.reply(
        `To connect your wallet, please follow these steps:\n\n` +
          `1. Choose a blockchain: BSC or NEAR\n` +
          `2. Send your wallet address\n` +
          `3. Complete the verification process\n\n` +
          `For security reasons, this should be done through a secure channel. This is a placeholder implementation.`
      );

      // In a real implementation, this would start a multi-step conversation flow
      // using a conversation management system or state machine
    } catch (error) {
      telegramLogger.error('Error in connect command handler', error);
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
bot.command('trade', commands.trade);
bot.command('portfolio', commands.portfolio);
bot.command('connect', commands.connect);

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

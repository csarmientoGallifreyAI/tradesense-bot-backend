import { Bot, Context, GrammyError, HttpError, webhookCallback } from 'grammy';
import logger from '../../utils/logger';
import dbService from '../db/dbService';
import aiService from '../ai/aiService';
import { handleTradeCommand } from '../trading/tradingEngine';

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

      console.log(ctx);

      await ctx.reply(
        `👋 Welcome to TradeSense Bot! I can help you analyze crypto markets using AI.\n\n` +
          `🔹 /sentiment BTC [timeframe] - Get market sentiment analysis\n` +
          `🔹 /predict ETH [timeframe] - Get price prediction\n` +
          `🔹 /signal SOL [simple] - Get trading signal\n` +
          `🔹 /analyze BNB - Get comprehensive analysis\n` +
          `🔹 /trade <token> <BUY|SELL> [amount] - Execute a trade\n` +
          `🔹 /portfolio - View your holdings\n` +
          `🔹 /help - Show detailed commands and examples\n\n` +
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
          `🔹 /sentiment <token> [timeframe] - Get market sentiment analysis\n` +
          `   Example: /sentiment BTC 24h (timeframe options: 1h, 24h, 7d)\n\n` +
          `🔹 /predict <token> [timeframe] - Get price prediction\n` +
          `   Example: /predict ETH 7d (timeframe options: 1h, 24h, 7d)\n\n` +
          `🔹 /signal <token> [simple] - Get trading signal with optional analysis\n` +
          `   Example: /signal SOL (add "simple" for basic signals without detailed analysis)\n\n` +
          `🔹 /analyze <token> - Get comprehensive analysis\n` +
          `   Example: /analyze BNB (combines sentiment, prediction, and signals)\n\n` +
          `Trading:\n` +
          `🔹 /trade <token> <BUY|SELL> [amount] - Execute a trade\n` +
          `   Example: /trade BTC BUY 0.01\n\n` +
          `🔹 /portfolio - View your holdings\n` +
          `🔹 /connect - Connect your wallet\n\n` +
          `Settings:\n` +
          `🔹 /settings - Configure your preferences\n` +
          `🔹 /help - Show this help message\n\n` +
          `For detailed guides and documentation, visit our website at tradesense.ai`
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

      // Check for optional timeframe parameter
      let timeframe: '1h' | '24h' | '7d' = '24h'; // Default timeframe
      if (params.length >= 3 && ['1h', '24h', '7d'].includes(params[2])) {
        timeframe = params[2] as '1h' | '24h' | '7d';
      }

      telegramLogger.info('Sentiment command received', {
        chat_id: ctx.chat?.id,
        token: tokenSymbol,
        timeframe,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(
        `Analyzing market sentiment for ${tokenSymbol} (${timeframe} timeframe)...`
      );

      const startTime = Date.now();

      try {
        // Get sentiment analysis from AI service
        const sentiment = await aiService.getSentimentAnalysis(tokenSymbol, timeframe);

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

        // Calculate processing time
        const processingTime = Date.now() - startTime;

        // Prepare response message
        const response =
          `${emoji} ${tokenSymbol} Sentiment: ${sentimentText.toUpperCase()}\n\n` +
          `Score: ${(sentiment.score * 100).toFixed(1)}%\n` +
          `Timeframe: ${timeframe}\n` +
          `Sources analyzed: ${sentiment.sources.length || 'N/A'}\n` +
          `${sentiment.cached ? '(Analysis from cache)' : '(Fresh analysis)'}\n` +
          `Analyzed at: ${new Date(sentiment.timestamp).toLocaleString()}\n\n` +
          `Want a price prediction? Try /predict ${tokenSymbol}`;

        telegramLogger.debug('Sentiment analysis completed', {
          token: tokenSymbol,
          timeframe,
          processingTime: `${processingTime}ms`,
          score: sentiment.score,
          cached: sentiment.cached,
        });

        // Edit previous message with the results
        await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, response);
      } catch (error) {
        // Log the specific error with relevant details
        telegramLogger.error('Error getting sentiment analysis', {
          error: error instanceof Error ? error.message : String(error),
          token: tokenSymbol,
          timeframe,
          processingTime: `${Date.now() - startTime}ms`,
        });

        // Provide a more helpful error message to the user
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't analyze sentiment for ${tokenSymbol} at this time.\n\n` +
            `Reason: ${
              error instanceof Error
                ? error.message.replace(/Failed to get sentiment analysis for [A-Z]+: /, '')
                : 'Connection error'
            }\n\n` +
            `Please try again later or try another token.`
        );
      }
    } catch (error) {
      telegramLogger.error('Error in sentiment command handler', error);
      await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
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

      // Check for optional timeframe parameter
      let timeHorizon: '1h' | '24h' | '7d' = '24h'; // Default timeframe
      if (params.length >= 3 && ['1h', '24h', '7d'].includes(params[2])) {
        timeHorizon = params[2] as '1h' | '24h' | '7d';
      }

      telegramLogger.info('Prediction command received', {
        chat_id: ctx.chat?.id,
        token: tokenSymbol,
        timeHorizon,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(
        `Generating price prediction for ${tokenSymbol} (${timeHorizon} horizon)...`
      );

      const startTime = Date.now();

      try {
        // Get price prediction from AI service
        const prediction = await aiService.getPricePrediction(tokenSymbol, timeHorizon);

        // Determine if price is predicted to increase or decrease
        const priceChange = prediction.percentageChange >= 0 ? 'increase' : 'decrease';
        const emoji = prediction.percentageChange >= 0 ? '📈' : '📉';

        // Calculate confidence rating in text form
        let confidenceText = 'medium';
        if (prediction.confidence > 0.8) {
          confidenceText = 'very high';
        } else if (prediction.confidence > 0.6) {
          confidenceText = 'high';
        } else if (prediction.confidence < 0.3) {
          confidenceText = 'low';
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;

        // Prepare response message
        const response =
          `${emoji} ${tokenSymbol} Price Prediction (${timeHorizon})\n\n` +
          `Current price: $${prediction.currentPrice.toLocaleString()}\n` +
          `Predicted price: $${prediction.predictedPrice.toLocaleString()}\n` +
          `Expected ${priceChange}: ${Math.abs(prediction.percentageChange).toFixed(2)}%\n` +
          `Confidence: ${(prediction.confidence * 100).toFixed(0)}% (${confidenceText})\n` +
          `Prediction time: ${new Date(prediction.timestamp).toLocaleString()}\n\n` +
          `Want a trading signal? Try /signal ${tokenSymbol}`;

        telegramLogger.debug('Price prediction completed', {
          token: tokenSymbol,
          timeHorizon,
          processingTime: `${processingTime}ms`,
          predicted_change: prediction.percentageChange,
          confidence: prediction.confidence,
        });

        // Edit previous message with the results
        await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, response);
      } catch (error) {
        // Log the specific error with details
        telegramLogger.error('Error getting price prediction', {
          error: error instanceof Error ? error.message : String(error),
          token: tokenSymbol,
          timeHorizon,
          processingTime: `${Date.now() - startTime}ms`,
        });

        // Provide a more detailed error message to the user
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't generate a price prediction for ${tokenSymbol} at this time.\n\n` +
            `Reason: ${
              error instanceof Error
                ? error.message.replace(/Failed to get price prediction for [A-Z]+: /, '')
                : 'Connection error'
            }\n\n` +
            `Please try again later or try another token.`
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

      // Check for optional includeAnalysis parameter
      let includeAnalysis = true; // Default to include analysis
      if (params.length >= 3 && params[2].toLowerCase() === 'simple') {
        includeAnalysis = false;
      }

      telegramLogger.info('Signal command received', {
        chat_id: ctx.chat?.id,
        token: tokenSymbol,
        includeAnalysis,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(`Generating trading signal for ${tokenSymbol}...`);

      const startTime = Date.now();

      try {
        // Get trading signal from AI service
        const signal = await aiService.getTradingSignal(tokenSymbol, includeAnalysis);

        // Determine emoji based on signal type
        let emoji = '⏹️';
        if (signal.signal === 'BUY') {
          emoji = '🟢';
        } else if (signal.signal === 'SELL') {
          emoji = '🔴';
        }

        // Format signal strength as percentage
        const strength = (signal.strength * 100).toFixed(0);

        // Determine strength text
        let strengthText = 'moderate';
        if (signal.strength > 0.8) {
          strengthText = 'very strong';
        } else if (signal.strength > 0.6) {
          strengthText = 'strong';
        } else if (signal.strength < 0.3) {
          strengthText = 'weak';
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;

        // Prepare response message
        let response =
          `${emoji} ${tokenSymbol} Trading Signal: ${signal.signal}\n\n` +
          `Signal strength: ${strength}% (${strengthText})\n` +
          `Signal time: ${new Date(signal.timestamp).toLocaleString()}\n\n` +
          `Reasons:\n${signal.reasons.map((reason: string) => `• ${reason}`).join('\n')}`;

        // Add analysis if available
        if (signal.analysis) {
          response += `\n\nAnalysis:\n${signal.analysis}`;
        }

        // Add call to action
        response += `\n\nWant to execute this trade? Try /trade ${tokenSymbol} ${
          signal.signal === 'SELL' ? 'SELL' : 'BUY'
        }`;

        telegramLogger.debug('Trading signal completed', {
          token: tokenSymbol,
          signal: signal.signal,
          strength: signal.strength,
          reasonsCount: signal.reasons.length,
          processingTime: `${processingTime}ms`,
          includeAnalysis,
        });

        // Edit previous message with the results
        await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, response);
      } catch (error) {
        // Log the specific error with details
        telegramLogger.error('Error getting trading signal', {
          error: error instanceof Error ? error.message : String(error),
          token: tokenSymbol,
          includeAnalysis,
          processingTime: `${Date.now() - startTime}ms`,
        });

        // Provide a more detailed error message to the user
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't generate a trading signal for ${tokenSymbol} at this time.\n\n` +
            `Reason: ${
              error instanceof Error
                ? error.message.replace(/Failed to get trading signal for [A-Z]+: /, '')
                : 'Connection error'
            }\n\n` +
            `Please try again later or try another token.`
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

      const startTime = Date.now();

      try {
        // Get comprehensive analysis from AI service
        const analysis = await aiService.getComprehensiveAnalysis(tokenSymbol);

        // Determine emoji based on recommendation
        let emoji = '⏹️';
        let recommendationEmoji = '⏹️';
        if (analysis.recommendation === 'BUY') {
          emoji = '🟢';
          recommendationEmoji = '🟢';
        } else if (analysis.recommendation === 'SELL') {
          emoji = '🔴';
          recommendationEmoji = '🔴';
        }

        // Format sentiment score
        let sentimentEmoji = '😐';
        let sentimentText = 'Neutral';
        if (analysis.sentiment) {
          if (analysis.sentiment.score > 0.6) {
            sentimentEmoji = '🔥';
            sentimentText = 'Very Positive';
          } else if (analysis.sentiment.score > 0.2) {
            sentimentEmoji = '😀';
            sentimentText = 'Positive';
          } else if (analysis.sentiment.score < -0.6) {
            sentimentEmoji = '📉';
            sentimentText = 'Very Negative';
          } else if (analysis.sentiment.score < -0.2) {
            sentimentEmoji = '😕';
            sentimentText = 'Negative';
          }
        }

        const sentimentScore = analysis.sentiment
          ? `${sentimentEmoji} ${sentimentText} (${(analysis.sentiment.score * 100).toFixed(1)}%)`
          : 'N/A';

        // Format price prediction
        let priceChangeText = 'N/A';
        let confidenceText = '';
        if (analysis.prediction) {
          const direction = analysis.prediction.percentageChange >= 0 ? '📈' : '📉';
          priceChangeText = `${direction} ${Math.abs(analysis.prediction.percentageChange).toFixed(
            2
          )}%`;
          if (analysis.prediction.confidence) {
            confidenceText = ` (Confidence: ${(analysis.prediction.confidence * 100).toFixed(0)}%)`;
          }
        }

        // Format signal information
        let signalText = 'N/A';
        if (analysis.signal) {
          let signalEmoji = '⏹️';
          if (analysis.signal.signal === 'BUY') {
            signalEmoji = '🟢';
          } else if (analysis.signal.signal === 'SELL') {
            signalEmoji = '🔴';
          }
          signalText = `${signalEmoji} ${analysis.signal.signal}`;
          if (analysis.signal.strength) {
            signalText += ` (Strength: ${(analysis.signal.strength * 100).toFixed(0)}%)`;
          }
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;

        // Prepare response message
        const response =
          `${emoji} ${tokenSymbol} Comprehensive Analysis\n\n` +
          `Market Sentiment: ${sentimentScore}\n` +
          `Price Prediction: ${priceChangeText}${confidenceText}\n` +
          `Trading Signal: ${signalText}\n\n` +
          `${recommendationEmoji} Overall Recommendation: ${analysis.recommendation}\n` +
          `Analysis Time: ${new Date(analysis.timestamp).toLocaleString()}\n\n` +
          `Want to execute this trade? Try /trade ${tokenSymbol} ${
            analysis.recommendation === 'SELL' ? 'SELL' : 'BUY'
          }`;

        telegramLogger.debug('Comprehensive analysis completed', {
          token: tokenSymbol,
          recommendation: analysis.recommendation,
          hasSentiment: !!analysis.sentiment,
          hasPrediction: !!analysis.prediction,
          hasSignal: !!analysis.signal,
          processingTime: `${processingTime}ms`,
        });

        // Edit previous message with the results
        await ctx.api.editMessageText(ctx.chat!.id, statusMessage.message_id, response);
      } catch (error) {
        // Log the specific error with details
        telegramLogger.error('Error getting comprehensive analysis', {
          error: error instanceof Error ? error.message : String(error),
          token: tokenSymbol,
          processingTime: `${Date.now() - startTime}ms`,
        });

        // Provide a more detailed error message to the user
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't generate a comprehensive analysis for ${tokenSymbol} at this time.\n\n` +
            `Reason: ${
              error instanceof Error
                ? error.message.replace(/Failed to get comprehensive analysis for [A-Z]+: /, '')
                : 'Connection error'
            }\n\n` +
            `Please try again later or try another token. You can also try individual commands like /sentiment, /predict, or /signal.`
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

      // Check if required parameters are provided
      if (message.split(' ').length < 3) {
        await ctx.reply('Please provide token symbol and trade type. Example: /trade BTC BUY');
        return;
      }

      telegramLogger.info('Trade command received', {
        chat_id: ctx.chat?.id,
        message,
      });

      // Send initial response to indicate processing
      const statusMessage = await ctx.reply(`Processing trade request...`);

      try {
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

        // Execute the trade using the new trading engine function
        const tradeResult = await handleTradeCommand(message, {
          userId: user.id,
          walletAddress: wallet.wallet_address,
          blockchain: wallet.blockchain,
        });

        if (tradeResult.success) {
          // Success message
          await ctx.api.editMessageText(
            ctx.chat!.id,
            statusMessage.message_id,
            `${tradeResult.message}\n\n` +
              `Transaction: ${tradeResult.txHash?.substring(
                0,
                8
              )}...${tradeResult.txHash?.substring(tradeResult.txHash.length - 6)}\n\n` +
              `Use /portfolio to view your updated holdings.`
          );
        } else {
          // Error message
          await ctx.api.editMessageText(
            ctx.chat!.id,
            statusMessage.message_id,
            tradeResult.message
          );
        }
      } catch (error) {
        telegramLogger.error('Error executing trade', error);
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          `Sorry, I couldn't execute your trade at this time.\n\nError: ${
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

// Enhanced webhook handler with additional debugging
const enhancedWebhookCallback = webhookCallback(bot, 'next-js');

// Wrapper around the webhook callback to add debugging
export const handleUpdate = async (req: any, res: any) => {
  telegramLogger.debug('Received update in handleUpdate wrapper', {
    method: req.method,
    contentType: req.headers['content-type'],
    hasBody: !!req.body,
  });

  try {
    // Call the original webhook callback
    await enhancedWebhookCallback(req, res);
    telegramLogger.debug('Webhook callback completed successfully');
  } catch (error) {
    telegramLogger.error('Error in webhook callback', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error; // Re-throw to be handled by the API route
  }
};

// Exports
export { bot, commands };

export default {
  handleUpdate,
  bot,
};

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../../utils/logger';

// Database tables
export enum Tables {
  USERS = 'users',
  TRADES = 'trades',
  WALLET_CONNECTIONS = 'wallet_connections',
  SENTIMENT_ANALYSIS = 'sentiment_analysis',
  PREDICTIONS = 'predictions',
  TRADE_SIGNALS = 'trade_signals',
}

// Create a singleton instance of the Supabase client
let supabaseInstance: SupabaseClient | null = null;

/**
 * Get the Supabase client instance
 * Uses a singleton pattern to ensure only one client is created
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      const error = new Error('Supabase URL or key not found in environment variables');
      logger.fatal('Failed to initialize Supabase client', error);
      throw error;
    }

    try {
      supabaseInstance = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
        },
        // Configure reasonable defaults for serverless functions
        db: {
          schema: 'public',
        },
        global: {
          // Use reasonable timeouts for serverless functions
          fetch: (url, options) => {
            return fetch(url, {
              ...options,
              // 9 second timeout (slightly less than Vercel's 10s function timeout)
              signal: AbortSignal.timeout(9000),
            });
          },
        },
      });

      logger.info('Supabase client initialized successfully');
    } catch (error) {
      logger.fatal('Failed to initialize Supabase client', error);
      throw error;
    }
  }

  return supabaseInstance;
};

/**
 * Get a client with service role privileges for admin operations
 * WARNING: This should only be used in secure server-side contexts
 */
export const getServiceRoleClient = (): SupabaseClient => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Supabase URL or service role key not found in environment variables');
    logger.fatal('Failed to initialize service role client', error);
    throw error;
  }

  try {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
    });
  } catch (error) {
    logger.fatal('Failed to initialize service role client', error);
    throw error;
  }
};

/**
 * Database helper functions
 */
export const dbService = {
  /**
   * Store telegram user data
   */
  async storeUser(userData: {
    telegram_id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  }) {
    const supabase = getSupabaseClient();

    try {
      logger.debug('Storing user data', { telegram_id: userData.telegram_id });

      const { data, error } = await supabase
        .from(Tables.USERS)
        .upsert(
          {
            telegram_id: userData.telegram_id,
            username: userData.username,
            first_name: userData.first_name,
            last_name: userData.last_name,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'telegram_id',
            ignoreDuplicates: false,
          }
        )
        .select('id');

      if (error) {
        throw error;
      }

      logger.info('User data stored successfully', { telegram_id: userData.telegram_id });
      return data[0]?.id;
    } catch (error) {
      logger.error('Failed to store user data', error, { userData });
      throw error;
    }
  },

  /**
   * Record a trade in the database
   */
  async recordTrade(tradeData: {
    user_id: number;
    token_symbol: string;
    token_address: string;
    blockchain: 'BSC' | 'NEAR';
    amount: number;
    price: number;
    trade_type: 'BUY' | 'SELL';
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    tx_hash?: string;
    error_message?: string;
  }) {
    const supabase = getSupabaseClient();

    try {
      logger.debug('Recording trade', {
        user_id: tradeData.user_id,
        token: tradeData.token_symbol,
        trade_type: tradeData.trade_type,
      });

      const { data, error } = await supabase
        .from(Tables.TRADES)
        .insert({
          user_id: tradeData.user_id,
          token_symbol: tradeData.token_symbol,
          token_address: tradeData.token_address,
          blockchain: tradeData.blockchain,
          amount: tradeData.amount,
          price: tradeData.price,
          trade_type: tradeData.trade_type,
          status: tradeData.status,
          tx_hash: tradeData.tx_hash,
          error_message: tradeData.error_message,
          created_at: new Date().toISOString(),
        })
        .select('id');

      if (error) {
        throw error;
      }

      logger.info('Trade recorded successfully', {
        trade_id: data[0]?.id,
        token: tradeData.token_symbol,
      });

      return data[0]?.id;
    } catch (error) {
      logger.error('Failed to record trade', error, { tradeData });
      throw error;
    }
  },

  /**
   * Update a trade status
   */
  async updateTradeStatus(
    tradeId: number,
    status: 'PENDING' | 'COMPLETED' | 'FAILED',
    txHash?: string,
    errorMessage?: string
  ) {
    const supabase = getSupabaseClient();

    try {
      logger.debug('Updating trade status', {
        trade_id: tradeId,
        status,
      });

      const { error } = await supabase
        .from(Tables.TRADES)
        .update({
          status,
          tx_hash: txHash,
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tradeId);

      if (error) {
        throw error;
      }

      logger.info('Trade status updated successfully', {
        trade_id: tradeId,
        status,
      });
    } catch (error) {
      logger.error('Failed to update trade status', error, {
        trade_id: tradeId,
        status,
      });
      throw error;
    }
  },

  /**
   * Store sentiment analysis results
   */
  async storeSentimentAnalysis(data: {
    token_symbol: string;
    sentiment_score: number;
    timeframe: '1h' | '24h' | '7d';
    sources: string[];
  }) {
    const supabase = getSupabaseClient();

    try {
      logger.debug('Storing sentiment analysis', {
        token: data.token_symbol,
        timeframe: data.timeframe,
      });

      const { error } = await supabase.from(Tables.SENTIMENT_ANALYSIS).insert({
        token_symbol: data.token_symbol,
        sentiment_score: data.sentiment_score,
        timeframe: data.timeframe,
        sources: data.sources,
        created_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      logger.info('Sentiment analysis stored successfully', {
        token: data.token_symbol,
        timeframe: data.timeframe,
      });
    } catch (error) {
      logger.error('Failed to store sentiment analysis', error, { data });
      throw error;
    }
  },

  /**
   * Get the most recent sentiment analysis for a token
   */
  async getLatestSentiment(tokenSymbol: string, timeframe: '1h' | '24h' | '7d') {
    const supabase = getSupabaseClient();

    try {
      logger.debug('Fetching latest sentiment analysis', {
        token: tokenSymbol,
        timeframe,
      });

      const { data, error } = await supabase
        .from(Tables.SENTIMENT_ANALYSIS)
        .select('*')
        .eq('token_symbol', tokenSymbol)
        .eq('timeframe', timeframe)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      logger.info('Latest sentiment analysis fetched', {
        token: tokenSymbol,
        timeframe,
        found: data.length > 0,
      });

      return data[0] || null;
    } catch (error) {
      logger.error('Failed to fetch latest sentiment analysis', error, {
        token: tokenSymbol,
        timeframe,
      });
      throw error;
    }
  },
};

export default dbService;

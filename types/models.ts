/**
 * Type definitions for database models
 */

/**
 * Telegram user stored in the database
 */
export interface User {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
  updated_at: string;
  preferences?: UserPreferences;
}

/**
 * User preferences for trading and notifications
 */
export interface UserPreferences {
  notification_level: 'all' | 'important' | 'none';
  default_blockchain: 'BSC' | 'NEAR';
  auto_trade: boolean;
  max_trade_amount?: number;
}

/**
 * Wallet connection information
 */
export interface WalletConnection {
  id: number;
  user_id: number;
  blockchain: 'BSC' | 'NEAR';
  wallet_address: string;
  is_default: boolean;
  label?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Trade record in the database
 */
export interface Trade {
  id: number;
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
  created_at: string;
  updated_at?: string;
}

/**
 * Sentiment analysis record
 */
export interface SentimentAnalysis {
  id: number;
  token_symbol: string;
  sentiment_score: number;
  timeframe: '1h' | '24h' | '7d';
  sources: string[];
  created_at: string;
}

/**
 * Price prediction record
 */
export interface PricePrediction {
  id: number;
  token_symbol: string;
  current_price: number;
  predicted_price: number;
  percentage_change: number;
  confidence: number;
  timeframe: '1h' | '24h' | '7d';
  created_at: string;
}

/**
 * Trading signal record
 */
export interface TradingSignal {
  id: number;
  token_symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  reasons: string[];
  created_at: string;
}

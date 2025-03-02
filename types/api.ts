/**
 * Type definitions for API requests and responses
 */
import { SentimentAnalysis, PricePrediction, TradingSignal, Trade } from './models';

/**
 * Sentiment analysis API response
 */
export interface SentimentAnalysisResponse {
  score: number;
  sources: string[];
  cached: boolean;
  timestamp: string;
  error?: string;
}

/**
 * Price prediction API response
 */
export interface PricePredictionResponse {
  currentPrice: number;
  predictedPrice: number;
  percentageChange: number;
  confidence: number;
  timestamp: string;
}

/**
 * Trading signal API response
 */
export interface TradingSignalResponse {
  token: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  reasons: string[];
  analysis?: string | null;
  timestamp: string;
}

/**
 * Comprehensive analysis API response
 */
export interface ComprehensiveAnalysisResponse {
  token: string;
  timestamp: string;
  sentiment?: SentimentAnalysisResponse;
  prediction?: PricePredictionResponse | null;
  signal?: TradingSignalResponse | null;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
}

/**
 * Trade execution request
 */
export interface TradeExecutionRequest {
  userId: number;
  blockchain: 'BSC' | 'NEAR';
  tokenSymbol: string;
  tokenAddress: string;
  amount: number;
  tradeType: 'BUY' | 'SELL';
  walletAddress: string;
  privateKey: string;
}

/**
 * Trade execution response
 */
export interface TradeExecutionResponse {
  success: boolean;
  trade_id?: number;
  tx_hash?: string;
  error?: string;
}

/**
 * Wallet balance request
 */
export interface WalletBalanceRequest {
  blockchain: 'BSC' | 'NEAR';
  walletAddress: string;
  tokens?: { address: string; symbol: string }[];
}

/**
 * Token balance in a wallet
 */
export interface TokenBalance {
  symbol: string;
  balance: string;
  is_native: boolean;
  token_address?: string;
}

/**
 * Wallet balance response
 */
export interface WalletBalanceResponse {
  balances: TokenBalance[];
  totalValueUSD?: number;
}

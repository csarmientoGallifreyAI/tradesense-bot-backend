/**
 * Type definitions for service interfaces
 */
import {
  SentimentAnalysisResponse,
  PricePredictionResponse,
  TradingSignalResponse,
  ComprehensiveAnalysisResponse,
  TradeExecutionRequest,
  TradeExecutionResponse,
  WalletBalanceRequest,
  TokenBalance,
} from './api';

/**
 * AI Service interface
 */
export interface AIServiceInterface {
  getSentimentAnalysis(
    tokenSymbol: string,
    timeframe?: '1h' | '24h' | '7d',
    forceRefresh?: boolean
  ): Promise<SentimentAnalysisResponse>;

  getPricePrediction(
    tokenSymbol: string,
    timeHorizon?: '1h' | '24h' | '7d'
  ): Promise<PricePredictionResponse>;

  getTradingSignal(tokenSymbol: string, includeAnalysis?: boolean): Promise<TradingSignalResponse>;

  getComprehensiveAnalysis(tokenSymbol: string): Promise<ComprehensiveAnalysisResponse>;
}

/**
 * Trading Engine interface
 */
export interface TradingEngineInterface {
  executeTrade(tradeData: TradeExecutionRequest): Promise<TradeExecutionResponse>;

  getWalletBalances(walletData: WalletBalanceRequest): Promise<TokenBalance[]>;
}

/**
 * Blockchain Adapter interface
 */
export interface BlockchainAdapter {
  name: string;

  getBalance(
    address: string,
    tokenAddress?: string
  ): Promise<{
    balance: string;
    symbol: string;
    decimals: number;
  }>;

  executeTransaction(txData: any): Promise<string>;

  isValidAddress(address: string): boolean;
}

/**
 * Database Service interface (simplified)
 */
export interface DatabaseServiceInterface {
  storeUser(userData: {
    telegram_id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  }): Promise<number | undefined>;

  recordTrade(tradeData: {
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
  }): Promise<number | undefined>;

  updateTradeStatus(
    tradeId: number,
    status: 'PENDING' | 'COMPLETED' | 'FAILED',
    txHash?: string,
    errorMessage?: string
  ): Promise<void>;

  storeSentimentAnalysis(data: {
    token_symbol: string;
    sentiment_score: number;
    timeframe: '1h' | '24h' | '7d';
    sources: string[];
  }): Promise<void>;

  getLatestSentiment(tokenSymbol: string, timeframe: '1h' | '24h' | '7d'): Promise<any | null>;
}

import { ethers } from 'ethers';
import logger from '../../utils/logger';
import dbService from '../db/dbService';

// Create a logger instance for the trading engine
const tradingLogger = logger.child({ service: 'trading-engine' });

// ABI for ERC20 token interactions (minimal interface)
const ERC20_ABI = [
  // Read-only functions
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',

  // Write functions
  'function transfer(address to, uint amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',

  // Events
  'event Transfer(address indexed from, address indexed to, uint amount)',
];

// Interface for blockchain-specific adapters
interface BlockchainAdapter {
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

// Interface for token balance response
interface TokenBalance {
  symbol: string;
  balance: string;
  is_native: boolean;
  token_address?: string;
}

/**
 * BSC (Binance Smart Chain) blockchain adapter
 */
const bscAdapter: BlockchainAdapter = {
  name: 'BSC',

  /**
   * Get the token balance for an address
   * @param address - The wallet address
   * @param tokenAddress - The token contract address (optional, if not provided returns BNB balance)
   */
  async getBalance(address: string, tokenAddress?: string) {
    try {
      // Initialize provider
      const provider = new ethers.JsonRpcProvider(
        process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'
      );

      // If token address is not provided, get native BNB balance
      if (!tokenAddress) {
        const balance = await provider.getBalance(address);
        return {
          balance: ethers.formatEther(balance),
          symbol: 'BNB',
          decimals: 18,
        };
      }

      // Get ERC20 token balance
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [balance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(address),
        tokenContract.decimals(),
        tokenContract.symbol(),
      ]);

      return {
        balance: ethers.formatUnits(balance, decimals),
        symbol: symbol,
        decimals: decimals,
      };
    } catch (error) {
      tradingLogger.error('Failed to get BSC balance', error, {
        address,
        tokenAddress,
      });
      throw error;
    }
  },

  /**
   * Execute a transaction on BSC
   * @param txData - Transaction data
   */
  async executeTransaction(txData: {
    tokenAddress?: string;
    recipientAddress: string;
    amount: string;
    privateKey: string;
  }) {
    try {
      const { tokenAddress, recipientAddress, amount, privateKey } = txData;

      // Initialize provider and wallet
      const provider = new ethers.JsonRpcProvider(
        process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'
      );

      const wallet = new ethers.Wallet(privateKey, provider);

      let txResponse;

      // If token address is not provided, send native BNB
      if (!tokenAddress) {
        tradingLogger.info('Sending native BNB', {
          from: wallet.address,
          to: recipientAddress,
          amount,
        });

        txResponse = await wallet.sendTransaction({
          to: recipientAddress,
          value: ethers.parseEther(amount),
        });
      } else {
        // Send ERC20 token
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

        // Get token decimals
        const decimals = await tokenContract.decimals();

        tradingLogger.info('Sending ERC20 token', {
          token: tokenAddress,
          from: wallet.address,
          to: recipientAddress,
          amount,
        });

        // Execute the transfer
        txResponse = await tokenContract.transfer(
          recipientAddress,
          ethers.parseUnits(amount, decimals)
        );
      }

      tradingLogger.info('Transaction submitted', {
        txHash: txResponse.hash,
        blockNumber: txResponse.blockNumber || 'pending',
      });

      return txResponse.hash;
    } catch (error) {
      tradingLogger.error('Failed to execute BSC transaction', error, {
        tokenAddress: txData.tokenAddress,
        recipient: txData.recipientAddress,
      });
      throw error;
    }
  },

  /**
   * Check if an address is valid
   * @param address - The address to validate
   */
  isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  },
};

/**
 * NEAR Protocol blockchain adapter
 * This is a placeholder - actual implementation would use near-api-js
 */
const nearAdapter: BlockchainAdapter = {
  name: 'NEAR',

  async getBalance(address: string, tokenAddress?: string) {
    // Placeholder implementation - would use near-api-js in actual code
    tradingLogger.warn('NEAR adapter not fully implemented');

    return {
      balance: '0',
      symbol: tokenAddress ? 'TOKEN' : 'NEAR',
      decimals: 24,
    };
  },

  async executeTransaction(txData: any) {
    // Placeholder implementation - would use near-api-js in actual code
    tradingLogger.warn('NEAR adapter not fully implemented');

    return 'transaction-hash-placeholder';
  },

  isValidAddress(address: string): boolean {
    // Simple validation for NEAR addresses
    // In a real implementation, this would be more sophisticated
    return address.endsWith('.near') || /^[a-zA-Z0-9]{64}$/.test(address);
  },
};

/**
 * Trading Engine - Handles execution of trades across different blockchains
 */
const tradingEngine = {
  /**
   * Execute a trade
   * @param tradeData - Trade data
   */
  async executeTrade(tradeData: {
    userId: number;
    blockchain: 'BSC' | 'NEAR';
    tokenSymbol: string;
    tokenAddress: string;
    amount: number;
    tradeType: 'BUY' | 'SELL';
    walletAddress: string;
    privateKey: string;
  }) {
    try {
      tradingLogger.info('Executing trade', {
        user_id: tradeData.userId,
        blockchain: tradeData.blockchain,
        token: tradeData.tokenSymbol,
        type: tradeData.tradeType,
      });

      // Record the trade in the database
      const tradeId = await dbService.recordTrade({
        user_id: tradeData.userId,
        token_symbol: tradeData.tokenSymbol,
        token_address: tradeData.tokenAddress,
        blockchain: tradeData.blockchain,
        amount: tradeData.amount,
        price: 0, // This would be fetched from a price API in a real implementation
        trade_type: tradeData.tradeType,
        status: 'PENDING',
      });

      // Select the appropriate blockchain adapter
      const adapter = tradeData.blockchain === 'BSC' ? bscAdapter : nearAdapter;

      // Execute the transaction
      // This is a simplified implementation - in reality, you'd connect to a DEX or CEX
      const txHash = await adapter.executeTransaction({
        tokenAddress: tradeData.tokenAddress,
        recipientAddress: tradeData.walletAddress,
        amount: tradeData.amount.toString(),
        privateKey: tradeData.privateKey,
      });

      // Update the trade status in the database
      await dbService.updateTradeStatus(tradeId, 'COMPLETED', txHash);

      return {
        success: true,
        trade_id: tradeId,
        tx_hash: txHash,
      };
    } catch (error) {
      tradingLogger.error('Trade execution failed', error, {
        blockchain: tradeData.blockchain,
        token: tradeData.tokenSymbol,
      });

      // Record the failure in the database if a trade ID exists
      if (tradeData.userId) {
        try {
          const tradeId = await dbService.recordTrade({
            user_id: tradeData.userId,
            token_symbol: tradeData.tokenSymbol,
            token_address: tradeData.tokenAddress,
            blockchain: tradeData.blockchain,
            amount: tradeData.amount,
            price: 0,
            trade_type: tradeData.tradeType,
            status: 'FAILED',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          });

          tradingLogger.info('Recorded failed trade', { trade_id: tradeId });
        } catch (dbError) {
          tradingLogger.error('Failed to record trade failure', dbError);
        }
      }

      throw error;
    }
  },

  /**
   * Get wallet balances
   * @param walletData - Wallet data
   */
  async getWalletBalances(walletData: {
    blockchain: 'BSC' | 'NEAR';
    walletAddress: string;
    tokens?: { address: string; symbol: string }[];
  }): Promise<TokenBalance[]> {
    try {
      tradingLogger.info('Fetching wallet balances', {
        blockchain: walletData.blockchain,
        wallet: walletData.walletAddress,
      });

      // Select the appropriate blockchain adapter
      const adapter = walletData.blockchain === 'BSC' ? bscAdapter : nearAdapter;

      // Get native token balance
      const nativeBalance = await adapter.getBalance(walletData.walletAddress);

      const balances: TokenBalance[] = [
        {
          symbol: nativeBalance.symbol,
          balance: nativeBalance.balance,
          is_native: true,
        },
      ];

      // Get token balances if provided
      if (walletData.tokens && walletData.tokens.length > 0) {
        for (const token of walletData.tokens) {
          try {
            const tokenBalance = await adapter.getBalance(walletData.walletAddress, token.address);

            balances.push({
              symbol: tokenBalance.symbol,
              balance: tokenBalance.balance,
              is_native: false,
              token_address: token.address,
            });
          } catch (error) {
            tradingLogger.warn('Failed to get token balance', {
              token: token.symbol,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      return balances;
    } catch (error) {
      tradingLogger.error('Failed to get wallet balances', error, {
        blockchain: walletData.blockchain,
        wallet: walletData.walletAddress,
      });

      throw error;
    }
  },
};

export default tradingEngine;

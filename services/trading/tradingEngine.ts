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

/**
 * Helper function to validate trading commands
 * @param messageText Full message text from the Telegram command
 * @returns A validated trade object with symbol, direction, and amount
 */
export function parseTradingCommand(messageText: string): {
  symbol: string;
  direction: 'BUY' | 'SELL';
  amount: number;
} {
  const parts = messageText.split(' ');

  // Check for minimum command structure
  if (parts.length < 3) {
    throw new Error('Invalid trade command. Usage: /trade [symbol] [BUY|SELL] [amount]');
  }

  // Extract parts (ignore the first part which is the command itself)
  const symbol = parts[1].toUpperCase();
  const direction = parts[2].toUpperCase() as 'BUY' | 'SELL';

  // Validate direction
  if (direction !== 'BUY' && direction !== 'SELL') {
    throw new Error('Trade direction must be either BUY or SELL');
  }

  // Parse amount, using a default if not provided
  let amount = 0.01; // Default amount
  if (parts.length >= 4) {
    amount = parseFloat(parts[3]);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Trade amount must be a positive number');
    }
  }

  return {
    symbol,
    direction,
    amount,
  };
}

/**
 * Get an approximate current price for a token (simulated)
 * In a real implementation, this would call an external price API
 */
export async function getTokenPrice(symbol: string): Promise<number> {
  try {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // For testing - return randomized realistic prices based on common tokens
    const basePrices: Record<string, number> = {
      BTC: 35000,
      ETH: 2000,
      BNB: 300,
      SOL: 50,
      NEAR: 2.5,
      AVAX: 15,
      // Add more tokens as needed
    };

    const basePrice = basePrices[symbol] || 10; // Default price if unknown token

    // Add some random variance (±5%)
    const variance = basePrice * 0.05; // 5% of base price
    const randomOffset = Math.random() * variance * 2 - variance;
    return basePrice + randomOffset;
  } catch (error) {
    tradingLogger.error('Error getting token price', { error, symbol });
    throw new Error(`Failed to get price for ${symbol}`);
  }
}

/**
 * Simulate a trade execution without making actual blockchain calls
 * In production, this would interact with the blockchain adapter
 */
export async function simulateTrade(tradeData: {
  symbol: string;
  direction: 'BUY' | 'SELL';
  amount: number;
  userId: number;
  walletAddress: string;
  blockchain: 'BSC' | 'NEAR';
}): Promise<{
  txHash: string;
  price: number;
  status: 'COMPLETED' | 'FAILED';
  error?: string;
}> {
  try {
    const { symbol, direction, amount, userId, walletAddress, blockchain } = tradeData;

    tradingLogger.info('Simulating trade execution', {
      symbol,
      direction,
      amount,
      userId,
      walletAddress: `${walletAddress.substring(0, 6)}...${walletAddress.substring(
        walletAddress.length - 4
      )}`,
      blockchain,
    });

    // Get current token price
    const tokenPrice = await getTokenPrice(symbol);

    // Simulate blockchain transaction delay (1-3 seconds)
    const txTime = 1000 + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, txTime));

    // Generate a fake transaction hash
    const txHash = `0x${Math.random().toString(16).substring(2, 34)}`;

    // Log the successful trade
    tradingLogger.info('Trade completed successfully', {
      symbol,
      direction,
      amount,
      price: tokenPrice,
      txHash,
      blockchain,
      execution_time_ms: txTime,
    });

    // In a real implementation, record the trade in the database
    try {
      await dbService.recordTrade({
        user_id: userId,
        token_symbol: symbol,
        token_address: `0x${Math.random().toString(16).substring(2, 42)}`, // fake token address
        blockchain,
        amount,
        price: tokenPrice,
        trade_type: direction,
        status: 'COMPLETED',
        tx_hash: txHash,
      });
    } catch (dbError) {
      tradingLogger.error('Failed to record trade in database', { dbError, userId, symbol });
      // We don't fail the trade if just the recording fails
    }

    return {
      txHash,
      price: tokenPrice,
      status: 'COMPLETED',
    };
  } catch (error) {
    tradingLogger.error('Error simulating trade', { error, ...tradeData });
    return {
      txHash: '',
      price: 0,
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Unknown trading error',
    };
  }
}

/**
 * Process a trading command from a user and execute it
 * This is the main entry point from the Telegram service
 */
export async function handleTradeCommand(
  messageText: string,
  userData: {
    userId: number;
    walletAddress: string;
    blockchain: 'BSC' | 'NEAR';
  }
): Promise<{
  success: boolean;
  message: string;
  txHash?: string;
  price?: number;
}> {
  try {
    // Parse the trading command
    const tradeParams = parseTradingCommand(messageText);

    // Execute the trade
    const result = await simulateTrade({
      symbol: tradeParams.symbol,
      direction: tradeParams.direction,
      amount: tradeParams.amount,
      userId: userData.userId,
      walletAddress: userData.walletAddress,
      blockchain: userData.blockchain,
    });

    // Handle the result
    if (result.status === 'COMPLETED') {
      return {
        success: true,
        message: `✅ Successfully ${tradeParams.direction === 'BUY' ? 'bought' : 'sold'} ${
          tradeParams.amount
        } ${tradeParams.symbol} at $${result.price.toFixed(2)}.`,
        txHash: result.txHash,
        price: result.price,
      };
    } else {
      return {
        success: false,
        message: `❌ Trade failed: ${result.error || 'Unknown error'}`,
      };
    }
  } catch (error) {
    tradingLogger.error('Error handling trade command', { error, messageText });
    return {
      success: false,
      message: `❌ Trade command error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    };
  }
}

export default tradingEngine;

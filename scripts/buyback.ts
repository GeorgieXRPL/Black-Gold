#!/usr/bin/env tsx
/**
 * @fileoverview Buyback service runner for Black Gold
 * Monitors creator wallet and automatically swaps SOL to COAL tokens
 * 
 * Run with: npm run buyback (dev) or npm run buyback:prod (production)
 * 
 * Required environment variables:
 * - CREATOR_WALLET_PRIVATE_KEY: Private key for the creator wallet
 * - HELIUS_API_KEY: Helius API key for RPC access
 * - TOKEN_MINT_ADDRESS: COAL token mint address
 * - REWARD_WALLET_ADDRESS: Destination for bought tokens
 */

import {
  executeBuyback,
  shouldExecuteBuyback,
  getBuybackStats,
  getCreatorWalletBalance,
} from '../server/solana/buyback';
import { BUYBACK_CONFIG, TOKEN_CONFIG } from '../config/constants';

/**
 * Service state
 */
interface ServiceState {
  isRunning: boolean;
  lastCheck: Date | null;
  lastBuyback: Date | null;
  totalBuybacks: number;
  totalSolSpent: number;
  totalTokensBought: number;
  errors: Array<{ timestamp: Date; message: string }>;
}

const state: ServiceState = {
  isRunning: false,
  lastCheck: null,
  lastBuyback: null,
  totalBuybacks: 0,
  totalSolSpent: 0,
  totalTokensBought: 0,
  errors: [],
};

/**
 * Logs a message with timestamp
 */
function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Logs an error and stores it in state
 */
function logError(message: string): void {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
  state.errors.push({ timestamp: new Date(), message });
  // Keep only last 100 errors
  if (state.errors.length > 100) {
    state.errors.shift();
  }
}

/**
 * Validates required environment variables
 */
function validateEnvironment(): boolean {
  const required = [
    'CREATOR_WALLET_PRIVATE_KEY',
    'HELIUS_API_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logError(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }

  if (TOKEN_CONFIG.MINT_ADDRESS === 'TBD') {
    logError('TOKEN_MINT_ADDRESS is not configured (still TBD)');
    return false;
  }

  return true;
}

/**
 * Performs a single buyback check and execution if needed
 */
async function runBuybackCheck(): Promise<void> {
  state.lastCheck = new Date();

  try {
    log('Checking for buyback opportunity...');
    
    const { shouldBuyback, balance } = await shouldExecuteBuyback();
    
    if (!shouldBuyback) {
      log(`No buyback needed. Balance: ${balance.toFixed(4)} SOL (min: ${BUYBACK_CONFIG.MIN_SOL_FOR_BUYBACK} SOL)`);
      return;
    }

    log(`Buyback triggered! Balance: ${balance.toFixed(4)} SOL`);
    
    const result = await executeBuyback();

    if (result.success) {
      state.lastBuyback = new Date();
      state.totalBuybacks++;
      state.totalSolSpent += result.solSpent;
      state.totalTokensBought += result.tokensReceived;
      
      log(
        `✓ Buyback successful! ` +
        `${result.solSpent.toFixed(4)} SOL → ${result.tokensReceived.toLocaleString()} ${TOKEN_CONFIG.SYMBOL} ` +
        `| TX: ${result.signature}`
      );
    } else {
      logError(`Buyback failed: ${result.error}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logError(`Check failed: ${message}`);
  }
}

/**
 * Prints current service statistics
 */
function printStats(): void {
  log('=== Buyback Service Stats ===');
  log(`Running: ${state.isRunning}`);
  log(`Last check: ${state.lastCheck?.toISOString() ?? 'Never'}`);
  log(`Last buyback: ${state.lastBuyback?.toISOString() ?? 'Never'}`);
  log(`Total buybacks: ${state.totalBuybacks}`);
  log(`Total SOL spent: ${state.totalSolSpent.toFixed(4)}`);
  log(`Total tokens bought: ${state.totalTokensBought.toLocaleString()}`);
  log(`Recent errors: ${state.errors.length}`);
  log('=============================');
}

/**
 * Main service loop
 */
async function main(): Promise<void> {
  log('╔═══════════════════════════════════════════════════════════════╗');
  log('║           BLACK GOLD BUYBACK SERVICE                          ║');
  log('╚═══════════════════════════════════════════════════════════════╝');
  log('');

  // Validate environment
  if (!validateEnvironment()) {
    process.exit(1);
  }

  // Print configuration
  log('Configuration:');
  log(`  Token: ${TOKEN_CONFIG.SYMBOL} (${TOKEN_CONFIG.MINT_ADDRESS.slice(0, 8)}...)`);
  log(`  Check interval: ${BUYBACK_CONFIG.CHECK_INTERVAL_MS / 1000}s`);
  log(`  Min SOL for buyback: ${BUYBACK_CONFIG.MIN_SOL_FOR_BUYBACK}`);
  log(`  Slippage: ${BUYBACK_CONFIG.SLIPPAGE_BPS / 100}%`);
  log('');

  // Get initial balance
  try {
    const balance = await getCreatorWalletBalance();
    log(`Creator wallet balance: ${balance.toFixed(4)} SOL`);
  } catch (error) {
    logError('Failed to get initial balance - check wallet configuration');
  }

  log('');
  log(`Starting buyback loop (every ${BUYBACK_CONFIG.CHECK_INTERVAL_MS / 1000}s)...`);
  log('Press Ctrl+C to stop');
  log('');

  state.isRunning = true;

  // Run initial check
  await runBuybackCheck();

  // Set up interval for periodic checks
  const intervalId = setInterval(async () => {
    await runBuybackCheck();
  }, BUYBACK_CONFIG.CHECK_INTERVAL_MS);

  // Set up stats printing every 10 minutes
  const statsIntervalId = setInterval(() => {
    printStats();
  }, 10 * 60 * 1000);

  // Handle graceful shutdown
  const shutdown = (): void => {
    log('');
    log('Shutting down buyback service...');
    state.isRunning = false;
    clearInterval(intervalId);
    clearInterval(statsIntervalId);
    printStats();
    log('Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run the service
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

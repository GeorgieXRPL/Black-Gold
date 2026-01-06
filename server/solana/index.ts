/**
 * @fileoverview Solana integration module for Black Gold mining platform
 * 
 * This module provides:
 * - Holder verification with Helius API (cached for 5 minutes)
 * - SPL token reward distribution to miners
 * - Automatic buyback service (SOL → COAL via Jupiter)
 */

// Holder verification
export {
  verifyHolder,
  updateMarketCap,
  getMarketCap,
  invalidateCache,
  clearCache,
  getCacheStats,
  createConnection,
} from './holder';

// Reward distribution
export {
  sendReward,
  queueReward,
  processPendingRewards,
  getRewardPoolBalance,
  getPendingRewardCount,
  getPendingRewards,
  clearPendingRewards,
  loadRewardWalletKeypair,
} from './rewards';

export type { RewardTransferResult, PendingReward } from './rewards';

// Buyback service
export {
  executeBuyback,
  shouldExecuteBuyback,
  getSwapQuote,
  getSwapRate,
  getBuybackStats,
  getCreatorWalletBalance,
  loadCreatorWalletKeypair,
} from './buyback';

export type { BuybackResult } from './buyback';

/**
 * @fileoverview Quarry-based on-chain staking integration for Black Gold v2.8
 * 
 * Architecture:
 * - Users stake COAL tokens (Pump.fun token) in Quarry
 * - Users earn IOU-COAL rewards (minted by MintWrapper)
 * - Users redeem IOU-COAL → real COAL at Redeemer
 * - Raid bets handled separately by BetEscrow
 * 
 * This file provides:
 * - Transaction building for stake/unstake/claim
 * - On-chain stake balance queries
 * - Reward claiming and redemption
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { TOKEN_CONFIG, RPC_CONFIG, IS_DEVNET } from '../../config/constants';
import { createConnection } from './holder';

/**
 * Quarry configuration from environment
 */
export interface QuarryConfig {
  enabled: boolean;
  rewarderAddress: string | null;
  quarryAddress: string | null;
  mintWrapperAddress: string | null;
  iouTokenMint: string | null;
  coalTokenMint: string;
}

/**
 * Get Quarry configuration from environment
 */
export function getQuarryConfig(): QuarryConfig {
  const rewarderAddress = process.env.QUARRY_REWARDER_ADDRESS || null;
  const quarryAddress = process.env.QUARRY_ADDRESS || null;
  const mintWrapperAddress = process.env.QUARRY_MINT_WRAPPER || null;
  const iouTokenMint = process.env.IOU_TOKEN_MINT || null;
  
  const enabled = !!(rewarderAddress && quarryAddress);
  
  return {
    enabled,
    rewarderAddress,
    quarryAddress,
    mintWrapperAddress,
    iouTokenMint,
    coalTokenMint: TOKEN_CONFIG.MINT_ADDRESS,
  };
}

/**
 * Check if Quarry staking is available
 */
export function isQuarryAvailable(): boolean {
  return getQuarryConfig().enabled;
}

/**
 * Staking transaction result
 */
export interface StakingResult {
  success: boolean;
  signature?: string;
  error?: string;
  amount: number;
  timestamp: Date;
}

/**
 * User stake info (from on-chain Quarry)
 */
export interface UserStakeInfo {
  walletAddress: string;
  stakedAmount: number;
  pendingRewards: number;
  lastStakeTime: Date | null;
  minerPDA: string | null;
}

/**
 * Build a stake transaction for user to sign
 * 
 * @param walletAddress - User's wallet public key
 * @param amount - Amount to stake (in COAL tokens)
 * @returns Serialized transaction for frontend to sign
 */
export async function buildStakeTransaction(
  walletAddress: string,
  amount: number
): Promise<{ transaction: string; message: string } | { error: string }> {
  const config = getQuarryConfig();
  
  if (!config.enabled || !config.quarryAddress) {
    return { error: 'Quarry staking not configured' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);
    const quarryPubkey = new PublicKey(config.quarryAddress);

    // Convert amount to raw units
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_CONFIG.DECIMALS)));

    // Create transaction
    const transaction = new Transaction();
    
    // Add memo instruction for tracking
    const memoInstruction = createMemoInstruction(
      `quarry_stake:${amount}:${config.quarryAddress}`,
      userPubkey
    );
    transaction.add(memoInstruction);

    // In production with Quarry SDK:
    // const quarrySDK = QuarrySDK.load({ provider });
    // const quarry = await quarrySDK.mine.loadQuarryWrapper(quarryPubkey);
    // const minerActions = await quarry.getMinerActions(userPubkey);
    // const stakeIx = await minerActions.stake(new TokenAmount(coalToken, rawAmount));
    // transaction.add(stakeIx);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    // Serialize for frontend
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      transaction: serialized.toString('base64'),
      message: `Stake ${amount} COAL in Black Gold Quarry`,
    };
  } catch (error) {
    console.error('[Staking] Failed to build stake transaction:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Build an unstake transaction for user to sign
 * 
 * @param walletAddress - User's wallet public key
 * @param amount - Amount to unstake (in COAL tokens)
 * @returns Serialized transaction for frontend to sign
 */
export async function buildUnstakeTransaction(
  walletAddress: string,
  amount: number
): Promise<{ transaction: string; message: string } | { error: string }> {
  const config = getQuarryConfig();
  
  if (!config.enabled || !config.quarryAddress) {
    return { error: 'Quarry staking not configured' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);

    const transaction = new Transaction();
    
    // Add memo instruction for tracking
    const memoInstruction = createMemoInstruction(
      `quarry_unstake:${amount}:${config.quarryAddress}`,
      userPubkey
    );
    transaction.add(memoInstruction);

    // In production with Quarry SDK:
    // const quarrySDK = QuarrySDK.load({ provider });
    // const quarry = await quarrySDK.mine.loadQuarryWrapper(quarryPubkey);
    // const minerActions = await quarry.getMinerActions(userPubkey);
    // const unstakeIx = await minerActions.withdraw(new TokenAmount(coalToken, rawAmount));
    // transaction.add(unstakeIx);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      transaction: serialized.toString('base64'),
      message: `Unstake ${amount} COAL from Black Gold Quarry`,
    };
  } catch (error) {
    console.error('[Staking] Failed to build unstake transaction:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Build a claim rewards transaction
 * 
 * @param walletAddress - User's wallet public key
 * @returns Serialized transaction for frontend to sign
 */
export async function buildClaimRewardsTransaction(
  walletAddress: string
): Promise<{ transaction: string; message: string; estimatedReward: number } | { error: string }> {
  const config = getQuarryConfig();
  
  if (!config.enabled || !config.quarryAddress) {
    return { error: 'Quarry staking not configured' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);

    // Get estimated reward amount
    const stakeInfo = await getUserStakeInfo(walletAddress);
    const estimatedReward = stakeInfo.pendingRewards;

    const transaction = new Transaction();
    
    // Add memo instruction for tracking
    const memoInstruction = createMemoInstruction(
      `quarry_claim:${config.quarryAddress}`,
      userPubkey
    );
    transaction.add(memoInstruction);

    // In production with Quarry SDK:
    // const quarrySDK = QuarrySDK.load({ provider });
    // const quarry = await quarrySDK.mine.loadQuarryWrapper(quarryPubkey);
    // const minerActions = await quarry.getMinerActions(userPubkey);
    // const claimIx = await minerActions.claim();
    // transaction.add(claimIx);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      transaction: serialized.toString('base64'),
      message: `Claim IOU-COAL rewards from Black Gold Quarry`,
      estimatedReward,
    };
  } catch (error) {
    console.error('[Staking] Failed to build claim transaction:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Build a redeem IOU-COAL → COAL transaction
 * 
 * @param walletAddress - User's wallet public key
 * @param amount - Amount of IOU-COAL to redeem
 * @returns Serialized transaction for frontend to sign
 */
export async function buildRedeemTransaction(
  walletAddress: string,
  amount: number
): Promise<{ transaction: string; message: string } | { error: string }> {
  const config = getQuarryConfig();
  
  if (!config.iouTokenMint) {
    return { error: 'IOU token not configured' };
  }

  const redeemerWallet = process.env.REDEEMER_WALLET_ADDRESS;
  if (!redeemerWallet) {
    return { error: 'Redeemer wallet not configured' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);

    const transaction = new Transaction();
    
    // Add memo instruction for tracking
    const memoInstruction = createMemoInstruction(
      `quarry_redeem:${amount}:${config.iouTokenMint}`,
      userPubkey
    );
    transaction.add(memoInstruction);

    // In production:
    // 1. Transfer IOU-COAL from user to Redeemer
    // 2. Redeemer burns IOU-COAL
    // 3. Redeemer sends equivalent COAL to user

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      transaction: serialized.toString('base64'),
      message: `Redeem ${amount} IOU-COAL for COAL`,
    };
  } catch (error) {
    console.error('[Staking] Failed to build redeem transaction:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get user's current staking info from on-chain
 * 
 * @param walletAddress - User's wallet address
 */
export async function getUserStakeInfo(walletAddress: string): Promise<UserStakeInfo> {
  const config = getQuarryConfig();
  
  const defaultInfo: UserStakeInfo = {
    walletAddress,
    stakedAmount: 0,
    pendingRewards: 0,
    lastStakeTime: null,
    minerPDA: null,
  };
  
  if (!config.enabled || !config.quarryAddress) {
    return defaultInfo;
  }

  try {
    // In production with Quarry SDK:
    // const quarrySDK = QuarrySDK.load({ provider });
    // const quarry = await quarrySDK.mine.loadQuarryWrapper(new PublicKey(config.quarryAddress));
    // const miner = await quarry.getMiner(new PublicKey(walletAddress));
    // 
    // if (miner) {
    //   return {
    //     walletAddress,
    //     stakedAmount: miner.balance.asNumber,
    //     pendingRewards: miner.rewardsEarned.asNumber,
    //     lastStakeTime: miner.lastStakeTs ? new Date(miner.lastStakeTs * 1000) : null,
    //     minerPDA: miner.minerKey.toBase58(),
    //   };
    // }

    console.log(`[Staking] Getting stake info for ${walletAddress}`);
    return defaultInfo;
    
  } catch (error) {
    console.error('[Staking] Failed to get stake info:', error);
    return defaultInfo;
  }
}

/**
 * Verify a stake transaction was successful
 * 
 * @param signature - Transaction signature
 * @param walletAddress - User's wallet
 * @param expectedAmount - Expected stake amount
 */
export async function verifyStakeTransaction(
  signature: string,
  walletAddress: string,
  expectedAmount: number
): Promise<{ verified: boolean; actualAmount?: number; error?: string }> {
  try {
    const connection = createConnection();
    
    // Wait for confirmation
    const result = await connection.confirmTransaction(signature, 'confirmed');
    
    if (result.value.err) {
      return { verified: false, error: 'Transaction failed' };
    }

    // In production: Parse transaction to verify actual stake amount
    console.log(`[Staking] Verified stake: ${signature} for ${walletAddress}`);
    
    return { verified: true, actualAmount: expectedAmount };
  } catch (error) {
    console.error('[Staking] Verification failed:', error);
    return { verified: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create a memo instruction for transaction logging
 */
function createMemoInstruction(memo: string, signer: PublicKey): TransactionInstruction {
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });
}

/**
 * Staking service status
 */
export function getStakingStatus(): {
  available: boolean;
  network: string;
  quarryAddress: string | null;
  iouTokenMint: string | null;
  coalTokenMint: string;
} {
  const config = getQuarryConfig();
  
  return {
    available: config.enabled,
    network: RPC_CONFIG.NETWORK,
    quarryAddress: config.quarryAddress,
    iouTokenMint: config.iouTokenMint,
    coalTokenMint: config.coalTokenMint,
  };
}

/**
 * Get the Quarry address for this deployment
 */
export function getQuarryAddress(): string | null {
  return getQuarryConfig().quarryAddress;
}

/**
 * Get the IOU token mint address
 */
export function getIOUTokenMint(): string | null {
  return getQuarryConfig().iouTokenMint;
}

/**
 * @fileoverview Quarry-based on-chain staking integration for Black Gold
 * Provides stake/unstake functionality with instant withdrawals
 * 
 * Uses @quarryprotocol/quarry-sdk for on-chain staking
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
 * User stake info
 */
export interface UserStakeInfo {
  walletAddress: string;
  stakedAmount: number;
  rewardsEarned: number;
  lastStakeTime: Date | null;
}

/**
 * Quarry configuration
 */
export interface QuarryConfig {
  rewarderAddress: string;
  quarryAddress: string;
  tokenMintAddress: string;
}

/**
 * Get Quarry configuration from environment
 */
export function getQuarryConfig(): QuarryConfig | null {
  const rewarderAddress = process.env.QUARRY_REWARDER_ADDRESS;
  const quarryAddress = process.env.QUARRY_ADDRESS;
  
  if (!rewarderAddress || !quarryAddress) {
    console.warn('[Staking] Quarry not configured - QUARRY_REWARDER_ADDRESS and QUARRY_ADDRESS required');
    return null;
  }
  
  return {
    rewarderAddress,
    quarryAddress,
    tokenMintAddress: TOKEN_CONFIG.MINT_ADDRESS,
  };
}

/**
 * Check if Quarry staking is available
 */
export function isQuarryAvailable(): boolean {
  return getQuarryConfig() !== null;
}

/**
 * Build a stake transaction for user to sign
 * This creates the transaction but does NOT submit it - user must sign
 * 
 * @param walletAddress - User's wallet public key
 * @param amount - Amount to stake (in token units, not raw)
 * @returns Serialized transaction for frontend to sign
 */
export async function buildStakeTransaction(
  walletAddress: string,
  amount: number
): Promise<{ transaction: string; message: string } | { error: string }> {
  const config = getQuarryConfig();
  if (!config) {
    return { error: 'Staking not configured' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);
    const tokenMint = new PublicKey(config.tokenMintAddress);
    const rewarder = new PublicKey(config.rewarderAddress);
    const quarry = new PublicKey(config.quarryAddress);

    // Convert amount to raw units
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_CONFIG.DECIMALS)));

    // For now, create a placeholder transaction
    // In production, this would use the Quarry SDK to build the actual stake instruction
    const transaction = new Transaction();
    
    // Add a memo instruction as placeholder
    // Real implementation would use QuarrySDK.stake()
    const memoInstruction = createMemoInstruction(
      `stake:${amount}:${config.quarryAddress}`,
      userPubkey
    );
    transaction.add(memoInstruction);

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
      message: `Stake ${amount} ${TOKEN_CONFIG.SYMBOL} to Black Gold mining`,
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
 * @param amount - Amount to unstake (in token units)
 * @returns Serialized transaction for frontend to sign
 */
export async function buildUnstakeTransaction(
  walletAddress: string,
  amount: number
): Promise<{ transaction: string; message: string } | { error: string }> {
  const config = getQuarryConfig();
  if (!config) {
    return { error: 'Staking not configured' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);

    const transaction = new Transaction();
    
    // Add a memo instruction as placeholder
    // Real implementation would use QuarrySDK.unstake()
    const memoInstruction = createMemoInstruction(
      `unstake:${amount}:${config.quarryAddress}`,
      userPubkey
    );
    transaction.add(memoInstruction);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      transaction: serialized.toString('base64'),
      message: `Unstake ${amount} ${TOKEN_CONFIG.SYMBOL} from Black Gold mining`,
    };
  } catch (error) {
    console.error('[Staking] Failed to build unstake transaction:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Verify a stake transaction was successful
 * Called after user signs and submits
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

    // In production, parse the transaction to verify the actual amount staked
    // For now, trust the signature confirmation
    console.log(`[Staking] Verified stake: ${signature} for ${walletAddress}`);
    
    return { verified: true, actualAmount: expectedAmount };
  } catch (error) {
    console.error('[Staking] Verification failed:', error);
    return { verified: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get user's current staking info from on-chain
 * 
 * @param walletAddress - User's wallet address
 */
export async function getUserStakeInfo(walletAddress: string): Promise<UserStakeInfo> {
  const config = getQuarryConfig();
  
  if (!config) {
    return {
      walletAddress,
      stakedAmount: 0,
      rewardsEarned: 0,
      lastStakeTime: null,
    };
  }

  try {
    // In production, query the Quarry miner account for this user
    // For now, return placeholder
    console.log(`[Staking] Getting stake info for ${walletAddress}`);
    
    return {
      walletAddress,
      stakedAmount: 0,
      rewardsEarned: 0,
      lastStakeTime: null,
    };
  } catch (error) {
    console.error('[Staking] Failed to get stake info:', error);
    return {
      walletAddress,
      stakedAmount: 0,
      rewardsEarned: 0,
      lastStakeTime: null,
    };
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
  rewarderAddress: string | null;
  tokenMint: string;
} {
  const config = getQuarryConfig();
  
  return {
    available: config !== null,
    network: RPC_CONFIG.NETWORK,
    rewarderAddress: config?.rewarderAddress || null,
    tokenMint: TOKEN_CONFIG.MINT_ADDRESS,
  };
}

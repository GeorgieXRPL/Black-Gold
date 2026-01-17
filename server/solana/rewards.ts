/**
 * @fileoverview SPL Token reward distribution service for Black Gold mining
 * Sends COAL token rewards to miners who successfully discover barrels
 * Uses @solana/spl-token for token transfers
 * 
 * SECURITY NOTE: This file handles private keys. Never log, serialize, or expose
 * private key material. All key handling is ephemeral and in-memory only.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
// Use require to avoid TypeScript module resolution conflicts with @saberhq/token-utils
// eslint-disable-next-line @typescript-eslint/no-var-requires
const splToken = require('@solana/spl-token') as {
  getAssociatedTokenAddress: (mint: import('@solana/web3.js').PublicKey, owner: import('@solana/web3.js').PublicKey) => Promise<import('@solana/web3.js').PublicKey>;
  createAssociatedTokenAccountInstruction: (payer: import('@solana/web3.js').PublicKey, associatedToken: import('@solana/web3.js').PublicKey, owner: import('@solana/web3.js').PublicKey, mint: import('@solana/web3.js').PublicKey) => import('@solana/web3.js').TransactionInstruction;
  createTransferInstruction: (source: import('@solana/web3.js').PublicKey, destination: import('@solana/web3.js').PublicKey, owner: import('@solana/web3.js').PublicKey, amount: bigint | number) => import('@solana/web3.js').TransactionInstruction;
  getAccount: (connection: import('@solana/web3.js').Connection, address: import('@solana/web3.js').PublicKey) => Promise<{ amount: bigint }>;
  TokenAccountNotFoundError: typeof Error;
};
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TokenAccountNotFoundError,
} = splToken;
import { TOKEN_CONFIG, RPC_CONFIG, WALLET_CONFIG } from '../../config/constants';
import { createConnection } from './holder';

/**
 * Result of a reward transfer operation
 */
export interface RewardTransferResult {
  /** Whether the transfer was successful */
  success: boolean;
  /** Transaction signature if successful */
  signature?: string;
  /** Error message if failed */
  error?: string;
  /** Amount transferred */
  amount: number;
  /** Recipient wallet address */
  recipient: string;
  /** Timestamp of transfer */
  timestamp: Date;
}

/**
 * Pending reward queue entry
 */
export interface PendingReward {
  /** Recipient wallet address */
  walletAddress: string;
  /** Reward amount in token units */
  amount: number;
  /** Barrel number this reward is for */
  barrelNumber: number;
  /** When the reward was queued */
  queuedAt: Date;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Queue of pending rewards awaiting processing
 */
const pendingRewards: PendingReward[] = [];

/**
 * Loads the reward wallet keypair from environment variable
 * The private key should be stored as a base58-encoded string or JSON array
 * 
 * SECURITY: This function handles sensitive key material.
 * - Never log the privateKeyEnv or secretKey values
 * - Never serialize the Keypair back to a loggable format
 * - Only use the Keypair for signing transactions
 * 
 * @returns Keypair for the reward wallet
 * @throws Error if private key is not configured or invalid (without exposing key data)
 */
export function loadRewardWalletKeypair(): Keypair {
  const privateKeyEnv = process.env.REWARD_WALLET_PRIVATE_KEY;
  
  if (!privateKeyEnv) {
    throw new Error('REWARD_WALLET_PRIVATE_KEY environment variable is required');
  }

  // Validate length before attempting to parse (without logging the value)
  if (privateKeyEnv.length < 32) {
    throw new Error('REWARD_WALLET_PRIVATE_KEY appears to be too short');
  }

  try {
    // Try parsing as JSON array first (Phantom export format)
    const secretKey = JSON.parse(privateKeyEnv);
    if (!Array.isArray(secretKey) || secretKey.length !== 64) {
      throw new Error('Invalid key array length');
    }
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch (jsonError) {
    // Try parsing as base58 string
    try {
      const bs58 = require('bs58');
      const secretKey = bs58.decode(privateKeyEnv);
      return Keypair.fromSecretKey(secretKey);
    } catch {
      // Generic error message - never expose key format hints that could aid attackers
      throw new Error('Failed to parse REWARD_WALLET_PRIVATE_KEY. Check format.');
    }
  }
}

/**
 * Gets or creates an Associated Token Account (ATA) for a wallet
 * If the ATA doesn't exist, creates it as part of the transaction
 * 
 * @param connection - Solana connection
 * @param payer - Keypair paying for account creation if needed
 * @param owner - Wallet address that will own the token account
 * @param mint - Token mint address
 * @returns Object with ATA address and optional creation instruction
 */
async function getOrCreateATA(
  connection: Connection,
  payer: Keypair,
  owner: PublicKey,
  mint: PublicKey
): Promise<{
  address: PublicKey;
  instruction: TransactionInstruction | null;
}> {
  const ata = await getAssociatedTokenAddress(mint, owner);

  try {
    await getAccount(connection, ata);
    // Account exists
    return { address: ata, instruction: null };
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      // Account doesn't exist, create instruction
      const instruction = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner,
        mint
      );
      return { address: ata, instruction };
    }
    throw error;
  }
}

/**
 * Sends token rewards to a miner's wallet
 * Creates the recipient's token account if it doesn't exist
 * 
 * @param recipientAddress - Miner's wallet address
 * @param amount - Amount of tokens to send (in UI units, not raw)
 * @param barrelNumber - Barrel number this reward is for (for logging)
 * @returns Result of the transfer operation
 * 
 * @example
 * ```typescript
 * const result = await sendReward('7xKX...abc', 1000, 42);
 * if (result.success) {
 *   console.log(`Sent reward! TX: ${result.signature}`);
 * }
 * ```
 */
export async function sendReward(
  recipientAddress: string,
  amount: number,
  barrelNumber: number
): Promise<RewardTransferResult> {
  const timestamp = new Date();
  
  console.log(
    `[Rewards] Sending ${amount.toLocaleString()} ${TOKEN_CONFIG.SYMBOL} ` +
    `to ${recipientAddress.slice(0, 8)}... for barrel #${barrelNumber}`
  );

  try {
    // Validate recipient address
    const recipient = new PublicKey(recipientAddress);
    const mint = new PublicKey(TOKEN_CONFIG.MINT_ADDRESS);
    
    // Load payer keypair
    const payer = loadRewardWalletKeypair();
    
    // Create connection
    const connection = createConnection();

    // Convert amount to raw units (multiply by 10^decimals)
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_CONFIG.DECIMALS)));

    // Get source token account (reward wallet's ATA)
    const sourceATA = await getAssociatedTokenAddress(mint, payer.publicKey);

    // Check source balance
    const sourceAccount = await getAccount(connection, sourceATA);
    if (sourceAccount.amount < rawAmount) {
      throw new Error(
        `Insufficient reward pool balance. ` +
        `Has: ${Number(sourceAccount.amount) / Math.pow(10, TOKEN_CONFIG.DECIMALS)}, ` +
        `Needs: ${amount}`
      );
    }

    // Get or create destination ATA
    const { address: destATA, instruction: createATAIx } = await getOrCreateATA(
      connection,
      payer,
      recipient,
      mint
    );

    // Build transaction
    const transaction = new Transaction();

    // Add priority fee for faster confirmation
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 5000, // Priority fee
      })
    );

    // Add ATA creation if needed
    if (createATAIx) {
      transaction.add(createATAIx);
      console.log(`[Rewards] Creating token account for ${recipientAddress.slice(0, 8)}...`);
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        sourceATA,
        destATA,
        payer.publicKey,
        rawAmount
      )
    );

    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    console.log(
      `[Rewards] ✓ Sent ${amount.toLocaleString()} ${TOKEN_CONFIG.SYMBOL} ` +
      `to ${recipientAddress.slice(0, 8)}... | TX: ${signature}`
    );

    return {
      success: true,
      signature,
      amount,
      recipient: recipientAddress,
      timestamp,
    };
  } catch (error) {
    // Sanitize error message to prevent leaking sensitive data
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      // Filter out any potential key-related error details
      errorMessage = error.message
        .replace(/[1-9A-HJ-NP-Za-km-z]{32,}/g, '[REDACTED_KEY]')
        .replace(/\[[\d,\s]{100,}\]/g, '[REDACTED_ARRAY]');
    }
    console.error(`[Rewards] ✗ Failed to send reward:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      amount,
      recipient: recipientAddress,
      timestamp,
    };
  }
}

/**
 * Queues a reward for later processing
 * Useful when you want to batch rewards or handle failures gracefully
 * 
 * @param walletAddress - Recipient wallet address
 * @param amount - Reward amount in token units
 * @param barrelNumber - Associated barrel number
 */
export function queueReward(
  walletAddress: string,
  amount: number,
  barrelNumber: number
): void {
  pendingRewards.push({
    walletAddress,
    amount,
    barrelNumber,
    queuedAt: new Date(),
    retryCount: 0,
  });
  
  console.log(
    `[Rewards] Queued ${amount.toLocaleString()} ${TOKEN_CONFIG.SYMBOL} ` +
    `for ${walletAddress.slice(0, 8)}... (barrel #${barrelNumber})`
  );
}

/**
 * Processes all pending rewards in the queue
 * Failed rewards are re-queued with incremented retry count
 * 
 * @param maxRetries - Maximum retry attempts before discarding (default: 3)
 * @returns Array of transfer results
 */
export async function processPendingRewards(
  maxRetries = 3
): Promise<RewardTransferResult[]> {
  const results: RewardTransferResult[] = [];
  const failedRewards: PendingReward[] = [];

  console.log(`[Rewards] Processing ${pendingRewards.length} pending rewards...`);

  while (pendingRewards.length > 0) {
    const reward = pendingRewards.shift()!;
    
    const result = await sendReward(
      reward.walletAddress,
      reward.amount,
      reward.barrelNumber
    );

    results.push(result);

    if (!result.success && reward.retryCount < maxRetries) {
      failedRewards.push({
        ...reward,
        retryCount: reward.retryCount + 1,
      });
    }

    // Small delay between transactions to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Re-queue failed rewards
  pendingRewards.push(...failedRewards);

  if (failedRewards.length > 0) {
    console.log(`[Rewards] ${failedRewards.length} rewards re-queued for retry`);
  }

  return results;
}

/**
 * Gets the current reward pool balance
 * 
 * @returns Balance in token units
 */
export async function getRewardPoolBalance(): Promise<number> {
  try {
    const payer = loadRewardWalletKeypair();
    const connection = createConnection();
    const mint = new PublicKey(TOKEN_CONFIG.MINT_ADDRESS);
    const sourceATA = await getAssociatedTokenAddress(mint, payer.publicKey);
    
    const account = await getAccount(connection, sourceATA);
    return Number(account.amount) / Math.pow(10, TOKEN_CONFIG.DECIMALS);
  } catch (error) {
    // Log error without potentially sensitive details
    const safeMessage = error instanceof Error 
      ? error.message.replace(/[1-9A-HJ-NP-Za-km-z]{32,}/g, '[ADDR]')
      : 'Unknown error';
    console.error('[Rewards] Failed to get pool balance:', safeMessage);
    return 0;
  }
}

/**
 * Gets the number of pending rewards in the queue
 * 
 * @returns Count of pending rewards
 */
export function getPendingRewardCount(): number {
  return pendingRewards.length;
}

/**
 * Gets details of all pending rewards
 * 
 * @returns Array of pending reward info
 */
export function getPendingRewards(): Array<{
  wallet: string;
  amount: number;
  barrelNumber: number;
  retryCount: number;
}> {
  return pendingRewards.map((r) => ({
    wallet: `${r.walletAddress.slice(0, 8)}...${r.walletAddress.slice(-4)}`,
    amount: r.amount,
    barrelNumber: r.barrelNumber,
    retryCount: r.retryCount,
  }));
}

/**
 * Clears all pending rewards (use with caution)
 */
export function clearPendingRewards(): void {
  const count = pendingRewards.length;
  pendingRewards.length = 0;
  console.log(`[Rewards] Cleared ${count} pending rewards`);
}

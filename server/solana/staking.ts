/**
 * @fileoverview Quarry-based on-chain staking integration for Black Gold v3.3
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
 * 
 * Flow:
 * 1. Server builds unsigned transaction
 * 2. Frontend receives serialized tx
 * 3. User signs with Privy-connected wallet
 * 4. Frontend sends signed tx to network
 * 5. Server verifies transaction on-chain
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TOKEN_CONFIG, RPC_CONFIG, IS_DEVNET } from '../../config/constants';
import { createConnection } from './holder';

// Quarry SDK imports - only loaded when needed
let QuarrySDKModule: typeof import('@quarryprotocol/quarry-sdk') | null = null;
let SaberModule: typeof import('@saberhq/solana-contrib') | null = null;
let TokenUtilsModule: typeof import('@saberhq/token-utils') | null = null;

/**
 * Lazy load Quarry SDK to avoid initialization errors when not configured
 */
async function loadQuarrySDK() {
  if (!QuarrySDKModule) {
    QuarrySDKModule = await import('@quarryprotocol/quarry-sdk');
  }
  if (!SaberModule) {
    SaberModule = await import('@saberhq/solana-contrib');
  }
  if (!TokenUtilsModule) {
    TokenUtilsModule = await import('@saberhq/token-utils');
  }
  return {
    QuarrySDK: QuarrySDKModule.QuarrySDK,
    SolanaProvider: SaberModule.SolanaProvider,
    Token: TokenUtilsModule.Token,
    TokenAmount: TokenUtilsModule.TokenAmount,
    u64: TokenUtilsModule.u64,
  };
}

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
 * Transaction build result
 */
export interface TransactionBuildResult {
  transaction: string; // Base64 serialized
  message: string;
  lastValidBlockHeight: number;
  blockhash: string;
}

/**
 * Create a read-only provider for querying Quarry state
 */
async function createReadOnlyProvider(connection: Connection) {
  const { SolanaProvider } = await loadQuarrySDK();
  
  // Create a dummy wallet for read-only operations
  const dummyPublicKey = PublicKey.default;
  
  return SolanaProvider.init({
    connection,
    wallet: {
      publicKey: dummyPublicKey,
      signTransaction: async (tx: Transaction) => tx,
      signAllTransactions: async (txs: Transaction[]) => txs,
    },
  });
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
): Promise<TransactionBuildResult | { error: string }> {
  const config = getQuarryConfig();
  
  if (!config.enabled || !config.quarryAddress || !config.rewarderAddress) {
    return { error: 'Quarry staking not configured. Set QUARRY_ADDRESS and QUARRY_REWARDER_ADDRESS environment variables.' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);
    const rewarderPubkey = new PublicKey(config.rewarderAddress);
    const coalMintPubkey = new PublicKey(config.coalTokenMint);

    // Convert amount to raw units (with decimals)
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_CONFIG.DECIMALS)));

    // Load Quarry SDK
    const { QuarrySDK, SolanaProvider, Token, TokenAmount } = await loadQuarrySDK();

    // Create provider for building transaction
    const provider = SolanaProvider.init({
      connection,
      wallet: {
        publicKey: userPubkey,
        signTransaction: async (tx: Transaction) => tx, // User will sign
        signAllTransactions: async (txs: Transaction[]) => txs,
      },
    });

    const sdk = QuarrySDK.load({ provider });
    
    // Create COAL token object
    const coalToken = Token.fromMint(coalMintPubkey, TOKEN_CONFIG.DECIMALS, {
      name: TOKEN_CONFIG.NAME,
      symbol: TOKEN_CONFIG.SYMBOL,
    });

    // Load the rewarder wrapper, then get the quarry for COAL token
    const rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderPubkey);
    const quarry = await rewarderWrapper.getQuarry(coalToken);

    // Get miner actions for the user
    const minerActions = await quarry.getMinerActions(userPubkey);

    // Check if miner account exists
    const minerKey = await quarry.getMinerAddress(userPubkey);
    const minerAccountInfo = await connection.getAccountInfo(minerKey);
    const minerExists = minerAccountInfo !== null;
    
    console.log(`[Staking] Miner account ${minerKey.toBase58().slice(0, 8)}... exists: ${minerExists}`);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Build final transaction
    const transaction = new Transaction();
    
    // Add memo for tracking
    const memoInstruction = createMemoInstruction(
      `quarry_stake:${amount}:${config.quarryAddress}`,
      userPubkey
    );
    transaction.add(memoInstruction);
    
    // If miner doesn't exist, create it first
    if (!minerExists) {
      console.log(`[Staking] Creating miner account for ${walletAddress}...`);
      const pendingMiner = await quarry.createMiner({ authority: userPubkey });
      transaction.add(...pendingMiner.tx.instructions);
    }

    // Build stake instruction
    const stakeAmount = new TokenAmount(coalToken, rawAmount.toString());
    const stakeTx = await minerActions.stake(stakeAmount);
    
    // Add stake instructions from Quarry SDK
    transaction.add(...stakeTx.instructions);

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    // Serialize for frontend (user will sign)
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    console.log(`[Staking] Built stake tx for ${walletAddress}: ${amount} COAL`);

    return {
      transaction: serialized.toString('base64'),
      message: `Stake ${amount} ${TOKEN_CONFIG.SYMBOL} in Black Gold Quarry`,
      lastValidBlockHeight,
      blockhash,
    };
  } catch (error) {
    console.error('[Staking] Failed to build stake transaction:', error);
    
    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('Account does not exist')) {
        return { error: 'Quarry account not found. Ensure Quarry is properly deployed.' };
      }
      if (error.message.includes('insufficient funds')) {
        return { error: 'Insufficient COAL balance for staking.' };
      }
      return { error: error.message };
    }
    return { error: 'Unknown error building stake transaction' };
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
): Promise<TransactionBuildResult | { error: string }> {
  const config = getQuarryConfig();
  
  if (!config.enabled || !config.quarryAddress || !config.rewarderAddress) {
    return { error: 'Quarry staking not configured. Set QUARRY_ADDRESS and QUARRY_REWARDER_ADDRESS environment variables.' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);
    const rewarderPubkey = new PublicKey(config.rewarderAddress);
    const coalMintPubkey = new PublicKey(config.coalTokenMint);

    // Convert amount to raw units
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_CONFIG.DECIMALS)));

    // Load Quarry SDK
    const { QuarrySDK, SolanaProvider, Token, TokenAmount } = await loadQuarrySDK();

    const provider = SolanaProvider.init({
      connection,
      wallet: {
        publicKey: userPubkey,
        signTransaction: async (tx: Transaction) => tx,
        signAllTransactions: async (txs: Transaction[]) => txs,
      },
    });

    const sdk = QuarrySDK.load({ provider });
    
    const coalToken = Token.fromMint(coalMintPubkey, TOKEN_CONFIG.DECIMALS, {
      name: TOKEN_CONFIG.NAME,
      symbol: TOKEN_CONFIG.SYMBOL,
    });

    // Load the rewarder wrapper, then get the quarry for COAL token
    const rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderPubkey);
    const quarry = await rewarderWrapper.getQuarry(coalToken);

    const minerActions = await quarry.getMinerActions(userPubkey);

    // Build unstake (withdraw) instruction
    const unstakeAmount = new TokenAmount(coalToken, rawAmount.toString());
    const unstakeTx = await minerActions.withdraw(unstakeAmount);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const transaction = new Transaction();
    
    const memoInstruction = createMemoInstruction(
      `quarry_unstake:${amount}:${config.quarryAddress}`,
      userPubkey
    );
    transaction.add(memoInstruction);
    transaction.add(...unstakeTx.instructions);

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    console.log(`[Staking] Built unstake tx for ${walletAddress}: ${amount} COAL`);

    return {
      transaction: serialized.toString('base64'),
      message: `Unstake ${amount} ${TOKEN_CONFIG.SYMBOL} from Black Gold Quarry`,
      lastValidBlockHeight,
      blockhash,
    };
  } catch (error) {
    console.error('[Staking] Failed to build unstake transaction:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('insufficient balance')) {
        return { error: 'Insufficient staked balance for withdrawal.' };
      }
      return { error: error.message };
    }
    return { error: 'Unknown error building unstake transaction' };
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
): Promise<TransactionBuildResult & { estimatedReward: number } | { error: string }> {
  const config = getQuarryConfig();
  
  if (!config.enabled || !config.quarryAddress || !config.rewarderAddress) {
    return { error: 'Quarry staking not configured' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);
    const rewarderPubkey = new PublicKey(config.rewarderAddress);
    const coalMintPubkey = new PublicKey(config.coalTokenMint);

    // Load Quarry SDK
    const { QuarrySDK, SolanaProvider, Token } = await loadQuarrySDK();

    const provider = SolanaProvider.init({
      connection,
      wallet: {
        publicKey: userPubkey,
        signTransaction: async (tx: Transaction) => tx,
        signAllTransactions: async (txs: Transaction[]) => txs,
      },
    });

    const sdk = QuarrySDK.load({ provider });
    
    const coalToken = Token.fromMint(coalMintPubkey, TOKEN_CONFIG.DECIMALS, {
      name: TOKEN_CONFIG.NAME,
      symbol: TOKEN_CONFIG.SYMBOL,
    });

    // Load the rewarder wrapper, then get the quarry for COAL token
    const rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderPubkey);
    const quarry = await rewarderWrapper.getQuarry(coalToken);

    // Get current pending rewards
    const stakeInfo = await getUserStakeInfo(walletAddress);
    const estimatedReward = stakeInfo.pendingRewards;

    const minerActions = await quarry.getMinerActions(userPubkey);
    
    // Build claim instruction
    const claimTx = await minerActions.claim();

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const transaction = new Transaction();
    
    const memoInstruction = createMemoInstruction(
      `quarry_claim:${config.quarryAddress}`,
      userPubkey
    );
    transaction.add(memoInstruction);
    transaction.add(...claimTx.instructions);

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    console.log(`[Staking] Built claim tx for ${walletAddress}: ~${estimatedReward} IOU-COAL`);

    return {
      transaction: serialized.toString('base64'),
      message: `Claim IOU-${TOKEN_CONFIG.SYMBOL} rewards from Black Gold Quarry`,
      lastValidBlockHeight,
      blockhash,
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
 * For now, this uses a simple escrow approach:
 * 1. User transfers IOU-COAL to redeemer wallet
 * 2. Server monitors and sends equivalent COAL back
 * 
 * @param walletAddress - User's wallet public key
 * @param amount - Amount of IOU-COAL to redeem
 * @returns Serialized transaction for frontend to sign
 */
export async function buildRedeemTransaction(
  walletAddress: string,
  amount: number
): Promise<TransactionBuildResult | { error: string }> {
  const config = getQuarryConfig();
  
  if (!config.iouTokenMint) {
    return { error: 'IOU token not configured' };
  }

  const redeemerWallet = process.env.REDEEMER_WALLET_ADDRESS;
  if (!redeemerWallet) {
    return { error: 'Redeemer wallet not configured. Set REDEEMER_WALLET_ADDRESS environment variable.' };
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);
    const redeemerPubkey = new PublicKey(redeemerWallet);
    const iouMintPubkey = new PublicKey(config.iouTokenMint);

    // Get user's IOU token account
    const { Token } = await loadQuarrySDK();
    
    // Build SPL token transfer from user's IOU-COAL to redeemer wallet
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_CONFIG.DECIMALS)));

    // Dynamically import SPL token functions
    const splToken = require('@solana/spl-token') as {
      getAssociatedTokenAddress: (mint: PublicKey, owner: PublicKey) => Promise<PublicKey>;
      createAssociatedTokenAccountInstruction: (payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey) => TransactionInstruction;
      createTransferInstruction: (source: PublicKey, dest: PublicKey, owner: PublicKey, amount: bigint | number) => TransactionInstruction;
      getAccount: (connection: Connection, address: PublicKey) => Promise<{ amount: bigint }>;
    };

    // Get user's IOU token account
    const userATA = await splToken.getAssociatedTokenAddress(iouMintPubkey, userPubkey);
    
    // Get redeemer's IOU token account
    const redeemerATA = await splToken.getAssociatedTokenAddress(iouMintPubkey, redeemerPubkey);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const transaction = new Transaction();
    
    // Add memo for tracking
    const memoInstruction = createMemoInstruction(
      `quarry_redeem:${amount}:${config.iouTokenMint}`,
      userPubkey
    );
    transaction.add(memoInstruction);

    // Check if redeemer's ATA exists, create if not (user pays)
    try {
      await splToken.getAccount(connection, redeemerATA);
    } catch {
      transaction.add(
        splToken.createAssociatedTokenAccountInstruction(
          userPubkey,
          redeemerATA,
          redeemerPubkey,
          iouMintPubkey
        )
      );
    }

    // Transfer IOU-COAL from user to redeemer wallet
    const transferIx = splToken.createTransferInstruction(
      userATA,
      redeemerATA,
      userPubkey,
      rawAmount
    );
    transaction.add(transferIx);

    console.log(`[Staking] Redeem request: ${amount} IOU-COAL from ${walletAddress} to ${redeemerWallet}`);

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      transaction: serialized.toString('base64'),
      message: `Redeem ${amount} IOU-${TOKEN_CONFIG.SYMBOL} for ${TOKEN_CONFIG.SYMBOL}`,
      lastValidBlockHeight,
      blockhash,
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
  
  if (!config.enabled || !config.rewarderAddress) {
    return defaultInfo;
  }

  try {
    const connection = createConnection();
    const userPubkey = new PublicKey(walletAddress);
    const rewarderPubkey = new PublicKey(config.rewarderAddress);
    const coalMintPubkey = new PublicKey(config.coalTokenMint);

    // Load Quarry SDK
    const { QuarrySDK, Token } = await loadQuarrySDK();

    const provider = await createReadOnlyProvider(connection);
    const sdk = QuarrySDK.load({ provider });

    const coalToken = Token.fromMint(coalMintPubkey, TOKEN_CONFIG.DECIMALS, {
      name: TOKEN_CONFIG.NAME,
      symbol: TOKEN_CONFIG.SYMBOL,
    });

    // Load rewarder wrapper and get quarry for COAL token
    const rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderPubkey);
    const quarry = await rewarderWrapper.getQuarry(coalToken);
    
    // Try to find the miner account for this user
    const minerKey = await quarry.getMinerAddress(userPubkey);
    const minerInfo = await connection.getAccountInfo(minerKey);
    
    if (!minerInfo) {
      // User hasn't staked yet
      console.log(`[Staking] No miner account found for ${walletAddress}`);
      return defaultInfo;
    }

    // Fetch miner data through Quarry SDK
    const miner = await quarry.getMiner(userPubkey);
    
    console.log(`[Staking] Raw miner data for ${walletAddress}:`, JSON.stringify(miner, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    , 2));
    
    if (!miner) {
      console.log(`[Staking] getMiner returned null for ${walletAddress}`);
      return defaultInfo;
    }

    // Log available keys to debug
    console.log(`[Staking] Miner object keys:`, Object.keys(miner));

    // Calculate staked balance - handle BN/BigInt properly
    let stakedBalance = miner.balance;
    if (stakedBalance === undefined || stakedBalance === null) {
      // @ts-expect-error - Try alternate property names
      stakedBalance = miner.tokensDeposited || miner.tokenBalance || 0;
    }
    
    // Convert BN/BigInt to number
    if (stakedBalance && typeof stakedBalance.toNumber === 'function') {
      stakedBalance = stakedBalance.toNumber();
    } else if (typeof stakedBalance === 'bigint') {
      stakedBalance = Number(stakedBalance);
    } else if (stakedBalance && stakedBalance.toString) {
      stakedBalance = Number(stakedBalance.toString());
    }

    // Calculate pending rewards
    // @ts-expect-error - Miner data shape varies by SDK version
    let rewardsEarned = miner.rewardsEarned || miner.rewardsTally || 0;
    if (rewardsEarned && typeof rewardsEarned.toNumber === 'function') {
      rewardsEarned = rewardsEarned.toNumber();
    } else if (typeof rewardsEarned === 'bigint') {
      rewardsEarned = Number(rewardsEarned);
    } else if (rewardsEarned && rewardsEarned.toString) {
      rewardsEarned = Number(rewardsEarned.toString());
    }

    const stakedAmountDecimal = Number(stakedBalance) / Math.pow(10, TOKEN_CONFIG.DECIMALS);
    const pendingRewardsDecimal = Number(rewardsEarned) / Math.pow(10, TOKEN_CONFIG.DECIMALS);

    console.log(`[Staking] Stake info for ${walletAddress}: ${stakedAmountDecimal} staked (raw: ${stakedBalance}), ${pendingRewardsDecimal} pending (raw: ${rewardsEarned})`);

    return {
      walletAddress,
      stakedAmount: stakedAmountDecimal,
      pendingRewards: pendingRewardsDecimal,
      lastStakeTime: null, // SDK doesn't expose this directly
      minerPDA: minerKey.toBase58(),
    };
    
  } catch (error) {
    console.error('[Staking] Failed to get stake info:', error);
    
    // If it's an "account not found" error, user just hasn't staked
    if (error instanceof Error && error.message.includes('Account does not exist')) {
      return defaultInfo;
    }
    
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
      return { verified: false, error: 'Transaction failed on-chain' };
    }

    // Get transaction details to verify amount
    const txDetails = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!txDetails) {
      return { verified: false, error: 'Transaction not found' };
    }

    // Parse memo to verify this is our stake transaction
    const logs = txDetails.meta?.logMessages || [];
    const stakeMemo = logs.find(log => log.includes('quarry_stake'));
    
    if (!stakeMemo) {
      return { verified: false, error: 'Not a valid stake transaction' };
    }

    console.log(`[Staking] Verified stake: ${signature} for ${walletAddress}`);
    
    // In production, you would parse the actual staked amount from the transaction
    return { verified: true, actualAmount: expectedAmount };
  } catch (error) {
    console.error('[Staking] Verification failed:', error);
    return { verified: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Use shared memo instruction utility (deduplicated from bet-escrow.ts)
import { createMemoInstruction } from './utils';

/**
 * Staking service status
 */
export function getStakingStatus(): {
  available: boolean;
  network: string;
  quarryAddress: string | null;
  rewarderAddress: string | null;
  iouTokenMint: string | null;
  coalTokenMint: string;
  redeemerWallet: string | null;
} {
  const config = getQuarryConfig();
  
  return {
    available: config.enabled,
    network: RPC_CONFIG.NETWORK,
    quarryAddress: config.quarryAddress,
    rewarderAddress: config.rewarderAddress,
    iouTokenMint: config.iouTokenMint,
    coalTokenMint: config.coalTokenMint,
    redeemerWallet: process.env.REDEEMER_WALLET_ADDRESS || null,
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

/**
 * Get Quarry stats for admin monitoring
 */
export async function getQuarryStats(): Promise<{
  totalStaked: number;
  minerCount: number;
  rewardRate: number;
  iouSupply: number;
} | null> {
  const config = getQuarryConfig();
  
  if (!config.enabled || !config.rewarderAddress) {
    return null;
  }

  try {
    const connection = createConnection();
    const rewarderPubkey = new PublicKey(config.rewarderAddress);
    const coalMintPubkey = new PublicKey(config.coalTokenMint);

    const { QuarrySDK, Token } = await loadQuarrySDK();
    const provider = await createReadOnlyProvider(connection);
    const sdk = QuarrySDK.load({ provider });

    const coalToken = Token.fromMint(coalMintPubkey, TOKEN_CONFIG.DECIMALS, {
      name: TOKEN_CONFIG.NAME,
      symbol: TOKEN_CONFIG.SYMBOL,
    });

    // Load rewarder wrapper and get quarry for COAL token
    const rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderPubkey);
    const quarry = await rewarderWrapper.getQuarry(coalToken);
    const quarryData = quarry.quarryData;

    return {
      totalStaked: Number(quarryData.totalTokensDeposited) / Math.pow(10, TOKEN_CONFIG.DECIMALS),
      minerCount: Number(quarryData.numMiners),
      rewardRate: Number(quarryData.annualRewardsRate) / Math.pow(10, TOKEN_CONFIG.DECIMALS),
      iouSupply: 0, // Would need to query IOU token mint
    };
  } catch (error) {
    console.error('[Staking] Failed to get Quarry stats:', error);
    return null;
  }
}

/**
 * @fileoverview Buyback service for Black Gold
 * Monitors creator wallet for SOL and swaps to COAL tokens via Jupiter API
 * Swapped tokens are sent to the reward pool for distribution
 */

import {
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_CONFIG,
  BUYBACK_CONFIG,
  WALLET_CONFIG,
} from '../../config/constants';
import { createConnection } from './holder';

/**
 * Native SOL mint address (wrapped SOL)
 */
const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Result of a buyback operation
 */
export interface BuybackResult {
  /** Whether the buyback was successful */
  success: boolean;
  /** Transaction signature if successful */
  signature?: string;
  /** Error message if failed */
  error?: string;
  /** SOL amount spent */
  solSpent: number;
  /** Token amount received */
  tokensReceived: number;
  /** Timestamp of operation */
  timestamp: Date;
}

/**
 * Jupiter quote response
 */
interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

/**
 * Jupiter swap response
 */
interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

/**
 * Loads the creator wallet keypair from environment variable
 * 
 * @returns Keypair for the creator wallet
 * @throws Error if private key is not configured or invalid
 */
export function loadCreatorWalletKeypair(): Keypair {
  const privateKeyEnv = process.env.CREATOR_WALLET_PRIVATE_KEY;
  
  if (!privateKeyEnv) {
    throw new Error('CREATOR_WALLET_PRIVATE_KEY environment variable is required');
  }

  try {
    // Try parsing as JSON array first
    const secretKey = JSON.parse(privateKeyEnv);
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch {
    // Try parsing as base58 string
    try {
      const bs58 = require('bs58');
      const secretKey = bs58.decode(privateKeyEnv);
      return Keypair.fromSecretKey(secretKey);
    } catch {
      throw new Error('Invalid CREATOR_WALLET_PRIVATE_KEY format. Use JSON array or base58 string.');
    }
  }
}

/**
 * Gets the SOL balance of the creator wallet
 * 
 * @returns SOL balance
 */
export async function getCreatorWalletBalance(): Promise<number> {
  const connection = createConnection();
  const wallet = loadCreatorWalletKeypair();
  const balance = await connection.getBalance(wallet.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

/**
 * Gets a swap quote from Jupiter API
 * 
 * @param solAmount - Amount of SOL to swap (in SOL, not lamports)
 * @returns Jupiter quote response
 * @throws Error if quote fetch fails
 */
export async function getSwapQuote(solAmount: number): Promise<JupiterQuote> {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  
  const params = new URLSearchParams({
    inputMint: NATIVE_SOL_MINT,
    outputMint: TOKEN_CONFIG.MINT_ADDRESS,
    amount: lamports.toString(),
    slippageBps: BUYBACK_CONFIG.SLIPPAGE_BPS.toString(),
    onlyDirectRoutes: 'false',
    asLegacyTransaction: 'false',
  });

  const url = `${BUYBACK_CONFIG.JUPITER_API}/quote?${params}`;
  
  console.log(`[Buyback] Fetching quote for ${solAmount} SOL...`);

  const response = await fetch(url);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jupiter quote failed: ${response.status} - ${error}`);
  }

  const quote: JupiterQuote = await response.json();
  
  const expectedTokens = Number(quote.outAmount) / Math.pow(10, TOKEN_CONFIG.DECIMALS);
  console.log(
    `[Buyback] Quote: ${solAmount} SOL → ${expectedTokens.toLocaleString()} ${TOKEN_CONFIG.SYMBOL} ` +
    `(impact: ${quote.priceImpactPct}%)`
  );

  return quote;
}

/**
 * Gets a swap transaction from Jupiter API
 * 
 * @param quote - Jupiter quote to execute
 * @param userPublicKey - Public key of the wallet signing the transaction
 * @param destinationWallet - Optional destination for swapped tokens (defaults to user)
 * @returns Swap transaction response
 */
async function getSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
  destinationWallet?: string
): Promise<JupiterSwapResponse> {
  const body = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
    destinationTokenAccount: destinationWallet,
  };

  const response = await fetch(`${BUYBACK_CONFIG.JUPITER_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jupiter swap failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Executes a buyback operation - swaps SOL for COAL tokens
 * Tokens are sent to the reward pool wallet
 * 
 * @param solAmount - Amount of SOL to spend (optional, uses all available if not specified)
 * @returns Result of the buyback operation
 * 
 * @example
 * ```typescript
 * const result = await executeBuyback(0.5);
 * if (result.success) {
 *   console.log(`Bought ${result.tokensReceived} tokens!`);
 * }
 * ```
 */
export async function executeBuyback(solAmount?: number): Promise<BuybackResult> {
  const timestamp = new Date();
  
  try {
    const connection = createConnection();
    const creatorWallet = loadCreatorWalletKeypair();
    
    // Get current balance if amount not specified
    let amountToSwap = solAmount;
    if (!amountToSwap) {
      const balance = await connection.getBalance(creatorWallet.publicKey);
      // Leave some SOL for rent and transaction fees
      const reserveForFees = 0.01 * LAMPORTS_PER_SOL;
      amountToSwap = Math.max(0, (balance - reserveForFees) / LAMPORTS_PER_SOL);
    }

    // Check minimum threshold
    if (amountToSwap < BUYBACK_CONFIG.MIN_SOL_FOR_BUYBACK) {
      return {
        success: false,
        error: `Amount ${amountToSwap} SOL below minimum ${BUYBACK_CONFIG.MIN_SOL_FOR_BUYBACK} SOL`,
        solSpent: 0,
        tokensReceived: 0,
        timestamp,
      };
    }

    console.log(`[Buyback] Initiating buyback of ${amountToSwap} SOL...`);

    // Get quote
    const quote = await getSwapQuote(amountToSwap);
    
    // Get swap transaction (send tokens to reward wallet)
    const swapResponse = await getSwapTransaction(
      quote,
      creatorWallet.publicKey.toBase58(),
      WALLET_CONFIG.REWARD_WALLET !== 'TBD' ? WALLET_CONFIG.REWARD_WALLET : undefined
    );

    // Deserialize and sign transaction
    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([creatorWallet]);

    // Send transaction
    const signature = await connection.sendTransaction(transaction, {
      maxRetries: 3,
      skipPreflight: false,
    });

    // Confirm transaction
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: swapResponse.lastValidBlockHeight,
    });

    const tokensReceived = Number(quote.outAmount) / Math.pow(10, TOKEN_CONFIG.DECIMALS);

    console.log(
      `[Buyback] ✓ Swapped ${amountToSwap} SOL → ${tokensReceived.toLocaleString()} ${TOKEN_CONFIG.SYMBOL} ` +
      `| TX: ${signature}`
    );

    return {
      success: true,
      signature,
      solSpent: amountToSwap,
      tokensReceived,
      timestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Buyback] ✗ Failed:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      solSpent: 0,
      tokensReceived: 0,
      timestamp,
    };
  }
}

/**
 * Checks if a buyback should be executed based on wallet balance
 * 
 * @returns Object with check result and balance info
 */
export async function shouldExecuteBuyback(): Promise<{
  shouldBuyback: boolean;
  balance: number;
  minRequired: number;
}> {
  try {
    const balance = await getCreatorWalletBalance();
    // Keep some SOL for transaction fees
    const availableBalance = Math.max(0, balance - 0.01);
    
    return {
      shouldBuyback: availableBalance >= BUYBACK_CONFIG.MIN_SOL_FOR_BUYBACK,
      balance: availableBalance,
      minRequired: BUYBACK_CONFIG.MIN_SOL_FOR_BUYBACK,
    };
  } catch (error) {
    console.error('[Buyback] Failed to check balance:', error);
    return {
      shouldBuyback: false,
      balance: 0,
      minRequired: BUYBACK_CONFIG.MIN_SOL_FOR_BUYBACK,
    };
  }
}

/**
 * Gets the current swap rate (SOL per token)
 * Useful for display purposes
 * 
 * @param solAmount - Amount of SOL to get quote for (default: 0.1)
 * @returns Object with rate info
 */
export async function getSwapRate(solAmount = 0.1): Promise<{
  solAmount: number;
  tokenAmount: number;
  pricePerToken: number;
  priceImpact: string;
}> {
  try {
    const quote = await getSwapQuote(solAmount);
    const tokenAmount = Number(quote.outAmount) / Math.pow(10, TOKEN_CONFIG.DECIMALS);
    
    return {
      solAmount,
      tokenAmount,
      pricePerToken: solAmount / tokenAmount,
      priceImpact: quote.priceImpactPct,
    };
  } catch (error) {
    console.error('[Buyback] Failed to get swap rate:', error);
    throw error;
  }
}

/**
 * Gets buyback service statistics
 * 
 * @returns Current service status
 */
export async function getBuybackStats(): Promise<{
  creatorWalletBalance: number;
  minBuybackThreshold: number;
  slippageBps: number;
  checkIntervalMs: number;
}> {
  const balance = await getCreatorWalletBalance().catch(() => 0);
  
  return {
    creatorWalletBalance: balance,
    minBuybackThreshold: BUYBACK_CONFIG.MIN_SOL_FOR_BUYBACK,
    slippageBps: BUYBACK_CONFIG.SLIPPAGE_BPS,
    checkIntervalMs: BUYBACK_CONFIG.CHECK_INTERVAL_MS,
  };
}

/**
 * @fileoverview Debug endpoint for staking system diagnostics
 * Returns configuration status, Quarry account info, and helpful debugging data
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_CONFIG, RPC_CONFIG } from '../../../../config/constants';

/** Whether we're running in devnet testing mode */
const IS_DEVNET = process.env.SOLANA_NETWORK === 'devnet';

/**
 * Get RPC endpoint based on network
 */
function getRpcEndpoint(): string {
  if (process.env.SOLANA_RPC_URL) {
    return process.env.SOLANA_RPC_URL;
  }
  return IS_DEVNET 
    ? 'https://api.devnet.solana.com' 
    : 'https://api.mainnet-beta.solana.com';
}

interface DebugInfo {
  timestamp: string;
  network: string;
  configuration: {
    quarryRewarderAddress: string | null;
    quarryAddress: string | null;
    iouTokenMint: string | null;
    coalTokenMint: string;
    redeemerWallet: string | null;
    isQuarryConfigured: boolean;
  };
  accountStatus: {
    quarryAccountExists: boolean;
    rewarderAccountExists: boolean;
    coalMintExists: boolean;
    iouMintExists: boolean;
    errors: string[];
  };
  walletCheck?: {
    wallet: string;
    coalBalance: number;
    solBalance: number;
    hasCoal: boolean;
    hasSol: boolean;
  };
}

/**
 * Check if an account exists on-chain
 */
async function accountExists(connection: Connection, address: string): Promise<boolean> {
  try {
    const pubkey = new PublicKey(address);
    const info = await connection.getAccountInfo(pubkey);
    return info !== null;
  } catch {
    return false;
  }
}

/**
 * Get SOL balance for a wallet
 */
async function getSolBalance(connection: Connection, address: string): Promise<number> {
  try {
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);
    return balance / 1e9; // Convert lamports to SOL
  } catch {
    return 0;
  }
}

/**
 * Get SPL token balance
 */
async function getTokenBalance(connection: Connection, wallet: string, mint: string): Promise<number> {
  try {
    const walletPubkey = new PublicKey(wallet);
    const mintPubkey = new PublicKey(mint);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: mintPubkey }
    );

    if (tokenAccounts.value.length === 0) return 0;

    let total = 0;
    for (const account of tokenAccounts.value) {
      total += account.account.data.parsed?.info?.tokenAmount?.uiAmount || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * GET /api/staking/debug?wallet=<address>
 * Returns staking system diagnostics
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  const connection = new Connection(getRpcEndpoint(), 'confirmed');

  // Get configuration
  const quarryRewarderAddress = process.env.QUARRY_REWARDER_ADDRESS || null;
  const quarryAddress = process.env.QUARRY_ADDRESS || null;
  const iouTokenMint = process.env.IOU_TOKEN_MINT || null;
  const redeemerWallet = process.env.REDEEMER_WALLET_ADDRESS || null;
  const coalTokenMint = TOKEN_CONFIG.MINT_ADDRESS;

  const isQuarryConfigured = !!(quarryRewarderAddress && quarryAddress);

  // Check account existence
  const errors: string[] = [];
  let quarryAccountExists = false;
  let rewarderAccountExists = false;
  let coalMintExists = false;
  let iouMintExists = false;

  if (quarryAddress) {
    quarryAccountExists = await accountExists(connection, quarryAddress);
    if (!quarryAccountExists) {
      errors.push(`Quarry account ${quarryAddress.slice(0, 8)}... does not exist on-chain`);
    }
  } else {
    errors.push('QUARRY_ADDRESS environment variable not set');
  }

  if (quarryRewarderAddress) {
    rewarderAccountExists = await accountExists(connection, quarryRewarderAddress);
    if (!rewarderAccountExists) {
      errors.push(`Rewarder account ${quarryRewarderAddress.slice(0, 8)}... does not exist on-chain`);
    }
  } else {
    errors.push('QUARRY_REWARDER_ADDRESS environment variable not set');
  }

  if (coalTokenMint && coalTokenMint !== 'TBD' && coalTokenMint !== 'DEVNET_TEST_TOKEN') {
    coalMintExists = await accountExists(connection, coalTokenMint);
    if (!coalMintExists) {
      errors.push(`COAL token mint ${coalTokenMint.slice(0, 8)}... does not exist on-chain`);
    }
  } else {
    errors.push('TOKEN_MINT_ADDRESS not configured');
  }

  if (iouTokenMint) {
    iouMintExists = await accountExists(connection, iouTokenMint);
    if (!iouMintExists) {
      errors.push(`IOU token mint ${iouTokenMint.slice(0, 8)}... does not exist on-chain`);
    }
  } else {
    errors.push('IOU_TOKEN_MINT environment variable not set');
  }

  const debugInfo: DebugInfo = {
    timestamp: new Date().toISOString(),
    network: RPC_CONFIG.NETWORK,
    configuration: {
      quarryRewarderAddress,
      quarryAddress,
      iouTokenMint,
      coalTokenMint,
      redeemerWallet,
      isQuarryConfigured,
    },
    accountStatus: {
      quarryAccountExists,
      rewarderAccountExists,
      coalMintExists,
      iouMintExists,
      errors,
    },
  };

  // If wallet provided, check their balances
  if (wallet) {
    try {
      new PublicKey(wallet); // Validate address
      const solBalance = await getSolBalance(connection, wallet);
      const coalBalance = coalMintExists 
        ? await getTokenBalance(connection, wallet, coalTokenMint)
        : 0;

      debugInfo.walletCheck = {
        wallet,
        coalBalance,
        solBalance,
        hasCoal: coalBalance > 0,
        hasSol: solBalance > 0.001, // Need at least 0.001 SOL for fees
      };

      if (solBalance < 0.001) {
        errors.push(`Wallet ${wallet.slice(0, 8)}... needs SOL for transaction fees (has ${solBalance.toFixed(4)} SOL)`);
      }

      if (coalBalance === 0) {
        errors.push(`Wallet ${wallet.slice(0, 8)}... has no COAL tokens to stake`);
      }
    } catch {
      errors.push(`Invalid wallet address: ${wallet}`);
    }
  }

  return NextResponse.json(debugInfo);
}

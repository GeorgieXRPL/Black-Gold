/**
 * @fileoverview API route for fetching wallet token balance
 * Returns the actual on-chain SPL token balance for COAL tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_CONFIG, RPC_CONFIG } from '../../../config/constants';

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

/**
 * Get the correct Helius API base URL based on network
 */
function getHeliusApiBase(): string {
  return IS_DEVNET 
    ? 'https://api-devnet.helius.xyz' 
    : 'https://api.helius.xyz';
}

/**
 * Fetch token balance using Helius API (more reliable)
 */
async function getTokenBalanceHelius(walletAddress: string, mintAddress: string): Promise<number> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    return -1; // Signal to use fallback
  }

  try {
    const baseUrl = getHeliusApiBase();
    const url = `${baseUrl}/v0/addresses/${walletAddress}/balances?api-key=${apiKey}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.warn(`[Balance] Helius API error: ${response.status}`);
      return -1;
    }

    const data = await response.json();
    
    // Find the token in balances
    const tokenBalance = data.tokens?.find(
      (t: { mint: string; amount: number }) => t.mint === mintAddress
    );

    if (tokenBalance) {
      // Helius returns raw amount, divide by decimals
      return tokenBalance.amount / Math.pow(10, TOKEN_CONFIG.DECIMALS);
    }

    return 0; // Token not found = 0 balance
  } catch (error) {
    console.error('[Balance] Helius error:', error);
    return -1;
  }
}

/**
 * Fetch token balance using direct RPC (fallback)
 */
async function getTokenBalanceRpc(walletAddress: string, mintAddress: string): Promise<number> {
  try {
    const connection = new Connection(getRpcEndpoint(), 'confirmed');
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(mintAddress);

    // Get all token accounts for this wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: mintPubkey }
    );

    if (tokenAccounts.value.length === 0) {
      return 0;
    }

    // Sum up balances from all accounts (usually just one)
    let totalBalance = 0;
    for (const account of tokenAccounts.value) {
      const balance = account.account.data.parsed?.info?.tokenAmount?.uiAmount || 0;
      totalBalance += balance;
    }

    return totalBalance;
  } catch (error) {
    console.error('[Balance] RPC error:', error);
    return 0;
  }
}

/**
 * GET /api/balance?wallet=<address>
 * Returns the wallet's COAL token balance
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 });
  }

  // Validate wallet address format
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const mintAddress = TOKEN_CONFIG.MINT_ADDRESS;

  // Check if token is configured
  if (mintAddress === 'TBD' || mintAddress === 'DEVNET_TEST_TOKEN') {
    return NextResponse.json({
      wallet,
      balance: 0,
      symbol: TOKEN_CONFIG.SYMBOL,
      network: RPC_CONFIG.NETWORK,
      error: 'Token not configured',
    });
  }

  // Try Helius first, then RPC fallback
  let balance = await getTokenBalanceHelius(wallet, mintAddress);
  
  if (balance < 0) {
    // Helius failed, use RPC fallback
    console.log('[Balance] Using RPC fallback for', wallet.slice(0, 8));
    balance = await getTokenBalanceRpc(wallet, mintAddress);
  }

  return NextResponse.json({
    wallet,
    balance,
    symbol: TOKEN_CONFIG.SYMBOL,
    mintAddress,
    network: RPC_CONFIG.NETWORK,
    decimals: TOKEN_CONFIG.DECIMALS,
  });
}

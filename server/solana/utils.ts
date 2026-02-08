/**
 * @fileoverview Shared Solana utilities for Black Gold
 * 
 * Consolidates duplicate code from staking.ts, bet-escrow.ts, rewards.ts, and buyback.ts:
 * - Memo instruction creation
 * - Keypair loading with security-hardened error handling
 * - Common SPL token helpers
 */

import {
  PublicKey,
  TransactionInstruction,
  Keypair,
} from '@solana/web3.js';

/**
 * Memo Program ID (SPL Memo v2)
 */
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/**
 * Create a memo instruction for transaction logging/tracking
 * Used by staking, bet-escrow, and reward transactions
 * 
 * @param memo - Text content for the memo
 * @param signer - Public key of the transaction signer
 * @returns TransactionInstruction for the memo
 */
export function createMemoInstruction(memo: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });
}

/**
 * Load a wallet keypair from an environment variable
 * Supports both JSON array format (Phantom export) and base58 format
 * 
 * SECURITY:
 * - Never logs key material
 * - Error messages sanitized to prevent key exposure
 * - Only use the returned Keypair for signing transactions
 * 
 * @param envVarName - Name of the environment variable containing the private key
 * @returns Keypair for the wallet
 * @throws Error if key is not configured or invalid (without exposing key data)
 */
export function loadKeypairFromEnv(envVarName: string): Keypair {
  const privateKeyEnv = process.env[envVarName];
  
  if (!privateKeyEnv) {
    throw new Error(`${envVarName} environment variable is required`);
  }

  // Validate length before attempting to parse (without logging the value)
  if (privateKeyEnv.length < 32) {
    throw new Error(`${envVarName} appears to be too short`);
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
      // Generic error message - never expose key format hints
      throw new Error(`Failed to parse ${envVarName}. Check format.`);
    }
  }
}

/**
 * Sanitize an error message to prevent leaking sensitive data
 * Redacts base58 addresses, JSON arrays, and other potential key material
 * 
 * @param error - Error to sanitize
 * @returns Sanitized error message string
 */
export function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }
  
  return error.message
    .replace(/[1-9A-HJ-NP-Za-km-z]{32,}/g, '[REDACTED_KEY]')
    .replace(/\[[\d,\s]{100,}\]/g, '[REDACTED_ARRAY]');
}

/**
 * Convert a token amount (in UI units) to raw on-chain units
 * 
 * @param amount - Amount in UI units (e.g., 100.5 COAL)
 * @param decimals - Token decimal places (e.g., 9 for COAL)
 * @returns BigInt of raw on-chain amount
 */
export function toRawAmount(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Convert raw on-chain units to UI display amount
 * 
 * @param rawAmount - Raw on-chain amount (BigInt or number)
 * @param decimals - Token decimal places
 * @returns Number in UI display units
 */
export function fromRawAmount(rawAmount: bigint | number, decimals: number): number {
  return Number(rawAmount) / Math.pow(10, decimals);
}

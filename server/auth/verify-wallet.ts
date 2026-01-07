/**
 * @fileoverview Wallet signature verification for Black Gold
 * Verifies Solana wallet signatures for authenticated actions
 */

import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Message template for signature verification
 * Includes nonce to prevent replay attacks
 */
export function createSignatureMessage(action: string, nonce: string, data?: Record<string, unknown>): string {
  const message = {
    app: 'Black Gold',
    action,
    nonce,
    timestamp: Date.now(),
    ...(data && { data }),
  };
  return JSON.stringify(message);
}

/**
 * Verify a Solana wallet signature
 * @param walletAddress - The wallet's public key as base58 string
 * @param message - The original message that was signed
 * @param signature - The signature as base64 string
 * @returns Whether the signature is valid
 */
export function verifySignature(
  walletAddress: string,
  message: string,
  signature: string
): boolean {
  try {
    // Convert wallet address to PublicKey
    const publicKey = new PublicKey(walletAddress);
    
    // Decode the signature from base64
    const signatureBytes = Buffer.from(signature, 'base64');
    
    // Encode the message
    const messageBytes = new TextEncoder().encode(message);
    
    // Verify using nacl
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
    
    console.log(`[Auth] Signature verification for ${walletAddress}: ${isValid ? 'VALID' : 'INVALID'}`);
    return isValid;
  } catch (error) {
    console.error('[Auth] Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a random nonce for signature requests
 */
export function generateNonce(): string {
  const bytes = nacl.randomBytes(32);
  return bs58.encode(bytes);
}

/**
 * Nonce store for preventing replay attacks
 * In production, use Redis or a database
 */
const nonceStore = new Map<string, { walletAddress: string; createdAt: number; used: boolean }>();

// Nonce expiry time (5 minutes)
const NONCE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Store a nonce for a wallet
 */
export function storeNonce(nonce: string, walletAddress: string): void {
  nonceStore.set(nonce, {
    walletAddress,
    createdAt: Date.now(),
    used: false,
  });
  
  // Clean up expired nonces periodically
  for (const [key, value] of nonceStore.entries()) {
    if (Date.now() - value.createdAt > NONCE_EXPIRY_MS) {
      nonceStore.delete(key);
    }
  }
}

/**
 * Validate and consume a nonce
 * Returns the wallet address if valid, null otherwise
 */
export function consumeNonce(nonce: string): string | null {
  const entry = nonceStore.get(nonce);
  
  if (!entry) {
    console.log('[Auth] Nonce not found:', nonce);
    return null;
  }
  
  if (entry.used) {
    console.log('[Auth] Nonce already used:', nonce);
    return null;
  }
  
  if (Date.now() - entry.createdAt > NONCE_EXPIRY_MS) {
    console.log('[Auth] Nonce expired:', nonce);
    nonceStore.delete(nonce);
    return null;
  }
  
  // Mark as used
  entry.used = true;
  
  return entry.walletAddress;
}

/**
 * Verify a signed action
 * Validates the signature and consumes the nonce
 */
export interface SignedAction {
  walletAddress: string;
  action: string;
  nonce: string;
  signature: string;
  data?: Record<string, unknown>;
}

export function verifySignedAction(signedAction: SignedAction): boolean {
  const { walletAddress, action, nonce, signature, data } = signedAction;
  
  // Verify the nonce belongs to this wallet
  const nonceWallet = consumeNonce(nonce);
  if (!nonceWallet || nonceWallet !== walletAddress) {
    console.log('[Auth] Invalid nonce for wallet');
    return false;
  }
  
  // Reconstruct the message and verify signature
  const message = createSignatureMessage(action, nonce, data);
  return verifySignature(walletAddress, message, signature);
}

/**
 * Action types that require wallet signature
 */
export type SignedActionType =
  | 'stake'
  | 'unstake'
  | 'set_home'
  | 'start_expedition'
  | 'leave_expedition'
  | 'syndicate_action'
  | 'claim_rewards';

/**
 * Check if an action requires wallet signature
 */
export function requiresSignature(action: string): boolean {
  const signedActions: SignedActionType[] = [
    'stake',
    'unstake',
    'set_home',
    'start_expedition',
    'leave_expedition',
    'syndicate_action',
    'claim_rewards',
  ];
  return signedActions.includes(action as SignedActionType);
}

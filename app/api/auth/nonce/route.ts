/**
 * @fileoverview API route for generating signature nonces
 * Used for authenticated wallet actions
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateNonce, storeNonce } from '../../../../server/auth/verify-wallet';

/**
 * POST /api/auth/nonce
 * Generate a nonce for wallet signature
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action } = body;

    if (!walletAddress || walletAddress.length < 32) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }

    // Generate and store nonce
    const nonce = generateNonce();
    storeNonce(nonce, walletAddress);

    console.log(`[Auth] Generated nonce for ${walletAddress} action: ${action}`);

    return NextResponse.json({
      nonce,
      walletAddress,
      action,
      expiresIn: 300, // 5 minutes
    });
  } catch (error) {
    console.error('[Auth] Nonce generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate nonce' },
      { status: 500 }
    );
  }
}

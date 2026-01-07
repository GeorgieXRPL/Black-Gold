/**
 * @fileoverview API route for verifying wallet signatures
 * Validates signed actions before processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignedAction, requiresSignature } from '../../../../server/auth/verify-wallet';

/**
 * POST /api/auth/verify
 * Verify a signed action from a wallet
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action, nonce, signature, data } = body;

    // Validate required fields
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

    if (!nonce) {
      return NextResponse.json(
        { error: 'Nonce is required' },
        { status: 400 }
      );
    }

    if (!signature) {
      return NextResponse.json(
        { error: 'Signature is required' },
        { status: 400 }
      );
    }

    // Check if action requires signature
    if (!requiresSignature(action)) {
      return NextResponse.json(
        { error: `Action '${action}' does not require signature` },
        { status: 400 }
      );
    }

    // Verify the signature
    const isValid = verifySignedAction({
      walletAddress,
      action,
      nonce,
      signature,
      data,
    });

    if (!isValid) {
      console.log(`[Auth] Invalid signature for ${walletAddress} action: ${action}`);
      return NextResponse.json(
        { error: 'Invalid signature', verified: false },
        { status: 401 }
      );
    }

    console.log(`[Auth] Verified signature for ${walletAddress} action: ${action}`);

    return NextResponse.json({
      verified: true,
      walletAddress,
      action,
      data,
    });
  } catch (error) {
    console.error('[Auth] Verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}

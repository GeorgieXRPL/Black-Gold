/**
 * @fileoverview API status endpoint
 * Returns current configuration and service health
 */

import { NextResponse } from 'next/server';
import { TOKEN_CONFIG, RPC_CONFIG, IS_DEVNET, NETWORK } from '../../../config/constants';

interface StatusResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  network: string;
  services: {
    helius: { configured: boolean; network: string };
    token: { configured: boolean; mint: string; symbol: string };
    privy: { configured: boolean };
  };
  version: string;
}

/**
 * GET /api/status
 * Returns current system status
 */
export async function GET() {
  const heliumConfigured = !!RPC_CONFIG.HELIUS_API_KEY;
  const tokenConfigured = TOKEN_CONFIG.MINT_ADDRESS !== 'TBD' && TOKEN_CONFIG.MINT_ADDRESS !== 'DEVNET_TEST_TOKEN';
  const privyConfigured = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  
  // Determine overall status
  let status: 'ok' | 'degraded' | 'error' = 'ok';
  
  if (!privyConfigured) {
    status = 'degraded'; // Can still use address-only mode
  }
  
  if (!heliumConfigured && !IS_DEVNET) {
    status = 'degraded'; // Using public RPC
  }

  const response: StatusResponse = {
    status,
    timestamp: new Date().toISOString(),
    network: NETWORK,
    services: {
      helius: {
        configured: heliumConfigured,
        network: NETWORK,
      },
      token: {
        configured: tokenConfigured,
        mint: tokenConfigured ? TOKEN_CONFIG.MINT_ADDRESS : 'Not configured',
        symbol: TOKEN_CONFIG.SYMBOL,
      },
      privy: {
        configured: privyConfigured,
      },
    },
    version: '2.0.0',
  };

  return NextResponse.json(response);
}

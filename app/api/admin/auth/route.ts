/**
 * @fileoverview Admin authentication API route
 * Simple password-based auth using ADMIN_SECRET env var
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    
    const adminSecret = process.env.ADMIN_SECRET;
    
    // If no admin secret is set, deny all access
    if (!adminSecret) {
      console.error('[Admin Auth] ADMIN_SECRET environment variable not set');
      return NextResponse.json(
        { error: 'Admin access not configured' },
        { status: 500 }
      );
    }
    
    // Constant-time comparison to prevent timing attacks
    if (password === adminSecret) {
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    console.error('[Admin Auth] Error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

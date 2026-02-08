/**
 * @fileoverview Wallet Setup Script for Black Gold
 * Generates 4 Solana wallets needed for the game infrastructure.
 * 
 * Run with: npx tsx scripts/setup-wallets.ts
 * 
 * IMPORTANT: 
 * - Save the output securely! Private keys cannot be recovered.
 * - Never commit the output file to git.
 * - Use different wallets for mainnet (generate fresh ones).
 * 
 * After running, you need to:
 * 1. Fund each wallet with devnet SOL: https://faucet.solana.com/
 * 2. Fund the Reward Pool wallet with COAL tokens
 * 3. Set the environment variables in Railway
 */

import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

let bs58Encode: (data: Uint8Array) => string;
try {
  const bs58Module = require('bs58');
  bs58Encode = bs58Module.encode || bs58Module.default?.encode || ((d: Uint8Array) => Buffer.from(d).toString('base64'));
} catch {
  bs58Encode = (d: Uint8Array) => Buffer.from(d).toString('base64');
}

interface WalletInfo {
  name: string;
  role: string;
  publicKey: string;
  privateKeyBase58: string;
  privateKeyArray: number[];
  envVarPrivate: string;
  envVarPublic: string;
}

function generateWallet(name: string, role: string, envVarPrivate: string, envVarPublic: string): WalletInfo {
  const keypair = Keypair.generate();
  return {
    name,
    role,
    publicKey: keypair.publicKey.toBase58(),
    privateKeyBase58: bs58Encode(keypair.secretKey),
    privateKeyArray: Array.from(keypair.secretKey),
    envVarPrivate,
    envVarPublic,
  };
}

async function main() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  BLACK GOLD - WALLET SETUP');
  console.log('='.repeat(70));
  console.log('');

  // Generate 4 wallets
  const wallets: WalletInfo[] = [
    generateWallet(
      'Reward Pool',
      'Holds COAL tokens for miner discovery + vault payouts',
      'REWARD_WALLET_PRIVATE_KEY',
      'REWARD_WALLET_ADDRESS'
    ),
    generateWallet(
      'Creator',
      'Receives Pump.fun creator fees (SOL), runs buyback service',
      'CREATOR_WALLET_PRIVATE_KEY',
      'CREATOR_WALLET_ADDRESS'
    ),
    generateWallet(
      'Bet Escrow',
      'Holds locked COAL during active raid bets',
      '',
      'BET_ESCROW_WALLET'
    ),
    generateWallet(
      'Redeemer',
      'Exchanges IOU-COAL for real COAL (funded by buyback)',
      '',
      'REDEEMER_WALLET_ADDRESS'
    ),
  ];

  // Display wallet info
  for (const w of wallets) {
    console.log(`-`.repeat(70));
    console.log(`  ${w.name} Wallet`);
    console.log(`  Role: ${w.role}`);
    console.log(`-`.repeat(70));
    console.log(`  Public Key:  ${w.publicKey}`);
    console.log(`  Private Key: ${w.privateKeyBase58.slice(0, 12)}...${w.privateKeyBase58.slice(-8)}`);
    console.log('');
  }

  // Generate env var block
  console.log('='.repeat(70));
  console.log('  ENVIRONMENT VARIABLES (copy to Railway)');
  console.log('='.repeat(70));
  console.log('');

  const envLines: string[] = [
    '# Black Gold Wallet Configuration',
    '# Generated: ' + new Date().toISOString(),
    '# Network: devnet (generate fresh wallets for mainnet!)',
    '',
    '# Reward Pool Wallet',
    `REWARD_WALLET_PRIVATE_KEY=${JSON.stringify(wallets[0].privateKeyArray)}`,
    `REWARD_WALLET_ADDRESS=${wallets[0].publicKey}`,
    '',
    '# Creator Wallet (for buyback service)',
    `CREATOR_WALLET_PRIVATE_KEY=${JSON.stringify(wallets[1].privateKeyArray)}`,
    `CREATOR_WALLET_ADDRESS=${wallets[1].publicKey}`,
    '',
    '# Bet Escrow Wallet',
    `BET_ESCROW_WALLET=${wallets[2].publicKey}`,
    '',
    '# Redeemer Wallet (IOU-COAL -> COAL exchange)',
    `REDEEMER_WALLET_ADDRESS=${wallets[3].publicKey}`,
  ];

  for (const line of envLines) {
    console.log(line);
  }

  console.log('');

  // Save to file (gitignored)
  const outputPath = path.join(__dirname, '..', '.wallet-keys.env');
  fs.writeFileSync(outputPath, envLines.join('\n') + '\n');
  console.log(`  Saved to: ${outputPath}`);
  console.log('  (This file is for your records - add to .gitignore!)');
  console.log('');

  // Check if .gitignore has the wallet file
  const gitignorePath = path.join(__dirname, '..', '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.wallet-keys.env')) {
      fs.appendFileSync(gitignorePath, '\n# Wallet keys (NEVER commit)\n.wallet-keys.env\n');
      console.log('  Added .wallet-keys.env to .gitignore');
    }
  }

  // Funding instructions
  console.log('='.repeat(70));
  console.log('  NEXT STEPS');
  console.log('='.repeat(70));
  console.log('');
  console.log('  1. Fund each wallet with devnet SOL (2+ SOL each):');
  console.log('     https://faucet.solana.com/');
  console.log('');
  for (const w of wallets) {
    console.log(`     ${w.name}: ${w.publicKey}`);
  }
  console.log('');
  console.log('  2. Fund the Reward Pool wallet with your devnet COAL tokens');
  console.log('     (transfer COAL from your minting wallet to the Reward Pool address)');
  console.log('');
  console.log('  3. Copy the environment variables above to Railway dashboard');
  console.log('');
  console.log('  4. Also set these in Railway:');
  console.log('     SOLANA_NETWORK=devnet');
  console.log('     TOKEN_MINT_ADDRESS=<your devnet COAL token mint address>');
  console.log('     HELIUS_API_KEY=<your Helius API key>');
  console.log('     ADMIN_SECRET=<strong random password>');
  console.log('     CORS_ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app');
  console.log('');

  // Try to request devnet airdrop for the wallets
  console.log('='.repeat(70));
  console.log('  REQUESTING DEVNET SOL AIRDROPS...');
  console.log('='.repeat(70));
  console.log('');

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  for (const w of wallets) {
    try {
      const pubkey = Keypair.fromSecretKey(Uint8Array.from(w.privateKeyArray)).publicKey;
      console.log(`  Airdropping 2 SOL to ${w.name} (${w.publicKey.slice(0, 8)}...)...`);
      const sig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
      console.log(`    Success! TX: ${sig.slice(0, 16)}...`);
    } catch (err) {
      console.log(`    Airdrop failed (rate limited or faucet down). Fund manually at faucet.solana.com`);
    }
    // Small delay between airdrops to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('');
  console.log('  Wallet setup complete!');
  console.log('');
}

main().catch(console.error);

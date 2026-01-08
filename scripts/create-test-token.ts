/**
 * @fileoverview Create Alpha test token on Solana devnet
 * Run with: npx ts-node scripts/create-test-token.ts
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';

// Test wallet private key (devnet only!)
const PRIVATE_KEY = '4v4GMp21rzqNWX8LN8vXXrwKMkVmHajv9W7kuyfQRfUX78f8aBSuZ18wf9pmZRoe7m2L23p9vng2BBBhN5XhE8gw';

// Token configuration
const TOKEN_NAME = 'Alpha';
const TOKEN_SYMBOL = 'ALPHA';
const TOKEN_DECIMALS = 9;
const INITIAL_SUPPLY = 1_000_000_000; // 1 billion tokens

async function main() {
  console.log('🚀 Creating Alpha test token on Solana Devnet...\n');

  // Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  console.log('✓ Connected to Solana Devnet');

  // Load wallet from private key
  const secretKey = bs58.decode(PRIVATE_KEY);
  const payer = Keypair.fromSecretKey(secretKey);
  console.log(`✓ Wallet loaded: ${payer.publicKey.toBase58()}`);

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`✓ Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log('\n⚠️  Low balance! Requesting airdrop...');
    try {
      const airdropSig = await connection.requestAirdrop(
        payer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSig);
      console.log('✓ Airdrop received: 2 SOL');
    } catch (e) {
      console.log('⚠️  Airdrop failed (may have hit rate limit). Continuing...');
    }
  }

  // Create the token mint
  console.log('\n📝 Creating token mint...');
  const mint = await createMint(
    connection,
    payer,           // Payer
    payer.publicKey, // Mint authority
    payer.publicKey, // Freeze authority (can be null)
    TOKEN_DECIMALS,  // Decimals
    undefined,       // Keypair (auto-generate)
    undefined,       // Confirm options
    TOKEN_PROGRAM_ID
  );
  
  console.log(`✓ Token mint created!`);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  🪙 ${TOKEN_NAME} (${TOKEN_SYMBOL}) Token`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Mint Address: ${mint.toBase58()}`);
  console.log(`  Decimals: ${TOKEN_DECIMALS}`);
  console.log(`${'='.repeat(60)}\n`);

  // Create associated token account for the payer
  console.log('📝 Creating token account...');
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );
  console.log(`✓ Token account: ${tokenAccount.address.toBase58()}`);

  // Mint initial supply
  console.log(`\n📝 Minting ${INITIAL_SUPPLY.toLocaleString()} ${TOKEN_SYMBOL}...`);
  const mintAmount = BigInt(INITIAL_SUPPLY) * BigInt(10 ** TOKEN_DECIMALS);
  
  await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer, // Mint authority
    mintAmount
  );
  
  console.log(`✓ Minted ${INITIAL_SUPPLY.toLocaleString()} ${TOKEN_SYMBOL} tokens!`);

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  ✅ TOKEN CREATION COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Token Name:     ${TOKEN_NAME}`);
  console.log(`  Token Symbol:   ${TOKEN_SYMBOL}`);
  console.log(`  Mint Address:   ${mint.toBase58()}`);
  console.log(`  Total Supply:   ${INITIAL_SUPPLY.toLocaleString()} ${TOKEN_SYMBOL}`);
  console.log(`  Decimals:       ${TOKEN_DECIMALS}`);
  console.log(`  Owner Wallet:   ${payer.publicKey.toBase58()}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n📋 Add this to your environment variables:`);
  console.log(`   TOKEN_MINT_ADDRESS=${mint.toBase58()}`);
  console.log(`\n🔗 View on Solscan:`);
  console.log(`   https://solscan.io/token/${mint.toBase58()}?cluster=devnet`);
  console.log('');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

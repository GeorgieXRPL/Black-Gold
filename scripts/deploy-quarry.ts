/**
 * @fileoverview Deploy Quarry Rewarder and Quarry on Solana Devnet
 * 
 * This script creates the on-chain staking infrastructure:
 * 1. Creates a Rewarder (manages reward distribution)
 * 2. Creates a Quarry (staking pool for Alpha token)
 * 
 * Prerequisites:
 * - Alpha test token already minted
 * - Wallet with devnet SOL (at least 0.5 SOL recommended)
 * 
 * Usage:
 *   DEPLOYER_PRIVATE_KEY="your-base58-key" npx tsx scripts/deploy-quarry.ts
 * 
 * Note: This script uses dynamic imports to avoid TypeScript issues
 * with the Quarry SDK's anchor dependencies.
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

// Configuration
const DEVNET_RPC = 'https://api.devnet.solana.com';
const ALPHA_TOKEN_MINT = '9QWCzb5pMfkTFeLcWy9RJrBUqzBqE4dUPLnjcptchCf7';

async function main() {
  console.log('═'.repeat(60));
  console.log('   QUARRY DEPLOYMENT SCRIPT - DEVNET');
  console.log('═'.repeat(60));
  
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  
  if (!privateKey) {
    console.error('\nError: DEPLOYER_PRIVATE_KEY environment variable not set');
    console.log('\nUsage:');
    console.log('  DEPLOYER_PRIVATE_KEY="your-base58-private-key" npx tsx scripts/deploy-quarry.ts');
    console.log('\nYou can use the same test wallet key used for token creation.');
    process.exit(1);
  }

  // Decode private key
  let deployer: Keypair;
  try {
    const privateKeyBytes = bs58.decode(privateKey);
    deployer = Keypair.fromSecretKey(privateKeyBytes);
  } catch (error) {
    console.error('\nError: Invalid private key format. Must be base58 encoded.');
    process.exit(1);
  }

  console.log(`\nDeployer wallet: ${deployer.publicKey.toBase58()}`);

  // Connect to devnet
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  // Check balance
  const balance = await connection.getBalance(deployer.publicKey);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.error('\n⚠️  Warning: Low balance. Quarry deployment requires ~0.5 SOL.');
    console.log('Get devnet SOL from: https://faucet.solana.com/');
  }

  const tokenMint = new PublicKey(ALPHA_TOKEN_MINT);
  console.log(`Token Mint: ${tokenMint.toBase58()}`);

  try {
    // Dynamic import to avoid TypeScript issues
    console.log('\nLoading Quarry SDK...');
    const { QuarrySDK } = await import('@quarryprotocol/quarry-sdk');
    const { SolanaProvider } = await import('@saberhq/solana-contrib');
    
    // Create provider with wallet
    const provider = SolanaProvider.init({
      connection,
      wallet: {
        publicKey: deployer.publicKey,
        signTransaction: async (tx: any) => {
          tx.partialSign(deployer);
          return tx;
        },
        signAllTransactions: async (txs: any[]) => {
          txs.forEach((tx: any) => tx.partialSign(deployer));
          return txs;
        },
      },
    });

    // Load SDK
    const sdk = QuarrySDK.load({ provider });
    console.log('SDK loaded successfully!');

    // Step 1: Create Rewarder
    console.log('\n' + '─'.repeat(60));
    console.log('Step 1: Creating Rewarder...');
    console.log('─'.repeat(60));
    console.log('A Rewarder manages reward distribution for all quarries.');
    console.log('This will create a new on-chain account.\n');
    
    // The Quarry SDK requires a "mint wrapper" which is typically from Saber
    // For simpler testing, we can try using the token directly
    const createRewarderResult = await sdk.mine.createRewarder({
      mintWrapper: tokenMint,
    });
    
    console.log('Sending rewarder creation transaction...');
    const rewarderSig = await createRewarderResult.tx.confirm();
    
    const rewarderKey = createRewarderResult.key;
    console.log(`\n✓ Rewarder created!`);
    console.log(`  Transaction: ${rewarderSig.signature}`);
    console.log(`  Rewarder Address: ${rewarderKey.toBase58()}`);

    // Load the rewarder wrapper
    const rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderKey);

    // Step 2: Create Quarry
    console.log('\n' + '─'.repeat(60));
    console.log('Step 2: Creating Quarry (staking pool)...');
    console.log('─'.repeat(60));
    console.log('Users will stake Alpha tokens in this quarry.\n');
    
    const createQuarryResult = await rewarderWrapper.createQuarry({
      token: tokenMint,
    });
    
    console.log('Sending quarry creation transaction...');
    const quarrySig = await createQuarryResult.tx.confirm();
    
    const quarryKey = createQuarryResult.quarry;
    console.log(`\n✓ Quarry created!`);
    console.log(`  Transaction: ${quarrySig.signature}`);
    console.log(`  Quarry Address: ${quarryKey.toBase58()}`);

    // Output summary
    console.log('\n' + '═'.repeat(60));
    console.log('   DEPLOYMENT COMPLETE!');
    console.log('═'.repeat(60));
    
    console.log('\n📋 Add these to your Railway environment variables:\n');
    console.log('┌' + '─'.repeat(58) + '┐');
    console.log(`│ QUARRY_REWARDER_ADDRESS=${rewarderKey.toBase58().padEnd(32)} │`);
    console.log(`│ QUARRY_ADDRESS=${quarryKey.toBase58().padEnd(41)} │`);
    console.log('└' + '─'.repeat(58) + '┘');
    
    console.log('\n📋 Also add to Vercel (if needed for frontend display):\n');
    console.log(`NEXT_PUBLIC_QUARRY_REWARDER=${rewarderKey.toBase58()}`);
    console.log(`NEXT_PUBLIC_QUARRY_ADDRESS=${quarryKey.toBase58()}`);

    console.log('\n' + '─'.repeat(60));
    console.log('Deployment Summary:');
    console.log('─'.repeat(60));
    console.log(`  Network:        devnet`);
    console.log(`  Token Mint:     ${tokenMint.toBase58()}`);
    console.log(`  Rewarder:       ${rewarderKey.toBase58()}`);
    console.log(`  Quarry:         ${quarryKey.toBase58()}`);
    console.log(`  Deployer:       ${deployer.publicKey.toBase58()}`);
    console.log('─'.repeat(60));
    
    console.log('\n✅ Next steps:');
    console.log('   1. Add the environment variables above to Railway');
    console.log('   2. Redeploy the backend to pick up new config');
    console.log('   3. Test staking in the UI');

  } catch (error: any) {
    console.error('\n❌ Deployment failed!');
    console.error('Error:', error.message || error);
    
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach((log: string) => console.log('  ', log));
    }
    
    // Provide helpful tips
    if (error.message?.includes('insufficient funds') || error.message?.includes('0x1')) {
      console.log('\n💡 Tip: Get more devnet SOL from https://faucet.solana.com/');
    } else if (error.message?.includes('already exists') || error.message?.includes('already in use')) {
      console.log('\n💡 Tip: A rewarder/quarry may already exist for this configuration.');
      console.log('   Try using a different token mint or check existing deployments.');
    } else if (error.message?.includes('mint wrapper')) {
      console.log('\n💡 Note: Quarry SDK typically requires a Saber mint wrapper.');
      console.log('   For simpler staking, consider using direct SPL token transfers');
      console.log('   to a staking wallet instead of Quarry.');
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

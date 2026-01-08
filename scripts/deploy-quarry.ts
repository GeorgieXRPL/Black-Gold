/**
 * @fileoverview Deploy Quarry Staking Infrastructure with IOU Token + Redeemer
 * 
 * Architecture:
 * - COAL = Pump.fun token (burned mint authority) - what users stake
 * - IOU-COAL = Quarry reward token (MintWrapper controls) - what users earn
 * - Redeemer = Converts IOU-COAL → real COAL (funded by buyback service)
 * 
 * This script creates:
 * 1. IOU-COAL token + MintWrapper (for rewards)
 * 2. Rewarder (manages IOU-COAL distribution)
 * 3. Quarry (staking pool where users stake COAL)
 * 
 * Prerequisites:
 * - COAL token already launched on Pump.fun
 * - Wallet with devnet SOL (at least 2 SOL recommended)
 * 
 * Usage:
 *   DEPLOYER_PRIVATE_KEY="your-base58-key" npx tsx scripts/deploy-quarry.ts
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { QuarrySDK } from '@quarryprotocol/quarry-sdk';
import { SolanaProvider } from '@saberhq/solana-contrib';
import { u64, Token, TokenAmount } from '@saberhq/token-utils';
import bs58 from 'bs58';
import BN from 'bn.js';

// Configuration
const DEVNET_RPC = 'https://api.devnet.solana.com';

// The COAL token users will STAKE (Pump.fun token)
const COAL_TOKEN_MINT = '9QWCzb5pMfkTFeLcWy9RJrBUqzBqE4dUPLnjcptchCf7';

// IOU token configuration
const IOU_TOKEN_DECIMALS = 9;
const IOU_HARDCAP = new BN('1000000000000000000'); // 1 billion with 9 decimals

async function main() {
  console.log('═'.repeat(70));
  console.log('   QUARRY + IOU + REDEEMER DEPLOYMENT - DEVNET');
  console.log('═'.repeat(70));
  
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  
  if (!privateKey) {
    console.error('\n❌ Error: DEPLOYER_PRIVATE_KEY environment variable not set');
    console.log('\nUsage:');
    console.log('  DEPLOYER_PRIVATE_KEY="your-base58-key" npx tsx scripts/deploy-quarry.ts');
    process.exit(1);
  }

  // Decode private key
  let deployer: Keypair;
  try {
    const privateKeyBytes = bs58.decode(privateKey);
    deployer = Keypair.fromSecretKey(privateKeyBytes);
  } catch (error) {
    console.error('\n❌ Error: Invalid private key format. Must be base58 encoded.');
    process.exit(1);
  }

  console.log(`\n📍 Network: Devnet`);
  console.log(`👛 Deployer: ${deployer.publicKey.toBase58()}`);

  // Connect to devnet
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  // Check balance
  const balance = await connection.getBalance(deployer.publicKey);
  console.log(`💰 Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  
  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.error('\n⚠️  Warning: Low balance. Full deployment requires ~2 SOL.');
    console.log('   Get devnet SOL from: https://faucet.solana.com/');
  }

  const coalMint = new PublicKey(COAL_TOKEN_MINT);
  console.log(`🪙 COAL Token (stake): ${coalMint.toBase58()}`);

  try {
    // Create provider with wallet
    console.log('\n📦 Loading Quarry SDK...');
    
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
    console.log('✅ SDK loaded successfully!');

    // ================================================================
    // STEP 1: Create IOU Token + MintWrapper
    // ================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('📋 Step 1: Creating IOU-COAL Token + MintWrapper');
    console.log('─'.repeat(70));
    console.log('This creates a NEW token that Quarry can mint as rewards.');
    console.log('Users will exchange IOU-COAL → real COAL via the Redeemer.\n');
    
    // Create keypair for the new IOU mint
    const iouMintKP = Keypair.generate();
    const baseKP = Keypair.generate();
    
    console.log(`IOU Mint Keypair: ${iouMintKP.publicKey.toBase58()}`);
    
    const pendingMintAndWrapper = await sdk.mintWrapper.newWrapperAndMint({
      mintKP: iouMintKP,
      decimals: IOU_TOKEN_DECIMALS,
      hardcap: IOU_HARDCAP as u64,
      baseKP,
      admin: deployer.publicKey,
    });
    
    console.log('Sending IOU token + MintWrapper creation transaction...');
    const wrapperSig = await pendingMintAndWrapper.tx.confirm();
    
    const iouMint = pendingMintAndWrapper.mint;
    const mintWrapperKey = pendingMintAndWrapper.mintWrapper;
    
    console.log(`\n✅ IOU-COAL Token + MintWrapper created!`);
    console.log(`   Transaction: ${wrapperSig.signature}`);
    console.log(`   IOU-COAL Mint: ${iouMint.toBase58()}`);
    console.log(`   MintWrapper: ${mintWrapperKey.toBase58()}`);

    // ================================================================
    // STEP 2: Create Rewarder
    // ================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('📋 Step 2: Creating Rewarder');
    console.log('─'.repeat(70));
    console.log('The Rewarder manages IOU-COAL distribution to stakers.\n');
    
    const rewarderBaseKP = Keypair.generate();
    
    const { key: rewarderKey, tx: rewarderTx } = await sdk.mine.createRewarder({
      mintWrapper: mintWrapperKey,
      baseKP: rewarderBaseKP,
      authority: deployer.publicKey,
    });
    
    console.log('Sending Rewarder creation transaction...');
    const rewarderSig = await rewarderTx.confirm();
    
    console.log(`\n✅ Rewarder created!`);
    console.log(`   Transaction: ${rewarderSig.signature}`);
    console.log(`   Rewarder: ${rewarderKey.toBase58()}`);

    // Load the rewarder wrapper for next steps
    const rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderKey);

    // ================================================================
    // STEP 3: Create Quarry (Staking Pool for COAL)
    // ================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('📋 Step 3: Creating Quarry (COAL Staking Pool)');
    console.log('─'.repeat(70));
    console.log('Users will stake their COAL tokens here to earn IOU-COAL rewards.\n');
    
    // Fetch COAL token info to create a proper Token object
    const coalTokenInfo = await connection.getParsedAccountInfo(coalMint);
    const coalDecimals = (coalTokenInfo.value?.data as any)?.parsed?.info?.decimals ?? 9;
    
    // Create Token object for COAL
    const coalToken = Token.fromMint(coalMint, coalDecimals, { name: 'COAL', symbol: 'COAL' });
    
    const { quarry: quarryKey, tx: quarryTx } = await rewarderWrapper.createQuarry({
      token: coalToken, // Users stake the COAL token (Pump.fun token)
    });
    
    console.log('Sending Quarry creation transaction...');
    const quarrySig = await quarryTx.confirm();
    
    console.log(`\n✅ Quarry created!`);
    console.log(`   Transaction: ${quarrySig.signature}`);
    console.log(`   Quarry: ${quarryKey.toBase58()}`);

    // ================================================================
    // STEP 4: Set up Minter for Rewarder
    // ================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('📋 Step 4: Configuring Minter (Rewarder can mint IOU-COAL)');
    console.log('─'.repeat(70));
    
    const minterTx = await sdk.mintWrapper.newMinterWithAllowance(
      mintWrapperKey,
      rewarderKey,
      IOU_HARDCAP as u64
    );
    
    console.log('Sending Minter configuration transaction...');
    const minterSig = await minterTx.confirm();
    
    console.log(`\n✅ Minter configured!`);
    console.log(`   Transaction: ${minterSig.signature}`);

    // ================================================================
    // OUTPUT SUMMARY
    // ================================================================
    console.log('\n' + '═'.repeat(70));
    console.log('   🎉 QUARRY INFRASTRUCTURE DEPLOYED!');
    console.log('═'.repeat(70));
    
    console.log('\n📋 Railway Environment Variables:\n');
    console.log('┌' + '─'.repeat(68) + '┐');
    console.log(`│ QUARRY_MINT_WRAPPER=${mintWrapperKey.toBase58().padEnd(46)} │`);
    console.log(`│ QUARRY_REWARDER_ADDRESS=${rewarderKey.toBase58().padEnd(42)} │`);
    console.log(`│ QUARRY_ADDRESS=${quarryKey.toBase58().padEnd(51)} │`);
    console.log(`│ IOU_TOKEN_MINT=${iouMint.toBase58().padEnd(51)} │`);
    console.log('└' + '─'.repeat(68) + '┘');
    
    console.log('\n📋 Vercel Environment Variables:\n');
    console.log(`NEXT_PUBLIC_QUARRY_ENABLED=true`);
    console.log(`NEXT_PUBLIC_QUARRY_REWARDER=${rewarderKey.toBase58()}`);
    console.log(`NEXT_PUBLIC_QUARRY_ADDRESS=${quarryKey.toBase58()}`);
    console.log(`NEXT_PUBLIC_IOU_TOKEN_MINT=${iouMint.toBase58()}`);

    console.log('\n' + '─'.repeat(70));
    console.log('📊 Deployment Summary:');
    console.log('─'.repeat(70));
    console.log(`  Network:           devnet`);
    console.log(`  COAL Token:        ${coalMint.toBase58()} (what users stake)`);
    console.log(`  IOU-COAL Token:    ${iouMint.toBase58()} (reward token)`);
    console.log(`  MintWrapper:       ${mintWrapperKey.toBase58()}`);
    console.log(`  Rewarder:          ${rewarderKey.toBase58()}`);
    console.log(`  Quarry:            ${quarryKey.toBase58()}`);
    console.log(`  Deployer/Admin:    ${deployer.publicKey.toBase58()}`);
    console.log('─'.repeat(70));

    console.log('\n📋 Architecture Flow:');
    console.log('─'.repeat(70));
    console.log('  1. User stakes COAL tokens in Quarry');
    console.log('  2. User earns IOU-COAL rewards over time');
    console.log('  3. User claims IOU-COAL from Quarry');
    console.log('  4. User redeems IOU-COAL → real COAL at Redeemer');
    console.log('  5. Redeemer funded by buyback service (SOL → COAL)');
    console.log('─'.repeat(70));
    
    console.log('\n✅ Next steps:');
    console.log('   1. Add environment variables to Railway + Vercel');
    console.log('   2. Deploy Redeemer contract (or use simple escrow wallet)');
    console.log('   3. Configure buyback service to fund Redeemer');
    console.log('   4. Update staking.ts to use Quarry SDK');
    console.log('   5. Test stake/unstake/claim flow');
    console.log('');

    // Save deployment info to file
    const deploymentInfo = {
      network: 'devnet',
      timestamp: new Date().toISOString(),
      coalToken: coalMint.toBase58(),
      iouToken: iouMint.toBase58(),
      mintWrapper: mintWrapperKey.toBase58(),
      rewarder: rewarderKey.toBase58(),
      quarry: quarryKey.toBase58(),
      deployer: deployer.publicKey.toBase58(),
    };
    
    console.log('\n📄 Deployment info (JSON):');
    console.log(JSON.stringify(deploymentInfo, null, 2));

  } catch (error: any) {
    console.error('\n❌ Deployment failed!');
    console.error('Error:', error.message || error);
    
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach((log: string) => console.log('  ', log));
    }
    
    // Provide helpful tips based on error
    if (error.message?.includes('insufficient funds') || error.message?.includes('0x1')) {
      console.log('\n💡 Tip: Get more devnet SOL from https://faucet.solana.com/');
    } else if (error.message?.includes('already exists') || error.message?.includes('already in use')) {
      console.log('\n💡 Tip: An account already exists at this address.');
      console.log('   The script uses random keypairs, so try running again.');
    } else if (error.message?.includes('invalid program id')) {
      console.log('\n💡 Tip: Quarry programs may not be deployed to devnet.');
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

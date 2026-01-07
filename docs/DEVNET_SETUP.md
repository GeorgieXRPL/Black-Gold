# Black Gold - Devnet Testing Setup

This guide walks you through setting up a devnet testing environment for Black Gold.

## Prerequisites

- Node.js 18+
- Solana CLI (`sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`)
- A devnet wallet with SOL

## Step 1: Configure Environment

Create a `.env.local` file in the `black-gold` directory:

```bash
# Network Configuration
SOLANA_NETWORK=devnet

# Privy (required for wallet connection)
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# WebSocket
NEXT_PUBLIC_WS_URL=ws://localhost:8080
PORT=8080

# Enable mock data for UI testing
NEXT_PUBLIC_USE_MOCKS=true

# Admin console
ADMIN_SECRET=your_admin_secret_here
```

## Step 2: Get Devnet SOL

```bash
# Configure Solana CLI for devnet
solana config set --url devnet

# Create a new wallet (if needed)
solana-keygen new -o ~/.config/solana/devnet-wallet.json

# Airdrop devnet SOL
solana airdrop 2 --url devnet
```

## Step 3: Create Test Token (Optional)

For full testing, you can create a test SPL token on devnet:

```bash
# Install SPL Token CLI
cargo install spl-token-cli

# Create a new token mint
spl-token create-token --url devnet

# Create a token account
spl-token create-account <TOKEN_MINT_ADDRESS> --url devnet

# Mint test tokens
spl-token mint <TOKEN_MINT_ADDRESS> 1000000 --url devnet
```

Add the token mint address to your `.env.local`:

```bash
TOKEN_MINT_ADDRESS=<your_devnet_token_mint>
```

## Step 4: Start the Application

```bash
# Terminal 1: Start the frontend
npm run dev

# Terminal 2: Start the WebSocket server
npm run server
```

## Step 5: Testing Features

### Mining (Address-Only Mode)
1. Open http://localhost:3000
2. Click "Enter Address" and paste any Solana wallet address
3. Select a mine on the globe
4. Click "Start Mining"

### Mining (Full Connect Mode)
1. Click "Connect Wallet"
2. Connect with Phantom/Solflare (switch to devnet in wallet settings)
3. Select a mine and start mining

### Staking (Requires Test Token)
1. Connect wallet with full access
2. Select a mine
3. Click "Stake"
4. Approve transaction in wallet

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLANA_NETWORK` | Yes | `devnet` or `mainnet` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | Privy dashboard App ID |
| `NEXT_PUBLIC_WS_URL` | Yes | WebSocket server URL |
| `PORT` | No | Server port (default: 8080) |
| `TOKEN_MINT_ADDRESS` | No | SPL token mint (for staking) |
| `HELIUS_API_KEY` | No | Helius API key for enhanced RPC |
| `ADMIN_SECRET` | Yes | Admin console password |
| `NEXT_PUBLIC_USE_MOCKS` | No | Enable mock data (`true`/`false`) |

## Troubleshooting

### "Wallet connection not configured"
- Ensure `NEXT_PUBLIC_PRIVY_APP_ID` is set
- Restart the dev server after changing env vars

### Mining not starting
- Check browser console for WebSocket errors
- Ensure the server is running (`npm run server`)
- Check that `NEXT_PUBLIC_WS_URL` matches your server

### Devnet transactions failing
- Airdrop more devnet SOL: `solana airdrop 1 --url devnet`
- Check wallet is set to devnet network

## Next Steps

After testing on devnet:
1. Update `SOLANA_NETWORK=mainnet`
2. Set real token mint address
3. Configure production wallets
4. Deploy to Railway/Vercel

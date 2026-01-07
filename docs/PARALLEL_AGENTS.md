# Parallel Agent Development Guide

This document provides instructions for running multiple AI agents in parallel to speed up development of Black Gold.

## Overview

Black Gold's modular architecture allows multiple agents to work simultaneously on different parts of the codebase without conflicts. Each agent should focus on a specific area.

## Setting Up Parallel Agents in Cursor IDE

### Step 1: Open Multiple Composer Windows

1. Open Cursor IDE with the Black Gold project
2. Press `Cmd+Shift+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux) to open a new Composer window
3. Repeat to open additional Composer windows (recommended: 2-4 agents max)
4. Or click the **"+"** button in the Composer panel sidebar

### Step 2: Assign Each Agent a Focus Area

Give each agent a clear, non-overlapping focus area. Here's a recommended split:

| Agent | Focus Area | Primary Files |
|-------|------------|---------------|
| **Agent 1** | Frontend UI/UX | `app/components/*`, `app/page.tsx`, `app/admin/*` |
| **Agent 2** | Backend Game Logic | `server/game/*`, `server/pool/*` |
| **Agent 3** | Infrastructure/Security | `server/middleware/*`, `server/solana/*`, deployment configs |
| **Agent 4** | Testing/Documentation | `fixtures/*`, `docs/*`, tests |

---

## Agent Prompts

Copy and paste these prompts into each Composer window:

### Agent 1: Frontend Agent

```
I'm Agent 1 working on Black Gold frontend.

My focus areas:
- app/components/* - React components
- app/page.tsx - Main page
- app/admin/* - Admin console
- app/globals.css - Styling
- Tailwind configuration

Current tasks:
1. [Describe your specific frontend task]

I will NOT modify:
- server/* files
- config/* files
- Any backend logic

I will check for conflicts before committing.
```

### Agent 2: Backend Game Agent

```
I'm Agent 2 working on Black Gold backend game logic.

My focus areas:
- server/game/* - Mine registry, stake manager, raid engine, etc.
- server/pool/* - Mining pool logic
- config/mines.ts - Mine configurations

Current tasks:
1. [Describe your specific backend task]

I will NOT modify:
- app/* files (frontend)
- server/solana/* (Solana integration)
- server/middleware/* (security)

I will check for conflicts before committing.
```

### Agent 3: Infrastructure Agent

```
I'm Agent 3 working on Black Gold infrastructure and security.

My focus areas:
- server/middleware/* - Validation, rate limiting
- server/solana/* - Blockchain integration
- server/verification/* - Anti-cheat, proof verification
- Deployment configurations (Railway, Vercel)

Current tasks:
1. [Describe your specific infrastructure task]

I will NOT modify:
- app/components/* (UI components)
- server/game/* (game logic)

I will check for conflicts before committing.
```

### Agent 4: Testing/Docs Agent

```
I'm Agent 4 working on Black Gold testing and documentation.

My focus areas:
- fixtures/* - Mock data for testing
- docs/* - Documentation
- README.md - Project readme
- Writing tests (when test framework is added)

Current tasks:
1. [Describe your specific documentation/testing task]

I will NOT modify production code without coordination.
```

---

## Best Practices for Parallel Development

### 1. Start Agents Sequentially

When installing packages, start agents one at a time (10-20 second gap) to avoid:
- `package.json` merge conflicts
- npm lock file conflicts

### 2. Coordinate on Shared Files

These files are touched by multiple areas - communicate before editing:
- `package.json`
- `server/index.ts` (main server entry)
- `app/layout.tsx`
- `config/*.ts`

### 3. Use the Dev Branch

All agents should work on the `dev` branch:

```bash
git checkout dev
git pull origin dev
```

### 4. Commit Frequently with Clear Messages

```bash
git add .
git commit -m "feat(agent-1): Add new mine details component"
git push origin dev
```

### 5. Handle Merge Conflicts

If conflicts occur:

```bash
# Stash your changes
git stash

# Pull latest
git pull origin dev

# Reapply your changes
git stash pop

# Resolve conflicts manually, then commit
```

---

## Example Parallel Workflow

```
Time 0:00  - Agent 1 starts: "Improve globe hover effects"
Time 0:00  - Agent 2 starts: "Add new raid cooldown mechanic"
Time 0:02  - Agent 3 starts: "Add CORS headers to server"
Time 0:05  - Agent 4 starts: "Update CODEBASE_INDEX.md"

Time 0:15  - Agent 1 completes and pushes
Time 0:20  - Agent 3 completes and pushes
Time 0:25  - Agent 2 completes, pulls Agent 1 & 3 changes, pushes
Time 0:30  - Agent 4 completes, pulls all changes, pushes

Time 0:35  - All agents receive new tasks...
```

---

## File Ownership Matrix

| Directory | Agent 1 | Agent 2 | Agent 3 | Agent 4 |
|-----------|:-------:|:-------:|:-------:|:-------:|
| `app/components/` | ✅ | ❌ | ❌ | ❌ |
| `app/hooks/` | ✅ | ❌ | ❌ | ❌ |
| `app/admin/` | ✅ | ❌ | ❌ | ❌ |
| `server/game/` | ❌ | ✅ | ❌ | ❌ |
| `server/pool/` | ❌ | ✅ | ❌ | ❌ |
| `server/middleware/` | ❌ | ❌ | ✅ | ❌ |
| `server/solana/` | ❌ | ❌ | ✅ | ❌ |
| `config/` | ❌ | ✅ | ❌ | ❌ |
| `fixtures/` | ❌ | ❌ | ❌ | ✅ |
| `docs/` | ❌ | ❌ | ❌ | ✅ |

✅ = Primary owner (can edit freely)
❌ = Coordinate with owner before editing

---

## Troubleshooting

### Agent is Stuck

If an agent seems stuck or isn't progressing:
1. Check for linter errors: `npm run lint`
2. Check TypeScript: `npx tsc --noEmit`
3. Restart the Composer window

### Build Failures

If build fails after parallel work:
1. Pull latest: `git pull origin dev`
2. Run `npm install` (dependencies may have changed)
3. Clear cache: `rm -rf .next`
4. Rebuild: `npm run build`

### Package Conflicts

If package.json has conflicts:
1. Only one agent should run `npm install` at a time
2. After one agent adds packages, others should `git pull` and `npm install`

---

## Quick Reference Commands

```bash
# Check current branch
git branch

# Switch to dev
git checkout dev

# Pull latest
git pull origin dev

# Build and check for errors
npm run build

# Run TypeScript check only
npx tsc --noEmit

# Start dev server
npm run dev

# Start game server
npm run server
```

---

## Environment Setup

Ensure all agents have access to the same environment variables in `.env.local`:

```bash
# Copy template if not exists
cp .env.example .env.local

# Required for local development
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_USE_MOCKS=true

# Optional (for full functionality)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
ADMIN_SECRET=your-admin-password
HELIUS_API_KEY=your-helius-key
```

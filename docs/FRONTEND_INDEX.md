# Black Gold Frontend - Codebase Index

> Mining site frontend for the Black Gold COAL token platform.

## 📁 File Structure

```
app/
├── components/
│   ├── index.ts           # Central component exports
│   ├── MiningPanel.tsx    # Main mining interface
│   ├── StatsCard.tsx      # Statistics display card
│   ├── BarrelFeed.tsx     # Live barrel discovery feed
│   ├── HolderGate.tsx     # Holder requirements display
│   └── EmberParticles.tsx # Particle effect background
├── globals.css            # Global styles & CSS variables
├── layout.tsx             # Root layout with fonts
├── page.tsx               # Main page composition
└── lib/
    └── mining.ts          # Mining utilities (shared)
```

---

## 🎨 Theme Configuration

### Colors
| Name | Hex | Usage |
|------|-----|-------|
| `coal-950` | `#0a0a0a` | Primary background |
| `coal-900` | `#121212` | Secondary background |
| `coal-800` | `#1a1a1a` | Panel backgrounds |
| `coal-700` | `#2a2a2a` | Borders, dividers |
| `coal-600` | `#3a3a3a` | Inactive elements |
| `ember` | `#f97316` | Primary accent (orange) |
| `gold` | `#fbbf24` | Secondary accent (gold) |

### Fonts
| Variable | Family | Usage |
|----------|--------|-------|
| `--font-bebas` | Bebas Neue | Display headings, titles |
| `--font-oswald` | Oswald | Section headings, labels |
| `--font-jetbrains` | JetBrains Mono | Stats, hashes, technical data |

### CSS Utility Classes
```css
.coal-panel       /* Industrial panel styling */
.ember-glow       /* Ember glow effect */
.gold-glow        /* Gold glow effect */
.progress-ember   /* Progress bar container */
.btn-mine         /* Mining button styling */
.stat-value       /* Statistic value styling */
.stat-label       /* Statistic label styling */
```

---

## 🧩 Components

### `MiningPanel`
Main mining interface with start/stop controls, hashrate display, and barrel progress.

```tsx
<MiningPanel 
  walletAddress="ABC123..."
  isEligible={true}
  onMiningStateChange={(active) => console.log(active)}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `walletAddress` | `string?` | Connected wallet address |
| `isEligible` | `boolean` | Whether user meets holder requirements |
| `onMiningStateChange` | `(active: boolean) => void` | Callback when mining starts/stops |
| `className` | `string?` | Additional CSS classes |

**Features:**
- Real-time hashrate display with auto-formatting (H/s → KH/s → MH/s → GH/s)
- Barrel (block) progress visualization
- Session timer
- Share submission counter
- Animated mining button with glow effects

---

### `StatsCard`
Reusable statistics display with animated value updates.

```tsx
<StatsCard 
  label="Hash Rate" 
  value="1.5"
  unit="MH/s"
  icon="⚡"
  accent="ember"
  trend="up"
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Statistic label |
| `value` | `string \| number` | Displayed value |
| `unit` | `string?` | Unit suffix |
| `icon` | `ReactNode?` | Icon or emoji |
| `animated` | `boolean` | Animate value changes (default: true) |
| `size` | `"sm" \| "md" \| "lg"` | Size variant |
| `accent` | `"ember" \| "gold" \| "default"` | Color accent |
| `trend` | `"up" \| "down" \| "neutral"` | Trend indicator |

---

### `BarrelFeed`
Live feed of discovered barrels (blocks) with finder details.

```tsx
<BarrelFeed maxEvents={10} live={true} />
```

| Prop | Type | Description |
|------|------|-------------|
| `maxEvents` | `number` | Max displayed events (default: 10) |
| `live` | `boolean` | Enable live updates (default: true) |
| `className` | `string?` | Additional CSS classes |

**Features:**
- Animated new entry highlight
- Relative timestamps ("5m ago")
- Truncated wallet addresses
- Total rewards tally

---

### `HolderGate`
Displays holder tier requirements and eligibility status.

```tsx
<HolderGate
  balance={50000}
  marketCap={25000}
  isConnected={true}
  onEligibilityChange={(eligible) => setCanMine(eligible)}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `balance` | `number` | User's COAL balance |
| `marketCap` | `number` | Current market cap (USD) |
| `isConnected` | `boolean` | Wallet connection status |
| `onEligibilityChange` | `(eligible: boolean) => void` | Eligibility callback |
| `className` | `string?` | Additional CSS classes |

**Features:**
- Dynamic tier calculation based on market cap
- Balance progress indicator
- Expandable tier list
- Real-time eligibility updates

---

### `EmberParticles`
Atmospheric ember particle effect for the mining theme.

```tsx
<EmberParticles count={30} intensity={1} active={true} />
```

| Prop | Type | Description |
|------|------|-------------|
| `count` | `number` | Number of particles (default: 30) |
| `active` | `boolean` | Enable particle generation (default: true) |
| `intensity` | `number` | Intensity multiplier (default: 1) |

**Features:**
- Randomized particle sizes and colors (ember/gold)
- Rising animation with fade-out
- Ground glow effect
- Performance-optimized with memo

---

## 🔗 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `framer-motion` | `^12.24.7` | Animations and transitions |
| `next` | `16.1.1` | React framework |
| `react` | `19.2.3` | UI library |
| `tailwindcss` | `^4` | Utility CSS |

---

## 🎭 Animations

### Defined Keyframes
| Name | Description |
|------|-------------|
| `emberFloat` | Floating particle movement |
| `emberGlow` | Pulsing glow effect |
| `pulseEmber` | Opacity pulsing |
| `minePulse` | Scale breathing for mining |
| `barrelFill` | Progress bar fill |
| `statUpdate` | Value change highlight |
| `fadeIn` | Simple fade entrance |
| `slideUp` | Slide up entrance |
| `coalShimmer` | Loading shimmer effect |

---

## 🚀 Usage

### Quick Start
```tsx
import { MiningPanel, HolderGate, EmberParticles } from "@/app/components";

function MinePage() {
  const [isEligible, setIsEligible] = useState(false);
  
  return (
    <>
      <EmberParticles />
      <MiningPanel isEligible={isEligible} />
      <HolderGate onEligibilityChange={setIsEligible} />
    </>
  );
}
```

### Integration Points
1. **Wallet Connection** - Replace demo state in `page.tsx` with actual Solana wallet adapter
2. **WebSocket Pool** - Connect `MiningPanel` to `server/pool/` WebSocket server
3. **Worker Integration** - Link `app/workers/miner.worker.ts` to mining controls
4. **Market Data** - Feed real market cap data to `HolderGate`

---

## 📝 Notes

- All components use JSDoc documentation
- CSS variables defined in `globals.css` for theme consistency
- Framer Motion handles all animations for smooth UX
- Components are memoized where appropriate for performance
- Tailwind v4 with custom theme extensions in `tailwind.config.ts`

---

*Last updated: January 2026*

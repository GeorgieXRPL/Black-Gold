/**
 * @fileoverview Dynamic holder requirement tiers based on market cap
 * Configure your own tiers here - higher MC = lower required holdings
 */

export interface HolderTier {
  /** Maximum market cap for this tier (in USD) */
  maxMC: number;
  /** Required percentage of supply to mine */
  requiredPercent: number;
  /** Human-readable tier name */
  name: string;
}

/**
 * Holder requirement tiers
 * Users need to hold this % of supply to be eligible to mine
 * Adjust these values based on your tokenomics
 */
export const HOLDER_TIERS: HolderTier[] = [
  { maxMC: 10_000, requiredPercent: 0.5, name: 'Genesis' },      // Under $10K: need 0.5%
  { maxMC: 25_000, requiredPercent: 0.3, name: 'Early' },        // $10K-$25K: need 0.3%
  { maxMC: 50_000, requiredPercent: 0.2, name: 'Growth' },       // $25K-$50K: need 0.2%
  { maxMC: 100_000, requiredPercent: 0.1, name: 'Expansion' },   // $50K-$100K: need 0.1%
  { maxMC: 250_000, requiredPercent: 0.05, name: 'Momentum' },   // $100K-$250K: need 0.05%
  { maxMC: 500_000, requiredPercent: 0.025, name: 'Velocity' },  // $250K-$500K: need 0.025%
  { maxMC: 1_000_000, requiredPercent: 0.01, name: 'Scale' },    // $500K-$1M: need 0.01%
  { maxMC: Infinity, requiredPercent: 0.005, name: 'Mass' },     // $1M+: need 0.005%
];

/**
 * Get the required holding percentage for a given market cap
 * @param marketCap - Current market cap in USD
 * @returns Required percentage of supply to hold
 */
export function getRequiredPercent(marketCap: number): number {
  const tier = HOLDER_TIERS.find(t => marketCap <= t.maxMC);
  return tier?.requiredPercent ?? HOLDER_TIERS[HOLDER_TIERS.length - 1].requiredPercent;
}

/**
 * Get the tier info for a given market cap
 * @param marketCap - Current market cap in USD
 * @returns The tier object
 */
export function getTier(marketCap: number): HolderTier {
  const tier = HOLDER_TIERS.find(t => marketCap <= t.maxMC);
  return tier ?? HOLDER_TIERS[HOLDER_TIERS.length - 1];
}

/**
 * Calculate required token amount based on MC and total supply
 * @param marketCap - Current market cap in USD
 * @param totalSupply - Total token supply
 * @returns Required token amount
 */
export function getRequiredTokenAmount(marketCap: number, totalSupply: number): number {
  const percent = getRequiredPercent(marketCap);
  return (percent / 100) * totalSupply;
}

/**
 * Check if a balance meets the requirement for a market cap
 * @param balance - Token balance
 * @param marketCap - Current market cap
 * @param totalSupply - Total supply
 * @returns Whether the balance is sufficient
 */
export function meetsRequirement(
  balance: number,
  marketCap: number,
  totalSupply: number
): boolean {
  const required = getRequiredTokenAmount(marketCap, totalSupply);
  return balance >= required;
}

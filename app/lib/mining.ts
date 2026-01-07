/**
 * @fileoverview SHA-256 mining utilities for Black Gold
 * Used by both Web Workers and server-side verification
 */

/**
 * Convert a hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash (browser-compatible using SubtleCrypto)
 * @param data - Data to hash
 * @returns Hex string of hash
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Compute double SHA-256 hash (like Bitcoin)
 * @param data - Data to hash
 * @returns Hex string of double hash
 */
export async function doubleSha256(data: string): Promise<string> {
  const firstHash = await sha256(data);
  const secondHash = await sha256(firstHash);
  return secondHash;
}

/**
 * Check if a hash meets the difficulty target
 * Hash must be numerically less than target
 * @param hash - Hash to check (hex string)
 * @param target - Target to compare against (hex string)
 * @returns True if hash meets target
 */
export function meetsTarget(hash: string, target: string): boolean {
  // Compare as hex strings (lexicographic comparison works for fixed-length hex)
  // Both should be 64 chars (256 bits)
  const normalizedHash = hash.toLowerCase().padStart(64, '0');
  const normalizedTarget = target.toLowerCase().padStart(64, '0');
  return normalizedHash < normalizedTarget;
}

/**
 * Calculate target from difficulty
 * Lower difficulty = higher target = easier to find
 * @param difficulty - Difficulty value
 * @returns Target as hex string
 */
export function difficultyToTarget(difficulty: number): string {
  // Max target (difficulty 1) is all f's except leading zeros
  // We use a simple formula: target = MAX_TARGET / difficulty
  // For simplicity, we calculate number of leading zeros required
  const leadingZeros = Math.floor(Math.log2(difficulty) / 4);
  const remainder = 0xffff / (difficulty / Math.pow(16, leadingZeros));
  
  // Build target string
  const zeros = '0'.repeat(Math.min(leadingZeros, 60));
  const significantPart = Math.floor(remainder).toString(16).padStart(4, '0');
  const padding = 'f'.repeat(64 - zeros.length - significantPart.length);
  
  return zeros + significantPart + padding;
}

/**
 * Create mining header from components
 * @param discoveryHeader - Current discovery header
 * @param nonce - Nonce to try
 * @returns Combined header string
 */
export function createMiningHeader(discoveryHeader: string, nonce: number): string {
  return `${discoveryHeader}:${nonce.toString(16).padStart(16, '0')}`;
}

/**
 * Mining result from worker
 */
export interface MiningResult {
  found: boolean;
  nonce?: number;
  hash?: string;
  hashesComputed: number;
}

/**
 * Mine a range of nonces (used by worker)
 * @param discoveryHeader - Header to hash
 * @param target - Difficulty target
 * @param nonceStart - Start of range
 * @param nonceEnd - End of range
 * @param batchSize - How many to compute before yielding
 * @returns Mining result
 */
export async function mineRange(
  discoveryHeader: string,
  target: string,
  nonceStart: number,
  nonceEnd: number,
  batchSize: number = 1000
): Promise<MiningResult> {
  let hashesComputed = 0;
  
  for (let nonce = nonceStart; nonce < nonceEnd; nonce++) {
    const header = createMiningHeader(discoveryHeader, nonce);
    const hash = await doubleSha256(header);
    hashesComputed++;
    
    if (meetsTarget(hash, target)) {
      return {
        found: true,
        nonce,
        hash,
        hashesComputed,
      };
    }
    
    // Yield control periodically to keep worker responsive
    if (hashesComputed % batchSize === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return {
    found: false,
    hashesComputed,
  };
}

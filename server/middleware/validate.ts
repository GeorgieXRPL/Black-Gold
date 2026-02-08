/**
 * @fileoverview Input validation middleware for WebSocket messages
 * Uses Zod schemas to validate all incoming message payloads
 */

import { z } from 'zod';

// ============================================================================
// Base Schemas
// ============================================================================

/** Solana wallet address validation */
const SolanaAddressSchema = z.string().regex(
  /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  'Invalid Solana wallet address'
);

/** Nonce validation (hexadecimal number) */
const NonceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Work ID validation (32-char hex string from randomBytes(16).toString('hex')) */
const WorkIdSchema = z.string().regex(/^[a-f0-9]{32}$/, 'Invalid work ID (expected 32-char hex)');

/** Mine ID validation */
const MineIdSchema = z.string().regex(/^(coal|gold|oil|silver)-[\w-]+$/, 'Invalid mine ID');

/** Resource type validation */
const ResourceTypeSchema = z.enum(['coal', 'gold', 'oil', 'silver']);

// ============================================================================
// Message Schemas
// ============================================================================

/** Authentication/connect message */
export const AuthMessageSchema = z.object({
  type: z.literal('connect'),
  walletAddress: SolanaAddressSchema,
  cores: z.number().int().min(1).max(64).optional(),
  mineId: MineIdSchema.optional(),
  signature: z.string().optional(), // Base64 encoded signature
  timestamp: z.number().int().optional(),
});

/** Submit proof message */
export const SubmitProofSchema = z.object({
  type: z.literal('submit'),  // Changed from 'submit_proof' to match client
  workUnitId: WorkIdSchema,
  nonce: NonceSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA256 hash'),
});

/** Hashrate update message */
export const HashrateSchema = z.object({
  type: z.literal('hashrate'),
  walletAddress: SolanaAddressSchema.optional(), // Client sends this, make it optional
  hashrate: z.number().min(0).max(100_000_000_000), // Max 100 GH/s
});

/** Join mine message */
export const JoinMineSchema = z.object({
  type: z.literal('join_mine'),
  mineId: MineIdSchema,
});

/** Stake message */
export const StakeSchema = z.object({
  type: z.literal('stake'),
  mineId: MineIdSchema,
  amount: z.number().int().min(1).max(1_000_000_000), // Max 1B tokens
  signature: z.string().min(1), // Required: wallet signature for state-changing action
  nonce: z.string().min(1), // Required: nonce for replay attack prevention
});

/** Unstake message */
export const UnstakeSchema = z.object({
  type: z.literal('unstake'),
  mineId: MineIdSchema,
  amount: z.number().int().min(1).max(1_000_000_000),
  signature: z.string().min(1), // Required: wallet signature for state-changing action
  nonce: z.string().min(1), // Required: nonce for replay attack prevention
});

/** Set home mine message */
export const SetHomeSchema = z.object({
  type: z.literal('set_home'),
  mineId: MineIdSchema,
  signature: z.string().min(1), // Required: wallet signature
  nonce: z.string().min(1), // Required: nonce for replay prevention
});

/** Start expedition (raid) message */
export const StartExpeditionSchema = z.object({
  type: z.literal('start_expedition'),
  targetMineId: MineIdSchema,
  betAmount: z.number().int().min(0).max(1_000_000_000).optional(),
  signature: z.string().min(1), // Required: wallet signature
  nonce: z.string().min(1), // Required: nonce for replay prevention
});

/** Rally defense message */
export const RallyDefenseSchema = z.object({
  type: z.literal('rally_defense'),
  mineId: MineIdSchema,
  tokenCost: z.number().int().min(0).max(1_000_000_000).optional(),
});

/** Syndicate create message */
export const CreateSyndicateSchema = z.object({
  type: z.literal('create_syndicate'),
  name: z.string().min(3).max(24).regex(/^[\w\s-]+$/, 'Invalid syndicate name'),
  tag: z.string().min(2).max(4).regex(/^[A-Z]+$/, 'Tag must be uppercase letters'),
});

/** Syndicate invite message */
export const InviteSyndicateSchema = z.object({
  type: z.literal('syndicate_invite'),
  targetWallet: SolanaAddressSchema,
});

/** Stats request message (no payload required) */
export const StatsRequestSchema = z.object({
  type: z.literal('stats'),
});

/** Activity feed request message (no payload required) */
export const GetActivitySchema = z.object({
  type: z.literal('get_activity'),
});

/** Request work message (no payload required, uses current mine) */
export const RequestWorkSchema = z.object({
  type: z.literal('request_work'),
});

// ============================================================================
// Admin Message Schemas
// ============================================================================

/** Admin authentication message */
export const AdminAuthSchema = z.object({
  type: z.literal('admin_auth'),
  password: z.string().min(1).max(256),
});

/** Admin subscribe to updates message */
export const AdminSubscribeSchema = z.object({
  type: z.literal('admin_subscribe'),
});

/** Admin action message */
export const AdminActionSchema = z.object({
  type: z.literal('admin_action'),
  action: z.enum(['ban_user', 'unban_user', 'set_mine_config', 'force_buyback', 'trigger_distribution', 'clear_cache']),
  wallet: SolanaAddressSchema.optional(),
  mineId: MineIdSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Union of all message types
// ============================================================================

export const WSMessageSchema = z.discriminatedUnion('type', [
  AuthMessageSchema,
  SubmitProofSchema,
  HashrateSchema,
  JoinMineSchema,
  StakeSchema,
  UnstakeSchema,
  SetHomeSchema,
  StartExpeditionSchema,
  RallyDefenseSchema,
  CreateSyndicateSchema,
  InviteSyndicateSchema,
  StatsRequestSchema,
  GetActivitySchema,
  RequestWorkSchema,
  // Admin message types
  AdminAuthSchema,
  AdminSubscribeSchema,
  AdminActionSchema,
]);

export type ValidatedWSMessage = z.infer<typeof WSMessageSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate an incoming WebSocket message
 * @param data - Raw message data (string or object)
 * @returns Validation result with success, data, and error
 */
export function validateWSMessage(data: unknown): ValidationResult<ValidatedWSMessage> {
  try {
    // Parse JSON if string
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Validate against schema
    const result = WSMessageSchema.safeParse(parsed);
    
    if (result.success) {
      return { success: true, data: result.data, error: undefined };
    } else {
      console.warn('[Validate] Invalid message:', result.error.issues);
      return { success: false, data: undefined, error: result.error.issues.map(i => i.message).join(', ') };
    }
  } catch (error) {
    console.warn('[Validate] Failed to parse message:', error);
    return { 
      success: false, 
      data: undefined,
      error: error instanceof Error ? error.message : 'Parse error',
    };
  }
}

/**
 * Sanitize a string to prevent XSS and injection attacks
 * @param input - Raw input string
 * @param maxLength - Maximum allowed length
 * @returns Sanitized string
 */
export function sanitizeString(input: string, maxLength: number = 256): string {
  return input
    .slice(0, maxLength)
    .replace(/[<>'"&]/g, '') // Remove HTML-dangerous chars
    .replace(/[\x00-\x1F]/g, '') // Remove control characters
    .trim();
}

/**
 * Validate wallet address format (Solana base58)
 * @param address - Wallet address to validate
 * @returns Whether the address is valid
 */
export function isValidSolanaAddress(address: string): boolean {
  return SolanaAddressSchema.safeParse(address).success;
}

/**
 * Validate mine ID format
 * @param mineId - Mine ID to validate
 * @returns Whether the mine ID is valid
 */
export function isValidMineId(mineId: string): boolean {
  return MineIdSchema.safeParse(mineId).success;
}

// ============================================================================
// Legacy Exports (for backwards compatibility with server/index.ts)
// ============================================================================

/** Alias for validateWSMessage */
export const validateMessage = validateWSMessage;

/**
 * Validate a specific payload type
 * @param type - Message type
 * @param payload - Payload to validate
 * @returns Validation result with success, data, and error
 */
export function validatePayload(type: string, payload: unknown): ValidationResult<ValidatedWSMessage> {
  try {
    const fullMessage = { type, ...(payload as object || {}) };
    const result = WSMessageSchema.safeParse(fullMessage);
    
    if (result.success) {
      return { success: true, data: result.data, error: undefined };
    }
    
    return { 
      success: false, 
      data: undefined,
      error: result.error.issues.map(i => i.message).join(', ')
    };
  } catch (err) {
    return { 
      success: false,
      data: undefined,
      error: err instanceof Error ? err.message : 'Validation failed'
    };
  }
}

/** Simplified validation result for the server */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Sanitize data for logging (remove sensitive info)
 * @param data - Data to sanitize
 * @returns Sanitized copy
 */
export function sanitizeForLog(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sanitized = { ...data as Record<string, unknown> };
  
  // Remove sensitive fields
  const sensitiveFields = ['signature', 'privateKey', 'secret', 'password', 'token'];
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

// ============================================================================
// Legacy Type Exports
// ============================================================================

export type ValidatedConnectPayload = z.infer<typeof AuthMessageSchema>;
export type ValidatedJoinMinePayload = z.infer<typeof JoinMineSchema>;
export type ValidatedHashratePayload = z.infer<typeof HashrateSchema>;
export type ValidatedProofSubmission = z.infer<typeof SubmitProofSchema>;
export type ValidatedStakePayload = z.infer<typeof StakeSchema>;
export type ValidatedExpeditionPayload = z.infer<typeof StartExpeditionSchema>;
export type ValidatedRallyPayload = z.infer<typeof RallyDefenseSchema>;

// ============================================================================
// Export schemas for external use
// ============================================================================

export const Schemas = {
  SolanaAddress: SolanaAddressSchema,
  Nonce: NonceSchema,
  WorkId: WorkIdSchema,
  MineId: MineIdSchema,
  ResourceType: ResourceTypeSchema,
};

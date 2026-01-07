/**
 * @fileoverview Auth module barrel export for Black Gold
 */

export {
  createSignatureMessage,
  verifySignature,
  generateNonce,
  storeNonce,
  consumeNonce,
  verifySignedAction,
  requiresSignature,
  type SignedAction,
  type SignedActionType,
} from './verify-wallet';

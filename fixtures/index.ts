/**
 * @fileoverview Fixtures module for mock/demo data
 * 
 * Usage:
 * - Set NEXT_PUBLIC_USE_MOCKS=true in .env.local to enable mock data
 * - Import { USE_MOCK_DATA, getMockData } from 'fixtures'
 * - Conditionally use mock data in components
 */

export * from './mock-events';
export * from './mock-stats';

/**
 * Whether to use mock data based on environment
 * - Only enabled in development mode AND when NEXT_PUBLIC_USE_MOCKS=true
 */
export const USE_MOCK_DATA = 
  process.env.NODE_ENV === 'development' && 
  process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

/**
 * Log warning when using mock data
 */
export function logMockDataWarning(component: string) {
  if (USE_MOCK_DATA) {
    console.warn(`[MOCK DATA] ${component} is using mock data. Set NEXT_PUBLIC_USE_MOCKS=false for production.`);
  }
}

/**
 * Helper to conditionally return mock or real data
 */
export function getMockOrReal<T>(mockData: T, realData: T): T {
  return USE_MOCK_DATA ? mockData : realData;
}

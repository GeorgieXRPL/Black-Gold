/**
 * @fileoverview Test utilities for Black Gold staking tests
 * Provides logging, result tracking, and helper functions
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ TYPES ============

export interface TestResult {
  name: string;
  suite: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
  timestamp: Date;
}

export interface TestSuiteResult {
  name: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  startTime: Date;
  endTime: Date;
}

export interface TestRunResult {
  runId: string;
  startTime: Date;
  endTime: Date;
  suites: TestSuiteResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  network: string;
  environment: Record<string, string | undefined>;
}

// ============ LOGGER ============

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_COLORS = {
  debug: '\x1b[90m',  // Gray
  info: '\x1b[36m',   // Cyan
  warn: '\x1b[33m',   // Yellow
  error: '\x1b[31m',  // Red
  reset: '\x1b[0m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
};

export class TestLogger {
  private logLevel: LogLevel;
  private logFile: string | null;
  private logs: string[] = [];
  
  constructor(level: LogLevel = 'info', logFile?: string) {
    this.logLevel = level;
    this.logFile = logFile || null;
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }
  
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }
  
  private log(level: LogLevel, message: string): void {
    if (!this.shouldLog(level)) return;
    
    const formatted = this.formatMessage(level, message);
    this.logs.push(formatted);
    
    const color = LOG_COLORS[level];
    console.log(`${color}${formatted}${LOG_COLORS.reset}`);
  }
  
  debug(message: string): void {
    this.log('debug', message);
  }
  
  info(message: string): void {
    this.log('info', message);
  }
  
  warn(message: string): void {
    this.log('warn', message);
  }
  
  error(message: string): void {
    this.log('error', message);
  }
  
  success(message: string): void {
    const formatted = this.formatMessage('info', message);
    this.logs.push(formatted);
    console.log(`${LOG_COLORS.green}${formatted}${LOG_COLORS.reset}`);
  }
  
  header(message: string): void {
    console.log(`\n${LOG_COLORS.bold}${LOG_COLORS.info}${'═'.repeat(60)}${LOG_COLORS.reset}`);
    console.log(`${LOG_COLORS.bold}${LOG_COLORS.info}  ${message}${LOG_COLORS.reset}`);
    console.log(`${LOG_COLORS.bold}${LOG_COLORS.info}${'═'.repeat(60)}${LOG_COLORS.reset}\n`);
  }
  
  saveLogs(filepath: string): void {
    fs.writeFileSync(filepath, this.logs.join('\n'));
  }
  
  getLogs(): string[] {
    return [...this.logs];
  }
}

// ============ RESULT TRACKER ============

export class TestResultTracker {
  private results: TestRunResult;
  private currentSuite: TestSuiteResult | null = null;
  
  constructor(network: string = 'devnet') {
    this.results = {
      runId: `test-run-${Date.now()}`,
      startTime: new Date(),
      endTime: new Date(),
      suites: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      duration: 0,
      network,
      environment: {
        NEXT_PUBLIC_SOLANA_NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
        QUARRY_ADDRESS: process.env.QUARRY_ADDRESS ? '***' : undefined,
        QUARRY_REWARDER_ADDRESS: process.env.QUARRY_REWARDER_ADDRESS ? '***' : undefined,
      },
    };
  }
  
  startSuite(name: string): void {
    this.currentSuite = {
      name,
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      duration: 0,
      startTime: new Date(),
      endTime: new Date(),
    };
  }
  
  endSuite(): void {
    if (!this.currentSuite) return;
    
    this.currentSuite.endTime = new Date();
    this.currentSuite.totalTests = this.currentSuite.results.length;
    this.currentSuite.passedTests = this.currentSuite.results.filter(r => r.passed).length;
    this.currentSuite.failedTests = this.currentSuite.results.filter(r => !r.passed).length;
    this.currentSuite.duration = this.currentSuite.results.reduce((sum, r) => sum + r.duration, 0);
    
    this.results.suites.push(this.currentSuite);
    this.currentSuite = null;
  }
  
  addResult(result: Omit<TestResult, 'suite' | 'timestamp'>): void {
    if (!this.currentSuite) return;
    
    this.currentSuite.results.push({
      ...result,
      suite: this.currentSuite.name,
      timestamp: new Date(),
    });
  }
  
  finalize(): TestRunResult {
    this.results.endTime = new Date();
    this.results.totalTests = this.results.suites.reduce((sum, s) => sum + s.totalTests, 0);
    this.results.passedTests = this.results.suites.reduce((sum, s) => sum + s.passedTests, 0);
    this.results.failedTests = this.results.suites.reduce((sum, s) => sum + s.failedTests, 0);
    this.results.duration = this.results.endTime.getTime() - this.results.startTime.getTime();
    
    return this.results;
  }
  
  getResults(): TestRunResult {
    return this.results;
  }
  
  saveResults(filepath: string): void {
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
  }
}

// ============ ASSERTIONS ============

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new AssertionError(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new AssertionError(message || `Deep equality failed:\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

export function assertApproxEqual(actual: number, expected: number, tolerance: number = 0.001, message?: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new AssertionError(message || `Expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

export function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new AssertionError(message || 'Assertion failed: expected true');
  }
}

export function assertFalse(condition: boolean, message?: string): void {
  if (condition) {
    throw new AssertionError(message || 'Assertion failed: expected false');
  }
}

export function assertNotNull<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new AssertionError(message || 'Assertion failed: expected non-null value');
  }
}

export function assertThrows(fn: () => void, expectedError?: string, message?: string): void {
  let threw = false;
  let errorMessage = '';
  
  try {
    fn();
  } catch (e) {
    threw = true;
    errorMessage = e instanceof Error ? e.message : String(e);
  }
  
  if (!threw) {
    throw new AssertionError(message || 'Expected function to throw');
  }
  
  if (expectedError && !errorMessage.includes(expectedError)) {
    throw new AssertionError(message || `Expected error containing "${expectedError}", got "${errorMessage}"`);
  }
}

export async function assertThrowsAsync(fn: () => Promise<void>, expectedError?: string, message?: string): Promise<void> {
  let threw = false;
  let errorMessage = '';
  
  try {
    await fn();
  } catch (e) {
    threw = true;
    errorMessage = e instanceof Error ? e.message : String(e);
  }
  
  if (!threw) {
    throw new AssertionError(message || 'Expected async function to throw');
  }
  
  if (expectedError && !errorMessage.includes(expectedError)) {
    throw new AssertionError(message || `Expected error containing "${expectedError}", got "${errorMessage}"`);
  }
}

// ============ TIMING UTILITIES ============

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (e) {
    clearTimeout(timeoutId!);
    throw e;
  }
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }
  
  throw lastError;
}

// ============ REPORT GENERATOR ============

export function generateMarkdownReport(results: TestRunResult): string {
  const lines: string[] = [];
  
  lines.push('# Staking System Test Report');
  lines.push('');
  lines.push(`**Run ID:** ${results.runId}`);
  lines.push(`**Network:** ${results.network}`);
  lines.push(`**Started:** ${results.startTime.toISOString()}`);
  lines.push(`**Duration:** ${results.duration}ms`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Tests | ${results.totalTests} |`);
  lines.push(`| Passed | ${results.passedTests} |`);
  lines.push(`| Failed | ${results.failedTests} |`);
  lines.push(`| Pass Rate | ${((results.passedTests / results.totalTests) * 100).toFixed(1)}% |`);
  lines.push('');
  
  // Suite results
  lines.push('## Test Suites');
  lines.push('');
  
  for (const suite of results.suites) {
    const status = suite.failedTests === 0 ? '✅' : '❌';
    lines.push(`### ${status} ${suite.name}`);
    lines.push('');
    lines.push(`- **Tests:** ${suite.passedTests}/${suite.totalTests}`);
    lines.push(`- **Duration:** ${suite.duration}ms`);
    lines.push('');
    
    if (suite.failedTests > 0) {
      lines.push('#### Failed Tests');
      lines.push('');
      for (const test of suite.results.filter(r => !r.passed)) {
        lines.push(`- **${test.name}**`);
        if (test.error) {
          lines.push(`  - Error: \`${test.error}\``);
        }
      }
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

export function saveMarkdownReport(results: TestRunResult, filepath: string): void {
  const report = generateMarkdownReport(results);
  fs.writeFileSync(filepath, report);
}

// ============ ENVIRONMENT HELPERS ============

export function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function isDevnet(): boolean {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet';
}

export function isMainnet(): boolean {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta';
}

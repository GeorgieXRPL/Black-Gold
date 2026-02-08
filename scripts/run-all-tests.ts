/**
 * @fileoverview Test runner for Black Gold
 * Runs all test suites in sequence and reports combined results.
 * 
 * Usage:
 *   npx tsx scripts/run-all-tests.ts          # Run all tests
 *   npm test                                   # Same as above
 *   npm run test:formulas                      # Unit tests only
 *   npm run test:simulation                    # Simulation tests only
 *   npm run test:e2e                           # E2E tests only
 */

import { execSync } from 'child_process';
import path from 'path';

const SCRIPTS_DIR = path.dirname(__filename);

interface TestSuite {
  name: string;
  script: string;
  exitCode: number;
  duration: number;
}

const suites: TestSuite[] = [
  { name: 'Game Formulas (unit)', script: 'test-game-formulas.ts', exitCode: -1, duration: 0 },
  { name: 'Game Simulation (integration)', script: 'test-game-simulation.ts', exitCode: -1, duration: 0 },
  { name: 'E2E WebSocket + REST API', script: 'test-e2e-websocket.ts', exitCode: -1, duration: 0 },
];

console.log('');
console.log('='.repeat(60));
console.log('  BLACK GOLD TEST RUNNER');
console.log('='.repeat(60));
console.log(`  Running ${suites.length} test suites...\n`);

let allPassed = true;

for (const suite of suites) {
  const scriptPath = path.join(SCRIPTS_DIR, suite.script);
  const start = Date.now();
  
  console.log(`\n${'#'.repeat(60)}`);
  console.log(`  SUITE: ${suite.name}`);
  console.log(`  Script: ${suite.script}`);
  console.log(`${'#'.repeat(60)}`);
  
  try {
    execSync(`npx tsx "${scriptPath}"`, {
      stdio: 'inherit',
      cwd: path.join(SCRIPTS_DIR, '..'),
      env: {
        ...process.env,
        ADMIN_SECRET: process.env.ADMIN_SECRET || 'test-admin-secret',
      },
    });
    suite.exitCode = 0;
  } catch (err: any) {
    suite.exitCode = err.status || 1;
    allPassed = false;
  }
  
  suite.duration = Date.now() - start;
}

// ============ COMBINED RESULTS ============

console.log(`\n${'='.repeat(60)}`);
console.log('  COMBINED TEST RESULTS');
console.log(`${'='.repeat(60)}\n`);

for (const suite of suites) {
  const icon = suite.exitCode === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${icon}  ${suite.name} (${(suite.duration / 1000).toFixed(1)}s)`);
}

const totalDuration = suites.reduce((sum, s) => sum + s.duration, 0);
const passedSuites = suites.filter(s => s.exitCode === 0).length;

console.log(`\n  ${passedSuites}/${suites.length} suites passed in ${(totalDuration / 1000).toFixed(1)}s`);

if (allPassed) {
  console.log('\n  \x1b[32mAll tests passed!\x1b[0m\n');
} else {
  console.log('\n  \x1b[31mSome suites failed!\x1b[0m\n');
  process.exit(1);
}

/**
 * Jest for the API. The code is ESM TypeScript, so:
 * - SWC compiles each .ts file on the fly (fast, no type checking: `npm run typecheck` does that)
 * - Node runs the tests as ES modules (NODE_OPTIONS=--experimental-vm-modules in the test script)
 * - imports written as './x.js' (NodeNext style) are pointed at the './x.ts' source
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'es6' } }],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  globalSetup: '<rootDir>/test/global-setup.js',
  globalTeardown: '<rootDir>/test/global-teardown.js',
  setupFiles: ['<rootDir>/test/env.js'],
  testTimeout: 20_000, // argon2 hashing and the in-memory MongoDB are slower than pure unit code
};

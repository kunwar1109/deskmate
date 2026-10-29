import nextJest from "next/jest.js";

/**
 * Component tests (React Testing Library). next/jest compiles TS/JSX with the same SWC setup as
 * `next build`, mocks CSS imports and ignores .next/. Tests run in jsdom, a browser DOM written in
 * JavaScript: fast, but no layout, no real network, no real browser APIs. Playwright covers those.
 */
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};

export default createJestConfig(config);

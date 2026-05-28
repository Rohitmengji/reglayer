/**
 * RegLayer — Test Setup
 *
 * WHY: Tests need consistent environment (mocked Prisma, env vars, etc.).
 * WHAT: Global test configuration: mocks database, sets env vars, provides test utilities.
 * HOW: Vitest globalSetup runs this before all tests. Mocks Prisma client with in-memory store.
 */
import "@testing-library/jest-dom/vitest";

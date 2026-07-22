import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Run all test files in a single worker process — avoids spawning multiple
    // pg connection pools and prevents parallel tests from racing on shared DB rows.
    pool: "forks",
    // vitest 4: top-level fork options (poolOptions was removed)
    singleFork: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Run all tests sequentially so DB state is predictable.
    fileParallelism: false,
  },
});

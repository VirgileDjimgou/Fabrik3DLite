import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@fabrik3d/contracts': fileURLToPath(new URL('../fabrik3d-ts-contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // The S39/S41 wall-clock performance benchmarks are only meaningful when the CPU is not
    // oversubscribed. On high-core-count machines Vitest otherwise saturates every logical core with
    // parallel workers and starves those measurements. Cap the pool so `npm run test` is
    // deterministic; the benchmark assertions and bounds are intentionally unchanged.
    maxWorkers: 4,
  },
})

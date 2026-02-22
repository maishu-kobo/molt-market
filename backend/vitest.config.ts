import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/services/purchase-service.ts',
        'src/repositories/purchase-repository.ts',
        'src/services/experiment-events.ts',
        'src/services/experiment-budget.ts',
        'src/services/experiment-tasks.ts',
        'src/middleware/experiment-context.ts',
        'src/routes/experiments.ts',
        'src/queue/tx-verification-queue.ts',
        'src/queue/deadline-checker.ts'
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    }
  }
});

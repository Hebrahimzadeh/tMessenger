import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Vitest doesn't load .env files on its own. Most tests don't need real
    // env vars (env.test.ts passes explicit mock objects; storage.test.ts's
    // fake-provider contract needs nothing), but storage.test.ts's S3
    // availability probe reads process.env.S3_ENDPOINT/etc. directly so it
    // can exercise the real S3StorageProvider contract whenever
    // docker-compose's object-storage is actually reachable.
    setupFiles: ['./src/config/load-dotenv.ts'],
  },
});

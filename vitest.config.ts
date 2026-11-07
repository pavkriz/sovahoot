import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic: game engine, auth, client composables (jsdom opted in per file).
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Integration: Worker + Durable Object + D1 running inside workerd.
        plugins: [
          cloudflareTest(async () => {
            const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))
            return {
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: {
                bindings: { TEST_MIGRATIONS: migrations, HOST_PASSWORD: 'test-secret' },
              },
            }
          }),
        ],
        test: {
          name: 'workers',
          include: ['test/worker/**/*.test.ts'],
          setupFiles: ['./test/worker/setup.ts'],
        },
      },
    ],
  },
})

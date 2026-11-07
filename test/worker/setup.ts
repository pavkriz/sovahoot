import { applyD1Migrations, env } from 'cloudflare:test'

// Bring the isolated per-test D1 database up to date before each test file.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

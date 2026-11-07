import type { D1Migration } from 'cloudflare:test'

declare global {
  namespace Cloudflare {
    interface Env {
      /** Provided only by vitest.config.ts for the Worker test project. */
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}

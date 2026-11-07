// Tiny persistence layer. The player identity lives in localStorage so a reload or a dropped
// connection never loses the seat; the host token lives in sessionStorage.

export interface PlayerSession {
  playerId: string
  nickname: string
  pin: string
}

const KEY = 'sovahoot.player'
const TOKEN_KEY = 'sovahoot.hostToken'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function loadPlayer(): PlayerSession | null {
  return safe(() => {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlayerSession>
    if (!parsed.playerId || !parsed.nickname || !parsed.pin) return null
    return parsed as PlayerSession
  }, null)
}

export function savePlayer(nickname: string, pin: string): PlayerSession {
  const existing = loadPlayer()
  const session: PlayerSession = {
    playerId: existing?.playerId ?? crypto.randomUUID(),
    nickname,
    pin,
  }
  safe(() => localStorage.setItem(KEY, JSON.stringify(session)), undefined)
  return session
}

/** A new identity, e.g. when the chosen nickname was rejected and the player picks another. */
export function forgetPlayer(): void {
  safe(() => localStorage.removeItem(KEY), undefined)
}

export function loadHostToken(): string | null {
  return safe(() => sessionStorage.getItem(TOKEN_KEY), null)
}

export function saveHostToken(token: string | null): void {
  safe(() => (token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY)), undefined)
}

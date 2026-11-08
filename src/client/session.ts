// Tiny persistence layer. The player identity lives in localStorage so a reload or a dropped
// connection never loses the seat; the host token lives in sessionStorage.

import { normalizeAvatar, type Avatar } from '../shared/avatars'

export interface PlayerSession {
  playerId: string
  nickname: string
  pin: string
  avatar: Avatar
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
    if (!parsed.playerId || !parsed.nickname) return null
    // `pin` is '' after the player left a game; nickname and avatar stay for the next join form.
    return { playerId: parsed.playerId, nickname: parsed.nickname, pin: parsed.pin ?? '', avatar: normalizeAvatar(parsed.avatar) }
  }, null)
}

export function savePlayer(nickname: string, pin: string, avatar: Avatar): PlayerSession {
  const existing = loadPlayer()
  const session: PlayerSession = {
    playerId: existing?.playerId ?? crypto.randomUUID(),
    nickname,
    pin,
    avatar: normalizeAvatar(avatar),
  }
  safe(() => localStorage.setItem(KEY, JSON.stringify(session)), undefined)
  return session
}

/** Leaving a game: forget which room we were in, keep identity and preferences. */
export function clearPin(): void {
  const existing = loadPlayer()
  if (!existing) return
  safe(() => localStorage.setItem(KEY, JSON.stringify({ ...existing, pin: '' })), undefined)
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

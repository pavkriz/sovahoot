// Player avatars: layered emoji (character + hat + glasses) on a coloured circle.
// Everything a client sends is normalised against these lists; the server never trusts raw input.

export interface Avatar {
  character: string
  hat: string | null
  glasses: string | null
  color: string
}

export const CHARACTERS = ['🦉', '🦊', '🐸', '🐼', '🐱', '🐶', '🦁', '🐨', '🐷', '🐵', '🐙', '🦄'] as const
export const HATS = ['🎩', '👑', '🧢', '🎓', '⛑️', '🎀'] as const
export const GLASSES = ['🕶️', '👓', '🥽'] as const
export const COLORS = ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#f78c6b', '#8338ec', '#3a86ff', '#fb5607'] as const

export const DEFAULT_AVATAR: Avatar = { character: CHARACTERS[0], hat: null, glasses: null, color: COLORS[0] }

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T
}

export function randomAvatar(): Avatar {
  return {
    character: pick(CHARACTERS),
    hat: Math.random() < 0.6 ? pick(HATS) : null,
    glasses: Math.random() < 0.4 ? pick(GLASSES) : null,
    color: pick(COLORS),
  }
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null
}

/** Coerces anything into a valid Avatar; unknown parts fall back to the default. */
export function normalizeAvatar(input: unknown): Avatar {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    character: oneOf(CHARACTERS, o.character) ?? DEFAULT_AVATAR.character,
    hat: oneOf(HATS, o.hat),
    glasses: oneOf(GLASSES, o.glasses),
    color: oneOf(COLORS, o.color) ?? DEFAULT_AVATAR.color,
  }
}

/** Compact form for a URL query parameter. */
export function encodeAvatar(a: Avatar): string {
  return JSON.stringify(a)
}

export function decodeAvatar(raw: string | null | undefined): Avatar {
  if (!raw) return { ...DEFAULT_AVATAR }
  try {
    return normalizeAvatar(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_AVATAR }
  }
}

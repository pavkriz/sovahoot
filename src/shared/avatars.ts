// Player avatars: layered emoji (character + hat) on a coloured circle. A character is either one
// emoji or a composite of two (an object with eyes stuck on it, see COMPOSITES below).
// Everything a client sends is normalised against these lists; the server never trusts raw input.

export interface Avatar {
  character: string
  hat: string | null
  color: string
}

// sova, liška, žába, panda, kočka, pes, lev, koala, prase, opice, jednorožec,
// medvěd, lední medvěd, křeček, králík, myš, tygr, vlk, kuřátko, kráva, kůň,
// halloweenská dýně, lebka, zeměkoule s očima, vánoční stromek s očima
// (new ones go at the end: the join form and e2e tests address characters by index)
export const CHARACTERS = [
  '🦉', '🦊', '🐸', '🐼', '🐱', '🐶', '🦁', '🐨', '🐷', '🐵', '🦄',
  '🐻', '🐻‍❄️', '🐹', '🐰', '🐭', '🐯', '🐺', '🐥', '🐮', '🐴',
  '🎃', '💀', '🌍👀', '🎄👀',
] as const
// cylindr, koruna, kšiltovka, akademická čepice, mašle, dámský klobouk
// (new ones go at the end: e2e tests address hats by index)
export const HATS = ['🎩', '👑', '🧢', '🎓', '🎀', '👒'] as const
// (new ones go at the end: the join form addresses colours by index)
export const COLORS = ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#8338ec', '#3a86ff', '#fb5607', '#47ef58ff'] as const

export const DEFAULT_AVATAR: Avatar = { character: CHARACTERS[0], hat: null, color: COLORS[0] }

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T
}

export function randomAvatar(): Avatar {
  return {
    character: pick(CHARACTERS),
    hat: Math.random() < 0.6 ? pick(HATS) : null,
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

// ---- composite characters ------------------------------------------------------------------
// An object emoji with a second emoji (eyes) laid over it. The id in CHARACTERS is simply both
// glyphs joined, so validation, the protocol and storage treat it like any other character.
// Overlay units are fractions of the base glyph size (positive y = lower), rotation in degrees,
// scale relative to the base glyph. Tuned visually on the /avatars sheet like the hats.
// The optional `scale` enlarges the whole character (base and eyes together, so eye placement
// stays valid); hats are positioned against the avatar circle, so HAT_FIT may need a nudge after.

export interface Overlay {
  glyph: string
  x: number
  y: number
  r: number
  s: number
}

export interface Composite {
  base: string
  /** Size of the whole character relative to a normal one (default 1). */
  scale?: number
  overlay: Overlay
}

export const COMPOSITES: Record<string, Composite> = {
  '🌍👀': { base: '🌍', overlay: { glyph: '👀', x: 0, y: -0.05, r: 0, s: 0.55 } }, // zeměkoule s očima
  '🎄👀': { base: '🎄', scale: 1.25, overlay: { glyph: '👀', x: 0, y: 0.0, r: 0, s: 0.35 } }, // vánoční stromek s očima
}

/** Splits a character into the glyph drawn underneath and the optional overlay on top. */
export function characterParts(character: string): { base: string; scale: number; overlay: Overlay | null } {
  const composite = COMPOSITES[character]
  return composite
    ? { base: composite.base, scale: composite.scale ?? 1, overlay: composite.overlay }
    : { base: character, scale: 1, overlay: null }
}

// ---- hat placement -------------------------------------------------------------------------
// Where a hat sits on each character. Units are fractions of the avatar size (positive y = lower),
// rotation in degrees, scale relative to the base hat size. Tuned visually against Noto Color Emoji,
// which every client renders (see the /avatars sheet). Layers are *added* together:
//   DEFAULT_PLACEMENT + HAT_DEFAULTS[hat] + HAT_FIT[character].base + HAT_FIT[character].hats[hat]
// (x, y, r add up; s multiplies), so a hat tweak and a character tweak combine instead of competing.

export interface HatPlacement {
  x: number
  y: number
  r: number
  s: number
}

type Delta = Partial<HatPlacement>

interface CharacterFit {
  /** Applied to every hat on this character (where the glyph's crown of the head is). */
  base: Delta
  /** Extra per-hat tweaks. */
  hats?: Partial<Record<string, Delta>>
}

export const DEFAULT_PLACEMENT: HatPlacement = { x: 0, y: 0.1, r: -6, s: 1 }

/** How each hat glyph differs from a generic hat (where its visual bulk sits inside the em box). */
export const HAT_DEFAULTS: Record<string, Delta> = {
  '🎩': { r: -2 }, // cylindr
  '👑': { r: 6 }, // koruna
  '🧢': { x: -0.01, y: 0.06, r: 6 }, // modrá kšiltovka
  '🎓': { y: 0.04, r: -4 }, // akademická čepice; střapec visí pod deskou, deska musí sedět níž
  '🎀': { x: 0.0, y: 0.15, r: 21, s: 0.6 }, // mašle
  '👒': { y: 0.12, r: -20, s: 1.2 }, // dámský klobouk (široká krempa)
}

/** Per-character tweaks: where the head's crown is in each glyph. */
export const HAT_FIT: Record<string, CharacterFit> = {
  '🦉': { base: { y: 0.01, s: 0.9 } }, // sova
  '🦊': { base: { y: 0.10, s: 0.85 } }, // liška
  '🐸': { base: { y: 0.03 } }, // žába
  '🐼': { base: { y: 0.03 } }, // panda
  '🐱': { base: { y: 0.10, s: 0.85 } }, // kočka
  '🐶': { base: { y: 0.02 } }, // pes
  '🦁': { base: {} }, // lev
  '🐨': { base: { y: 0.03 } }, // koala
  '🐷': { base: { y: 0.05 } }, // prase
  '🐵': { base: { y: 0.03 } }, // opice
  '🦄': { base: { x: 0.1, y: 0.08, r: 16, s: 0.8 } }, // jednorožec
  '🐻': { base: { y: 0.07 } }, // medvěd
  '🐻‍❄️': { base: { y: 0.01} }, // lední medvěd
  '🐹': { base: { y: 0.09 } }, // křeček
  '🐰': { base: { y: 0.24, s: 0.75 } }, // králík (dlouhé uši, pokrývka až na hlavě pod nimi)
  '🐭': { base: { y: 0.18 } }, // myš
  '🐯': { base: { y: 0.0, s: 0.85 } }, // tygr
  '🐺': { base: { y: 0.1, s: 0.85 } }, // vlk
  '🐥': { base: { y: 0.0, s: 0.8 } }, // kuřátko
  '🐮': { base: { y: 0.08, s: 0.85 } }, // kráva (růžky)
  '🐴': { base: { x: 0.1, y: 0.05, r: 16, s: 0.8 } }, // kůň (hlava z profilu jako jednorožec)
  '🎃': { base: { y: 0.1 } }, // halloweenská dýně (stopka nahoře)
  '💀': { base: { y: 0.02 } }, // lebka
  '🌍👀': { base: { y: 0.02 } }, // zeměkoule s očima
  '🎄👀': { base: { y: 0.05, s: 0.8 } }, // vánoční stromek s očima (úzká špička nahoře)
}

function add(a: HatPlacement, d: Delta | undefined): HatPlacement {
  if (!d) return a
  return { x: a.x + (d.x ?? 0), y: a.y + (d.y ?? 0), r: a.r + (d.r ?? 0), s: a.s * (d.s ?? 1) }
}

export function hatPlacement(character: string, hat: string | null): HatPlacement {
  if (!hat) return { ...DEFAULT_PLACEMENT }
  const fit = HAT_FIT[character]
  return add(add(add(DEFAULT_PLACEMENT, HAT_DEFAULTS[hat]), fit?.base), fit?.hats?.[hat])
}

// ---- "Náhodně" roulette ------------------------------------------------------------------------

/**
 * Delays (ms) between successive random avatars when the player hits "Náhodně": quick at first,
 * slowing down, and all over in well under two seconds.
 */
export function spinDelays(): number[] {
  const delays: number[] = []
  let delay = 60
  let total = 0
  while (total + delay <= 1800) {
    delays.push(Math.round(delay))
    total += delay
    delay *= 1.25
  }
  return delays
}

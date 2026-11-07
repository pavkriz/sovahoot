import { describe, expect, it } from 'vitest'
import { CHARACTERS, COLORS, DEFAULT_AVATAR, DEFAULT_PLACEMENT, decodeAvatar, encodeAvatar, HATS, hatPlacement, normalizeAvatar, randomAvatar } from './avatars'

describe('avatars', () => {
  it('normalises unknown parts to defaults and keeps valid ones', () => {
    expect(normalizeAvatar({ character: '🦊', hat: '👑', color: COLORS[2] })).toEqual({
      character: '🦊',
      hat: '👑',
      color: COLORS[2],
    })
    expect(normalizeAvatar({ character: '💩', hat: 'hat', color: 'red' })).toEqual(DEFAULT_AVATAR)
    // Retired options (octopus, rescue helmet, glasses) from older clients fall back cleanly.
    expect(normalizeAvatar({ character: '🐙', hat: '⛑️', glasses: '👓', color: COLORS[1] })).toEqual({ ...DEFAULT_AVATAR, color: COLORS[1] })
    expect(normalizeAvatar(null)).toEqual(DEFAULT_AVATAR)
    expect(normalizeAvatar('🦊')).toEqual(DEFAULT_AVATAR)
  })

  it('generates only valid random avatars', () => {
    for (let i = 0; i < 200; i++) {
      const a = randomAvatar()
      expect(CHARACTERS).toContain(a.character)
      expect(a.hat === null || (HATS as readonly string[]).includes(a.hat)).toBe(true)
      expect(COLORS).toContain(a.color)
    }
  })

  it('round-trips through encode/decode and survives garbage', () => {
    const a = { character: '🐼', hat: '🎓', color: COLORS[5]! }
    expect(decodeAvatar(encodeAvatar(a))).toEqual(a)
    expect(decodeAvatar('not json')).toEqual(DEFAULT_AVATAR)
    expect(decodeAvatar(null)).toEqual(DEFAULT_AVATAR)
    expect(decodeAvatar('{"character":"💣"}')).toEqual(DEFAULT_AVATAR)
  })

  it('drops the retired salmon background colour', () => {
    expect(COLORS).not.toContain('#f78c6b')
    expect(normalizeAvatar({ character: '🦊', hat: null, color: '#f78c6b' }).color).toBe(DEFAULT_AVATAR.color)
  })

  it('gives every character/hat combination a sane hat placement', () => {
    const sane = (p: ReturnType<typeof hatPlacement>) => {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.3)
      expect(p.y).toBeGreaterThanOrEqual(-0.4)
      expect(p.y).toBeLessThanOrEqual(0.4)
      expect(p.s).toBeGreaterThanOrEqual(0.5)
      expect(p.s).toBeLessThanOrEqual(1.5)
      expect(Number.isFinite(p.r)).toBe(true)
    }
    for (const c of CHARACTERS) for (const h of HATS) sane(hatPlacement(c, h))
    // Unknown character: still the hat's generic placement, never a crash.
    sane(hatPlacement('💣', '👑'))
    expect(hatPlacement('🦊', null)).toEqual(DEFAULT_PLACEMENT)
  })
})

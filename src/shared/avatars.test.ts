import { describe, expect, it } from 'vitest'
import { CHARACTERS, COLORS, DEFAULT_AVATAR, decodeAvatar, encodeAvatar, HATS, normalizeAvatar, randomAvatar } from './avatars'

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
})

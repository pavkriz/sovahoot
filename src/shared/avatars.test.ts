import { describe, expect, it } from 'vitest'
import { CHARACTERS, COLORS, DEFAULT_AVATAR, decodeAvatar, encodeAvatar, GLASSES, HATS, normalizeAvatar, randomAvatar } from './avatars'

describe('avatars', () => {
  it('normalises unknown parts to defaults and keeps valid ones', () => {
    expect(normalizeAvatar({ character: '🦊', hat: '👑', glasses: '👓', color: COLORS[2] })).toEqual({
      character: '🦊',
      hat: '👑',
      glasses: '👓',
      color: COLORS[2],
    })
    expect(normalizeAvatar({ character: '💩', hat: 'hat', glasses: 42, color: 'red' })).toEqual(DEFAULT_AVATAR)
    expect(normalizeAvatar(null)).toEqual(DEFAULT_AVATAR)
    expect(normalizeAvatar('🦊')).toEqual(DEFAULT_AVATAR)
  })

  it('generates only valid random avatars', () => {
    for (let i = 0; i < 200; i++) {
      const a = randomAvatar()
      expect(CHARACTERS).toContain(a.character)
      expect(a.hat === null || (HATS as readonly string[]).includes(a.hat)).toBe(true)
      expect(a.glasses === null || (GLASSES as readonly string[]).includes(a.glasses)).toBe(true)
      expect(COLORS).toContain(a.color)
    }
  })

  it('round-trips through encode/decode and survives garbage', () => {
    const a = { character: '🐼', hat: null, glasses: '🕶️', color: COLORS[5]! }
    expect(decodeAvatar(encodeAvatar(a))).toEqual(a)
    expect(decodeAvatar('not json')).toEqual(DEFAULT_AVATAR)
    expect(decodeAvatar(null)).toEqual(DEFAULT_AVATAR)
    expect(decodeAvatar('{"character":"💣"}')).toEqual(DEFAULT_AVATAR)
  })
})

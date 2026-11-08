import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GAMES } from './games'

// Guards the hand-written game data: a typo here would only show up live in front of the class.
describe('hardcoded games', () => {
  it('have unique ids and 4–6 digit pins', () => {
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length)
    expect(new Set(GAMES.map((g) => g.pin)).size).toBe(GAMES.length)
    for (const g of GAMES) expect(g.pin).toMatch(/^\d{4,6}$/)
  })

  it('have well-formed questions', () => {
    for (const g of GAMES) {
      expect(g.questions.length).toBeGreaterThan(0)
      for (const q of g.questions) {
        expect(q.text.trim().length).toBeGreaterThan(0)
        expect(q.answers.length).toBeGreaterThanOrEqual(2)
        expect(q.answers.length).toBeLessThanOrEqual(4)
        expect(q.correctIndex).toBeGreaterThanOrEqual(0)
        expect(q.correctIndex).toBeLessThan(q.answers.length)
        expect(q.timeLimitSec).toBeGreaterThan(0)
        expect(new Set(q.answers).size).toBe(q.answers.length)
      }
    }
  })

  it('put the negative answer first (red) for yes/no and true/false questions', () => {
    const pairs = [
      ['ne', 'ano'],
      ['lež', 'pravda'],
      ['špatně', 'správně'],
    ]
    for (const g of GAMES) {
      for (const q of g.questions) {
        const lower = q.answers.map((a) => a.toLowerCase())
        for (const [negative, positive] of pairs) {
          if (lower.length === 2 && lower.includes(negative!) && lower.includes(positive!)) {
            expect(lower, `${q.text}: negative answer must be first`).toEqual([negative, positive])
          }
        }
      }
    }
  })

  it('reference images that exist under public/', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../public')
    for (const g of GAMES) {
      for (const q of g.questions) {
        if (!q.image) continue
        expect(q.image).toMatch(/^\/img\/[a-z0-9-]+\.(svg|png|jpg|webp)$/)
        expect(existsSync(path.join(publicDir, q.image))).toBe(true)
      }
    }
  })
})

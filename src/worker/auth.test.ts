import { describe, expect, it } from 'vitest'
import { checkPassword, issueHostToken, TOKEN_TTL_MS, verifyHostToken } from './auth'

const NOW = 1_700_000_000_000

describe('host auth', () => {
  it('accepts the right password and rejects wrong or empty ones', () => {
    expect(checkPassword('s3cret', 's3cret')).toBe(true)
    expect(checkPassword('s3cret', 'S3cret')).toBe(false)
    expect(checkPassword('s3cret', '')).toBe(false)
    expect(checkPassword('', '')).toBe(false)
  })

  it('issues a token that verifies with the same secret', async () => {
    const token = await issueHostToken('s3cret', NOW)
    expect(await verifyHostToken('s3cret', token, NOW)).toBe(true)
    expect(await verifyHostToken('s3cret', token, NOW + TOKEN_TTL_MS - 1)).toBe(true)
  })

  it('rejects tokens signed with another secret or tampered with', async () => {
    const token = await issueHostToken('s3cret', NOW)
    expect(await verifyHostToken('other', token, NOW)).toBe(false)
    expect(await verifyHostToken('s3cret', token.slice(0, -1) + '0', NOW)).toBe(false)
    expect(await verifyHostToken('s3cret', `${NOW + 1}.${token.split('.')[1]}`, NOW)).toBe(false)
    expect(await verifyHostToken('s3cret', 'garbage', NOW)).toBe(false)
    expect(await verifyHostToken('s3cret', null, NOW)).toBe(false)
  })

  it('expires after 24 hours', async () => {
    const token = await issueHostToken('s3cret', NOW)
    expect(await verifyHostToken('s3cret', token, NOW + TOKEN_TTL_MS + 1)).toBe(false)
  })
})

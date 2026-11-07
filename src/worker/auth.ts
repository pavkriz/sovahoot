// Host authentication without sessions: the token is `issuedAtMs.hmac(issuedAtMs)` signed with the
// HOST_PASSWORD secret and valid for 24 hours. Nothing is stored server-side.

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const encoder = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function checkPassword(secret: string, password: string): boolean {
  return secret.length > 0 && safeEqual(secret, password)
}

export async function issueHostToken(secret: string, now: number): Promise<string> {
  const issuedAt = String(now)
  return `${issuedAt}.${await hmacHex(secret, issuedAt)}`
}

export async function verifyHostToken(secret: string, token: string | null | undefined, now: number): Promise<boolean> {
  if (!token || secret.length === 0) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const issuedAt = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const issuedMs = Number(issuedAt)
  if (!Number.isFinite(issuedMs) || now - issuedMs > TOKEN_TTL_MS || issuedMs > now + 60_000) return false
  return safeEqual(await hmacHex(secret, issuedAt), sig)
}

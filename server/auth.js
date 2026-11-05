// Accounts: email + password (scrypt) and Google sign-in (OAuth 2.0 code flow
// with state + PKCE). Sessions are random tokens in an HTTP-only cookie; only
// their SHA-256 hash is stored, so a leaked database can't be used to log in.
import crypto from 'node:crypto'
import express from 'express'

export const SESSION_COOKIE = 'tl_session'
const OAUTH_COOKIE = 'tl_oauth'
const SESSION_MS = 30 * 24 * 3600 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
const b64url = (buf) => Buffer.from(buf).toString('base64url')

// ---------- cookies ----------
export function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) {
      const k = part.slice(0, i).trim()
      try { out[k] = decodeURIComponent(part.slice(i + 1).trim()) } catch { /* ignore malformed */ }
    }
  }
  return out
}

function setCookie(res, name, value, { maxAgeMs, secure, path = '/' }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax']
  if (maxAgeMs != null) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`)
  if (secure) parts.push('Secure')
  res.append('Set-Cookie', parts.join('; '))
}

// ---------- passwords ----------
const SCRYPT = { N: 16384, r: 8, p: 1 }
export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}
export function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$')
  if (alg !== 'scrypt' || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) })
  return crypto.timingSafeEqual(actual, expected)
}
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'))

// Small fixed-window limiter for login/register (brute-force protection).
function attemptLimiter(max, windowMs) {
  const hits = new Map()
  return (req, res, next) => {
    const now = Date.now()
    const key = req.ip
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs)
    if (recent.length >= max) return res.status(429).json({ error: 'Too many attempts — please wait a few minutes.', code: 'too_many_attempts' })
    recent.push(now)
    hits.set(key, recent)
    if (hits.size > 10000) hits.clear()
    next()
  }
}

export function createAuth({ db, config, fetchImpl = globalThis.fetch }) {
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userByGoogle: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    insertUser: db.prepare('INSERT INTO users (id, email, name, password_hash, google_sub, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    linkGoogle: db.prepare('UPDATE users SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    sessionUser: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  }
  const google = config.google || {}
  const googleEnabled = !!(google.clientId && google.clientSecret)

  function publicUser(u) {
    return u ? { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatar_url || null, google: !!u.google_sub, hasPassword: !!u.password_hash } : null
  }
  function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url')
    const now = Date.now()
    q.insertSession.run(sha256(token), userId, now, now + SESSION_MS)
    setCookie(res, SESSION_COOKIE, token, { maxAgeMs: SESSION_MS, secure: req.secure })
    if (Math.random() < 0.05) q.purgeSessions.run(now)
  }
  function createUser({ email, name, passwordHash = null, googleSub = null, avatarUrl = null }) {
    const id = crypto.randomUUID()
    q.insertUser.run(id, email, name, passwordHash, googleSub, avatarUrl, Date.now())
    return { id, email, name, password_hash: passwordHash, google_sub: googleSub, avatar_url: avatarUrl }
  }

  // Attach req.user from the session cookie (every request).
  function loadUser(req, res, next) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (token) {
      const u = q.sessionUser.get(sha256(token), Date.now())
      if (u) req.user = u
    }
    next()
  }
  function requireUser(req, res, next) {
    if (req.user) return next()
    res.status(401).json({ error: 'Please log in to use the AI features.', code: 'auth_required' })
  }
  // Defence in depth on top of SameSite=Lax: reject cross-site state-changing requests.
  function sameOrigin(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    const origin = req.headers.origin
    if (!origin) return next()
    try { if (new URL(origin).host === req.headers.host) return next() } catch { /* fall through */ }
    res.status(403).json({ error: 'Cross-site request blocked.', code: 'cross_site' })
  }

  // Google redirect URI: only for hosts we serve (localhost, ALLOWED_HOSTS, PUBLIC_URL).
  function baseUrl(req) {
    const allowed = new Set([`localhost:${config.port}`, `127.0.0.1:${config.port}`, ...(config.allowedHosts || [])])
    if (config.publicUrl) allowed.add(new URL(config.publicUrl).host)
    const host = req.headers.host
    if (allowed.has(host)) return `${req.protocol}://${host}`
    return config.publicUrl || `http://localhost:${config.port}`
  }
  const safeReturnTo = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v.slice(0, 200) : '/app')

  const router = express.Router()
  router.use(express.json({ limit: '16kb' }))
  const limitAttempts = attemptLimiter(Number(config.authAttemptsPer15Min || 20), 15 * 60 * 1000)

  router.get('/config', (req, res) => res.json({ google: googleEnabled }))
  router.get('/me', (req, res) => res.json({ user: publicUser(req.user) }))

  router.post('/register', limitAttempts, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim().slice(0, 60) || email.split('@')[0]
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.', code: 'invalid_email' })
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be at least 8 characters.', code: 'weak_password' })
    if (q.userByEmail.get(email)) return res.status(409).json({ error: 'This email is already registered.', code: 'email_taken' })
    const user = createUser({ email, name, passwordHash: hashPassword(password) })
    startSession(req, res, user.id)
    res.status(201).json({ user: publicUser(user) })
  })

  router.post('/login', limitAttempts, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const user = email ? q.userByEmail.get(email) : null
    // Same work whether or not the account exists (no timing-based email probing).
    const ok = verifyPassword(password, user?.password_hash || DUMMY_HASH) && !!user?.password_hash
    if (!ok) return res.status(401).json({ error: 'Wrong email or password.', code: 'invalid_credentials' })
    startSession(req, res, user.id)
    res.json({ user: publicUser(user) })
  })

  router.post('/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (token) q.deleteSession.run(sha256(token))
    setCookie(res, SESSION_COOKIE, '', { maxAgeMs: 0, secure: req.secure })
    res.json({ ok: true })
  })

  // ---------- Google ----------
  router.get('/google', (req, res) => {
    if (!googleEnabled) return res.status(404).json({ error: 'Google sign-in is not configured.', code: 'google_disabled' })
    const state = crypto.randomBytes(16).toString('base64url')
    const verifier = crypto.randomBytes(32).toString('base64url')
    const returnTo = safeReturnTo(req.query.returnTo)
    setCookie(res, OAUTH_COOKIE, `${state}.${verifier}.${b64url(returnTo)}`, { maxAgeMs: 10 * 60 * 1000, secure: req.secure, path: '/api/auth/google' })
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })
    res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  })

  router.get('/google/callback', async (req, res) => {
    const fail = (code) => res.redirect(302, `/app?auth_error=${code}`)
    if (!googleEnabled) return fail('google_disabled')
    const [state, verifier, rt] = String(parseCookies(req.headers.cookie)[OAUTH_COOKIE] || '').split('.')
    setCookie(res, OAUTH_COOKIE, '', { maxAgeMs: 0, secure: req.secure, path: '/api/auth/google' })
    if (req.query.error) return fail('google_cancelled')
    const given = String(req.query.state || '')
    if (!state || !verifier || given.length !== state.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(state))) return fail('google_state')
    try {
      const tokenRes = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(req.query.code || ''), client_id: google.clientId, client_secret: google.clientSecret,
          redirect_uri: `${baseUrl(req)}/api/auth/google/callback`, grant_type: 'authorization_code', code_verifier: verifier,
        }),
      })
      const tokens = await tokenRes.json()
      if (!tokenRes.ok || !tokens.access_token) throw new Error(tokens.error_description || tokens.error || `token HTTP ${tokenRes.status}`)
      const infoRes = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
      const info = await infoRes.json()
      if (!infoRes.ok || !info.sub || !info.email) throw new Error('userinfo failed')
      if (!info.email_verified) return fail('google_unverified')
      const email = String(info.email).toLowerCase()
      let user = q.userByGoogle.get(String(info.sub))
      if (!user) {
        const existing = q.userByEmail.get(email)
        if (existing) {
          q.linkGoogle.run(String(info.sub), info.picture || null, existing.id)
          user = existing
        } else {
          user = createUser({ email, name: String(info.name || email.split('@')[0]).slice(0, 60), googleSub: String(info.sub), avatarUrl: info.picture || null })
        }
      }
      startSession(req, res, user.id)
      let returnTo = '/app'
      try { returnTo = safeReturnTo(Buffer.from(rt || '', 'base64url').toString()) } catch { /* default */ }
      res.redirect(302, returnTo)
    } catch (e) {
      console.warn(`[auth/google] ${e.message}`)
      fail('google_failed')
    }
  })

  return { router, loadUser, requireUser, sameOrigin, publicUser, googleEnabled }
}

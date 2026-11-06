// Accounts: email + password (scrypt) and Google sign-in (OAuth 2.0 code flow
// with state + PKCE). Sessions are random tokens in an HTTP-only cookie; only
// their SHA-256 hash is stored, so a leaked database can't be used to log in.
import crypto from 'node:crypto'
import express from 'express'
import { createMailer, verificationEmail } from './mailer.js'

export const SESSION_COOKIE = 'tl_session'
const OAUTH_COOKIE = 'tl_oauth'
const SESSION_MS = 30 * 24 * 3600 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Email verification: a 6-digit code (typed in the app) and a one-tap link, both short-lived.
const CODE_MINUTES = 30
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_CODE_ATTEMPTS = 5

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

export function createAuth({ db, config, fetchImpl = globalThis.fetch, mailer = createMailer({}) }) {
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userByGoogle: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    insertUser: db.prepare('INSERT INTO users (id, email, name, password_hash, google_sub, avatar_url, created_at, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    markVerified: db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL'),
    dropPassword: db.prepare('UPDATE users SET password_hash = NULL WHERE id = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    codeFor: db.prepare('SELECT * FROM email_codes WHERE user_id = ?'),
    codeByLink: db.prepare('SELECT * FROM email_codes WHERE link_hash = ?'),
    upsertCode: db.prepare(`INSERT INTO email_codes (user_id, code_hash, link_hash, attempts, sent_at, expires_at) VALUES (?, ?, ?, 0, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, link_hash = excluded.link_hash, attempts = 0, sent_at = excluded.sent_at, expires_at = excluded.expires_at`),
    bumpAttempts: db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?'),
    deleteCode: db.prepare('DELETE FROM email_codes WHERE user_id = ?'),
    linkGoogle: db.prepare('UPDATE users SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    sessionUser: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  }
  const google = config.google || {}
  const googleEnabled = !!(google.clientId && google.clientSecret)

  function publicUser(u) {
    return u ? { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatar_url || null, google: !!u.google_sub, hasPassword: !!u.password_hash, emailVerified: !!u.email_verified_at } : null
  }
  function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url')
    const now = Date.now()
    q.insertSession.run(sha256(token), userId, now, now + SESSION_MS)
    setCookie(res, SESSION_COOKIE, token, { maxAgeMs: SESSION_MS, secure: req.secure })
    if (Math.random() < 0.05) q.purgeSessions.run(now)
  }
  function createUser({ email, name, passwordHash = null, googleSub = null, avatarUrl = null, verified = false }) {
    const id = crypto.randomUUID()
    const now = Date.now()
    q.insertUser.run(id, email, name, passwordHash, googleSub, avatarUrl, now, verified ? now : null)
    return { id, email, name, password_hash: passwordHash, google_sub: googleSub, avatar_url: avatarUrl, email_verified_at: verified ? now : null }
  }

  // ---------- email verification ----------
  const codeHash = (userId, code) => sha256(`${userId}:${code}`)
  function markVerified(userId) {
    q.markVerified.run(Date.now(), userId)
    q.deleteCode.run(userId)
  }
  // New code + link (replacing any earlier one), emailed to the account. → { sent, resendIn }
  async function sendVerification(req, user, locale) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const token = crypto.randomBytes(24).toString('base64url')
    const now = Date.now()
    q.upsertCode.run(user.id, codeHash(user.id, code), sha256(token), now, now + CODE_MINUTES * 60 * 1000)
    const mail = verificationEmail({ name: user.name, code, link: `${baseUrl(req)}/api/auth/verify-email?token=${token}`, minutes: CODE_MINUTES, locale })
    const r = await mailer.send({ to: user.email, ...mail })
    return { sent: !!r.sent, resendIn: RESEND_COOLDOWN_MS / 1000 }
  }
  const localeOf = (v) => (v === 'id' ? 'id' : 'en')

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
  // AI features (and the credits they spend) need a verified email — no free credits for made-up addresses.
  function requireVerified(req, res, next) {
    if (req.user?.email_verified_at) return next()
    res.status(403).json({ error: 'Verify your email to use the AI features.', code: 'email_unverified' })
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

  router.post('/register', limitAttempts, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim().slice(0, 60) || email.split('@')[0]
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.', code: 'invalid_email' })
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be at least 8 characters.', code: 'weak_password' })
    if (q.userByEmail.get(email)) return res.status(409).json({ error: 'This email is already registered.', code: 'email_taken' })
    const user = createUser({ email, name, passwordHash: hashPassword(password) })
    startSession(req, res, user.id)
    // The account exists either way; if the email could not be sent the app offers "send again".
    let verification = { sent: false, resendIn: 0 }
    try { verification = await sendVerification(req, user, localeOf(req.body?.locale)) } catch (e) { console.warn(`[auth/verify] ${e.message}`) }
    res.status(201).json({ user: publicUser(user), verification })
  })

  // Code typed in the app (logged in).
  router.post('/verify-email', limitAttempts, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.', code: 'auth_required' })
    if (req.user.email_verified_at) return res.json({ user: publicUser(req.user) })
    const code = String(req.body?.code || '').replace(/\D/g, '')
    const row = q.codeFor.get(req.user.id)
    if (!row || row.expires_at <= Date.now()) return res.status(410).json({ error: 'This code has expired — send a new one.', code: 'code_expired' })
    if (row.attempts >= MAX_CODE_ATTEMPTS) return res.status(429).json({ error: 'Too many wrong codes — send a new one.', code: 'code_locked' })
    const ok = code.length === 6 && crypto.timingSafeEqual(Buffer.from(codeHash(req.user.id, code)), Buffer.from(row.code_hash))
    if (!ok) {
      q.bumpAttempts.run(req.user.id)
      return res.status(400).json({ error: 'That code is not right.', code: 'invalid_code', attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - row.attempts - 1) })
    }
    markVerified(req.user.id)
    res.json({ user: publicUser(q.userById.get(req.user.id)) })
  })

  // One-tap link from the email; works in any browser, logged in or not.
  router.get('/verify-email', (req, res) => {
    const token = String(req.query.token || '')
    const row = token ? q.codeByLink.get(sha256(token)) : null
    if (!row) return res.redirect(302, '/app?verify_error=invalid')
    if (row.expires_at <= Date.now()) return res.redirect(302, '/app?verify_error=expired')
    markVerified(row.user_id)
    res.redirect(302, '/app?verified=1')
  })

  router.post('/resend-verification', limitAttempts, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.', code: 'auth_required' })
    if (req.user.email_verified_at) return res.json({ user: publicUser(req.user) })
    const row = q.codeFor.get(req.user.id)
    const wait = row ? row.sent_at + RESEND_COOLDOWN_MS - Date.now() : 0
    if (wait > 0) return res.status(429).json({ error: `Wait ${Math.ceil(wait / 1000)} s before sending another code.`, code: 'resend_too_soon', retryIn: Math.ceil(wait / 1000) })
    try {
      res.json({ verification: await sendVerification(req, req.user, localeOf(req.body?.locale)) })
    } catch (e) {
      console.warn(`[auth/verify] ${e.message}`)
      res.status(502).json({ error: 'The email could not be sent — try again in a minute.', code: 'email_failed' })
    }
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
          // An email + password account that never proved the address may have been made by someone else:
          // Google proves it now, so that password and its sessions stop working.
          if (!existing.email_verified_at && existing.password_hash) {
            q.dropPassword.run(existing.id)
            q.deleteUserSessions.run(existing.id)
          }
          q.linkGoogle.run(String(info.sub), info.picture || null, existing.id)
          user = existing
        } else {
          user = createUser({ email, name: String(info.name || email.split('@')[0]).slice(0, 60), googleSub: String(info.sub), avatarUrl: info.picture || null, verified: true })
        }
      }
      if (!user.email_verified_at) markVerified(user.id) // Google verified this address (email_verified above)
      startSession(req, res, user.id)
      let returnTo = '/app'
      try { returnTo = safeReturnTo(Buffer.from(rt || '', 'base64url').toString()) } catch { /* default */ }
      res.redirect(302, returnTo)
    } catch (e) {
      console.warn(`[auth/google] ${e.message}`)
      fail('google_failed')
    }
  })

  return { router, loadUser, requireUser, requireVerified, sameOrigin, publicUser, googleEnabled }
}

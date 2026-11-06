// Accounts, sessions, Google sign-in (with a fake Google) and saved designs.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp, readConfig } from '../server/server.js'
import { openDb } from '../server/db.js'
import { hashPassword, verifyPassword, parseCookies } from '../server/auth.js'
import { buildDemoRoomGraph } from '../src/lib/roomGraph.js'

function fakeGoogle({ email = 'ayu@gmail.com', verified = true, sub = 'g-123' } = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init?.body ? String(init.body) : '' })
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
    if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'at-1', id_token: 'x' })
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ sub, email, email_verified: verified, name: 'Ayu Lestari', picture: 'https://lh3.googleusercontent.com/a.png' })
    return json({ error: 'unexpected' }, 500)
  }
  return { fetchImpl, calls }
}

// Verification emails are captured instead of sent.
const mail = []
const testMailer = { send: async (m) => { mail.push(m); return { sent: true } } }
const lastMail = (to) => [...mail].reverse().find(m => m.to === to)
const codeFor = (to) => lastMail(to)?.text.split('\n').map(l => l.trim()).find(l => /^\d{6}$/.test(l))
const linkFor = (to) => lastMail(to)?.text.match(/https?:\/\/\S+\/api\/auth\/verify-email\?token=\S+/)?.[0]

async function start(env = {}, fetchImpl) {
  const config = { ...readConfig({}), apiKey: 'k', rateLimit: 0, port: 5173, ...env }
  const db = openDb(':memory:')
  const app = createApp({ config, fetchImpl, db, mailer: testMailer })
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)) })
  const base = `http://127.0.0.1:${server.address().port}`
  return { server, base, db }
}
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0]
const req = (base, path, { method = 'GET', body, cookie, headers = {} } = {}) => fetch(base + path, {
  method, redirect: 'manual',
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
})

describe('passwords', () => {
  it('scrypt hashes verify and are salted', () => {
    const a = hashPassword('rahasia123'), b = hashPassword('rahasia123')
    assert.notEqual(a, b)
    assert.ok(verifyPassword('rahasia123', a))
    assert.ok(!verifyPassword('salah123', a))
    assert.ok(!verifyPassword('x', 'garbage'))
  })
  it('parses cookies', () => {
    assert.deepEqual(parseCookies('a=1; tl_session=abc%3D'), { a: '1', tl_session: 'abc=' })
  })
})

describe('email + password accounts', () => {
  let s
  before(async () => { s = await start() })
  after(() => s.server.close())

  it('register → session cookie → /me', async () => {
    const r = await req(s.base, '/api/auth/register', { method: 'POST', body: { name: 'Budi', email: 'Budi@Example.com', password: 'kata-sandi-aman' } })
    assert.equal(r.status, 201)
    const set = r.headers.get('set-cookie')
    assert.match(set, /tl_session=/)
    assert.match(set, /HttpOnly/)
    assert.match(set, /SameSite=Lax/)
    const me = await (await req(s.base, '/api/auth/me', { cookie: cookieOf(r) })).json()
    assert.equal(me.user.email, 'budi@example.com')
    assert.equal(me.user.name, 'Budi')
    assert.equal(me.user.hasPassword, true)
  })
  it('rejects duplicates, bad emails and short passwords', async () => {
    const dup = await req(s.base, '/api/auth/register', { method: 'POST', body: { email: 'budi@example.com', password: 'another-pass' } })
    assert.equal(dup.status, 409)
    assert.equal((await dup.json()).code, 'email_taken')
    assert.equal((await (await req(s.base, '/api/auth/register', { method: 'POST', body: { email: 'nope', password: 'longenough' } })).json()).code, 'invalid_email')
    assert.equal((await (await req(s.base, '/api/auth/register', { method: 'POST', body: { email: 'c@d.co', password: 'short' } })).json()).code, 'weak_password')
  })
  it('login works; wrong password and unknown email give the same answer', async () => {
    const ok = await req(s.base, '/api/auth/login', { method: 'POST', body: { email: 'BUDI@example.com', password: 'kata-sandi-aman' } })
    assert.equal(ok.status, 200)
    const wrong = await req(s.base, '/api/auth/login', { method: 'POST', body: { email: 'budi@example.com', password: 'nope-nope' } })
    const unknown = await req(s.base, '/api/auth/login', { method: 'POST', body: { email: 'ghost@example.com', password: 'nope-nope' } })
    assert.equal(wrong.status, 401)
    assert.deepEqual(await wrong.json(), await unknown.json())
  })
  it('logout ends the session', async () => {
    const login = await req(s.base, '/api/auth/login', { method: 'POST', body: { email: 'budi@example.com', password: 'kata-sandi-aman' } })
    const cookie = cookieOf(login)
    await req(s.base, '/api/auth/logout', { method: 'POST', cookie })
    const me = await (await req(s.base, '/api/auth/me', { cookie })).json()
    assert.equal(me.user, null)
  })
  it('AI routes require login (credits are protected)', async () => {
    const r = await req(s.base, '/api/design', { method: 'POST', body: { roomType: 'living' } })
    assert.equal(r.status, 401)
    assert.equal((await r.json()).code, 'auth_required')
  })
  it('blocks cross-site POSTs', async () => {
    const r = await req(s.base, '/api/auth/login', { method: 'POST', body: { email: 'budi@example.com', password: 'kata-sandi-aman' }, headers: { Origin: 'https://evil.example' } })
    assert.equal(r.status, 403)
  })
})

describe('Google sign-in', () => {
  it('is hidden when not configured', async () => {
    const s = await start()
    try {
      assert.equal((await (await req(s.base, '/api/health')).json()).auth.google, false)
      assert.equal((await req(s.base, '/api/auth/google')).status, 404)
    } finally { s.server.close() }
  })

  it('redirects to Google with state + PKCE, then creates the account on callback', async () => {
    const g = fakeGoogle()
    const s = await start({ google: { clientId: 'cid', clientSecret: 'secret' } }, g.fetchImpl)
    try {
      const go = await req(s.base, '/api/auth/google?returnTo=/designs')
      assert.equal(go.status, 302)
      const url = new URL(go.headers.get('location'))
      assert.equal(url.host, 'accounts.google.com')
      assert.equal(url.searchParams.get('client_id'), 'cid')
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
      assert.equal(url.searchParams.get('scope'), 'openid email profile')
      const oauthCookie = cookieOf(go)
      const state = url.searchParams.get('state')

      const bad = await req(s.base, `/api/auth/google/callback?code=c&state=wrong-state-value-xx`, { cookie: oauthCookie })
      assert.match(bad.headers.get('location'), /auth_error=google_state/)

      const cb = await req(s.base, `/api/auth/google/callback?code=c1&state=${state}`, { cookie: oauthCookie })
      assert.equal(cb.status, 302)
      assert.equal(cb.headers.get('location'), '/designs')
      const tokenCall = g.calls.find(c => c.url.includes('oauth2.googleapis.com/token'))
      assert.match(tokenCall.body, /code_verifier=/)
      assert.match(tokenCall.body, /client_secret=secret/)
      const session = (cb.headers.get('set-cookie') || '').match(/tl_session=[^;]+/)[0]
      const me = await (await req(s.base, '/api/auth/me', { cookie: session })).json()
      assert.equal(me.user.email, 'ayu@gmail.com')
      assert.equal(me.user.google, true)
      assert.equal(me.user.hasPassword, false)
    } finally { s.server.close() }
  })

  it('links Google to an existing verified email account (the password keeps working)', async () => {
    const g = fakeGoogle({ email: 'sari@example.com', sub: 'g-777' })
    const s = await start({ google: { clientId: 'cid', clientSecret: 'secret' } }, g.fetchImpl)
    try {
      const reg = await req(s.base, '/api/auth/register', { method: 'POST', body: { name: 'Sari', email: 'sari@example.com', password: 'password-sari' } })
      await req(s.base, '/api/auth/verify-email', { method: 'POST', cookie: cookieOf(reg), body: { code: codeFor('sari@example.com') } })
      const go = await req(s.base, '/api/auth/google')
      const state = new URL(go.headers.get('location')).searchParams.get('state')
      const cb = await req(s.base, `/api/auth/google/callback?code=c&state=${state}`, { cookie: cookieOf(go) })
      const session = (cb.headers.get('set-cookie') || '').match(/tl_session=[^;]+/)[0]
      const me = (await (await req(s.base, '/api/auth/me', { cookie: session })).json()).user
      assert.equal(me.name, 'Sari')
      assert.equal(me.google, true)
      assert.equal(me.hasPassword, true)
      assert.equal(me.emailVerified, true)
    } finally { s.server.close() }
  })

  it('Google takes back an email someone registered without verifying it', async () => {
    const g = fakeGoogle({ email: 'owner@example.com', sub: 'g-owner' })
    const s = await start({ google: { clientId: 'cid', clientSecret: 'secret' } }, g.fetchImpl)
    try {
      const squatter = cookieOf(await req(s.base, '/api/auth/register', { method: 'POST', body: { name: 'Not the owner', email: 'owner@example.com', password: 'squatter-pass' } }))
      const go = await req(s.base, '/api/auth/google')
      const state = new URL(go.headers.get('location')).searchParams.get('state')
      const cb = await req(s.base, `/api/auth/google/callback?code=c&state=${state}`, { cookie: cookieOf(go) })
      const session = (cb.headers.get('set-cookie') || '').match(/tl_session=[^;]+/)[0]
      const me = (await (await req(s.base, '/api/auth/me', { cookie: session })).json()).user
      assert.equal(me.google, true)
      assert.equal(me.emailVerified, true)
      assert.equal(me.hasPassword, false) // the unproven password is gone…
      assert.equal((await (await req(s.base, '/api/auth/me', { cookie: squatter })).json()).user, null) // …and so is its session
      assert.equal((await req(s.base, '/api/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: 'squatter-pass' } })).status, 401)
    } finally { s.server.close() }
  })

  it('refuses Google accounts whose email Google has not verified', async () => {

    const g2 = fakeGoogle({ email: 'x@y.com', verified: false })
    const s2 = await start({ google: { clientId: 'cid', clientSecret: 'secret' } }, g2.fetchImpl)
    try {
      const go = await req(s2.base, '/api/auth/google')
      const state = new URL(go.headers.get('location')).searchParams.get('state')
      const cb = await req(s2.base, `/api/auth/google/callback?code=c&state=${state}`, { cookie: cookieOf(go) })
      assert.match(cb.headers.get('location'), /auth_error=google_unverified/)
    } finally { s2.server.close() }
  })
})

describe('email verification', () => {
  let s
  before(async () => { s = await start() })
  after(() => s.server.close())
  const register = async (email) => {
    const r = await req(s.base, '/api/auth/register', { method: 'POST', body: { name: 'Rina', email, password: 'rina-password', locale: 'id' } })
    return { r, body: await r.json(), cookie: cookieOf(r) }
  }

  it('new email accounts start unverified, get a code + link by email, and cannot use AI yet', async () => {
    const { r, body, cookie } = await register('rina@example.com')
    assert.equal(r.status, 201)
    assert.equal(body.user.emailVerified, false)
    assert.deepEqual(body.verification, { sent: true, resendIn: 60 })
    const m = lastMail('rina@example.com')
    assert.match(m.subject, /Kode verifikasi Tataloka: \d{6}/) // in the user's language
    assert.match(codeFor('rina@example.com'), /^\d{6}$/)
    assert.ok(linkFor('rina@example.com'))
    assert.ok(!m.html.includes('<script'))
    const ai = await req(s.base, '/api/design', { method: 'POST', cookie, body: { roomType: 'living' } })
    assert.equal(ai.status, 403)
    assert.equal((await ai.json()).code, 'email_unverified')
  })

  it('a wrong code counts down, the right code verifies', async () => {
    const { cookie } = await register('dewi@example.com')
    const code = codeFor('dewi@example.com')
    const wrong = await req(s.base, '/api/auth/verify-email', { method: 'POST', cookie, body: { code: code === '000000' ? '111111' : '000000' } })
    assert.equal(wrong.status, 400)
    assert.deepEqual(await wrong.json(), { error: 'That code is not right.', code: 'invalid_code', attemptsLeft: 4 })
    const ok = await req(s.base, '/api/auth/verify-email', { method: 'POST', cookie, body: { code: ` ${code.slice(0, 3)} ${code.slice(3)} ` } })
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).user.emailVerified, true)
    assert.equal((await (await req(s.base, '/api/auth/me', { cookie })).json()).user.emailVerified, true)
    // the code is used up; AI routes now pass the verification gate (and reach the Meta call)
    const ai = await req(s.base, '/api/design', { method: 'POST', cookie, body: { roomType: 'living' } })
    assert.notEqual(ai.status, 403)
  })

  it('locks after 5 wrong codes until a new one is sent', async () => {
    const { cookie } = await register('eka@example.com')
    const code = codeFor('eka@example.com')
    const bad = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await req(s.base, '/api/auth/verify-email', { method: 'POST', cookie, body: { code: bad } })
    const locked = await req(s.base, '/api/auth/verify-email', { method: 'POST', cookie, body: { code } })
    assert.equal(locked.status, 429)
    assert.equal((await locked.json()).code, 'code_locked')
  })

  it('resending waits a minute between emails', async () => {
    const { cookie } = await register('fajar@example.com')
    const again = await req(s.base, '/api/auth/resend-verification', { method: 'POST', cookie, body: { locale: 'en' } })
    assert.equal(again.status, 429)
    const body = await again.json()
    assert.equal(body.code, 'resend_too_soon')
    assert.ok(body.retryIn > 0 && body.retryIn <= 60)
    assert.equal((await req(s.base, '/api/auth/resend-verification', { method: 'POST' })).status, 401)
  })

  it('the email link verifies in any browser; bad links say so', async () => {
    const { cookie } = await register('gita@example.com')
    const link = new URL(linkFor('gita@example.com'))
    const go = await req(s.base, link.pathname + link.search) // no session cookie
    assert.equal(go.status, 302)
    assert.equal(go.headers.get('location'), '/app?verified=1')
    assert.equal((await (await req(s.base, '/api/auth/me', { cookie })).json()).user.emailVerified, true)
    assert.equal((await req(s.base, link.pathname + link.search)).headers.get('location'), '/app?verify_error=invalid') // used up
    assert.equal((await req(s.base, '/api/auth/verify-email?token=nope')).headers.get('location'), '/app?verify_error=invalid')
  })

  it('the email is in the language of the sign-up, with the Tataloka logo', async () => {
    await register('lang-id@example.com')
    const id = lastMail('lang-id@example.com')
    assert.match(id.html, /<html lang="id">/)
    assert.match(id.html, /Halo Rina,/)
    assert.match(id.html, /Kode verifikasi/)
    assert.match(id.html, /Verifikasi email/)
    assert.doesNotMatch(id.html, /Verify email|Enter this code/)
    assert.match(id.html, /<img src="https:\/\/www\.tataloka\.com\/icons\/icon-192\.png"[^>]*alt="Tataloka"/)

    const r = await req(s.base, '/api/auth/register', { method: 'POST', body: { name: 'Ann', email: 'lang-en@example.com', password: 'ann-password-1', locale: 'en' } })
    const en = lastMail('lang-en@example.com')
    assert.match(en.subject, /^Your Tataloka verification code: \d{6}$/)
    assert.match(en.html, /<html lang="en">/)
    assert.match(en.html, /Hi Ann,/)
    assert.doesNotMatch(en.html, /Kode verifikasi|Halo/)

    // "send a new code" without a language keeps the sign-up language
    s.db.prepare('UPDATE email_codes SET sent_at = 0').run() // skip the 60 s wait
    assert.equal((await req(s.base, '/api/auth/resend-verification', { method: 'POST', cookie: cookieOf(r) })).status, 200)
    assert.match(lastMail('lang-en@example.com').subject, /^Your Tataloka verification code/)
  })

  it('Google sign-ups are verified right away', async () => {
    const g = fakeGoogle({ email: 'hana@gmail.com', sub: 'g-hana' })
    const s2 = await start({ google: { clientId: 'cid', clientSecret: 'secret' } }, g.fetchImpl)
    try {
      const go = await req(s2.base, '/api/auth/google')
      const state = new URL(go.headers.get('location')).searchParams.get('state')
      const cb = await req(s2.base, `/api/auth/google/callback?code=c&state=${state}`, { cookie: cookieOf(go) })
      const session = (cb.headers.get('set-cookie') || '').match(/tl_session=[^;]+/)[0]
      assert.equal((await (await req(s2.base, '/api/auth/me', { cookie: session })).json()).user.emailVerified, true)
    } finally { s2.server.close() }
  })

  it('existing databases: Google accounts become verified, email accounts must verify', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tl-')), 'old.db')
    const old = new DatabaseSync(file)
    old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT, google_sub TEXT UNIQUE, avatar_url TEXT, created_at INTEGER NOT NULL);
      INSERT INTO users VALUES ('a', 'a@gmail.com', 'A', NULL, 'g-a', NULL, 1000), ('b', 'b@example.com', 'B', 'scrypt$x', NULL, NULL, 2000);`)
    old.close()
    const db = openDb(file)
    const rows = db.prepare('SELECT id, email_verified_at FROM users ORDER BY id').all()
    assert.deepEqual(rows.map(r => [r.id, r.email_verified_at]), [['a', 1000], ['b', null]])
    db.close()
  })
})

describe('saved designs', () => {
  let s, alice, bob
  before(async () => {
    s = await start()
    alice = cookieOf(await req(s.base, '/api/auth/register', { method: 'POST', body: { name: 'Alice', email: 'alice@example.com', password: 'alice-password' } }))
    bob = cookieOf(await req(s.base, '/api/auth/register', { method: 'POST', body: { name: 'Bob', email: 'bob@example.com', password: 'bob-password!' } }))
  })
  after(() => s.server.close())

  it('requires login', async () => {
    assert.equal((await req(s.base, '/api/designs')).status, 401)
  })
  it('create → list → open → update → delete', async () => {
    const graph = buildDemoRoomGraph('bedroom', 'Japandi', 'en')
    const created = await req(s.base, '/api/designs', { method: 'POST', cookie: alice, body: { graph } })
    assert.equal(created.status, 201)
    const { design } = await created.json()
    assert.equal(design.roomType, 'bedroom')
    assert.equal(design.totalIDR, graph.layout.budget.totalIDR)
    assert.ok(design.images.length > 0 && design.images.every(u => u.startsWith('https://')))

    const list = (await (await req(s.base, '/api/designs', { cookie: alice })).json()).designs
    assert.equal(list.length, 1)
    const full = (await (await req(s.base, `/api/designs/${design.id}`, { cookie: alice })).json()).design
    assert.equal(full.graph.layout.placedItems.length, graph.layout.placedItems.length)

    const edited = { ...graph, title: 'Kamar Baru', layout: { ...graph.layout, placedItems: graph.layout.placedItems.slice(1) } }
    const upd = await (await req(s.base, `/api/designs/${design.id}`, { method: 'PUT', cookie: alice, body: { graph: edited } })).json()
    assert.equal(upd.design.title, 'Kamar Baru')
    assert.equal(upd.design.itemCount, graph.layout.placedItems.length - 1)

    assert.equal((await req(s.base, `/api/designs/${design.id}`, { method: 'DELETE', cookie: alice })).status, 200)
    assert.equal((await (await req(s.base, '/api/designs', { cookie: alice })).json()).designs.length, 0)
  })
  it('users cannot see or change each other’s designs', async () => {
    const { design } = await (await req(s.base, '/api/designs', { method: 'POST', cookie: alice, body: { graph: buildDemoRoomGraph('living', 'Modern', 'en') } })).json()
    assert.equal((await (await req(s.base, '/api/designs', { cookie: bob })).json()).designs.length, 0)
    assert.equal((await req(s.base, `/api/designs/${design.id}`, { cookie: bob })).status, 404)
    assert.equal((await req(s.base, `/api/designs/${design.id}`, { method: 'DELETE', cookie: bob })).status, 404)
    assert.equal((await req(s.base, `/api/designs/${design.id}`, { method: 'PUT', cookie: bob, body: { graph: buildDemoRoomGraph('living', 'Modern', 'en') } })).status, 404)
  })
  it('rejects malformed designs', async () => {
    const r = await req(s.base, '/api/designs', { method: 'POST', cookie: alice, body: { graph: { hello: 'world' } } })
    assert.equal(r.status, 400)
    assert.equal((await r.json()).code, 'invalid_design')
  })
})

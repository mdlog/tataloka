// Accounts, sessions, Google sign-in (with a fake Google) and saved designs.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
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

async function start(env = {}, fetchImpl) {
  const config = { ...readConfig({}), apiKey: 'k', rateLimit: 0, port: 5173, ...env }
  const app = createApp({ config, fetchImpl, db: openDb(':memory:') })
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)) })
  const base = `http://127.0.0.1:${server.address().port}`
  return { server, base }
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

  it('links Google to an existing email account and refuses unverified emails', async () => {
    const g = fakeGoogle({ email: 'sari@example.com', sub: 'g-777' })
    const s = await start({ google: { clientId: 'cid', clientSecret: 'secret' } }, g.fetchImpl)
    try {
      await req(s.base, '/api/auth/register', { method: 'POST', body: { name: 'Sari', email: 'sari@example.com', password: 'password-sari' } })
      const go = await req(s.base, '/api/auth/google')
      const state = new URL(go.headers.get('location')).searchParams.get('state')
      const cb = await req(s.base, `/api/auth/google/callback?code=c&state=${state}`, { cookie: cookieOf(go) })
      const session = (cb.headers.get('set-cookie') || '').match(/tl_session=[^;]+/)[0]
      const me = (await (await req(s.base, '/api/auth/me', { cookie: session })).json()).user
      assert.equal(me.name, 'Sari')
      assert.equal(me.google, true)
      assert.equal(me.hasPassword, true)
    } finally { s.server.close() }

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

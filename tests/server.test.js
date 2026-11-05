// Server + Meta client against a fake Meta Model API: verifies the exact
// request shapes we send (json_schema, reasoning_effort, Responses API for
// SAM, multipart WAV for ASR) and that responses are parsed correctly.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp as createAppRaw, readConfig } from '../server/server.js'
import { openDb } from '../server/db.js'
import { normalizeDesign, buildDemoRoomGraph } from '../src/lib/roomGraph.js'

const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

function config(overrides = {}) {
  return { ...readConfig({}), apiKey: 'test-key', baseUrl: 'https://meta.test/v1', samConcepts: ['floor', 'chair'], rateLimit: 0, ...overrides }
}

function fakeMeta({ rejectSchema = false, samFails = [] } = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const path = url.replace('https://meta.test/v1', '')
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
    calls.push({ path, body, headers: init.headers })
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
    if (path === '/chat/completions') {
      if (rejectSchema && body.response_format) return json({ error: { message: 'response_format not supported' } }, 400)
      const isCommand = JSON.stringify(body.messages).includes('Request:')
      const content = isCommand
        ? { action: 'change_style', style: 'Industrial', reply: 'Oke!' }
        : { dimensions: { w: 4, l: 5, h: 2.8 }, items: [{ archetype: 'sofa', name: 'Sofa', x: 0, z: -1.8, rot: 0, priceIDR: 4000000 }], palette: ['#111111', '#222222', '#333333'], materials: ['oak'], summary: 'ok' }
      return json({ choices: [{ message: { role: 'assistant', content: JSON.stringify(content) }, finish_reason: 'stop' }], usage: { total_tokens: 42 } })
    }
    if (path === '/responses' && body.tools?.[0]?.type === 'web_search') {
      return json({ output: [
        { type: 'web_search_call', status: 'completed', results: [
          { title: 'KLOSET DUDUK TOTO CW422J - Shop | Tokopedia', url: 'https://shop-id.tokopedia.com/view/product/1729595133371320334?_svg=1' },
          { title: 'Carseat Joie Tempat Duduk Mobil', url: 'https://shopee.co.id/Carseat-Joie-i.1.2' },
          { title: 'Toilet Kloset Duduk | ZARA', url: 'https://www.zara.com/x' },
        ] },
        { type: 'message', content: [{ type: 'output_text', text: 'done' }] },
      ], usage: { input_tokens: 2000, output_tokens: 10 } })
    }
    if (path === '/responses') {
      const concept = body.input[0].content[0].text
      if (samFails.includes(concept)) return json({ error: { message: 'boom' } }, 500)
      const sse = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '<0f>0<|box;x1=0;y1=50;x2=100;y2=100;w=100;h=100|>' })}\n\n`
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
    if (path === '/images/generations' || path === '/images/edits') return json({ data: [{ b64_json: 'UE5H' }] })
    if (path === '/asr/transcribe') return json({ text: 'ganti gaya japandi' })
    return json({ error: { message: 'not found' } }, 404)
  }
  return { fetchImpl, calls }
}

// Every test app gets its own in-memory database; AI routes need a logged-in user,
// so serve() registers one and postJSON() sends its session cookie.
const createApp = (opts) => createAppRaw({ db: openDb(':memory:'), ...opts })
const cookies = new Map()
async function serve(app) {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)) })
  const base = `http://127.0.0.1:${server.address().port}`
  const r = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tester', email: 'tester@example.com', password: 'correct horse battery' }) })
  cookies.set(base, (r.headers.get('set-cookie') || '').split(';')[0])
  return { server, base }
}
const postJSON = (base, path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies.get(base) || '' }, body: JSON.stringify(body) })

describe('server without a key (demo mode)', () => {
  let s
  before(async () => { s = await serve(createApp({ config: config({ apiKey: '' }) })) })
  after(() => s.server.close())
  it('health reports demo mode', async () => {
    const h = await (await fetch(s.base + '/api/health')).json()
    assert.equal(h.live, false)
  })
  it('AI routes answer 503 so the client uses demo data', async () => {
    const r = await postJSON(s.base, '/api/design', { roomType: 'living' })
    assert.equal(r.status, 503)
  })
  it('placeholder keys from .env.example are ignored', () => {
    assert.equal(readConfig({ META_API_KEY: 'your_meta_api_key_here' }).apiKey, '')
  })
})

describe('server with the Meta API (faked)', () => {
  let s, meta
  before(async () => {
    meta = fakeMeta({ samFails: ['chair'] })
    s = await serve(createApp({ config: config(), fetchImpl: meta.fetchImpl }))
  })
  after(() => s.server.close())

  it('design → Chat Completions with json_schema, reasoning_effort and the photo', async () => {
    const r = await postJSON(s.base, '/api/design', { image: IMG, masks: [{ label: 'floor', bbox: [0, 50, 100, 50] }], roomType: 'living', style: 'Japandi', locale: 'id' })
    assert.equal(r.status, 200)
    const data = await r.json()
    const call = meta.calls.find(c => c.path === '/chat/completions')
    assert.equal(call.headers.Authorization, 'Bearer test-key')
    assert.equal(call.body.model, 'muse-spark-1.3')
    assert.equal(call.body.response_format.type, 'json_schema')
    assert.equal(call.body.response_format.json_schema.name, 'room_design')
    assert.equal(call.body.response_format.json_schema.strict, true)
    assert.equal(call.body.reasoning_effort, 'low')
    assert.match(call.body.messages[0].content, /Product catalog \(id \| type/)
    assert.match(call.body.messages[0].content, /ikea-\d+ \| sofa \|/, 'real catalog products are offered to Muse Spark')
    assert.ok(call.body.max_completion_tokens >= 4000)
    const parts = call.body.messages[1].content
    assert.equal(parts[1].type, 'image_url')
    assert.equal(parts[1].image_url.url, IMG)
    const g = normalizeDesign(data.design, { roomType: 'living', style: 'Japandi', model: data.model })
    assert.equal(g.layout.placedItems[0].archetype, 'sofa')
  })

  it('segment → SAM 3.1 via /responses, one concept per call, partial failures tolerated', async () => {
    const r = await postJSON(s.base, '/api/segment', { image: IMG, width: 100, height: 100 })
    assert.equal(r.status, 200)
    const data = await r.json()
    const samCalls = meta.calls.filter(c => c.path === '/responses')
    assert.equal(samCalls.length, 2)
    assert.equal(samCalls[0].body.model, 'sam-3.1')
    assert.equal(samCalls[0].body.input[0].content[1].type, 'input_image')
    assert.deepEqual(data.masks, [{ label: 'floor', bbox: [0, 50, 100, 50], source: 'sam-3.1' }])
    assert.equal(data.conceptErrors.length, 1)
  })

  it('command → structured action', async () => {
    const data = await (await postJSON(s.base, '/api/command', { text: 'bikin industrial dong', locale: 'id' })).json()
    assert.equal(data.command.action, 'change_style')
    assert.equal(data.command.style, 'Industrial')
  })

  it('render → Muse Image edit when a photo is sent, generation otherwise', async () => {
    const a = await (await postJSON(s.base, '/api/render', { image: IMG, roomType: 'living', style: 'Japandi', items: ['Sofa'] })).json()
    assert.equal(a.image, 'data:image/png;base64,UE5H')
    const edit = meta.calls.find(c => c.path === '/images/edits')
    assert.equal(edit.body.model, 'muse-image-1.0')
    assert.equal(edit.body.images[0].image_url, IMG)
    await postJSON(s.base, '/api/render', { roomType: 'bedroom', style: 'Modern', items: [] })
    assert.ok(meta.calls.some(c => c.path === '/images/generations'))
  })

  it('transcribe → multipart WAV to /asr/transcribe', async () => {
    const wav = new Uint8Array(64)
    const r = await fetch(s.base + '/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav', Cookie: cookies.get(s.base) }, body: wav })
    assert.equal((await r.json()).text, 'ganti gaya japandi')
    const call = meta.calls.find(c => c.path === '/asr/transcribe')
    assert.ok(call.body instanceof FormData)
    assert.deepEqual(JSON.parse(await call.body.get('request').text()), { model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })
  })

  it('market-search → Responses web_search; only relevant, verified store pages survive', async () => {
    const r = await postJSON(s.base, '/api/market-search', { query: 'kloset duduk', archetype: 'toilet' })
    assert.equal(r.status, 200)
    const data = await r.json()
    const call = meta.calls.find(c => c.path === '/responses' && c.body.tools)
    assert.equal(call.body.tools[0].type, 'web_search')
    assert.deepEqual(call.body.include, ['web_search_call.results'])
    assert.deepEqual(data.products.map(p => [p.store, p.url]), [['Tokopedia', 'https://shop-id.tokopedia.com/view/product/1729595133371320334']])
    assert.equal(data.products[0].priceIDR, null)
    const again = await (await postJSON(s.base, '/api/market-search', { query: 'kloset duduk', archetype: 'toilet' })).json()
    assert.equal(again.cached, true)
  })

  it('rejects non-image payloads and unknown routes', async () => {
    assert.equal((await postJSON(s.base, '/api/segment', { image: 'https://example.com/x.jpg' })).status, 400)
    assert.equal((await postJSON(s.base, '/api/nope', {})).status, 404)
  })
})

describe('saved AI renders', () => {
  it('stores the render with its design, only for the owner, and removes it with the design', async () => {
    const db = openDb(':memory:')
    const s = await serve(createAppRaw({ db, config: config(), fetchImpl: fakeMeta().fetchImpl }))
    const get = (p, cookie = cookies.get(s.base)) => fetch(s.base + p, { headers: { Cookie: cookie } })
    try {
      const graph = buildDemoRoomGraph('living', 'Japandi', 'en')
      const { design } = await (await postJSON(s.base, '/api/designs', { graph })).json()

      const r = await (await postJSON(s.base, '/api/render', { roomType: 'living', style: 'Japandi', designId: design.id })).json()
      assert.equal(r.image, 'data:image/png;base64,UE5H')
      assert.match(r.saved.url, new RegExp(`^/api/designs/${design.id}/render\\?v=\\d+$`))
      assert.equal(r.saved.type, 'png')

      const opened = (await (await get(`/api/designs/${design.id}`)).json()).design
      assert.deepEqual(opened.render, r.saved)
      const listed = (await (await get('/api/designs')).json()).designs[0]
      assert.equal(listed.render.url, r.saved.url)
      const img = await get(r.saved.url)
      assert.equal(img.status, 200)
      assert.equal(img.headers.get('content-type'), 'image/png')
      assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), 'UE5H')

      // another account can neither read it nor attach renders to it
      const other = await fetch(s.base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Other', email: 'other@example.com', password: 'another long password' }) })
      const otherCookie = (other.headers.get('set-cookie') || '').split(';')[0]
      assert.equal((await get(r.saved.url, otherCookie)).status, 404)
      const hijack = await (await fetch(s.base + '/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: otherCookie }, body: JSON.stringify({ roomType: 'living', designId: design.id }) })).json()
      assert.equal(hijack.saved, undefined)

      // restyle → the app deletes the outdated render
      assert.equal((await fetch(s.base + `/api/designs/${design.id}/render`, { method: 'DELETE', headers: { Cookie: cookies.get(s.base) } })).status, 200)
      assert.equal((await get(r.saved.url)).status, 404)
      assert.equal((await (await get(`/api/designs/${design.id}`)).json()).design.render, undefined)

      // deleting the design deletes its render
      await postJSON(s.base, '/api/render', { roomType: 'living', designId: design.id })
      await fetch(s.base + `/api/designs/${design.id}`, { method: 'DELETE', headers: { Cookie: cookies.get(s.base) } })
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM design_renders').get().n, 0)
    } finally { s.server.close() }
  })
})

describe('resilience', () => {
  it('retries without response_format when the API rejects it', async () => {
    const meta = fakeMeta({ rejectSchema: true })
    const s = await serve(createApp({ config: config(), fetchImpl: meta.fetchImpl }))
    try {
      const r = await postJSON(s.base, '/api/design', { roomType: 'living', style: 'Japandi' })
      assert.equal(r.status, 200)
      const chat = meta.calls.filter(c => c.path === '/chat/completions')
      assert.equal(chat.length, 2)
      assert.equal(chat[1].body.response_format, undefined)
    } finally { s.server.close() }
  })
  it('SAM failing for every concept → 502 with the reason', async () => {
    const meta = fakeMeta({ samFails: ['floor', 'chair'] })
    const s = await serve(createApp({ config: config(), fetchImpl: meta.fetchImpl }))
    try {
      const r = await postJSON(s.base, '/api/segment', { image: IMG })
      assert.equal(r.status, 502)
      assert.match((await r.json()).error, /SAM 3.1 failed/)
    } finally { s.server.close() }
  })
  it('credits: charged per route, refunded on failure, 402 when they run out', async () => {
    const meta = fakeMeta({ samFails: ['floor', 'chair'] })
    const s = await serve(createApp({ config: config(), fetchImpl: meta.fetchImpl }))
    const credits = async () => (await (await fetch(s.base + '/api/credits', { headers: { Cookie: cookies.get(s.base) } })).json()).credits
    try {
      assert.equal((await credits()).remaining, 30)
      const d = await postJSON(s.base, '/api/design', { roomType: 'living', style: 'Japandi' })
      assert.equal(d.status, 200)
      assert.equal(d.headers.get('x-tataloka-credits'), '29')
      // SAM fails for every concept → 502 and the 2 credits come back
      const seg = await postJSON(s.base, '/api/segment', { image: IMG })
      assert.equal(seg.status, 502)
      assert.equal(seg.headers.get('x-tataloka-credits'), '29')
      // commands are free; market search costs 1 the first time only
      await postJSON(s.base, '/api/command', { text: 'hi' })
      await postJSON(s.base, '/api/market-search', { query: 'kloset duduk', archetype: 'toilet' })
      await postJSON(s.base, '/api/market-search', { query: 'kloset duduk', archetype: 'toilet' })
      assert.equal((await credits()).remaining, 28)
      for (let i = 0; i < 28; i++) assert.equal((await postJSON(s.base, '/api/render', { roomType: 'living', style: 'Japandi' })).status, 200)
      const out = await postJSON(s.base, '/api/render', { roomType: 'living', style: 'Japandi' })
      assert.equal(out.status, 402)
      const body = await out.json()
      assert.equal(body.code, 'no_credits')
      assert.equal(body.credits.remaining, 0)
      assert.ok(Date.parse(body.credits.resetsAt) > Date.now())
      const renders = meta.calls.filter(c => c.path === '/images/generations').length
      assert.equal(renders, 28, 'no Meta call without credits')
    } finally { s.server.close() }
  })
  it('a design that reads extra views costs more and sends every view plus the measured size', async () => {
    const meta = fakeMeta()
    const s = await serve(createApp({ config: config(), fetchImpl: meta.fetchImpl }))
    try {
      const r = await postJSON(s.base, '/api/design', { roomType: 'bedroom', style: 'Japandi', image: IMG, images: [IMG, IMG, IMG], dims: { w: 3.1, l: 3.6 } })
      assert.equal(r.status, 200)
      assert.equal(r.headers.get('x-tataloka-credits'), '27', '1 design + 2 for the extra views')
      const call = meta.calls.find(c => c.path === '/chat/completions')
      assert.equal(call.body.messages[1].content.filter(p => p.type === 'image_url').length, 4)
      assert.match(call.body.messages[0].content, /MEASURED this room: width 3.1 m/)
      // a bad extra view is rejected and refunded
      const bad = await postJSON(s.base, '/api/design', { roomType: 'bedroom', image: IMG, images: ['https://example.com/x.jpg'] })
      assert.equal(bad.status, 400)
      assert.equal(bad.headers.get('x-tataloka-credits'), '27')
      // nonsense sizes are dropped, not passed to the model
      await postJSON(s.base, '/api/design', { roomType: 'bedroom', dims: { w: 99, l: 3 } })
      assert.doesNotMatch(meta.calls.filter(c => c.path === '/chat/completions').pop().body.messages[0].content, /MEASURED/)
    } finally { s.server.close() }
  })
  it('segmenting for a multi-view design checks the credits the whole design will need', async () => {
    const db = openDb(':memory:')
    const s = await serve(createAppRaw({ db, config: config(), fetchImpl: fakeMeta().fetchImpl }))
    try {
      await fetch(s.base + '/api/credits', { headers: { Cookie: cookies.get(s.base) } }) // starts this month's period
      db.prepare('UPDATE users SET credits_used = 26').run() // 4 credits left
      assert.equal((await postJSON(s.base, '/api/segment', { image: IMG, views: 1 })).status, 200)
      const r = await postJSON(s.base, '/api/segment', { image: IMG, views: 7 })
      assert.equal(r.status, 402)
      assert.equal((await r.json()).need, 5)
    } finally { s.server.close() }
  })
  it('credits can be switched off', async () => {
    const s = await serve(createApp({ config: config({ creditsEnabled: false }), fetchImpl: fakeMeta().fetchImpl }))
    try {
      const r = await postJSON(s.base, '/api/design', { roomType: 'living' })
      assert.equal(r.status, 200)
      assert.equal(r.headers.get('x-tataloka-credits'), null)
      assert.equal((await (await fetch(s.base + '/api/health')).json()).credits, false)
    } finally { s.server.close() }
  })
  it('rate limit protects the API credits', async () => {
    const meta = fakeMeta()
    const s = await serve(createApp({ config: config({ rateLimit: 2 }), fetchImpl: meta.fetchImpl }))
    try {
      const codes = []
      for (let i = 0; i < 3; i++) codes.push((await postJSON(s.base, '/api/command', { text: 'hi' })).status)
      assert.deepEqual(codes, [200, 200, 429])
    } finally { s.server.close() }
  })
})

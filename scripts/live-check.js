// Live end-to-end check of every API route against the real Meta Model API.
// Costs a few cents. Usage: npm run check:live [seg|design|cmd|asr|market|render]
//   asr needs WAV=path/to/16k-mono.wav, render saves to OUT=path (optional)
import fs from 'node:fs'
import dotenv from 'dotenv'
import { createApp, readConfig } from '../server/server.js'
import { normalizeDesign } from '../src/lib/roomGraph.js'
import { openDb } from '../server/db.js'
dotenv.config()
// temporary in-memory accounts DB; AI routes need a logged-in user
const app = createApp({ config: { ...readConfig(), rateLimit: 0 }, db: openDb(':memory:') })
const server = await new Promise(r => { const s = app.listen(0, () => r(s)) })
const base = `http://127.0.0.1:${server.address().port}`
const reg = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Live check', email: 'live-check@example.com', password: 'live-check-password' }) })
const cookie = (reg.headers.get('set-cookie') || '').split(';')[0]
const img = 'data:image/jpeg;base64,' + fs.readFileSync('public/samples/living-room.jpg').toString('base64')
const post = async (p, body, headers = { 'Content-Type': 'application/json' }) => {
  const t0 = Date.now()
  const r = await fetch(base + p, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: headers['Content-Type'] === 'application/json' ? JSON.stringify(body) : body })
  const j = await r.json()
  return { status: r.status, s: ((Date.now() - t0) / 1000).toFixed(1), j }
}
const which = process.argv[2] || 'all'
try {
  let masks = []
  if (which === 'all' || which === 'seg') {
    const seg = await post('/api/segment', { image: img, width: 1024, height: 904 })
    masks = seg.j.masks || []
    console.log('SEGMENT', seg.status, seg.s + 's', masks.length, 'boxes', JSON.stringify([...new Set(masks.map(m => m.label))]), 'errors', (seg.j.conceptErrors || []).length, seg.j.error || '')
  }
  if (which === 'all' || which === 'design') {
    const d = await post('/api/design', { image: img, masks, roomType: 'living', style: 'Japandi', locale: 'id', budgetIDR: 20000000 })
    console.log('DESIGN', d.status, d.s + 's', d.j.error || '', 'tokens', JSON.stringify(d.j.usage))
    if (d.status === 200) {
      const g = normalizeDesign(d.j.design, { roomType: 'living', style: 'Japandi', model: d.j.model, budgetIDR: 20000000 })
      console.log('  title:', g.title, '| dims', JSON.stringify(g.room.dimensions), '| total', g.layout.budget.totalIDR, '| store', g.layout.budget.storeCount, 'est', g.layout.budget.estimateCount)
      for (const it of g.layout.placedItems) console.log('  ', it.aiPicked ? 'AI ' : 'map', it.archetype.padEnd(12), String(it.priceIDR).padStart(9), it.name.slice(0, 60), JSON.stringify(it.pos))
      console.log('  summary:', g.summary.slice(0, 220))
      console.log('  existing:', JSON.stringify(g.existingFurniture))
    }
  }
  if (which === 'all' || which === 'cmd') {
    const c = await post('/api/command', { text: 'bikin jadi gaya industrial dong', locale: 'id', context: { room: 'living' } })
    console.log('COMMAND', c.status, c.s + 's', JSON.stringify(c.j.command || c.j.error))
  }
  if ((which === 'all' && process.env.WAV) || which === 'asr') {
    const wav = fs.readFileSync(process.env.WAV)
    const a = await post('/api/transcribe', wav, { 'Content-Type': 'audio/wav' })
    console.log('TRANSCRIBE', a.status, a.s + 's', JSON.stringify(a.j))
  }
  if (which === 'all' || which === 'market') {
    const m = await post('/api/market-search', { query: 'lampu lantai rotan', archetype: 'lamp' })
    console.log('MARKET', m.status, m.s + 's', (m.j.products || []).map(p => `${p.store}: ${p.name.slice(0, 50)}`).join(' | '), m.j.error || '')
  }
  if (which === 'render') {
    const r = await post('/api/render', { image: img, roomType: 'living', style: 'Japandi', items: ['GLOSTAD 3-seat sofa', 'LACK coffee table', 'KINNAHULT floor lamp'] })
    console.log('RENDER', r.status, r.s + 's', r.j.error || (r.j.image || '').slice(0, 60), (r.j.image || '').length)
    if (process.env.OUT && r.j.image?.startsWith('data:image')) fs.writeFileSync(process.env.OUT, Buffer.from(r.j.image.split(',')[1], 'base64'))
  }
} finally {
  server.close()
}

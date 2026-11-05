// Saved designs per account. Every query is scoped to req.user.id, so users can
// only see and change their own designs. Room photos are never stored; the AI
// render made for a design (Muse Image output only) is stored with it.
import crypto from 'node:crypto'
import express from 'express'

const MAX_DESIGNS_PER_USER = 200
const MAX_GRAPH_BYTES = 250_000

class InvalidDesign extends Error {}

// Validate the roomGraph and derive the list-view summary on the server.
export function summarizeGraph(graph) {
  if (!graph || typeof graph !== 'object') throw new InvalidDesign('design is missing')
  const items = graph.layout?.placedItems
  if (!graph.room?.type || !graph.style?.name || !Array.isArray(items) || items.length > 60) throw new InvalidDesign('design has an invalid shape')
  const json = JSON.stringify(graph)
  if (json.length > MAX_GRAPH_BYTES) throw new InvalidDesign('design is too large')
  const total = Number(graph.layout?.budget?.totalIDR)
  return {
    json,
    title: String(graph.title || `${graph.style.name} ${graph.room.type}`).slice(0, 80),
    roomType: String(graph.room.type).slice(0, 20),
    style: String(graph.style.name).slice(0, 20),
    totalIDR: Number.isFinite(total) ? Math.round(total) : 0,
    itemCount: items.length,
    images: JSON.stringify(items.map(i => i?.image).filter(u => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4)),
  }
}

const MAX_RENDER_BYTES = 8_000_000
const RENDER_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }
const renderMeta = (designId, createdAt, mime) => ({
  url: `/api/designs/${encodeURIComponent(designId)}/render?v=${createdAt}`,
  at: new Date(createdAt).toISOString(),
  type: RENDER_TYPES[mime] || 'png',
})

// The latest AI render of each design. Only images the server got back from
// Muse Image are saved (see /api/render), never uploads from the browser.
export function createRenders(db) {
  const q = {
    owns: db.prepare('SELECT 1 FROM designs WHERE id = ? AND user_id = ?'),
    upsert: db.prepare(`INSERT INTO design_renders (design_id, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(design_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, created_at = excluded.created_at`),
    touch: db.prepare('UPDATE designs SET updated_at = ? WHERE id = ?'),
    get: db.prepare('SELECT mime, data, created_at FROM design_renders WHERE design_id = ? AND user_id = ?'),
    meta: db.prepare('SELECT mime, created_at FROM design_renders WHERE design_id = ? AND user_id = ?'),
    remove: db.prepare('DELETE FROM design_renders WHERE design_id = ? AND user_id = ?'),
  }
  return {
    // Returns { url, at, type } or null when the design is not this user's / the image is invalid.
    save(userId, designId, dataUrl) {
      const m = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
      if (!m || !q.owns.get(designId, userId)) return null
      const bytes = Buffer.from(m[2], 'base64')
      if (!bytes.length || bytes.length > MAX_RENDER_BYTES) return null
      const now = Date.now()
      q.upsert.run(designId, userId, m[1], bytes, now)
      q.touch.run(now, designId)
      return renderMeta(designId, now, m[1])
    },
    get: (userId, designId) => q.get.get(designId, userId) || null,
    meta(userId, designId) {
      const r = q.meta.get(designId, userId)
      return r ? renderMeta(designId, r.created_at, r.mime) : null
    },
    remove: (userId, designId) => q.remove.run(designId, userId).changes > 0,
  }
}

export function createDesignsRouter({ db, requireUser, renders = createRenders(db) }) {
  const q = {
    list: db.prepare(`SELECT d.id, d.title, d.room_type, d.style, d.total_idr, d.item_count, d.images, d.created_at, d.updated_at,
      r.created_at AS render_at, r.mime AS render_mime
      FROM designs d LEFT JOIN design_renders r ON r.design_id = d.id
      WHERE d.user_id = ? ORDER BY d.updated_at DESC LIMIT 100`),
    get: db.prepare('SELECT * FROM designs WHERE id = ? AND user_id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM designs WHERE user_id = ?'),
    insert: db.prepare('INSERT INTO designs (id, user_id, title, room_type, style, total_idr, item_count, images, graph_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    update: db.prepare('UPDATE designs SET title = ?, room_type = ?, style = ?, total_idr = ?, item_count = ?, images = ?, graph_json = ?, updated_at = ? WHERE id = ? AND user_id = ?'),
    remove: db.prepare('DELETE FROM designs WHERE id = ? AND user_id = ?'),
  }
  const toSummary = (r) => ({
    id: r.id, title: r.title, roomType: r.room_type, style: r.style, totalIDR: r.total_idr,
    itemCount: r.item_count, images: JSON.parse(r.images || '[]'), createdAt: r.created_at, updatedAt: r.updated_at,
    ...(r.render_at ? { render: renderMeta(r.id, r.render_at, r.render_mime) } : {}),
  })
  const wrap = (fn) => (req, res) => {
    try { fn(req, res) } catch (e) {
      if (e instanceof InvalidDesign) return res.status(400).json({ error: e.message, code: 'invalid_design' })
      console.warn(`[designs] ${e.message}`)
      res.status(500).json({ error: 'Could not save the design.' })
    }
  }

  const router = express.Router()
  router.use(requireUser, express.json({ limit: '400kb' }))

  router.get('/', wrap((req, res) => res.json({ designs: q.list.all(req.user.id).map(toSummary) })))

  router.get('/:id', wrap((req, res) => {
    const r = q.get.get(req.params.id, req.user.id)
    if (!r) return res.status(404).json({ error: 'Design not found.', code: 'not_found' })
    const render = renders.meta(req.user.id, r.id)
    res.json({ design: { ...toSummary(r), graph: JSON.parse(r.graph_json), ...(render ? { render } : {}) } })
  }))

  // The saved AI render as an image (only for the design's owner).
  router.get('/:id/render', wrap((req, res) => {
    const r = renders.get(req.user.id, req.params.id)
    if (!r) return res.status(404).json({ error: 'No render for this design.', code: 'not_found' })
    res.set({ 'Content-Type': r.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
    res.send(Buffer.from(r.data))
  }))

  // Restyling makes the old render outdated: the app removes it.
  router.delete('/:id/render', wrap((req, res) => {
    if (!renders.remove(req.user.id, req.params.id)) return res.status(404).json({ error: 'No render for this design.', code: 'not_found' })
    res.json({ ok: true })
  }))

  router.post('/', wrap((req, res) => {
    if (q.count.get(req.user.id).n >= MAX_DESIGNS_PER_USER) return res.status(409).json({ error: 'Design limit reached — delete old designs first.', code: 'limit' })
    const s = summarizeGraph(req.body?.graph)
    const id = crypto.randomUUID()
    const now = Date.now()
    q.insert.run(id, req.user.id, s.title, s.roomType, s.style, s.totalIDR, s.itemCount, s.images, s.json, now, now)
    res.status(201).json({ design: toSummary(q.get.get(id, req.user.id)) })
  }))

  router.put('/:id', wrap((req, res) => {
    const s = summarizeGraph(req.body?.graph)
    const r = q.update.run(s.title, s.roomType, s.style, s.totalIDR, s.itemCount, s.images, s.json, Date.now(), req.params.id, req.user.id)
    if (!r.changes) return res.status(404).json({ error: 'Design not found.', code: 'not_found' })
    res.json({ design: toSummary(q.get.get(req.params.id, req.user.id)) })
  }))

  router.delete('/:id', wrap((req, res) => {
    const r = q.remove.run(req.params.id, req.user.id)
    if (!r.changes) return res.status(404).json({ error: 'Design not found.', code: 'not_found' })
    res.json({ ok: true })
  }))

  return router
}

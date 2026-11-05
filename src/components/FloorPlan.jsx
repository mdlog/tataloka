import React, { useRef, useState } from 'react'
import { itemDims } from '../lib/roomLayout.js'
import { archLabel } from '../lib/labels.js'

const FILL = {
  sofa: '#ecd9cb', chair: '#ecd9cb', stool: '#ecd9cb',
  coffee_table: '#e6dccb', dining_table: '#e6dccb', desk: '#e6dccb', tv_console: '#e1d7c6',
  wardrobe: '#dfdbea', shelf: '#dfdbea', bed: '#d7e5dc', lamp: '#f6e6b4',
  sink: '#d8e7f0', bathtub: '#d8e7f0', toilet: '#d8e7f0', rug: '#f1ebe1',
}

// To-scale top view (meters). x → right, z → down (towards the viewer / open side).
export default function FloorPlan({ roomGraph, selectedId, onSelect, onMove, locale = 'en', interactive = true }) {
  const svgRef = useRef(null)
  // { id, dx, dz, pos, pointerId }. The ref is the source of truth for the handlers: a phone can
  // deliver "leave" and another "move" before React re-renders, and a stale drag must never be read.
  const dragRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const { w, l } = roomGraph.room.dimensions
  const roomType = roomGraph.room.type
  const pad = 0.75
  const items = [...roomGraph.layout.placedItems].sort((a, b) => (a.archetype === 'rug' ? -1 : 0) - (b.archetype === 'rug' ? -1 : 0))
  const fs = Math.max(0.1, Math.min(w, l) / 28)
  const winW = Math.min(1.6, w * 0.42)

  // Screen point → room meters; null while the plan is not laid out.
  function toRoom(e) {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }
  function down(e, it) {
    if (!interactive || dragRef.current) return // one finger drags; a second one is ignored
    e.stopPropagation()
    onSelect?.(it.id)
    const at = toRoom(e)
    if (!at) return
    const d = { id: it.id, dx: at[0] - it.pos[0], dz: at[1] - it.pos[1], pos: it.pos, pointerId: e.pointerId }
    dragRef.current = d
    setDrag(d)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* some browsers refuse; leaving the plan then ends the drag */ }
  }
  function move(e) {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const at = toRoom(e)
    if (!at) return
    const next = { ...d, pos: [at[0] - d.dx, at[1] - d.dz] }
    dragRef.current = next
    setDrag(next)
  }
  function end(e) {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null
    setDrag(null)
    const it = items.find(i => i.id === d.id)
    if (it && (Math.abs(d.pos[0] - it.pos[0]) > 0.01 || Math.abs(d.pos[1] - it.pos[1]) > 0.01)) {
      onMove?.(d.id, { pos: [Number(d.pos[0].toFixed(2)), Number(d.pos[1].toFixed(2))] })
    }
  }

  const grid = []
  for (let x = -w / 2 + 0.5; x < w / 2 - 0.01; x += 0.5) grid.push(<line key={`gx${x}`} x1={x} y1={-l / 2} x2={x} y2={l / 2} />)
  for (let z = -l / 2 + 0.5; z < l / 2 - 0.01; z += 0.5) grid.push(<line key={`gz${z}`} x1={-w / 2} y1={z} x2={w / 2} y2={z} />)

  return (
    <svg ref={svgRef} className="plan" viewBox={`${-w / 2 - pad} ${-l / 2 - pad} ${w + pad * 2} ${l + pad * 2}`}
      preserveAspectRatio="xMidYMid meet" onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end}
      onPointerDown={() => onSelect?.(null)} role="img" aria-label={`Floor plan ${w} × ${l} m`}>
      <rect x={-w / 2} y={-l / 2} width={w} height={l} fill="#fbfaf7" />
      <g stroke="#ece7de" strokeWidth={0.01}>{grid}</g>

      {items.map(it => {
        const pos = drag?.id === it.id ? drag.pos : it.pos
        const d = itemDims(it, roomType)
        const s = it.scale || 1
        const iw = d.w * s, id = d.d * s
        const sel = it.id === selectedId
        const rug = it.archetype === 'rug'
        return (
          <g key={it.id} transform={`translate(${pos[0]} ${pos[1]})`} style={{ cursor: interactive ? (drag ? 'grabbing' : 'grab') : 'default' }}
            onPointerDown={e => down(e, it)}>
            <g transform={`rotate(${(-(it.rot || 0) * 180) / Math.PI})`}>
              <rect x={-iw / 2} y={-id / 2} width={iw} height={id} rx={rug ? 0.02 : 0.04}
                fill={FILL[it.archetype] || '#e8e2d6'} fillOpacity={rug ? 0.75 : 1}
                stroke={sel ? '#b4532a' : rug ? '#cfc6b6' : '#8d8476'} strokeWidth={sel ? 0.04 : 0.018}
                strokeDasharray={rug ? '0.06 0.05' : undefined} />
              {!rug && <line x1={-iw / 2 + 0.04} y1={id / 2 - 0.02} x2={iw / 2 - 0.04} y2={id / 2 - 0.02} stroke={sel ? '#b4532a' : '#5d564c'} strokeWidth={0.035} strokeLinecap="round" />}
            </g>
            <text y={rug ? id / 2 - fs * 0.6 : fs * 0.35} textAnchor="middle" fontSize={fs} fontWeight={sel ? 700 : 600} fill={sel ? '#8f3f1f' : '#4a4640'} pointerEvents="none">
              {archLabel(it.archetype, locale)}
            </text>
          </g>
        )
      })}

      {/* walls: back, left, right; front is open (camera side) */}
      <path d={`M ${-w / 2} ${l / 2} V ${-l / 2} H ${w / 2} V ${l / 2}`} fill="none" stroke="#2b2824" strokeWidth={0.1} strokeLinejoin="miter" />
      <line x1={-w / 2} y1={l / 2} x2={w / 2} y2={l / 2} stroke="#b9b1a4" strokeWidth={0.02} strokeDasharray="0.12 0.08" />
      <line x1={-winW / 2} y1={-l / 2} x2={winW / 2} y2={-l / 2} stroke="#9cc3e4" strokeWidth={0.1} />
      <line x1={-winW / 2} y1={-l / 2} x2={winW / 2} y2={-l / 2} stroke="#fff" strokeWidth={0.025} />

      {/* dimensions */}
      <g stroke="#8a847c" strokeWidth={0.012} fill="#6b655d" fontSize={fs * 1.05} fontWeight={600}>
        <line x1={-w / 2} y1={-l / 2 - pad * 0.5} x2={w / 2} y2={-l / 2 - pad * 0.5} />
        <line x1={-w / 2} y1={-l / 2 - pad * 0.62} x2={-w / 2} y2={-l / 2 - pad * 0.38} />
        <line x1={w / 2} y1={-l / 2 - pad * 0.62} x2={w / 2} y2={-l / 2 - pad * 0.38} />
        <text x={0} y={-l / 2 - pad * 0.62} textAnchor="middle" stroke="none">{w.toFixed(2)} m</text>
        <line x1={-w / 2 - pad * 0.5} y1={-l / 2} x2={-w / 2 - pad * 0.5} y2={l / 2} />
        <line x1={-w / 2 - pad * 0.62} y1={-l / 2} x2={-w / 2 - pad * 0.38} y2={-l / 2} />
        <line x1={-w / 2 - pad * 0.62} y1={l / 2} x2={-w / 2 - pad * 0.38} y2={l / 2} />
        <text x={-w / 2 - pad * 0.62} y={0} textAnchor="middle" stroke="none" transform={`rotate(-90 ${-w / 2 - pad * 0.62} 0)`}>{l.toFixed(2)} m</text>
      </g>
      <text x={0} y={l / 2 + pad * 0.6} textAnchor="middle" fontSize={fs * 0.95} fill="#9a938a">
        {locale === 'id' ? 'sisi depan (posisi kamera)' : 'front (camera side)'}
      </text>
    </svg>
  )
}

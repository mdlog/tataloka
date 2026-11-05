import React, { useEffect, useRef } from 'react'

const COLORS = ['#b4532a', '#2c5d8f', '#2f7d57', '#8a5cc2', '#a2650f', '#c2410c', '#0f766e', '#be185d']

// Photo with SAM 3.1 boxes. bbox is always [x, y, width, height] in % of the image.
export default function Overlay2D({ imageUrl, masks = [], style }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current, img = imgRef.current
    if (!canvas || !img) return
    function draw() {
      const rect = img.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr
      canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px'
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      const iw = img.naturalWidth, ih = img.naturalHeight
      if (!iw || !ih) return
      const scale = Math.min(rect.width / iw, rect.height / ih)
      const cw = iw * scale, ch = ih * scale
      const ox = (rect.width - cw) / 2, oy = (rect.height - ch) / 2
      const labels = [...new Set(masks.map(m => m.label))]
      // big regions (wall/floor) first so objects stay readable on top
      const sorted = [...masks].sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]))
      for (const m of sorted) {
        const [x, y, w, h] = m.bbox || [0, 0, 0, 0]
        const col = COLORS[labels.indexOf(m.label) % COLORS.length]
        const px = ox + (x / 100) * cw, py = oy + (y / 100) * ch, pw = (w / 100) * cw, ph = (h / 100) * ch
        const big = w * h > 2500
        ctx.lineWidth = 2
        ctx.strokeStyle = col
        ctx.fillStyle = col + (big ? '14' : '22')
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, pw, ph, 6) : ctx.rect(px, py, pw, ph); ctx.fill(); ctx.stroke()
        ctx.font = '600 11px Inter, system-ui, sans-serif'
        const label = m.label
        const lw = ctx.measureText(label).width + 12
        const lx = Math.min(Math.max(px, 2), rect.width - lw - 2), ly = Math.max(2, py + 4)
        ctx.fillStyle = col
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx + 4, ly, lw, 18, 5) : ctx.rect(lx + 4, ly, lw, 18); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillText(label, lx + 10, ly + 13)
      }
    }
    const doDraw = () => requestAnimationFrame(draw)
    if (img.complete) doDraw()
    img.addEventListener('load', doDraw)
    const ro = new ResizeObserver(doDraw); ro.observe(img)
    return () => { ro.disconnect(); img.removeEventListener('load', doDraw) }
  }, [imageUrl, masks])
  if (!imageUrl) return null
  return (
    <div className="canvas-wrap" style={style}>
      <img ref={imgRef} src={imageUrl} alt={`Room photo with ${masks.length} detected regions`} />
      <canvas ref={canvasRef} />
    </div>
  )
}

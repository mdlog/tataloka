import React, { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import Overlay2D from './Overlay2D.jsx'

export default function GeneratingView({ locale, capture, views = 1, roomSize, masks, step, live, startedAt, onCancel }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i) }, [])
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000))

  const steps = [
    {
      key: 'segmenting', skip: !capture,
      title: t('Reading your room', 'Membaca ruanganmu'),
      sub: capture ? (live ? t('SAM 3.1 detects walls, floor, windows and furniture', 'SAM 3.1 mendeteksi dinding, lantai, jendela, dan furnitur') : t('Sample detections (demo mode)', 'Deteksi contoh (mode demo)')) : t('Skipped — no photo', 'Dilewati — tanpa foto'),
    },
    {
      key: 'designing',
      title: t('Designing the layout', 'Menyusun layout'),
      sub: (live ? t('Muse Spark plans the room and picks real products within your budget', 'Muse Spark merencanakan ruang dan memilih produk nyata sesuai budget') : t('Assembling a design from the real catalog', 'Menyusun desain dari katalog nyata'))
        + (views > 1 ? t(` — reading ${views} views`, ` — membaca ${views} sudut`) : '')
        + (roomSize ? t(` · ${roomSize.w} × ${roomSize.l} m measured`, ` · ukuran terukur ${roomSize.w} × ${roomSize.l} m`) : ''),
    },
    { key: 'building', title: t('Building your 3D room', 'Membangun ruang 3D'), sub: t('Floor plan, 3D model and shopping list', 'Denah, model 3D, dan daftar belanja') },
  ]
  const order = ['segmenting', 'designing', 'building']
  const current = order.indexOf(step)

  return (
    <main className="container generating">
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#111' }}>
          {capture
            ? <Overlay2D imageUrl={capture.url} masks={masks || []} style={{ position: 'absolute', inset: 0 }} />
            : <div className="center-fill shimmer" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}><Icon name="cube" size={48} /></div>}
          {masks?.length > 0 && (
            <div className="viewer-overlay glass" style={{ left: 12, bottom: 12, padding: '4px 8px' }}>
              <span className="vhint"><Icon name="scan" size={14} /> {masks.length} {t('regions detected', 'area terdeteksi')}</span>
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="eyebrow">{t('Creating your design', 'Membuat desainmu')} · {elapsed}s</div>
        <h2 className="display h2" style={{ margin: '10px 0 20px' }}>{t('Hang tight — this usually takes under a minute.', 'Sebentar ya — biasanya kurang dari satu menit.')}</h2>
        <ol className="steps">
          {steps.map((s, i) => {
            const state = s.skip ? 'skip' : i < current ? 'done' : i === current ? 'active' : 'todo'
            return (
              <li key={s.key} className={`step ${state}`} aria-current={state === 'active' ? 'step' : undefined}>
                <span className="step-icon">{state === 'done' ? <Icon name="check" size={16} /> : state === 'active' ? <span className="spinner" /> : state === 'skip' ? <Icon name="minus" size={16} /> : i + 1}</span>
                <div><b>{s.title}</b><span>{s.sub}</span></div>
              </li>
            )
          })}
        </ol>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={onCancel}><Icon name="x" size={16} />{t('Cancel', 'Batal')}</button>
      </div>
    </main>
  )
}

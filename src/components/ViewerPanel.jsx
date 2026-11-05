import React, { lazy, Suspense, useState } from 'react'
import Icon from './Icon.jsx'
import { CostHint } from './Credits.jsx'
import FloorPlan from './FloorPlan.jsx'
import Overlay2D from './Overlay2D.jsx'
import { renderRoom } from '../lib/api.js'
import { takeSnapshot } from '../lib/sceneSnapshot.js'
import { downloadDataURL } from '../lib/image.js'

const RoomScene = lazy(() => import('./RoomScene.jsx'))

function Loading({ label }) {
  return <div className="center-fill muted"><div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}><span className="spinner" />{label}</div></div>
}

// Before/after slider: original photo vs AI render.
function Compare({ before, after, locale }) {
  const [cut, setCut] = useState(50)
  const t = (en, id) => (locale === 'id' ? id : en)
  return (
    <div className="compare" style={{ '--cut': `${cut}%` }}>
      <img src={before} alt={t('Original photo', 'Foto asli')} />
      <img className="after" src={after} alt={t('AI render', 'Render AI')} />
      <div className="handle" />
      <span className="label" style={{ left: 12 }}>{t('Before', 'Sebelum')}</span>
      <span className="label" style={{ right: 12 }}>{t('After', 'Sesudah')}</span>
      <input type="range" min={0} max={100} value={cut} onChange={e => setCut(Number(e.target.value))} aria-label={t('Compare before and after', 'Bandingkan sebelum dan sesudah')} />
    </div>
  )
}

export default function ViewerPanel({ roomGraph, capture, masks, segInfo, selectedId, onSelect, onMove, onRemove, live, locale, render, setRender, onShot, costs, ensureSaved }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [tab, setTab] = useState('3d')
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')

  async function switchTab(next) {
    if (tab === '3d' && next !== '3d') {
      const shot = await takeSnapshot().catch(() => null)
      if (shot) onShot?.(shot)
    }
    setTab(next)
  }

  async function generate() {
    setRendering(true); setError('')
    try {
      const designId = await ensureSaved?.()
      const r = await renderRoom({
        capture,
        roomType: roomGraph.room.type,
        style: roomGraph.style.name,
        items: roomGraph.layout.placedItems.map(i => i.name.split(',')[0]),
        designId,
      })
      setRender({ url: r.image, at: Date.now(), type: r.saved?.type, savedTo: r.saved ? designId : null })
    } catch (e) {
      if (e.code !== 'no_credits') setError(e.message)
    } finally {
      setRendering(false)
    }
  }

  const tabs = [
    ['3d', 'cube', '3D'],
    ['plan', 'plan', t('Floor plan', 'Denah')],
    ...(capture ? [['photo', 'scan', t('Your photo', 'Fotomu')]] : []),
    ['render', 'sparkles', t('AI render', 'Render AI')],
  ]

  return (
    <section className="card viewer-card">
      <div className="tabs" role="tablist">
        {tabs.map(([key, icon, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => switchTab(key)}>
            <Icon name={icon} size={16} />{label}
          </button>
        ))}
      </div>
      <div className="viewer-body" style={tab === 'plan' ? { background: '#fbfaf7' } : tab === 'photo' ? { background: '#111' } : undefined}>
        {tab === '3d' && (
          <Suspense fallback={<Loading label={t('Loading 3D…', 'Memuat 3D…')} />}>
            <RoomScene roomGraph={roomGraph} captureUrl={capture?.url} selectedId={selectedId} onSelect={onSelect} onMoveItem={onMove} onRemoveItem={onRemove} locale={locale} />
          </Suspense>
        )}
        {tab === 'plan' && (
          <div style={{ position: 'absolute', inset: 0, padding: 12 }}>
            <FloorPlan roomGraph={roomGraph} selectedId={selectedId} onSelect={onSelect} onMove={onMove} locale={locale} />
            <div className="viewer-overlay glass" style={{ left: 12, bottom: 12 }}>
              <span className="vhint">{t('Drag pieces to rearrange · grid = 50 cm', 'Seret furnitur untuk menata · grid = 50 cm')}</span>
            </div>
          </div>
        )}
        {tab === 'photo' && capture && (
          <>
            <Overlay2D imageUrl={capture.url} masks={masks || []} style={{ position: 'absolute', inset: 0 }} />
            <div className="viewer-overlay glass" style={{ left: 12, bottom: 12 }}>
              <span className="vhint">
                {segInfo?.source === 'live'
                  ? t(`SAM 3.1 detected ${masks?.length || 0} regions`, `SAM 3.1 mendeteksi ${masks?.length || 0} area`)
                  : t('Demo detections (connect META_API_KEY for SAM 3.1)', 'Deteksi demo (hubungkan META_API_KEY untuk SAM 3.1)')}
              </span>
            </div>
          </>
        )}
        {tab === 'render' && (
          render?.url ? (
            <>
              {capture ? <Compare before={capture.url} after={render.url} locale={locale} /> : <img src={render.url} alt={t('AI render', 'Render AI')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#111' }} />}
              <div className="viewer-overlay glass" style={{ right: 12, top: 12, padding: 3 }}>
                <button className="vbtn" onClick={() => downloadDataURL(render.url, `tataloka-render-${roomGraph.room.type}.${render.type || (render.url.match(/^data:image\/(\w+)/)?.[1] || 'png').replace('jpeg', 'jpg')}`)}><Icon name="download" size={15} />{t('Download', 'Unduh')}</button>
                <button className="vbtn" onClick={generate} disabled={rendering}><Icon name="refresh" size={15} />{t('Regenerate', 'Buat ulang')}{costs && <CostHint credits={costs.render} locale={locale} />}</button>
              </div>
              {render.savedTo && (
                <div className="viewer-overlay glass" style={{ left: 12, bottom: 12 }}>
                  <span className="vhint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={14} />{t('Saved with this design', 'Tersimpan bersama desain ini')}</span>
                </div>
              )}
              {rendering && <div className="center-fill" style={{ background: 'rgba(0,0,0,.35)' }}><span className="spinner" /></div>}
            </>
          ) : (
            <div className="center-fill">
              <div style={{ maxWidth: 420, display: 'grid', gap: 12, justifyItems: 'center' }}>
                <div className="dropzone-icon"><Icon name="sparkles" size={24} /></div>
                <div className="h3">{capture ? t('See your room restyled', 'Lihat ruanganmu dengan gaya baru') : t('Photoreal render of this design', 'Render fotorealistis desain ini')}</div>
                <div className="small muted">
                  {live
                    ? t('Muse Image renders the design as a photo. Takes up to a minute.', 'Muse Image merender desain ini menjadi foto. Butuh hingga satu menit.')
                    : t('AI render needs META_API_KEY on the server.', 'Render AI butuh META_API_KEY di server.')}
                </div>
                <button className="btn btn-brand" onClick={generate} disabled={!live || rendering}>
                  {rendering ? <><span className="spinner" style={{ borderTopColor: '#fff' }} />{t('Rendering…', 'Merender…')}</> : <><Icon name="sparkles" size={16} />{t('Generate render', 'Buat render')}{costs && <CostHint credits={costs.render} locale={locale} />}</>}
                </button>
                <div className="tiny muted">{t('AI visualisation — products may differ from the exact items.', 'Visualisasi AI — tampilan produk bisa berbeda dari barang aslinya.')}</div>
              </div>
            </div>
          )
        )}
      </div>
      {error && <div className="notice notice-error" style={{ margin: 12 }}><Icon name="alert" />{t('Render failed: ', 'Render gagal: ')}<code>{error}</code></div>}
    </section>
  )
}

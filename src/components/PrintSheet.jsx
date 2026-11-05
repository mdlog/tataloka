import React from 'react'
import FloorPlan from './FloorPlan.jsx'
import { formatIDR } from '../lib/roomLayout.js'
import { archLabel, priceDateLabel } from '../lib/labels.js'
import { getRoom } from '../data/rooms.js'
import { getStyle } from '../data/styles.js'

// Design board for "Print / Save as PDF" (only visible in print media).
// render = the AI render ({ url }), photo = the uploaded photo it was made from (this session only).
export default function PrintSheet({ roomGraph, shot, render, photo, locale = 'en' }) {
  if (!roomGraph) return null
  const t = (en, id) => (locale === 'id' ? id : en)
  const room = getRoom(roomGraph.room.type)
  const style = getStyle(roomGraph.style.name)
  const { w, l } = roomGraph.room.dimensions
  const b = roomGraph.layout.budget
  return (
    <div className="print-sheet">
      <h1>{roomGraph.title || `${style.label[locale] || style.id} ${room.label[locale] || room.label.en}`}</h1>
      <div className="ps-meta">
        {room.label[locale] || room.label.en} · {w} × {l} m{roomGraph.room.size === 'measured' ? ` (${t('measured', 'diukur')})` : roomGraph._source === 'live' ? ` (${t('AI estimate', 'perkiraan AI')})` : ''} · {style.label[locale] || style.id} · {t('Created', 'Dibuat')} {new Date().toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-GB')} · Tataloka
      </div>
      {render?.url && (
        <section className={`ps-render ${photo ? 'pair' : ''}`}>
          {photo && (
            <figure>
              <img src={photo} alt="" />
              <figcaption>{t('Before — your photo', 'Sebelum — foto ruanganmu')}</figcaption>
            </figure>
          )}
          <figure>
            <img src={render.url} alt="" />
            <figcaption>{photo ? t('After — AI render (Muse Image)', 'Sesudah — render AI (Muse Image)') : t('AI render (Muse Image)', 'Render AI (Muse Image)')}</figcaption>
          </figure>
          <p className="ps-note">{t('AI visualisation — products may look different from the items in the list below.', 'Visualisasi AI — tampilan produk bisa berbeda dari barang di daftar di bawah.')}</p>
        </section>
      )}
      <div className={`ps-figs ${shot ? '' : 'single'}`}>
        {shot && (
          <figure>
            <img src={shot} alt="" />
            <figcaption>{t('3D view', 'Tampilan 3D')}</figcaption>
          </figure>
        )}
        <figure>
          <FloorPlan roomGraph={roomGraph} locale={locale} interactive={false} />
          <figcaption>{t('Floor plan', 'Denah')} · {w} × {l} m</figcaption>
        </figure>
      </div>
      {roomGraph.summary && <p style={{ marginBottom: '10pt' }}>{roomGraph.summary}</p>}
      <table>
        <thead><tr><th /><th>{t('Product', 'Produk')}</th><th>{t('Type', 'Jenis')}</th><th>{t('Store', 'Toko')}</th><th style={{ textAlign: 'right' }}>{t('Price', 'Harga')}</th></tr></thead>
        <tbody>
          {roomGraph.layout.placedItems.map(it => (
            <tr key={it.id}>
              <td>{it.image && <img src={it.image} alt="" referrerPolicy="no-referrer" />}</td>
              <td>{it.name}{it.url && <div className="url">{it.url}</div>}</td>
              <td>{archLabel(it.archetype, locale)}</td>
              <td>{it.store || '—'}</td>
              <td style={{ textAlign: 'right' }}>{formatIDR(it.priceIDR)}{it.priceSource !== 'store' ? ` (${t('est.', 'estimasi')})` : ''}</td>
            </tr>
          ))}
          <tr className="ps-total"><td /><td colSpan={3}>{t('Total', 'Total')}</td><td style={{ textAlign: 'right' }}>{formatIDR(b.totalIDR)}</td></tr>
        </tbody>
      </table>
      {b.priceDate && <p style={{ marginTop: '8pt', color: '#555', fontSize: '8.5pt' }}>{t('Store prices as of', 'Harga toko per')} {priceDateLabel(b.priceDate, locale)}. {t('Prices and stock can change — check the store before buying.', 'Harga dan stok dapat berubah — cek toko sebelum membeli.')}</p>}
    </div>
  )
}

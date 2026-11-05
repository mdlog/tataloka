import React from 'react'
import Icon from './Icon.jsx'
import { formatIDR } from '../lib/roomLayout.js'
import { productImage } from '../lib/productArt.js'
import { archLabel, priceDateLabel } from '../lib/labels.js'

// Budget summary + the shopping list. One list = what is in the room = what you buy.
export default function ProductList({ roomGraph, budget, selectedId, onSelect, onRemove, onSwap, onAdd, onExportCsv, locale = 'en' }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const items = roomGraph.layout.placedItems
  const b = roomGraph.layout.budget
  const pct = budget ? Math.min(100, (b.totalIDR / budget) * 100) : 0
  const over = budget && b.totalIDR > budget

  return (
    <>
      <section className="card card-pad" aria-label={t('Budget', 'Budget')}>
        <div className="eyebrow">{t('Estimated total', 'Estimasi total')}</div>
        <div className="budget-total num" style={{ margin: '4px 0 10px' }}>{formatIDR(b.totalIDR)}</div>
        {budget ? (
          <>
            <div className={`meter ${over ? 'over' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={b.totalIDR}><div style={{ width: `${pct}%` }} /></div>
            <div className="small" style={{ marginTop: 8, color: over ? 'var(--danger)' : 'var(--ink-2)' }}>
              {over
                ? t(`${formatIDR(b.totalIDR - budget)} over your ${formatIDR(budget)} budget`, `${formatIDR(b.totalIDR - budget)} di atas budget ${formatIDR(budget)}`)
                : t(`${formatIDR(budget - b.totalIDR)} left of ${formatIDR(budget)}`, `Sisa ${formatIDR(budget - b.totalIDR)} dari ${formatIDR(budget)}`)}
            </div>
          </>
        ) : null}
        <div className="divider" style={{ margin: '14px 0 6px' }} />
        <div className="kv"><span>{t('Store prices', 'Harga toko')}</span><span className="num">{b.storeCount} {t('items', 'item')}</span></div>
        {b.estimateCount > 0 && <div className="kv"><span>{t('Estimated prices', 'Harga estimasi')}</span><span className="num">{b.estimateCount} {t('items', 'item')}</span></div>}
        {b.priceDate && <div className="tiny muted" style={{ marginTop: 6 }}>{t('Prices from the stores as of', 'Harga dari toko per')} {priceDateLabel(b.priceDate, locale)}. {t('Check the store before buying.', 'Cek di toko sebelum membeli.')}</div>}
      </section>

      <section className="card" aria-label={t('Products', 'Produk')}>
        <div className="card-head">
          <div className="h3">{t('Products', 'Produk')} <span className="muted" style={{ fontWeight: 500 }}>({items.length})</span></div>
          <button className="btn btn-secondary btn-sm" onClick={onAdd}><Icon name="plus" size={15} />{t('Add', 'Tambah')}</button>
        </div>
        {!items.length && <div className="card-pad small muted">{t('No products yet.', 'Belum ada produk.')}</div>}
        <div className="product-list">
          {items.map(it => (
            <div key={it.id} className={`product-row ${it.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(it.id === selectedId ? null : it.id)}
              role="button" tabIndex={0} aria-pressed={it.id === selectedId} onKeyDown={e => e.key === 'Enter' && onSelect(it.id)}>
              <img className="thumb" src={it.image || productImage(it.archetype, it.style)} alt="" loading="lazy" referrerPolicy="no-referrer"
                onError={e => { e.currentTarget.src = productImage(it.archetype, it.style) }} />
              <div style={{ minWidth: 0 }}>
                <div className="name" title={it.name}>{it.name}</div>
                <div className="sub">
                  <span>{archLabel(it.archetype, locale)}</span>
                  {it.store && <span className="badge">{it.store}</span>}
                  {it.availability === 'OutOfStock' && <span className="badge badge-warn">{t('Out of stock', 'Stok habis')}</span>}
                </div>
              </div>
              <div>
                <div className="price num">{formatIDR(it.priceIDR)}</div>
                {it.priceSource !== 'store' && <div className="tiny" style={{ color: 'var(--warn)', textAlign: 'right' }}>{t('estimate', 'estimasi')}</div>}
                <div className="row-actions" onClick={e => e.stopPropagation()}>
                  {it.url && <a className="btn btn-ghost btn-sm btn-icon" href={it.url} target="_blank" rel="noreferrer" title={t('View product', 'Lihat produk')} aria-label={t('View product', 'Lihat produk')}><Icon name="external" size={15} /></a>}
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onSwap(it)} title={t('Swap product', 'Ganti produk')} aria-label={t('Swap product', 'Ganti produk')}><Icon name="swap" size={15} /></button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(it.id)} title={t('Remove', 'Hapus')} aria-label={t('Remove', 'Hapus')}><Icon name="trash" size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div className="list-csv" style={{ padding: 16, borderTop: '1px solid var(--line)' }}>
            <button className="btn btn-secondary btn-block" onClick={onExportCsv}><Icon name="download" size={16} />{t('Download shopping list (CSV)', 'Unduh daftar belanja (CSV)')}</button>
          </div>
        )}
      </section>
    </>
  )
}

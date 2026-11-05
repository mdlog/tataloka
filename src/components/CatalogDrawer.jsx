import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { CostHint } from './Credits.jsx'
import { searchCatalog, CATALOG_META } from '../data/catalog.js'
import { getRoom } from '../data/rooms.js'
import { formatIDR } from '../lib/roomLayout.js'
import { archLabel, priceDateLabel } from '../lib/labels.js'
import { productImage } from '../lib/productArt.js'
import { marketSearch } from '../lib/api.js'

// Slide-over to add a product, or swap the product behind a placed item.
export default function CatalogDrawer({ mode, room, style, live, locale, initialQuery = '', onClose, onPick, costs }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const swapping = mode?.type === 'swap'
  const lockedType = swapping ? mode.item.archetype : null
  const [input, setInput] = useState(initialQuery)
  const [q, setQ] = useState(initialQuery)
  const [type, setType] = useState(lockedType || 'all')
  const [tab, setTab] = useState('catalog')
  const [market, setMarket] = useState({ loading: false, error: '', products: null })

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const result = useMemo(() => {
    const r = searchCatalog({ room, style, q, archetype: type, limit: 48 })
    return { ...r, products: r.products.filter(p => !swapping || p.id !== mode.item.productId) }
  }, [room, style, q, type, swapping, mode])

  async function runMarket() {
    const query = (input || (swapping ? mode.item.name.split(',')[0] : archLabel(type === 'all' ? getRoom(room).archetypes[0] : type, 'id'))).trim()
    setMarket({ loading: true, error: '', products: null })
    try {
      const r = await marketSearch(query, type === 'all' ? undefined : type)
      setMarket({ loading: false, error: '', products: r.products || [], query })
    } catch (e) {
      setMarket({ loading: false, error: e.code === 'no_credits' ? '' : e.message, products: null })
    }
  }

  const types = ['all', ...getRoom(room).designTypes]
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={swapping ? t('Swap product', 'Ganti produk') : t('Add a product', 'Tambah produk')}>
        <div className="drawer-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div className="eyebrow">{swapping ? t('Swap product', 'Ganti produk') : t('Add to your room', 'Tambah ke ruangan')}</div>
              <div className="h3" style={{ marginTop: 4 }}>{swapping ? mode.item.name : t('Real products you can buy', 'Produk nyata yang bisa dibeli')}</div>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('Close', 'Tutup')}><Icon name="x" /></button>
          </div>
          <form className="input-group" onSubmit={e => { e.preventDefault(); if (tab === 'catalog') setQ(input); else runMarket() }}>
            <Icon name="search" />
            <input className="input" value={input} onChange={e => setInput(e.target.value)} placeholder={t('Search: oak coffee table, rattan lamp…', 'Cari: meja kopi oak, lampu rotan…')} aria-label={t('Search products', 'Cari produk')} />
          </form>
          <div className="segmented" role="tablist" style={{ justifySelf: 'start' }}>
            <button role="tab" aria-selected={tab === 'catalog'} className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>{t('Catalog', 'Katalog')} · {result.total}</button>
            <button role="tab" aria-selected={tab === 'market'} className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>Tokopedia · Shopee</button>
          </div>
          {!lockedType && tab === 'catalog' && (
            <div className="chip-scroll">
              {types.map(a => <button key={a} className={`chip ${type === a ? 'active' : ''}`} onClick={() => setType(a)}>{a === 'all' ? t('All', 'Semua') : archLabel(a, locale)}</button>)}
            </div>
          )}
        </div>

        <div className="drawer-body">
          {tab === 'catalog' ? (
            <>
              {q && !result.matchedQuery && <div className="notice" style={{ marginBottom: 12 }}><Icon name="info" />{t(`No match for “${q}” — showing products for this room.`, `Tidak ada hasil untuk “${q}” — menampilkan produk untuk ruangan ini.`)}</div>}
              <div className="product-grid">
                {result.products.map(p => (
                  <article key={p.id} className="pcard">
                    <div className="media">
                      <img src={p.image || productImage(p.archetype, style)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.src = productImage(p.archetype, style) }} />
                      {p.availability === 'OutOfStock' && <span className="badge badge-warn">{t('Out of stock', 'Stok habis')}</span>}
                    </div>
                    <div className="body">
                      <div className="title" title={p.title}>{p.title}</div>
                      <div className="price num">{p.priceIDR ? formatIDR(p.priceIDR) : <span className="small muted">{t('Price on store page', 'Harga di halaman toko')}</span>}</div>
                      <div className="tiny muted">{p.store}</div>
                      <div className="foot">
                        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onPick(p)}>{swapping ? t('Use this', 'Pakai ini') : t('Add', 'Tambah')}</button>
                        <a className="btn btn-secondary btn-sm btn-icon" href={p.url} target="_blank" rel="noreferrer" aria-label={t('Open store page', 'Buka halaman toko')}><Icon name="external" size={15} /></a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!result.products.length && <div className="small muted">{t('No products in this category yet.', 'Belum ada produk di kategori ini.')}</div>}
              <p className="tiny muted" style={{ marginTop: 16 }}>
                {t('Catalog: IKEA Indonesia product data (name, photo, price, stock) collected from ikea.co.id on', 'Katalog: data produk IKEA Indonesia (nama, foto, harga, stok) dari ikea.co.id per')} {priceDateLabel(CATALOG_META.fetchedAt, locale)}.
              </p>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="notice notice-info"><Icon name="globe" />
                <span>{t('Live listings found with Meta web search. Only links that really came back from the search engine are shown; open the store page for the current price.',
                  'Listing langsung dari pencarian web Meta. Hanya tautan yang benar-benar dikembalikan mesin pencari yang ditampilkan; buka halaman toko untuk harga terkini.')}</span>
              </div>
              <button className="btn btn-primary" onClick={runMarket} disabled={!live || market.loading}>
                {market.loading ? <><span className="spinner" style={{ borderTopColor: '#fff' }} />{t('Searching…', 'Mencari…')}</> : <><Icon name="search" size={16} />{t('Search Tokopedia & Shopee', 'Cari di Tokopedia & Shopee')}{costs && <CostHint credits={costs.market} locale={locale} />}</>}
              </button>
              {!live && <div className="small muted">{t('Needs META_API_KEY on the server.', 'Butuh META_API_KEY di server.')}</div>}
              {market.error && <div className="notice notice-error"><Icon name="alert" /><code>{market.error}</code></div>}
              {market.products && !market.products.length && <div className="small muted">{t('No verified product listings found. Try a simpler search, e.g. “sofa 3 dudukan”.', 'Tidak ada listing produk terverifikasi. Coba kata kunci lebih sederhana, mis. “sofa 3 dudukan”.')}</div>}
              {market.products?.map(p => (
                <div key={p.url} className="listing">
                  {p.image ? <img src={p.image} alt="" referrerPolicy="no-referrer" /> : <div className="ph"><Icon name="store" /></div>}
                  <div style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 600, lineHeight: 1.35 }}>{p.name}</div>
                    <div className="tiny muted" style={{ marginTop: 2 }}><span className="badge">{p.store}</span></div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                    <a className="link small" href={p.url} target="_blank" rel="noreferrer">{t('See price', 'Lihat harga')} <Icon name="external" size={13} /></a>
                    {(p.archetype || lockedType || (type !== 'all' && type)) && (
                      <button className="btn btn-secondary btn-sm" onClick={() => onPick({ id: `mkt-${p.url}`, archetype: lockedType || p.archetype || type, title: p.name, store: p.store, url: p.url, image: p.image, priceIDR: null })}>
                        {swapping ? t('Use', 'Pakai') : t('Add', 'Tambah')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import FloorPlan from '../components/FloorPlan.jsx'
import useRoomStore from '../hooks/useRoomStore.js'
import { getMe } from '../lib/auth.js'
import { buildDemoRoomGraph } from '../lib/roomGraph.js'
import { formatIDR } from '../lib/roomLayout.js'
import { priceDateLabel } from '../lib/labels.js'
import { CATALOG, CATALOG_META, rankProducts } from '../data/catalog.js'
import { STYLES } from '../data/styles.js'
import { ROOMS } from '../data/rooms.js'
import { PLANS, ACTIONS, TOP_UP } from '../data/plans.js'
import './landing.css'

const BEFORE = '/samples/living-room.jpg'
const AFTER = '/landing/restyle-after.webp'
const DEMO_BUDGET = 20_000_000
const FREE = PLANS.find(p => p.id === 'free')
const ACTION = Object.fromEntries(ACTIONS.map(a => [a.id, a]))
const PHOTO_COST = ACTION.photoDesign.credits

// "GULLVALLA 2-seat sofa, Silkeryd dark grey-beige" → name + variant
const shortName = (title) => String(title || '').split(',')[0]
const variant = (title) => String(title || '').split(',').slice(1).join(',').trim()

function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll('.lp-reveal')]
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }), { rootMargin: '0px 0px -10% 0px' })
    els.forEach(e => io.observe(e))
    return () => io.disconnect()
  }, [])
}

// Opened as /#pricing (e.g. "See plans" in the app): this page is a lazy chunk, so the
// browser's own jump to the anchor ran before the section existed. Jump here instead, and
// follow the section while images above it load, until the user scrolls.
function useHashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    const el = id && document.getElementById(id)
    if (!el) return
    const jump = () => el.scrollIntoView({ behavior: 'instant', block: 'start' })
    jump()
    let touched = false
    const stop = () => { touched = true }
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown']
    events.forEach(e => window.addEventListener(e, stop, { passive: true }))
    const follow = () => { if (!touched) jump() }
    const timers = [120, 450, 1200].map(ms => setTimeout(follow, ms))
    window.addEventListener('load', follow)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('load', follow)
      events.forEach(e => window.removeEventListener(e, stop))
    }
  }, [])
}

// Before/after slider: the real sample photo vs. Muse Image's restyle of it.
function BeforeAfter({ t }) {
  const [cut, setCut] = useState(54)
  const touched = useRef(false)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let frame, start
    const step = (ts) => {
      if (touched.current) return
      start ??= ts
      const p = Math.min(1, (ts - start) / 1600)
      setCut(54 + Math.sin(p * Math.PI) * 18)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    const timer = setTimeout(() => { frame = requestAnimationFrame(step) }, 900)
    return () => { clearTimeout(timer); cancelAnimationFrame(frame) }
  }, [])
  return (
    <div className="lp-compare" style={{ '--cut': `${cut}%` }}>
      <img src={BEFORE} alt={t('Original room photo', 'Foto ruangan asli')} width="1024" height="904" />
      <img className="after" src={AFTER} alt={t('The same room restyled by Muse Image', 'Ruangan yang sama setelah diubah gayanya oleh Muse Image')} width="1664" height="1456" />
      <div className="lp-compare-handle" aria-hidden="true"><span><Icon name="swap" size={16} /></span></div>
      <span className="lp-compare-label left">{t('Before', 'Sebelum')}</span>
      <span className="lp-compare-label right">{t('After · AI render', 'Sesudah · render AI')}</span>
      <input type="range" min={0} max={100} value={cut} aria-label={t('Compare before and after', 'Bandingkan sebelum dan sesudah')}
        onChange={e => { touched.current = true; setCut(Number(e.target.value)) }} />
    </div>
  )
}

export default function Landing() {
  const { locale, setLocale } = useRoomStore()
  const t = (en, id) => (locale === 'id' ? id : en)
  const [user, setUser] = useState(undefined)
  const [scrolled, setScrolled] = useState(false)
  const [yearly, setYearly] = useState(false)
  useReveal()
  useHashScroll()
  useEffect(() => { getMe().then(setUser) }, [])
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const demo = useMemo(() => buildDemoRoomGraph('living', 'Japandi', locale, undefined, DEMO_BUDGET), [locale])
  const sofa = demo.layout.placedItems.find(i => i.archetype === 'sofa')
  const ikeaCount = CATALOG.filter(p => p.store === 'IKEA Indonesia').length
  const priceDate = priceDateLabel(CATALOG_META.fetchedAt, locale)
  const collages = useMemo(() => Object.fromEntries(STYLES.map(s => [s.id,
    ['sofa', 'coffee_table', 'lamp'].map(a => rankProducts(a, { room: 'living', style: s.id }).find(p => p.image && p.styles?.includes(s.id)) || rankProducts(a, { room: 'living', style: s.id })[0])
      .filter(Boolean).map(p => p.image)])), [])

  const cta = user ? t('Open the app', 'Buka aplikasi') : t('Design my room — free', 'Desain ruanganku — gratis')

  const steps = [
    { icon: 'camera', title: t('Upload a photo', 'Upload foto'), text: t('Snap your room — or just pick a room type. SAM 3.1 finds the walls, floor, windows and the furniture you already have.', 'Foto ruanganmu — atau cukup pilih tipe ruangan. SAM 3.1 mengenali dinding, lantai, jendela, dan furnitur yang sudah ada.') },
    { icon: 'sparkles', title: t('Choose style & budget', 'Pilih gaya & budget'), text: t('Muse Spark plans the layout and picks real products that fit your style, your room size and your budget.', 'Muse Spark menyusun layout dan memilih produk nyata yang cocok dengan gaya, ukuran ruangan, dan budgetmu.') },
    { icon: 'cart', title: t('Edit, preview & shop', 'Edit, lihat & belanja'), text: t('Fine-tune it in 3D or on the floor plan, see a photoreal render of your own room, then buy each piece from the store.', 'Rapikan di 3D atau denah, lihat render fotorealistis ruanganmu sendiri, lalu beli tiap furnitur langsung dari tokonya.') },
  ]
  const features = [
    { icon: 'tag', title: t('Real products, real prices', 'Produk nyata, harga asli'), text: t(`${ikeaCount} products from IKEA Indonesia with official names, photos, stock and prices (as of ${priceDate}). No made-up furniture.`, `${ikeaCount} produk IKEA Indonesia dengan nama, foto, stok, dan harga resmi (per ${priceDate}). Bukan furnitur khayalan.`) },
    { icon: 'wallet', title: t('Designed to your budget', 'Sesuai budgetmu'), text: t('Set a budget and the AI stays within it. Swap any piece for a cheaper alternative and the total updates instantly.', 'Atur budget dan AI menjaganya. Ganti furnitur dengan alternatif lebih murah dan total langsung diperbarui.') },
    { icon: 'cube', title: t('3D room & floor plan', 'Ruang 3D & denah'), text: t('Orbit a 3D room sized to your space, drag furniture around, and check clearances on a to-scale floor plan.', 'Putar ruang 3D seukuran ruanganmu, geser furnitur, dan cek jarak di denah berskala.') },
    { icon: 'image', title: t('See it in your own room', 'Lihat di ruanganmu sendiri'), text: t('Muse Image restyles the photo you uploaded, so you can compare before and after side by side.', 'Muse Image mengubah gaya foto yang kamu upload, jadi kamu bisa membandingkan sebelum dan sesudah.') },
    { icon: 'mic', title: t('Just ask', 'Tinggal minta'), text: t('“Make it Scandinavian”, “add a floor lamp” — talk or type in English or Bahasa Indonesia.', '“Ganti gaya Skandinavia”, “tambah lampu lantai” — ucapkan atau ketik dalam Bahasa Indonesia atau Inggris.') },
    { icon: 'layers', title: t('Saved & shareable', 'Tersimpan & bisa dibagikan'), text: t('Every design is saved to your account. Export a shopping list (CSV) or a print-ready design board.', 'Setiap desain tersimpan di akunmu. Ekspor daftar belanja (CSV) atau papan desain siap cetak.') },
  ]
  const faqs = [
    [t('Is Tataloka free?', 'Apakah Tataloka gratis?'), t(`Yes. Every free account gets ${FREE.monthlyCredits} AI credits each month — about ${Math.floor(FREE.monthlyCredits / PHOTO_COST)} designs from a photo. No credit card needed. Paid plans with more credits are coming soon.`, `Ya. Setiap akun gratis mendapat ${FREE.monthlyCredits} kredit AI setiap bulan — sekitar ${Math.floor(FREE.monthlyCredits / PHOTO_COST)} desain dari foto. Tanpa kartu kredit. Paket berbayar dengan kredit lebih banyak segera hadir.`)],
    [t('What is a credit?', 'Apa itu kredit?'), t(`Credits pay for the AI work: a design from a photo costs ${PHOTO_COST}, a design without a photo or a restyle ${ACTION.design.credits}, an AI render ${ACTION.render.credits} and a marketplace search ${ACTION.market.credits}. Editing, saving and exporting are free, and so is the design assistant while you have credits left. If an AI call fails, its credits are refunded automatically. Monthly credits refill on the 1st (Jakarta time).`, `Kredit membayar kerja AI: desain dari foto ${PHOTO_COST} kredit, desain tanpa foto atau ganti gaya ${ACTION.design.credits}, render AI ${ACTION.render.credits}, dan pencarian marketplace ${ACTION.market.credits}. Mengedit, menyimpan, dan mengekspor gratis, begitu juga asisten desain selama kreditmu masih ada. Kalau panggilan AI gagal, kreditnya dikembalikan otomatis. Kredit bulanan terisi lagi setiap tanggal 1 (WIB).`)],
    [t('Are the prices real?', 'Apakah harganya asli?'), t(`Yes. IKEA Indonesia prices come from the store's own product pages and are dated (currently ${priceDate}). Prices can change, so the store's current price applies when you buy.`, `Ya. Harga IKEA Indonesia diambil dari halaman produk tokonya sendiri dan diberi tanggal (saat ini ${priceDate}). Harga bisa berubah, jadi yang berlaku adalah harga toko saat kamu membeli.`)],
    [t('Where do I buy the furniture?', 'Di mana saya membeli furniturnya?'), t('Each product links to its page at IKEA Indonesia. You can also find comparable listings on Tokopedia and Shopee — only links that really exist are shown.', 'Setiap produk terhubung ke halamannya di IKEA Indonesia. Kamu juga bisa mencari listing serupa di Tokopedia dan Shopee — hanya tautan yang benar-benar ada yang ditampilkan.')],
    [t('Is my room photo or video stored?', 'Apakah foto atau video ruanganku disimpan?'), t('No. A video never leaves your phone — the app picks a few still frames from it. Photos and frames are used to generate the design and are never stored on our server. What is saved to your account is the design and, if you made one, its AI render — visible only to you and deleted when you delete the design.', 'Tidak. Video tidak pernah keluar dari HP-mu — aplikasi hanya mengambil beberapa frame diam darinya. Foto dan frame hanya dipakai untuk membuat desain dan tidak pernah disimpan di server kami. Yang tersimpan di akunmu adalah desainnya dan, jika kamu membuatnya, render AI-nya — hanya bisa dilihat olehmu dan ikut terhapus saat desain dihapus.')],
    [t('Which AI does it use?', 'AI apa yang dipakai?'), t('Meta’s Model API: SAM 3.1 to understand the photo, Muse Spark to design and choose products, Muse Image for photoreal renders, and Muse Voice Transcribe for voice commands.', 'Meta Model API: SAM 3.1 untuk memahami foto, Muse Spark untuk mendesain dan memilih produk, Muse Image untuk render fotorealistis, dan Muse Voice Transcribe untuk perintah suara.')],
    [t('Do I need a photo?', 'Apakah harus pakai foto?'), t('No. Pick a room type and Tataloka designs a typical room of that size — you can still edit everything.', 'Tidak. Pilih tipe ruangan dan Tataloka akan mendesain ruang tipikal seukuran itu — semuanya tetap bisa kamu edit.')],
    [t('How accurate are the room measurements?', 'Seberapa akurat ukuran ruangannya?'), t('A camera alone cannot know real scale, so from a photo or video the AI estimates the size (using doors and furniture as references). For an exact floor plan, enter the width and length you measured with a tape — before designing or afterwards. A video or several photos help the AI see every wall and the furniture you already have.', 'Kamera saja tidak bisa tahu skala sebenarnya, jadi dari foto atau video AI memperkirakan ukuran (memakai pintu dan furnitur sebagai patokan). Untuk denah yang pas, isi lebar dan panjang hasil ukur meteran — sebelum atau sesudah desain. Video atau beberapa foto membantu AI melihat semua dinding dan furnitur yang sudah ada.')],
    [t('Does it work on my phone?', 'Bisa dipakai di HP?'), t('Yes, in any modern mobile browser — take the photo straight from your camera.', 'Bisa, di browser HP modern mana pun — ambil foto langsung dari kamera.')],
  ]

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">{t('Skip to content', 'Lewati ke konten')}</a>
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-container lp-nav-inner">
          <a className="lp-brand" href="/" aria-label="Tataloka">
            <span className="brand-mark"><Icon name="logo" size={18} /></span>Tataloka
          </a>
          <nav className="lp-links" aria-label={t('Sections', 'Bagian')}>
            <a href="#how">{t('How it works', 'Cara kerja')}</a>
            <a href="#features">{t('Features', 'Fitur')}</a>
            <a href="#styles">{t('Styles', 'Gaya')}</a>
            <a href="#pricing">{t('Pricing', 'Harga')}</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-actions">
            <div className="segmented" role="group" aria-label="Language">
              {['en', 'id'].map(l => <button key={l} className={locale === l ? 'active' : ''} aria-pressed={locale === l} onClick={() => setLocale(l)}>{l.toUpperCase()}</button>)}
            </div>
            {user === null && <a className="btn btn-ghost btn-sm lp-hide-sm" href="/app?login=1">{t('Log in', 'Masuk')}</a>}
            {user && <a className="btn btn-ghost btn-sm lp-hide-sm" href="/app?designs=1">{t('My designs', 'Desain saya')}</a>}
            <a className="btn btn-primary btn-sm" href={user ? '/app' : '/app?signup=1'}>{user ? t('Open app', 'Buka aplikasi') : t('Get started', 'Mulai')}</a>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ---------- hero ---------- */}
        <section className="lp-hero">
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-pill"><span className="dot ok" />{t('Built with Meta AI · SAM 3.1 + Muse Spark', 'Dibangun dengan Meta AI · SAM 3.1 + Muse Spark')}</span>
              <h1 className="lp-h1">{t('Redesign your room from one photo — with furniture you can actually buy.', 'Desain ulang ruanganmu dari satu foto — dengan furnitur yang benar-benar bisa dibeli.')}</h1>
              <p className="lp-lead">{t('Tataloka reads your room, designs a layout for your style and budget, and furnishes it with real products from IKEA Indonesia — with today’s prices, a 3D view and a shopping list.',
                'Tataloka membaca ruanganmu, menyusun layout sesuai gaya dan budget, lalu mengisinya dengan produk nyata dari IKEA Indonesia — lengkap dengan harga terkini, tampilan 3D, dan daftar belanja.')}</p>
              <div className="lp-cta-row">
                <a className="btn btn-brand btn-lg" href="/app">{cta}<Icon name="chevronRight" size={18} /></a>
                <a className="btn btn-secondary btn-lg" href="#how">{t('See how it works', 'Lihat cara kerjanya')}</a>
              </div>
              <ul className="lp-micro">
                <li><Icon name="check" size={15} />{t(`${FREE.monthlyCredits} free credits every month`, `${FREE.monthlyCredits} kredit gratis tiap bulan`)}</li>
                <li><Icon name="check" size={15} />{t('No credit card', 'Tanpa kartu kredit')}</li>
                <li><Icon name="check" size={15} />{t('Works on mobile', 'Bisa di HP')}</li>
              </ul>
            </div>
            <div className="lp-hero-visual">
              <BeforeAfter t={t} />
              <div className="lp-float lp-float-budget" aria-hidden="true">
                <div className="eyebrow">{t('Estimated total', 'Estimasi total')}</div>
                <div className="lp-float-total">{formatIDR(demo.layout.budget.totalIDR)}</div>
                <div className="meter"><div style={{ width: `${Math.min(100, demo.layout.budget.totalIDR / DEMO_BUDGET * 100)}%` }} /></div>
                <div className="tiny muted" style={{ marginTop: 6 }}>{demo.layout.placedItems.length} {t('real products', 'produk nyata')} · {t('budget', 'budget')} {formatIDR(DEMO_BUDGET)}</div>
              </div>
              {sofa && (
                <div className="lp-float lp-float-product" aria-hidden="true">
                  <img src={sofa.image} alt="" referrerPolicy="no-referrer" />
                  <div style={{ minWidth: 0 }}>
                    <div className="lp-float-name">{sofa.name}</div>
                    <div className="tiny muted">{sofa.store} · <strong style={{ color: 'var(--ink)' }}>{formatIDR(sofa.priceIDR)}</strong></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---------- proof strip ---------- */}
        <section className="lp-strip" aria-label={t('At a glance', 'Sekilas')}>
          <div className="lp-container lp-stats">
            <div><strong>&lt; 30 s</strong><span>{t('from photo to full design', 'dari foto ke desain lengkap')}</span></div>
            <div><strong>{ikeaCount}</strong><span>{t('real IKEA Indonesia products', 'produk nyata IKEA Indonesia')}</span></div>
            <div><strong>{ROOMS.length} × {STYLES.length}</strong><span>{t('room types × styles', 'tipe ruang × gaya')}</span></div>
            <div><strong>4</strong><span>{t('Meta AI models working together', 'model Meta AI bekerja bersama')}</span></div>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section id="how" className="lp-section">
          <div className="lp-container">
            <div className="lp-head lp-reveal">
              <span className="eyebrow">{t('How it works', 'Cara kerja')}</span>
              <h2 className="lp-h2">{t('From photo to shopping list in three steps', 'Dari foto ke daftar belanja dalam tiga langkah')}</h2>
            </div>
            <ol className="lp-steps">
              {steps.map((s, i) => (
                <li key={s.title} className="lp-step lp-reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="lp-step-num">{i + 1}</div>
                  <div className="lp-icon"><Icon name={s.icon} size={22} /></div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- showcase (real components, real data) ---------- */}
        <section className="lp-section lp-showcase-wrap">
          <div className="lp-container lp-showcase">
            <div className="lp-showcase-copy lp-reveal">
              <span className="eyebrow">{t('Inside the app', 'Di dalam aplikasi')}</span>
              <h2 className="lp-h2">{t('A plan you can measure. A list you can buy.', 'Denah yang bisa diukur. Daftar yang bisa dibeli.')}</h2>
              <p className="lp-lead">{t('Every design comes with a to-scale floor plan and a shopping list of real products — names, photos, prices and a link to the store. Swap anything; the budget follows.',
                'Setiap desain dilengkapi denah berskala dan daftar belanja produk nyata — nama, foto, harga, dan tautan ke toko. Ganti apa pun; budget ikut menyesuaikan.')}</p>
              <ul className="lp-checks">
                <li><Icon name="check" size={16} />{t('Room size estimated from your photo', 'Ukuran ruangan diperkirakan dari fotomu')}</li>
                <li><Icon name="check" size={16} />{t('Furniture scaled to each product’s real dimensions', 'Furnitur diskalakan sesuai dimensi asli produk')}</li>
                <li><Icon name="check" size={16} />{t('Store prices dated, estimates clearly marked', 'Harga toko bertanggal, estimasi ditandai jelas')}</li>
              </ul>
            </div>
            <div className="lp-mock lp-reveal" aria-label={t('Example design', 'Contoh desain')}>
              <div className="lp-mock-bar"><span /><span /><span /><em>{demo.title}</em></div>
              <div className="lp-mock-body">
                <div className="lp-mock-plan"><FloorPlan roomGraph={demo} locale={locale} interactive={false} /></div>
                <div className="lp-mock-list">
                  {demo.layout.placedItems.filter(i => i.archetype !== 'rug').slice(0, 4).map(it => (
                    <div key={it.id} className="lp-mock-row">
                      <img src={it.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      <div style={{ minWidth: 0 }}>
                        <div className="lp-mock-name">{shortName(it.name)}</div>
                        <div className="tiny muted lp-mock-variant">{variant(it.name) || it.store}</div>
                        <strong className="lp-mock-price">{formatIDR(it.priceIDR)}</strong>
                      </div>
                    </div>
                  ))}
                  <div className="lp-mock-total"><span>{t('Total', 'Total')}</span><strong>{formatIDR(demo.layout.budget.totalIDR)}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- features ---------- */}
        <section id="features" className="lp-section">
          <div className="lp-container">
            <div className="lp-head lp-reveal">
              <span className="eyebrow">{t('Features', 'Fitur')}</span>
              <h2 className="lp-h2">{t('Everything between “I want a nicer room” and “ordered”', 'Semua yang dibutuhkan dari “ingin ruangan lebih bagus” sampai “sudah dipesan”')}</h2>
            </div>
            <div className="lp-features">
              {features.map((f, i) => (
                <article key={f.title} className="lp-feature lp-reveal" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                  <div className="lp-icon"><Icon name={f.icon} size={20} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- styles ---------- */}
        <section id="styles" className="lp-section lp-tint">
          <div className="lp-container">
            <div className="lp-head lp-reveal">
              <span className="eyebrow">{t('Styles', 'Gaya')}</span>
              <h2 className="lp-h2">{t('Six styles, furnished with real products', 'Enam gaya, diisi produk nyata')}</h2>
              <p className="lp-lead">{t('Each style is a moodboard of products you can buy today. Pick one to start.', 'Setiap gaya adalah moodboard produk yang bisa dibeli hari ini. Pilih satu untuk mulai.')}</p>
            </div>
            <div className="lp-styles">
              {STYLES.map(s => (
                <a key={s.id} className="lp-style lp-reveal" href={`/app?style=${s.id}`}>
                  <div className="lp-style-collage">{(collages[s.id] || []).map((src, i) => <img key={i} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />)}</div>
                  <div className="lp-style-meta">
                    <div>
                      <h3>{s.label[locale] || s.id}</h3>
                      <p>{s.desc[locale] || s.desc.en}</p>
                    </div>
                    <span className="swatches">{s.swatch.map(c => <i key={c} style={{ background: c }} />)}</span>
                  </div>
                  <span className="lp-style-go">{t('Design in this style', 'Desain dengan gaya ini')} <Icon name="chevronRight" size={15} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- pricing ---------- */}
        <section id="pricing" className="lp-section">
          <div className="lp-container">
            <div className="lp-head lp-reveal">
              <span className="eyebrow">{t('Pricing', 'Harga')}</span>
              <h2 className="lp-h2">{t('Start free. Upgrade only if you need more.', 'Mulai gratis. Upgrade hanya jika butuh lebih.')}</h2>
              <p className="lp-lead">{t(`Every account gets ${FREE.monthlyCredits} AI credits every month. Paid plans are coming soon — there is nothing to pay today.`, `Setiap akun mendapat ${FREE.monthlyCredits} kredit AI setiap bulan. Paket berbayar segera hadir — saat ini tidak ada yang perlu dibayar.`)}</p>
              <div className="segmented lp-billing" role="group" aria-label={t('Billing period', 'Periode tagihan')}>
                <button className={!yearly ? 'active' : ''} aria-pressed={!yearly} onClick={() => setYearly(false)}>{t('Monthly', 'Bulanan')}</button>
                <button className={yearly ? 'active' : ''} aria-pressed={yearly} onClick={() => setYearly(true)}>{t('Yearly', 'Tahunan')} <span className="lp-save">{t('2 months free', 'gratis 2 bulan')}</span></button>
              </div>
            </div>
            <div className="lp-plans">
              {PLANS.map(p => (
                <article key={p.id} className={`lp-plan lp-reveal ${p.popular ? 'popular' : ''}`}>
                  {p.popular && <span className="lp-plan-badge">{t('Most popular', 'Paling populer')}</span>}
                  <h3>{p.name[locale]}</h3>
                  <p className="lp-plan-tag">{p.tagline[locale]}</p>
                  <div className="lp-price">
                    {p.priceIDR === 0
                      ? <><strong>{formatIDR(0)}</strong><span>{t('forever', 'selamanya')}</span></>
                      : yearly
                        ? <><strong>{formatIDR(Math.round(p.yearlyIDR / 12))}</strong><span>/{t('month', 'bulan')}</span></>
                        : <><strong>{formatIDR(p.priceIDR)}</strong><span>/{t('month', 'bulan')}</span></>}
                  </div>
                  <div className="lp-price-note">{p.priceIDR === 0 ? t('No credit card needed', 'Tanpa kartu kredit') : yearly ? t(`${formatIDR(p.yearlyIDR)} billed yearly`, `${formatIDR(p.yearlyIDR)} ditagih per tahun`) : t('Billed monthly · cancel any time', 'Ditagih bulanan · berhenti kapan saja')}</div>
                  <div className="lp-plan-credits"><Icon name="sparkles" size={16} /><strong>{p.monthlyCredits}</strong> {t('credits / month', 'kredit / bulan')}</div>
                  <ul>{p.features[locale].map(f => <li key={f}><Icon name="check" size={15} />{f}</li>)}</ul>
                  {p.available
                    ? <a className={`btn ${p.popular ? 'btn-brand' : 'btn-primary'} btn-block`} href={user ? '/app' : '/app?signup=1'}>{user ? t('Open the app', 'Buka aplikasi') : t('Start free', 'Mulai gratis')}</a>
                    : <button className="btn btn-secondary btn-block" disabled>{t('Coming soon', 'Segera hadir')}</button>}
                </article>
              ))}
            </div>
            <div className="lp-credit-info lp-reveal">
              <div>
                <h3>{t('What a credit buys', 'Apa yang bisa dibeli dengan kredit')}</h3>
                <p>{t('You only pay for AI work. Editing, saving and exporting are free, the assistant is free while you have credits, and failed AI calls are refunded automatically.', 'Kamu hanya membayar kerja AI. Mengedit, menyimpan, dan mengekspor gratis, asisten gratis selama kreditmu masih ada, dan panggilan AI yang gagal dikembalikan otomatis.')}</p>
                <p className="lp-topup"><Icon name="wallet" size={16} />{t(`Top-up packs: ${TOP_UP.credits} credits for ${formatIDR(TOP_UP.priceIDR)}, valid ${TOP_UP.validMonths} months — coming soon.`, `Paket isi ulang: ${TOP_UP.credits} kredit seharga ${formatIDR(TOP_UP.priceIDR)}, berlaku ${TOP_UP.validMonths} bulan — segera hadir.`)}</p>
              </div>
              <ul>
                {ACTIONS.map(a => (
                  <li key={a.id}>
                    <span>{locale === 'id' ? a.id_ : a.en}<small>{locale === 'id' ? a.noteId : a.noteEn}</small></span>
                    <strong>{a.credits ? `${a.credits} ${t(a.credits === 1 ? 'credit' : 'credits', 'kredit')}` : t('Free', 'Gratis')}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- trust ---------- */}
        <section className="lp-section">
          <div className="lp-container">
            <div className="lp-head lp-reveal">
              <span className="eyebrow">{t('Honest by design', 'Jujur sejak awal')}</span>
              <h2 className="lp-h2">{t('No made-up furniture. No made-up links.', 'Tanpa furnitur khayalan. Tanpa tautan palsu.')}</h2>
            </div>
            <div className="lp-trust">
              <div className="lp-trust-item lp-reveal"><Icon name="store" size={22} /><h3>{t('Prices from the store itself', 'Harga dari tokonya langsung')}</h3><p>{t('Names, photos, stock and prices are read from IKEA Indonesia’s own product pages, with the date shown.', 'Nama, foto, stok, dan harga dibaca dari halaman produk IKEA Indonesia sendiri, lengkap dengan tanggalnya.')}</p></div>
              <div className="lp-trust-item lp-reveal"><Icon name="globe" size={22} /><h3>{t('Every link verified', 'Setiap tautan terverifikasi')}</h3><p>{t('Marketplace listings are kept only if the link really came back from Meta’s web search — AI never invents a URL or a price.', 'Listing marketplace hanya ditampilkan jika tautannya benar-benar dikembalikan pencarian web Meta — AI tidak pernah mengarang URL atau harga.')}</p></div>
              <div className="lp-trust-item lp-reveal"><Icon name="eye" size={22} /><h3>{t('Your photo stays yours', 'Fotomu tetap milikmu')}</h3><p>{t('Uploaded room photos are never stored. Your designs and their AI renders are private to you — delete them any time.', 'Foto ruangan yang kamu upload tidak pernah disimpan. Desain dan render AI-nya hanya bisa kamu lihat — hapus kapan saja.')}</p></div>
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="lp-section lp-tint">
          <div className="lp-container lp-faq-grid">
            <div className="lp-head lp-reveal" style={{ textAlign: 'left', margin: 0 }}>
              <span className="eyebrow">FAQ</span>
              <h2 className="lp-h2">{t('Questions, answered', 'Pertanyaan yang sering muncul')}</h2>
              <p className="lp-lead">{t('Something else? Email ', 'Ada yang lain? Email ')}<a className="link" href="mailto:info@tataloka.com">info@tataloka.com</a>.</p>
            </div>
            <div className="lp-faq">
              {faqs.map(([q, a], i) => (
                <details key={q} className="lp-faq-item" open={i === 0}>
                  <summary>{q}<Icon name="plus" size={18} /></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section className="lp-section">
          <div className="lp-container">
            <div className="lp-final lp-reveal">
              <div>
                <h2 className="lp-h2">{t('Your room, redesigned in under a minute.', 'Ruanganmu, didesain ulang dalam satu menit.')}</h2>
                <p>{t('Upload a photo, pick a style, and get a design you can actually buy.', 'Upload foto, pilih gaya, dan dapatkan desain yang benar-benar bisa dibeli.')}</p>
              </div>
              <a className="btn btn-brand btn-lg" href="/app">{cta}<Icon name="chevronRight" size={18} /></a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-grid">
          <div>
            <a className="lp-brand" href="/"><span className="brand-mark"><Icon name="logo" size={18} /></span>Tataloka</a>
            <p className="small muted" style={{ marginTop: 10, maxWidth: 320 }}>{t('From “tata” (arrange) + “loka” (place): arrange your room with AI.', 'Dari “tata” + “loka” (ruang/tempat): tata ruangmu dengan AI.')}</p>
          </div>
          <div>
            <h4>{t('Product', 'Produk')}</h4>
            <a href="/app">{t('Open the app', 'Buka aplikasi')}</a>
            <a href="#features">{t('Features', 'Fitur')}</a>
            <a href="#styles">{t('Styles', 'Gaya')}</a>
            <a href="#pricing">{t('Pricing', 'Harga')}</a>
          </div>
          <div>
            <h4>{t('Company', 'Perusahaan')}</h4>
            <a href="/privacy">{t('Privacy Policy', 'Kebijakan Privasi')}</a>
            <a href="/terms">{t('Terms of Service', 'Ketentuan Layanan')}</a>
            <a href="mailto:info@tataloka.com">{t('Contact', 'Kontak')}</a>
          </div>
          <div>
            <h4>{t('Built with', 'Dibangun dengan')}</h4>
            <span>Meta Model API</span>
            <span>SAM 3.1 · Muse Spark</span>
            <span>Muse Image · Muse Voice</span>
          </div>
        </div>
        <div className="lp-container lp-footer-base">
          <div>
            <span>© 2026 Tataloka</span>
            <span>{t('Product data: IKEA Indonesia', 'Data produk: IKEA Indonesia')} ({priceDate}). {t('Sample photo: Unsplash; “after” image generated by Muse Image.', 'Foto contoh: Unsplash; gambar “sesudah” dibuat oleh Muse Image.')}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

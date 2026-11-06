// Plans and credit costs — one source for the server (charging), the app
// (balance + costs on buttons) and the landing page (pricing).
// 1 credit covers at most ~US$0.0142 of Meta Model API usage (measured); see docs/PRICING.md.

// Credits charged per server route. Assistant commands and voice transcription cost nothing,
// but work only while the account has credits left (server/credits.js requireBalance).
// `views` is added to a design that also reads extra views of the room (video frames / more photos).
export const ROUTE_COSTS = { segment: 2, design: 1, views: 2, render: 1, market: 1 }

// What users see: one line per action.
export const ACTIONS = [
  { id: 'photoDesign', credits: ROUTE_COSTS.segment + ROUTE_COSTS.design, en: 'Design from your photo', id_: 'Desain dari fotomu', noteEn: 'SAM 3.1 + Muse Spark', noteId: 'SAM 3.1 + Muse Spark' },
  { id: 'videoDesign', credits: ROUTE_COSTS.segment + ROUTE_COSTS.design + ROUTE_COSTS.views, en: 'Design from a video or several photos', id_: 'Desain dari video atau beberapa foto', noteEn: 'SAM 3.1 + Muse Spark, up to 7 views', noteId: 'SAM 3.1 + Muse Spark, hingga 7 sudut' },
  { id: 'design', credits: ROUTE_COSTS.design, en: 'Design without a photo, or restyle', id_: 'Desain tanpa foto, atau ganti gaya', noteEn: 'Muse Spark', noteId: 'Muse Spark' },
  { id: 'render', credits: ROUTE_COSTS.render, en: 'Photoreal AI render', id_: 'Render foto AI', noteEn: 'Muse Image', noteId: 'Muse Image' },
  { id: 'market', credits: ROUTE_COSTS.market, en: 'Search Tokopedia & Shopee', id_: 'Cari di Tokopedia & Shopee', noteEn: 'Meta web search · repeats are free', noteId: 'Pencarian web Meta · pencarian ulang gratis' },
  { id: 'assistant', credits: 0, en: 'Design assistant (text & voice)', id_: 'Asisten desain (teks & suara)', noteEn: 'Muse Spark · Muse Voice · free while you have credits', noteId: 'Muse Spark · Muse Voice · gratis selama masih ada kredit' },
]

export const PLANS = [
  {
    id: 'free', available: true, priceIDR: 0, monthlyCredits: 30,
    name: { en: 'Free', id: 'Gratis' },
    tagline: { en: 'Try it on your own rooms.', id: 'Coba untuk ruanganmu sendiri.' },
    features: {
      en: ['30 credits every month (≈10 designs from a photo)', 'All 6 styles and 6 room types', '3D, floor plan, AI render and shopping list', 'Designs saved to your account', 'CSV and print export'],
      id: ['30 kredit setiap bulan (≈10 desain dari foto)', 'Semua 6 gaya dan 6 tipe ruangan', '3D, denah, render AI, dan daftar belanja', 'Desain tersimpan di akunmu', 'Ekspor CSV dan cetak'],
    },
  },
  {
    id: 'plus', available: false, popular: true, priceIDR: 49_000, yearlyIDR: 490_000, monthlyCredits: 150,
    name: { en: 'Plus', id: 'Plus' },
    tagline: { en: 'For renovating or moving house.', id: 'Untuk renovasi atau pindah rumah.' },
    features: {
      en: ['150 credits every month (≈50 designs from a photo)', 'Everything in Free', 'Unused credits roll over one month', 'Buy extra credits any time', 'Priority email support'],
      id: ['150 kredit setiap bulan (≈50 desain dari foto)', 'Semua fitur Gratis', 'Sisa kredit terbawa 1 bulan', 'Beli kredit tambahan kapan saja', 'Dukungan email prioritas'],
    },
  },
  {
    id: 'pro', available: false, priceIDR: 129_000, yearlyIDR: 1_290_000, monthlyCredits: 400,
    name: { en: 'Pro', id: 'Pro' },
    tagline: { en: 'For interior designers and property agents.', id: 'Untuk desainer interior dan agen properti.' },
    features: {
      en: ['400 credits every month (≈130 designs from a photo)', 'Everything in Plus', 'Commercial use: designs for your clients', 'Design boards with your own logo', 'Priority support'],
      id: ['400 kredit setiap bulan (≈130 desain dari foto)', 'Semua fitur Plus', 'Penggunaan komersial: desain untuk klien', 'Papan desain dengan logo sendiri', 'Dukungan prioritas'],
    },
  },
]

export const TOP_UP = { available: false, credits: 50, priceIDR: 25_000, validMonths: 12 }

export const PLAN_BY_ID = Object.fromEntries(PLANS.map(p => [p.id, p]))
export const planOf = (id) => PLAN_BY_ID[id] || PLAN_BY_ID.free

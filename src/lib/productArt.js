// Offline product illustrations: one SVG silhouette per furniture archetype,
// tinted with the style palette. Returned as data: URIs so the catalog never
// depends on third-party image hosts.

export const STYLE_COLORS = {
  Japandi: { bg: '#F3ECDF', main: '#C9A87A', dark: '#5B4630', soft: '#E4D6BF' },
  Minimalist: { bg: '#F2F2F0', main: '#D9D9D6', dark: '#2B2B2B', soft: '#EAEAE7' },
  Scandinavian: { bg: '#EEF2EF', main: '#D8C8A8', dark: '#4A6741', soft: '#C9D8CF' },
  Industrial: { bg: '#E4E1DC', main: '#6B5B4F', dark: '#2A2A2A', soft: '#B9AFA3' },
  Modern: { bg: '#EDEDF0', main: '#3A3A40', dark: '#111114', soft: '#C7C7CE' },
  Bohemian: { bg: '#F6E7D6', main: '#C17A3D', dark: '#5E3A1F', soft: '#E9C9A3' },
}

function shapes(a, c) {
  const { main, dark, soft } = c
  switch (a) {
    case 'sofa': return `
      <rect x="38" y="58" width="124" height="34" rx="8" fill="${main}"/>
      <rect x="44" y="40" width="112" height="26" rx="8" fill="${soft}" stroke="${main}" stroke-width="3"/>
      <rect x="30" y="52" width="18" height="42" rx="7" fill="${main}"/>
      <rect x="152" y="52" width="18" height="42" rx="7" fill="${main}"/>
      <rect x="40" y="92" width="6" height="12" fill="${dark}"/><rect x="154" y="92" width="6" height="12" fill="${dark}"/>`
    case 'coffee_table': return `
      <rect x="36" y="66" width="128" height="10" rx="5" fill="${main}"/>
      <rect x="48" y="76" width="6" height="28" fill="${dark}"/><rect x="146" y="76" width="6" height="28" fill="${dark}"/>
      <rect x="82" y="56" width="18" height="10" rx="2" fill="${soft}"/><circle cx="124" cy="60" r="6" fill="${soft}"/>`
    case 'tv_console': return `
      <rect x="58" y="22" width="84" height="48" rx="3" fill="${dark}"/>
      <rect x="96" y="70" width="8" height="8" fill="${dark}"/>
      <rect x="32" y="78" width="136" height="22" rx="3" fill="${main}"/>
      <line x1="100" y1="80" x2="100" y2="98" stroke="${dark}" stroke-width="2"/>
      <rect x="40" y="100" width="5" height="6" fill="${dark}"/><rect x="155" y="100" width="5" height="6" fill="${dark}"/>`
    case 'rug': return `
      <ellipse cx="100" cy="86" rx="76" ry="22" fill="${main}"/>
      <ellipse cx="100" cy="86" rx="56" ry="14" fill="none" stroke="${soft}" stroke-width="4"/>
      <ellipse cx="100" cy="86" rx="30" ry="7" fill="${soft}"/>`
    case 'lamp': return `
      <path d="M78 20 L122 20 L132 50 L68 50 Z" fill="${soft}" stroke="${main}" stroke-width="3"/>
      <rect x="98" y="50" width="4" height="50" fill="${dark}"/>
      <ellipse cx="100" cy="104" rx="20" ry="5" fill="${dark}"/>
      <circle cx="100" cy="46" r="5" fill="#FFE29A"/>`
    case 'bed': return `
      <rect x="34" y="36" width="20" height="62" rx="4" fill="${main}"/>
      <rect x="50" y="62" width="118" height="22" rx="5" fill="#FFFFFF" stroke="${soft}" stroke-width="2"/>
      <rect x="50" y="82" width="118" height="12" rx="3" fill="${main}"/>
      <rect x="58" y="52" width="30" height="12" rx="5" fill="${soft}"/>
      <rect x="40" y="94" width="6" height="12" fill="${dark}"/><rect x="160" y="94" width="6" height="12" fill="${dark}"/>`
    case 'wardrobe': return `
      <rect x="58" y="14" width="84" height="94" rx="4" fill="${main}"/>
      <line x1="100" y1="16" x2="100" y2="106" stroke="${dark}" stroke-width="2"/>
      <rect x="92" y="54" width="3" height="14" fill="${dark}"/><rect x="105" y="54" width="3" height="14" fill="${dark}"/>`
    case 'desk': return `
      <rect x="34" y="62" width="132" height="8" rx="3" fill="${main}"/>
      <rect x="42" y="70" width="6" height="36" fill="${dark}"/><rect x="152" y="70" width="6" height="36" fill="${dark}"/>
      <rect x="72" y="28" width="52" height="32" rx="3" fill="${dark}"/><rect x="94" y="58" width="8" height="5" fill="${dark}"/>
      <rect x="134" y="44" width="4" height="18" fill="${dark}"/><path d="M128 42 L146 42 L140 34 L132 34 Z" fill="${soft}"/>`
    case 'chair': return `
      <rect x="76" y="24" width="48" height="44" rx="6" fill="${main}"/>
      <rect x="70" y="64" width="60" height="12" rx="4" fill="${main}"/>
      <rect x="74" y="76" width="5" height="30" fill="${dark}"/><rect x="121" y="76" width="5" height="30" fill="${dark}"/>`
    case 'dining_table': return `
      <rect x="28" y="56" width="144" height="10" rx="3" fill="${main}"/>
      <rect x="38" y="66" width="6" height="40" fill="${dark}"/><rect x="156" y="66" width="6" height="40" fill="${dark}"/>
      <circle cx="84" cy="50" r="6" fill="${soft}"/><circle cx="116" cy="50" r="6" fill="${soft}"/>`
    case 'shelf': return `
      <rect x="62" y="14" width="76" height="94" fill="none" stroke="${main}" stroke-width="6"/>
      <line x1="62" y1="44" x2="138" y2="44" stroke="${main}" stroke-width="5"/>
      <line x1="62" y1="76" x2="138" y2="76" stroke="${main}" stroke-width="5"/>
      <rect x="72" y="26" width="8" height="16" fill="${dark}"/><rect x="82" y="30" width="8" height="12" fill="${soft}"/>
      <circle cx="118" cy="66" r="7" fill="${soft}"/><rect x="74" y="88" width="24" height="16" fill="${dark}"/>`
    case 'stool': return `
      <ellipse cx="100" cy="50" rx="28" ry="8" fill="${main}"/>
      <rect x="80" y="54" width="5" height="52" fill="${dark}" transform="rotate(8 82 54)"/>
      <rect x="115" y="54" width="5" height="52" fill="${dark}" transform="rotate(-8 118 54)"/>
      <rect x="84" y="84" width="32" height="3" fill="${dark}"/>`
    case 'sink': return `
      <rect x="74" y="14" width="52" height="40" rx="20" fill="${soft}" stroke="${main}" stroke-width="3"/>
      <rect x="56" y="62" width="88" height="14" rx="6" fill="#FFFFFF" stroke="${soft}" stroke-width="2"/>
      <rect x="62" y="76" width="76" height="30" rx="3" fill="${main}"/>
      <rect x="97" y="54" width="6" height="10" fill="${dark}"/>`
    case 'bathtub': return `
      <path d="M26 58 L174 58 L164 98 Q160 106 150 106 L50 106 Q40 106 36 98 Z" fill="#FFFFFF" stroke="${main}" stroke-width="3"/>
      <rect x="22" y="54" width="156" height="8" rx="4" fill="${main}"/>
      <rect x="150" y="30" width="5" height="26" fill="${dark}"/><rect x="138" y="28" width="18" height="5" rx="2" fill="${dark}"/>`
    case 'toilet': return `
      <rect x="66" y="20" width="44" height="40" rx="5" fill="#FFFFFF" stroke="${main}" stroke-width="3"/>
      <path d="M60 62 L140 62 Q138 92 112 96 L106 106 L84 106 L82 96 Q62 90 60 62 Z" fill="#FFFFFF" stroke="${main}" stroke-width="3"/>`
    default: return `<rect x="60" y="34" width="80" height="70" rx="6" fill="${main}"/>`
  }
}

export function productImage(archetype, style = 'Japandi') {
  const c = STYLE_COLORS[style] || STYLE_COLORS.Japandi
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 128" width="400" height="256">
    <rect width="200" height="128" fill="${c.bg}"/>
    <rect y="106" width="200" height="22" fill="${c.soft}" opacity="0.55"/>
    <ellipse cx="100" cy="108" rx="70" ry="4" fill="#000" opacity="0.08"/>
    ${shapes(archetype, c)}
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' '))}`
}

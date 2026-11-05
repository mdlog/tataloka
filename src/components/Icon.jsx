import React from 'react'

// Minimal stroke icon set (24×24, 1.75 stroke) — consistent, no emoji in the UI.
const P = {
  // Tataloka mark: a bold "T" (wall + aisle, seen from above) with one piece of furniture placed in the room
  logo: <><path d="M4.5 6h15M12 6v13" strokeWidth="2.8" /><rect x="15.4" y="12.6" width="4.4" height="4.4" rx="1.1" fill="currentColor" stroke="none" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  sparkles: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  cube: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></>,
  plan: <><rect x="3.5" y="3.5" width="17" height="17" rx="1" /><path d="M3.5 12h7v8.5M14 3.5v5h6.5" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-5 4 4 2.5-2.5L20 19" /></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  cart: <><path d="M3 4h2.5l2.2 10.5a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 8H6.3" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  send: <path d="M4 12 20 4l-6 16-3-7z" />,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  alert: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17.2h.01" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  swap: <><path d="M7 4 4 7l3 3M4 7h13" /><path d="m17 14 3 3-3 3M20 17H7" /></>,
  printer: <><path d="M7 9V4h10v5" /><rect x="3.5" y="9" width="17" height="8" rx="1.5" /><path d="M7 14h10v6H7z" /></>,
  rotateL: <><path d="M4 5v5h5" /><path d="M5.5 15a7 7 0 1 0 1.2-7.8L4 10" /></>,
  rotateR: <><path d="M20 5v5h-5" /><path d="M18.5 15a7 7 0 1 1-1.2-7.8L20 10" /></>,
  move: <path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />,
  tag: <><path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z" /><circle cx="8" cy="8" r="1.4" /></>,
  wallet: <><rect x="3.5" y="6" width="17" height="13" rx="2" /><path d="M16 12.5h4.5M3.5 9h17M6 6l9-3 1 3" /></>,
  store: <><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5 11.5V20h14v-8.5M10 20v-5h4v5" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></>,
  layers: <><path d="M12 4 21 9l-9 5-9-5z" /><path d="m3 14 9 5 9-5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  message: <path d="M4 5h16v11H9l-5 4z" />,
  sofa: <><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" /><path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" /><path d="M5 17v2M19 17v2" /></>,
  bed: <><path d="M3 18V6M3 13h18v5M21 18v-3" /><path d="M3 13v-2.5a1.5 1.5 0 0 1 1.5-1.5H11v4M11 9h7a3 3 0 0 1 3 3v1" /></>,
  kitchen: <><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M4 10h16M8 6.5v1M8 13v3" /></>,
  desk: <><path d="M3 8h18M5 8v12M19 8v12M13 8v6h6" /><rect x="8" y="3" width="6" height="5" rx=".5" /></>,
  dining: <><path d="M4 10h16M6 10v9M18 10v9" /><path d="M8 3v4a2 2 0 0 0 4 0V3M10 3v4M16 3c-1.5 1.5-1.5 4.5 0 6" /></>,
  bath: <><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /><path d="M6 12V5.5A1.5 1.5 0 0 1 9 5M7 19l-1 2M17 19l1 2" /></>,
  edit: <><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5z" /><path d="m12.5 7 4.5 4.5" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10.5 5-3v9l-5-3z" /></>,
  ruler: <><path d="M3.5 15.5 15.5 3.5l5 5-12 12z" /><path d="m7 12 2 2M10 9l1.5 1.5M13 6l2 2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9v10.5h12V9M10 19.5v-5h4v5" /></>,
  more: <><circle cx="6" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18" cy="12" r="1.2" fill="currentColor" /></>,
  install: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M12 7v7M9.2 11.4 12 14.2l2.8-2.8M10.5 18.5h3" /></>,
}

export default function Icon({ name, size, className = '', title, ...rest }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" style={size ? { width: size, height: size } : undefined}
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...rest}>
      {title && <title>{title}</title>}
      {P[name] || P.info}
    </svg>
  )
}

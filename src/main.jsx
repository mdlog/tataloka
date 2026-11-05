import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// "/" is the marketing landing page, "/app" is the design tool.
// Each is its own lazily loaded chunk, so the landing page stays light.
const App = lazy(() => import('./App.jsx'))
const Landing = lazy(() => import('./landing/Landing.jsx'))

// Installed on the home screen, the app opens straight into the design tool
// (but a link to a landing section, like "See plans" → /#pricing, still shows it).
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
if (standalone && window.location.pathname === '/' && !window.location.hash) window.location.replace('/app')
const isApp = /^\/app(\/|$)/.test(window.location.pathname)

// Chrome's "Install app" event can fire before the lazily loaded app has mounted:
// keep it here for the Account sheet's Install button (see App.jsx).
if (isApp) {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    window.__tatalokaInstall = e
    window.dispatchEvent(new Event('tataloka-install-ready'))
  })
}

// Same splash as index.html, kept while the page's code loads.
function Splash() {
  return (
    <div className="splash" aria-label="Tataloka">
      <svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#1d1b18" /><path d="M15 18h34M32 18v30" fill="none" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" /><rect x="40" y="33" width="11" height="11" rx="2.8" fill="#e08a5f" /></svg>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<Splash />}>{isApp ? <App /> : <Landing />}</Suspense>
  </React.StrictMode>
)

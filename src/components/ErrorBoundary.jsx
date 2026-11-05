import React from 'react'
import Icon from './Icon.jsx'

const STORE_KEY = 'tataloka_store_v1'
function storedLocale() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY))?.state?.locale === 'id' ? 'id' : 'en' } catch { return 'en' }
}
// Last resort when the open design itself keeps crashing: drop it from this device
// (designs saved to the account stay there) and start fresh.
function startFresh() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY))
    if (saved?.state) { saved.state.roomGraph = null; saved.state.designId = null; localStorage.setItem(STORE_KEY, JSON.stringify(saved)) }
  } catch { /* storage unavailable */ }
  window.location.href = '/app'
}

// A render error (or a missing code chunk after a deploy) must never leave a blank page.
export default class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Tataloka crashed:', error, info?.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    const id = storedLocale() === 'id'
    return (
      <main className="crash" role="alert">
        <div className="crash-card">
          <span className="brand-mark"><Icon name="logo" size={20} /></span>
          <h1 className="display">{id ? 'Ups, ada yang tidak beres' : 'Something went wrong'}</h1>
          <p>{id ? 'Muat ulang untuk melanjutkan — desainmu masih ada.' : 'Reload to continue — your design is still there.'}</p>
          <div className="crash-actions">
            <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}><Icon name="refresh" size={17} />{id ? 'Muat ulang' : 'Reload'}</button>
            <button className="btn btn-ghost" onClick={startFresh}>{id ? 'Mulai desain baru' : 'Start a new design'}</button>
          </div>
        </div>
      </main>
    )
  }
}

import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { interpretCommand, transcribeAudio } from '../lib/api.js'
import { recordingToWav, getSpeechRecognition } from '../lib/audio.js'

// Floating voice/text assistant. Speech → text via Muse Voice Transcribe (live)
// or the browser's speech recognition (demo); text → action via Muse Spark
// (live) or local rules. No transcript = no action — nothing is invented.
export default function AssistantDock({ locale = 'en', live, context, onCommand, locked, onLocked }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [log, setLog] = useState([])
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const stopRef = useRef(null)
  const logRef = useRef(null)
  useEffect(() => () => stopRef.current?.(), [])
  useEffect(() => { if (locked) { stopRef.current?.(); setOpen(false) } }, [locked]) // e.g. the credits just ran out
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [log])

  const push = (entry) => setLog(l => [...l.slice(-11), entry])

  async function run(q) {
    const query = String(q || '').trim()
    if (!query) return
    setText('')
    push({ who: 'you', text: query })
    setBusy(true)
    try {
      const cmd = await interpretCommand(query, { locale, context })
      const reply = await onCommand(cmd)
      push({ who: 'bot', text: reply || cmd.reply || t('Done.', 'Siap.'), via: cmd.via })
    } catch (e) {
      push({ who: 'bot', text: e.code === 'no_credits'
        ? t('Your credits have run out — the assistant works again when they refill.', 'Kredit habis — asisten aktif lagi saat kredit terisi.')
        : e.code === 'email_unverified' ? t('Verify your email to use the assistant.', 'Verifikasi emailmu untuk memakai asisten.') : e.message })
    } finally {
      setBusy(false)
    }
  }

  async function startMetaRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks = []
    const mr = new MediaRecorder(stream)
    mr.ondataavailable = e => e.data.size && chunks.push(e.data)
    mr.onstop = async () => {
      stream.getTracks().forEach(tr => tr.stop())
      setListening(false)
      setBusy(true)
      try {
        const wav = await recordingToWav(new Blob(chunks, { type: mr.mimeType }))
        const heard = await transcribeAudio(wav)
        setBusy(false)
        if (heard) run(heard)
        else push({ who: 'bot', text: t('I could not hear anything — try again or type.', 'Suara tidak terdengar — coba lagi atau ketik.') })
      } catch (e) {
        setBusy(false)
        push({ who: 'bot', text: t('Voice transcription failed: ', 'Transkripsi suara gagal: ') + e.message })
      }
    }
    mr.start()
    stopRef.current = () => mr.state !== 'inactive' && mr.stop()
    setListening(true)
    setTimeout(() => stopRef.current?.(), 10000)
  }

  function startBrowserRecognition() {
    const SR = getSpeechRecognition()
    const rec = new SR()
    rec.lang = locale === 'id' ? 'id-ID' : 'en-US'
    rec.interimResults = false
    rec.onresult = e => { const heard = e.results?.[0]?.[0]?.transcript || ''; if (heard) run(heard) }
    rec.onerror = e => push({ who: 'bot', text: t('Speech recognition error: ', 'Pengenalan suara error: ') + e.error })
    rec.onend = () => setListening(false)
    rec.start()
    stopRef.current = () => rec.stop()
    setListening(true)
  }

  async function toggleMic() {
    if (listening) { stopRef.current?.(); return }
    try {
      if (live && window.MediaRecorder) await startMetaRecording()
      else if (getSpeechRecognition()) startBrowserRecognition()
      else push({ who: 'bot', text: t('Voice input is not supported in this browser — please type.', 'Browser ini belum mendukung input suara — silakan ketik.') })
    } catch (e) {
      setListening(false)
      push({ who: 'bot', text: t('Microphone unavailable: ', 'Mikrofon tidak tersedia: ') + e.message })
    }
  }

  const suggestions = locale === 'id'
    ? ['Ganti gaya Skandinavia', 'Tambah lampu', 'Cari meja kayu', 'Berapa total budget?']
    : ['Make it Scandinavian', 'Add a lamp', 'Find a wooden table', 'What is the total?']

  return (
    <>
      {open && <div className="assistant-scrim" onClick={() => setOpen(false)} />}
      {open && (
        <section className="assistant" aria-label={t('Design assistant', 'Asisten desain')}>
          <div className="assistant-head">
            <div>
              <div className="h3">{t('Design assistant', 'Asisten desain')}</div>
              <div className="tiny muted">{live ? 'Muse Spark · Muse Voice' : t('Local rules (demo)', 'Aturan lokal (demo)')}</div>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label={t('Close', 'Tutup')}><Icon name="x" /></button>
          </div>
          <div className="chat-log" ref={logRef} aria-live="polite">
            {!log.length && <div className="small muted">{t('Ask me to change the style, add or remove furniture, find products or check the budget.', 'Minta aku mengganti gaya, menambah atau menghapus furnitur, mencari produk, atau cek budget.')}</div>}
            {log.map((m, i) => (
              <div key={i} className={`bubble ${m.who}`}>{m.text}{m.via && <span className="via">{m.via === 'muse-spark' ? 'Muse Spark' : t('local rules', 'aturan lokal')}</span>}</div>
            ))}
            {busy && <div className="bubble bot"><span className="spinner" /></div>}
          </div>
          <div className="assistant-foot">
            <div className="chip-scroll">
              {suggestions.map(s => <button key={s} className="chip" disabled={busy} onClick={() => run(s)}>{s}</button>)}
            </div>
            <form style={{ display: 'flex', gap: 8 }} onSubmit={e => { e.preventDefault(); run(text) }}>
              <button type="button" className={`btn ${listening ? 'btn-brand' : 'btn-secondary'} btn-icon`} onClick={toggleMic} disabled={busy && !listening}
                aria-label={listening ? t('Stop recording', 'Berhenti merekam') : t('Speak', 'Bicara')} title={listening ? t('Stop', 'Berhenti') : t('Speak', 'Bicara')}>
                <Icon name={listening ? 'x' : 'mic'} size={17} />
              </button>
              <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder={listening ? t('Listening…', 'Mendengarkan…') : t('Type a request…', 'Ketik permintaan…')} aria-label={t('Message', 'Pesan')} />
              <button className="btn btn-primary btn-icon" type="submit" disabled={busy || !text.trim()} aria-label={t('Send', 'Kirim')}><Icon name="send" size={16} /></button>
            </form>
          </div>
        </section>
      )}
      <button className="fab" onClick={() => (locked ? onLocked?.() : setOpen(o => !o))} aria-expanded={open}>
        <Icon name={open ? 'x' : 'message'} size={19} />{t('Assistant', 'Asisten')}
      </button>
    </>
  )
}

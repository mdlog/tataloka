// Admin tool for accounts and credits (works while the server is running).
//   npm run credits                         → every account with plan + balance
//   npm run credits -- <email>              → one account + recent credit history
//   npm run credits -- <email> --add 50     → give 50 bonus credits (negative removes)
//   npm run credits -- <email> --plan plus  → change plan (free | plus | pro)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { readConfig } from '../server/server.js'
import { openDb } from '../server/db.js'
import { createCredits } from '../server/credits.js'
import { PLAN_BY_ID } from '../src/data/plans.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true })
const db = openDb(readConfig().dbFile)
const credits = createCredits({ db })

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const email = args.find(a => a.includes('@'))
// Dates in Jakarta time, like the app.
const wib = (iso, time = false) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, time ? 16 : 10)
const line = (s) => `${s.plan.padEnd(5)} ${String(s.remaining).padStart(4)} left (${s.monthly - s.used}/${s.monthly} monthly + ${s.bonus} bonus) · refills ${wib(s.resetsAt)} WIB`

if (!email) {
  const users = db.prepare('SELECT id, email, name FROM users ORDER BY created_at').all()
  if (!users.length) console.log('No accounts yet.')
  for (const u of users) console.log(`${u.email.padEnd(34)} ${line(credits.summary(u.id))}`)
  process.exit(0)
}

const id = credits.userIdByEmail(email)
if (!id) { console.error(`No account for ${email}`); process.exit(1) }
const add = flag('--add')
const plan = flag('--plan')
if (plan) {
  if (!PLAN_BY_ID[plan]) { console.error(`Unknown plan "${plan}" — use ${Object.keys(PLAN_BY_ID).join(', ')}`); process.exit(1) }
  credits.setPlan(id, plan)
  console.log(`Plan set to ${plan}.`)
}
if (add) {
  const n = Math.trunc(Number(add))
  if (!Number.isFinite(n) || !n) { console.error('--add needs a number'); process.exit(1) }
  credits.grant(id, n)
  console.log(`${n > 0 ? 'Added' : 'Removed'} ${Math.abs(n)} bonus credits.`)
}
console.log(`${email}: ${line(credits.summary(id))}`)
for (const h of credits.history(id, 10)) console.log(`  ${wib(h.at, true)}  ${String(h.amount).padStart(4)}  ${h.action}`)

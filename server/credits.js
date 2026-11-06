// Credits: every account gets its plan's monthly allowance (reset on the 1st,
// Jakarta time) plus bonus credits (grants / top-ups) that never reset.
// AI routes are charged before the Meta call and refunded if the call fails.
import { ROUTE_COSTS, planOf } from '../src/data/plans.js'

const WIB_MS = 7 * 3600 * 1000 // UTC+7

// "2026-11" for the month the timestamp falls in, in Jakarta time.
export function periodOf(ts) {
  return new Date(ts + WIB_MS).toISOString().slice(0, 7)
}
// Start of next month in Jakarta time, as a UTC timestamp.
export function nextResetAt(ts) {
  const d = new Date(ts + WIB_MS)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - WIB_MS
}

export function createCredits({ db, now = () => Date.now() }) {
  const q = {
    user: db.prepare('SELECT id, plan, credit_period, credits_used, bonus_credits FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT id FROM users WHERE email = ?'),
    newPeriod: db.prepare('UPDATE users SET credit_period = ?, credits_used = 0 WHERE id = ?'),
    spend: db.prepare('UPDATE users SET credits_used = credits_used + ?, bonus_credits = bonus_credits - ? WHERE id = ?'),
    giveBack: db.prepare('UPDATE users SET credits_used = MAX(0, credits_used - ?), bonus_credits = bonus_credits + ? WHERE id = ?'),
    addBonus: db.prepare('UPDATE users SET bonus_credits = MAX(0, bonus_credits + ?) WHERE id = ?'),
    setPlan: db.prepare('UPDATE users SET plan = ? WHERE id = ?'),
    event: db.prepare('INSERT INTO credit_events (user_id, action, amount, from_bonus, period, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    history: db.prepare('SELECT action, amount, created_at FROM credit_events WHERE user_id = ? ORDER BY id DESC LIMIT ?'),
  }

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE')
    try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { db.exec('ROLLBACK'); throw e }
  }

  // Current row, rolled over to this month if needed.
  function load(userId) {
    const u = q.user.get(userId)
    if (!u) throw new Error('unknown user')
    const period = periodOf(now())
    if (u.credit_period !== period) {
      q.newPeriod.run(period, userId)
      return { ...u, credit_period: period, credits_used: 0 }
    }
    return u
  }

  function toSummary(u) {
    const plan = planOf(u.plan)
    const monthlyLeft = Math.max(0, plan.monthlyCredits - u.credits_used)
    return {
      plan: plan.id,
      monthly: plan.monthlyCredits,
      used: Math.min(u.credits_used, plan.monthlyCredits),
      bonus: u.bonus_credits,
      remaining: monthlyLeft + u.bonus_credits,
      resetsAt: new Date(nextResetAt(now())).toISOString(),
    }
  }

  const summary = (userId) => toSummary(load(userId))

  // Takes `cost` credits (monthly allowance first, then bonus) if at least
  // `need` are available. Returns { ok, summary, charge }.
  function spend(userId, action, cost, { need = cost } = {}) {
    return tx(() => {
      const u = load(userId)
      const s = toSummary(u)
      if (s.remaining < need) return { ok: false, summary: s }
      const fromMonthly = Math.min(cost, s.monthly - s.used)
      const fromBonus = cost - fromMonthly
      q.spend.run(fromMonthly, fromBonus, userId)
      q.event.run(userId, action, -cost, fromBonus, u.credit_period, now())
      return {
        ok: true,
        summary: toSummary({ ...u, credits_used: u.credits_used + fromMonthly, bonus_credits: u.bonus_credits - fromBonus }),
        charge: { userId, action, monthly: fromMonthly, bonus: fromBonus, period: u.credit_period },
      }
    })
  }

  // Gives a failed call's credits back (the monthly part only within the same month).
  function refund(charge) {
    return tx(() => {
      const u = load(charge.userId)
      const monthly = charge.period === u.credit_period ? charge.monthly : 0
      q.giveBack.run(monthly, charge.bonus, charge.userId)
      if (monthly + charge.bonus) q.event.run(charge.userId, `refund:${charge.action}`, monthly + charge.bonus, charge.bonus, u.credit_period, now())
      return toSummary({ ...u, credits_used: Math.max(0, u.credits_used - monthly), bonus_credits: u.bonus_credits + charge.bonus })
    })
  }

  function grant(userId, amount, reason = 'grant') {
    return tx(() => {
      const u = load(userId)
      q.addBonus.run(amount, userId)
      q.event.run(userId, reason, amount, amount, u.credit_period, now())
      return summary(userId)
    })
  }

  function setPlan(userId, planId) {
    q.setPlan.run(planOf(planId).id, userId)
    return summary(userId)
  }

  const history = (userId, limit = 15) => q.history.all(userId, limit).map(r => ({ action: r.action, amount: r.amount, at: new Date(r.created_at).toISOString() }))

  return { summary, spend, refund, grant, setPlan, history, userIdByEmail: (email) => q.userByEmail.get(String(email).toLowerCase())?.id || null }
}

// Express middleware for free AI routes (the assistant): no charge, but they need a balance —
// they stop when the credits run out and work again when they refill.
export function requireBalance(credits, min = 1) {
  return (req, res, next) => {
    if (!credits) return next()
    const s = credits.summary(req.user.id)
    res.set('X-Tataloka-Credits', String(s.remaining))
    if (s.remaining >= min) return next()
    res.status(402).json({ error: 'Your credits have run out — the assistant works again when they refill.', code: 'no_credits', need: min, credits: s })
  }
}

// Express middleware: charge the route's credits, refund if the handler fails.
// The remaining balance goes back in the X-Tataloka-Credits header.
// cost / need may be functions of the request (e.g. a design that reads extra views costs more).
export function chargeFor(credits, route, { need: needFor, cost: costFor } = {}) {
  return (req, res, next) => {
    const cost = typeof costFor === 'function' ? costFor(req) : costFor ?? (ROUTE_COSTS[route] || 0)
    const need = Math.max(cost, (typeof needFor === 'function' ? needFor(req) : needFor) ?? cost)
    if (!credits || !cost) return next()
    const r = credits.spend(req.user.id, route, cost, { need })
    if (!r.ok) {
      res.set('X-Tataloka-Credits', String(r.summary.remaining))
      return res.status(402).json({ error: `Not enough credits: this needs ${need}, you have ${r.summary.remaining}.`, code: 'no_credits', need, credits: r.summary })
    }
    res.set('X-Tataloka-Credits', String(r.summary.remaining))
    req.refundCredits = () => {
      const s = credits.refund(r.charge)
      res.set('X-Tataloka-Credits', String(s.remaining))
    }
    next()
  }
}

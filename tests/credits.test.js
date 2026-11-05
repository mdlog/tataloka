import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openDb } from '../server/db.js'
import { createCredits, periodOf, nextResetAt } from '../server/credits.js'
import { PLANS, ACTIONS, ROUTE_COSTS, planOf } from '../src/data/plans.js'

function setup(start = Date.parse('2026-11-10T03:00:00Z')) {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@example.com', 'A', 0)").run()
  const clock = { t: start }
  return { db, clock, credits: createCredits({ db, now: () => clock.t }) }
}

describe('credit periods (Jakarta time)', () => {
  it('months roll over at midnight WIB, not UTC', () => {
    assert.equal(periodOf(Date.parse('2026-11-30T16:59:00Z')), '2026-11')
    assert.equal(periodOf(Date.parse('2026-11-30T17:00:00Z')), '2026-12')
    assert.equal(new Date(nextResetAt(Date.parse('2026-11-10T00:00:00Z'))).toISOString(), '2026-11-30T17:00:00.000Z')
    assert.equal(new Date(nextResetAt(Date.parse('2026-12-31T18:00:00Z'))).toISOString(), '2027-01-31T17:00:00.000Z')
  })
})

describe('credits', () => {
  it('new accounts start on the free plan with its monthly allowance', () => {
    const { credits } = setup()
    const s = credits.summary('u1')
    assert.equal(s.plan, 'free')
    assert.equal(s.remaining, planOf('free').monthlyCredits)
    assert.equal(s.used, 0)
  })
  it('spends the monthly allowance first, then bonus credits, and refunds to the same place', () => {
    const { credits } = setup()
    credits.grant('u1', 5)
    const big = credits.spend('u1', 'design', 28)
    assert.equal(big.summary.remaining, 7)
    const r = credits.spend('u1', 'segment', 4)
    assert.deepEqual([r.charge.monthly, r.charge.bonus], [2, 2])
    assert.equal(r.summary.bonus, 3)
    const back = credits.refund(r.charge)
    assert.equal(back.remaining, 7)
    assert.equal(back.bonus, 5)
    assert.deepEqual(credits.history('u1').map(h => [h.action, h.amount]), [['refund:segment', 4], ['segment', -4], ['design', -28], ['grant', 5]])
  })
  it('refuses when fewer than `need` credits are left, without charging', () => {
    const { credits } = setup()
    credits.spend('u1', 'design', 28)
    const r = credits.spend('u1', 'segment', 2, { need: 3 })
    assert.equal(r.ok, false)
    assert.equal(credits.summary('u1').remaining, 2)
  })
  it('resets the allowance each month but keeps bonus credits', () => {
    const { credits, clock } = setup()
    credits.grant('u1', 10)
    const charge = credits.spend('u1', 'render', 1).charge // from the November allowance
    credits.spend('u1', 'design', 34)
    assert.equal(credits.summary('u1').remaining, 5)
    clock.t = Date.parse('2026-12-01T01:00:00Z')
    const s = credits.summary('u1')
    assert.equal(s.used, 0)
    assert.equal(s.remaining, 30 + 5)
    // a refund of last month's allowance does not add to this month's
    assert.equal(credits.refund(charge).remaining, 35)
  })
  it('plans change the allowance', () => {
    const { credits } = setup()
    assert.equal(credits.setPlan('u1', 'plus').remaining, planOf('plus').monthlyCredits)
    assert.equal(credits.setPlan('u1', 'nope').plan, 'free')
  })
  it('adds the credit columns to databases created before credits existed', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tataloka-')), 'old.db')
    const old = new DatabaseSync(file)
    old.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT, google_sub TEXT UNIQUE, avatar_url TEXT, created_at INTEGER NOT NULL); INSERT INTO users (id, email, name, created_at) VALUES ('old', 'o@example.com', 'O', 0)")
    old.close()
    const db = openDb(file)
    assert.equal(createCredits({ db }).summary('old').remaining, 30)
    db.close()
  })
})

describe('plans', () => {
  it('action costs match what the server charges', () => {
    assert.equal(ACTIONS.find(a => a.id === 'photoDesign').credits, ROUTE_COSTS.segment + ROUTE_COSTS.design)
    assert.equal(ACTIONS.find(a => a.id === 'design').credits, ROUTE_COSTS.design)
  })
  it('only the free plan is on sale until payments exist; paid plans cost more per month than they can spend', () => {
    assert.deepEqual(PLANS.filter(p => p.available).map(p => p.id), ['free'])
    // measured worst case ≈ US$0.0142 per credit ≈ Rp235 → price must cover every credit being used
    for (const p of PLANS.filter(p => p.priceIDR)) assert.ok(p.priceIDR > p.monthlyCredits * 235 * 1.15, p.id)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Regression test for: "moving furniture also moves the whole layout /
// furniture is hard to reposition". Drag commits must be clamped into the
// real room footprint so a piece can never leave the floor (which read as
// the camera/layout sliding away), for any room size — not a fixed constant.
import { clampPosToRoom } from '../src/lib/roomLayout.js'

describe('clampPosToRoom (furniture drag guard)', ()=>{
  it('keeps an inside position untouched', ()=>{
    assert.deepEqual(clampPosToRoom([0.5, -1.2], { w:3, l:4 }), [0.5, -1.2])
  })
  it('clamps to the 3x4m footprint, not a fixed constant', ()=>{
    // half extents are 1.5 x 2.0 minus 0.15 margin
    assert.deepEqual(clampPosToRoom([5, 5], { w:3, l:4 }), [1.35, 1.85])
    assert.deepEqual(clampPosToRoom([-5, -5], { w:3, l:4 }), [-1.35, -1.85])
  })
  it('scales with larger rooms', ()=>{
    assert.deepEqual(clampPosToRoom([5, 5], { w:6, l:8 }), [2.85, 3.85])
  })
  it('clamps each axis independently', ()=>{
    assert.deepEqual(clampPosToRoom([0, 9], { w:3, l:4 }), [0, 1.85])
  })
  it('falls back safely on missing dims', ()=>{
    assert.deepEqual(clampPosToRoom([9, 9]), [9, 9])
  })
})

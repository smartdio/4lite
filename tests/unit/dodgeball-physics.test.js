import test from 'node:test'
import assert from 'node:assert/strict'
import { boundaryTime, dragDistanceFactor, dragTravelTime, groundContactTime, predictBallAtX, sweepCapsule } from '../../src/interactions/dodgeball/physics.js'

test('horizontal air drag integrates exactly and its inverse rejects unreachable targets', () => {
  for (const drag of [0, .3, .5]) {
    const first = 32 * dragDistanceFactor(.37, drag)
    const second = 32 * Math.exp(-drag * .37) * dragDistanceFactor(.63, drag)
    assert.ok(Math.abs(first + second - 32 * dragDistanceFactor(1, drag)) < 1e-12)
    assert.ok(Math.abs(dragTravelTime(first, 32, drag) - .37) < 1e-12)
    assert.ok(Math.abs(dragTravelTime(-first, -32, drag) - .37) < 1e-12)
  }
  assert.equal(dragTravelTime(-1, 32, .5), null)
  assert.equal(dragTravelTime(65, 32, .5), null)
  assert.equal(dragTravelTime(1, 0, .5), null)
})

test('prediction stops at a dead rolling bounce instead of inventing an eventual receiver arrival', () => {
  const ball = { active: true, x: 0, y: .24, z: 11, vx: 26, vy: -1, vz: 0, radius: .24 }
  const mode = { drag: .3, gravity: 9.8, restitution: .18, tangentRetention: .55 }
  assert.equal(predictBallAtX(ball, 12, mode), null)
})

test('continuous capsule collision catches a ball that crosses the complete body in one step', () => {
  const time = sweepCapsule({ x: -4, y: 1.6, z: 0 }, { x: 4, y: 1.6, z: 0 }, .48, 2.72, .69)
  assert.ok(Math.abs(time - (4 - .69) / 8) < 1e-10)
  assert.equal(sweepCapsule({ x: -4, y: 4, z: 0 }, { x: 4, y: 4, z: 0 }, .48, 2.72, .69), null)
})

test('rounded capsule end caps and initial overlap are included', () => {
  assert.ok(sweepCapsule({ x: -2, y: 3.15, z: 0 }, { x: 2, y: 3.15, z: 0 }, .48, 2.72, .69) != null)
  assert.equal(sweepCapsule({ x: 0, y: .2, z: 0 }, { x: 0, y: .2, z: 0 }, .48, 2.72, .69), 0)
})

test('relative motion catches a character crossing a stationary ball', () => {
  const time = sweepCapsule({ x: 0, y: 1.8, z: -2 }, { x: 0, y: 1.8, z: 2 }, .48, 2.72, .69)
  assert.ok(time > 0 && time < .5)
})

test('ground time uses gravity and does not immediately recollide with a rising bounce', () => {
  assert.ok(Math.abs(groundContactTime(1.21, 0, 10, .21, 1) - Math.sqrt(.2)) < 1e-10)
  assert.equal(groundContactTime(.21, 2, 10, .21, .1), null)
  assert.equal(groundContactTime(.21, -2, 10, .21, .1), 0)
})

test('ball boundary belongs to the complete court including both receiving ends', () => {
  const bounds = { minX: -14, maxX: 14, minZ: 4.95, maxZ: 17.45 }
  assert.equal(boundaryTime({ x: 10, z: 11 }, { x: 12, z: 11 }, bounds), null)
  assert.equal(boundaryTime({ x: 13, z: 11 }, { x: 15, z: 11 }, bounds), .5)
  assert.equal(boundaryTime({ x: 15, z: 11 }, { x: 14, z: 11 }, bounds), 0)
})

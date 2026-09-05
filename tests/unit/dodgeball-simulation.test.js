import test from 'node:test'
import assert from 'node:assert/strict'
import { createDodgeballSimulation, DODGEBALL_DEFAULTS } from '../../src/interactions/dodgeball/simulation.js'
import { predictBallAtX } from '../../src/interactions/dodgeball/physics.js'
import { DODGEBALL_MOTION } from '../../src/interactions/dodgeball/motion.js'

const STEP = DODGEBALL_DEFAULTS.fixedStep
function game({ team = 'blue', mode = 'pingpong', ai = false, seed = 'rules-test', config = {} } = {}) {
  const events = []
  const sim = createDodgeballSimulation({ config: { aiEnabled: ai, ...config }, seed, onEvent: event => events.push(event) })
  sim.start(mode, team); sim.stepFor(.8)
  return { sim, events }
}
function flight(sim, { ball = {}, players = [], ...rest } = {}) {
  const throwerId = sim.state.attackTeam === 'blue' ? 0 : 2
  sim.setTestState({ phase: 'flight', phaseElapsed: 0,
    ball: { x: -7, y: 1.7, z: 11, vx: 22, vy: 0, vz: 0, active: true, ownerId: null,
      throwerId, receiverId: throwerId + 1, attackId: 1, bounces: 0, ...ball },
    players, ...rest,
  })
}

test('ready uses 0.8 seconds without spending match time, selection resets without events', () => {
  const events = [], sim = createDodgeballSimulation({ onEvent: event => events.push(event) })
  assert.equal(sim.state.players.length, 4)
  sim.start(); sim.stepFor(.79)
  assert.equal(sim.state.phase, 'ready'); assert.equal(sim.state.timeRemaining, 180)
  sim.stepFor(.01); assert.equal(sim.state.phase, 'held'); assert.equal(sim.state.ball.ownerId, 0)
  sim.setTestState({ scores: { blue: 9 }, elapsed: 35, winner: 'blue' }); sim.beginCharge()
  const count = events.length
  assert.equal(sim.select('beanbag'), true)
  assert.equal(sim.state.phase, 'selection'); assert.equal(sim.state.timeRemaining, 180)
  assert.deepEqual(sim.state.scores, { blue: 0, red: 0 }); assert.equal(sim.state.winner, null)
  assert.equal(sim.state.ball.active, false); assert.equal(sim.state.charging, false)
  assert.equal(sim.state.ball.radius, .24); assert.equal(events.length, count)
  assert.equal(sim.select('unknown'), false); assert.equal(sim.state.ballMode, 'beanbag')
})

test('either team can open; the human always controls a surviving blue player', () => {
  const { sim } = game({ team: 'red' })
  assert.equal(sim.state.ball.ownerId, 2); assert.equal(sim.state.controlledId, 0)
  assert.deepEqual(sim.state.players.map(player => player.role), ['defend', 'defend', 'attack', 'attack'])
})

test('short charge throws straight and switches control to the receiving end without an aim API', () => {
  const { sim, events } = game()
  assert.equal(sim.setAim, undefined)
  assert.equal(sim.beginCharge(), true)
  sim.stepFor(.65); assert.equal(sim.state.charge, 1)
  assert.equal(sim.releaseCharge(), true)
  assert.equal(sim.state.phase, 'flight'); assert.equal(sim.state.controlledId, 1)
  assert.ok(sim.state.ball.vx > 0); assert.equal(sim.state.ball.vz, 0)
  assert.ok(Math.abs(Math.hypot(sim.state.ball.vx, sim.state.ball.vz) - DODGEBALL_DEFAULTS.modes.pingpong.maxSpeed) < 1e-8)
  assert.equal(sim.releaseCharge(), false)
  assert.equal(events.filter(event => event.type === 'dodgeball-throw').length, 1)
})

test('holding for five seconds automatically throws once, even without a charge', () => {
  const { sim, events } = game()
  sim.stepFor(4.99); assert.equal(sim.state.phase, 'held')
  sim.stepFor(.02)
  assert.equal(sim.state.phase, 'flight'); assert.equal(sim.state.controlledId, 1)
  const throws = events.filter(event => event.type === 'dodgeball-throw')
  assert.equal(throws.length, 1); assert.equal(throws[0].automatic, true)
})

test('computer opening serve counts 3, 2, 1 without throwing early or pausing the match clock', () => {
  const events = [], sim = createDodgeballSimulation({ onEvent: event => events.push(event) })
  sim.start('pingpong', 'red'); sim.stepFor(.79)
  assert.equal(sim.state.aiServeCountdown, 0); assert.equal(sim.state.timeRemaining, 180)
  sim.stepFor(.01)
  assert.equal(sim.state.phase, 'held'); assert.equal(sim.state.aiServeCountdown, 3)
  assert.equal(sim.state.aiServeRemaining, 3); assert.equal(sim.state.ball.ownerId, 2)
  for (const [seconds, digit] of [[.999, 3], [.001, 2], [.999, 2], [.001, 1], [.99, 1]]) {
    sim.stepFor(seconds)
    assert.equal(sim.state.phase, 'held'); assert.equal(sim.state.aiServeCountdown, digit)
    assert.equal(events.filter(event => event.type === 'dodgeball-throw').length, 0)
  }
  sim.stepFor(.01)
  assert.equal(sim.state.phase, 'flight'); assert.equal(sim.state.aiServeRemaining, 0); assert.equal(sim.state.aiServeCountdown, 0)
  assert.ok(Math.abs(sim.state.timeRemaining - 177) < 1e-9)
  const throws = events.filter(event => event.type === 'dodgeball-throw')
  assert.equal(throws.length, 1); assert.ok(Math.abs(throws[0].elapsed - 3) < 1e-9)
})

test('the player can move and jump while preparing, and pause/clearInput never restarts the serve countdown', () => {
  const { sim } = game({ team: 'red', ai: true })
  const initial = { ...sim.state.players[0] }
  sim.setMove(1, 1); assert.equal(sim.jump(), true); sim.stepFor(.2)
  assert.ok(sim.state.players[0].x > initial.x && sim.state.players[0].z > initial.z)
  assert.ok(sim.state.players[0].y > 0); assert.equal(sim.state.phase, 'held')
  sim.stepFor(.8)
  const remaining = sim.state.aiServeRemaining, elapsed = sim.state.elapsed, holdElapsed = sim.state.holdElapsed
  sim.clearInput()
  const paused = sim.snapshot()
  for (let frame = 0; frame < 120; frame++) sim.update(0)
  assert.deepEqual(sim.snapshot(), paused)
  assert.equal(sim.state.aiServeRemaining, remaining); assert.equal(sim.state.elapsed, elapsed)
  assert.equal(sim.state.holdElapsed, holdElapsed); assert.equal(sim.state.aiServeCountdown, 2)
  sim.stepFor(1.99); assert.equal(sim.state.phase, 'held')
  sim.stepFor(.01); assert.equal(sim.state.phase, 'flight')
})

test('both computer ends get a fresh full countdown after every naturally ended attack and return', () => {
  for (const mode of ['pingpong', 'beanbag']) {
    const { sim, events } = game({ team: 'red', mode, ai: true })
    for (const ownerId of [2, 3, 2]) {
      assert.equal(sim.state.phase, 'held'); assert.equal(sim.state.ball.ownerId, ownerId)
      assert.equal(sim.state.holdElapsed, 0); assert.equal(sim.state.aiServeRemaining, 3)
      const priorThrows = events.filter(event => event.type === 'dodgeball-throw').length
      sim.stepFor(2.99); assert.equal(sim.state.phase, 'held')
      assert.equal(events.filter(event => event.type === 'dodgeball-throw').length, priorThrows)
      sim.stepFor(.01); assert.equal(sim.state.ball.throwerId, ownerId); assert.equal(sim.state.phase, 'flight')
      assert.equal(sim.state.ball.vz, 0)
      assert.equal(sim.state.ball.z, sim.state.players[ownerId].z)
      assert.equal(Math.sign(sim.state.ball.vx), ownerId === 2 ? 1 : -1)
      // Continue the existing attack past the outer boundary, preserving its
      // thrower/receiver IDs and letting finishAttack -> returning -> giveBall run.
      const sign = ownerId === 2 ? 1 : -1
      sim.setTestState({ ball: { x: sign * 13.99, y: 2, z: 11, vx: sign * 20, vy: 0, vz: 0 } })
      sim.stepFor(STEP); assert.equal(sim.state.phase, 'returning'); assert.equal(sim.state.aiServeCountdown, 0)
      for (let step = 0; step < 90 && sim.state.phase === 'returning'; step++) sim.stepFor(STEP)
      assert.equal(sim.state.phase, 'held'); assert.equal(sim.state.aiServeCountdown, 3)
    }
  }
})

test('automatic computer reception also starts a new preparation countdown without scoring', () => {
  const { sim } = game({ team: 'red', ai: true })
  sim.setTestState({ players: [{ id: 0, z: 14 }, { id: 1, z: 14, aiDecisionAt: 10 },
    { id: 2, aiDecisionAt: 10 }, { id: 3, aiDecisionAt: 10 }] })
  sim.stepFor(3); assert.equal(sim.state.phase, 'flight')
  for (let step = 0; step < 240 && sim.state.phase === 'flight'; step++) sim.stepFor(STEP)
  assert.equal(sim.state.lastAttackResult.reason, 'catch'); assert.equal(sim.state.lastAttackResult.playerId, 3)
  assert.deepEqual(sim.state.scores, { blue: 0, red: 0 })
  for (let step = 0; step < 160 && sim.state.phase === 'returning'; step++) sim.stepFor(STEP)
  assert.equal(sim.state.ball.ownerId, 3); assert.equal(sim.state.aiServeCountdown, 3); assert.equal(sim.state.aiServeRemaining, 3)
})

test('a clear gives the new computer attacking team a full countdown, but blue has no forced preparation', () => {
  const { sim } = game({ ai: true })
  assert.equal(sim.state.aiServeCountdown, 0)
  assert.equal(sim.beginCharge(), true); assert.equal(sim.releaseCharge(), true)
  assert.equal(sim.state.phase, 'flight'); assert.equal(sim.state.aiServeCountdown, 0)
  flight(sim, { ball: { x: -1.4, y: 1.7, vx: 100 }, players: [{ id: 2, x: 0, z: 11, aiDecisionAt: 10 }, { id: 3, alive: false }] })
  sim.stepFor(.02); assert.equal(sim.state.phase, 'switching'); assert.equal(sim.state.aiServeCountdown, 0)
  for (let step = 0; step < 120 && sim.state.phase === 'switching'; step++) sim.stepFor(STEP)
  assert.equal(sim.state.phase, 'held'); assert.equal(sim.state.attackTeam, 'red')
  assert.equal(sim.state.ball.ownerId, 2); assert.equal(sim.state.aiServeRemaining, 3)
  sim.stepFor(2.99); assert.equal(sim.state.phase, 'held')
  sim.stepFor(.01); assert.equal(sim.state.phase, 'flight')
})

test('configurable preparation never extends the existing five-second possession limit', () => {
  for (const [configured, effective] of [[2, 2], [5, 5], [8, 5]]) {
    const { sim, events } = game({ team: 'red', ai: true, config: { aiServeSeconds: configured } })
    assert.equal(sim.state.aiServeRemaining, effective)
    sim.stepFor(effective - .01); assert.equal(sim.state.phase, 'held')
    sim.stepFor(.01); assert.equal(sim.state.phase, 'flight')
    const throws = events.filter(event => event.type === 'dodgeball-throw')
    assert.equal(throws.length, 1); assert.ok(throws[0].elapsed <= 5 + 1e-9)
    assert.ok(Math.abs(throws[0].elapsed - effective) < 1e-9)
  }
})

test('the match deadline immediately ends preparation, including a countdown tied with the final whistle', () => {
  for (const remaining of [2, 3]) {
    const { sim, events } = game({ team: 'red', ai: true })
    sim.setTestState({ timeRemaining: remaining })
    sim.stepFor(remaining)
    assert.equal(sim.state.phase, 'finished'); assert.equal(sim.state.elapsed, 180); assert.equal(sim.state.timeRemaining, 0)
    assert.equal(sim.state.aiServeCountdown, 0); assert.equal(sim.state.aiServeRemaining, 0)
    assert.equal(events.filter(event => event.type === 'dodgeball-throw').length, 0)
    assert.equal(events.filter(event => event.type === 'dodgeball-finish').length, 1)
    const finished = sim.snapshot(); sim.stepFor(10); assert.deepEqual(sim.snapshot(), finished)
  }
})

test('attack movement stays on its end line; defender diagonal movement has no speed advantage', () => {
  const attacker = game().sim, attackStraight = game().sim
  attacker.setMove(1, 1); attackStraight.setMove(0, 1)
  attacker.stepFor(.3); attackStraight.stepFor(.3)
  assert.equal(attacker.state.players[0].z, attackStraight.state.players[0].z)
  assert.equal(attacker.state.players[0].vz, DODGEBALL_DEFAULTS.attackerSpeed)
  attacker.stepFor(.7)
  assert.equal(attacker.state.players[0].x, -12)
  attacker.stepFor(1); assert.equal(attacker.state.players[0].z, 14)
  const straight = game({ team: 'red' }).sim, diagonal = game({ team: 'red' }).sim
  straight.setMove(1, 0); diagonal.setMove(1, 1)
  straight.stepFor(.5); diagonal.stepFor(.5)
  const s = straight.state.players[0], d = diagonal.state.players[0]
  assert.ok(Math.abs((s.x + 3.5) - Math.hypot(d.x + 3.5, d.z - 9.7)) < 1e-8)
  assert.ok(Math.hypot(d.vx, d.vz) <= DODGEBALL_DEFAULTS.defenderSpeed + 1e-8)
})

test('defender depth movement clamps to the same minimum and maximum as straight-throw attackers', () => {
  assert.equal(DODGEBALL_DEFAULTS.defendZMin, DODGEBALL_DEFAULTS.attackZMin)
  assert.equal(DODGEBALL_DEFAULTS.defendZMax, DODGEBALL_DEFAULTS.attackZMax)
  const { sim } = game({ team: 'red' })
  sim.setMove(0, 1); sim.stepFor(2)
  assert.equal(sim.state.players[0].z, DODGEBALL_DEFAULTS.attackZMax)
  assert.equal(sim.state.players[0].vz, 0)
  sim.setMove(0, -1); sim.stepFor(2)
  assert.equal(sim.state.players[0].z, DODGEBALL_DEFAULTS.attackZMin)
  assert.equal(sim.state.players[0].vz, 0)
})

test('custom defender ranges cannot reintroduce depths outside the attacker range', () => {
  for (const [config, low, high] of [
    [{ defendZMin: 3, defendZMax: 20 }, 5.7, 14],
    [{ defendZMin: 7, defendZMax: 12 }, 7, 12],
    [{ attackZMin: 6, attackZMax: 13 }, 6, 13],
    [{ defendZMin: 15, defendZMax: 20 }, 5.7, 14],
  ]) {
    const { sim } = game({ team: 'red', config })
    for (const player of sim.state.players.filter(player => player.role === 'defend')) {
      assert.ok(player.z >= low && player.z <= high, 'Initial positions already respect the normalized range')
    }
    sim.setMove(0, 1); sim.stepFor(2); assert.equal(sim.state.players[0].z, high)
    sim.setMove(0, -1); sim.stepFor(2); assert.equal(sim.state.players[0].z, low)
  }
})

test('defenders at either exact depth boundary are hittable by both modes from either throwing end', () => {
  for (const mode of ['pingpong', 'beanbag']) for (const ownerId of [0, 1]) for (const z of [5.7, 14]) {
    const { sim, events } = game({ mode }), otherZ = z === 14 ? 5.7 : 14
    sim.setTestState({ controlledId: ownerId, ball: { ownerId }, players: [
      { id: ownerId, z }, { id: 1 - ownerId, z },
      { id: 2, x: 0, z }, { id: 3, x: 6, z: otherZ },
    ] })
    sim.beginCharge(); sim.releaseCharge()
    assert.equal(sim.state.ball.z, z); assert.equal(sim.state.ball.vz, 0)
    for (let step = 0; step < 240 && sim.state.phase === 'flight'; step++) sim.stepFor(STEP)
    const context = `${mode}, owner ${ownerId}, exact boundary z ${z}`
    assert.equal(sim.state.lastAttackResult?.reason, 'hit', context)
    assert.equal(sim.state.lastAttackResult.playerId, 2, context)
    assert.equal(sim.state.players[2].alive, false, context)
    assert.equal(sim.state.players[2].z, z, context)
    assert.deepEqual(sim.state.scores, { blue: 1, red: 0 }, context)
    assert.equal(events.filter(event => event.type === 'dodgeball-hit').length, 1, context)
  }
})

test('jump reaches the approved peak, cannot be restarted in the air, and lands', () => {
  const { sim } = game()
  assert.equal(sim.jump(), true); assert.equal(sim.jump(), false)
  let peak = 0
  for (let index = 0; index < 140; index++) { sim.update(STEP); peak = Math.max(peak, sim.state.players[0].y) }
  assert.ok(Math.abs(peak - 1.6) < .002)
  assert.equal(sim.state.players[0].y, 0); assert.equal(sim.state.players[0].vy, 0)
})

test('jumping lifts the real collision capsule so a low airborne ball can pass underneath', () => {
  const standing = game({ team: 'red' }).sim, airborne = game({ team: 'red' }).sim
  for (const [sim, height] of [[standing, 0], [airborne, 1.6]]) {
    flight(sim, { ball: { x: -1.4, y: .5, vx: 200 }, players: [{ id: 0, x: 0, z: 11, y: height, vy: 0 }, { id: 1, x: 6, z: 14 }] })
    sim.stepFor(.02)
  }
  assert.equal(standing.state.players[0].alive, false)
  assert.equal(airborne.state.players[0].alive, true)
  assert.equal(airborne.state.phase, 'flight')
})

test('fast continuous hit eliminates only the first character and scores exactly once', () => {
  const { sim, events } = game()
  flight(sim, { ball: { x: -2, vx: 600 }, players: [{ id: 2, x: 0, z: 11 }, { id: 3, x: 1.3, z: 11 }] })
  sim.stepFor(STEP)
  assert.equal(sim.state.players[2].alive, false); assert.equal(sim.state.players[3].alive, true)
  assert.equal(sim.state.scores.blue, 1); assert.equal(sim.state.phase, 'returning')
  sim.stepFor(.3)
  assert.equal(events.filter(event => event.type === 'dodgeball-hit').length, 1)
  assert.equal(sim.state.scores.blue, 1)
})

test('a rebound remains live and can hit a defender after touching the ground', () => {
  const { sim, events } = game()
  flight(sim, { ball: { x: -2, y: .28, vx: 14, vy: -2 }, players: [{ id: 2, x: .8, z: 11 }, { id: 3, x: 8, z: 14 }] })
  sim.stepFor(.3)
  assert.ok(events.some(event => event.type === 'dodgeball-bounce'))
  assert.equal(sim.state.players[2].alive, false); assert.equal(sim.state.scores.blue, 1)
  assert.ok(events.findIndex(event => event.type === 'dodgeball-bounce') < events.findIndex(event => event.type === 'dodgeball-hit'))
})

test('beanbag rolling ends the attack before the sliding object can eliminate anyone', () => {
  const { sim, events } = game({ mode: 'beanbag' })
  flight(sim, { ball: { x: 0, y: .241, vx: 8, vy: -.15 }, players: [{ id: 2, x: 4, z: 11 }, { id: 3, x: 8, z: 11 }] })
  sim.stepFor(.3)
  assert.equal(sim.state.lastAttackResult.reason, 'rolling')
  assert.equal(sim.state.ball.active, false)
  assert.equal(sim.state.scores.blue, 0); assert.equal(events.filter(event => event.type === 'dodgeball-hit').length, 0)
})

test('passing the central end line stays live; passing the outer court boundary ends the attack', () => {
  const { sim } = game()
  flight(sim, { ball: { x: 10.2, y: 1.5, z: 7, vx: 20 }, players: [{ id: 2, z: 14 }, { id: 3, z: 14 }] })
  sim.stepFor(.05); assert.equal(sim.state.phase, 'flight'); assert.ok(sim.state.ball.x > 10.15)
  sim.stepFor(.2); assert.equal(sim.state.lastAttackResult.reason, 'out'); assert.equal(sim.state.scores.blue, 0)
  sim.stepFor(.66); assert.equal(sim.state.ball.ownerId, 1)
})

test('attackers automatically receive a reachable ball without earning catch points', () => {
  const { sim, events } = game()
  flight(sim, { ball: { x: 10.9, y: 1.5, vx: 50 }, players: [{ id: 2, z: 14 }, { id: 3, z: 14 }] })
  sim.stepFor(.06)
  const caught = events.find(event => event.type === 'dodgeball-catch')
  assert.equal(caught.playerId, 1); assert.equal(caught.defensive, false); assert.equal(caught.points, 0)
  assert.deepEqual(sim.state.scores, { blue: 0, red: 0 })
  sim.stepFor(DODGEBALL_MOTION.catchSeconds + .66); assert.equal(sim.state.ball.ownerId, 1); assert.equal(sim.state.controlledId, 1)
})

test('active defensive catch takes precedence over body collision, scores one and rescues one teammate', () => {
  const { sim, events } = game({ team: 'red' })
  flight(sim, { ball: { x: -5, y: 1.7, z: 9.7, vx: 100 }, players: [{ id: 0, x: -3.5, z: 9.7 }, { id: 1, alive: false }] })
  assert.equal(sim.catchBall(), true)
  sim.stepFor(.06)
  assert.equal(sim.state.players[0].alive, true); assert.equal(sim.state.players[1].alive, true)
  assert.deepEqual([sim.state.players[1].x, sim.state.players[1].z], [3.6, 13])
  assert.deepEqual(sim.state.scores, { blue: 1, red: 0 })
  assert.equal(events.filter(event => event.type === 'dodgeball-hit').length, 0)
  assert.equal(events.find(event => event.type === 'dodgeball-catch').revivedId, 1)
  sim.stepFor(DODGEBALL_MOTION.catchSeconds + .66); assert.equal(sim.state.attackTeam, 'red'); assert.equal(sim.state.ball.ownerId, 3)
})

test('catching with both teammates alive grants only the catch point, without a stored extra life', () => {
  const { sim, events } = game({ team: 'red' })
  flight(sim, { ball: { x: -1.4, y: 1.7, vx: 100 }, players: [{ id: 0, x: 0, z: 11 }, { id: 1, x: 6, z: 14 }] })
  sim.catchBall(); sim.stepFor(.03)
  assert.equal(sim.state.scores.blue, 1)
  assert.equal(events.find(event => event.type === 'dodgeball-catch').revivedId, null)
  sim.stepFor(DODGEBALL_MOTION.catchSeconds + .66)
  flight(sim, { ball: { x: -1.4, y: 1.7, vx: 100, attackId: 2 }, players: [{ id: 0, x: 0, z: 11 }] })
  sim.stepFor(.03)
  assert.equal(sim.state.players[0].alive, false)
  assert.equal(sim.state.controlledId, 1)
})

test('catch is a short edge-triggered action and repeated calls do not extend its protection', () => {
  const { sim } = game({ team: 'red' })
  flight(sim, { ball: { x: -10, y: 2, vx: 1 }, players: [{ id: 0, x: 0, z: 11 }] })
  assert.equal(sim.catchBall(), true)
  const deadline = sim.state.players[0].catchUntil
  sim.stepFor(.2); assert.equal(sim.catchBall(), false); assert.equal(sim.state.players[0].catchUntil, deadline)
  sim.stepFor(.05)
  flight(sim, { ball: { x: -1, y: 1.7, vx: 100 }, players: [{ id: 0, x: 0, z: 11 }] })
  sim.stepFor(.02)
  assert.equal(sim.state.players[0].alive, false); assert.equal(sim.state.scores.red, 1)
})

test('successful catch brakes horizontally and holds a distinct pose before retrieval; inputs stay edge-triggered', () => {
  const { sim, events } = game({ team: 'red' })
  flight(sim, { ball: { x: -1, y: 1.7, vx: 100 }, players: [{ id: 0, x: 0, z: 11, vx: 3, vz: 2 }] })
  sim.catchBall(); sim.stepFor(STEP)
  const catcher = sim.state.players[0], caught = { x: catcher.x, z: catcher.z, ball: { ...sim.state.ball } }
  assert.equal(catcher.action, 'caught'); assert.equal(catcher.actionDuration, .55)
  assert.deepEqual(sim.state.catchDisplay, { playerId: 0, duration: .55, returnSeconds: .65 })
  assert.equal(sim.catchBall(), false); assert.equal(sim.jump(), false); assert.equal(sim.beginCharge(), false)
  sim.setMove(1, 1); sim.stepFor(.4)
  assert.equal(catcher.x, caught.x); assert.equal(catcher.z, caught.z)
  assert.deepEqual(sim.state.ball, caught.ball); assert.equal(catcher.action, 'caught')
  assert.ok(sim.state.elapsed > .4, 'confirmation is effective match time, not a global pause')
  assert.equal(events.filter(event => event.type === 'dodgeball-catch').length, 1)
  sim.stepFor(.16)
  assert.equal(sim.state.phase, 'returning'); assert.ok(catcher.x > caught.x)
  sim.stepFor(.65)
  assert.equal(sim.state.phase, 'held'); assert.equal(sim.state.ball.ownerId, 3)
  assert.equal(sim.state.catchDisplay, null); assert.deepEqual(sim.state.scores, { blue: 1, red: 0 })
})

test('pause clears input without erasing successful catch, then resumes from the same action time', () => {
  const { sim } = game({ team: 'red' })
  flight(sim, { ball: { x: -1, y: 1.7, vx: 100 }, players: [{ id: 0, x: 0, z: 11 }] })
  sim.catchBall(); sim.stepFor(.2)
  const actionTime = sim.state.players[0].actionTime
  sim.clearInput(); assert.equal(sim.state.players[0].action, 'caught')
  const paused = sim.snapshot()
  for (let frame = 0; frame < 100; frame++) sim.update(0)
  assert.deepEqual(sim.snapshot(), paused)
  sim.stepFor(.1)
  assert.equal(sim.state.players[0].action, 'caught')
  assert.ok(Math.abs(sim.state.players[0].actionTime - actionTime - .1) < 1e-9)
})

test('air catch keeps gravity and landing while preventing horizontal skating', () => {
  const { sim } = game({ team: 'red' })
  flight(sim, { ball: { x: -1, y: 2.2, vx: 100 }, players: [{ id: 0, x: 0, y: .5, vy: -2, z: 11 }] })
  sim.catchBall(); sim.stepFor(STEP)
  const startY = sim.state.players[0].y
  sim.setMove(1, 0); sim.stepFor(.35)
  assert.equal(sim.state.players[0].y, 0); assert.ok(startY > 0)
  assert.equal(sim.state.players[0].vx, 0); assert.equal(sim.state.players[0].action, 'caught')
  assert.equal(sim.state.ball.active, false)
})

test('catch confirmation expires at the match deadline and is cleared by a fresh selection', () => {
  const { sim, events } = game({ team: 'red' })
  flight(sim, { timeRemaining: .15, ball: { x: -1, y: 1.7, vx: 100 }, players: [{ id: 0, x: 0, z: 11 }] })
  sim.catchBall(); sim.stepFor(.1); assert.ok(sim.state.catchDisplay)
  sim.stepFor(.1)
  assert.equal(sim.state.phase, 'finished'); assert.equal(sim.state.timeRemaining, 0)
  assert.equal(sim.state.catchDisplay, null); assert.equal(events.filter(event => event.type === 'dodgeball-finish').length, 1)
  sim.start('beanbag'); assert.equal(sim.state.catchDisplay, null)
})

test('throw follow-through lasts .55 seconds without delaying projectile release', () => {
  const { sim } = game()
  sim.beginCharge(); sim.releaseCharge()
  assert.equal(sim.state.ball.active, true); assert.equal(sim.state.players[0].action, 'throw')
  assert.equal(sim.state.players[0].actionDuration, .55)
  sim.stepFor(.3); assert.equal(sim.state.players[0].action, 'throw')
  sim.stepFor(.26); assert.notEqual(sim.state.players[0].action, 'throw')
})

test('final elimination grants one plus two points and swaps roles once after 0.9 seconds', () => {
  const { sim, events } = game()
  flight(sim, { scores: { blue: 1 }, ball: { x: -1.4, vx: 100 }, players: [{ id: 2, x: 0, z: 11 }, { id: 3, alive: false }] })
  sim.stepFor(.02)
  assert.equal(sim.state.phase, 'switching'); assert.equal(sim.state.scores.blue, 4)
  assert.equal(events.filter(event => event.type === 'dodgeball-clear').length, 1)
  sim.stepFor(.91)
  assert.equal(sim.state.attackTeam, 'red'); assert.equal(sim.state.round, 2); assert.equal(sim.state.ball.ownerId, 2)
  assert.ok(sim.state.players.every(player => player.alive)); assert.equal(sim.state.controlledId, 0)
})

test('the deadline clips the last physics substep: late hit gets no point', () => {
  const { sim, events } = game()
  flight(sim, { timeRemaining: .004, ball: { x: -1, y: 1.7, vx: 50 }, players: [{ id: 2, x: 0, z: 11 }, { id: 3, x: 6, z: 14 }] })
  sim.update(STEP)
  assert.equal(sim.state.phase, 'finished'); assert.equal(sim.state.timeRemaining, 0)
  assert.equal(sim.state.scores.blue, 0); assert.equal(sim.state.winner, 'draw')
  assert.equal(events.filter(event => event.type === 'dodgeball-finish').length, 1)
  sim.stepFor(20); assert.equal(events.filter(event => event.type === 'dodgeball-finish').length, 1)
})

test('a hit before the final deadline is scored before selecting the winner', () => {
  const { sim, events } = game()
  flight(sim, { timeRemaining: .004, ball: { x: -.8, y: 1.7, vx: 50 }, players: [{ id: 2, x: 0, z: 11 }, { id: 3, x: 6, z: 14 }] })
  sim.update(STEP)
  assert.equal(sim.state.scores.blue, 1); assert.equal(sim.state.winner, 'blue')
  assert.ok(events.find(event => event.type === 'dodgeball-hit').elapsed < 180)
})

test('update limits catch-up to eight substeps and clearInput cancels held input safely', () => {
  const { sim } = game()
  sim.setMove(0, 1); sim.beginCharge(); sim.update(10)
  assert.ok(Math.abs(sim.state.elapsed - STEP * 8) < 1e-9)
  sim.clearInput(); assert.equal(sim.state.charging, false); assert.equal(sim.state.players[0].vz, 0)
  const before = sim.snapshot(); assert.deepEqual(sim.snapshot(), before)
  sim.update(Number.NaN); assert.deepEqual(sim.snapshot(), before)
})

test('AI decisions are seed-stable and independent of render update grouping', () => {
  const first = game({ team: 'red', ai: true, seed: 'same-ai' }).sim
  const second = game({ team: 'red', ai: true, seed: 'same-ai' }).sim
  first.stepFor(9)
  for (let index = 0; index < 540; index++) second.update(1 / 60)
  assert.deepEqual(first.snapshot(), second.snapshot())
  assert.ok(first.state.ball.attackId > 1)
})

test('both complete modes reach a finite 180-second result with real AI actions', () => {
  for (const mode of ['pingpong', 'beanbag']) {
    const { sim, events } = game({ team: 'red', mode, ai: true })
    sim.stepFor(180)
    assert.equal(sim.state.phase, 'finished'); assert.equal(sim.state.elapsed, 180)
    assert.ok(events.some(event => event.type === 'dodgeball-throw'))
    assert.ok(events.some(event => event.type === 'dodgeball-hit'))
    for (const player of sim.state.players) for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) assert.ok(Number.isFinite(player[key]))
    assert.ok(['blue', 'red', 'draw'].includes(sim.state.winner))
  }
})

test('both modes and ends charge while moving and jumping, then release along the current hand Z', () => {
  for (const mode of ['pingpong', 'beanbag']) for (const ownerId of [0, 1]) {
    const { sim } = game({ mode }), sign = ownerId ? -1 : 1, owner = sim.state.players[ownerId]
    sim.setTestState({ controlledId: ownerId, ball: { ownerId } })
    sim.stepFor(STEP)
    assert.deepEqual(sim.state.aim.direction, { x: sign, z: 0 })
    const chargeStartZ = owner.z
    sim.beginCharge(); sim.setMove(1, 1); sim.jump(); sim.stepFor(.13)
    const aim = structuredClone(sim.state.aim), ball = sim.state.ball, ownerVy = owner.vy
    assert.ok(owner.z > chargeStartZ); assert.ok(owner.y > 0)
    assert.deepEqual(aim.origin, { x: ball.x, y: ball.y, z: ball.z })
    assert.equal(aim.origin.z, owner.z)
    assert.equal(aim.origin.y, owner.y + DODGEBALL_DEFAULTS.releaseHeight)
    assert.equal(aim.ownerId, ownerId); assert.deepEqual(aim.target, { x: sign * 12, z: owner.z })
    assert.deepEqual(aim.direction, { x: sign, z: 0 })
    const expectedSpeed = DODGEBALL_DEFAULTS.modes[mode].minSpeed
      + (DODGEBALL_DEFAULTS.modes[mode].maxSpeed - DODGEBALL_DEFAULTS.modes[mode].minSpeed) * sim.state.charge
    sim.releaseCharge()
    assert.deepEqual({ x: ball.x, y: ball.y, z: ball.z }, aim.origin)
    assert.equal(ball.vx, sign * expectedSpeed); assert.equal(ball.vz, 0)
    assert.equal(ball.vy, DODGEBALL_DEFAULTS.modes[mode].upSpeed + ownerVy)
    assert.equal(sim.state.controlledId, 1 - ownerId)
    assert.equal(sim.state.aim.ownerId, null)
    sim.select(); assert.equal(sim.state.aim.ownerId, null)
  }
})

test('five-second automatic throws use the current depth on either end and cannot read a stale direction cue', () => {
  for (const mode of ['pingpong', 'beanbag']) for (const ownerId of [0, 1]) {
    const { sim, events } = game({ mode }), sign = ownerId ? -1 : 1
    sim.setTestState({ controlledId: ownerId, ball: { ownerId } })
    sim.stepFor(4.8); sim.setMove(1, -1)
    // Presentation data is not a gameplay aim input, even if a consumer mutates it.
    sim.state.aim.target.z = 17; sim.state.aim.direction.z = .8
    sim.stepFor(.2)
    const ball = sim.state.ball, owner = sim.state.players[ownerId]
    assert.equal(sim.state.phase, 'flight'); assert.ok(owner.z < 11)
    assert.equal(ball.z, owner.z); assert.equal(ball.vz, 0); assert.equal(Math.sign(ball.vx), sign)
    assert.equal(events.filter(event => event.type === 'dodgeball-throw').length, 1)
    assert.equal(events.find(event => event.type === 'dodgeball-throw').automatic, true)
  }
})

test('air drag visibly slows the terminal ball without sideways drift or seed-dependent player aim', () => {
  for (const mode of ['pingpong', 'beanbag']) {
    const headings = []
    for (const seed of ['straight-a', 'straight-b']) {
      const { sim } = game({ mode, seed })
      sim.setTestState({ players: [{ id: 2, z: 14 }, { id: 3, z: 14 }] })
      sim.beginCharge(); sim.releaseCharge()
      const origin = { ...sim.state.ball }, speed = Math.hypot(origin.vx, origin.vz), params = DODGEBALL_DEFAULTS.modes[mode]
      headings.push([origin.vx, origin.vz])
      const forecast = predictBallAtX(origin, 10, params)
      assert.ok(forecast)
      sim.stepFor(.2)
      const earlySpeed = Math.hypot(sim.state.ball.vx, sim.state.ball.vz)
      sim.stepFor(forecast.time - .2)
      const ball = sim.state.ball, terminalSpeed = Math.hypot(ball.vx, ball.vz)
      assert.equal(sim.state.phase, 'flight'); assert.equal(ball.bounces, 0)
      assert.ok(Math.abs(ball.x - 10) < 1e-9)
      assert.ok(Math.abs((ball.x - origin.x) * origin.vz - (ball.z - origin.z) * origin.vx) < 1e-9)
      assert.ok(Math.abs(terminalSpeed / speed - Math.exp(-params.drag * forecast.time)) < 1e-10)
      assert.ok(terminalSpeed / speed < (mode === 'pingpong' ? .7 : .8))
      assert.ok(terminalSpeed < earlySpeed * .85)
    }
    assert.deepEqual(headings[0], headings[1])
  }
})

test('both modes and ends receive minimum/maximum-charge straight passes across the full playable depth range', () => {
  let bouncedPasses = 0
  for (const mode of ['pingpong', 'beanbag']) for (const ownerId of [0, 1]) for (const charge of [0, .65]) for (const z of [5.7, 11, 14]) {
    const { sim } = game({ mode }), receiverId = 1 - ownerId, otherZ = z === 14 ? 5.7 : 14
    sim.setTestState({ controlledId: ownerId, ball: { ownerId }, players: [{ id: ownerId, z }, { id: receiverId, z }, { id: 2, z: otherZ }, { id: 3, z: otherZ }] })
    sim.beginCharge(); sim.stepFor(charge); sim.releaseCharge()
    assert.equal(sim.state.ball.z, z); assert.equal(sim.state.ball.vz, 0)
    for (let step = 0; step < 360 && sim.state.phase === 'flight'; step++) sim.stepFor(STEP)
    const context = `${mode}, owner ${ownerId}, charge ${charge}, z ${z}`
    assert.equal(sim.state.lastAttackResult?.reason, 'catch', context)
    assert.equal(sim.state.lastAttackResult.playerId, receiverId, context)
    // Slower low-charge passes may reach the receiver on a live rebound.
    // The ball must stay above the floor; a pre-bounce .35m visual threshold
    // would incorrectly require increasing speed again instead of slowing play.
    assert.ok(sim.state.ball.y >= sim.state.ball.radius, context)
    if (sim.state.ball.bounces > 0) bouncedPasses++
    assert.deepEqual(sim.state.scores, { blue: 0, red: 0 })
  }
  assert.ok(bouncedPasses >= 4)
})

test('AI receiver prediction matches live exact-drag motion after a real rebound', () => {
  const { sim } = game()
  flight(sim, { ball: { x: -9, y: 1, z: 11, vx: 30, vy: -2 }, players: [{ id: 2, z: 14 }, { id: 3, z: 14 }] })
  const predicted = predictBallAtX(sim.state.ball, 9, DODGEBALL_DEFAULTS.modes.pingpong)
  assert.ok(predicted && predicted.bounces > 0)
  sim.stepFor(predicted.time)
  assert.equal(sim.state.phase, 'flight')
  assert.ok(Math.abs(sim.state.ball.x - 9) < 1e-8)
  assert.ok(Math.abs(sim.state.ball.y - predicted.y) < 1e-8)
  assert.ok(Math.abs(sim.state.ball.z - predicted.z) < 1e-8)
  assert.equal(sim.state.ball.bounces, predicted.bounces)
})

test('a low airborne ball remains receivable after multiple bounces with the slower working speed', () => {
  const { sim } = game()
  flight(sim, { ball: { x: -11.28, y: .6, z: 11, vx: DODGEBALL_DEFAULTS.modes.pingpong.minSpeed, vy: 0 }, players: [{ id: 2, z: 14 }, { id: 3, z: 14 }] })
  for (let step = 0; step < 360 && sim.state.phase === 'flight'; step++) sim.stepFor(STEP)
  assert.equal(sim.state.lastAttackResult.reason, 'catch'); assert.equal(sim.state.lastAttackResult.playerId, 1)
  assert.ok(sim.state.ball.bounces >= 2); assert.ok(sim.state.ball.y >= sim.state.ball.radius)
  assert.deepEqual(sim.state.scores, { blue: 0, red: 0 })
})

test('AI keeps one alignment target per possession and moves its body instead of steering the throw', () => {
  const { sim } = game({ team: 'red', ai: true }), owner = sim.state.players[2]
  const sampled = { id: owner.aiAlignTargetId, ratio: owner.aiThrowRatio }, initialZ = owner.z
  assert.equal(sampled.id, 0)
  assert.equal('aiAimError' in DODGEBALL_DEFAULTS, false)
  assert.equal('aiAimLeadSeconds' in DODGEBALL_DEFAULTS, false)
  for (let index = 0; index < 3; index++) {
    const previousVelocity = owner.vz
    sim.stepFor(.1)
    assert.deepEqual({ id: owner.aiAlignTargetId, ratio: owner.aiThrowRatio }, sampled)
    assert.ok(Math.abs(owner.vz - previousVelocity) <= DODGEBALL_DEFAULTS.acceleration * .1 + 1e-8)
    assert.ok(Math.abs(owner.vz) <= DODGEBALL_DEFAULTS.attackerSpeed)
    assert.equal(owner.x, -12)
    assert.deepEqual(sim.state.aim.direction, { x: 1, z: 0 })
    assert.equal(sim.state.aim.target.z, owner.z)
    for (const key of ['aiAimX', 'aiAimZ', 'aiAimOffsetZ', 'aiAimTargetId']) assert.equal(key in owner, false)
    assert.equal(sim.state.phase, 'held')
  }
  assert.ok(owner.z < initialZ, 'The computer must physically approach its alignment target')
})

test('defending NPCs keep moving in both axes while waiting, with persistent waypoints and ordinary acceleration', () => {
  const { sim } = game({ ai: true, config: { holdSeconds: 60 } })
  const ranges = [{ x: [], z: [] }, { x: [], z: [] }]
  sim.stepFor(STEP)
  const waypoint = [sim.state.players[2].aiPatrolX, sim.state.players[2].aiPatrolZ]
  sim.stepFor(.3)
  assert.deepEqual([sim.state.players[2].aiPatrolX, sim.state.players[2].aiPatrolZ], waypoint)
  for (let index = 0; index < 1200; index++) {
    const previous = sim.state.players.slice(2).map(player => ({ vx: player.vx, vz: player.vz }))
    sim.stepFor(STEP)
    for (const [slot, player] of sim.state.players.slice(2).entries()) {
      ranges[slot].x.push(player.x); ranges[slot].z.push(player.z)
      assert.ok(Math.hypot(player.vx, player.vz) <= DODGEBALL_DEFAULTS.defenderSpeed + 1e-8)
      assert.ok(Math.hypot(player.vx - previous[slot].vx, player.vz - previous[slot].vz) <= DODGEBALL_DEFAULTS.acceleration * STEP + 1e-8)
    }
  }
  assert.equal(sim.state.phase, 'held')
  for (const range of ranges) {
    assert.ok(Math.max(...range.x) - Math.min(...range.x) > 3)
    assert.ok(Math.max(...range.z) - Math.min(...range.z) > 4)
  }
})

test('NPCs leave boundary corners and do not return there as a permanent safe position', () => {
  const { sim } = game({ ai: true, config: { holdSeconds: 60 } })
  sim.setTestState({ players: [{ id: 2, x: -9.4, z: 5.8 }, { id: 3, x: 9.4, z: 13.9 }] })
  sim.stepFor(3)
  for (let index = 0; index < 120; index++) {
    sim.stepFor(.05)
    for (const player of sim.state.players.slice(2)) {
      assert.ok(Math.abs(player.x) < 8.5)
      assert.ok(player.z > DODGEBALL_DEFAULTS.defendZMin + 1 && player.z < DODGEBALL_DEFAULTS.defendZMax - 1)
    }
  }
})

test('defenders continue recovering toward the interior during the ball return', () => {
  const { sim } = game({ ai: true })
  flight(sim, { ball: { x: 13.99, z: 11, vx: 30 }, players: [{ id: 2, x: -7, z: 7 }, { id: 3, x: 7, z: 13 }] })
  sim.stepFor(.01); assert.equal(sim.state.phase, 'returning')
  const before = sim.state.players.slice(2).map(player => ({ x: player.x, z: player.z }))
  sim.stepFor(.4); assert.equal(sim.state.phase, 'returning')
  for (const [index, player] of sim.state.players.slice(2).entries()) {
    assert.ok(Math.abs(player.x) < Math.abs(before[index].x))
    const centerZ = (DODGEBALL_DEFAULTS.defendZMin + DODGEBALL_DEFAULTS.defendZMax) / 2
    assert.ok(Math.abs(player.z - centerZ) < Math.abs(before[index].z - centerZ))
  }
})

test('ordinary aligned straight throws can hit moving NPCs, but farther targets can also dodge or catch', () => {
  for (const mode of ['pingpong', 'beanbag']) {
    let hits = 0, avoided = 0
    for (let index = 0; index < 16; index++) {
      const { sim } = game({ mode, ai: true, seed: `fairness-${index}` })
      sim.stepFor((index % 4) * .2)
      const target = sim.state.players[index % 2 ? 2 : 3]
      const z = Math.max(DODGEBALL_DEFAULTS.attackZMin, Math.min(DODGEBALL_DEFAULTS.attackZMax, target.z))
      sim.setTestState({ players: [{ id: 0, z }] })
      sim.beginCharge(); sim.releaseCharge()
      assert.equal(sim.state.ball.z, z); assert.equal(sim.state.ball.vz, 0)
      const previous = sim.state.players.map(player => ({ x: player.x, z: player.z }))
      for (let step = 0; step < 240 && sim.state.phase === 'flight'; step++) {
        sim.stepFor(STEP)
        for (const player of sim.state.players) {
          assert.ok(Math.hypot(player.x - previous[player.id].x, player.z - previous[player.id].z) <= DODGEBALL_DEFAULTS.defenderSpeed * STEP + 1e-8)
          previous[player.id] = { x: player.x, z: player.z }
        }
      }
      if (sim.state.lastAttackResult?.reason === 'hit') hits++; else avoided++
    }
    assert.ok(hits >= 3, `${mode}: aligned shots must be able to hit ordinary moving NPCs`)
    assert.ok(avoided >= 2, `${mode}: NPCs must still have reachable defensive responses`)
  }
})

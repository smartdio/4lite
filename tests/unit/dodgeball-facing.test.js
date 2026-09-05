import test from 'node:test'
import assert from 'node:assert/strict'
import { createDodgeballSimulation, DODGEBALL_DEFAULTS } from '../../src/interactions/dodgeball/simulation.js'

const STEP = DODGEBALL_DEFAULTS.fixedStep
function defender() {
  const sim = createDodgeballSimulation({ config: { aiEnabled: false } })
  sim.start('pingpong', 'red'); sim.stepFor(.8)
  return sim
}
const angleNear = (actual, expected) => assert.ok(Math.abs(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected))) < 1e-8,
  `yaw ${actual} should face ${expected}`)

test('defenders face cardinal and diagonal movement intent in preparation and live flight', () => {
  for (const phase of ['held', 'flight']) for (const [x, z] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const sim = defender()
    sim.setTestState({ phase, players: [{ id: 0, x: 0, z: 11 }],
      ball: { active: phase === 'flight', x: -12, y: 5, z: 5.7, vx: 1, vy: 0, vz: 0, throwerId: 2, receiverId: 3 } })
    sim.setMove(x, z); sim.stepFor(STEP)
    angleNear(sim.state.players[0].yaw, Math.atan2(x,z))
  }
})

test('turning uses the new direction immediately, then idle and changing ball positions preserve it', () => {
  const sim = defender(), player = sim.state.players[0]
  sim.setMove(-1,0); sim.stepFor(.2)
  assert.ok(player.vx < -4); angleNear(player.yaw, -Math.PI/2)
  sim.setMove(1,0); sim.stepFor(STEP)
  assert.ok(player.vx < 0, 'Existing acceleration still brakes the previous movement')
  angleNear(player.yaw, Math.PI/2)
  sim.setMove(0,0)
  sim.setTestState({ phase: 'flight', ball: { active: true, x: -12, y: 5, z: 5.7, vx: 1, vy: 0, vz: 0, throwerId: 2, receiverId: 3 } })
  sim.stepFor(.1); angleNear(player.yaw, Math.PI/2)
  sim.setTestState({ ball: { x: 12, y: 5, z: 14, vx: -1 } })
  sim.stepFor(.1); angleNear(player.yaw, Math.PI/2)
  sim.clearInput(); sim.stepFor(.1); angleNear(player.yaw, Math.PI/2)
})

test('boundary contact and jumping still obey defender directional input', () => {
  const sim = defender(), player = sim.state.players[0]
  sim.setTestState({ players: [{ id: 0, x: DODGEBALL_DEFAULTS.defendXMin }] })
  sim.setMove(-1,0); sim.stepFor(STEP)
  assert.equal(player.vx,0); angleNear(player.yaw,-Math.PI/2)
  assert.equal(sim.jump(),true); sim.setMove(1,-1); sim.stepFor(.1)
  assert.ok(player.y>0); angleNear(player.yaw,3*Math.PI/4)
})

test('computer defenders use their own movement intent while both attacking ends keep the fixed heading', () => {
  const sim = createDodgeballSimulation()
  sim.start('pingpong','red'); sim.stepFor(.8)
  for (const [x,z] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    sim.setTestState({ players: [{ id: 1, aiDecisionAt: 1e9, aiMoveX: x, aiMoveZ: z },
      { id: 2, aiDecisionAt: 1e9, aiThrowAfter: 1e9, aiMoveZ: x || z },
      { id: 3, aiDecisionAt: 1e9, aiMoveZ: x || z }] })
    sim.stepFor(STEP)
    angleNear(sim.state.players[1].yaw,Math.atan2(x,z))
    angleNear(sim.state.players[2].yaw,Math.PI/2)
    angleNear(sim.state.players[3].yaw,-Math.PI/2)
  }
})

test('catch collision does not require facing the ball, and successful catch freezes facing until movement resumes', () => {
  const sim = defender(), player = sim.state.players[0]
  sim.setTestState({ phase: 'flight', phaseElapsed: 0,
    players: [{ id: 0, x: 0, z: 11, yaw: Math.PI/2 }],
    ball: { active: true, ownerId: null, x: -1, y: 1.7, z: 11, vx: 100, vy: 0, vz: 0, throwerId: 2, receiverId: 3, attackId: 1 } })
  assert.equal(sim.catchBall(),true); sim.stepFor(STEP)
  assert.equal(player.action,'caught'); assert.equal(sim.state.scores.blue,1)
  sim.setMove(-1,0); sim.stepFor(.3)
  angleNear(player.yaw,Math.PI/2)
  sim.clearInput(); sim.update(0); angleNear(player.yaw,Math.PI/2)
  assert.equal(player.action,'caught')
  sim.setMove(-1,0); sim.stepFor(.3)
  angleNear(player.yaw,-Math.PI/2)
})

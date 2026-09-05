import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDodgeballPlayers } from '../../src/interactions/dodgeball/characters.js'
import { DODGEBALL_MOTION } from '../../src/interactions/dodgeball/motion.js'

function fixture(t) {
  const names = ['blue', 'blueDark', 'red', 'redDark', 'skin', 'skinShade', 'white', 'shoe', 'hair', 'dark']
  const palette = Object.fromEntries(names.map(name => [name, new THREE.MeshStandardMaterial({ name })]))
  const group = createDodgeballPlayers({ THREE, palette })
  for (const pupil of group.children) pupil.scale.setScalar(1.2)
  t.after(() => {
    group.traverse(object => { if (object.isInstancedMesh) object.dispose() })
    group.userData.sharedGeometry.dispose()
    for (const material of Object.values(palette)) material.dispose()
  })
  return group
}

function pose(pupil, action, actionTime, extra = {}, stateExtra = {}) {
  const player = { id: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: Math.PI / 2,
    alive: true, role: 'attack', action, actionTime, ...extra }
  pupil.userData.applyState(player, { elapsed: actionTime, phase: 'held', charge: 0,
    ball: { ownerId: null }, ...stateExtra })
  return player
}

function jointPositions(pupil) {
  const values = vector => vector.toArray().map(value => value === 0 ? 0 : value);
  return Object.fromEntries(Object.entries(pupil.userData.joints).map(([name, joint]) => [name, {
    position: values(joint.position), quaternion: values(joint.quaternion), scale: values(joint.scale),
  }]))
}

function nearVector(actual, expected, message, epsilon = 1e-9) {
  assert.equal(actual.length, expected.length)
  for (let axis = 0; axis < actual.length; axis++) assert.ok(Math.abs(actual[axis] - expected[axis]) < epsilon,
    `${message}: ${actual} != ${expected}`)
}

function worldPosition(pupil, joint) {
  return pupil.userData.joints[joint].getWorldPosition(new THREE.Vector3())
}

function soleMinY(pupil, side) {
  const point = new THREE.Vector3()
  let lowest = Infinity
  pupil.userData.joints[`${side}-foot`].traverse(part => {
    if (part.isGroup) return
    part.updateWorldMatrix(true, false)
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
      point.set(x, y, z).applyMatrix4(part.matrixWorld)
      lowest = Math.min(lowest, point.y)
    }
  })
  return lowest
}

test('a forceful throw plants the lead foot, lifts the rear leg and extends one hand along either real heading', t => {
  const group = fixture(t), pupil = group.children[0]
  for (const yaw of [-Math.PI / 2, Math.PI / 2]) {
    pose(pupil, 'throw', .15, { yaw })
    const joints = pupil.userData.joints, forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    const rightHand = worldPosition(pupil, '1-hand'), leftHand = worldPosition(pupil, '0-hand')
    const rightFoot = worldPosition(pupil, '1-foot'), leftFoot = worldPosition(pupil, '0-foot')
    assert.ok(joints.spine.rotation.x > .38, 'Torso visibly leans forward, never away from the throw')
    assert.ok(rightHand.dot(forward) > 1.3, 'Throwing palm follows through beyond the neutral hold point')
    assert.ok(rightHand.clone().sub(leftHand).dot(forward) > 1.4, 'Only the throwing arm punches forward')
    assert.ok(rightFoot.dot(forward) < -.70, 'The throwing-side foot trails behind the body')
    assert.ok(leftFoot.dot(forward) > .45, 'The opposite foot plants forward')
    assert.ok(rightFoot.y > leftFoot.y + .20, 'Rear foot is visibly lifted')
  }
})

test('throw release starts at the gameplay hand point and then settles without a final pose snap', t => {
  const group = fixture(t), pupil = group.children[0]
  for (const yaw of [-Math.PI / 2, Math.PI / 2]) {
    pose(pupil, 'throw', 0, { yaw })
    nearVector(worldPosition(pupil, '1-hand').toArray(), [.72 * Math.sin(yaw), 2.05, .72 * Math.cos(yaw)],
      'Immediate release begins at the existing projectile origin')
  }
  pose(pupil, 'throw', .11)
  const heldFollowThrough = jointPositions(pupil)
  pose(pupil, 'throw', .28)
  assert.deepEqual(jointPositions(pupil), heldFollowThrough, 'Readable follow-through stays framed after the fast arm sweep')
  pose(pupil, 'throw', DODGEBALL_MOTION.throwSeconds)
  const settled = jointPositions(pupil)
  pose(pupil, 'idle', 0)
  assert.deepEqual(jointPositions(pupil), settled)
})

test('charge winds up the elbow and stance while keeping the throwing palm at the fixed release point', t => {
  const group = fixture(t), pupil = group.children[1], target = new THREE.Vector3()
  for (const charge of [.1, .5, 1]) for (const yaw of [-Math.PI / 2, Math.PI / 2]) {
    pose(pupil, 'charge', charge, { yaw, x: 2, z: 11 }, { charge, ball: { ownerId: 0 } })
    assert.equal(pupil.userData.getBallAnchor(target), target, 'Attachment mutates and returns caller-owned scratch vector')
    nearVector(target.toArray(), [2 + .72 * Math.sin(yaw), 2.05, 11 + .72 * Math.cos(yaw)], 'Charge never moves the physical ball origin')
    assert.ok(pupil.userData.joints.spine.rotation.x < 0)
  }
  const origin = { x: -1.19, y: 3.95, z: 12 };
  pose(pupil, 'charge', .5, { x: -2, y: 1.6, z: 12 }, {
    charge: .5, ball: { ownerId: 0 }, aim: { ownerId: 0, origin },
  })
  nearVector(pupil.userData.getBallAnchor(target).toArray(), Object.values(origin),
    'Live charging respects custom simulation release dimensions instead of duplicating them in the rig')
})

test('successful catch reaches, gathers into two hands, freezes for the readable hold, then returns to idle', t => {
  const group = fixture(t), pupil = group.children[2], target = new THREE.Vector3()
  pose(pupil, 'caught', 0, { role: 'defend', yaw: Math.PI / 2 })
  const reach = worldPosition(pupil, '1-hand').x
  pose(pupil, 'caught', DODGEBALL_MOTION.catchGatherSeconds, { role: 'defend', yaw: Math.PI / 2 })
  const gather = worldPosition(pupil, '1-hand').x, hold = jointPositions(pupil)
  assert.ok(reach > gather + .35, 'Hands visibly absorb the ball toward the chest')
  const expectedAnchor = worldPosition(pupil, '0-hand').add(worldPosition(pupil, '1-hand')).multiplyScalar(.5)
  assert.equal(pupil.userData.getBallAnchor(target), target)
  nearVector(target.toArray(), expectedAnchor.toArray(), 'Caught ball is held between both palms')
  for (const time of [.17, .25, .35, DODGEBALL_MOTION.catchHoldUntil]) {
    pose(pupil, 'caught', time, { role: 'defend' }, { elapsed: time * 23 })
    assert.deepEqual(jointPositions(pupil), hold, 'Elapsed world time must not add breathing/run noise to the successful-catch hold')
    nearVector(pupil.userData.getBallAnchor(target).toArray(), expectedAnchor.toArray(), 'Held ball does not drift')
  }
  pose(pupil, 'caught', DODGEBALL_MOTION.catchSeconds, { role: 'defend' })
  const settled = jointPositions(pupil)
  assert.equal(pupil.userData.getBallAnchor(target), null, 'Completed confirmation no longer claims the projectile')
  assert.equal(pupil.userData.getBallAnchor(target, true), target, 'Dead-ball retrieval may read the current unclasping midpoint')
  pose(pupil, 'idle', 0, { role: 'defend' })
  assert.deepEqual(jointPositions(pupil), settled)
})

test('the ordinary catch attempt visibly reaches forward but never grants a successful-catch ball attachment', t => {
  const group = fixture(t), pupil = group.children[0]
  pose(pupil, 'catch', 0, { role: 'defend' })
  const begin = worldPosition(pupil, '1-hand').x
  pose(pupil, 'catch', .08, { role: 'defend' })
  assert.ok(worldPosition(pupil, '1-hand').x > begin + .35)
  assert.equal(pupil.userData.getBallAnchor(new THREE.Vector3()), null)
})

test('all throw, charge and catch keyframes keep shoes above the floor and preserve resources through out-of-order poses', t => {
  const group = fixture(t), pupil = group.children[0]
  const resources = () => {
    const geometries = new Set(), materials = new Set(), meshes = []
    group.traverse(node => {
      if (node.geometry) geometries.add(node.geometry)
      if (node.material) materials.add(node.material)
      if (node.isInstancedMesh) meshes.push([node, node.count])
    })
    return { geometries, materials, meshes }
  }
  const before = resources()
  for (const yaw of [-Math.PI / 2, Math.PI / 2]) {
    for (const action of ['throw', 'caught', 'charge']) for (let frame = 0; frame <= 66; frame++) {
      const actionTime = frame / 120
      pose(pupil, action, actionTime, { yaw }, { charge: action === 'charge' ? frame / 66 : 0 })
      for (const side of [0, 1]) assert.ok(soleMinY(pupil, side) > -1e-9,
        `${action} at ${actionTime}s put foot ${side} below the court`)
    }
  }
  pose(pupil, 'idle', 0)
  const idle = jointPositions(pupil)
  for (let index = 0; index < 180; index++) {
    pose(pupil, index % 2 ? 'caught' : 'throw', ((index * 19) % 67) / 120)
  }
  pose(pupil, 'idle', 0)
  assert.deepEqual(jointPositions(pupil), idle, 'Seeking/replaying animations cannot accumulate joint drift')
  assert.deepEqual(resources(), before, 'Animations reuse the original single geometry and approved material batches')
})

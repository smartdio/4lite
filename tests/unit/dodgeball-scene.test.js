import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDodgeballScene } from '../../src/interactions/dodgeball/scene.js'
import { createDodgeballSimulation, DODGEBALL_DEFAULTS } from '../../src/interactions/dodgeball/simulation.js'
import { sampleSpotlightAlpha, SPOTLIGHT_STYLE } from '../../src/interactions/dodgeball/aim-indicator.js'

const WIDTH = 1920, HEIGHT = 1080, TOUCH_BAND_TOP = 870
const rules = DODGEBALL_DEFAULTS

test('the solid court follows the common reachable lanes while the projectile boundary stays larger', t => {
  const world = createDodgeballScene()
  t.after(() => world.dispose())
  assert.deepEqual(world.snapshot().playerLanes, { z: [5.7,14], chalkZ: [4.95,14.75] })
  assert.deepEqual(world.snapshot().outerBoundary.z, [4.95,17.45])
  const chalk = world.scene.getObjectByName('environment-chalk-lines')
  chalk.geometry.computeBoundingBox()
  assert.ok(Math.abs(chalk.geometry.boundingBox.min.z-(4.95-.085/2))<1e-5)
  assert.ok(Math.abs(chalk.geometry.boundingBox.max.z-(14.75+.085/2))<1e-5)
})

// Project the actual transformed box vertices, including each pupil's instance
// matrices. Projecting the eight corners of a world AABB would overestimate a
// rotated pupil and could miss a stale or invalid animated instance transform.
function projectedPupilBounds(pupil, camera) {
  const instance = new THREE.Matrix4(), world = new THREE.Matrix4(), point = new THREE.Vector3()
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity, near: Infinity, far: -Infinity, vertices: 0 }
  pupil.updateMatrixWorld(true)
  pupil.traverseVisible(mesh => {
    if (!mesh.isInstancedMesh) return
    const positions = mesh.geometry.getAttribute('position')
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, instance)
      world.multiplyMatrices(mesh.matrixWorld, instance)
      for (let vertex = 0; vertex < positions.count; vertex++) {
        point.fromBufferAttribute(positions, vertex).applyMatrix4(world).project(camera)
        const x = (point.x + 1) * WIDTH / 2, y = (1 - point.y) * HEIGHT / 2
        bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x)
        bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y)
        bounds.near = Math.min(bounds.near, point.z); bounds.far = Math.max(bounds.far, point.z)
        bounds.vertices++
      }
    }
  })
  return bounds
}

function sampleState(player, actionTime = 0, ballMode = 'pingpong') {
  const charging = player.action === 'charge'
  const inFlight = player.action === 'throw' || player.action === 'catch'
  return {
    phase: charging ? 'held' : player.action === 'caught' ? 'returning' : inFlight ? 'flight' : 'ready',
    phaseElapsed: actionTime,
    catchDisplay: player.action === 'caught' ? { playerId: player.id, duration: .55, returnSeconds: .65 } : null,
    ballMode, elapsed: actionTime, controlledId: player.id,
    attackTeam: player.role === 'attack' ? player.team : player.team === 'blue' ? 'red' : 'blue',
    charge: charging ? 1 : 0, players: [{ ...player, actionTime }],
    ball: { x: 0, y: 1.5, z: 11, vx: inFlight ? 22 : 0, vy: 0, vz: 0,
      radius: rules.modes[ballMode].radius, active: inFlight, ownerId: charging ? player.id : null },
  }
}

function renderResources(scene) {
  const geometries = new Set(), materials = new Set(), instances = new Set()
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    if (object.material) for (const material of [object.material].flat()) materials.add(material)
    if (object.isInstancedMesh) instances.add(object)
  })
  return { geometries, materials, instances }
}

function heldSimulation({ ownerId = 0, ballMode = 'pingpong', z = 11, y = 0, config = {} } = {}) {
  const actualRules = { ...rules, ...config }
  const simulation = createDodgeballSimulation({ config: { ...config, aiEnabled: false } })
  simulation.start(ballMode)
  const sign = ownerId ? -1 : 1, x = -sign * actualRules.endpointX
  simulation.setTestState({
    phase: 'held', controlledId: ownerId,
    players: [{ id: ownerId, x, y, z, vx: 0, vy: 0, vz: 0 }],
    ball: { ownerId, x: x + sign * actualRules.releaseForward, y: actualRules.groundY + y + actualRules.releaseHeight, z },
  })
  return simulation
}

function nearVector(actual, expected, context) {
  assert.equal(actual.length, expected.length, context)
  for (let index = 0; index < actual.length; index++) {
    assert.ok(Math.abs(actual[index] - expected[index]) < 1e-6,
      `${context}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
  }
}

test('the hand aim indicator appears only for a living human-controlled blue attacker holding the ball', t => {
  const world = createDodgeballScene()
  t.after(() => world.dispose())
  assert.equal(world.snapshot().aimIndicator.visible, false, 'The approved static sample must not gain an aim overlay')
  const simulation = heldSimulation(), held = simulation.snapshot()
  const indicator = world.scene.getObjectByName('held-ball-aim-indicator')
  for (const charging of [false, true]) {
    world.update({ ...held, charging }, 0)
    assert.equal(indicator.visible, true)
    assert.equal(world.snapshot().aimIndicator.ownerId, 0)
  }
  const hidden = [
    ...['selection', 'ready', 'flight', 'returning', 'switching', 'finished'].map(phase => ({ ...held, phase })),
    { ...held, paused: true },
    { ...held, controlledId: 1 },
    { ...held, attackTeam: 'red' },
    { ...held, ball: { ...held.ball, ownerId: null } },
    { ...held, aim: { ...held.aim, ownerId: 1 } },
    { ...held, aim: null },
    { ...held, aim: { ...held.aim, direction: { x: 0, z: 0 } } },
    { ...held, aim: { ...held.aim, origin: { ...held.aim.origin, x: NaN } } },
    ...[{ alive: false }, { role: 'defend' }, { team: 'red' }].map(change => ({
      ...held, players: held.players.map(player => player.id === 0 ? { ...player, ...change } : player),
    })),
  ]
  for (const state of hidden) {
    world.update(state, 0)
    assert.equal(indicator.visible, false, JSON.stringify(state))
    assert.equal(world.snapshot().aimIndicator.ownerId, null)
  }
  world.update(held, 0, { paused: true })
  assert.equal(indicator.visible, false, 'Presentation pause must not mutate simulation state')
  assert.equal(held.paused, undefined)
  world.update(held, 0, { paused: false })
  assert.equal(indicator.visible, true)
})

test('the translucent fan follows the moving hand and matches straight throws from either end', t => {
  const world = createDodgeballScene()
  t.after(() => world.dispose())
  const beam = world.scene.getObjectByName('aim-spotlight-beam')
  const positions = beam.geometry.getAttribute('position')
  let checked = 0
  for (const ballMode of ['pingpong', 'beanbag']) for (const ownerId of [0, 1]) {
    for (const z of [rules.attackZMin, rules.attackZMax]) for (const y of [0, rules.jumpPeak]) {
      for (const moveZ of [-1, 0, 1]) {
        const simulation = heldSimulation({ ownerId, ballMode, z, y })
        simulation.beginCharge(); simulation.setMove(1, moveZ); simulation.stepFor(.05)
        const state = simulation.state, origin = state.aim.origin, heading = state.aim.direction
        assert.deepEqual(heading, { x: ownerId ? -1 : 1, z: 0 })
        const expectedOrigin = [origin.x, origin.y, origin.z], expectedDirection = [heading.x, 0, heading.z]
        world.update(state, 0)
        const sample = world.snapshot().aimIndicator
        assert.equal(sample.visible, true)
        nearVector(sample.origin, expectedOrigin, 'Shared simulation origin')
        nearVector(sample.direction, expectedDirection, 'Shared simulation direction')
        assert.equal(sample.length, SPOTLIGHT_STYLE.length)
        nearVector(sample.end, expectedOrigin.map((value, axis) => value + expectedDirection[axis] * sample.length), 'Short straight endpoint')

        // Real fan geometry: the shader billboards only its width, leaving the
        // apex and far-edge midpoint on this exact world-space centreline.
        const start = new THREE.Vector3().fromBufferAttribute(positions, 0).applyMatrix4(beam.matrixWorld)
        const end = new THREE.Vector3().fromBufferAttribute(positions, 1)
          .add(new THREE.Vector3().fromBufferAttribute(positions, 2)).multiplyScalar(.5).applyMatrix4(beam.matrixWorld)
        nearVector(start.toArray(), expectedOrigin, 'Rendered fan apex begins at ball centre')
        nearVector(end.clone().sub(start).normalize().toArray(), expectedDirection, 'Rendered fan centreline heading')
        assert.ok(Math.abs(end.distanceTo(start) - sample.length) < 1e-6)

        assert.equal(simulation.releaseCharge(), true)
        const ball = simulation.state.ball, speed = Math.hypot(ball.vx, ball.vz)
        nearVector([ball.x, ball.y, ball.z], expectedOrigin, 'Real throw begins at displayed origin')
        nearVector([ball.vx / speed, 0, ball.vz / speed], expectedDirection, 'Real throw follows the displayed heading')
        world.update(simulation.state, 0)
        assert.equal(world.snapshot().aimIndicator.visible, false, 'Flight hides the hand indicator immediately')
        checked++
      }
    }
  }
  assert.equal(checked, 48)
  const custom = heldSimulation({ y: 1.6, config: { groundY: .15, releaseForward: .81, releaseHeight: 2.2 } })
  world.update(custom.state, 0)
  nearVector(world.snapshot().aimIndicator.origin, [-11.19, 3.95, 11], 'Release dimensions are not duplicated in the scene')
})

test('moving the spotlight reuses its one dedicated geometry, alpha material and fixed vertex buffer', t => {
  const world = createDodgeballScene()
  t.after(() => world.dispose())
  const resources = renderResources(world.scene)
  const indicator = world.scene.getObjectByName('held-ball-aim-indicator')
  const beam = world.scene.getObjectByName('aim-spotlight-beam')
  const positions = beam.geometry.getAttribute('position')
  const buffer = positions.array, bufferVersion = positions.version, materialVersion = beam.material.version
  const uniforms = beam.material.uniforms
  assert.equal(indicator.children.length, 1)
  assert.equal(positions.count, 3, 'A single procedural fan triangle, not solid arrow geometry')
  assert.notEqual(beam.geometry, world.scene.getObjectByName('beanbag-sewn-edge').geometry)
  assert.equal(world.scene.getObjectByName('aim-short-arrow'), undefined)
  assert.equal(world.scene.getObjectByName('aim-outline'), undefined)
  const simulation = heldSimulation()
  for (let frame = 0; frame < 240; frame++) {
    simulation.setMove(0, frame % 120 < 60 ? 1 : -1); simulation.stepFor(1 / 60)
    world.update(simulation.state, 1 / 60)
  }
  const after = renderResources(world.scene)
  for (const key of ['geometries', 'materials', 'instances']) assert.deepEqual(after[key], resources[key])
  assert.equal(positions.array, buffer)
  assert.equal(positions.version, bufferVersion, 'Only the root transform changes on aim updates')
  assert.equal(beam.material.version, materialVersion)
  assert.equal(beam.material.uniforms, uniforms)
  assert.equal(world.snapshot().sceneMaterials, 32)
  assert.equal(world.snapshot().sceneGeometries, 28)
  assert.equal(world.snapshot().texturedWorldMaterials, 0)
  assert.equal(world.snapshot().aimIndicator.materialBatches, 1)
  world.dispose(); world.dispose()
  assert.equal(world.snapshot().aimIndicator.visible, false)
})

test('the spotlight has no opaque arrow, illumination or texture and its side/end alpha fades smoothly', t => {
  const world = createDodgeballScene()
  t.after(() => world.dispose())
  const beam = world.scene.getObjectByName('aim-spotlight-beam'), material = beam.material
  const sample = world.snapshot().aimIndicator
  assert.equal(sample.style, 'spotlight')
  assert.equal(sample.transparent, true)
  assert.equal(sample.arrow, false)
  assert.equal(sample.crosshair, false)
  assert.equal(sample.geometryShared, false)
  assert.equal(sample.length, 3.4)
  assert.equal(sample.endWidth, 1.8)
  assert.equal(material.isShaderMaterial, true)
  assert.equal(material.transparent, true)
  assert.equal(material.opacity, SPOTLIGHT_STYLE.opacity)
  assert.equal(material.opacity, .48)
  assert.equal(material.uniforms.uOpacity.value, .48)
  assert.equal(material.uniforms.uEndFadeStart.value, .7)
  assert.equal(material.uniforms.uSourceColor.value.getHexString(), '7bd9f2')
  assert.equal(material.uniforms.uEndColor.value.getHexString(), '279fc8')
  assert.ok(material.opacity > 0 && material.opacity < .5)
  assert.equal(material.depthWrite, false)
  assert.equal(material.depthTest, true)
  assert.equal(material.forceSinglePass, true)
  assert.equal(beam.castShadow, false)
  assert.equal(beam.receiveShadow, false)
  assert.equal(Object.values(material.uniforms).some(uniform => uniform.value?.isTexture), false)
  assert.doesNotMatch(material.fragmentShader, /sampler2D|texture2D/)
  assert.match(material.fragmentShader, /1\.0 - smoothstep\(uEndFadeStart, 1\.0, along\)/)
  assert.match(material.fragmentShader, /1\.0 - smoothstep\(uEdgeFadeStart, 1\.0, normalizedSide\)/)
  assert.match(material.fragmentShader, /gl_FragColor = vec4\(mix\(uSourceColor, uEndColor, along\), alpha\)/)
  let lights = 0
  world.scene.traverse(object => { if (object.isLight) lights++ })
  assert.equal(lights, 2, 'The cue does not illuminate or change the world lighting')
  assert.equal(sampleSpotlightAlpha(0, 0), 0)
  assert.equal(sampleSpotlightAlpha(1, 0), 0)
  assert.equal(sampleSpotlightAlpha(.4, -1), 0)
  assert.equal(sampleSpotlightAlpha(.4, 1), 0)
  assert.ok(sampleSpotlightAlpha(.4, 0) > sampleSpotlightAlpha(.4, .6))
  assert.ok(sampleSpotlightAlpha(.4, .6) > sampleSpotlightAlpha(.4, .9))
  assert.ok(sampleSpotlightAlpha(.4, 0) > sampleSpotlightAlpha(.8, 0))
  assert.ok(Math.abs(sampleSpotlightAlpha(.4, 0) - .4224) < 1e-9)
  assert.ok(Math.abs(sampleSpotlightAlpha(.7, 0) - .3792) < 1e-9, 'The beam stays legible until the final 30% begins fading')
  assert.ok(sampleSpotlightAlpha(.8, 0) > sampleSpotlightAlpha(.95, 0))
  for (let along = 0; along <= 100; along++) for (let side = -100; side <= 100; side += 10) {
    const alpha = sampleSpotlightAlpha(along / 100, side / 100)
    assert.ok(alpha >= 0 && alpha < .5, 'No fragment can become an opaque wedge')
  }
  // Match the existing behind-the-loading-barrier warmup state. Selection stays
  // hidden, while this held sample submits the dedicated shader and geometry.
  const simulation = createDodgeballSimulation()
  simulation.select('pingpong')
  world.update({ ...simulation.state, phase: 'held', ball: { ...simulation.state.ball, ownerId: 0 }, aim: { ...simulation.state.aim, ownerId: 0 } }, 0)
  assert.equal(world.snapshot().aimIndicator.visible, true)
  world.update(simulation.state, 0)
  assert.equal(world.snapshot().aimIndicator.visible, false)
})

test('every pupil stays inside the reviewed camera and above the mobile controls at movement and jump extremes', t => {
  const world = createDodgeballScene()
  t.after(() => world.dispose())
  assert.deepEqual(world.camera.position.toArray(), [0, 9.11, 37])
  assert.deepEqual(world.cameraTarget.toArray(), [0, 2.2, 11.2])
  assert.equal(world.camera.fov, 38)
  assert.equal(world.camera.aspect, WIDTH / HEIGHT)
  world.camera.updateMatrixWorld(true)

  let checked = 0
  for (const role of ['attack', 'defend']) {
    const xs = role === 'attack' ? [-rules.endpointX, rules.endpointX] : [rules.defendXMin, rules.defendXMax]
    const zs = role === 'attack' ? [rules.attackZMin, rules.attackZMax] : [rules.defendZMin, rules.defendZMax]
    const actions = role === 'attack' ? ['idle', 'run', 'charge', 'throw', 'catch', 'caught', 'jump'] : ['idle', 'run', 'catch', 'caught', 'jump']
    for (let id = 0; id < 4; id++) for (const x of xs) for (const z of zs) for (const y of [0, rules.jumpPeak]) {
      const yaws = role === 'attack' ? [x < 0 ? Math.PI / 2 : -Math.PI / 2]
        : [-Math.PI, -3*Math.PI/4, -Math.PI/2, -Math.PI/4, 0, Math.PI/4, Math.PI/2, 3*Math.PI/4]
      for (const yaw of yaws) for (const action of actions) for (const actionTime of [0, .12, .26, .42, .54]) {
        const player = {
          id, team: id < 2 ? 'blue' : 'red', slot: role === 'attack' ? Number(x > 0) : id % 2,
          role, alive: true, x, y, z, yaw, action,
          vx: role === 'defend' && action === 'run' ? rules.defenderSpeed : 0,
          vz: action === 'run' ? rules.attackerSpeed : 0, vy: 0,
        }
        world.update(sampleState(player, actionTime), 0)
        const bounds = projectedPupilBounds(world.players.children[id], world.camera)
        const context = JSON.stringify({ id, role, x, y, z, yaw, action, actionTime, bounds })
        assert.ok(bounds.vertices > 0, `No real instanced pupil vertices: ${context}`)
        for (const value of Object.values(bounds)) assert.ok(Number.isFinite(value), `Invalid projected vertex: ${context}`)
        assert.ok(bounds.left >= 0 && bounds.right <= WIDTH, `Horizontal clipping: ${context}`)
        assert.ok(bounds.top >= 0 && bounds.bottom <= HEIGHT, `Vertical clipping: ${context}`)
        assert.ok(bounds.near >= -1 && bounds.far <= 1, `Outside the camera depth range: ${context}`)
        assert.ok(bounds.bottom < TOUCH_BAND_TOP, `Pupil overlaps the mobile control band: ${context}`)
        checked++
      }
    }
  }
  assert.equal(checked, 7520)
})

test('both projectile modes and dynamic poses reuse 32 materials and 28 geometries; disposal is idempotent', t => {
  const world = createDodgeballScene()
  t.after(() => world.dispose())
  const before = renderResources(world.scene)
  assert.equal(before.materials.size, 32)
  assert.equal(before.geometries.size, 28)
  assert.ok(before.instances.size > 0)
  assert.equal(world.snapshot().texturedWorldMaterials, 0)

  const actions = ['idle', 'run', 'charge', 'throw', 'jump', 'catch', 'caught', 'out', 'switch']
  for (const ballMode of ['pingpong', 'beanbag']) for (let index = 0; index < 120; index++) {
    const action = actions[index % actions.length], id = index % 4
    const player = { id, team: id < 2 ? 'blue' : 'red', slot: id % 2, role: id < 2 ? 'attack' : 'defend',
      alive: action !== 'out', x: [-12, 12, -3.5, 3.6][id], z: [11, 11, 9.7, 13][id],
      y: action === 'jump' ? rules.jumpPeak : 0, vx: action === 'run' ? 3 : 0, vz: 0, vy: 0,
      yaw: id % 2 ? -Math.PI / 2 : Math.PI / 2, action }
    const state = sampleState(player, index / 60, ballMode)
    if (action === 'switch') { state.phase = 'switching'; state.phaseElapsed = .45 }
    world.update(state, 1 / 60)
  }
  const after = renderResources(world.scene)
  assert.equal(world.snapshot().sceneMaterials, 32)
  assert.equal(world.snapshot().sceneGeometries, 28)
  assert.equal(world.snapshot().texturedWorldMaterials, 0)
  for (const key of ['materials', 'geometries', 'instances']) {
    assert.equal(after[key].size, before[key].size, `${key} grew during animation`)
    for (const resource of before[key]) assert.ok(after[key].has(resource), `${key} was replaced during animation`)
  }

  const disposedCounts = new Map()
  for (const resource of [...after.materials, ...after.geometries, ...after.instances]) {
    disposedCounts.set(resource, 0)
    resource.addEventListener('dispose', () => disposedCounts.set(resource, disposedCounts.get(resource) + 1))
  }
  assert.doesNotThrow(() => { world.dispose(); world.dispose() })
  for (const [resource, count] of disposedCounts) assert.equal(count, 1, `${resource.name || resource.type} was not disposed exactly once`)
  assert.equal(world.scene.children.length, 0)
  assert.equal(world.snapshot().disposed, true)
})

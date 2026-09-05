import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createDodgeballBuilding } from './building.js'
import { createDodgeballPlayers } from './characters.js'
import { createDodgeballAimIndicator } from './aim-indicator.js'
import { DODGEBALL_DEFAULTS as gameRules } from './simulation.js'

/**
 * Shared full-geometry game scene and approved composition study.
 * This factory owns its GPU resources, but never creates or disposes a renderer.
 * Creating it leaves the exact reviewed static pose; update() enters live play.
 */
export function createDodgeballScene() {
  const scene = new THREE.Scene()
  scene.name = 'dodgeball-composition-v01'
  scene.background = new THREE.Color('#c6cdc1')
  // User review: a centered perspective camera gives both end players the same
  // perspective scale and makes the court converge symmetrically into the scene.
  const cameraTarget = new THREE.Vector3(0, 2.2, 11.2)
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, .1, 180)
  camera.position.set(0, 9.11, 37)
  camera.lookAt(cameraTarget)

  const colors = {
    wall: '#d7b56b', cream: '#eee5ce', rail: '#d6d1bd', concrete: '#a8ac9f', roof: '#bfc2b2',
    wood: '#856145', woodDark: '#614b3a', window: '#7a8488', glass: '#496366', glassLight: '#6f8886',
    leaf: '#637c4c', leafLight: '#8e9a61', trunk: '#766049', soil: '#6d634b',
    skin: '#e6b979', skinShade: '#c9945e', hair: '#373b34', blue: '#488b9c', blueDark: '#315b6b',
    red: '#c66c48', redDark: '#874e3d', shoe: '#f2ecd5', dark: '#31434a', white: '#fff5df',
  }
  const palette = Object.fromEntries(Object.entries(colors).map(([name, color]) => [name,
    new THREE.MeshStandardMaterial({ name: `sample-${name}`, color, roughness: .92, metalness: 0 }),
  ]))
  const sharedBox = new THREE.BoxGeometry(1, 1, 1)
  const environment = new THREE.Group(); environment.name = 'sample-playground'; scene.add(environment)
  const worldBox = (name, size, position, material, parent = environment) => {
    const mesh = new THREE.Mesh(sharedBox, material)
    mesh.name = name; mesh.scale.set(...size); mesh.position.set(...position)
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh)
    return mesh
  }

  scene.add(new THREE.HemisphereLight('#e5eff0', '#a6a18c', 1.75))
  const sun = new THREE.DirectionalLight('#ffeed0', 3)
  sun.position.set(-22, 42, 22); sun.target.position.set(0, 0, 3)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 32, bottom: -32, near: 1, far: 110 })
  sun.shadow.normalBias = .035; sun.shadow.bias = -.00012; sun.shadow.radius = 3
  scene.add(sun, sun.target)

  worldBox('diorama-foundation', [48, .62, 33.8], [0, -.34, 5.6], palette.concrete)
  const groundMaterial = new THREE.MeshStandardMaterial({ name: 'playground-warm-gray', color: '#b2b8aa', roughness: 1 })
  worldBox('playground-surface', [48, .07, 33.8], [0, -.005, 5.6], groundMaterial)
  const backdropMaterial = new THREE.MeshStandardMaterial({ name: 'sage-background', color: '#b6c1b4', roughness: 1 })
  const backdrop = worldBox('matte-background-floor', [600, .1, 600], [0, -.73, 0], backdropMaterial)
  backdrop.castShadow = false
  const building = createDodgeballBuilding({ THREE, palette })
  scene.add(building)
  const players = createDodgeballPlayers({ THREE, palette })
  for (const player of players.children) player.scale.setScalar(1.2)
  scene.add(players)

  const court = new THREE.Group(); court.name = 'chalk-court'; environment.add(court)
  const chalk = new THREE.MeshStandardMaterial({ name: 'chalk-lines', color: '#eeecd9', roughness: 1 })
  // The solid rectangle follows the shared reachable lanes, with the same
  // body clearance on either side. Ball flight has its own larger boundary.
  const courtMinZ=gameRules.defendZMin-.75,courtMaxZ=gameRules.defendZMax+.75
  for (const x of [-10.15, 10.15]) worldBox('end-line', [.085, .022, courtMaxZ-courtMinZ], [x, .041, (courtMinZ+courtMaxZ)/2], chalk, court)
  for (const z of [courtMinZ, courtMaxZ]) worldBox('side-line', [20.38, .022, .085], [0, .041, z], chalk, court)
  // Sparse concrete seams help read the flat ground without image textures.
  const seam = new THREE.MeshStandardMaterial({ name: 'concrete-joints', color: '#aeb2a2', roughness: 1 })
  for (const x of [-20, -16, 16, 20]) worldBox('outer-paving-joint', [.027, .004, 17], [x, .034, 12], seam)
  for (const z of [3, 20]) worldBox('cross-paving-joint', [46, .004, .027], [0, .034, z], seam)
  // Six low planters follow the facade rhythm; planting is static geometry.
  for (const x of [-18.2, -12, -6, 6, 12, 18.2]) {
    worldBox('low-concrete-planter', [3.2, .42, .78], [x, .21, .88], palette.concrete)
    worldBox('planter-soil', [2.95, .035, .6], [x, .434, .88], palette.soil)
    for (let i = 0; i < 4; i++) {
      const shrub = worldBox('block-shrub', [.66, .48 + (i % 2) * .13, .53], [x - 1.05 + i * .7, .68, .88], i % 2 ? palette.leaf : palette.leafLight)
      shrub.rotation.y = i * .17
    }
  }

  // Merge the static paving and planting by material before the first render.
  const staticBuckets = new Map()
  environment.updateMatrixWorld(true)
  environment.traverse(mesh => {
    if (!mesh.isMesh) return
    const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`
    if (!staticBuckets.has(key)) staticBuckets.set(key, { material: mesh.material, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, parts: [] })
    staticBuckets.get(key).parts.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld))
  })
  environment.clear()
  for (const bucket of staticBuckets.values()) {
    const merged = mergeGeometries(bucket.parts, false)
    const mesh = new THREE.Mesh(merged, bucket.material)
    mesh.name = `environment-${bucket.material.name}`; mesh.castShadow = bucket.castShadow; mesh.receiveShadow = bucket.receiveShadow
    environment.add(mesh)
    for (const geometry of bucket.parts) geometry.dispose()
  }
  sharedBox.dispose()


  const ball = new THREE.Group()
  ball.name = 'dodgeball-projectile'; ball.position.set(-.4, 1.5, 11); scene.add(ball)
  const pingpong = new THREE.Mesh(new THREE.SphereGeometry(.21, 20, 12), palette.white)
  pingpong.name = 'visible-ping-pong-ball'; ball.add(pingpong)
  const beanbag = new THREE.Group(); beanbag.name = 'visible-beanbag'; beanbag.visible = false; ball.add(beanbag)
  const bagGeometry = new THREE.BoxGeometry(.30, .20, .30)
  const bagBody = new THREE.Mesh(bagGeometry, palette.red)
  bagBody.name = 'cloth-beanbag-body'; bagBody.castShadow = true; beanbag.add(bagBody)
  const seamGeometry = new THREE.BoxGeometry(1, 1, 1)
  for (const sign of [-1, 1]) {
    const seamPiece = new THREE.Mesh(seamGeometry, palette.cream)
    seamPiece.name = 'beanbag-sewn-edge'
    seamPiece.position.set(sign * .147, .012, 0); seamPiece.scale.set(.012, .012, .29); beanbag.add(seamPiece)
    const endSeam = new THREE.Mesh(seamGeometry, palette.cream)
    endSeam.position.set(0, .012, sign * .147); endSeam.scale.set(.29, .012, .012); beanbag.add(endSeam)
  }

  const trailMaterial = new THREE.MeshBasicMaterial({ name: 'white-short-ball-trail', color: '#fff5df', transparent: true, opacity: .65 })
  const trailGeometry = new THREE.SphereGeometry(1, 12, 8)
  const trails = []
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(trailGeometry, trailMaterial)
    mesh.name = 'ball-motion-trail'; mesh.position.set(-.88 - i * .33, 1.5 + i * .016, 11)
    mesh.scale.set(.18 - i * .03, .075 - i * .012, .075 - i * .012); scene.add(mesh); trails.push(mesh)
  }
  const shadowMaterial = new THREE.MeshBasicMaterial({ name: 'contact-shadows', color: '#48544c', transparent: true, opacity: .16, depthWrite: false })
  const shadowGeometry = new THREE.CircleGeometry(1, 32)
  function groundShadow(x, z, sx, sz, name) {
    const mesh = new THREE.Mesh(shadowGeometry, shadowMaterial)
    mesh.name = name; mesh.rotation.x = -Math.PI / 2; mesh.scale.set(sx, sz, 1); mesh.position.set(x, .047, z); scene.add(mesh)
    return mesh
  }
  const ballShadow = groundShadow(-.4, 11, .26, .17, 'ball-ground-position')
  const playerShadows = [[-12, 11], [12, 11], [-3.5, 9.7], [3.6, 13]]
    .map(([x, z]) => groundShadow(x, z, .85, .47, 'player-contact-shadow'))
  const markerMaterial = new THREE.MeshBasicMaterial({ name: 'controlled-player-gold', color: '#efd180' })
  const marker = new THREE.Mesh(new THREE.ConeGeometry(.23, .42, 4), markerMaterial)
  marker.rotation.z = Math.PI; marker.position.set(12, 4.05, 11); marker.name = 'receiver-marker'; scene.add(marker)
  const ring = new THREE.Mesh(new THREE.RingGeometry(.87, .94, 40), markerMaterial)
  ring.rotation.x = -Math.PI / 2; ring.position.set(12, .055, 11); ring.name = 'receiver-foot-ring'; scene.add(ring)
  const aimIndicator = createDodgeballAimIndicator()
  scene.add(aimIndicator.root)

  // The outer projectile limit is a quiet dashed line, distinct from the solid
  // white defender rectangle. It appears only when the static sample is played.
  const outerBoundary = new THREE.Group(); outerBoundary.name = 'outer-thrower-boundary'
  const outerMaterial = new THREE.MeshStandardMaterial({ name: 'outer-boundary-muted-ochre', color: '#978c65', roughness: 1 })
  const boundaryParts = []
  const boundaryCube = new THREE.BoxGeometry(1, 1, 1)
  function boundaryBox(x, z, w, d) {
    const geometry = boundaryCube.clone()
    geometry.scale(w, .014, d); geometry.translate(x, .042, z); boundaryParts.push(geometry)
  }
  for (const x of [-14, 14]) {
    for (let i = 0; i < 10; i++) boundaryBox(x, 5.20 + i * 1.30, .065, .48)
  }
  for (const z of [4.95, 17.45]) {
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 3; i++) boundaryBox(sign * (10.58 + i * 1.2), z, .57, .065)
    }
    if(z>courtMaxZ+.01)for(let i=-7;i<=7;i++)boundaryBox(i*1.3,z,.57,.065)
  }
  const boundaryMesh = new THREE.Mesh(mergeGeometries(boundaryParts, false), outerMaterial)
  boundaryMesh.receiveShadow = true; outerBoundary.add(boundaryMesh)
  for (const geometry of boundaryParts) geometry.dispose()
  boundaryCube.dispose(); outerBoundary.visible = false; scene.add(outerBoundary)

  const pupilById = new Map(players.children.map((pupil, id) => {
    pupil.userData.playerId = id
    return [id, pupil]
  }))
  const transitionPlayers = new Map([...pupilById.keys()].map(id => [id, {}]))
  const velocityDirection = new THREE.Vector3(), positiveX = new THREE.Vector3(1, 0, 0)
  const catchAnchor = new THREE.Vector3()
  let lastState = null, disposed = false

  function update(state, dt = 0, presentation = {}) {
    if (disposed || !state) return
    lastState = state
    aimIndicator.update(state, presentation)
    outerBoundary.visible = true
    trailMaterial.depthWrite = false
    const elapsed = Number(state.elapsed) || 0
    for (const player of state.players || []) {
      const pupil = pupilById.get(player.id)
      if (!pupil) continue
      let displayedPlayer = player
      if (state.phase === 'switching') {
        // Only presentation interpolates during the non-interactive handover;
        // the simulation remains the owner of role changes and final stations.
        const t = THREE.MathUtils.clamp((state.phaseElapsed || 0) / (state.switchSeconds || .9), 0, 1)
        const eased = t * t * (3 - 2 * t)
        const nextAttack = player.team !== state.attackTeam
        const targetX = nextAttack ? (player.slot ? 12 : -12) : (player.slot ? 3.6 : -3.5)
        const targetZ = nextAttack ? 11 : (player.slot ? 13 : 9.7)
        displayedPlayer = Object.assign(transitionPlayers.get(player.id), player, {
          x: THREE.MathUtils.lerp(player.x, targetX, eased),
          z: THREE.MathUtils.lerp(player.z, targetZ, eased), y: 0,
          vx: (targetX - player.x) * Math.sin(t * Math.PI),
          vz: (targetZ - player.z) * Math.sin(t * Math.PI),
          yaw: Math.atan2(targetX - player.x, targetZ - player.z),
          alive: true, action: 'switch', actionTime: state.phaseElapsed || 0,
        })
      }
      pupil.userData.applyState(displayedPlayer, state, dt)
      const shadow = playerShadows[player.id]
      shadow.visible = pupil.visible
      shadow.position.set(displayedPlayer.x, .047, displayedPlayer.z)
      const heightRatio = Math.min(1, Math.max(0, displayedPlayer.y || 0) / 1.6)
      shadow.scale.set(.85 + heightRatio * .14, .47 + heightRatio * .07, 1)
    }
    const projectile = state.ball
    const bagMode = state.ballMode === 'beanbag'
    pingpong.visible = !bagMode; beanbag.visible = bagMode
    if (projectile) {
      ball.position.set(projectile.x, projectile.y, projectile.z)
      const confirmation = state.phase === 'returning' ? state.catchDisplay : null
      const catcher = confirmation && pupilById.get(confirmation.playerId)
      if (catcher?.userData.getBallAnchor(catchAnchor, true)) {
        // This projectile is already dead: show it gathered between the palms,
        // held clearly, then eased out with the existing automatic retrieval.
        // The live-flight/collision position is never altered for animation.
        const time = state.phaseElapsed || 0
        const t = THREE.MathUtils.clamp((time - confirmation.duration) / confirmation.returnSeconds, 0, 1)
        const release = t * t * (3 - 2 * t)
        const gather = THREE.MathUtils.clamp(time / .06, 0, 1)
        ball.position.lerp(catchAnchor, (1 - release) * gather)
      }
      // The simulation's visible collision radius is the displayed radius.
      ball.scale.setScalar(Math.max(.03, projectile.radius || .21) / .21)
      // active means a live attacking ball in simulation. Held and dead-ball
      // retrieval phases still show their projectile, so visibility is a phase
      // choice rather than a collision-validity check.
      ball.visible = state.phase !== 'switching' && state.phase !== 'finished'
      if (bagMode) {
        beanbag.rotation.set(
          state.phase === 'flight' ? elapsed * 7 : -.18,
          state.phase === 'flight' ? elapsed * 4 : .25,
          state.phase === 'flight' ? elapsed * 2 : .16,
        )
      }
      const speed = Math.hypot(projectile.vx || 0, projectile.vy || 0, projectile.vz || 0)
      velocityDirection.set(projectile.vx || 0, projectile.vy || 0, projectile.vz || 0)
      if (speed > .001) velocityDirection.multiplyScalar(1 / speed)
      const trailVisible = ball.visible && ['flight', 'returning'].includes(state.phase) && speed > 1
      const spacing = THREE.MathUtils.clamp(speed * .018, .11, .33)
      for (let i = 0; i < trails.length; i++) {
        const trail = trails[i]; trail.visible = trailVisible
        if (!trailVisible) continue
        trail.position.copy(ball.position).addScaledVector(velocityDirection, -(projectile.radius || .21) - (i + 1) * spacing)
        trail.quaternion.setFromUnitVectors(positiveX, velocityDirection)
        const width = (.075 - i * .012) * (bagMode ? 1.10 : 1)
        trail.scale.set(.18 - i * .03, width, width)
      }
      ballShadow.visible = ball.visible
      ballShadow.position.set(ball.position.x, .047, ball.position.z)
      const shadowSize = .23 + Math.min(2.5, Math.max(0, ball.position.y)) * .02
      ballShadow.scale.set(shadowSize, shadowSize * .65, 1)
    }
    const controlled = pupilById.get(state.controlledId)
    const showControl = Boolean(controlled?.visible) && state.phase !== 'finished'
    marker.visible = showControl; ring.visible = showControl
    if (showControl) {
      marker.position.set(controlled.position.x, controlled.position.y + 4.05 + Math.sin(elapsed * 4) * .045, controlled.position.z)
      ring.position.set(controlled.position.x, .055, controlled.position.z)
    }
  }

  function snapshot() {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true)
    const materials = new Set(), geometries = new Set()
    let triangles = 0, drawableMeshes = 0
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry)
      if (object.material) for (const material of [object.material].flat()) materials.add(material)
      if (!object.isMesh) return
      drawableMeshes++
      const faces = (object.geometry.index?.count || object.geometry.attributes.position.count) / 3
      triangles += faces * (object.isInstancedMesh ? object.count : 1)
    })
    return {
      disposed, phase: lastState?.phase || 'sample', ballMode: lastState?.ballMode || 'pingpong',
      modelPolicy: 'complete-single-geometry-set-no-lod', sceneMaterials: materials.size,
      sceneGeometries: geometries.size, texturedWorldMaterials: [...materials].filter(material => material.map).length,
      drawableMeshes, triangles, outerBoundary: { visible: outerBoundary.visible, x: [-14, 14], z: [4.95, 17.45] },
      playerLanes: { z: [gameRules.defendZMin, gameRules.defendZMax], chalkZ: [courtMinZ,courtMaxZ] },
      camera: { projection: 'perspective', position: camera.position.toArray(), target: cameraTarget.toArray(), verticalFov: camera.fov },
      buildingGeometry: building.userData,
      players: [...pupilById].map(([id, pupil]) => {
        const player = lastState?.players?.find(candidate => candidate.id === id)
        const joints = pupil.userData.joints
        const at = name => joints[name].getWorldPosition(new THREE.Vector3()).toArray()
        return {
          id, name: pupil.name, visible: pupil.visible, position: pupil.position.toArray(), yaw: pupil.rotation.y,
          primitiveCount: pupil.userData.primitiveCount, materialBatches: pupil.userData.materialBatches,
          pose: {
            action: player?.action || 'sample', actionTime: player?.actionTime || 0,
            spine: joints.spine.rotation.toArray().slice(0, 3),
            leftHand: at('0-hand'), rightHand: at('1-hand'), leftFoot: at('0-foot'), rightFoot: at('1-foot'),
            ballAnchor: pupil.userData.getBallAnchor?.(new THREE.Vector3(), true)?.toArray() || null,
          },
        }
      }),
      ball: { visible: ball.visible, position: ball.position.toArray(), mode: beanbag.visible ? 'beanbag' : 'pingpong' },
      aimIndicator: aimIndicator.snapshot(),
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    aimIndicator.update({ phase: 'finished' })
    const geometries = new Set(), materials = new Set(Object.values(palette)), textures = new Set()
    scene.traverse(object => {
      if (object.isInstancedMesh) object.dispose()
      if (object.geometry) geometries.add(object.geometry)
      if (object.material) for (const material of [object.material].flat()) materials.add(material)
      if (object.isLight && object.shadow) object.shadow.dispose()
    })
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
    for (const texture of textures) texture.dispose()
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
    scene.clear()
  }

  return { scene, camera, cameraTarget, players, building, ball, update, snapshot, dispose }
}

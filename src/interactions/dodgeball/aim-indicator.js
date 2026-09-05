import * as THREE from 'three'

export const SPOTLIGHT_STYLE = Object.freeze({
  length: 3.4, endWidth: 1.8, opacity: .48,
  nearFadeEnd: .04, endFadeStart: .7, edgeFadeStart: .18, farStrength: .7,
})

const smoothstep = (low, high, value) => {
  const t = THREE.MathUtils.clamp((value - low) / (high - low), 0, 1)
  return t * t * (3 - 2 * t)
}

// A deterministic CPU counterpart of the fragment alpha, useful for inspection
// without a GPU. normalizedSide=0 is the beam centre; +/-1 is either soft edge.
export function sampleSpotlightAlpha(progress, normalizedSide) {
  const p = SPOTLIGHT_STYLE, t = THREE.MathUtils.clamp(progress, 0, 1)
  return p.opacity * smoothstep(0, p.nearFadeEnd, t) *
    (1 - smoothstep(p.endFadeStart, 1, t)) *
    (1 - smoothstep(p.edgeFadeStart, 1, Math.abs(normalizedSide))) *
    (1 + (p.farStrength - 1) * t)
}

/** Procedural translucent spotlight cue, never a light or a ballistic path.
 * Its one geometry/material are owned and disposed by the shared scene.
 */
export function createDodgeballAimIndicator() {
  const root = new THREE.Group()
  root.name = 'held-ball-aim-indicator'; root.visible = false
  const p = SPOTLIGHT_STYLE, length = p.length
  const axis = new THREE.Vector3(1, 0, 0), direction = new THREE.Vector3(1, 0, 0)
  const endpoint = new THREE.Vector3(), target = new THREE.Vector2()
  let ownerId = null

  // One triangle expands from the release point to a 1.8m-wide beam end. The
  // shader turns only the width towards the camera, preserving the exact 3D
  // centreline even for near/far aiming directions in the fixed game camera.
  const geometry = new THREE.BufferGeometry()
  geometry.name = 'aim-spotlight-fan-geometry'
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, length, -p.endWidth / 2, 0, length, p.endWidth / 2, 0,
  ], 3))
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  const material = new THREE.ShaderMaterial({
    name: 'aim-spotlight-procedural-alpha',
    transparent: true, opacity: p.opacity, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    uniforms: {
      uLength: { value: length }, uHalfWidth: { value: p.endWidth / 2 },
      uOpacity: { value: p.opacity }, uNearFadeEnd: { value: p.nearFadeEnd },
      uEndFadeStart: { value: p.endFadeStart }, uEdgeFadeStart: { value: p.edgeFadeStart },
      uFarStrength: { value: p.farStrength },
      uSourceColor: { value: new THREE.Color('#7bd9f2') },
      uEndColor: { value: new THREE.Color('#279fc8') },
    },
    vertexShader: `
      uniform float uLength;
      uniform float uHalfWidth;
      varying vec2 vBeam;
      void main() {
        vec4 source = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 heading = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vec3 across = cross(heading, normalize(-source.xyz));
        float acrossLength = length(across);
        across = acrossLength > 0.0001 ? across / acrossLength : vec3(0.0, 1.0, 0.0);
        vec4 center = modelViewMatrix * vec4(position.x, 0.0, 0.0, 1.0);
        center.xyz += across * position.y;
        vBeam = vec2(position.x / uLength, position.y / uHalfWidth);
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uNearFadeEnd;
      uniform float uEndFadeStart;
      uniform float uEdgeFadeStart;
      uniform float uFarStrength;
      uniform vec3 uSourceColor;
      uniform vec3 uEndColor;
      varying vec2 vBeam;
      void main() {
        float along = clamp(vBeam.x, 0.0, 1.0);
        float normalizedSide = abs(vBeam.y) / max(along, 0.0001);
        float sourceFade = smoothstep(0.0, uNearFadeEnd, along);
        float endFade = 1.0 - smoothstep(uEndFadeStart, 1.0, along);
        float edgeFade = 1.0 - smoothstep(uEdgeFadeStart, 1.0, normalizedSide);
        float alpha = uOpacity * sourceFade * endFade * edgeFade * mix(1.0, uFarStrength, along);
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(mix(uSourceColor, uEndColor, along), alpha);
        #include <colorspace_fragment>
      }
    `,
  })
  const beam = new THREE.Mesh(geometry, material)
  beam.name = 'aim-spotlight-beam'; beam.castShadow = false; beam.receiveShadow = false
  beam.frustumCulled = false; beam.renderOrder = 2
  root.add(beam)

  function update(state, { paused = false } = {}) {
    const player = state.players?.find(value => value.id === state.controlledId)
    const aim = state.aim, origin = aim?.origin, heading = aim?.direction
    const held = state.phase === 'held' || state.phase === 'charging'
    const validAim = origin && heading && Number.isFinite(origin.x) && Number.isFinite(origin.y) &&
      Number.isFinite(origin.z) && Number.isFinite(heading.x) && Number.isFinite(heading.z) &&
      Math.hypot(heading.x, heading.z) > 1e-8
    root.visible = Boolean(!paused && !state.paused && held && player?.alive &&
      state.attackTeam === 'blue' && player.team === 'blue' && player.role === 'attack' &&
      state.ball?.ownerId === player.id && aim?.ownerId === player.id && validAim)
    ownerId = root.visible ? player.id : null
    if (!root.visible) return
    root.position.set(origin.x, origin.y, origin.z)
    direction.set(heading.x, 0, heading.z).normalize()
    root.quaternion.setFromUnitVectors(axis, direction)
    endpoint.copy(root.position).addScaledVector(direction, length)
    target.set(aim.target?.x ?? origin.x, aim.target?.z ?? origin.z)
  }

  function snapshot() {
    return {
      visible: root.visible, ownerId, length, endWidth: p.endWidth,
      origin: root.position.toArray(), direction: direction.toArray(), end: endpoint.toArray(),
      target: [target.x, target.y], geometryShared: false, materialBatches: 1,
      style: 'spotlight', transparent: true, opacity: p.opacity, arrow: false, crosshair: false,
      alphaSamples: { center: sampleSpotlightAlpha(.4, 0), edge: sampleSpotlightAlpha(.4, 1), end: sampleSpotlightAlpha(1, 0) },
    }
  }

  return { root, update, snapshot }
}

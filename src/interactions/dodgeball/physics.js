// Continuous collision helpers. Coordinates and times are plain numbers so
// the rules can be tested independently of the renderer and browser clock.
const EPSILON = 1e-9

/** Integral of exp(-drag*t). One shared factor preserves horizontal heading. */
export function dragDistanceFactor(time, drag) {
  return drag > EPSILON ? -Math.expm1(-drag * time) / drag : time
}

/** Inverse horizontal displacement; null means behind us or beyond drag range. */
export function dragTravelTime(distance, velocity, drag) {
  if (Math.abs(distance) <= EPSILON) return 0
  if (Math.abs(velocity) <= EPSILON || distance * velocity < 0) return null
  const scaledTime = distance / velocity
  if (drag <= EPSILON) return scaledTime
  const fraction = drag * scaledTime
  return fraction >= 1 ? null : -Math.log1p(-fraction) / drag
}

/** Receiver/AI prediction uses the same drag, gravity and bounce losses as play. */
export function predictBallAtX(ball, x, mode, { floor = ball.radius, minimumBounceHeight = .005, horizon = 2 } = {}) {
  if (!ball.active) return null
  const point = { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz }
  let elapsed = 0, bounces = 0
  while (elapsed < horizon && bounces < 16) {
    const remaining = horizon - elapsed, crossing = dragTravelTime(x - point.x, point.vx, mode.drag)
    const ground = groundContactTime(point.y, point.vy, mode.gravity, floor, remaining)
    if (crossing != null && crossing <= remaining && (ground == null || crossing <= ground)) {
      return { time: elapsed + crossing, z: point.z + point.vz * dragDistanceFactor(crossing, mode.drag),
        y: point.y + point.vy * crossing - mode.gravity * crossing * crossing / 2, bounces }
    }
    if (ground == null) return null
    const factor = dragDistanceFactor(ground, mode.drag), retention = Math.exp(-mode.drag * ground) * mode.tangentRetention
    point.x += point.vx * factor; point.z += point.vz * factor; point.y = floor + 1e-7
    point.vx *= retention; point.vz *= retention
    point.vy = Math.abs(point.vy - mode.gravity * ground) * mode.restitution
    if (point.vy * point.vy / (2 * mode.gravity) <= minimumBounceHeight) return null
    elapsed += ground; bounces++
  }
  return null
}

function sphereTime(origin, delta, cy, radius) {
  const oy = origin.y - cy
  const c = origin.x * origin.x + oy * oy + origin.z * origin.z - radius * radius
  if (c <= 0) return 0
  const a = delta.x * delta.x + delta.y * delta.y + delta.z * delta.z
  if (a <= EPSILON) return null
  const b = 2 * (origin.x * delta.x + oy * delta.y + origin.z * delta.z)
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return null
  const t = (-b - Math.sqrt(discriminant)) / (2 * a)
  return t >= -EPSILON && t <= 1 + EPSILON ? Math.max(0, Math.min(1, t)) : null
}

/** First normalized time of contact with an upright capsule. The start/end
 * points are already relative to the moving character's start/end position. */
export function sweepCapsule(start, end, low, high, radius) {
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z }
  const closestY = Math.max(low, Math.min(high, start.y))
  if (start.x * start.x + (start.y - closestY) ** 2 + start.z * start.z <= radius * radius) return 0
  let first = null
  const consider = t => { if (t != null && (first == null || t < first)) first = t }
  const a = delta.x * delta.x + delta.z * delta.z
  const b = 2 * (start.x * delta.x + start.z * delta.z)
  const c = start.x * start.x + start.z * start.z - radius * radius
  const discriminant = b * b - 4 * a * c
  if (a > EPSILON && discriminant >= 0) {
    const root = Math.sqrt(discriminant)
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      const y = start.y + delta.y * t
      if (t >= -EPSILON && t <= 1 + EPSILON && y >= low && y <= high) consider(Math.max(0, Math.min(1, t)))
    }
  }
  consider(sphereTime(start, delta, low, radius))
  consider(sphereTime(start, delta, high, radius))
  return first
}

/** Exact ground time under constant gravity, capped to this substep. */
export function groundContactTime(y, vy, gravity, floor, duration) {
  if (y <= floor + EPSILON && vy <= 0) return 0
  const discriminant = vy * vy + 2 * gravity * (y - floor)
  if (discriminant < 0) return null
  const time = (vy + Math.sqrt(discriminant)) / gravity
  return time >= -EPSILON && time <= duration + EPSILON ? Math.max(0, Math.min(duration, time)) : null
}

/** Center-crossing boundary, not a player-area boundary. */
export function boundaryTime(start, end, bounds) {
  if (start.x < bounds.minX || start.x > bounds.maxX || start.z < bounds.minZ || start.z > bounds.maxZ) return 0
  let result = null
  for (const [axis, low, high] of [['x', bounds.minX, bounds.maxX], ['z', bounds.minZ, bounds.maxZ]]) {
    const delta = end[axis] - start[axis]
    let t = null
    if (end[axis] < low) t = (low - start[axis]) / delta
    else if (end[axis] > high) t = (high - start[axis]) / delta
    if (t != null && (result == null || t < result)) result = Math.max(0, Math.min(1, t))
  }
  return result
}

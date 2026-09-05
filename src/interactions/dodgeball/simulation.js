import { boundaryTime, dragDistanceFactor, dragTravelTime, groundContactTime, predictBallAtX, sweepCapsule } from './physics.js'
import { DODGEBALL_MOTION } from './motion.js'

// Art-scale working values, not historical measurements or real ball masses.
export const DODGEBALL_DEFAULTS = Object.freeze({
  fixedStep: 1 / 120, maxSubsteps: 8,
  matchSeconds: 180, readySeconds: .8, returnSeconds: .65, switchSeconds: .9,
  holdSeconds: 5, chargeSeconds: .65, aiServeSeconds: 3,
  attackerSpeed: 5.4, defenderSpeed: 5.8, acceleration: 28, deceleration: 34,
  playerGravity: 16, jumpPeak: 1.6, playerRadius: .48, playerHeight: 3.2,
  catchRadius: .72, catchMinHeight: .35, catchMaxHeight: 3.1, catchCooldown: .45,
  endpointX: 12, attackZMin: 5.7, attackZMax: 14,
  defendXMin: -9.5, defendXMax: 9.5, defendZMin: 5.7, defendZMax: 14,
  ballBounds: Object.freeze({ minX: -14, maxX: 14, minZ: 4.95, maxZ: 17.45 }),
  groundY: 0, releaseHeight: 2.05, releaseForward: .72,
  minimumBounceHeight: .005,
  aiEnabled: true, aiDecisionSeconds: .1, aiReactionMin: .2, aiReactionMax: .32,
  aiThrowDelayMin: .45, aiThrowDelayMax: .75,
  aiPatrolSpeed: .55, aiPatrolSeconds: 2.3, aiDodgeSpeed: .78, aiDodgeDistance: 1.7, aiThreatLookahead: .6,
  modes: Object.freeze({
    pingpong: Object.freeze({ radius: .21, minSpeed: 30, maxSpeed: 36, upSpeed: 2.8, gravity: 9.8, drag: .5, restitution: .72, tangentRetention: .9, catchWindow: .24 }),
    beanbag: Object.freeze({ radius: .24, minSpeed: 24, maxSpeed: 29, upSpeed: 4.1, gravity: 9.8, drag: .3, restitution: .18, tangentRetention: .55, catchWindow: .3 }),
  }),
})

const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const finite = value => typeof value === 'number' && Number.isFinite(value)
const otherTeam = team => team === 'blue' ? 'red' : 'blue'
const clone = value => structuredClone(value)
const DEAD_PHASES = new Set(['selection', 'ready', 'switching', 'finished'])

function seedNumber(seed) {
  if (Number.isFinite(seed)) return (seed >>> 0) || 1
  let value = 2166136261
  for (const char of String(seed)) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  return value >>> 0 || 1
}

export function createDodgeballSimulation({ config = {}, onEvent = () => {}, seed = 'hot-blooded-dodge-v1' } = {}) {
  const rules = { ...DODGEBALL_DEFAULTS, ...config }
  // Straight throws require every legal defender depth to be reachable by the
  // end-line attackers. Preserve narrower custom bounds; discard disjoint ones.
  rules.defendZMin = Math.max(rules.attackZMin, rules.defendZMin)
  rules.defendZMax = Math.min(rules.attackZMax, rules.defendZMax)
  if (rules.defendZMin > rules.defendZMax) {
    rules.defendZMin = rules.attackZMin; rules.defendZMax = rules.attackZMax
  }
  const aiServeSeconds = clamp(finite(rules.aiServeSeconds) ? rules.aiServeSeconds : 3, 0, rules.holdSeconds)
  const state = {
    phase: 'selection', ballMode: 'pingpong', elapsed: 0, timeRemaining: rules.matchSeconds,
    attackTeam: 'blue', controlledId: 0, players: [],
    ball: { x: 0, y: rules.releaseHeight, z: 11, vx: 0, vy: 0, vz: 0, radius: rules.modes.pingpong.radius, active: false, ownerId: null, throwerId: null, receiverId: null, attackId: 0, bounces: 0 },
    scores: { blue: 0, red: 0 }, charge: 0, charging: false, holdElapsed: 0,
    aiServeCountdown: 0, aiServeRemaining: 0, catchDisplay: null,
    phaseElapsed: 0, round: 0, winner: null, feedback: 'selection', lastAttackResult: null,
    aim: { origin: { x: 0, y: rules.releaseHeight, z: 11 }, direction: { x: 1, z: 0 }, target: { x: rules.endpointX, z: 11 }, ownerId: null },
  }
  const input = { x: 0, z: 0 }
  let accumulator = 0, rng = seedNumber(seed), sequence = 0, chargeTime = 0
  let nextOwnerId = null, returnFrom = null, eventTime = null
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296 }
  const modeRules = () => rules.modes[state.ballMode]
  const emit = (type, detail = {}) => onEvent({ type, team: state.attackTeam, ballMode: state.ballMode, scores: { ...state.scores }, elapsed: eventTime ?? state.elapsed, ...detail })
  const setAction = (player, action, duration = 0) => {
    if (player.action !== action || duration) player.actionTime = 0
    player.action = action; player.actionDuration = duration
  }
  const teamPlayers = team => state.players.filter(player => player.team === team)
  const controlled = () => state.players.find(player => player.id === state.controlledId)
  const playerById = id => state.players.find(player => player.id === id)
  const counterpart = id => playerById(id)?.slot === 0 ? id + 1 : id - 1
  const endpoint = player => player.slot === 0 ? -rules.endpointX : rules.endpointX
  const isAi = player => rules.aiEnabled && player.alive && player.id !== state.controlledId

  function resetPlayers() {
    state.players = Array.from({ length: 4 }, (_, id) => {
      const team = id < 2 ? 'blue' : 'red', slot = id % 2, role = team === state.attackTeam ? 'attack' : 'defend'
      return {
        id, team, slot, role, alive: true,
        x: role === 'attack' ? (slot ? rules.endpointX : -rules.endpointX) : (slot ? 3.6 : -3.5),
        y: 0, z: role === 'attack' ? clamp(11, rules.attackZMin, rules.attackZMax) : clamp(slot ? 13 : 9.7, rules.defendZMin, rules.defendZMax), vx: 0, vy: 0, vz: 0,
        yaw: role === 'attack' ? (slot ? -Math.PI / 2 : Math.PI / 2) : 0,
        action: 'idle', actionTime: 0, actionDuration: 0,
        catchUntil: 0, catchCooldownUntil: 0, aiDecisionAt: 0, aiReactionUntil: 0,
        aiMoveX: 0, aiMoveZ: 0, aiTryCatch: false, aiJump: false,
        aiPatrolIndex: 0, aiPatrolX: null, aiPatrolZ: null, aiPatrolUntil: 0, aiRecover: false,
        aiDodgeAttackId: null, aiThreatUntil: 0, aiCatchAttempted: false, aiDodgeBias: slot ? 1 : -1,
      }
    })
    state.controlledId = 0
  }

  function clearInput() {
    input.x = 0; input.z = 0
    state.charging = false; state.charge = 0; chargeTime = 0
    const player = controlled()
    if (player) {
      player.catchUntil = 0; player.vx = 0; player.vz = 0
      // Pausing clears buttons, not an already completed physical action.
      const committed = ['caught', 'throw'].includes(player.action) && player.actionTime < player.actionDuration
      if (player.alive && player.y === 0 && !committed) setAction(player, 'idle')
    }
    syncAim()
  }

  function syncAim() {
    const owner = playerById(state.ball.ownerId), aim = state.aim
    aim.ownerId = owner?.id ?? null
    Object.assign(aim.origin, { x: state.ball.x, y: state.ball.y, z: state.ball.z })
    if (!owner) return
    aim.target.x = -endpoint(owner); aim.target.z = owner.z
    aim.direction.x = owner.slot ? -1 : 1; aim.direction.z = 0
  }

  function placeHeldBall() {
    const owner = playerById(state.ball.ownerId)
    if (!owner) return
    const sign = owner.slot === 0 ? 1 : -1
    Object.assign(state.ball, { x: owner.x + sign * rules.releaseForward, y: rules.groundY + owner.y + rules.releaseHeight, z: owner.z, vx: 0, vy: 0, vz: 0, active: false })
    syncAim()
  }

  function syncServeCountdown() {
    state.aiServeRemaining = state.phase === 'held' && state.attackTeam === 'red' ? Math.max(0, aiServeSeconds - state.holdElapsed) : 0
    // Fixed-step roundoff at a whole-second boundary must not show the old digit.
    state.aiServeCountdown = Math.max(0, Math.ceil(state.aiServeRemaining - 1e-9))
  }

  function giveBall(id) {
    const owner = playerById(id)
    state.phase = 'held'; state.phaseElapsed = 0; state.holdElapsed = 0; state.charge = 0; state.charging = false; chargeTime = 0
    state.ball.ownerId = id; state.ball.active = false; state.catchDisplay = null
    owner.aiThrowAfter = rules.aiThrowDelayMin + random() * (rules.aiThrowDelayMax - rules.aiThrowDelayMin)
    if (state.attackTeam === 'red') owner.aiThrowAfter = aiServeSeconds
    const targets = teamPlayers(otherTeam(owner.team)).filter(target => target.alive)
    owner.aiAlignTargetId = targets[owner.slot % Math.max(1, targets.length)]?.id ?? null
    owner.aiThrowRatio = .5 + random() * .4
    owner.aiDecisionAt = state.elapsed
    if (state.attackTeam === 'blue') state.controlledId = id
    else if (!controlled()?.alive) state.controlledId = teamPlayers('blue').find(player => player.alive)?.id ?? 0
    setAction(owner, 'idle'); placeHeldBall(); syncServeCountdown()
  }

  function select(ballMode = 'pingpong') {
    if (!Object.hasOwn(rules.modes, ballMode)) return false
    rng = seedNumber(seed); sequence = 0; accumulator = 0; chargeTime = 0; eventTime = null
    nextOwnerId = null; returnFrom = null
    Object.assign(state, { phase: 'selection', ballMode, attackTeam: 'blue', elapsed: 0, timeRemaining: rules.matchSeconds,
      scores: { blue: 0, red: 0 }, phaseElapsed: 0, round: 0, winner: null, feedback: 'selection', lastAttackResult: null,
      holdElapsed: 0, charge: 0, charging: false, aiServeCountdown: 0, aiServeRemaining: 0, catchDisplay: null })
    resetPlayers(); clearInput()
    Object.assign(state.ball, { x: -.4, y: 1.5, z: 11, vx: 0, vy: 0, vz: 0, active: false, ownerId: null,
      throwerId: null, receiverId: null, attackId: 0, bounces: 0, radius: modeRules().radius })
    syncAim()
    return true
  }

  function start(ballMode = 'pingpong', attackTeam = 'blue') {
    select(ballMode)
    rng = seedNumber(seed); sequence = 0; accumulator = 0; eventTime = null
    Object.assign(state, { phase: 'ready', attackTeam: attackTeam === 'red' ? 'red' : 'blue', elapsed: 0, timeRemaining: rules.matchSeconds, scores: { blue: 0, red: 0 }, phaseElapsed: 0, round: 1, winner: null, feedback: 'ready', lastAttackResult: null, holdElapsed: 0, charge: 0, charging: false })
    resetPlayers(); clearInput()
    Object.assign(state.ball, { ownerId: state.attackTeam === 'blue' ? 0 : 2, throwerId: null, receiverId: null, attackId: 0, bounces: 0, radius: modeRules().radius, active: false })
    placeHeldBall(); emit('dodgeball-start', { attackTeam: state.attackTeam })
    return snapshot()
  }

  function setMove(x, z) {
    if (!finite(x) || !finite(z)) return false
    // End-line attackers cannot move in X. Filter it before normalization so
    // pressing an unavailable horizontal direction cannot slow depth movement.
    if (controlled()?.role === 'attack') x = 0
    const magnitude = Math.max(1, Math.hypot(x, z))
    input.x = x / magnitude; input.z = z / magnitude
    return true
  }

  function beginCharge() {
    if (state.phase !== 'held' || state.ball.ownerId !== state.controlledId || state.charging) return false
    state.charging = true; chargeTime = 0; state.charge = 0; setAction(controlled(), 'charge')
    return true
  }

  function throwBall(owner, ratio, automatic = false) {
    if (state.phase !== 'held' || state.ball.ownerId !== owner.id) return false
    const ball = state.ball, mode = modeRules(), sign = owner.slot === 0 ? 1 : -1
    placeHeldBall()
    // Every throw goes straight across the court from the current hand Z.
    // Movement during charge changes the release line, never the heading.
    const speed = mode.minSpeed + (mode.maxSpeed - mode.minSpeed) * clamp(ratio, 0, 1)
    Object.assign(ball, { vx: sign * speed, vz: 0, vy: mode.upSpeed + owner.vy, active: true, ownerId: null, throwerId: owner.id, receiverId: counterpart(owner.id), attackId: ++sequence, bounces: 0 })
    state.aim.ownerId = null
    state.phase = 'flight'; state.phaseElapsed = 0; state.charging = false; state.charge = 0; chargeTime = 0
    syncServeCountdown()
    state.feedback = 'throw'; state.lastAttackResult = null; state.catchDisplay = null
    owner.yaw = sign * Math.PI / 2; setAction(owner, 'throw', DODGEBALL_MOTION.throwSeconds)
    if (state.attackTeam === 'blue') state.controlledId = ball.receiverId
    input.x = 0; input.z = 0
    for (const player of state.players) {
      player.aiReactionUntil = state.elapsed + rules.aiReactionMin + random() * (rules.aiReactionMax - rules.aiReactionMin)
      player.aiDecisionAt = state.elapsed
      player.aiDodgeAttackId = null; player.aiThreatUntil = 0; player.aiCatchAttempted = false
      player.aiDodgeBias = random() < .5 ? -1 : 1
      const teammateOut = teamPlayers(player.team).some(candidate => !candidate.alive)
      player.aiTryCatch = random() < (teammateOut ? .38 : .18)
      player.aiJump = random() < .24
    }
    emit('dodgeball-throw', { playerId: owner.id, attackId: ball.attackId, ratio: clamp(ratio, 0, 1), automatic })
    return true
  }

  function releaseCharge() {
    if (!state.charging || state.phase !== 'held' || state.ball.ownerId !== state.controlledId) return false
    const owner = controlled()
    return throwBall(owner, state.charge)
  }

  function performJump(player) {
    if (!player?.alive || DEAD_PHASES.has(state.phase) || isConfirmingCatch(player) || player.y > 1e-6 || player.vy > 0) return false
    player.vy = Math.sqrt(2 * rules.playerGravity * rules.jumpPeak); setAction(player, 'jump')
    return true
  }
  const jump = () => performJump(controlled())

  function performCatch(player) {
    if (!player?.alive || player.role !== 'defend' || state.phase !== 'flight' || player.catchCooldownUntil > state.elapsed) return false
    player.catchUntil = state.elapsed + modeRules().catchWindow
    player.catchCooldownUntil = state.elapsed + rules.catchCooldown
    setAction(player, 'catch', modeRules().catchWindow)
    return true
  }
  const catchBall = () => performCatch(controlled())

  function finishMatch() {
    state.phase = 'finished'; state.phaseElapsed = 0; state.timeRemaining = 0; state.elapsed = rules.matchSeconds
    state.winner = state.scores.blue === state.scores.red ? 'draw' : state.scores.blue > state.scores.red ? 'blue' : 'red'
    state.ball.active = false; state.ball.ownerId = null; state.ball.vx = state.ball.vy = state.ball.vz = 0
    state.catchDisplay = null
    clearInput(); state.feedback = 'time-up'
    syncServeCountdown()
    for (const player of state.players) { player.vx = player.vz = player.vy = 0; player.catchUntil = 0 }
    emit('dodgeball-finish', { winner: state.winner })
  }

  function finishAttack(reason, player = null) {
    if (state.phase !== 'flight' || !state.ball.active) return false
    const ball = state.ball, attacking = state.attackTeam
    state.lastAttackResult = { reason, team: player?.team ?? attacking, playerId: player?.id ?? null, attackId: ball.attackId }
    state.feedback = reason; ball.active = false; ball.vx = ball.vy = ball.vz = 0; ball.ownerId = null; state.aim.ownerId = null
    state.charging = false; state.charge = 0; state.phaseElapsed = 0; state.catchDisplay = null
    if (reason === 'hit') {
      player.alive = false; player.vx = player.vz = player.vy = 0; player.catchUntil = 0; setAction(player, 'out')
      state.scores[attacking] += 1
      emit('dodgeball-hit', { playerId: player.id, team: attacking, eliminatedTeam: player.team, attackId: ball.attackId, points: 1 })
      if (player.id === state.controlledId) state.controlledId = teamPlayers('blue').find(candidate => candidate.alive)?.id ?? player.id
      if (teamPlayers(player.team).every(candidate => !candidate.alive)) {
        state.scores[attacking] += 2; state.phase = 'switching'; state.feedback = 'clear'
        for (const candidate of state.players) if (candidate.alive) setAction(candidate, 'switch')
        emit('dodgeball-clear', { team: attacking, attackId: ball.attackId, points: 2 })
        return true
      }
    } else if (reason === 'catch') {
      const defending = player.role === 'defend'
      let revivedId = null
      if (defending) {
        state.scores[player.team] += 1
        const out = teamPlayers(player.team).find(candidate => !candidate.alive)
        if (out) {
          const candidates = [{ x: -3.5, z: clamp(9.7, rules.defendZMin, rules.defendZMax) }, { x: 3.6, z: clamp(13, rules.defendZMin, rules.defendZMax) }]
          const point = candidates.sort((a, b) => Math.hypot(b.x - player.x, b.z - player.z) - Math.hypot(a.x - player.x, a.z - player.z))[0]
          Object.assign(out, { alive: true, x: point.x, y: 0, z: point.z, vx: 0, vy: 0, vz: 0, catchUntil: 0, aiMoveX: 0, aiMoveZ: 0 })
          setAction(out, 'idle'); revivedId = out.id
        }
      }
      // Successful reception is visibly different from merely trying to catch.
      // Stop horizontal skating, but preserve gravity for an airborne catch.
      player.vx = player.vz = 0
      setAction(player, 'caught', DODGEBALL_MOTION.catchSeconds)
      state.catchDisplay = { playerId: player.id, duration: DODGEBALL_MOTION.catchSeconds, returnSeconds: rules.returnSeconds }
      emit('dodgeball-catch', { team: player.team, playerId: player.id, defensive: defending, revivedId, attackId: ball.attackId, points: defending ? 1 : 0 })
    }
    state.phase = 'returning'; nextOwnerId = ball.receiverId ?? counterpart(ball.throwerId)
    returnFrom = { x: ball.x, y: ball.y, z: ball.z, catchY: player?.y ?? 0 }
    for (const candidate of state.players) {
      candidate.catchUntil = 0
      if (candidate.role === 'defend') { candidate.aiRecover = true; candidate.aiThreatUntil = 0; candidate.aiDecisionAt = state.elapsed }
    }
    return true
  }

  function isConfirmingCatch(player) {
    return state.phase === 'returning' && state.catchDisplay?.playerId === player.id &&
      state.phaseElapsed < state.catchDisplay.duration - 1e-9
  }

  function predictedAtX(x) {
    return predictBallAtX(state.ball, x, modeRules(), { floor: rules.groundY + state.ball.radius, minimumBounceHeight: rules.minimumBounceHeight })
  }

  function aiMoveToward(player, x, z, speed) {
    const dx = x - player.x, dz = z - player.z, length = Math.max(1, Math.hypot(dx, dz))
    player.aiMoveX = dx / length * speed; player.aiMoveZ = dz / length * speed
  }

  function patrol(player) {
    const centerZ = (rules.defendZMin + rules.defendZMax) / 2
    if (player.aiRecover) {
      const x = player.slot ? 3.5 : -3.5, z = centerZ + (player.slot ? .8 : -.8)
      if (Math.hypot(player.x - x, player.z - z) > .65) { aiMoveToward(player, x, z, rules.aiPatrolSpeed); return }
      player.aiRecover = false; player.aiPatrolUntil = 0
    }
    if (player.aiPatrolX == null || state.elapsed >= player.aiPatrolUntil || Math.hypot(player.aiPatrolX - player.x, player.aiPatrolZ - player.z) < .45) {
      // Persistent interior waypoints, not frame-random motion or boundary cover.
      const route = [[-5.8, 2.5], [-.8, -3.1], [-5.4, -2.6], [.5, 3]]
      const [x, z] = route[player.aiPatrolIndex % route.length], mirror = player.slot ? -1 : 1
      player.aiPatrolX = clamp(x * mirror, rules.defendXMin + 1.5, rules.defendXMax - 1.5)
      player.aiPatrolZ = clamp(centerZ + z * mirror, rules.defendZMin + 1.5, rules.defendZMax - 1.5)
      player.aiPatrolIndex++; player.aiPatrolUntil = state.elapsed + rules.aiPatrolSeconds
    }
    aiMoveToward(player, player.aiPatrolX, player.aiPatrolZ, rules.aiPatrolSpeed)
  }

  function updateAi(player) {
    if (!isAi(player) || state.elapsed < player.aiDecisionAt) return
    player.aiDecisionAt = state.elapsed + rules.aiDecisionSeconds
    player.aiMoveX = 0; player.aiMoveZ = 0
    if (player.role === 'attack') {
      if (state.phase === 'held' && state.ball.ownerId === player.id) {
        const target = playerById(player.aiAlignTargetId)
        if (target?.alive) player.aiMoveZ = clamp((target.z - player.z) * .8, -1, 1)
      } else if (state.phase === 'flight' && state.ball.receiverId === player.id && state.elapsed >= player.aiReactionUntil) {
        const predicted = predictedAtX(player.x)
        if (predicted) player.aiMoveZ = clamp((clamp(predicted.z, rules.attackZMin, rules.attackZMax) - player.z) * 2.5, -1, 1)
      }
      return
    }
    patrol(player)
    const predicted = predictedAtX(player.x), ball = state.ball
    if (state.phase === 'flight' && predicted && state.elapsed >= player.aiReactionUntil) {
      const gap = predicted.z - player.z
      if (player.aiDodgeAttackId !== ball.attackId && predicted.time < rules.aiThreatLookahead && Math.abs(gap) < 1.35 && predicted.y >= 0 && predicted.y <= rules.playerHeight + player.y + .35) {
        player.aiDodgeAttackId = ball.attackId
        player.aiThreatUntil = state.elapsed + Math.min(.65, predicted.time + .12)
        const length = Math.max(.001, Math.hypot(ball.vx, ball.vz)), nx = -ball.vz / length, nz = ball.vx / length
        const away = -gap * nz, direction = Math.abs(away) > .12 ? Math.sign(away) : player.aiDodgeBias
        player.aiDodgeX = clamp(player.x + nx * direction * rules.aiDodgeDistance, rules.defendXMin + 1.2, rules.defendXMax - 1.2)
        player.aiDodgeZ = clamp(player.z + nz * direction * rules.aiDodgeDistance, rules.defendZMin + 1.2, rules.defendZMax - 1.2)
        if (player.aiTryCatch) { player.aiDodgeX = player.x; player.aiDodgeZ = clamp(predicted.z, rules.defendZMin + 1.2, rules.defendZMax - 1.2) }
        if (player.aiJump && !player.aiTryCatch && predicted.y < 1.15 && predicted.time < .38) performJump(player)
      }
      if (player.aiDodgeAttackId === ball.attackId && state.elapsed < player.aiThreatUntil) {
        // Commit once to a reachable response. Do not track/reverse perfectly as
        // the ball advances; the ordinary acceleration limit still applies.
        aiMoveToward(player, player.aiDodgeX, player.aiDodgeZ, player.aiTryCatch ? .48 : rules.aiDodgeSpeed)
        if (player.aiTryCatch && !player.aiCatchAttempted && predicted.time <= modeRules().catchWindow * .72) player.aiCatchAttempted = performCatch(player)
      } else if (player.aiDodgeAttackId === ball.attackId && player.aiThreatUntil > 0) {
        player.aiRecover = true; player.aiThreatUntil = 0
      }
    } else if (player.aiDodgeAttackId === ball.attackId && player.aiThreatUntil > 0) {
      player.aiRecover = true; player.aiThreatUntil = 0
    }
    const teammate = teamPlayers(player.team).find(candidate => candidate.id !== player.id && candidate.alive)
    if (teammate && Math.hypot(player.x - teammate.x, player.z - teammate.z) < 1.1) player.aiMoveX = player.x <= teammate.x ? -.6 : .6
  }

  function movePlayers(dt) {
    const previous = state.players.map(player => ({ x: player.x, y: player.y, z: player.z }))
    for (const player of state.players) {
      player.actionTime += dt
      if (!player.alive) continue
      const confirming = isConfirmingCatch(player)
      if (!confirming) updateAi(player)
      const live = !DEAD_PHASES.has(state.phase)
      let mx = 0, mz = 0
      if (live && !confirming) {
        if (player.id === state.controlledId) { mx = input.x; mz = input.z }
        else if (isAi(player)) { mx = player.aiMoveX; mz = player.aiMoveZ }
      }
      if (player.role === 'attack') mx = 0
      const magnitude = Math.max(1, Math.hypot(mx, mz)), speed = player.role === 'attack' ? rules.attackerSpeed : rules.defenderSpeed
      const amount = (mx || mz ? rules.acceleration : rules.deceleration) * dt
      const dvx = mx / magnitude * speed - player.vx, dvz = mz / magnitude * speed - player.vz
      const change = Math.hypot(dvx, dvz), fraction = change > 0 ? Math.min(1, amount / change) : 0
      player.vx += dvx * fraction; player.vz += dvz * fraction
      player.x += player.vx * dt; player.z += player.vz * dt
      const nextX = player.role === 'attack' ? endpoint(player) : clamp(player.x, rules.defendXMin, rules.defendXMax)
      const nextZ = player.role === 'attack' ? clamp(player.z, rules.attackZMin, rules.attackZMax) : clamp(player.z, rules.defendZMin, rules.defendZMax)
      if (nextX !== player.x) player.vx = 0
      if (nextZ !== player.z) player.vz = 0
      player.x = nextX; player.z = nextZ
      if (player.y > 0 || player.vy > 0) {
        player.y += player.vy * dt - rules.playerGravity * dt * dt / 2; player.vy -= rules.playerGravity * dt
        if (player.y <= 0) { player.y = 0; player.vy = 0 }
      }
      if (player.role === 'attack' && state.ball.ownerId !== player.id) player.yaw = player.slot ? -Math.PI / 2 : Math.PI / 2
      // Defenders face their movement command, not the ball. Intent makes a
      // left/right reversal respond immediately even while velocity is still
      // braking; no command preserves the last heading. Successful catch
      // confirmation supplies zero intent above, keeping its pose still.
      else if (player.role === 'defend' && Math.hypot(mx, mz) > 1e-4) player.yaw = Math.atan2(mx, mz)
      if (confirming || player.actionDuration > 0 && player.actionTime < player.actionDuration) continue
      if (state.charging && player.id === state.ball.ownerId) setAction(player, 'charge')
      else setAction(player, player.y > .001 ? 'jump' : Math.hypot(player.vx, player.vz) > .1 ? 'run' : 'idle')
    }
    return previous
  }

  function advanceBall(dt, previousPlayers) {
    const ball = state.ball, mode = modeRules()
    let used = 0, guard = 0
    while (ball.active && used < dt - 1e-10 && guard++ < 8) {
      const duration = dt - used, start = { x: ball.x, y: ball.y, z: ball.z }
      const distanceFactor = dragDistanceFactor(duration, mode.drag)
      const end = { x: start.x + ball.vx * distanceFactor, y: start.y + ball.vy * duration - mode.gravity * duration * duration / 2, z: start.z + ball.vz * distanceFactor }
      let event = null
      const offer = (time, kind, player = null) => {
        if (time == null) return
        const priority = kind === 'catch' ? 0 : kind === 'hit' ? 1 : kind === 'out' ? 2 : 3
        if (!event || time < event.time - 1e-8 || Math.abs(time - event.time) <= 1e-8 && priority < event.priority) event = { time, kind, player, priority }
      }
      const ground = groundContactTime(ball.y, ball.vy, mode.gravity, rules.groundY + ball.radius, duration)
      offer(ground == null ? null : ground / duration, 'ground')
      const boundary = boundaryTime(start, end, rules.ballBounds)
      offer(boundary == null ? null : dragTravelTime(distanceFactor * boundary, 1, mode.drag) / duration, 'out')
      for (const player of state.players) {
        if (!player.alive || player.id === ball.throwerId) continue
        const previous = previousPlayers[player.id]
        const progress = used / dt
        const from = { x: previous.x + (player.x - previous.x) * progress, y: previous.y + (player.y - previous.y) * progress, z: previous.z + (player.z - previous.z) * progress }
        const relativeStart = { x: start.x - from.x, y: start.y - rules.groundY - from.y, z: start.z - from.z }
        const relativeEnd = { x: end.x - player.x, y: end.y - rules.groundY - player.y, z: end.z - player.z }
        const canReceive = player.role === 'attack' && player.id === ball.receiverId
        const canCatch = player.role === 'defend' && player.catchUntil > state.elapsed + used
        if (canReceive || canCatch) {
          const low = rules.catchMinHeight + rules.catchRadius, high = Math.max(low, rules.catchMaxHeight - rules.catchRadius)
          const t = sweepCapsule(relativeStart, relativeEnd, low, high, rules.catchRadius + ball.radius)
          if (t != null && (canReceive || state.elapsed + used + t * duration <= player.catchUntil + 1e-9)) offer(t, 'catch', player)
        }
        if (player.role === 'defend') offer(sweepCapsule(relativeStart, relativeEnd, rules.playerRadius, rules.playerHeight - rules.playerRadius, rules.playerRadius + ball.radius), 'hit', player)
      }
      const fraction = event?.time ?? 1, travel = duration * fraction
      const travelledFactor = dragDistanceFactor(travel, mode.drag)
      ball.x += ball.vx * travelledFactor; ball.z += ball.vz * travelledFactor
      ball.y += ball.vy * travel - mode.gravity * travel * travel / 2
      ball.vy -= mode.gravity * travel
      ball.vx *= Math.exp(-mode.drag * travel); ball.vz *= Math.exp(-mode.drag * travel)
      used += travel
      if (!event) break
      eventTime = state.elapsed + used
      if (event.kind === 'ground') {
        ball.y = rules.groundY + ball.radius
        ball.vy = Math.abs(ball.vy) * mode.restitution
        ball.vx *= mode.tangentRetention; ball.vz *= mode.tangentRetention; ball.bounces += 1
        emit('dodgeball-bounce', { attackId: ball.attackId, bounces: ball.bounces, speed: ball.vy })
        if (ball.vy * ball.vy / (2 * mode.gravity) <= rules.minimumBounceHeight) finishAttack('rolling')
        else ball.y += 1e-7
      } else finishAttack(event.kind, event.player)
      eventTime = null
    }
  }

  function fixedStep(dt) {
    if (state.phase === 'selection' || state.phase === 'finished') return
    if (state.phase === 'ready') {
      state.phaseElapsed += dt
      if (state.phaseElapsed + 1e-9 >= rules.readySeconds) giveBall(state.ball.ownerId)
      return
    }
    dt = Math.min(dt, state.timeRemaining)
    if (dt <= 1e-10) { finishMatch(); return }
    const phaseBefore = state.phase
    const previous = movePlayers(dt)
    if (state.phase === 'held') {
      state.holdElapsed += dt
      syncServeCountdown()
      if (state.charging) { chargeTime += dt; state.charge = clamp(chargeTime / rules.chargeSeconds, 0, 1) }
      placeHeldBall()
      const owner = playerById(state.ball.ownerId)
      // A countdown/hold timeout that meets the match deadline cannot create a
      // new attack after the final whistle. Preparation itself uses match time.
      if (state.timeRemaining - dt > 1e-9) {
        eventTime = state.elapsed + dt
        if (isAi(owner) && state.holdElapsed + 1e-9 >= owner.aiThrowAfter) throwBall(owner, owner.aiThrowRatio)
        else if (state.holdElapsed + 1e-9 >= rules.holdSeconds) throwBall(owner, state.charging ? Math.max(.55, state.charge) : .65, true)
        eventTime = null
      }
    } else if (state.phase === 'flight') advanceBall(dt, previous)
    else if (state.phase === 'returning') {
      state.phaseElapsed += dt
      const owner = playerById(nextOwnerId)
      const hold = state.catchDisplay?.duration || 0
      const catcher = playerById(state.catchDisplay?.playerId)
      if (owner && returnFrom) {
        // An airborne catcher lands naturally while visibly securing the ball.
        if (catcher && state.phaseElapsed <= hold + 1e-9) {
          returnFrom.y += catcher.y - returnFrom.catchY; returnFrom.catchY = catcher.y
        }
        const t = clamp((state.phaseElapsed - hold) / rules.returnSeconds, 0, 1), eased = t * t * (3 - 2 * t)
        state.ball.x = returnFrom.x + (owner.x + (owner.slot ? -1 : 1) * rules.releaseForward - returnFrom.x) * eased
        state.ball.y = returnFrom.y + (rules.groundY + owner.y + rules.releaseHeight - returnFrom.y) * eased
        state.ball.z = returnFrom.z + (owner.z - returnFrom.z) * eased
      }
      if (state.phaseElapsed + 1e-9 >= hold + rules.returnSeconds) giveBall(nextOwnerId)
    } else if (state.phase === 'switching') {
      state.phaseElapsed += dt
      if (state.phaseElapsed + 1e-9 >= rules.switchSeconds) {
        state.attackTeam = otherTeam(state.attackTeam); state.round += 1
        resetPlayers(); clearInput(); giveBall(state.attackTeam === 'blue' ? 0 : 2)
      }
    }
    if (state.phase === phaseBefore && state.phase !== 'returning' && state.phase !== 'switching') state.phaseElapsed += dt
    state.elapsed = Math.min(rules.matchSeconds, state.elapsed + dt)
    state.timeRemaining = Math.max(0, rules.matchSeconds - state.elapsed)
    if (state.timeRemaining < 1e-9) finishMatch()
  }

  function update(dt) {
    if (!finite(dt) || dt <= 0) return
    accumulator = Math.min(accumulator + dt, rules.fixedStep * rules.maxSubsteps)
    let steps = 0
    while (accumulator + 1e-10 >= rules.fixedStep && steps < rules.maxSubsteps) {
      fixedStep(rules.fixedStep); accumulator = Math.max(0, accumulator - rules.fixedStep); steps += 1
    }
  }

  function stepFor(seconds) {
    if (!finite(seconds) || seconds <= 0) return snapshot()
    const wholeSteps = Math.floor((seconds + 1e-9) / rules.fixedStep)
    for (let index = 0; index < wholeSteps && state.phase !== 'finished'; index++) fixedStep(rules.fixedStep)
    const remainder = seconds - wholeSteps * rules.fixedStep
    if (remainder > 1e-9 && state.phase !== 'finished') fixedStep(remainder)
    return snapshot()
  }

  function setTestState(patch = {}) {
    const { players, ball, scores, ...rest } = patch
    Object.assign(state, clone(rest))
    if (ball) Object.assign(state.ball, clone(ball))
    if (scores) Object.assign(state.scores, clone(scores))
    if (players) for (const value of players) { const player = playerById(value.id); if (player) Object.assign(player, clone(value)) }
    if (Object.hasOwn(patch, 'elapsed')) state.timeRemaining = Math.max(0, rules.matchSeconds - state.elapsed)
    else if (Object.hasOwn(patch, 'timeRemaining')) state.elapsed = rules.matchSeconds - state.timeRemaining
    sequence = Math.max(sequence, state.ball.attackId || 0)
    accumulator = 0
    syncAim()
    syncServeCountdown()
    return snapshot()
  }

  const snapshot = () => clone(state)
  resetPlayers()
  return { state, start, select, update, setMove, beginCharge, releaseCharge, jump, catchBall, clearInput, snapshot, setTestState, stepFor }
}

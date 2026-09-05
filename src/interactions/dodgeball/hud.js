import * as THREE from 'three'
import { PIXEL_UI_FONT_FAMILY, PIXEL_UI_FONT_URL } from '../../ui/pixel-text.js'

const W = 1920, H = 1080
const COLOR = { ink: '#30464d', quiet: '#52675f', gold: '#f2d18b', red: '#bf6747', blue: '#497d8c', cream: '#eee5ce', paper: '#e7e4ce' }
const COPY = {
  'zh-CN': {
    title: '热血躲避', pingpong: '乒乓球模式', beanbag: '沙包模式', blue: '蓝队', red: '红队',
    blueAttack: '蓝队 · 两端投接', blueDefend: '蓝队 · 中间躲避', redAttack: '红队 · 两端投接', redDefend: '红队 · 中间躲避',
    points: '积分', alive: '存活', time: '剩余时间', choose: '选好球，去操场！', modesHint: '两端投接，中间躲避；清场后交换攻守。',
    start: '开始比赛', pause: '暂停', exit: '返回校园', exitShort: '退出', paused: '休息一下', resume: '继续比赛',
    restart: '再来一场', select: '选择模式', blueWin: '蓝队赢啦！', redWin: '红队赢啦！', draw: '平局！', result: '本场积分',
    rotate: '横过手机，准备开球', rotateHint: '横屏才能看全两端队员', throw: '投球', catch: '接球', jump: '跳跃', move: '移动',
    place: '二号楼前 · 夏日操场', controls: 'WASD / 方向键移动 · K / 左键投接 · 空格跳跃',
    attackHint: 'W/S 或 ↑↓ 上下对位 · 按住 K / 左键蓄力，松开直投', defendHint: '按 K 或单击左键接球，无需瞄准来球',
    touchAttackHint: '上下移动对位 · 按住投球蓄力，松开直投', touchDefendHint: '摇杆移动躲避 · 来球靠近时按接球', charge: '投球蓄力', hold: '持球时间',
    servePrepare: '电脑发球 · 准备躲避',
    ready: '准备开球！', switching: '交换攻守！', hit: '击中！', caught: '接住啦！', missed: '再接稳一点', clear: '全部出局！',
  },
  en: {
    title: 'HOT-BLOODED DODGE', pingpong: 'PING-PONG BALL', beanbag: 'BEANBAG', blue: 'BLUE', red: 'RED',
    blueAttack: 'BLUE · THROW & CATCH', blueDefend: 'BLUE · DODGE', redAttack: 'RED · THROW & CATCH', redDefend: 'RED · DODGE',
    points: 'POINTS', alive: 'ALIVE', time: 'TIME LEFT', choose: 'PICK A BALL. LET\'S PLAY!', modesHint: 'Throw from both ends. Dodge in the middle. Clear the team to swap.',
    start: 'START MATCH', pause: 'PAUSE', exit: 'BACK TO SCHOOL', exitShort: 'EXIT', paused: 'TAKE A BREATHER', resume: 'RESUME',
    restart: 'PLAY AGAIN', select: 'CHOOSE MODE', blueWin: 'BLUE WINS!', redWin: 'RED WINS!', draw: 'A DRAW!', result: 'FINAL POINTS',
    rotate: 'TURN YOUR PHONE TO PLAY', rotateHint: 'Landscape keeps both end players in view', throw: 'THROW', catch: 'CATCH', jump: 'JUMP', move: 'MOVE',
    place: 'BUILDING 2 · SUMMER PLAYGROUND', controls: 'WASD / ARROWS MOVE · K / LEFT CLICK THROW & CATCH · SPACE JUMP',
    attackHint: 'W/S OR UP/DOWN TO LINE UP · HOLD K/LEFT, RELEASE STRAIGHT', defendHint: 'PRESS K OR LEFT CLICK TO CATCH · NO AIM NEEDED',
    touchAttackHint: 'MOVE UP/DOWN · HOLD THROW, RELEASE STRAIGHT', touchDefendHint: 'MOVE TO DODGE · TAP CATCH AS THE BALL NEARS', charge: 'THROW POWER', hold: 'HOLD TIME',
    servePrepare: 'CPU THROW · GET READY',
    ready: 'GET READY!', switching: 'SWAP SIDES!', hit: 'HIT!', caught: 'NICE CATCH!', missed: 'TRY THAT CATCH AGAIN', clear: 'TEAM CLEARED!',
  },
}
const STYLES = {
  label: { size: 40, color: COLOR.ink }, small: { size: 34, color: COLOR.quiet },
  light: { size: 38, color: COLOR.cream }, arcade: { size: 80, color: COLOR.gold, arcade: true },
}

const normalizedLocale = locale => locale === 'en' || String(locale).startsWith('en-') ? 'en' : 'zh-CN'
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const setUv = (geometry, record, width, height) => {
  const uv = geometry.attributes.uv
  const left = record.x / width, right = (record.x + record.width) / width
  const top = 1 - record.y / height, bottom = 1 - (record.y + record.height) / height
  uv.setXY(0, left, top); uv.setXY(1, right, top); uv.setXY(2, left, bottom); uv.setXY(3, right, bottom)
  uv.needsUpdate = true
}

// All complete phrases, both locales, and fixed-width numeric cells are painted
// before the first match. Updates never touch a canvas or a texture version.
async function makeAtlas() {
  let ownedFont = null
  if (![...document.fonts].some(face => face.family.replace(/["']/g, '') === PIXEL_UI_FONT_FAMILY && face.status === 'loaded')) {
    ownedFont = await new FontFace(PIXEL_UI_FONT_FAMILY, `url("${PIXEL_UI_FONT_URL}") format("woff2")`).load()
    document.fonts.add(ownedFont)
  }
  await Promise.all([
    document.fonts.load('900 64px "PingFang SC"', '热血躲避蓝队红队沙包乒乓球'),
    document.fonts.load('900 64px "Microsoft YaHei"', '热血躲避'),
  ])
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
  const entries = new Map(), width = 2048
  const family = text => /[\u3400-\u9fff]/u.test(text) ? '"PingFang SC", "Microsoft YaHei", sans-serif' : `"${PIXEL_UI_FONT_FAMILY}", sans-serif`
  const requests = []
  for (const [locale, copy] of Object.entries(COPY)) {
    for (const [key, text] of Object.entries(copy)) {
      const styleName = ['title', 'choose', 'paused', 'blueWin', 'redWin', 'draw', 'rotate', 'ready', 'switching', 'hit', 'caught', 'missed', 'clear'].includes(key) ? 'arcade'
        : ['modesHint', 'rotateHint', 'controls', 'attackHint', 'defendHint', 'touchAttackHint', 'touchDefendHint', 'place'].includes(key) ? 'small'
          : ['pingpong', 'beanbag'].includes(key) ? 'light' : 'label'
      const style = STYLES[styleName]
      let size = style.size
      ctx.font = `900 ${size}px ${family(text)}`
      while (ctx.measureText(text).width > 1600) { size -= 2; ctx.font = `900 ${size}px ${family(text)}` }
      const metrics = ctx.measureText(text), pad = style.arcade ? 18 : 6
      const ascent = Math.ceil(metrics.actualBoundingBoxAscent || size), descent = Math.ceil(metrics.actualBoundingBoxDescent || size * .2)
      requests.push({ key: `${locale}:${key}`, text, style, font: ctx.font, width: Math.ceil(metrics.width) + pad * 2 + 4, height: ascent + descent + pad * 2, pad, ascent })
    }
  }
  for (const char of '0123456789+-:/.% ') requests.push({ key: `digit:${char}`, text: char, style: STYLES.arcade, font: `900 68px "${PIXEL_UI_FONT_FAMILY}", sans-serif`, width: 80, height: 108, pad: 12, ascent: 74, digit: true })
  let x = 2, y = 2, rowHeight = 0
  for (const entry of requests) {
    if (x + entry.width + 2 > width) { x = 2; y += rowHeight + 4; rowHeight = 0 }
    Object.assign(entry, { x, y }); entries.set(entry.key, entry)
    x += entry.width + 4; rowHeight = Math.max(rowHeight, entry.height)
  }
  canvas.width = width; canvas.height = THREE.MathUtils.ceilPowerOfTwo(y + rowHeight + 2)
  for (const entry of requests) {
    const tx = entry.x + entry.width / 2, ty = entry.y + entry.pad + entry.ascent
    ctx.save(); ctx.font = entry.font; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'
    if (entry.style.arcade) {
      ctx.strokeStyle = '#2f4653'; ctx.lineWidth = 10; ctx.strokeText(entry.text, tx + 5, ty + 6)
      ctx.strokeStyle = '#bd6846'; ctx.lineWidth = 6; ctx.strokeText(entry.text, tx + 2, ty + 3)
      ctx.strokeStyle = entry.style.color; ctx.lineWidth = entry.digit ? 2.3 : 1.6; ctx.strokeText(entry.text, tx, ty)
    }
    ctx.fillStyle = entry.style.color; ctx.fillText(entry.text, tx, ty); ctx.restore()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.name = 'dodgeball-bilingual-prebaked-hud-atlas'; texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter
  return { texture, entries, width: canvas.width, height: canvas.height, ownedFont }
}

function makeBurstTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.translate(256, 256)
  for (let i = 0; i < 22; i++) {
    const angle = i / 22 * Math.PI * 2, inner = i % 3 === 0 ? 80 : 100, outer = i % 2 ? 212 : 244
    ctx.fillStyle = i % 3 === 0 ? '#497d8c' : i % 3 === 1 ? '#f2d18b' : '#bf6747'
    ctx.beginPath(); ctx.moveTo(Math.cos(angle - .024) * inner, Math.sin(angle - .024) * inner)
    ctx.lineTo(Math.cos(angle - .044) * outer, Math.sin(angle - .044) * outer)
    ctx.lineTo(Math.cos(angle + .025) * (outer - 8), Math.sin(angle + .025) * (outer - 8))
    ctx.lineTo(Math.cos(angle + .018) * inner, Math.sin(angle + .018) * inner); ctx.closePath(); ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas); texture.name = 'dodgeball-separate-celebration-rays'; texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter
  return texture
}

export async function createDodgeballHud({ renderer, locale = 'zh-CN' }) {
  const atlas = await makeAtlas(), burstTexture = makeBurstTexture()
  const scene = new THREE.Scene(); scene.name = 'dodgeball-webgl-hud'
  const camera = new THREE.OrthographicCamera(0, W, H, 0, .1, 20); camera.position.z = 10
  const materials = new Set(), geometries = new Set(), flat = new Map(), buttons = []
  const textMaterial = new THREE.MeshBasicMaterial({ name: 'dodgeball-atlas-text', map: atlas.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  materials.add(textMaterial)
  const geometry = () => { const value = new THREE.PlaneGeometry(1, 1); geometries.add(value); return value }
  const pos = (object, x, y) => { object.position.set(x, H - y, 0); return object }
  const group = (name, order = 0) => { const value = new THREE.Group(); value.name = name; value.renderOrder = order; scene.add(value); return value }
  const setRect = (mesh, x, y, width, height) => { pos(mesh, x, y); mesh.scale.set(width, height, 1) }
  const rect = (parent, x, y, width, height, color = COLOR.paper, order = 0, opacity = 1) => {
    const key = `${color}:${opacity}`
    if (!flat.has(key)) {
      // Keep panels in the same sorted transparency pass as labels and veils;
      // an opaque button would otherwise draw below the translucent footer.
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false })
      flat.set(key, material); materials.add(material)
    }
    const mesh = new THREE.Mesh(geometry(), flat.get(key)); mesh.renderOrder = order; mesh.frustumCulled = false
    setRect(mesh, x, y, width, height); parent.add(mesh); return mesh
  }
  let currentLocale = normalizedLocale(locale)
  const labels = []
  const label = (parent, key, x, y, width, height, order = 1) => {
    const mesh = new THREE.Mesh(geometry(), textMaterial); mesh.renderOrder = order; mesh.frustumCulled = false; parent.add(mesh)
    const value = { mesh, key, x, y, width, height, rendered: '' }; labels.push(value); return value
  }
  const paintLabel = value => {
    const id = `${currentLocale}:${value.key}`, entry = atlas.entries.get(id)
    if (!entry) return
    if (value.rendered !== id) { setUv(value.mesh.geometry, entry, atlas.width, atlas.height); value.rendered = id; value.mesh.name = COPY[currentLocale][value.key] }
    const scale = Math.min(value.width / entry.width, value.height / entry.height)
    pos(value.mesh, value.x, value.y); value.mesh.scale.set(entry.width * scale, entry.height * scale, 1)
  }
  const numbers = []
  const number = (parent, x, y, height, count = 4, order = 2) => {
    const root = new THREE.Group(); root.renderOrder = parent.renderOrder; pos(root, x, y); parent.add(root)
    const slots = Array.from({ length: count }, (_, i) => {
      const mesh = new THREE.Mesh(geometry(), textMaterial); mesh.renderOrder = order; mesh.frustumCulled = false
      mesh.position.x = (i - (count - 1) / 2) * 72; mesh.scale.set(80, 108, 1); root.add(mesh); return mesh
    })
    const value = { root, slots, height, text: '', changedAt: -10 }; root.scale.setScalar(height / 108); numbers.push(value); return value
  }
  const setNumber = (line, raw, now) => {
    const value = String(raw).slice(-line.slots.length).padStart(line.slots.length, ' ')
    if (line.text === value) return
    line.text = value; line.changedAt = now
    line.slots.forEach((mesh, i) => { const char = value[i]; mesh.visible = char !== ' '; setUv(mesh.geometry, atlas.entries.get(`digit:${char}`) || atlas.entries.get('digit: '), atlas.width, atlas.height) })
  }
  const button = (parent, action, key, x, y, width, height, color = COLOR.paper, order = 12) => {
    const back = rect(parent, x, y, width, height, color, order)
    const text = label(parent, key, x, y, width - 26, height - 18, order + 1)
    const value = { parent, action, back, text, x, y, width, height, baseWidth: width, baseHeight: height, enabled: true, bounds: null }
    buttons.push(value); return value
  }
  const base = group('dodgeball-scoreboard')
  rect(base, 285, 94, 454, 144); rect(base, 1635, 94, 454, 144)
  rect(base, 285, 166, 454, 5, COLOR.blue); rect(base, 1635, 166, 454, 5, COLOR.red)
  const blueRole = label(base, 'blueAttack', 285, 50, 420, 37), redRole = label(base, 'redDefend', 1635, 50, 420, 37)
  for (const x of [285, 1635]) { label(base, 'points', x - 110, 89, 120, 24); label(base, 'alive', x + 118, 89, 120, 24) }
  const blueScore = number(base, 185, 125, 70), redScore = number(base, 1535, 125, 70)
  const blueAlive = number(base, 398, 125, 64, 3), redAlive = number(base, 1748, 125, 64, 3)
  rect(base, 960, 81, 570, 126, COLOR.ink); rect(base, 960, 145, 570, 5, COLOR.red)
  label(base, 'title', 960, 66, 550, 74)
  const modeLabel = label(base, 'pingpong', 960, 120, 430, 29)
  rect(base, 960, 199, 224, 88, COLOR.ink)
  const timer = number(base, 960, 197, 79, 4)
  const pauseButton = button(base, 'pause', 'pause', 1726, 223, 124, 54, COLOR.paper, 3)
  const exitButton = button(base, 'exit', 'exitShort', 1848, 223, 114, 54, COLOR.paper, 3)
  // A compact pre-serve cue stays entirely above the highest playable pupil.
  // Its phrases and numeric cells are prewarmed with the rest of the atlas.
  const serveGroup = group('dodgeball-cpu-serve-countdown', 4)
  const serveBounds = { left: 695, right: 1225, top: 253, bottom: 315 }
  rect(serveGroup, 960, 284, 530, 62, COLOR.paper, 4)
  rect(serveGroup, 698, 284, 6, 62, COLOR.red, 5)
  label(serveGroup, 'servePrepare', 908, 284, 375, 31, 5)
  const serveNumber = number(serveGroup, 1167, 280, 54, 1, 5)
  const footer = group('dodgeball-desktop-footer')
  label(footer, 'place', 358, 1006, 590, 36)
  label(footer, 'controls', 1285, 1023, 1040, 34)
  const statusHint = label(footer, 'attackHint', 1055, 976, 900, 33)
  const power = group('dodgeball-charge')
  label(power, 'charge', 960, 786, 220, 27)
  rect(power, 960, 823, 322, 19, COLOR.ink)
  const powerFill = rect(power, 802, 823, 1, 11, COLOR.gold, 1)
  label(power, 'hold', 1204, 805, 145, 23)
  const holdTime = number(power, 1204, 839, 35, 3)

  const touchGroup = group('dodgeball-touch-safe-band', 4)
  rect(touchGroup, 960, 975, 1920, 210, COLOR.paper, 4, .93)
  const joystick = button(touchGroup, 'joystick', 'move', 160, 975, 178, 178, '#d4d8c7', 5)
  const joystickKnob = rect(touchGroup, 160, 975, 66, 66, COLOR.blue, 7)
  joystick.text.y = 1041; joystick.text.height = 28; joystick.text.width = 130
  const jumpButton = button(touchGroup, 'jump', 'jump', 1392, 978, 168, 154, COLOR.paper, 5)
  const catchButton = button(touchGroup, 'catch', 'catch', 1590, 978, 168, 154, '#d2dbce', 5)
  const throwButton = button(touchGroup, 'throw', 'throw', 1790, 978, 168, 154, COLOR.gold, 5)
  const touchStatusHint = label(touchGroup, 'touchAttackHint', 725, 1004, 840, 30, 6)

  const shade = group('dodgeball-modal-shade', 9)
  rect(shade, 960, 540, 1920, 1080, COLOR.ink, 9, .38)
  const selection = group('dodgeball-mode-selection', 10)
  const selectionPanel = rect(selection, 960, 521, 840, 456, COLOR.cream, 10)
  label(selection, 'choose', 960, 354, 740, 74, 11)
  label(selection, 'modesHint', 960, 415, 750, 32, 11)
  const selectedModeMark = rect(selection, 760, 555, 354, 8, COLOR.blue, 11)
  const pingButton = button(selection, 'pingpong', 'pingpong', 760, 509, 352, 89, COLOR.ink)
  const bagButton = button(selection, 'beanbag', 'beanbag', 1160, 509, 352, 89, COLOR.ink)
  const startButton = button(selection, 'start', 'start', 960, 636, 502, 89, COLOR.gold)
  const selectionExit = button(selection, 'exit', 'exit', 960, 708, 330, 49)

  const pausedGroup = group('dodgeball-paused', 10)
  const pausePanel = rect(pausedGroup, 960, 520, 760, 398, COLOR.cream, 10)
  label(pausedGroup, 'paused', 960, 389, 680, 83, 11)
  const resumeButton = button(pausedGroup, 'resume', 'resume', 960, 515, 496, 88, COLOR.gold)
  const pauseExit = button(pausedGroup, 'exit', 'exit', 960, 631, 496, 88)

  const resultGroup = group('dodgeball-results', 10)
  const resultPanel = rect(resultGroup, 960, 523, 880, 462, COLOR.cream, 10)
  const winnerLabel = label(resultGroup, 'draw', 960, 363, 730, 94, 11)
  label(resultGroup, 'result', 960, 435, 210, 30, 11)
  label(resultGroup, 'blue', 754, 478, 180, 32, 11); label(resultGroup, 'red', 1166, 478, 180, 32, 11)
  const resultBlue = number(resultGroup, 754, 539, 98, 4, 11), resultRed = number(resultGroup, 1166, 539, 98, 4, 11)
  button(resultGroup, 'restart', 'restart', 737, 650, 360, 83, COLOR.gold)
  button(resultGroup, 'select', 'select', 1183, 650, 360, 83)
  const resultExit = button(resultGroup, 'exit', 'exit', 960, 719, 330, 45)

  const portraitGroup = group('dodgeball-portrait-rotate', 20)
  rect(portraitGroup, 960, 540, 1920, 1080, COLOR.cream, 20)
  label(portraitGroup, 'rotate', 960, 420, 1630, 156, 21)
  label(portraitGroup, 'rotateHint', 960, 548, 1600, 67, 21)
  const portraitExit = button(portraitGroup, 'exit', 'exit', 960, 740, 980, 152, COLOR.gold, 22)

  // Feedback text and radial background are independent WebGL Sprites, with
  // distinct timing and scale. They share the preloaded text/ray atlases.
  const feedbackGroup = group('dodgeball-feedback', 10)
  const burstMaterial = new THREE.SpriteMaterial({ map: burstTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  materials.add(burstMaterial)
  const burst = new THREE.Sprite(burstMaterial); burst.renderOrder = 10.5; pos(burst, 943, 350); feedbackGroup.add(burst)
  const phraseUv = { value: new THREE.Vector4(0, 0, 1, 1) }
  const phraseMaterial = new THREE.SpriteMaterial({ map: atlas.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  phraseMaterial.onBeforeCompile = shader => {
    shader.uniforms.dodgeAtlasRect = phraseUv
    shader.vertexShader = `uniform vec4 dodgeAtlasRect;\n${shader.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = dodgeAtlasRect.xy + vMapUv * dodgeAtlasRect.zw;\n#endif')
  }
  phraseMaterial.customProgramCacheKey = () => 'dodgeball-sprite-atlas-v1'
  materials.add(phraseMaterial)
  const phrase = new THREE.Sprite(phraseMaterial); phrase.renderOrder = 12; pos(phrase, 960, 333); feedbackGroup.add(phrase)
  let feedback = null, previousPhase = '', previousFeedback = '', disposed = false, currentState = null, layout = {}, clock = 0

  function trigger(key, major, now) { feedback = { key, major, startedAt: now } }
  const visibleThroughParents = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true }
  const resizeButton = (value, minWidth, minHeight) => {
    value.width = Math.max(value.baseWidth, minWidth); value.height = Math.max(value.baseHeight, minHeight)
    setRect(value.back, value.x, value.y, value.width, value.height)
    value.text.x = value.x; if (value !== joystick) value.text.y = value.y
    value.text.width = value.width - 26; if (value !== joystick) value.text.height = Math.min(value.height - 18, value.baseHeight * .65)
    value.bounds = { left: value.x - value.width / 2, right: value.x + value.width / 2, top: value.y - value.height / 2, bottom: value.y + value.height / 2, width: value.width, height: value.height, cx: value.x, cy: value.y }
  }
  function update(state = {}, { paused = false, portrait = false, touch = false, viewport = { left: 0, top: 0, width: W, height: H }, move = { x: 0, z: 0 } } = {}) {
    if (disposed) return
    currentState = state; currentLocale = normalizedLocale(state.locale || locale)
    const now = Number.isFinite(state.elapsed) ? state.elapsed : 0
    if (now < clock) { feedback = null; previousPhase = ''; previousFeedback = ''; numbers.forEach(line => { line.changedAt = -10 }) }
    clock = now
    const phase = state.phase || 'selection', isFinished = phase === 'finished', isSelection = phase === 'selection'
    const isPlaying = !isSelection && !isFinished
    const players = state.players || [], controlled = players.find(player => player.id === state.controlledId)
    const attackTeam = state.attackTeam || 'blue', mode = state.ballMode === 'beanbag' ? 'beanbag' : 'pingpong'
    modeLabel.key = mode; blueRole.key = attackTeam === 'blue' ? 'blueAttack' : 'blueDefend'; redRole.key = attackTeam === 'red' ? 'redAttack' : 'redDefend'
    statusHint.key = controlled?.team === attackTeam ? 'attackHint' : 'defendHint'
    touchStatusHint.key = controlled?.team === attackTeam ? 'touchAttackHint' : 'touchDefendHint'
    const count = team => { const members = players.filter(player => player.team === team); return `${members.filter(player => player.alive !== false).length}/${members.length || 2}` }
    const score = team => Math.max(0, Math.floor(Number(state.scores?.[team]) || 0))
    setNumber(blueScore, String(score('blue')).padStart(3, '0'), now); setNumber(redScore, String(score('red')).padStart(3, '0'), now)
    setNumber(resultBlue, String(score('blue')).padStart(3, '0'), now); setNumber(resultRed, String(score('red')).padStart(3, '0'), now)
    setNumber(blueAlive, count('blue'), now); setNumber(redAlive, count('red'), now)
    const seconds = clamp(Math.ceil(Number.isFinite(state.timeRemaining) ? state.timeRemaining : 180), 0, 599)
    setNumber(timer, `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, now)
    setNumber(holdTime, Math.max(0, Number(state.holdElapsed) || 0).toFixed(1), now)
    winnerLabel.key = state.winner === 'blue' ? 'blueWin' : state.winner === 'red' ? 'redWin' : 'draw'
    base.visible = !portrait; footer.visible = !touch && !portrait && !paused && !isSelection && !isFinished
    power.visible = phase === 'held' && controlled?.team === attackTeam && !paused && !portrait
    const serveCount = clamp(Math.ceil(Number(state.aiServeCountdown) || 0), 0, 9)
    setNumber(serveNumber, String(serveCount), now)
    serveGroup.visible = phase === 'held' && attackTeam === 'red' && controlled?.team === 'blue' && serveCount > 0 && !paused && !portrait
    const charge = clamp(Number(state.charge) || 0, 0, 1); setRect(powerFill, 802 + charge * 158, 823, Math.max(.01, charge * 316), 11)
    selection.visible = isSelection && !paused && !portrait; pausedGroup.visible = paused && !portrait
    resultGroup.visible = isFinished && !paused && !portrait; portraitGroup.visible = portrait
    shade.visible = !portrait && (isSelection || isFinished || paused)
    touchGroup.visible = touch && isPlaying && !paused && !portrait
    pauseButton.enabled = isPlaying; pauseButton.back.visible = pauseButton.text.mesh.visible = isPlaying
    // Exit remains in the appropriate modal; duplicate underlying buttons do not hit through it.
    exitButton.enabled = isPlaying && !paused
    exitButton.back.visible = exitButton.text.mesh.visible = isPlaying
    selectedModeMark.position.x = mode === 'beanbag' ? bagButton.x : pingButton.x
    startButton.enabled = resumeButton.enabled = !portrait
    throwButton.enabled = phase === 'held' && controlled?.team === attackTeam
    catchButton.enabled = phase === 'flight' || phase === 'returning'
    jumpButton.enabled = isPlaying
    throwButton.back.material = flat.get(`${throwButton.enabled ? COLOR.gold : COLOR.paper}:1`)
    const minWidth = touch ? 44 * W / Math.max(1, viewport.width || W) : 0
    const minHeight = touch ? 44 * H / Math.max(1, viewport.height || H) : 0
    const modeHeight = Math.max(pingButton.baseHeight, minHeight), startHeight = Math.max(startButton.baseHeight, minHeight)
    const selectionExitHeight = Math.max(selectionExit.baseHeight, minHeight)
    pingButton.y = bagButton.y = touch ? Math.max(509, 453 + modeHeight / 2) : 509
    startButton.y = touch ? pingButton.y + modeHeight / 2 + startHeight / 2 + 22 : 636
    selectionExit.y = touch ? startButton.y + startHeight / 2 + selectionExitHeight / 2 + 22 : 708
    pauseExit.y = touch ? resumeButton.y + Math.max(resumeButton.baseHeight, minHeight) / 2 + Math.max(pauseExit.baseHeight, minHeight) / 2 + 24 : 631
    resultExit.y = touch ? 650 + Math.max(83, minHeight) / 2 + Math.max(resultExit.baseHeight, minHeight) / 2 + 22 : 719
    const selectionBottom = touch ? selectionExit.y + selectionExitHeight / 2 + 24 : 749
    const pauseBottom = touch ? pauseExit.y + Math.max(pauseExit.baseHeight, minHeight) / 2 + 28 : 719
    const resultBottom = touch ? resultExit.y + Math.max(resultExit.baseHeight, minHeight) / 2 + 24 : 754
    setRect(selectionPanel, 960, (293 + selectionBottom) / 2, 840, selectionBottom - 293)
    setRect(pausePanel, 960, (321 + pauseBottom) / 2, 760, pauseBottom - 321)
    setRect(resultPanel, 960, (292 + resultBottom) / 2, 880, resultBottom - 292)
    selectedModeMark.position.y = H - (pingButton.y + modeHeight / 2 + 6)
    for (const value of buttons) resizeButton(value, minWidth, minHeight)
    // Keep the rightmost target inside the screen at phone size.
    for (const value of [pauseButton, exitButton]) {
      const margin = Math.max(14, minWidth * .12)
      value.x = value === exitButton ? W - margin - value.width / 2 : W - margin * 2 - exitButton.width - value.width / 2
      resizeButton(value, minWidth, minHeight)
    }
    portraitExit.enabled = true
    pos(joystickKnob, joystick.x + clamp(move.x || 0, -1, 1) * 46, joystick.y + clamp(move.z || 0, -1, 1) * 46)
    if (phase !== previousPhase) {
      if (phase === 'ready') trigger('ready', false, now)
      if (phase === 'switching') trigger('clear', true, now)
      if (phase === 'finished' && ['blue', 'red'].includes(state.winner)) trigger(winnerLabel.key, true, now)
      if (phase === 'selection') feedback = null
      previousPhase = phase
    }
    if (state.feedback) {
      const event = typeof state.feedback === 'string' ? { type: state.feedback } : state.feedback
      const type = event.type || event.kind || event.code
      const eventKey = `${event.id ?? event.at ?? state.lastAttackResult?.attackId ?? ''}:${type || ''}`
      if (eventKey !== previousFeedback) {
        const key = { ready: 'ready', hit: 'hit', catch: 'caught', caught: 'caught', miss: 'missed', clear: 'clear', switching: 'switching' }[type]
        if (key) trigger(key, type === 'clear', now)
        previousFeedback = eventKey
      }
    } else previousFeedback = ''
    feedbackGroup.visible = Boolean(feedback) && !paused && !portrait && !isSelection && !isFinished && !serveGroup.visible
    if (feedback) {
      const age = Math.max(0, now - feedback.startedAt), duration = feedback.major ? 1.1 : .9
      if (age >= duration) { feedbackGroup.visible = false; feedback = null }
      else {
        const entry = atlas.entries.get(`${currentLocale}:${feedback.key}`)
        phraseUv.value.set(entry.x / atlas.width, 1 - (entry.y + entry.height) / atlas.height, entry.width / atlas.width, entry.height / atlas.height)
        const delayed = Math.max(0, age - (feedback.major ? .05 : 0))
        const scale = feedback.major ? 1 + Math.exp(-delayed * 10) * (-.8 * Math.cos(delayed * 23)) : 1 + Math.exp(-age * 13) * (-.42 * Math.cos(age * 23))
        const fit = Math.min(650 / entry.width, 145 / entry.height)
        phrase.scale.set(entry.width * fit * scale, entry.height * fit * scale, 1)
        phraseMaterial.opacity = age > duration - .22 ? (duration - age) / .22 : 1
        burst.visible = feedback.major
        const burstScale = .35 + 1.07 * (1 - Math.exp(-age * 18)) + Math.sin(age * 19) * Math.exp(-age * 6) * .22
        burst.scale.setScalar(620 * burstScale); burstMaterial.rotation = -.035 + age * .075
        burstMaterial.opacity = Math.max(0, 1 - age / duration)
      }
    }
    if (isFinished && feedback?.major && !paused && !portrait) {
      // Animate the winning phrase independently over the result panel, then
      // hand back to its identical static title after the celebration ends.
      feedbackGroup.visible = true; winnerLabel.mesh.visible = false
      pos(phrase, 960, 363); pos(burst, 951, 366)
    } else { winnerLabel.mesh.visible = true; pos(phrase, 960, 333); pos(burst, 943, 350) }
    for (const line of numbers) {
      const age = now - line.changedAt, bounce = age >= 0 && age < .18 ? 1 + Math.sin(age / .18 * Math.PI) * .065 : 1
      line.root.scale.setScalar(line.height / 108 * bounce)
    }
    for (const value of labels) {
      paintLabel(value)
      if (portrait && value.mesh.parent === portraitGroup) {
        // Hosts can give the rotate screen a full portrait viewport. Preserve
        // glyph proportions while retaining the public 1920×1080 hit space.
        const aspectCompensation = (viewport.width || W) * H / ((viewport.height || H) * W)
        value.mesh.scale.y *= aspectCompensation
      }
    }
    layout = { paused, portrait, touch, viewport: { ...viewport }, phase, locale: currentLocale }
  }

  function hit(x, y) {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(y)) return null
    const activeModal = portraitGroup.visible ? portraitGroup : pausedGroup.visible ? pausedGroup : resultGroup.visible ? resultGroup : selection.visible ? selection : null
    for (let i = buttons.length - 1; i >= 0; i--) {
      const value = buttons[i], b = value.bounds
      if (!value.enabled || !b || !visibleThroughParents(value.back) || (activeModal && value.parent !== activeModal)) continue
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return value.action
    }
    return null
  }
  function render() {
    if (disposed) return
    const autoClear = renderer.autoClear; renderer.autoClear = false
    renderer.clearDepth(); renderer.render(scene, camera); renderer.autoClear = autoClear
  }
  function snapshot() {
    const result = {}
    const activeModal = portraitGroup.visible ? portraitGroup : pausedGroup.visible ? pausedGroup : resultGroup.visible ? resultGroup : selection.visible ? selection : null
    for (const value of buttons) if (value.enabled && value.bounds && visibleThroughParents(value.back) && (!activeModal || value.parent === activeModal)) result[value.action] = { ...value.bounds }
    return { ready: !disposed, ...layout, buttons: result, designSize: [W, H], scoreText: { blue: blueScore.text.trim(), red: redScore.text.trim() }, timeText: timer.text.trim(),
      serveCountdown: { visible: !disposed && serveGroup.visible, value: Number(serveNumber.text.trim()) || 0, label: COPY[currentLocale].servePrepare, bounds: { ...serveBounds } },
      scene: { name: scene.name, meshes: geometries.size, materials: materials.size, atlasSize: [atlas.width, atlas.height], textureVersion: atlas.texture.version, burstTextureVersion: burstTexture.version, completePrewarm: true },
      feedback: feedback ? { key: feedback.key, level: feedback.major ? 3 : 2, burstVisible: feedbackGroup.visible && burst.visible, textScale: phrase.scale.x, burstScale: burst.scale.x } : null }
  }
  function dispose() {
    if (disposed) return
    disposed = true; feedback = null
    for (const value of geometries) value.dispose()
    for (const value of materials) value.dispose()
    atlas.texture.dispose(); burstTexture.dispose()
    if (atlas.ownedFont) document.fonts.delete(atlas.ownedFont)
    scene.clear()
  }
  // Warm every shader/material/geometry, including hidden modals and both Sprite
  // paths, on a tiny offscreen target. The first click cannot compile a new HUD.
  for (const value of labels) paintLabel(value)
  for (const line of numbers) setNumber(line, '0', 0)
  const warmupTarget = new THREE.WebGLRenderTarget(8, 8)
  const previousTarget = renderer.getRenderTarget(), previousAutoClear = renderer.autoClear
  const previousViewport = renderer.getViewport(new THREE.Vector4()), previousScissor = renderer.getScissor(new THREE.Vector4()), previousScissorTest = renderer.getScissorTest()
  try {
    renderer.initTexture(atlas.texture); renderer.initTexture(burstTexture)
    renderer.setRenderTarget(warmupTarget); renderer.setViewport(0, 0, 8, 8); renderer.setScissorTest(false)
    scene.traverse(object => { object.visible = true })
    renderer.autoClear = true; renderer.render(scene, camera)
  } finally {
    renderer.setRenderTarget(previousTarget); renderer.setViewport(previousViewport); renderer.setScissor(previousScissor); renderer.setScissorTest(previousScissorTest)
    renderer.autoClear = previousAutoClear; warmupTarget.dispose()
  }
  // An offscreen target uses a different output color space from the canvas.
  // Compile the restored destination too, while every hidden UI is still
  // visible, so entering a menu cannot produce a second shader compilation.
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera)
  else if (renderer.compile) renderer.compile(scene, camera)
  update({ phase: 'selection', elapsed: 0, timeRemaining: 180, players: [], scores: { blue: 0, red: 0 } })
  return { scene, camera, update, hit, render, snapshot, dispose }
}

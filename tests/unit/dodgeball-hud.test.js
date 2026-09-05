import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDodgeballHud } from '../../src/interactions/dodgeball/hud.js'

// Layout/lifecycle tests use a canvas spy. Real shader compilation and visual
// fidelity are checked in the browser; the spy catches hot-path text painting.
function harness() {
  let paints = 0, fontDisposals = 0
  const context = {
    font: '', measureText(text) { const size = Number(this.font.match(/(\d+)px/)?.[1] || 40); return { width: text.length * size * .7, actualBoundingBoxAscent: size * .8, actualBoundingBoxDescent: size * .2 } },
    save() {}, restore() {}, translate() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    strokeText() { paints++ }, fillText() { paints++ }, fill() { paints++ },
  }
  const documentBefore = globalThis.document, fontBefore = globalThis.FontFace
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }), fonts: { [Symbol.iterator]: function* () {}, load: async () => [], add() {}, delete() { fontDisposals++ } } }
  globalThis.FontFace = class { async load() { return this } }
  let target = null
  const renderer = {
    autoClear: true, getRenderTarget: () => target, setRenderTarget: value => { target = value },
    getViewport: value => value.set(0, 0, 1920, 1080), getScissor: value => value.set(0, 0, 1920, 1080), getScissorTest: () => false,
    setViewport() {}, setScissor() {}, setScissorTest() {}, initTexture() {}, clearDepth() {}, render() {},
  }
  return { renderer, get paints() { return paints }, get fontDisposals() { return fontDisposals }, restore() { globalThis.document = documentBefore; globalThis.FontFace = fontBefore } }
}
const initial = () => ({
  phase: 'held', elapsed: 1, timeRemaining: 180, ballMode: 'pingpong', controlledId: 'b1', attackTeam: 'blue',
  players: ['b1', 'b2', 'r1', 'r2'].map(id => ({ id, team: id[0] === 'b' ? 'blue' : 'red', alive: true })),
  scores: { blue: 0, red: 0 }, charge: 0, holdElapsed: 0,
})

test('HUD keeps gameplay text GPU-only and releases its owned resources', async () => {
  const env = harness()
  try {
    const hud = await createDodgeballHud({ renderer: env.renderer })
    const paints = env.paints, atlasVersion = hud.snapshot().scene.textureVersion
    const state = initial()
    for (const score of [0, 1, 9, 10, 99, 100, 999]) {
      state.elapsed += .2; state.scores.blue = score; state.timeRemaining--
      hud.update(state); hud.render()
      assert.equal(hud.snapshot().scoreText.blue, String(score).padStart(3, '0'))
    }
    hud.update({ ...state, locale: 'en', feedback: { code: 'hit', id: 1 }, elapsed: 4 })
    hud.update({ ...state, locale: 'en', feedback: { code: 'hit', id: 1 }, elapsed: 4.1 })
    assert.equal(hud.snapshot().feedback.level, 2)
    assert.equal(hud.snapshot().feedback.burstVisible, false)
    hud.update({ ...state, phase: 'switching', elapsed: 5 })
    hud.update({ ...state, phase: 'switching', elapsed: 5.1 })
    assert.equal(hud.snapshot().feedback.level, 3)
    assert.equal(hud.snapshot().feedback.burstVisible, true)
    assert.notEqual(hud.snapshot().feedback.textScale, hud.snapshot().feedback.burstScale)
    assert.equal(env.paints, paints)
    assert.equal(hud.snapshot().scene.textureVersion, atlasVersion)
    let disposals = 0
    hud.scene.traverse(node => { if (node.geometry && !(node instanceof THREE.Sprite)) node.geometry.addEventListener('dispose', () => { disposals++ }) })
    hud.dispose(); hud.dispose()
    assert.equal(hud.snapshot().ready, false)
    assert.equal(hud.hit(960, 636), null)
    assert.ok(disposals > 70)
    assert.equal(env.fontDisposals, 1)
  } finally { env.restore() }
})

test('one K/left action explains aligned straight throws while touch hit areas and prewarmed resources stay unchanged', async () => {
  const env = harness()
  try {
    const hud = await createDodgeballHud({ renderer: env.renderer })
    const paints = env.paints, resources = hud.snapshot().scene
    const footer = hud.scene.getObjectByName('dodgeball-desktop-footer')
    const touchBand = hud.scene.getObjectByName('dodgeball-touch-safe-band')
    const copy = {
      'zh-CN': {
        controls: 'WASD / 方向键移动 · K / 左键投接 · 空格跳跃',
        attack: 'W/S 或 ↑↓ 上下对位 · 按住 K / 左键蓄力，松开直投', defend: '按 K 或单击左键接球，无需瞄准来球',
        touchAttack: '上下移动对位 · 按住投球蓄力，松开直投', touchDefend: '摇杆移动躲避 · 来球靠近时按接球',
        throw: '投球', catch: '接球',
      },
      en: {
        controls: 'WASD / ARROWS MOVE · K / LEFT CLICK THROW & CATCH · SPACE JUMP',
        attack: 'W/S OR UP/DOWN TO LINE UP · HOLD K/LEFT, RELEASE STRAIGHT', defend: 'PRESS K OR LEFT CLICK TO CATCH · NO AIM NEEDED',
        touchAttack: 'MOVE UP/DOWN · HOLD THROW, RELEASE STRAIGHT', touchDefend: 'MOVE TO DODGE · TAP CATCH AS THE BALL NEARS',
        throw: 'THROW', catch: 'CATCH',
      },
    }
    const expectLabel = (text, width, height, parent = footer) => {
      const mesh = parent.getObjectByName(text)
      assert.ok(mesh?.visible, `Visible instruction: ${text}`)
      assert.ok(mesh.scale.x <= width && mesh.scale.y <= height, `Instruction fits its unchanged label box: ${text}`)
    }
    const hitAreasByRole = new Map()
    for (const [locale, text] of Object.entries(copy)) {
      const state = { ...initial(), locale }
      hud.update(state)
      assert.equal(footer.visible, true)
      expectLabel(text.controls, 1040, 34)
      expectLabel(text.attack, 900, 33)
      hud.update({ ...state, attackTeam: 'red', phase: 'flight' })
      assert.equal(footer.visible, true)
      expectLabel(text.controls, 1040, 34)
      expectLabel(text.defend, 900, 33)
      // Existing touch verbs/hit areas stay separate. The former place-caption
      // slot explains straight throwing without adding a mesh or moving a button.
      hud.update(state, { touch: true })
      assert.equal(footer.visible, false)
      assert.equal(touchBand.visible, true)
      assert.ok(touchBand.getObjectByName(text.throw)?.visible)
      assert.ok(touchBand.getObjectByName(text.catch)?.visible)
      expectLabel(text.touchAttack, 840, 30, touchBand)
      const attackAreas = hud.snapshot().buttons
      if (!hitAreasByRole.has('attack')) hitAreasByRole.set('attack', attackAreas)
      else assert.deepEqual(attackAreas, hitAreasByRole.get('attack'))
      let bounds = hud.snapshot().buttons.throw
      assert.equal(hud.hit(bounds.cx, bounds.cy), 'throw')
      hud.update({ ...state, attackTeam: 'red', phase: 'flight' }, { touch: true })
      expectLabel(text.touchDefend, 840, 30, touchBand)
      const defendAreas = hud.snapshot().buttons
      if (!hitAreasByRole.has('defend')) hitAreasByRole.set('defend', defendAreas)
      else assert.deepEqual(defendAreas, hitAreasByRole.get('defend'))
      bounds = hud.snapshot().buttons.catch
      assert.equal(hud.hit(bounds.cx, bounds.cy), 'catch')
      assert.equal(env.paints, paints)
      assert.deepEqual(hud.snapshot().scene, resources)
    }
    hud.dispose()
  } finally { env.restore() }
})

test('phone buttons have 44 CSS pixel targets, do not overlap, and stay in the action band', async () => {
  const env = harness()
  try {
    const hud = await createDodgeballHud({ renderer: env.renderer })
    for (const [width, height] of [[844, 475], [667, 375], [480, 270]]) {
      for (const phase of ['selection', 'held', 'flight', 'finished']) {
        const state = { ...initial(), phase, winner: 'blue' }
        hud.update(state, { touch: true, viewport: { width, height } })
        const buttons = Object.entries(hud.snapshot().buttons)
        for (const [key, bounds] of buttons) {
          assert.ok(bounds.width * width / 1920 >= 44 - 1e-6, `${width} ${phase} ${key} width`)
          assert.ok(bounds.height * height / 1080 >= 44 - 1e-6, `${width} ${phase} ${key} height`)
          assert.equal(hud.hit(bounds.cx, bounds.cy), key)
          assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= 1920 && bounds.bottom <= 1080)
          if (['jump', 'throw', 'catch', 'joystick'].includes(key)) assert.ok(bounds.top >= 870)
        }
        for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
          const [ak, a] = buttons[i], [bk, b] = buttons[j]
          const overlap = Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)
          assert.equal(overlap, false, `${width} ${phase} ${ak}/${bk}`)
        }
      }
    }
    hud.update(initial(), { touch: true, paused: true, viewport: { width: 480, height: 270 } })
    assert.deepEqual(Object.keys(hud.snapshot().buttons).sort(), ['exit', 'resume'])
    hud.update(initial(), { touch: true, portrait: true, viewport: { width: 390, height: 844 } })
    assert.deepEqual(Object.keys(hud.snapshot().buttons), ['exit'])
    hud.dispose()
  } finally { env.restore() }
})

test('CPU serve countdown is bilingual, above play, pause-safe and never repaints its atlas', async () => {
  const env = harness()
  try {
    const hud = await createDodgeballHud({ renderer: env.renderer })
    const paints = env.paints, textureVersion = hud.snapshot().scene.textureVersion
    const state = { ...initial(), attackTeam: 'red', aiServeCountdown: 3 }
    for (const locale of ['zh-CN', 'en']) for (const touch of [false, true]) for (const value of [3, 2, 1]) {
      hud.update({ ...state, locale, aiServeCountdown: value, elapsed: 4 - value }, { touch })
      const cue = hud.snapshot().serveCountdown
      assert.equal(cue.visible, true); assert.equal(cue.value, value)
      assert.equal(cue.label, locale === 'en' ? 'CPU THROW · GET READY' : '电脑发球 · 准备躲避')
      assert.ok(cue.bounds.top > 243 && cue.bounds.bottom < 331)
      assert.equal(hud.hit(960, 284), null)
    }
    for (const patch of [{ phase: 'flight' }, { phase: 'returning' }, { phase: 'finished' }, { attackTeam: 'blue' }, { aiServeCountdown: 0 }]) {
      hud.update({ ...state, ...patch })
      assert.equal(hud.snapshot().serveCountdown.visible, false)
    }
    hud.update(state, { paused: true })
    assert.equal(hud.snapshot().serveCountdown.visible, false)
    hud.update(state, { portrait: true, touch: true })
    assert.equal(hud.snapshot().serveCountdown.visible, false)
    hud.update(state)
    assert.equal(hud.snapshot().serveCountdown.visible, true)
    assert.equal(env.paints, paints)
    assert.equal(hud.snapshot().scene.textureVersion, textureVersion)
    hud.dispose()
    assert.equal(hud.snapshot().serveCountdown.visible, false)
  } finally { env.restore() }
})

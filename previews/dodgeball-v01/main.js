import * as THREE from 'three'
import { createDodgeballScene } from '../../src/interactions/dodgeball/scene.js'

// This scene is an art-direction sample. Coordinates outside the building are
// composition values, not claims about the historic playground or game rules.
const canvas = document.querySelector('#stage')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.12
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.shadowMap.autoUpdate = false
renderer.info.autoReset = false
const sampleScene = createDodgeballScene()
const { scene, camera, cameraTarget, players, building, ball } = sampleScene

// All visible labels and controls are WebGL meshes. Both language sets are
// packed once into one atlas; switching language only changes visibility.
const hud = new THREE.Scene(); hud.name = 'sample-webgl-hud'
const hudCamera = new THREE.OrthographicCamera(0, 1920, 1080, 0, .1, 10)
hudCamera.position.z = 5
const languageGroups = { 'zh-CN': new THREE.Group(), en: new THREE.Group() }
hud.add(...Object.values(languageGroups))
const hudColors = { ink: '#30464d', quiet: '#52675f', gold: '#f2d18b', red: '#bf6747', blue: '#497d8c' }
let locale = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh-CN'
let hudVisible = true, paused = false, disposed = false
const copy = {
  'zh-CN': { title: '热血躲避', mode: '乒乓球模式', attack: '蓝队 · 两端投接', defend: '红队 · 中间躲避', place: '二号楼前 · 夏日操场', rhythm: '投出去，躲开，再接住。', pause: '暂停', exit: '退出', language: 'EN', paused: '构图已暂停', resume: '点击或按 Esc 继续查看', titlePage: '热血躲避 · 3D 构图样张' },
  en: { title: 'HOT-BLOODED DODGE', mode: 'PING-PONG BALL', attack: 'BLUE · THROW & CATCH', defend: 'RED · DODGE IN THE MIDDLE', place: 'BUILDING 2 · SUMMER PLAYGROUND', rhythm: 'Throw. Dodge. Catch. Repeat.', pause: 'PAUSE', exit: 'EXIT', language: '中文', paused: 'SAMPLE PAUSED', resume: 'Click or press Esc to continue', titlePage: 'Hot-Blooded Dodge · 3D Composition Sample' },
}
const FONT_URL = new URL('../../public/assets/fonts/pixel/4lite-fusion-pixel-12px-ui-v02.woff2', import.meta.url).href
const sampleFontFace = await new FontFace('4Lite Sample Pixel', `url("${FONT_URL}")`).load()
document.fonts.add(sampleFontFace)
const atlasCanvas = document.createElement('canvas'); atlasCanvas.width = 2048; atlasCanvas.height = 1024
const context = atlasCanvas.getContext('2d')
const atlasTexture = new THREE.CanvasTexture(atlasCanvas)
atlasTexture.name = 'sample-bilingual-label-atlas'; atlasTexture.colorSpace = THREE.SRGBColorSpace
atlasTexture.minFilter = THREE.LinearMipmapLinearFilter; atlasTexture.magFilter = THREE.LinearFilter
const atlasMaterial = new THREE.MeshBasicMaterial({ name: 'sample-hud-type', map: atlasTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
const labelEntries = []
function addLabel(text, parent, x, y, width, height, { size = 38, color = hudColors.ink, arcade = false } = {}) {
  const index = labelEntries.length, col = index % 4, row = Math.floor(index / 4)
  const ax = col * 512, ay = row * 128
  context.save(); context.beginPath(); context.rect(ax, ay, 512, 128); context.clip()
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineJoin = 'round'
  // The shared font is a subset. Use the system's complete Chinese family for
  // Chinese phrases so a single label never mixes two incompatible glyph styles.
  const family = /[\u3400-\u9fff]/u.test(text) ? '"PingFang SC", "Microsoft YaHei", sans-serif' : '"4Lite Sample Pixel", sans-serif'
  // Font size is specified in final 1920px-frame pixels. Atlas sampling always
  // preserves its 4:1 aspect, including the small language/pause/exit buttons.
  let fitted = size * 512 / width
  context.font = `900 ${fitted}px ${family}`
  while (context.measureText(text).width > 476 && fitted > 16) { fitted -= 1; context.font = `900 ${fitted}px ${family}` }
  if (arcade) {
    context.strokeStyle = '#2f4653'; context.lineWidth = 7; context.strokeText(text, ax + 259, ay + 68)
    context.strokeStyle = '#bd6846'; context.lineWidth = 4; context.strokeText(text, ax + 257, ay + 66)
    context.strokeStyle = color; context.lineWidth = 1.6; context.strokeText(text, ax + 256, ay + 62)
  }
  context.fillStyle = color; context.fillText(text, ax + 256, ay + 62); context.restore()
  const displayHeight = width / 4
  const geometry = new THREE.PlaneGeometry(width, displayHeight)
  const uv = geometry.getAttribute('uv'), u0 = ax / 2048, u1 = (ax + 512) / 2048, v0 = 1 - (ay + 128) / 1024, v1 = 1 - ay / 1024
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0)
  const mesh = new THREE.Mesh(geometry, atlasMaterial); mesh.position.set(x, 1080 - y, 0); mesh.name = text
  // Report painted glyph bounds rather than the transparent atlas cell edges.
  context.font = `900 ${fitted}px ${family}`; context.textAlign = 'center'; context.textBaseline = 'middle'
  const metrics = context.measureText(text), factor = width / 512, padding = arcade ? 9 : 2
  parent.add(mesh); labelEntries.push({ text, locale: parent.name, overlay: parent.renderOrder === 20,
    bounds: { left: x - (metrics.actualBoundingBoxLeft + padding) * factor, right: x + (metrics.actualBoundingBoxRight + padding) * factor,
      top: y + (-2 - metrics.actualBoundingBoxAscent - padding) * factor, bottom: y + (-2 + metrics.actualBoundingBoxDescent + padding) * factor } })
  return mesh
}
const flatMaterials = new Map()
function hudRect(parent, x, y, w, h, color, z = -.15) {
  if (!flatMaterials.has(color)) flatMaterials.set(color, new THREE.MeshBasicMaterial({ name: `hud-flat-${color}`, color, depthTest: false, depthWrite: false, toneMapped: false }))
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), flatMaterials.get(color))
  mesh.position.set(x, 1080 - y, z); parent.add(mesh); return mesh
}
const pauseGroups = {}
for (const [lang, group] of Object.entries(languageGroups)) {
  group.name = lang; const t = copy[lang]
  // Solid, quiet score ribbons preserve legibility over the cropped facade.
  hudRect(group, 283, 76, 430, 70, '#e7e4ce')
  hudRect(group, 1655, 76, 420, 70, '#e7e4ce')
  hudRect(group, 960, 81, 540, 120, '#31434a')
  hudRect(group, 960, 145, 540, 5, '#bf6747')
  addLabel(t.title, group, 960, 68, 520, 130, { size: 58, color: hudColors.gold, arcade: true })
  addLabel(t.mode, group, 960, 118, 430, 86, { size: 22, color: '#eee5ce' })
  hudRect(group, 89, 76, 42, 42, hudColors.blue)
  hudRect(group, 1466, 76, 42, 42, hudColors.red)
  addLabel(t.attack, group, 292, 76, 365, 92, { size: 24 })
  addLabel(t.defend, group, 1672, 76, 365, 92, { size: 24 })
  hudRect(group, 283, 111, 430, 3, hudColors.blue)
  hudRect(group, 1655, 111, 420, 3, hudColors.red)
  addLabel(t.place, group, 304, 996, 490, 100, { size: 26 })
  addLabel(t.rhythm, group, 304, 1033, 490, 82, { size: 20, color: hudColors.quiet })
  hudRect(group, 1808, 1008, 90, 46, '#dce0ce')
  addLabel(t.language, group, 1808, 1008, 160, 68, { size: 24 })
  hudRect(group, 1767, 161, 86, 46, '#dce0ce')
  addLabel(t.pause, group, 1767, 161, 160, 64, { size: 21 })
  hudRect(group, 1856, 161, 70, 44, '#dce0ce')
  addLabel(t.exit, group, 1856, 161, 150, 60, { size: 20 })
  const pauseGroup = new THREE.Group(); pauseGroup.name = lang; pauseGroup.visible = false; pauseGroup.renderOrder = 20; group.add(pauseGroup)
  hudRect(pauseGroup, 960, 520, 590, 180, '#eee5ce', .4)
  addLabel(t.paused, pauseGroup, 960, 494, 540, 106, { size: 42, color: hudColors.gold, arcade: true })
  addLabel(t.resume, pauseGroup, 960, 556, 500, 86, { size: 26 })
  pauseGroup.children.forEach(mesh => { mesh.renderOrder = 20; mesh.position.z += .5 })
  pauseGroups[lang] = pauseGroup
}
atlasTexture.needsUpdate = true

const boundsOf = object => {
  const box = new THREE.Box3().setFromObject(object)
  const values = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).project(camera)
    values.push([(p.x + 1) * 960, (1 - p.y) * 540])
  }
  return { left: Math.min(...values.map(p => p[0])), right: Math.max(...values.map(p => p[0])), top: Math.min(...values.map(p => p[1])), bottom: Math.max(...values.map(p => p[1])) }
}
function render() {
  if (disposed) return
  languageGroups['zh-CN'].visible = hudVisible && locale === 'zh-CN'
  languageGroups.en.visible = hudVisible && locale === 'en'
  for (const group of Object.values(pauseGroups)) group.visible = paused
  renderer.info.reset(); renderer.autoClear = true; renderer.render(scene, camera)
  const worldStats = { ...renderer.info.render }
  if (hudVisible) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(hud, hudCamera) }
  renderer.autoClear = true
  document.title = copy[locale].titlePage; document.documentElement.lang = locale
  canvas.setAttribute('aria-label', locale === 'en' ? 'Static 3D dodgeball composition. L changes language, Esc shows pause, X hides the HUD; click to restore.' : '躲避球静态3D构图。L切换语言，Esc暂停显示，X隐藏HUD；点击恢复。')
  window.__DODGEBALL_SAMPLE_STATS__ = { world: worldStats, total: { ...renderer.info.render }, memory: { ...renderer.info.memory } }
}
function resize() {
  const rect = canvas.getBoundingClientRect()
  renderer.setSize(Math.round(rect.width), Math.round(rect.height), false)
  render()
}
function setLocale(value) { locale = value === 'en' ? 'en' : 'zh-CN'; render(); return snapshot() }
function snapshot() {
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true)
  const materials = new Set(), geometries = new Set(); let texturedWorldMaterials = 0
  scene.traverse(object => { if (!object.isMesh) return; geometries.add(object.geometry); for (const mat of [object.material].flat()) materials.add(mat) })
  for (const mat of materials) if (mat.map) texturedWorldMaterials++
  return { ready: true, version: 1, locale, paused, hudVisible, size: [canvas.width, canvas.height], sceneMaterials: materials.size,
    sceneGeometries: geometries.size, texturedWorldMaterials, modelPolicy: 'complete-single-geometry-set-no-lod',
    camera: { projection: 'perspective', position: camera.position.toArray(), target: cameraTarget.toArray(), verticalFov: camera.fov,
      framing: 'centered-low-angle-playground', horizontalSpanAtTarget: 2 * camera.position.distanceTo(cameraTarget) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect },
    building: boundsOf(building), buildingGeometry: building.userData, players: players.children.filter(child => child.isGroup).map(child => ({ name: child.name, bounds: boundsOf(child) })),
    ball: boundsOf(ball), sharedScene: sampleScene.snapshot(), labels: labelEntries.filter(label => label.locale === locale), ...window.__DODGEBALL_SAMPLE_STATS__ }
}
function onPointer(event) {
  if (paused) { paused = false; render(); return }
  if (!hudVisible) { hudVisible = true; render(); return }
  const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * 1920, y = (event.clientY - rect.top) / rect.height * 1080
  if (x > 1763 && x < 1853 && y > 985 && y < 1031) setLocale(locale === 'en' ? 'zh-CN' : 'en')
  else if (x > 1724 && x < 1810 && y > 138 && y < 184) { paused = true; render() }
  else if (x > 1821 && y > 139 && y < 183) { hudVisible = false; render() }
}
function onKey(event) {
  if (event.repeat) return
  if (event.code === 'KeyL') setLocale(locale === 'en' ? 'zh-CN' : 'en')
  if (event.code === 'Escape') { paused = !paused; render() }
  if (event.code === 'KeyX') { hudVisible = !hudVisible; paused = false; render() }
}
function dispose() {
  disposed = true; removeEventListener('resize', resize); removeEventListener('keydown', onKey); canvas.removeEventListener('pointerdown', onPointer)
  const geometries = new Set(), materials = new Set()
  for (const root of [hud]) root.traverse(o => {
    if (o.isInstancedMesh) o.dispose()
    if (o.geometry) geometries.add(o.geometry)
    if (o.material) for (const m of [o.material].flat()) materials.add(m)
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  atlasTexture.dispose(); sampleScene.dispose(); renderer.dispose(); document.fonts.delete(sampleFontFace)
}
addEventListener('resize', resize); addEventListener('keydown', onKey); canvas.addEventListener('pointerdown', onPointer)
window.__DODGEBALL_SAMPLE__ = { snapshot, setLocale, render, dispose, setHudVisible(value) { hudVisible = Boolean(value); paused = false; render() } }
renderer.shadowMap.needsUpdate = true
resize()
// Prewarm both language sets and the sample pause panel before exposing the
// finished frame. Later toggles only change visibility, without GPU uploads.
const initialLocale = locale
for (const language of ['en', 'zh-CN']) { locale = language; paused = true; render() }
locale = initialLocale; paused = false; render()
if (import.meta.hot) import.meta.hot.dispose(dispose)

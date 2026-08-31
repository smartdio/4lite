import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createPlayerNavigation } from './navigation/player-navigation.js'
import { createPointWalkController } from './navigation/point-walk-controller.js'
import { CAMPUS } from './campus-config.js'
import { ACTIVE_PERFORMANCE_PROFILE } from './config/performance-profiles.js'
import { BANYAN_FOLIAGE_LIGHTING } from './config/banyan-foliage-lighting.js'
import { createMaterialLibrary } from './materials/material-library.js'
import { createAssetLoader } from './assets/asset-loader.js'
import { createGameAudio } from './audio/game-audio.js'
import { createWebglHud } from './ui/webgl-hud.js'
import { createPersonalRecordBook } from './ui/personal-record-book.js'
import { createSiteQrOverlay } from './ui/site-qr-overlay.js'
import { createPersonalRecords } from './state/personal-records.js'
import { createPerimeterEnvironment } from './environment/perimeter-environment.js'
import { createSunGlare } from './environment/sun-glare.js'
import { createBambooClimbGame } from './interactions/bamboo-climb-game.js'
import { createLongJumpGame } from './interactions/long-jump-game.js'
import { createHopscotchController } from './interactions/hopscotch-controller.js'
import { createShuttlecockController } from './interactions/shuttlecock-controller.js'
import { createJacksGame } from './interactions/jacks-controller.js'
import { createOctopusHandheldGame } from './interactions/octopus-handheld-game.js'
import { createFireHandheldGame } from './interactions/fire-handheld-game.js'
import { createRubiksCubeGame } from './interactions/rubiks-cube-game.js'
import { createFlagRaisingController } from './interactions/flag-raising-controller.js'
import { createPassageMediaLinks } from './interactions/passage-media-links.js'
import { bindSiteFooterQrCards, renderSiteFooterLinks, SITE_LINKS } from './site-links.js'
const {entranceBackgroundUrl,entranceMobileBackgroundUrl,approvedLogoUrl}=window.__4LITE_ENTRY_ASSETS__
const entryMusic=window.__4LITE_ENTRY_MUSIC__

const automatedTestBuild=import.meta.env.VITE_ENABLE_TEST_API==='1'
const gameAudio=createGameAudio()
const personalRecords=createPersonalRecords()
personalRecords.importLegacy()

// Three.js的独立纹理、GLB内嵌图片和统一资产加载器最终都会经过默认LoadingManager。
// 入口不仅等待业务模型Promise，也等待这里的物理资源计数归零；最终失败的纹理
// 会阻止放行，而同URL后续重试成功会清除之前的失败记录。
const runtimeLoadTracker=(()=>{
  const manager=THREE.DefaultLoadingManager
  const originalStart=manager.itemStart.bind(manager)
  const originalEnd=manager.itemEnd.bind(manager)
  const originalError=manager.itemError.bind(manager)
  const activeByUrl=new Map(),failedAttempts=new Map(),finalFailures=new Set(),waiters=new Set()
  const normalize=url=>new URL(url,document.baseURI).href
  let active=0
  const settle=()=>{
    if(active!==0)return
    const error=finalFailures.size
      ?new Error(`校园纹理加载失败：${[...finalFailures].map(url=>new URL(url).pathname).join('、')}`)
      :null
    for(const waiter of waiters)error?waiter.reject(error):waiter.resolve(true)
    waiters.clear()
  }
  manager.itemStart=url=>{
    const key=normalize(url)
    active++;activeByUrl.set(key,(activeByUrl.get(key)??0)+1)
    originalStart(url)
  }
  manager.itemError=url=>{
    const key=normalize(url)
    failedAttempts.set(key,(failedAttempts.get(key)??0)+1)
    originalError(url)
  }
  manager.itemEnd=url=>{
    const key=normalize(url),failed=failedAttempts.get(key)??0
    if(failed>0) {
      finalFailures.add(key)
      if(failed===1)failedAttempts.delete(key);else failedAttempts.set(key,failed-1)
    } else finalFailures.delete(key)
    const count=activeByUrl.get(key)??0
    if(count<=1)activeByUrl.delete(key);else activeByUrl.set(key,count-1)
    active=Math.max(0,active-1)
    originalEnd(url);settle()
  }
  return {
    waitForIdle:()=>active===0
      ?(finalFailures.size?Promise.reject(new Error(`校园纹理加载失败：${[...finalFailures].map(url=>new URL(url).pathname).join('、')}`)):Promise.resolve(true))
      :new Promise((resolve,reject)=>waiters.add({resolve,reject})),
    ignoreFailure:url=>finalFailures.delete(normalize(url)),
    snapshot:()=>({active,failures:[...finalFailures],pending:[...activeByUrl.keys()]}),
  }
})()

const app = document.querySelector('#app')
app.innerHTML = `
  <div class="experience-gate" id="experience-gate">
    <section class="entry-screen" id="entry-screen" aria-label="四小">
      <div class="entry-wash"></div>
      <div class="entry-content">
        <img class="entry-logo" src="${approvedLogoUrl}" alt="四小" width="1774" height="887" />
        <p class="entry-copy" id="entry-copy">风从走廊那边吹过来。<br>回去看看，那年的校园。</p>
        <button class="entry-primary" id="enter-campus" type="button">
          <span>回到那年夏天</span><i aria-hidden="true">→</i>
        </button>
        <div class="entry-secondary-actions">
          <button class="entry-music-toggle" id="entry-music-toggle" type="button" aria-pressed="false">
            <i aria-hidden="true">♪</i><span>开启音乐</span>
          </button>
          <span class="entry-secondary-rule" aria-hidden="true"></span>
          <nav class="entry-links" aria-label="项目说明">
            <a href="./about/">关于</a><a href="./help/">帮助</a>
          </nav>
        </div>
        <p class="entry-footnote">建议佩戴耳机 · 点击后载入校园</p>
      </div>
      <footer class="entry-media-footer">${renderSiteFooterLinks()}</footer>
    </section>
    <section class="loading-screen" id="loading-screen" aria-live="polite" aria-hidden="true">
      <div class="loading-card">
        <p class="loading-eyebrow">进入校园以前</p>
        <h1 id="loading-tip-title">在校园里慢慢走</h1>
        <p class="loading-tip-text" id="loading-tip-text">从校门进入，以第一人称探索走廊、教室、操场和树荫，也可以随时切换鸟瞰。</p>
        <p class="loading-message" id="loading-message">正在整理旧课桌和走廊……</p>
        <div class="loading-rule" aria-hidden="true"><i id="loading-bar"></i></div>
        <div class="loading-meta">
          <span id="loading-count">准备资源 0 / …</span>
          <strong id="loading-percent">0%</strong>
        </div>
        <button class="loading-retry" id="loading-retry" type="button" hidden>重新加载</button>
      </div>
    </section>
  </div>
  <div class="hud">
    <div class="crosshair"></div>
    <div class="toast" id="toast"></div>
    <div class="touch-controls" id="touch-controls" aria-hidden="true">
      <div class="touch-look-zone" id="touch-look-zone" aria-label="拖动观察方向；绿色定位标记出现时轻触前往，自动行走中轻触停止；对准物件时轻触互动"></div>
      <div class="touch-joystick" id="touch-joystick" aria-label="移动摇杆">
        <div class="touch-joystick-base"><i id="touch-joystick-knob"></i></div>
      </div>
    </div>
  </div>`

bindSiteFooterQrCards()

const experienceGate=document.querySelector('#experience-gate')
const entryScreen=document.querySelector('#entry-screen')
const loadingScreen=document.querySelector('#loading-screen')
const enterCampusButton=document.querySelector('#enter-campus')
const entryMusicButton=document.querySelector('#entry-music-toggle')
const loadingMessage=document.querySelector('#loading-message')
const loadingBar=document.querySelector('#loading-bar')
const loadingCount=document.querySelector('#loading-count')
const loadingPercent=document.querySelector('#loading-percent')
const loadingRetry=document.querySelector('#loading-retry')
const loadingTipTitle=document.querySelector('#loading-tip-title')
const loadingTipText=document.querySelector('#loading-tip-text')
const touchControls=document.querySelector('#touch-controls')
const touchLookZone=document.querySelector('#touch-look-zone')
const touchJoystick=document.querySelector('#touch-joystick')
const touchJoystickKnob=document.querySelector('#touch-joystick-knob')
const loadingMessages=[
  '正在整理旧课桌和走廊……',
  '正在让阳光落进教室……',
  '正在叫醒操场边的树影……',
  '正在把风送回校园……',
]
const loadingTips=[
  ['在校园里慢慢走','从校门进入，以第一人称探索走廊、教室、操场和树荫，也可以随时切换鸟瞰。'],
  ['推开门，坐回课桌旁','靠近教室里的门窗和课桌，用准星寻找互动提示；坐下以后还可以翻看旧课本和作业本。'],
  ['在黑板上留下几笔','22块教学黑板都可以书写、擦除和撤销，画下的内容会保存在当前浏览器里。'],
  ['捡起一支粉笔','讲台和教室里散落着粉笔。拾起后可以蓄力抛出，落地的粉笔还能再次捡起。'],
  ['去操场投几个球','校园里的篮球可以拾取、投掷、推动和踢动；从不同距离命中会得到2分、3分或4分。'],
  ['打一局旧球桌乒乓球','西侧六张乒乓球桌都能游玩，可以自由练习，也可以和电脑进行先得7分的比赛。'],
  ['看见绿色标记就能前往','稍微看向地面，出现绿色定位标记时点击或轻触即可自动走过去；途中仍可环视，再次点击或使用移动键即可停止。'],
  ['手机也可以走进校园','左侧摇杆负责移动，拖动画面观察方向；绿色标记出现时轻触前往，对准物件时轻触互动。'],
]
let loadingTipIndex=0
let loadingTipTimer=null
const showLoadingTip=index=>{
  loadingTipIndex=index%loadingTips.length
  const [title,text]=loadingTips[loadingTipIndex]
  loadingTipTitle.textContent=title
  loadingTipText.textContent=text
}
const startLoadingTips=()=>{
  if(loadingTipTimer)return
  showLoadingTip(0)
  loadingTipTimer=setInterval(()=>showLoadingTip(loadingTipIndex+1),5200)
}
const stopLoadingTips=()=>{
  clearInterval(loadingTipTimer)
  loadingTipTimer=null
}
entryMusic.refresh()
let loadingTaskTotal=0
let loadingTaskCompleted=0
let sceneIsReady=false
let experienceRequested=false
let loadingFailure=null
let loadingRequestedAt=null
let businessAssetsReadyAt=null
let physicalAssetsReadyAt=null
let scenePreGpuMs=null
let arrivalRevealScheduled=false

const updateLoadingUi=()=>{
  const ratio=sceneIsReady?1:Math.min(.92,loadingTaskCompleted/loadingTaskTotal*.9)
  const percent=Math.round(ratio*100)
  loadingBar.style.transform=`scaleX(${ratio})`
  loadingCount.textContent=sceneIsReady?'校园已经准备好':`准备资源 ${loadingTaskCompleted} / ${loadingTaskTotal}`
  loadingPercent.textContent=`${percent}%`
  loadingMessage.textContent=sceneIsReady
    ?'放学以前，再去校园里走一走吧。'
    :loadingMessages[Math.min(loadingMessages.length-1,Math.floor(loadingTaskCompleted/loadingTaskTotal*loadingMessages.length))]
}
const revealCampus=()=>{
  if(!experienceRequested||!sceneIsReady)return
  if(arrivalRevealScheduled)return
  arrivalRevealScheduled=true
  updateLoadingUi()
  setTimeout(()=>{
    stopLoadingTips()
    entryMusic.fadeOut(900)
    experienceGate.classList.add('is-leaving')
    const finishGateTransition=event=>{
      // 子层的 opacity/transform transitionend 会向上冒泡；只在外层遮罩自身
      // 完成淡出后隐藏，避免测试或快速设备提前越过入场准备阶段。
      if(event.target!==experienceGate)return
      experienceGate.removeEventListener('transitionend',finishGateTransition)
      experienceGate.hidden=true
    }
    experienceGate.addEventListener('transitionend',finishGateTransition)
    // 先让加载层开始变透明，再启动镜头；这样1.5秒快速下降的前段不会被
    // 不透明遮罩完全盖住，同时两者仍保持为一个连续的进入过程。
    if(shouldReduceArrivalMotion())startArrivalFlight()
    else setTimeout(startArrivalFlight,120)
  },480)
}
const showLoadingScreen=()=>{
  void entryMusic.playIfWanted()
  void gameAudio.unlock()
  gameAudio.play('uiClick',{volume:.72})
  experienceRequested=true
  loadingRequestedAt??=performance.now()
  // Pointer Lock只能由同步用户手势触发。入口按钮是进入体验前最后一次可靠
  // 点击，因此桌面端在这里先锁定画布；加载和飘落动画结束后可直接接管视角。
  // 自动测试构建保持不锁定，避免无头浏览器吞掉后续鼠标验收操作。
  requestGamePointerLock()
  startSceneLoading()
  entryScreen.setAttribute('aria-hidden','true')
  loadingScreen.setAttribute('aria-hidden','false')
  experienceGate.classList.add('is-loading')
  startLoadingTips()
  updateLoadingUi()
  if(loadingFailure) {
    loadingMessage.textContent='有一部分校园资源没有准备好。'
    loadingRetry.hidden=false
  } else revealCampus()
}
enterCampusButton.addEventListener('click',showLoadingScreen)
entryMusicButton.addEventListener('click',()=>void entryMusic.toggle())
loadingRetry.addEventListener('click',()=>location.reload())
if(window.__4LITE_AUTO_ENTER__) {
  delete window.__4LITE_AUTO_ENTER__
  queueMicrotask(showLoadingScreen)
}

const scene = new THREE.Scene()
const atmosphereColor=0x72bfe2
scene.background = new THREE.Color(atmosphereColor)
scene.fog = new THREE.Fog(atmosphereColor, 128, 210)

const performanceProfile=ACTIVE_PERFORMANCE_PROFILE
const highDensityTouchRendering=(matchMedia('(pointer: coarse)').matches||matchMedia('(hover: none)').matches)&&navigator.maxTouchPoints>0
const drawingBufferLimit=performanceProfile.renderer.maxDrawingBufferSize
const maxPixelRatioForViewport=(width=innerWidth,height=innerHeight)=>{
  const longEdge=Math.max(width,height),shortEdge=Math.min(width,height)
  if(longEdge<=0||shortEdge<=0)return 1
  return Math.min(drawingBufferLimit.longEdge/longEdge,drawingBufferLimit.shortEdge/shortEdge)
}
const requestedRendererPixelRatio=()=>Math.min(devicePixelRatio,performanceProfile.renderer.maxPixelRatio)
const requestedComposerPixelRatio=()=>highDensityTouchRendering
  ?Math.min(devicePixelRatio,performanceProfile.postProcessing.touchComposerPixelRatio)
  :performanceProfile.postProcessing.composerPixelRatio
let activeRendererPixelRatio=Math.min(requestedRendererPixelRatio(),maxPixelRatioForViewport())
let activeComposerPixelRatio=Math.min(requestedComposerPixelRatio(),maxPixelRatioForViewport())
const renderer = new THREE.WebGLRenderer({
  antialias:performanceProfile.renderer.antialias,
  preserveDrawingBuffer:performanceProfile.renderer.preserveDrawingBuffer,
})
renderer.setPixelRatio(activeRendererPixelRatio)
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = performanceProfile.renderer.shadowsEnabled
renderer.shadowMap.type = performanceProfile.renderer.shadowMapType
renderer.outputColorSpace = THREE.SRGBColorSpace
// 保留原有 Neutral 色调映射和亮部观感；全局层次只通过略收环境填光实现，
// 避免 ACES 把浅色墙面与地面推向过曝。
renderer.toneMapping = performanceProfile.renderer.toneMapping
renderer.toneMappingExposure = performanceProfile.renderer.toneMappingExposure
app.prepend(renderer.domElement)

const assetLoader = createAssetLoader(renderer,{maxConcurrent:performanceProfile.loading.maxConcurrentRequests})
const perimeterEnvironment=createPerimeterEnvironment({scene,assetLoader,atmosphereColor})
const SHARED_SAND_CEMENT_TEXTURE = 'sandpit-cement-rim-albedo-v01'
const SHARED_SAND_CEMENT_URL = '/assets/textures/sand/sandpit-cement-rim-albedo-v01.webp?v=2'
const SHARED_SAND_CEMENT_KTX2_URL = '/assets/textures/sand/sandpit-cement-rim-albedo-v01-uastc-rdo1.ktx2?v=1'
const ktx2PilotRequested=new URLSearchParams(location.search).get('ktx2Pilot')==='1'
const broadleafTextureCandidate=new URLSearchParams(location.search).get('broadleafTextureCandidate')
const banyanMeshoptCandidate=new URLSearchParams(location.search).get('banyanMeshoptCandidate')
const requestedBanyanFoliageCandidate=new URLSearchParams(location.search).get('banyanFoliage')?.toUpperCase()
const PLANTER_FLOWER_ATLAS_URL='/assets/textures/planter-flowers/planter-flower-atlas-v01-768.webp?v=1'
const dormitoryMeshoptCandidate=new URLSearchParams(location.search).get('dormitoryMeshoptCandidate')
const oldClassroomMeshoptCandidate=new URLSearchParams(location.search).get('oldClassroomMeshoptCandidate')
const toiletMeshoptCandidate=new URLSearchParams(location.search).get('toiletMeshoptCandidate')
const b2WindowWebpCandidate=new URLSearchParams(location.search).get('b2WindowWebpCandidate')
let sharedSandCementTexturePromise = null
let sharedSandTextureLoadState={requested:ktx2PilotRequested,selected:'webp',fallbackReason:null,gpuFormat:null}

function loadSharedSandCementTexture() {
  if (!sharedSandCementTexturePromise) {
    const loadCandidate=ktx2PilotRequested
      ? assetLoader.loadKtx2(SHARED_SAND_CEMENT_KTX2_URL).then(texture=>{
        sharedSandTextureLoadState.selected='ktx2'
        sharedSandTextureLoadState.gpuFormat={
          type:texture.type,format:texture.format,internalFormat:texture.internalFormat??null,
          compressed:Boolean(texture.isCompressedTexture),mipmaps:texture.mipmaps?.length??0,
        }
        return texture
      }).catch(error=>{
        runtimeLoadTracker.ignoreFailure(SHARED_SAND_CEMENT_KTX2_URL)
        sharedSandTextureLoadState.selected='webp-fallback'
        sharedSandTextureLoadState.fallbackReason=error?.message||String(error)
        return assetLoader.loadTexture(SHARED_SAND_CEMENT_URL)
      })
      : assetLoader.loadTexture(SHARED_SAND_CEMENT_URL)
    sharedSandCementTexturePromise = loadCandidate.then(texture => {
      texture.name = SHARED_SAND_CEMENT_TEXTURE
      texture.flipY = false
      texture.colorSpace = THREE.SRGBColorSpace
      // 沙池边框 UV 会超出 0–1 以按段平铺；共享纹理替换 GLB 内嵌图后
      // 必须恢复重复寻址，否则只有首格正常，其余边框会被末列像素拉伸。
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
      texture.needsUpdate = true
      texture.userData.sourceFormat = sharedSandTextureLoadState.selected
      return assetLoader.reuseTexture(SHARED_SAND_CEMENT_TEXTURE, texture)
    })
  }
  return sharedSandCementTexturePromise
}

function bindSharedSandCementTexture(material, texture) {
  if (material?.userData.sharedBaseColorTexture !== '../../textures/sand/sandpit-cement-rim-albedo-v01.png?v=1') return
  material.map = texture
  material.needsUpdate = true
}
const materialLibrary = createMaterialLibrary(renderer)
const sampleMat = materialLibrary.sample
const groundMat = materialLibrary.ground

// 玩家不会把视点贴到 18cm 以内；抬高近裁面可显著增加整座校园的深度缓冲精度，
// 避免远处和斜视角下相距数厘米的建筑表面重新落入同一深度层。
const DEFAULT_VERTICAL_FOV=50
const MOBILE_PORTRAIT_MIN_HORIZONTAL_FOV=50
const MOBILE_PORTRAIT_MAX_VERTICAL_FOV=82
const camera = new THREE.PerspectiveCamera(DEFAULT_VERTICAL_FOV, innerWidth / innerHeight, 0.18, 230)
camera.position.fromArray(CAMPUS.player.aerial.position)
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.fromArray(CAMPUS.player.aerial.target)
orbit.enableDamping = true
orbit.maxPolarAngle = Math.PI * .485
orbit.minDistance = 13
orbit.maxDistance = 155
const pointer = new PointerLockControls(camera, renderer.domElement)
let pointerLockAvailable='pointerLockElement' in document&&typeof renderer.domElement.requestPointerLock==='function'
let pointerLockHasSucceeded=false
let pointerLockRequestPending=false
const coarsePointerQuery=matchMedia('(pointer: coarse)')
const hoverlessQuery=matchMedia('(hover: none)')
let touchModePreferred=(coarsePointerQuery.matches||hoverlessQuery.matches)&&navigator.maxTouchPoints>0
function requestGamePointerLock() {
  if(automatedTestBuild||touchModePreferred||!pointerLockAvailable||pointer.isLocked)return pointer.isLocked
  if(pointerLockRequestPending)return false
  pointerLockRequestPending=true
  try {
    const request=pointer.lock()
    request?.catch?.(()=>{pointerLockRequestPending=false})
    setTimeout(()=>{if(!pointer.isLocked)pointerLockRequestPending=false},900)
  } catch {
    pointerLockRequestPending=false;enableFallbackControls()
  }
  return true
}
const syncCameraProjection=()=>{
  const aspect=innerWidth/innerHeight
  const isPhonePortrait=touchModePreferred&&innerHeight>innerWidth&&Math.min(innerWidth,innerHeight)<=600
  // 竖屏继续使用垂直视场会把水平视野压得很窄。手机竖屏改为保留至少 50°
  // 的水平视野，并限制最大垂直视场，避免超长屏产生明显鱼眼；横屏、平板和桌面不变。
  const portraitVerticalFov=THREE.MathUtils.radToDeg(2*Math.atan(
    Math.tan(THREE.MathUtils.degToRad(MOBILE_PORTRAIT_MIN_HORIZONTAL_FOV/2))/aspect,
  ))
  camera.aspect=aspect
  camera.fov=isPhonePortrait
    ?Math.min(MOBILE_PORTRAIT_MAX_VERTICAL_FOV,portraitVerticalFov)
    :DEFAULT_VERTICAL_FOV
  camera.updateProjectionMatrix()
}
const syncTouchModeClass=()=>document.body.classList.toggle('touch-input',touchModePreferred)
const syncVisualViewport=()=>{
  const viewport=visualViewport
  document.documentElement.style.setProperty('--app-height',`${viewport?.height??innerHeight}px`)
  document.documentElement.style.setProperty('--app-offset-top',`${viewport?.offsetTop??0}px`)
}
syncTouchModeClass();syncVisualViewport();syncCameraProjection()
for(const query of [coarsePointerQuery,hoverlessQuery])query.addEventListener?.('change',()=>{
  touchModePreferred=(coarsePointerQuery.matches||hoverlessQuery.matches)&&navigator.maxTouchPoints>0
  syncTouchModeClass();syncCameraProjection();octopusHandheldGame?.resize();fireHandheldGame?.resize();rubiksCubeGame?.resize()
})
visualViewport?.addEventListener('resize',syncVisualViewport)
visualViewport?.addEventListener('scroll',syncVisualViewport)
let fallbackLookDragging=false,fallbackLookMoved=false,fallbackLookLastX=0,fallbackLookLastY=0
renderer.domElement.tabIndex=0

// 半球光明确保持“顶亮、侧次之、底暗”的方向层级。地面端不能过亮，
// 否则室内直射太阳被屋顶挡住后，桌椅侧面会比桌面更亮。
const hemisphere=new THREE.HemisphereLight(0xdbe7f6,0x655f55,performanceProfile.lighting.hemisphereOutdoorIntensity)
scene.add(hemisphere)
// 直射光接近白色，只保留极轻的暖意，使亮部清洁而不泛黄。
const sun = new THREE.DirectionalLight(0xfff6e5, 4.7)
// 将光源和目标同时移到校园中心，保证阴影贴图集中覆盖可行走区域。
sun.position.set(-22,82,-14)
sun.target.position.set(0,0,-31)
scene.add(sun.target)
sun.castShadow = true
sun.shadow.mapSize.set(performanceProfile.shadows.mapSize,performanceProfile.shadows.mapSize)
sun.shadow.camera.left = sun.shadow.camera.bottom = -performanceProfile.shadows.cameraExtent
sun.shadow.camera.right = sun.shadow.camera.top = performanceProfile.shadows.cameraExtent
sun.shadow.camera.near = performanceProfile.shadows.cameraNear
sun.shadow.camera.far = performanceProfile.shadows.cameraFar
sun.shadow.bias = performanceProfile.shadows.bias
// 米制大场景中的斜屋面容易与自身阴影发生深度冲突；沿表面法线轻微偏移阴影采样。
sun.shadow.normalBias = performanceProfile.shadows.normalBias
scene.add(sun)

const sunGlareCandidate=new URLSearchParams(location.search).get('sunGlare')?.toLowerCase()||'medium'
const sunGlareStrength={off:0,soft:.65,medium:1,strong:1.35}[sunGlareCandidate]??1
const sunGlare=createSunGlare({
  scene,camera,
  direction:new THREE.Vector3().subVectors(sun.position,sun.target.position),
  strength:sunGlareStrength,
})
sunGlare.update()
if(sunGlareCandidate==='off')scene.getObjectByName('sun-glare-prototype').visible=false

// 无阴影补光会穿过屋顶，因此必须保持高入射角；低角度补光在教室里会错误地
// 成为侧向主光。它现在只温和找回顶部和背光面的颜色，不再抬亮竖直侧面。
const bounceFill=new THREE.DirectionalLight(0xffead1,.28)
bounceFill.position.set(18,58,-45)
bounceFill.target.position.set(0,3,-31)
scene.add(bounceFill.target,bounceFill)

// 用短距离环境光遮蔽表达构件交接，替代显式黑色描边。
// 半径控制在校园构件尺度内，低混合强度避免墙缝和室内形成黑圈。
const composer=new EffectComposer(renderer)
// 桌面继续以较低分辨率柔化AO；手机高密屏提升到1.5×，避免最终画面被0.75×放大而发糊。
composer.setPixelRatio(activeComposerPixelRatio)
composer.addPass(new RenderPass(scene,camera))
const gtaoProfile=performanceProfile.postProcessing.gtao
const gtaoPass=new GTAOPass(scene,camera,innerWidth,innerHeight,undefined,{
  ...gtaoProfile.outdoor,
},gtaoProfile.denoise)
gtaoPass.output=GTAOPass.OUTPUT.Default
gtaoPass.enabled=gtaoProfile.enabled
gtaoPass.blendIntensity=gtaoProfile.outdoor.blendIntensity
gtaoPass.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-60,-2,-76),new THREE.Vector3(36,16,10)))
composer.addPass(gtaoPass)
const smaaPass=new SMAAPass()
smaaPass.enabled=performanceProfile.postProcessing.smaaEnabled
composer.addPass(smaaPass)
composer.addPass(new OutputPass())
const webglHud=createWebglHud({renderer,isTouchMode:()=>touchModePreferred})
const personalRecordBook=createPersonalRecordBook({renderer,isTouchMode:()=>touchModePreferred})
const wechatChannelsLink=SITE_LINKS.find(link=>link.label==='视频号')
if(!wechatChannelsLink?.qrImageUrl)throw new Error('Missing configured WeChat Channels QR image')
const siteQrOverlay=createSiteQrOverlay({
  renderer,assetLoader,imageUrl:wechatChannelsLink.qrImageUrl,
  sourceImage:document.querySelector('[data-site-qr-trigger] img'),
  label:wechatChannelsLink.compactLabel??wechatChannelsLink.label,
})
let documentViewer=null,snackModelViewer=null,snackModelViewerPromise=null,overlayViewerSession=null
const overlayViewerOpen=()=>Boolean(documentViewer?.isOpen()||snackModelViewer?.isOpen())
const sceneOverlayOpen=()=>overlayViewerOpen()||siteQrOverlay.isOpen()||personalRecordBook.isOpen()
let personalRecordSession=null
const personalRecordViewModel=()=>{
  personalRecords.importLegacy()
  return personalRecords.viewModel({roomTotal:classroomInteriorZones.length||24,bookTotal:47,objectTypeTotal:5})
}
const openPersonalRecordMenu=()=>{
  if(personalRecordBook.isOpen()||overlayViewerOpen()||siteQrOverlay.isOpen()||!['walk','seated','aerial'].includes(mode))return false
  personalRecordSession={wasPointerLocked:pointer.isLocked,touchControlsAriaHidden:touchControls.getAttribute('aria-hidden')}
  pointerLockRequestPending=false;if(pointer.isLocked)pointer.unlock()
  if(touchModePreferred){resetTouchControls();touchControls.setAttribute('aria-hidden','true')}
  document.body.classList.add('personal-record-open')
  keys.clear();velocity.set(0,0,0);pointWalkController.cancel('personal-record-menu')
  personalRecordBook.openMenu(personalRecordViewModel());renderFrame();return true
}
const openPersonalRecordBook=(page='overview')=>{
  if(!personalRecordBook.isOpen()&&!openPersonalRecordMenu())return false
  personalRecordBook.openBook(personalRecordViewModel(),page);renderFrame();return true
}
const closePersonalRecordBook=()=>{
  if(!personalRecordBook.isOpen())return false
  const previous=personalRecordSession;personalRecordSession=null;personalRecordBook.close();document.body.classList.remove('personal-record-open');renderFrame()
  if(previous?.touchControlsAriaHidden!=null)touchControls.setAttribute('aria-hidden',previous.touchControlsAriaHidden)
  if(previous?.wasPointerLocked&&mode==='walk'&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  return true
}
let lastRendererInfo={render:{calls:0,triangles:0,lines:0,points:0,frame:0},memory:{geometries:0,textures:0}}
const renderFrame=()=>{
  renderer.info.reset()
  if(octopusHandheldGame?.snapshot().status==='active')octopusHandheldGame.render()
  else if(fireHandheldGame?.snapshot().status==='active')fireHandheldGame.render()
  else {
    sunGlare.update()
    composer.render()
    if(rubiksCubeGame?.isActive())rubiksCubeGame.render()
    else {
      webglHud.render()
      documentViewer?.render()
      snackModelViewer?.render()
    }
  }
  if(minigamePause.active&&(mode==='handheldOctopus'||mode==='handheldFire'||mode==='rubiksCube'))webglHud.render()
  siteQrOverlay.render()
  personalRecordBook.render()
  lastRendererInfo={
    render:{...renderer.info.render},
    memory:{...renderer.info.memory},
  }
}
const measureSceneRenderInfo=()=>{
  const previousAutoReset=renderer.info.autoReset
  const previousShadowsEnabled=renderer.shadowMap.enabled
  renderer.info.autoReset=false
  renderer.shadowMap.enabled=false
  renderer.info.reset()
  renderer.render(scene,camera)
  const measured={render:{...renderer.info.render},memory:{...renderer.info.memory}}
  renderer.shadowMap.enabled=previousShadowsEnabled
  renderer.info.autoReset=previousAutoReset
  renderFrame()
  return measured
}

const performanceStartedAt=performance.now()
const assetTimings=new Map()
const pendingGpuReady=[]
const frameDurations=[]
let sceneReadyAt=null
const percentile=(values,ratio)=>{
  if(!values.length)return null
  const sorted=[...values].sort((a,b)=>a-b)
  return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*ratio)-1)]
}
const beginAssetTiming=(label,url)=>{
  const timing={label,url,startMs:performance.now()-performanceStartedAt,loadEndMs:null,readyMs:null,gpuUploadEstimateMs:null,gpuTimingMethod:'batched first synchronized frame'}
  assetTimings.set(label,timing)
  return timing
}
const finishAssetLoad=timing=>{timing.loadEndMs=performance.now()-performanceStartedAt}
const markAssetReady=timing=>{
  timing.readyMs=performance.now()-performanceStartedAt
  if(sceneReadyAt==null) {
    if(!pendingGpuReady.includes(timing))pendingGpuReady.push(timing)
    return
  }
  const gpuStart=performance.now()
  renderFrame()
  renderer.getContext().finish()
  timing.gpuUploadEstimateMs=performance.now()-gpuStart
  timing.gpuReadyMs=performance.now()-performanceStartedAt
  timing.gpuTimingMethod='lazy asset synchronized frame'
}
const loadTimedGltf=async(url,label)=>{
  const timing=beginAssetTiming(label,url)
  try {
    const gltf=await assetLoader.loadGltf(url)
    finishAssetLoad(timing)
    return {gltf,timing}
  } catch(error) {
    finishAssetLoad(timing)
    timing.error=error?.message||'unknown error'
    throw error
  }
}
const loadTimedTexture=async(url,label)=>{
  const timing=beginAssetTiming(label,url)
  try {
    const texture=await assetLoader.loadTexture(url)
    finishAssetLoad(timing)
    return {texture,timing}
  } catch(error) {
    finishAssetLoad(timing)
    timing.error=error?.message||'unknown error'
    throw error
  }
}

const textureMemoryEstimate=()=>{
  const textures=new Set()
  scene.traverse(object=>{
    if(!object.material)return
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      if(!material)continue
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value)
    }
  })
  let bytes=0,measured=0,unknown=0
  const sourceCounts=new Map()
  for(const texture of textures) {
    const image=texture.image
    const source=image?.currentSrc||image?.src||texture.source?.data?.currentSrc||texture.source?.data?.src||null
    if(source)sourceCounts.set(source,(sourceCounts.get(source)??0)+1)
    const width=image?.videoWidth??image?.naturalWidth??image?.width
    const height=image?.videoHeight??image?.naturalHeight??image?.height
    if(!width||!height){unknown++;continue}
    const layers=image?.depth??(texture.isCubeTexture?6:1)
    bytes+=width*height*4*layers*(texture.generateMipmaps===false?1:4/3)
    measured++
  }
  const duplicateSources=[...sourceCounts].filter(([,count])=>count>1).map(([source,count])=>({source,count})).sort((a,b)=>b.count-a.count||a.source.localeCompare(b.source))
  return {textures:textures.size,measured,unknown,duplicateSources,estimatedBytes:Math.round(bytes),method:'RGBA8 decoded dimensions including estimated mip chain; render targets excluded'}
}

const assetTimingReport=()=>[...assetTimings.values()].map(timing=>{
  const pathname=new URL(timing.url,location.href).pathname
  const resource=performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).pathname===pathname).at(-1)
  const responseEndMs=resource?resource.responseEnd-performanceStartedAt:null
  const requestStartMs=resource?resource.startTime-performanceStartedAt:null
  return {
    ...timing,
    request:{
      startMs:requestStartMs,
      durationMs:resource?.duration??null,
      downloadMs:resource?resource.responseEnd-resource.responseStart:null,
      transferBytes:resource?.transferSize??null,
      encodedBytes:resource?.encodedBodySize??null,
      decodedBytes:resource?.decodedBodySize??null,
      protocol:resource?.nextHopProtocol??null,
    },
    phases:{
      queueWaitMs:requestStartMs==null?null:Math.max(0,requestStartMs-timing.startMs),
      decodeAndParseEstimateMs:responseEndMs==null||timing.loadEndMs==null?null:Math.max(0,timing.loadEndMs-responseEndMs),
      dependencyAndSetupMs:timing.loadEndMs==null||timing.readyMs==null?null:Math.max(0,timing.readyMs-timing.loadEndMs),
    },
    // 保留旧字段供现有报告兼容；阶段6A以后优先使用上面的细分字段。
    parseAndSetupEstimateMs:responseEndMs==null||timing.readyMs==null?null:Math.max(0,timing.readyMs-responseEndMs),
  }
})

const frameTimingReport=()=>({
  samples:frameDurations.length,
  p50Ms:percentile(frameDurations,.5),
  p95Ms:percentile(frameDurations,.95),
  p99Ms:percentile(frameDurations,.99),
  maxMs:frameDurations.length?Math.max(...frameDurations):null,
})

// 给太阳投影加入轻微紫灰色，并在低处暗面叠加随高度衰减的暖色地面回光。
// 回光使用世界高度与法线控制：墙脚、柱脚、低处树干较亮，向上逐渐减弱；
// 朝上的地面不会重复增亮，避免水泥地和屋顶过曝。
function enableCoolShadowTint(material) {
  if(!material||material.userData.coolShadowTint||!(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial||material.isMeshToonMaterial))return
  material.userData.coolShadowTint=true
  const previousCompile=material.onBeforeCompile
  const previousKey=material.customProgramCacheKey.bind(material)
  material.onBeforeCompile=shader=>{
    previousCompile(shader)
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying float vShadowUpness;')
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvShadowUpness=dot(normalize(mat3(modelMatrix)*objectNormal),vec3(0.0,1.0,0.0));')
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying float vShadowUpness;')
      .replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>')
      .replace('#include <opaque_fragment>',`
        float coolShadow=(1.0-getShadowMask())*smoothstep(-0.08,0.28,vShadowUpness);
        float shadowLuma=max(dot(outgoingLight,vec3(0.2126,0.7152,0.0722)),0.0);
        vec3 purpleGray=shadowLuma*vec3(0.95,0.84,1.08);
        outgoingLight=mix(outgoingLight,purpleGray,coolShadow*0.26);
        #include <opaque_fragment>
      `)
  }
  material.customProgramCacheKey=()=>`${previousKey()}|cool-shadow-v4-no-ground-bounce`
  material.needsUpdate=true
}

function applyCoolShadowTintToScene() {
  const materials=new Set()
  scene.traverse(object=>{
    if(!object.isMesh)return
    for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material)
  })
  for(const material of materials)enableCoolShadowTint(material)
}

const mat = Object.fromEntries(Object.entries({
  grass: [0x8fbf6b, 1], court: [0xe0c27e, 1],
  plinth: [0xb8ad8d, 1],
  platform: [0xb5ba80, 1], slope: [0xb28b58, 1], sand: [0xe0bb67, 1],
  oldWall: [0xc9c2a5, 1],
  white: [0xf0ead4, .95], wood: [0x765235, .9], steel: [0x344e47, .8],
  gateIron: [0x263e4d, .88],
  roof: [0x4b504b, .98], schoolRoofConcrete: [0xb9bcb9, 1], dark: [0x4f554f, 1], brick: [0xad593d, 1],
  blackboard: [0x101715, .96], chalkTray: [0x8b8f8c, .9],
  rail: [0xc49a2c, .9], b2RailWarmWhite: [0xd6d1bd, .94], trunk: [0x64503a, 1], leaf: [0x3f7d3f, .95],
  leafLight: [0x70a844, .95], moss: [0x68794f, 1], red: [0xcf4932, .9],
}).map(([k, [color, roughness]]) => [k, new THREE.MeshStandardMaterial({ color, roughness })]))
const activityParallelBarMaterial=new THREE.MeshStandardMaterial({
  name:'activity-parallel-bars-gray-black-steel',
  color:0x34383a,roughness:.72,metalness:.62,
})
const bambooClimbSteelMaterial=new THREE.MeshStandardMaterial({
  name:'b1-north-bamboo-climb-aged-steel',color:0x3f4745,roughness:.76,metalness:.56,
})
const bambooClimbMaterial=new THREE.MeshStandardMaterial({
  name:'b1-north-bamboo-climb-yellow-bamboo',color:0xc99b32,roughness:.88,metalness:0,
})
const bambooClimbNodeMaterial=new THREE.MeshStandardMaterial({
  name:'b1-north-bamboo-climb-dark-nodes',color:0xa97824,roughness:.92,metalness:0,
})
// 楼板、楼梯和讲台共用同一个程序化旧水泥材质，不再使用纯色占位材质。
mat.concrete=groundMat.agedConcrete

function createPlanterAggregateTexture(seed,{bump=false}={}) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256
  const context=canvas.getContext('2d')
  let state=seed>>>0
  const random=()=>{state+=0x6d2b79f5;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return((value^(value>>>14))>>>0)/4294967296}
  context.fillStyle=bump?'#888':'#aaa99f';context.fillRect(0,0,256,256)
  const colors=bump?['#777','#969696','#808080','#a0a0a0']:['#777970','#c3bda9','#8f8878','#d1ccc0','#686b68']
  // 石米表面以低对比细点为主，夹少量较大的裸露骨料。
  for(let index=0;index<1500;index++) {
    const radius=index<90?.9+random()*1.9:.25+random()*.75
    context.globalAlpha=index<90?.34:.18+random()*.18
    context.fillStyle=colors[Math.floor(random()*colors.length)]
    context.beginPath();context.arc(random()*256,random()*256,radius,0,Math.PI*2);context.fill()
  }
  context.globalAlpha=1
  const texture=new THREE.CanvasTexture(canvas)
  texture.colorSpace=bump?THREE.NoColorSpace:THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping
  texture.repeat.set(4,1.25)
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
  return texture
}

const planterAggregateMaterial=new THREE.MeshStandardMaterial({
  name:'b2-planter-cement-stone-aggregate',
  map:createPlanterAggregateTexture(198509),
  bumpMap:createPlanterAggregateTexture(198527,{bump:true}),
  bumpScale:.009,color:0xffffff,roughness:.97,metalness:0,
})
const planterSoilMaterial=new THREE.MeshStandardMaterial({
  name:'b2-planter-dark-soil',color:0x564735,roughness:1,metalness:0,
})

function loadGraniteBenchTexture(url,{color=false}={}) {
  const texture=new THREE.TextureLoader().load(url)
  texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace
  texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping
  texture.repeat.set(3.5,1.4)
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
  return texture
}

const graniteBenchMaterial=new THREE.MeshStandardMaterial({
  name:'b1-north-speckled-granite-bench',
  map:loadGraniteBenchTexture('/assets/textures/granite-bench/granite-aged-light-albedo-v01.webp',{color:true}),
  bumpMap:loadGraniteBenchTexture('/assets/textures/granite-bench/granite-aged-light-bump-v01.webp'),
  roughnessMap:loadGraniteBenchTexture('/assets/textures/granite-bench/granite-aged-light-roughness-v01.webp'),
  bumpScale:.006,color:0xffffff,roughness:.94,metalness:0,
})

function createChippedGraniteBox(name,size,position,seed) {
  const segments=size.map(value=>Math.max(2,Math.min(18,Math.ceil(value/.12))))
  const geometry=new THREE.BoxGeometry(...size,...segments)
  const attribute=geometry.getAttribute('position'),half=size.map(value=>value/2)
  for(let index=0;index<attribute.count;index++) {
    const coordinates=[attribute.getX(index),attribute.getY(index),attribute.getZ(index)]
    const boundaryAxes=[]
    for(let axis=0;axis<3;axis++) if(Math.abs(Math.abs(coordinates[axis])-half[axis])<1e-5)boundaryAxes.push(axis)
    if(boundaryAxes.length<2)continue
    const key=coordinates.reduce((value,coordinate,axis)=>value+Math.round((coordinate/size[axis]+.5)*97)*(axis+3),seed)
    const noise=Math.abs(Math.sin(key*12.9898)*43758.5453)%1
    // 普遍只收进约1mm，少量点形成4–9mm的小缺口；相同空间顶点得到相同位移，
    // 邻接表面仍然闭合，不会为了破损效果制造真正的几何裂缝。
    const damage=noise>.72?.004+(noise-.72)/.28*.005:.001
    for(const axis of boundaryAxes)coordinates[axis]-=Math.sign(coordinates[axis])*Math.min(damage,half[axis]*.12)
    attribute.setXYZ(index,...coordinates)
  }
  attribute.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
  const mesh=new THREE.Mesh(geometry,graniteBenchMaterial)
  mesh.name=name;mesh.position.fromArray(position);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh)
  navigation.addAabb(name,position,size)
  return mesh
}

function planterCutoutMaterial(name,map,color=0xffffff) {
  const material=new THREE.MeshStandardMaterial({
    name,map,color,transparent:true,alphaTest:.30,side:THREE.DoubleSide,
    roughness:1,metalness:0,depthWrite:true,alphaToCoverage:true,
  })
  return material
}

function createSwordLeafClusterTexture(variant=0) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512
  const context=canvas.getContext('2d');context.clearRect(0,0,256,512)
  const leaves=[
    [-78,.72,20],[-56,.92,12],[-37,.78,14],[-19,1.0,9],[0,.88,13],[19,.97,10],[38,.74,14],[58,.86,12],[78,.66,17],
  ]
  for(const [index,[lean,height,width]] of leaves.entries()) {
    const baseX=128+(index-4)*2.3,baseY=502,tipX=128+lean+(variant?Math.sin(index*1.7)*8:0),tipY=baseY-height*440
    const gradient=context.createLinearGradient(baseX-width,0,baseX+width,0)
    gradient.addColorStop(0,index%3===0?'#285a31':'#326c38')
    gradient.addColorStop(.48,index%2?'#67984e':'#588a45')
    gradient.addColorStop(1,'#214d2d')
    context.fillStyle=gradient
    context.beginPath();context.moveTo(baseX-width*.42,baseY)
    context.bezierCurveTo(baseX-width,baseY-125,tipX-width*.22,tipY+72,tipX,tipY)
    context.bezierCurveTo(tipX+width*.18,tipY+70,baseX+width,baseY-118,baseX+width*.42,baseY)
    context.closePath();context.fill()
    context.strokeStyle='rgba(190,210,137,.24)';context.lineWidth=1
    context.beginPath();context.moveTo(baseX,baseY-5);context.quadraticCurveTo((baseX+tipX)/2,baseY-170,tipX,tipY+4);context.stroke()
  }
  const texture=new THREE.CanvasTexture(canvas)
  texture.colorSpace=THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
  return texture
}
const planterSwordLeafMaterials=[0,1].map(index=>
  planterCutoutMaterial(`b2-planter-sword-leaf-card-${index+1}`,createSwordLeafClusterTexture(index)),
)

// 黑板A版：旧墨绿色底上保留低对比板擦横痕和擦不净的粉笔雾。
// 全部48块黑板共享同一贴图和材质实例，不把可辨认文字烘焙进重复纹理。
const classroomBlackboardTexture=new THREE.TextureLoader().load('/assets/textures/classroom-blackboard/blackboard-erased-chalk-a-v02.jpg')
classroomBlackboardTexture.colorSpace=THREE.SRGBColorSpace
classroomBlackboardTexture.wrapS=classroomBlackboardTexture.wrapT=THREE.ClampToEdgeWrapping
classroomBlackboardTexture.minFilter=THREE.LinearMipmapLinearFilter
classroomBlackboardTexture.magFilter=THREE.LinearFilter
classroomBlackboardTexture.anisotropy=renderer.capabilities.getMaxAnisotropy()
mat.blackboard.dispose()
mat.blackboard=new THREE.MeshStandardMaterial({
  name:'classroom-blackboard-erased-chalk-a',map:classroomBlackboardTexture,
  color:0xffffff,roughness:.97,metalness:0,
})
mat.blackboard.userData.textureVersion='blackboard-erased-chalk-a-v02'

// 八十年代教室常见的单管吊装日光灯：只表现实体外形，默认不发光。
const classroomTubeLightMaterials={
  housing:new THREE.MeshStandardMaterial({
    name:'classroom-tube-light-aged-enamel-housing',color:0xb8b5a6,roughness:.88,metalness:.08,
  }),
  socket:new THREE.MeshStandardMaterial({
    name:'classroom-tube-light-yellowed-socket',color:0xb8b096,roughness:.94,metalness:0,
  }),
  tube:new THREE.MeshStandardMaterial({
    name:'classroom-tube-light-unlit-glass',color:0xd7ddd1,roughness:.48,metalness:0,
  }),
}

function createWallFanCutoutTexture(kind,size=512) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size
  const context=canvas.getContext('2d'),center=size/2
  context.clearRect(0,0,size,size);context.save();context.translate(center,center)
  if(kind==='guard') {
    // 网罩只输出灰度透明遮罩：黑底被完全裁掉，白线仅提供 alpha，
    // 实际颜色由材质统一指定，避免彩色贴图 mip 边缘残留白点。
    context.fillStyle='#000';context.fillRect(-center,-center,size,size)
    context.strokeStyle='#fff';context.lineWidth=1.8
    for(let spoke=0;spoke<36;spoke++) {
      const angle=spoke/36*Math.PI*2
      context.beginPath();context.moveTo(Math.cos(angle)*34,Math.sin(angle)*34)
      context.lineTo(Math.cos(angle)*248,Math.sin(angle)*248);context.stroke()
    }
    for(let ring=0;ring<13;ring++) {
      context.beginPath();context.lineWidth=ring===12?3:1.35
      context.arc(0,0,36+ring*17.5,0,Math.PI*2);context.stroke()
    }
  } else {
    // 扇叶也只输出灰度遮罩。深蓝色由材质提供，避免透明边缘采样到白色RGB。
    context.fillStyle='#000';context.fillRect(-center,-center,size,size)
    for(let blade=0;blade<3;blade++) {
      context.save();context.rotate(blade*Math.PI*2/3)
      context.fillStyle='#fff';context.beginPath()
      // 窄根部、宽肩和圆钝外端，接近参考图中短而饱满的三叶塑料扇叶。
      context.moveTo(39,-12)
      context.bezierCurveTo(73,-44,116,-68,158,-65)
      context.bezierCurveTo(188,-63,205,-42,202,-13)
      context.bezierCurveTo(199,18,176,48,145,59)
      context.bezierCurveTo(111,67,75,44,46,20)
      context.quadraticCurveTo(32,6,39,-12);context.closePath();context.fill()
      context.strokeStyle='#fff';context.lineWidth=3;context.stroke()
      context.restore()
    }
  }
  context.restore()
  const texture=new THREE.CanvasTexture(canvas)
  texture.colorSpace=THREE.NoColorSpace
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
  return texture
}
const wallFanGuardTexture=createWallFanCutoutTexture('guard')
const wallFanBladeTexture=createWallFanCutoutTexture('blade')
function wallFanCutoutMaterial(name,map) {
  const isGuard=name.includes('guard')
  const material=new THREE.MeshStandardMaterial({
    name,alphaMap:map,
    color:isGuard?0x575a57:0x329fd0,roughness:.8,metalness:0,
    alphaTest:isGuard ? .46 : .42,side:THREE.DoubleSide,
  })
  material.alphaToCoverage=false
  return material
}
const classroomWallFanBodyMaterial=new THREE.MeshStandardMaterial({
  name:'classroom-wall-fan-grayish-cream-body',color:0xb5b4a7,roughness:.88,metalness:.04,
})
const classroomWallFanMaterials={
  guard:wallFanCutoutMaterial('classroom-wall-fan-wire-guard-cutout',wallFanGuardTexture),
  blade:wallFanCutoutMaterial('classroom-wall-fan-blue-blades-cutout',wallFanBladeTexture),
  frame:classroomWallFanBodyMaterial,
  housing:classroomWallFanBodyMaterial,
  hub:classroomWallFanBodyMaterial,
}

const classroomFurnitureOrientationShade={top:1.18,side:.68,bottom:.48}
function enableClassroomFurnitureOrientationContrast(material) {
  material.userData.orientationShade={...classroomFurnitureOrientationShade}
  const previousCompile=material.onBeforeCompile
  const previousKey=material.customProgramCacheKey.bind(material)
  material.onBeforeCompile=shader=>{
    previousCompile(shader)
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying float vFurnitureUpness;')
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvFurnitureUpness=dot(normalize(mat3(modelMatrix)*objectNormal),vec3(0.0,1.0,0.0));')
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying float vFurnitureUpness;')
      .replace('#include <opaque_fragment>',`
        float furnitureTop=smoothstep(0.35,0.82,vFurnitureUpness);
        float furnitureBottom=1.0-smoothstep(-0.85,-0.20,vFurnitureUpness);
        float furnitureOrientationShade=mix(${classroomFurnitureOrientationShade.side.toFixed(3)},${classroomFurnitureOrientationShade.top.toFixed(3)},furnitureTop);
        furnitureOrientationShade=mix(furnitureOrientationShade,${classroomFurnitureOrientationShade.bottom.toFixed(3)},furnitureBottom);
        outgoingLight*=furnitureOrientationShade;
        #include <opaque_fragment>
      `)
  }
  material.customProgramCacheKey=()=>`${previousKey()}|classroom-furniture-orientation-v1-${classroomFurnitureOrientationShade.top}-${classroomFurnitureOrientationShade.side}-${classroomFurnitureOrientationShade.bottom}`
  material.needsUpdate=true
}

const classroomFurnitureWoodVariants=[
  ['neutral','/assets/textures/classroom-furniture/desk-simple-wood-neutral-v03.png'],
  ['ochre','/assets/textures/classroom-furniture/desk-simple-wood-ochre-v03.png'],
  ['gray','/assets/textures/classroom-furniture/desk-simple-wood-graybrown-v03.png'],
].map(([name,url])=>{
  const texture=new THREE.TextureLoader().load(url)
  texture.colorSpace=THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping
  texture.minFilter=THREE.LinearMipmapLinearFilter
  texture.magFilter=THREE.LinearFilter
  texture.anisotropy=renderer.capabilities.getMaxAnisotropy()
  const material=new THREE.MeshStandardMaterial({
    name:`classroom-furniture-simple-wood-v03-${name}`,map:texture,
    color:0xffffff,roughness:.93,metalness:0,vertexColors:true,
  })
  enableClassroomFurnitureOrientationContrast(material)
  return {
    name,texture,
    material,
  }
})
const classroomFurnitureStructureLineMaterial=new THREE.LineBasicMaterial({
  name:'classroom-furniture-structure-lines',color:0x3b2b20,
  transparent:true,opacity:.32,depthWrite:false,toneMapped:false,
})

const schoolSurfaceMat=materialLibrary.school
const perimeterWallMat=materialLibrary.perimeterWall.standard
const tallPerimeterWallMat=materialLibrary.perimeterWall.tall
Object.assign(mat,{
  wall1:schoolSurfaceMat.b1Ivory[0],
  wall2:schoolSurfaceMat.b1Ochre[0],
  b2ExteriorYellow:schoolSurfaceMat.b2Ochre[0],
  interiorWhite:schoolSurfaceMat.b1Interior[0],
  interiorOverheadWhite:schoolSurfaceMat.ceiling[0],
  perimeterWall:perimeterWallMat[0],
  gatePier:materialLibrary.gatePier,
})
// 接触面不使用“数学上的完全齐平”。这两个间距分别用于薄饰面和结构收口，
// 均小于正常施工误差，但远大于深度缓冲在校园尺度下的量化误差。
const FINISH_SURFACE_GAP=.018
const STRUCTURE_JOIN_GAP=.012
// 教学楼改用重新绘制的水彩材质族，不再以旧纯色材质为底。
// 墙面族包含四张独立贴图，按稳定名称散列选择；同一墙段的窗台与窗楣保持同款。
function schoolSurfaceVariant(material,name) {
  const variants=material?.userData?.schoolSurfaceVariants
  if(!variants)return material
  const stableName=name.replace(/-(sill|lintel)$/,'')
  let hash=2166136261
  for(let i=0;i<stableName.length;i++){hash^=stableName.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return variants[(hash>>>0)%variants.length]
}

function interiorFinishMaterial(name) {
  const family=name.startsWith('b2-')?schoolSurfaceMat.b2Interior:schoolSurfaceMat.b1Interior
  return schoolSurfaceVariant(family[0],name)
}

function ceilingFinishMaterial(name) {
  return schoolSurfaceVariant(schoolSurfaceMat.ceiling[0],name)
}

const b1RailingPatternSource = new THREE.TextureLoader().load('/assets/textures/b1-railing-ornament-repeat-v2.png')
b1RailingPatternSource.colorSpace = THREE.SRGBColorSpace
b1RailingPatternSource.wrapS = THREE.RepeatWrapping
b1RailingPatternSource.wrapT = THREE.ClampToEdgeWrapping
b1RailingPatternSource.minFilter = THREE.LinearMipmapLinearFilter
b1RailingPatternSource.magFilter = THREE.LinearFilter
b1RailingPatternSource.anisotropy = renderer.capabilities.getMaxAnisotropy()
b1RailingPatternSource.needsUpdate = true

const b1SchoolNameTexture = new THREE.TextureLoader().load('/assets/textures/signage/b1-school-name-calligraphy-v01.png')
b1SchoolNameTexture.colorSpace = THREE.SRGBColorSpace
b1SchoolNameTexture.minFilter = THREE.LinearMipmapLinearFilter
b1SchoolNameTexture.magFilter = THREE.LinearFilter
b1SchoolNameTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
const b1SchoolNameMaterial = new THREE.MeshBasicMaterial({
  name:'b1-school-name-calligraphy',
  map:b1SchoolNameTexture,
  transparent:true,
  alphaTest:.035,
  depthWrite:false,
  toneMapped:false,
})

function b1RailingPatternPanel(name, length, y, center, rotationY = 0) {
  // 纹样由首版0.72m节距收窄三分之一；高度不变，段端仍按完整单元收口。
  const repeatCount = Math.max(1, Math.round(length / .48))
  const material = new THREE.MeshStandardMaterial({
    map: b1RailingPatternSource,
    transparent: true,
    alphaTest: .25,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    roughness: .9,
    metalness: 0,
    depthWrite: true,
  })
  const geometry = new THREE.PlaneGeometry(length, .82)
  // 只有横向重复数不同，直接写入几何 UV，避免每段栏杆克隆并上传同一张 GPU 纹理。
  const uv=geometry.getAttribute('uv')
  for(let index=0;index<uv.count;index++)uv.setX(index,uv.getX(index)*repeatCount)
  uv.needsUpdate=true
  const depth = .06, layers = 3
  const normalX = Math.sin(rotationY), normalZ = Math.cos(rotationY)
  const meshes = []
  // 前、中、后三层alpha裁切面沿法线叠放：填补斜视空隙并形成约6cm体积。
  for(let i=0;i<layers;i++) {
    const offset = THREE.MathUtils.lerp(-depth/2,depth/2,i/(layers-1))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `${name}-ornament-texture-depth-layer`
    mesh.position.set(center[0]+normalX*offset,y+.57,center[1]+normalZ*offset)
    mesh.rotation.y = rotationY
    mesh.castShadow = false
    mesh.receiveShadow = true
    root.add(mesh)
    meshes.push(mesh)
  }
  return meshes
}

const root = new THREE.Group()
root.name = 'campus-graybox-v0.1'
scene.add(root)
const artisticOutlineRoot=new THREE.Group()
artisticOutlineRoot.name='selective-artistic-outline-v0.1'
scene.add(artisticOutlineRoot)
// Experimental branch: classroom interiors are baked into building-local roots.
// The exterior shells, corridors, stairs and collision data remain in the common
// campus root so hiding a remote interior cannot punch a hole in the building.
const buildingInteriorRenderRoots={
  building1:new THREE.Group(),
  building2:new THREE.Group(),
}
const buildingInteriorOutlineRoots={
  building1:new THREE.Group(),
  building2:new THREE.Group(),
}
const classroomDetailRenderRoots=new Map()
const classroomDetailOutlineRoots=new Map()
for(const [building,group] of Object.entries(buildingInteriorRenderRoots)) {
  group.name=`${building}-classroom-interior-render-root`
  scene.add(group)
}
for(const [building,group] of Object.entries(buildingInteriorOutlineRoots)) {
  group.name=`${building}-classroom-interior-outline-root`
  artisticOutlineRoot.add(group)
}
const ensureClassroomDetailRoots=classroom=>{
  if(classroomDetailRenderRoots.has(classroom))return {
    render:classroomDetailRenderRoots.get(classroom),
    outline:classroomDetailOutlineRoots.get(classroom),
  }
  const building=classroom.startsWith('b1-')?'building1':'building2'
  const render=new THREE.Group(),outline=new THREE.Group()
  render.name=`${classroom}-full-detail-render-root`
  outline.name=`${classroom}-full-detail-outline-root`
  render.visible=outline.visible=false
  buildingInteriorRenderRoots[building].add(render)
  buildingInteriorOutlineRoots[building].add(outline)
  classroomDetailRenderRoots.set(classroom,render)
  classroomDetailOutlineRoots.set(classroom,outline)
  return {render,outline}
}
const artisticOutlineMaterials={
  // 普通 WebGL 线段通常始终只有 1px；改用屏幕像素宽度，保证笔触可见。
  primaryBase:new LineMaterial({color:0x514740,linewidth:1.45,transparent:true,opacity:.3,depthTest:true,depthWrite:false,toneMapped:false,alphaToCoverage:true}),
  primaryStroke:new LineMaterial({color:0x39353e,linewidth:2.3,transparent:true,opacity:.82,depthTest:true,depthWrite:false,toneMapped:false,alphaToCoverage:true}),
  secondaryBase:new LineMaterial({color:0x574e49,linewidth:.95,transparent:true,opacity:.18,depthTest:true,depthWrite:false,toneMapped:false,alphaToCoverage:true}),
  secondaryStroke:new LineMaterial({color:0x423f48,linewidth:1.55,transparent:true,opacity:.56,depthTest:true,depthWrite:false,toneMapped:false,alphaToCoverage:true}),
  foundationStroke:new LineMaterial({color:0x353239,linewidth:4.2,transparent:true,opacity:.8,depthTest:true,depthWrite:false,toneMapped:false,alphaToCoverage:true}),
}
for(const material of Object.values(artisticOutlineMaterials))material.resolution.set(innerWidth,innerHeight)
// GLB 资产保持在静态灰盒合批之外，避免活动门窗节点被烘焙并丢失层级。
const b1AssetRoot = new THREE.Group()
b1AssetRoot.name = 'building-1-glb-assets'
scene.add(b1AssetRoot)
const toiletAssetRoot = new THREE.Group()
toiletAssetRoot.name = 'toilet-glb-asset'
scene.add(toiletAssetRoot)
const dormitoryAssetRoot = new THREE.Group()
dormitoryAssetRoot.name = 'teacher-dormitory-glb-asset'
scene.add(dormitoryAssetRoot)
const banyanAssetRoot = new THREE.Group()
banyanAssetRoot.name = 'banyan-tree-glb-asset'
scene.add(banyanAssetRoot)
const playgroundTreeAssetRoot = new THREE.Group()
playgroundTreeAssetRoot.name = 'playground-tree-glb-assets'
scene.add(playgroundTreeAssetRoot)
const oldClassroomAssetRoot = new THREE.Group()
oldClassroomAssetRoot.name = 'old-classroom-glb-asset'
scene.add(oldClassroomAssetRoot)
const sandpitAssetRoot = new THREE.Group()
sandpitAssetRoot.name = 'sandpit-glb-asset'
scene.add(sandpitAssetRoot)
const activitySandAssetRoot = new THREE.Group()
activitySandAssetRoot.name = 'old-classroom-activity-sand-glb-assets'
scene.add(activitySandAssetRoot)
const pingPongAssetRoot = new THREE.Group()
pingPongAssetRoot.name = 'ping-pong-table-glb-assets'
scene.add(pingPongAssetRoot)
const basketballAssetRoot = new THREE.Group()
basketballAssetRoot.name = 'activity-basketball-glb-assets'
scene.add(basketballAssetRoot)
const basketballHoopAssetRoot = new THREE.Group()
basketballHoopAssetRoot.name = 'activity-basketball-hoop-glb-asset'
scene.add(basketballHoopAssetRoot)
const concreteSlideAssetRoot = new THREE.Group()
concreteSlideAssetRoot.name = 'concrete-slide-glb-asset'
scene.add(concreteSlideAssetRoot)
const groundDetailRoot = new THREE.Group()
groundDetailRoot.name = 'handpainted-ground-detail-decals'
scene.add(groundDetailRoot)
const b1AssetPlacements = []
const b1AssetTemplates = new Map()
const b1AssetRigs = new Map()
const b1InteractiveMeshes = []
const b1InteractionRaycaster = new THREE.Raycaster()
const b1InteractionPointer = new THREE.Vector2()
let b1AssetLoadState = { status: 'pending', loaded: [], failed: [] }
let toiletAssetLoadState = { status: 'pending', url: '/assets/models/toilet/toilet-game-optimized-v01.glb?v=8' }
let dormitoryAssetLoadState = { status: 'pending', url: '/assets/models/teacher-dormitory/teacher-dormitory-game-optimized-v01.glb?v=3' }
let banyanAssetLoadState = { status: 'pending', url: CAMPUS.facilities.banyan.assetUrl }
const banyanLeafMaterials=new Map()
const banyanLeafMeshes=new Set()
const banyanFoliageCandidates=BANYAN_FOLIAGE_LIGHTING.candidates
let activeBanyanFoliageCandidate=(import.meta.env.DEV||automatedTestBuild)&&requestedBanyanFoliageCandidate in banyanFoliageCandidates
  ?requestedBanyanFoliageCandidate
  :BANYAN_FOLIAGE_LIGHTING.formalCandidate

const applyBanyanFoliageLighting=(candidateName=activeBanyanFoliageCandidate)=>{
  const normalized=String(candidateName).toUpperCase()
  const candidate=banyanFoliageCandidates[normalized]
  if(!candidate)return null
  activeBanyanFoliageCandidate=normalized
  const multiplier=new THREE.Color().setRGB(...candidate.colorMultiplier)
  for(const [material,baseline] of banyanLeafMaterials) {
    if(material.color)material.color.copy(baseline.color).multiply(multiplier)
    if('roughness' in material)material.roughness=candidate.roughness
    if('metalness' in material)material.metalness=0
    if('specularIntensity' in material)material.specularIntensity=candidate.specularIntensity
    if(material.emissive)material.emissive.setRGB(1,1,1)
    if('emissiveIntensity' in material)material.emissiveIntensity=candidate.emissiveIntensity
  }
  renderer.shadowMap.needsUpdate=true
  return normalized
}

const banyanFoliageLightingState=()=>{
  const candidate=banyanFoliageCandidates[activeBanyanFoliageCandidate]
  const materials=[...banyanLeafMaterials.keys()]
  const leafMeshes=[...banyanLeafMeshes]
  const firstMaterial=materials[0]
  return {
    candidate:activeBanyanFoliageCandidate,
    formalCandidate:BANYAN_FOLIAGE_LIGHTING.formalCandidate,
    available:Object.keys(banyanFoliageCandidates),
    ...candidate,
    materials:materials.length,
    meshes:leafMeshes.length,
    textures:new Set(materials.flatMap(material=>[material.map,material.emissiveMap]).filter(Boolean)).size,
    receivesShadow:leafMeshes.length>0&&leafMeshes.every(mesh=>mesh.receiveShadow),
    castsShadow:leafMeshes.length>0&&leafMeshes.every(mesh=>mesh.castShadow),
    actual:firstMaterial?{
      color:firstMaterial.color?.toArray().map(value=>+value.toFixed(3))??null,
      roughness:firstMaterial.roughness??null,
      specularIntensity:firstMaterial.specularIntensity??null,
      emissiveIntensity:firstMaterial.emissiveIntensity??null,
    }:null,
  }
}
let playgroundTreeAssetLoadState = { status: 'pending', species: {}, placements: [] }
let planterFlowerAssetLoadState={status:'pending',url:PLANTER_FLOWER_ATLAS_URL}
let oldClassroomAssetLoadState = { status: 'pending', url: '/assets/models/old-classroom/old-classroom-game-optimized-v02.glb?v=3' }
let sandpitAssetLoadState = { status: 'pending', url: CAMPUS.facilities.sandpit.assetUrl }
let activitySandAssetLoadState = { status: 'pending', assets: [] }
let pingPongAssetLoadState = { status: 'pending', url: CAMPUS.facilities.pingPong.assetUrl }
let pingPongPaddleAssetLoadState = { status: 'pending', url: CAMPUS.facilities.pingPong.game.paddleAssetUrl }
let pingPongGame=null
let basketballAssetLoadState = { status: 'pending', url: CAMPUS.facilities.basketballs.assetUrl }
const basketballItems=[]
let basketballHoopAssetLoadState = { status: 'pending', url: CAMPUS.facilities.basketballHoop.assetUrl }
let basketballHoopModel=null
let basketballGame=null
let bambooClimbGame=null
let longJumpGame=null
let hopscotchGame=null
let shuttlecockGame=null
let jacksGame=null
let octopusHandheldGame=null
let fireHandheldGame=null
let rubiksCubeGame=null
let slingshotGame=null
let flagRaisingGame=null
let concreteSlideAssetLoadState = { status: 'pending', url: CAMPUS.facilities.slideReserve.assetUrl }
let groundDetailLoadState = { status: 'pending', atlases: 1, instances: 0, drawObjects: 0 }
const navigation=createPlayerNavigation({
  player:CAMPUS.player,
  baseHeightAt:(x,z)=>activitySandGroundHeightAt(x,z)??sandpitGroundHeightAt(x,z)??terrainHeightAt(x,z),
  maxSubstep:.08,
})
const {colliders,walkSurfaces}=navigation
{
  const limit=CAMPUS.player.eastWalkLimit
  const zValues=CAMPUS.world.boundary.map(([,z])=>z)
  // 覆盖校园完整南北范围的东侧活动界限；所有无围墙缺口也不能绕过这条直线。
  navigation.addAabbBounds({
    name:'teacher-dormitory-west-facade-east-invisible-walk-limit',
    minX:limit.x,maxX:CAMPUS.world.bounds.width/2+10,
    minZ:Math.min(...zValues)-2,maxZ:Math.max(...zValues)+2,
    minY:-1,maxY:20,
    invisible:true,reference:limit.reference,
  })
}
const debugObjects = []
const b1StairJointChecks = []
function addSegmentCollider(name, a, b, minY, maxY, thickness = .14) {
  navigation.addSegment(name,a,b,minY,maxY,thickness)
}

function addSlopeColliderX(name,xStart,xEnd,z,width,yStart,yEnd,thickness=.16) {
  navigation.addSlopeColliderX(name,xStart,xEnd,z,width,yStart,yEnd,thickness)
}

function addWalkRect(name, center, size, height, options={}) {
  navigation.addWalkRect(name,center,size,height,options)
}

function addWalkPolygon(name, points, height, holes = [], options={}) {
  navigation.addWalkPolygon(name,points,height,holes,options)
}

function addWalkSlopeX(name,xStart,xEnd,z,width,yStart,yEnd) {
  navigation.addWalkSlopeX(name,xStart,xEnd,z,width,yStart,yEnd)
}

function addWalkSlopeZ(name,x,width,zStart,zEnd,yStart,yEnd) {
  navigation.addWalkSlopeZ(name,x,width,zStart,zEnd,yStart,yEnd)
}

function addWalkRamp(name,a,b,width,yStart,yEnd) {
  navigation.addWalkRamp(name,a,b,width,yStart,yEnd)
}

function box(name, size, position, material, { collider = false, parent = root, shadow = true, outlineScale = 1 } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), schoolSurfaceVariant(material,name))
  mesh.name = name
  mesh.userData.outlineScale = outlineScale
  mesh.position.set(...position)
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  parent.add(mesh)
  if (collider) navigation.addAabb(name,position,size,typeof collider==='object'?collider:{})
  return mesh
}

const classroomFixtureStats={classrooms:0,blackboards:0,podiums:0,teacherDesks:0,trays:0,ceilingLights:0,tubes:0,wallFans:0}
const classroomOfficeRooms=new Set([
  // 一号楼一层从东往西第三间；main-room 编号本身按西→东排列，因此对应 room 2。
  'b1-main-room-2-floor-1',
  // 二号楼一层最东端第一间。
  'b2-room-4-floor-1',
])
const classroomFurnitureStats={
  rooms:0,officesSkipped:0,desks:0,stools:0,seats:0,
  officeRooms:0,officeDesks:0,officeChairs:0,
  variants:{neutral:0,ochre:0,gray:0},
}
const classroomDeskAnchors=[]
const classroomTeacherDeskAnchors=[]
const classroomSeatingInteractions=[]
const classroomFurnitureLayoutChecks=[]
const teacherOfficeFurniturePlacements=[]
const classroomInteriorZones=[]
const classroomTeachingBlackboards=[]
const schoolEphemeraAnchors={classrooms:[],b1Corridor:[],b2Columns:[],b2ClassroomPosters:[]}

function addClassroomBlackboard(name,wallCenter,inward,floorY,wallThickness=.24,boardOverrides={}) {
  const [nx,nz]=inward
  const alongX=Math.abs(nz)>.5
  const board={width:3.5,height:1.2,depth:.04,bottom:.9,writable:true,...boardOverrides}
  const wallFaceOffset=wallThickness/2+FINISH_SURFACE_GAP
  const boardOffset=wallFaceOffset+board.depth/2+.004
  const boardSize=alongX?[board.width,board.height,board.depth]:[board.depth,board.height,board.width]
  const boardMesh=box(
    `${name}-blackboard`,boardSize,
    [wallCenter[0]+nx*boardOffset,floorY+board.bottom+board.height/2,wallCenter[1]+nz*boardOffset],
    mat.blackboard,
  )

  // L形粉笔槽由水平托板与外缘短挡边组成。托板从粉刷墙面向教室突出15cm，
  // 黑板本体厚4cm；两者不共面，近看仍能读出独立截面。
  const trayWidth=board.width+.08,trayDepth=.10,trayThickness=.025,lipHeight=.045,lipThickness=.022
  const trayCenter=[
    wallCenter[0]+nx*(wallFaceOffset+trayDepth/2),
    wallCenter[1]+nz*(wallFaceOffset+trayDepth/2),
  ]
  const traySize=alongX?[trayWidth,trayThickness,trayDepth]:[trayDepth,trayThickness,trayWidth]
  box(
    `${name}-chalk-tray`,traySize,
    [trayCenter[0],floorY+board.bottom-trayThickness/2,trayCenter[1]],
    mat.chalkTray,{shadow:false},
  )
  const lipSize=alongX?[trayWidth,lipHeight,lipThickness]:[lipThickness,lipHeight,trayWidth]
  box(
    `${name}-chalk-tray-lip`,lipSize,
    [wallCenter[0]+nx*(wallFaceOffset+trayDepth-lipThickness/2),floorY+board.bottom+lipHeight/2,wallCenter[1]+nz*(wallFaceOffset+trayDepth-lipThickness/2)],
    mat.chalkTray,{shadow:false},
  )
  classroomFixtureStats.blackboards++
  classroomFixtureStats.trays++
  return {
    id:name,wallCenter:[...wallCenter],normal:[...inward],floorY,wallThickness,board,mesh:boardMesh,
    wallOffset:wallFaceOffset+.003,
    boardOffset:wallFaceOffset+board.depth+.007,
    tray:{
      center:trayCenter,topY:floorY+board.bottom,width:trayWidth,depth:trayDepth,
      tangent:[nz,-nx],normal:[nx,nz],lipHeight,lipThickness,
    },
  }
}

let classroomPodiumGeometry=null
function createClassroomPodiumGeometry(width,height,depth,bevel=.04) {
  // 底圈保持完整直角；顶部内收一圈形成轻倒角。平面前两角也只做小切角，
  // 靠墙后沿虽然参与封闭，但整个倒角带会埋进墙体，不在教室内露出。
  const half=width/2,corner=bevel
  const outer=[[-half,0],[half,0],[half,depth-corner],[half-corner,depth],[-half+corner,depth],[-half,depth-corner]]
  const inner=[
    [-half+bevel,bevel],[half-bevel,bevel],
    [half-bevel,depth-corner-bevel/2],[half-corner-bevel,depth-bevel],
    [-half+corner+bevel,depth-bevel],[-half+bevel,depth-corner-bevel/2],
  ]
  const positions=[],uvs=[]
  // x-z 平面点列为逆时针；写入 Three.js 三角面时统一反转一次，
  // 使顶面朝上、底面朝下、侧面朝外，避免 FrontSide 下出现空心缺面。
  // 各面保留独立法线，让20cm高差和倒角通过真实受光、投影与AO表达结构深度。
  const tileSize=mat.concrete.userData.meterTileSize??4
  const triangle=(a,b,c)=>{
    const vertices=[a,c,b]
    const ab=new THREE.Vector3(...vertices[1]).sub(new THREE.Vector3(...vertices[0]))
    const ac=new THREE.Vector3(...vertices[2]).sub(new THREE.Vector3(...vertices[0]))
    const normal=ab.cross(ac).normalize()
    const vertical=Math.abs(normal.y)<.55
    for(const vertex of vertices) {
      positions.push(...vertex)
      if(vertical) {
        const horizontal=Math.abs(normal.x)>Math.abs(normal.z)?vertex[2]:vertex[0]
        uvs.push(horizontal/tileSize,vertex[1]/tileSize)
      } else uvs.push(vertex[0]/tileSize,vertex[2]/tileSize)
    }
  }
  // 几何原点保持在讲台平面中心，与定位、碰撞盒和行走面使用同一基准。
  // 后沿因此位于 -depth/2，摆放时可按 bevel 深度轻微嵌入墙体。
  const ring=(points,y)=>points.map(([x,z])=>[x,y,z-depth/2])
  const bottom=ring(outer,0),shoulder=ring(outer,height-bevel),top=ring(inner,height)
  for(let i=0;i<outer.length;i++) {
    const next=(i+1)%outer.length
    triangle(bottom[i],bottom[next],shoulder[next]);triangle(bottom[i],shoulder[next],shoulder[i])
    triangle(shoulder[i],shoulder[next],top[next]);triangle(shoulder[i],top[next],top[i])
  }
  const bottomFaces=THREE.ShapeUtils.triangulateShape(outer.map(([x,z])=>new THREE.Vector2(x,z)),[])
  for(const [a,b,c] of bottomFaces)triangle(bottom[c],bottom[b],bottom[a])
  const topFaces=THREE.ShapeUtils.triangulateShape(inner.map(([x,z])=>new THREE.Vector2(x,z)),[])
  for(const [a,b,c] of topFaces)triangle(top[a],top[b],top[c])
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function addClassroomPodium(name,wallCenter,inward,floorY,wallThickness=.24) {
  const [nx,nz]=inward
  const alongX=Math.abs(nz)>.5
  const podium={width:3.8,depth:1.5,height:.2}
  const bevel=.04
  const centerOffset=wallThickness/2+podium.depth/2-bevel
  const center=[wallCenter[0]+nx*centerOffset,wallCenter[1]+nz*centerOffset]
  const size=alongX?[podium.width,podium.height,podium.depth]:[podium.depth,podium.height,podium.width]
  classroomPodiumGeometry??=createClassroomPodiumGeometry(podium.width,podium.height,podium.depth,bevel)
  const mesh=new THREE.Mesh(classroomPodiumGeometry,mat.concrete)
  mesh.name=`${name}-podium`
  mesh.position.set(center[0],floorY,center[1])
  mesh.rotation.y=Math.atan2(nx,nz)
  mesh.castShadow=mesh.receiveShadow=true
  root.add(mesh)
  // 讲台顶面本身就是完整的可行走高度源，不再额外叠加覆盖整个体积的AABB。
  // 重复碰撞在讲台桌加入后会压缩玩家半径的入口余量，导致部分教室无法踏上20cm高台。
  addWalkRect(`${name}-podium-walk`,center,[size[0],size[2]],floorY+podium.height,{stepUp:.35})
  classroomFixtureStats.podiums++
}

function furnitureComponent(size,position,radius=0) {
  const geometry=radius
    ?new RoundedBoxGeometry(size[0],size[1],size[2],1,Math.min(radius,...size.map(value=>value/2-.001)))
    :new THREE.BoxGeometry(...size)
  geometry.translate(...position)
  return geometry
}

function furnitureComponentVerticalGrain(size,position,radius=0) {
  const geometry=furnitureComponent(size,position,radius)
  const uv=geometry.getAttribute('uv')
  // 仅旋转这块构件的UV，不复制材质或贴图；围板木纹因此沿高度方向生长。
  for(let index=0;index<uv.count;index++) {
    const u=uv.getX(index),v=uv.getY(index)
    uv.setXY(index,v,1-u)
  }
  uv.needsUpdate=true
  return geometry
}

function furnitureComponentSlantedZ(width,depth,start,end,radius=0) {
  const dy=end[0]-start[0],dz=end[1]-start[1]
  const length=Math.hypot(dy,dz)
  const geometry=radius
    ?new RoundedBoxGeometry(width,length,depth,1,Math.min(radius,width/2-.001,depth/2-.001))
    :new THREE.BoxGeometry(width,length,depth)
  geometry.rotateX(Math.atan2(dz,dy))
  geometry.translate(0,(start[0]+end[0])/2,(start[1]+end[1])/2)
  return geometry
}

function applySharedFurnitureVertexAo(geometry,height) {
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal')
  const colors=new Uint8Array(position.count*3)
  for(let index=0;index<position.count;index++) {
    const y=position.getY(index),normalY=normal.getY(index)
    const heightShade=.68+.32*THREE.MathUtils.smoothstep(y,.02,height*.65)
    const faceShade=normalY<-.25?.52:normalY>.65?.99:.78
    const groundShade=.72+.28*THREE.MathUtils.smoothstep(y,.02,.24)
    const ao=THREE.MathUtils.clamp(heightShade*faceShade*groundShade,.38,1)
    colors[index*3]=colors[index*3+1]=colors[index*3+2]=Math.round(ao*255)
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3,true))
  return geometry
}

function appendFurnitureStructureSegment(positions,center,rotation,a,b) {
  const cos=Math.cos(rotation),sin=Math.sin(rotation)
  for(const [x,y,z] of [a,b])positions.push(
    center[0]+x*cos+z*sin,y,center[1]-x*sin+z*cos,
  )
}

function appendFurnitureStructureRect(positions,center,rotation,y,halfX,halfZ) {
  const corners=[[-halfX,y,-halfZ],[halfX,y,-halfZ],[halfX,y,halfZ],[-halfX,y,halfZ]]
  for(let index=0;index<4;index++)appendFurnitureStructureSegment(
    positions,center,rotation,corners[index],corners[(index+1)%4],
  )
}

function appendFurnitureStructureVerticalRect(positions,center,rotation,z,y,halfX,halfY) {
  const corners=[[-halfX,y-halfY,z],[halfX,y-halfY,z],[halfX,y+halfY,z],[-halfX,y+halfY,z]]
  for(let index=0;index<4;index++)appendFurnitureStructureSegment(
    positions,center,rotation,corners[index],corners[(index+1)%4],
  )
}

function appendFurnitureStructureSlantedVerticalRect(positions,center,rotation,yBottom,zBottom,yTop,zTop,halfX) {
  const corners=[[-halfX,yBottom,zBottom],[halfX,yBottom,zBottom],[halfX,yTop,zTop],[-halfX,yTop,zTop]]
  for(let index=0;index<4;index++)appendFurnitureStructureSegment(
    positions,center,rotation,corners[index],corners[(index+1)%4],
  )
}

function appendStudentDeskStructureLines(positions,center,rotation,floorY) {
  appendFurnitureStructureRect(positions,center,rotation,floorY+.603,.60,.20)
  appendFurnitureStructureRect(positions,center,rotation,floorY+.418,.53,.161)
  appendFurnitureStructureSegment(positions,center,rotation,[0,floorY+.418,.161],[0,floorY+.562,.161])
  for(const x of [-.535,.535])for(const z of [-.145,.145])appendFurnitureStructureSegment(
    positions,center,rotation,[x,floorY+.018,z],[x,floorY+.562,z],
  )
}

function appendOfficeDeskStructureLines(positions,center,rotation,floorY) {
  appendFurnitureStructureRect(positions,center,rotation,floorY+.751,.60,.20)
  appendFurnitureStructureRect(positions,center,rotation,floorY+.57,.53,.16)
  appendFurnitureStructureSegment(positions,center,rotation,[0,floorY+.57,.16],[0,floorY+.71,.16])
  for(const x of [-.535,.535])for(const z of [-.145,.145])appendFurnitureStructureSegment(
    positions,center,rotation,[x,floorY+.018,z],[x,floorY+.71,z],
  )
}

function appendStudentStoolStructureLines(positions,center,rotation,floorY) {
  appendFurnitureStructureRect(positions,center,rotation,floorY+.381,.16,.12)
  for(const x of [-.12,.12])for(const z of [-.08,.08])appendFurnitureStructureSegment(
    positions,center,rotation,[x,floorY+.012,z],[x,floorY+.344,z],
  )
}

function appendOfficeChairStructureLines(positions,center,rotation,floorY) {
  appendFurnitureStructureRect(positions,center,rotation,floorY+.431,.165,.17)
  for(const x of [-.145,.145]) {
    appendFurnitureStructureSegment(positions,center,rotation,[x,floorY+.015,.145],[x,floorY+.392,.145])
    appendFurnitureStructureSegment(positions,center,rotation,[x,floorY+.015,-.205],[x,floorY+.392,-.145])
    appendFurnitureStructureSegment(positions,center,rotation,[x,floorY+.392,-.145],[x,floorY+.835,-.22])
  }
  const backZ=y=>THREE.MathUtils.lerp(-.145,-.22,(y-.392)/(.835-.392))
  for(const [y,halfHeight] of [[.735,.065],[.635,.035],[.555,.03]])appendFurnitureStructureSlantedVerticalRect(
    positions,center,rotation,floorY+y-halfHeight,backZ(y-halfHeight),floorY+y+halfHeight,backZ(y+halfHeight),.125,
  )
}

function createStudentDeskGeometry() {
  const parts=[]
  // 120×40×60cm 双人木桌；+Z 为学生坐席侧，-Z 为黑板侧。
  parts.push(furnitureComponent([1.20,.038,.40],[0,.581,0],.009))
  // 四条腿是连续方木，直接顶到桌板底面 y=.562；不另做、也不预留可见榫头段。
  for(const x of [-.535,.535])for(const z of [-.145,.145])parts.push(furnitureComponent([.052,.562,.052],[x,.281,z],.004))
  // 开放式双格书仓：底板、后挡、左右侧板与中央隔板。
  parts.push(furnitureComponent([1.06,.026,.32],[0,.405,0],.004))
  parts.push(furnitureComponent([1.06,.155,.026],[0,.49,-.157],.003))
  for(const x of [-.53,0,.53])parts.push(furnitureComponent([.026,.155,.32],[x,.49,0],.003))
  // 桌腿间的传统木横撑，保证设定图里厚重、耐用的木作结构。
  for(const x of [-.535,.535])parts.push(furnitureComponent([.04,.045,.27],[x,.14,0],.003))
  parts.push(furnitureComponent([1.02,.045,.04],[0,.14,-.145],.003))
  const geometry=mergeGeometries(parts,false)
  for(const part of parts)part.dispose()
  applySharedFurnitureVertexAo(geometry,.60)
  geometry.computeBoundingSphere()
  return geometry
}

function createStudentStoolGeometry() {
  const parts=[furnitureComponent([.32,.036,.24],[0,.362,0],.008)]
  for(const x of [-.12,.12])for(const z of [-.08,.08])parts.push(furnitureComponent([.04,.344,.04],[x,.172,z],.003))
  for(const z of [-.08,.08])parts.push(furnitureComponent([.24,.035,.035],[0,.14,z],.003))
  for(const x of [-.12,.12])parts.push(furnitureComponent([.035,.035,.16],[x,.14,0],.003))
  const geometry=mergeGeometries(parts,false)
  for(const part of parts)part.dispose()
  applySharedFurnitureVertexAo(geometry,.38)
  geometry.computeBoundingSphere()
  return geometry
}

function createOfficeDeskGeometry() {
  const parts=[]
  // 办公桌不对学生桌做整体比例拉伸：桌板仍是120×40cm，只重做更高的桌脚和隔板标高。
  parts.push(furnitureComponent([1.20,.04,.40],[0,.73,0],.009))
  for(const x of [-.535,.535])for(const z of [-.145,.145])parts.push(furnitureComponent([.052,.71,.052],[x,.355,z],.004))
  // 开放式双格隔板底面为54cm，比43cm椅面高11cm，椅子可正常收入。
  parts.push(furnitureComponent([1.06,.03,.32],[0,.555,0],.004))
  parts.push(furnitureComponent([1.06,.14,.026],[0,.64,-.157],.003))
  for(const x of [-.53,0,.53])parts.push(furnitureComponent([.026,.14,.32],[x,.64,0],.003))
  for(const x of [-.535,.535])parts.push(furnitureComponent([.04,.045,.27],[x,.17,0],.003))
  parts.push(furnitureComponent([1.02,.045,.04],[0,.17,-.145],.003))
  const geometry=mergeGeometries(parts,false)
  for(const part of parts)part.dispose()
  applySharedFurnitureVertexAo(geometry,.75)
  geometry.computeBoundingSphere()
  return geometry
}

function createOfficeChairGeometry() {
  // 坐板不作桌板式悬挑：左右边与立柱外缘基本齐平，后边收到坐板转折点；
  // 整块只向椅子正面（本地+Z）微移5mm，前边保留正常的轻微伸出。
  const parts=[furnitureComponent([.33,.038,.34],[0,.411,.005],.008)]
  // 椅腿按用户复核收细到约3.8–4cm。后腿和靠背立柱是在坐板处转折的两段木件：
  // 后腿脚端向后撑，靠背顶端也向后倾，侧视图因此在坐板后缘形成浅V形转折。
  for(const x of [-.145,.145]) {
    const frontLeg=furnitureComponent([.038,.392,.038],[x,.196,.145],.003)
    parts.push(frontLeg)
    const rearLeg=furnitureComponentSlantedZ(.04,.04,[.015,-.205],[.392,-.145],.003)
    rearLeg.translate(x,0,0);parts.push(rearLeg)
    const backPost=furnitureComponentSlantedZ(.04,.04,[.392,-.145],[.835,-.22],.003)
    backPost.translate(x,0,0);parts.push(backPost)
  }
  // 座面下四边围档和低位横撑与旧学生凳使用同一结构语言。
  // 围档与横撑全部以收细后的四根腿为基准：中心线对齐腿柱，端面收到对应柱内侧。
  for(const z of [-.145,.145])parts.push(furnitureComponent([.25,.048,.04],[0,.365,z],.003))
  for(const x of [-.145,.145])parts.push(furnitureComponent([.04,.048,.25],[x,.365,0],.003))
  const rearLegZAtStretcher=THREE.MathUtils.lerp(-.205,-.145,(.17-.015)/(.392-.015))
  for(const z of [rearLegZAtStretcher,.145])parts.push(furnitureComponent([.25,.03,.03],[0,.17,z],.003))
  const sideStretcherCenterZ=(rearLegZAtStretcher+.145)/2
  const sideStretcherDepth=.145-rearLegZAtStretcher
  for(const x of [-.145,.145])parts.push(furnitureComponent([.03,.03,sideStretcherDepth],[x,.17,sideStretcherCenterZ],.003))
  // 三道横向木靠背：上横条略宽，下方两道较窄，对应已确认概念图。
  const backZ=y=>THREE.MathUtils.lerp(-.145,-.22,(y-.392)/(.835-.392))
  for(const [y,height,radius] of [[.735,.13,.005],[.635,.07,.004],[.555,.06,.004]])parts.push(
    furnitureComponentSlantedZ(.25,.03,[y-height/2,backZ(y-height/2)],[y+height/2,backZ(y+height/2)],radius),
  )
  const geometry=mergeGeometries(parts,false)
  for(const part of parts)part.dispose()
  applySharedFurnitureVertexAo(geometry,.86)
  geometry.computeBoundingSphere()
  return geometry
}

function createTeacherDeskGeometry() {
  const parts=[]
  // 120×40×76cm 八十年代木制讲台桌；+Z 为学生侧，-Z 为教师操作侧。
  parts.push(furnitureComponent([1.20,.04,.40],[0,.74,0],.009))
  for(const x of [-.54,.54])for(const z of [-.14,.14])parts.push(furnitureComponent([.06,.72,.06],[x,.36,z],.004))
  // 学生正面与左右两侧的三块板从桌板底垂直到地面，并延伸至四角。
  // 角柱保留为内部骨架，但从三个封闭方向都不会露出独立桌脚。
  parts.push(furnitureComponentVerticalGrain([1.08,.72,.035],[0,.36,.1725],.003))
  for(const y of [.0275,.6925])parts.push(furnitureComponent([1.08,.055,.03],[0,y,.192],.003))
  for(const x of [-.532,.532])parts.push(furnitureComponent([.055,.72,.03],[x,.36,.192],.003))
  for(const x of [-.552,.552])parts.push(furnitureComponentVerticalGrain([.035,.72,.40],[x,.36,0],.003))
  for(const x of [-.572,.572])for(const y of [.0275,.6925])parts.push(furnitureComponent([.03,.055,.40],[x,y,0],.003))
  // 教师侧留出完整腿位，仅在桌面下设置横档和右侧浅抽屉。
  parts.push(furnitureComponent([1.06,.11,.035],[0,.665,-.1725],.003))
  parts.push(furnitureComponent([.42,.16,.20],[.30,.64,-.08],.005))
  parts.push(furnitureComponent([.44,.15,.022],[.30,.645,-.191],.004))
  // 桌面学生侧与左右两侧形成10cm高、2cm厚的U形挡板；教师侧完全敞开。
  parts.push(furnitureComponentVerticalGrain([1.20,.10,.02],[0,.81,.19],.004))
  for(const x of [-.59,.59])parts.push(furnitureComponentVerticalGrain([.02,.10,.38],[x,.81,0],.004))
  const geometry=mergeGeometries(parts,false)
  for(const part of parts)part.dispose()
  applySharedFurnitureVertexAo(geometry,.86)
  geometry.computeBoundingSphere()
  return geometry
}

function createTeacherDeskHandleGeometry() {
  const parts=[
    furnitureComponent([.10,.018,.018],[.30,.625,-.214],.004),
    furnitureComponent([.018,.04,.018],[.255,.625,-.203],.003),
    furnitureComponent([.018,.04,.018],[.345,.625,-.203],.003),
  ]
  const geometry=mergeGeometries(parts,false)
  for(const part of parts)part.dispose()
  geometry.computeBoundingSphere()
  return geometry
}

const studentDeskGeometry=createStudentDeskGeometry()
const studentStoolGeometry=createStudentStoolGeometry()
const officeDeskGeometry=createOfficeDeskGeometry()
const officeChairGeometry=createOfficeChairGeometry()
const teacherDeskGeometry=createTeacherDeskGeometry()
const teacherDeskHandleGeometry=createTeacherDeskHandleGeometry()

function createClassroomTubeLightGeometries() {
  const housingParts=[furnitureComponent([1.32,.045,.12],[0,0,0])]
  for(const x of [-.43,.43]) {
    const rod=new THREE.CylinderGeometry(.006,.006,.31,6)
    rod.translate(x,.177,0);housingParts.push(rod)
    const ceilingMount=new THREE.CylinderGeometry(.028,.028,.018,10)
    ceilingMount.translate(x,.341,0);housingParts.push(ceilingMount)
  }
  const housing=mergeGeometries(housingParts,false)
  housingParts.forEach(part=>part.dispose())

  const socketParts=[-.61,.61].map(x=>furnitureComponent([.075,.072,.105],[x,-.046,0]))
  const sockets=mergeGeometries(socketParts,false)
  socketParts.forEach(part=>part.dispose())

  const tube=new THREE.CylinderGeometry(.019,.019,1.20,10,1,false)
  tube.rotateZ(Math.PI/2);tube.translate(0,-.067,0)
  housing.computeBoundingSphere();sockets.computeBoundingSphere();tube.computeBoundingSphere()
  return {housing,sockets,tube}
}
const classroomTubeLightGeometries=createClassroomTubeLightGeometries()

function addClassroomTubeLight(name,position,rotationY) {
  const parts=[
    ['housing',classroomTubeLightGeometries.housing,classroomTubeLightMaterials.housing,true],
    ['sockets',classroomTubeLightGeometries.sockets,classroomTubeLightMaterials.socket,true],
    ['tube',classroomTubeLightGeometries.tube,classroomTubeLightMaterials.tube,false],
  ]
  for(const [suffix,geometry,material,castShadow] of parts) {
    const mesh=new THREE.Mesh(geometry,material)
    mesh.name=`${name}-${suffix}`;mesh.position.set(...position);mesh.rotation.y=rotationY
    mesh.castShadow=castShadow;mesh.receiveShadow=false;root.add(mesh)
  }
  classroomFixtureStats.ceilingLights++;classroomFixtureStats.tubes++
}

function addClassroomTubeLightGrid(name,ceilingY,bounds,teachingInward) {
  const [minX,maxX,minZ,maxZ]=bounds,[nx,nz]=teachingInward
  const localRight=[nz,-nx]
  const corners=[[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ]]
  const alongValues=corners.map(([x,z])=>x*nx+z*nz)
  const crossValues=corners.map(([x,z])=>x*localRight[0]+z*localRight[1])
  const alongMin=Math.min(...alongValues),alongMax=Math.max(...alongValues)
  const crossMin=Math.min(...crossValues),crossMax=Math.max(...crossValues)
  const rotationY=Math.atan2(nx,nz)
  // 三排沿黑板向教室后方展开；每排左右两盏，灯管长边与黑板平行。
  for(let row=0;row<3;row++)for(let column=0;column<2;column++) {
    const along=THREE.MathUtils.lerp(alongMin,alongMax,[.23,.50,.77][row])
    const cross=THREE.MathUtils.lerp(crossMin,crossMax,column===0?.27:.73)
    const position=[
      nx*along+localRight[0]*cross,
      ceilingY-.35,
      nz*along+localRight[1]*cross,
    ]
    addClassroomTubeLight(`${name}-ceiling-light-row-${row+1}-column-${column+1}`,position,rotationY)
  }
}

function createWallFanGuardDomeGeometry(radius,bulge,rings=7,segments=36) {
  const positions=[0,0,bulge],uvs=[.5,.5],indices=[]
  for(let ring=1;ring<=rings;ring++) {
    const ratio=ring/rings,r=radius*ratio
    const z=bulge*(1-ratio*ratio)
    for(let segment=0;segment<segments;segment++) {
      const angle=segment/segments*Math.PI*2,x=Math.cos(angle)*r,y=Math.sin(angle)*r
      positions.push(x,y,z);uvs.push(.5+x/(radius*2),.5+y/(radius*2))
    }
  }
  for(let segment=0;segment<segments;segment++)indices.push(0,1+segment,1+(segment+1)%segments)
  for(let ring=1;ring<rings;ring++)for(let segment=0;segment<segments;segment++) {
    const current=1+(ring-1)*segments+segment
    const next=1+(ring-1)*segments+(segment+1)%segments
    const outer=1+ring*segments+segment
    const outerNext=1+ring*segments+(segment+1)%segments
    indices.push(current,outer,next,next,outer,outerNext)
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2))
  geometry.computeVertexNormals();geometry.computeBoundingSphere()
  return geometry
}

function createClassroomWallFanGeometries() {
  const guardFront=createWallFanGuardDomeGeometry(.225,.078)
  const guardRear=createWallFanGuardDomeGeometry(.225,-.058)
  const blade=new THREE.PlaneGeometry(.43,.43)
  const ring=new THREE.TorusGeometry(.225,.006,5,32)
  const hub=new THREE.CylinderGeometry(.038,.040,.014,12);hub.rotateX(Math.PI/2)
  const motor=new THREE.CylinderGeometry(.086,.086,.15,12);motor.rotateX(Math.PI/2)
  const neck=new THREE.BoxGeometry(.045,.22,.055)
  const controlBox=new THREE.BoxGeometry(.14,.25,.065)
  const controlDial=new THREE.CylinderGeometry(.026,.026,.012,10);controlDial.rotateX(Math.PI/2)
  const cord=new THREE.BoxGeometry(.004,.25,.004)
  const pull=new THREE.SphereGeometry(.014,6,4)
  return {guardFront,guardRear,blade,ring,hub,motor,neck,controlBox,controlDial,cord,pull}
}
const classroomWallFanGeometries=createClassroomWallFanGeometries()

function addClassroomWallFan(name,wallCenter,inward,floorY) {
  const [nx,nz]=inward,group=new THREE.Group()
  // 以风扇头为局部原点；整体离墙16cm，底座再向后退到墙面，形成正确侧面层次。
  group.name=name;group.position.set(wallCenter[0]+nx*.16,floorY+2.24,wallCenter[1]+nz*.16)
  group.rotation.y=Math.atan2(nx,nz);root.add(group)
  const headGroup=new THREE.Group()
  headGroup.name=`${name}-downward-tilted-head`
  headGroup.position.set(0,-.035,.035)
  headGroup.rotation.x=THREE.MathUtils.degToRad(16);group.add(headGroup)
  const addPart=(suffix,geometry,material,position,options={})=>{
    const mesh=new THREE.Mesh(geometry,material)
    mesh.name=`${name}-${suffix}`;mesh.position.set(...position)
    if(options.scale)mesh.scale.set(...options.scale)
    if(options.rotation)mesh.rotation.set(...options.rotation)
    mesh.castShadow=options.castShadow??true;mesh.receiveShadow=false;(options.parent??group).add(mesh)
  }
  // 前后两片网罩都是外鼓弧面，并在同一实体圆环处会合；扇叶夹在两片弧面中间。
  const guardSeamZ=.075
  addPart('rear-guard-dome-cutout',classroomWallFanGeometries.guardRear,classroomWallFanMaterials.guard,[0,0,guardSeamZ],{parent:headGroup,castShadow:false})
  addPart('blade-cutout',classroomWallFanGeometries.blade,classroomWallFanMaterials.blade,[0,0,.075],{parent:headGroup,castShadow:false})
  addPart('front-guard-dome-cutout',classroomWallFanGeometries.guardFront,classroomWallFanMaterials.guard,[0,0,guardSeamZ],{parent:headGroup,castShadow:false})
  addPart('guard-seam-rim',classroomWallFanGeometries.ring,classroomWallFanMaterials.frame,[0,0,guardSeamZ],{parent:headGroup})
  addPart('center-hub',classroomWallFanGeometries.hub,classroomWallFanMaterials.hub,[0,0,.160],{parent:headGroup})
  addPart('rear-motor-cover',classroomWallFanGeometries.motor,classroomWallFanMaterials.housing,[0,0,-.045],{parent:headGroup})
  // 脖子下端嵌入底座、上端嵌入电机罩底部，并向教室方向前倾。
  addPart('base-to-motor-neck',classroomWallFanGeometries.neck,classroomWallFanMaterials.frame,[0,-.195,-.06],{rotation:[.58,0,0]})
  addPart('wall-control-base',classroomWallFanGeometries.controlBox,classroomWallFanMaterials.housing,[0,-.39,-.128])
  addPart('control-dial',classroomWallFanGeometries.controlDial,classroomWallFanMaterials.frame,[0,-.36,-.089])
  for(const [index,x] of [-.032,.032].entries()) {
    addPart(`pull-cord-${index+1}`,classroomWallFanGeometries.cord,classroomWallFanMaterials.frame,[x,-.64,-.088],{castShadow:false})
    addPart(`pull-knob-${index+1}`,classroomWallFanGeometries.pull,classroomWallFanMaterials.housing,[x,-.78,-.088],{castShadow:false})
  }
  classroomFixtureStats.wallFans++
}

function addClassroomWallFanGrid(name,floorY,bounds,teachingInward) {
  const [minX,maxX,minZ,maxZ]=bounds,[nx,nz]=teachingInward
  const fractions=[.25,.5,.75]
  if(Math.abs(nx)>.5) {
    // 黑板位于东西端墙时，风扇安装在南北两排窗之间的墙垛上。
    for(const [wallName,z,inwardZ] of [['north',minZ,1],['south',maxZ,-1]])for(let index=0;index<3;index++) {
      const x=THREE.MathUtils.lerp(minX,maxX,fractions[index])
      addClassroomWallFan(`${name}-${wallName}-wall-fan-${index+1}`,[x,z],[0,inwardZ],floorY)
    }
  } else if(Math.abs(nz)>.5) {
    // 两翼教室旋转了九十度，风扇相应安装在东西两排窗之间的墙垛上。
    for(const [wallName,x,inwardX] of [['west',minX,1],['east',maxX,-1]])for(let index=0;index<3;index++) {
      const z=THREE.MathUtils.lerp(minZ,maxZ,fractions[index])
      addClassroomWallFan(`${name}-${wallName}-wall-fan-${index+1}`,[x,z],[inwardX,0],floorY)
    }
  }
}

function classroomFurnitureWoodVariant(key) {
  let hash=2166136261
  for(let i=0;i<key.length;i++){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619)}
  // 中性深褐约50%，偏黄与偏灰各约25%。
  return classroomFurnitureWoodVariants[[0,0,1,2][(hash>>>0)%4]]
}

function addClassroomTeacherDesk(name,wallCenter,inward,floorY,wallThickness=.24) {
  const [nx,nz]=inward
  const localRight=[nz,-nx]
  const podiumHeight=.20,podiumDepth=1.50,podiumBackEmbed=.04,deskDepth=.40,podiumFrontGap=.05
  const wallFaceOffset=wallThickness/2
  // 讲台桌靠学生侧的讲台前沿摆放；前沿只内退5cm，完整教师活动区留在桌后。
  const centerOffset=wallFaceOffset+podiumDepth-podiumBackEmbed-podiumFrontGap-deskDepth/2
  const center=[wallCenter[0]+nx*centerOffset,wallCenter[1]+nz*centerOffset]
  const rotation=Math.atan2(nx,nz)
  const woodVariant=classroomFurnitureWoodVariant(`${name}-teacher-desk`)
  const desk=new THREE.Mesh(teacherDeskGeometry,woodVariant.material)
  desk.name=`${name}-teacher-desk`
  desk.position.set(center[0],floorY+podiumHeight,center[1])
  desk.rotation.y=rotation
  desk.castShadow=desk.receiveShadow=true
  root.add(desk)
  const handle=new THREE.Mesh(teacherDeskHandleGeometry,mat.dark)
  handle.name=`${name}-teacher-desk-drawer-handle`
  handle.position.copy(desk.position)
  handle.rotation.y=rotation
  handle.castShadow=true
  root.add(handle)
  const alongX=Math.abs(nz)>.5
  const size=alongX?[1.20,.86,.40]:[.40,.86,1.20]
  navigation.addAabb(desk.name,[center[0],floorY+podiumHeight+.43,center[1]],size)
  classroomTeacherDeskAnchors.push({
    name:desk.name,
    position:[center[0],floorY+podiumHeight+.76,center[1]],
    rotationY:rotation,
    inward:[nx,nz],localRight,
    woodVariant:woodVariant.name,
    itemSlots:[[-.34,.012,-.05],[.34,.012,-.05],[0,.016,.08]],
  })
  classroomFixtureStats.teacherDesks++
}

function addClassroomStudentFurniture(name,floorY,bounds,teachingInward) {
  const [minX,maxX,minZ,maxZ]=bounds,[nx,nz]=teachingInward
  const localRight=[nz,-nx]
  const corners=[[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ]]
  const alongValues=corners.map(([x,z])=>x*nx+z*nz)
  const crossValues=corners.map(([x,z])=>x*localRight[0]+z*localRight[1])
  const alongMin=Math.min(...alongValues),alongMax=Math.max(...alongValues)
  const crossMin=Math.min(...crossValues),crossMax=Math.max(...crossValues)
  const crossCenter=(crossMin+crossMax)/2
  const deskWidth=1.2
  // 每间教室固定为横向4列、纵向6排，共24张双人桌和48张单人凳。
  // 两侧桌先贴近左右内墙，再把中间两列等距插入；不同净宽的教室自动计算列距。
  const rows=6,columns=4,firstRowCenter=2.15,rowPitch=.98,sideWallGap=.05
  const firstColumnCross=crossMin+deskWidth/2+sideWallGap
  const lastColumnCross=crossMax-deskWidth/2-sideWallGap
  const columnSpacing=(lastColumnCross-firstColumnCross)/(columns-1)
  const columnOffsets=Array.from(
    {length:columns},
    (_,index)=>THREE.MathUtils.lerp(firstColumnCross,lastColumnCross,index/(columns-1))-crossCenter,
  )
  const baseRotation=Math.atan2(nx,nz)
  const structureLinePositions=[]
  for(let row=0;row<rows;row++)for(let column=0;column<columnOffsets.length;column++) {
    const id=`${name}-row-${row+1}-column-${column+1}`
    const along=alongMin+firstRowCenter+row*rowPitch
    const cross=crossCenter+columnOffsets[column]
    // 四条纵列必须从左右墙起笔直、等距排布；这里不对单桌加入横向偏移或旋转。
    const rotation=baseRotation
    const woodVariant=classroomFurnitureWoodVariant(id)
    const center=[
      nx*along+localRight[0]*cross,
      nz*along+localRight[1]*cross,
    ]
    const desk=new THREE.Mesh(studentDeskGeometry,woodVariant.material)
    desk.name=`${id}-student-desk`;desk.position.set(center[0],floorY,center[1]);desk.rotation.y=rotation
    desk.castShadow=desk.receiveShadow=true;root.add(desk)
    appendStudentDeskStructureLines(structureLinePositions,center,rotation,floorY)
    const deskInteraction={
      id:desk.name,type:'desk',classroom:name,center:[center[0],floorY+.31,center[1]],
      size:Math.abs(nz)>.5?[deskWidth,.62,.40]:[.40,.62,deskWidth],seatIds:[],
    }
    classroomDeskAnchors.push({
      name:desk.name,position:[center[0],floorY+.602,center[1]],rotationY:rotation,woodVariant:woodVariant.name,
      itemSlots:[[-.36,.012,-.03],[.36,.012,-.03],[0,.016,.02]],
    })
    for(const seat of [-1,1]) {
      const localX=seat*.30,localZ=.52
      const stoolCenter=[
        center[0]+localRight[0]*localX+nx*localZ,
        center[1]+localRight[1]*localX+nz*localZ,
      ]
      const stool=new THREE.Mesh(studentStoolGeometry,woodVariant.material)
      stool.name=`${id}-seat-${seat<0?'left':'right'}-student-stool`
      stool.position.set(stoolCenter[0],floorY,stoolCenter[1]);stool.rotation.y=rotation
      stool.castShadow=stool.receiveShadow=true;root.add(stool)
      appendStudentStoolStructureLines(structureLinePositions,stoolCenter,rotation,floorY)
      const seatId=stool.name
      deskInteraction.seatIds.push(seatId)
      classroomSeatingInteractions.push({
        id:seatId,type:'stool',classroom:name,deskId:desk.name,
        center:[stoolCenter[0],floorY+.19,stoolCenter[1]],
        size:Math.abs(nz)>.5?[.32,.38,.24]:[.24,.38,.32],
        sitPosition:[stoolCenter[0],floorY+1.12,stoolCenter[1]],
        facing:[-nx,-nz],
      })
      classroomFurnitureStats.stools++
    }
    classroomSeatingInteractions.push(deskInteraction)
    // 一个碰撞体覆盖桌子和两张凳子的实际占地；比为三个构件逐一加碰撞更轻量。
    const footprintCenter=[center[0]+nx*.22,center[1]+nz*.22]
    const footprintSize=Math.abs(nz)>.5?[deskWidth,.60,.84]:[.84,.60,deskWidth]
    navigation.addAabb(`${id}-student-furniture`,[footprintCenter[0],floorY+.30,footprintCenter[1]],footprintSize)
    classroomFurnitureStats.desks++;classroomFurnitureStats.seats+=2;classroomFurnitureStats.variants[woodVariant.name]++
  }
  if(structureLinePositions.length) {
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(structureLinePositions,3))
    geometry.computeBoundingSphere()
    const lines=new THREE.LineSegments(geometry,classroomFurnitureStructureLineMaterial)
    lines.name=`${name}-student-desk-structure-lines`
    lines.renderOrder=3
    ensureClassroomDetailRoots(name).outline.add(lines)
  }
  const crossFootprintHalf=(columns-1)*columnSpacing/2+deskWidth/2
  classroomFurnitureLayoutChecks.push({
    name,rows,columns,
    podiumToFirstDesk:+(firstRowCenter-.2-1.5).toFixed(3),
    columnAisle:+(columnSpacing-deskWidth).toFixed(3),
    rearClearance:+(alongMax-(alongMin+firstRowCenter+(rows-1)*rowPitch+.52+.12)).toFixed(3),
    sideClearance:+((crossMax-crossMin)/2-crossFootprintHalf).toFixed(3),
  })
  classroomFurnitureStats.rooms++
}

function addTeacherOfficeFurniture(name,floorY,bounds) {
  const [minX,maxX,minZ,maxZ]=bounds
  const centerX=(minX+maxX)/2,centerZ=(minZ+maxZ)/2
  // 40cm深办公桌下，椅子中心距35cm可让坐板收入约2cm，前腿与桌腿仍不穿插。
  const deskWallOffset=.28,chairOffset=.35
  const structureLinePositions=[]
  const placements=[]
  const addPlacement=(id,x,z,seatSide,zone)=>placements.push({id,x,z,seatSide,zone})

  // 北墙：桌子在北，椅子在南；南墙则相反。两排桌子长边均为东西向。
  // 每侧四张1.2m办公桌按1.2m节距连续并紧，形成4.8m长的完整桌排。
  for(const [index,xOffset] of [-1.8,-.6,.6,1.8].entries()) {
    addPlacement(`north-window-${index+1}`,centerX+xOffset,minZ+deskWallOffset,[0,1],'north-window')
    addPlacement(`south-window-${index+1}`,centerX+xOffset,maxZ-deskWallOffset,[0,-1],'south-window')
  }
  // 西墙三张桌子长边转为南北向，椅子放在东侧、坐下后朝西。
  for(const [index,zOffset] of [-1.20,0,1.20].entries())addPlacement(
    `west-blackboard-${index+1}`,minX+deskWallOffset,centerZ+zOffset,[1,0],'west-blackboard',
  )
  // 中央四组以2列×2排布置。每组四张桌边紧贴，椅子位于南北外侧。
  let groupIndex=0
  for(const groupZ of [centerZ-1.14,centerZ+1.14])for(const groupX of [centerX-1.45,centerX+1.45]) {
    groupIndex++
    for(const [rowIndex,rowZ] of [-.20,.20].entries()) {
      const seatSide=rowZ<0?[0,-1]:[0,1]
      for(const [columnIndex,columnX] of [-.60,.60].entries())addPlacement(
        `center-group-${groupIndex}-row-${rowIndex+1}-desk-${columnIndex+1}`,
        groupX+columnX,groupZ+rowZ,seatSide,`center-group-${groupIndex}`,
      )
    }
  }

  for(const placement of placements) {
    const {id,x,z,seatSide:[sx,sz],zone}=placement
    const rotation=Math.atan2(sx,sz)
    const furnitureId=`${name}-office-${id}`
    const woodVariant=classroomFurnitureWoodVariant(furnitureId)
    const desk=new THREE.Mesh(officeDeskGeometry,woodVariant.material)
    desk.name=`${furnitureId}-desk`
    desk.position.set(x,floorY,z);desk.rotation.y=rotation
    desk.castShadow=desk.receiveShadow=true;root.add(desk)
    appendOfficeDeskStructureLines(structureLinePositions,[x,z],rotation,floorY)

    const chairCenter=[x+sx*chairOffset,z+sz*chairOffset]
    const chair=new THREE.Mesh(officeChairGeometry,woodVariant.material)
    chair.name=`${furnitureId}-chair`
    // 椅子的本地-Z是椅背侧；相对桌子转180°，使椅背远离桌面。
    chair.position.set(chairCenter[0],floorY,chairCenter[1]);chair.rotation.y=rotation+Math.PI
    chair.castShadow=chair.receiveShadow=true;root.add(chair)
    appendOfficeChairStructureLines(structureLinePositions,chairCenter,rotation+Math.PI,floorY)

    const chairId=chair.name
    classroomDeskAnchors.push({
      name:desk.name,classroom:name,position:[x,floorY+.752,z],floorY,rotationY:rotation,woodVariant:woodVariant.name,
      proxyScale:[1,1.25,1],
      itemSlots:[[-.36,.012,-.03],[.36,.012,-.03],[0,.016,.02]],office:true,zone,
    })
    classroomSeatingInteractions.push({
      id:chairId,type:'chair',classroom:name,deskId:desk.name,
      center:[chairCenter[0],floorY+.43,chairCenter[1]],size:[.34,.86,.34],
      sitPosition:[chairCenter[0],floorY+1.17,chairCenter[1]],facing:[-sx,-sz],office:true,zone,
    })
    teacherOfficeFurniturePlacements.push({
      id:furnitureId,classroom:name,zone,desk:[x,floorY,z],chair:[chairCenter[0],floorY,chairCenter[1]],
      deskRotationY:rotation,chairRotationY:rotation+Math.PI,chairFacing:[-sx,-sz],woodVariant:woodVariant.name,
    })
    classroomSeatingInteractions.push({
      id:desk.name,type:'desk',classroom:name,center:[x,floorY+.375,z],
      size:Math.abs(sz)>.5?[1.20,.75,.40]:[.40,.75,1.20],seatIds:[chairId],office:true,zone,
    })
    const footprintCenter=[x+sx*.18,z+sz*.18]
    const footprintSize=Math.abs(sz)>.5?[1.20,.86,.76]:[.76,.86,1.20]
    navigation.addAabb(`${furnitureId}-furniture`,[footprintCenter[0],floorY+.43,footprintCenter[1]],footprintSize)
    classroomFurnitureStats.officeDesks++
    classroomFurnitureStats.officeChairs++
    classroomFurnitureStats.variants[woodVariant.name]++
  }
  if(structureLinePositions.length) {
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(structureLinePositions,3))
    geometry.computeBoundingSphere()
    const lines=new THREE.LineSegments(geometry,classroomFurnitureStructureLineMaterial)
    lines.name=`${name}-office-furniture-structure-lines`
    lines.renderOrder=3
    ensureClassroomDetailRoots(name).outline.add(lines)
  }
  classroomFurnitureLayoutChecks.push({
    name,type:'office',desks:placements.length,chairs:placements.length,
    northWallDesks:placements.filter(item=>item.zone==='north-window').length,
    southWallDesks:placements.filter(item=>item.zone==='south-window').length,
    westWallDesks:placements.filter(item=>item.zone==='west-blackboard').length,
    centerGroups:4,centerGroupDesks:16,
    eastClearance:+(maxX-(centerX+1.45+.60+.60)).toFixed(3),
    westToCenterAisle:+((centerX-1.45-.60-.60)-(minX+deskWallOffset+chairOffset+.17)).toFixed(3),
  })
  classroomFurnitureStats.officeRooms++
}

function addClassroomFixtures(name,floorY,ceilingY,wallThickness,boards,teachingBoard,bounds) {
  classroomInteriorZones.push({name,floorY,ceilingY,bounds:[...bounds]})
  const boardAnchors=boards.map(([side,wallCenter,inward])=>({
    side,...addClassroomBlackboard(`${name}-${side}`,wallCenter,inward,floorY,wallThickness),
  }))
  const [,teachingCenter,teachingInward]=boards.find(([side])=>side===teachingBoard)
  const office=classroomOfficeRooms.has(name)
  if(!office) {
    addClassroomPodium(`${name}-${teachingBoard}`,teachingCenter,teachingInward,floorY,wallThickness)
    addClassroomTeacherDesk(`${name}-${teachingBoard}`,teachingCenter,teachingInward,floorY,wallThickness)
  }
  addClassroomWallFanGrid(name,floorY,bounds,teachingInward)
  if(office) {
    classroomFurnitureStats.officesSkipped++
    addTeacherOfficeFurniture(name,floorY,bounds)
    addClassroomTubeLightGrid(name,ceilingY,bounds,teachingInward)
  }
  else {
    addClassroomStudentFurniture(name,floorY,bounds,teachingInward)
    addClassroomTubeLightGrid(name,ceilingY,bounds,teachingInward)
  }
  schoolEphemeraAnchors.classrooms.push({
    id:name,floorY,ceilingY,teachingBoard,boards:boardAnchors,
    office,building:name.startsWith('b1-')?'building1':'building2',
  })
  if(!office) {
    const teaching=boardAnchors.find(board=>board.side===teachingBoard)
    if(teaching.board.writable)classroomTeachingBlackboards.push({
      ...teaching,classroom:name,role:'teaching',
      center:[
        teaching.wallCenter[0]+teaching.normal[0]*teaching.boardOffset,
        floorY+teaching.board.bottom+teaching.board.height/2,
        teaching.wallCenter[1]+teaching.normal[1]*teaching.boardOffset,
      ],
      tangent:[teaching.normal[1],-teaching.normal[0]],
    })
  }
  classroomFixtureStats.classrooms++
}

function cylinder(name, radius, height, position, material, segments = 12, parent = root) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.castShadow = mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addFoundationBottomOutline(name,points,y,outwardOffset=.018) {
  const center=points.reduce((sum,[x,z])=>sum.add(new THREE.Vector2(x,z)),new THREE.Vector2()).multiplyScalar(1/points.length)
  const expanded=points.map(([x,z])=>{
    const direction=new THREE.Vector2(x-center.x,z-center.y)
    if(direction.lengthSq()>1e-8)direction.normalize().multiplyScalar(outwardOffset)
    return [x+direction.x,z+direction.y]
  })
  const positions=[]
  for(let i=0;i<expanded.length;i++) {
    const a=expanded[i],b=expanded[(i+1)%expanded.length]
    positions.push(a[0],y,a[1],b[0],y,b[1])
  }
  const geometry=new LineSegmentsGeometry()
  geometry.setPositions(positions)
  const lines=new LineSegments2(geometry,artisticOutlineMaterials.foundationStroke)
  lines.name=`foundation-bottom-outline-${name}`
  lines.frustumCulled=false
  lines.renderOrder=6
  artisticOutlineRoot.add(lines)
  return lines
}

function rectangularFoundationOutline(name,center,size,y) {
  const [cx,cz]=center,[w,d]=size
  return addFoundationBottomOutline(name,[[cx-w/2,cz-d/2],[cx+w/2,cz-d/2],[cx+w/2,cz+d/2],[cx-w/2,cz+d/2]],y)
}

function addLabel(text, position, tone = '#fff7d6') {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(39,49,41,.75)'; ctx.roundRect(8, 8, 496, 80, 15); ctx.fill()
  ctx.fillStyle = tone; ctx.font = '600 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 49)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }))
  sprite.name = `label-${text}`; sprite.position.set(...position); sprite.scale.set(8, 1.5, 1); sprite.visible = false
  root.add(sprite); debugObjects.push(sprite)
}

function gableRoof(name, center, width, depth, eaveY, rise, material, slopeAxis = 'x') {
  // 默认坡面沿东西向下降；slopeAxis='z' 时坡面沿南北向下降、屋脊转为东西向。
  const slopesNorthSouth = slopeAxis === 'z'
  const x = (slopesNorthSouth ? depth : width) / 2
  const z = (slopesNorthSouth ? width : depth) / 2
  const vertices = new Float32Array([
    -x,0,-z, x,0,-z, 0,rise,-z, -x,0,z, x,0,z, 0,rise,z,
  ])
  // 各面必须从建筑外侧观察为逆时针：坡面法线朝上、底面法线朝下。
  // 旧绕序整体朝向屋顶内部，视角移动时会出现背面剔除造成的缺面与闪动。
  const indices = [
    0,2,1, 5,3,4,
    0,4,3, 0,1,4,
    2,4,1, 2,5,4,
    0,5,2, 0,3,5,
  ]
  const geometry = new THREE.BufferGeometry()
  const uvs = new Float32Array([
    0,0, 0,1, 0,.5,
    1,0, 1,1, 1,.5,
  ])
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name; mesh.position.set(center[0], eaveY, center[1]); mesh.rotation.y = slopesNorthSouth ? Math.PI / 2 : 0
  // 三座瓦顶上方均无遮挡：保留向下投影，关闭无意义的自身阴影接收，避免斜面闪纹。
  mesh.castShadow = true; mesh.receiveShadow = false
  root.add(mesh); return mesh
}

function detailedOldClassroomRoof(name, center, roofSize, wallSize, eaveY, rise) {
  const [cx,cz]=center,[width,depth]=roofSize,[wallWidth,wallDepth]=wallSize
  const halfDepth=depth/2,slopeLength=Math.hypot(halfDepth,rise),angle=Math.atan2(rise,halfDepth)
  const shellThickness=.14

  // 两片有真实厚度的坡屋面取代原单层三角壳；各自的立边使檐口和山墙端部不再像纸片。
  for(const side of [-1,1]) {
    const slope=box(`${name}-tile-slope-shell`,[width,shellThickness,slopeLength],[cx,eaveY+rise/2,cz+side*halfDepth/2],sampleMat.roofTile)
    slope.rotation.x=side*angle
  }

  // 墙体上方补成白灰墙山墙三角面；它只闭合外观，不增加可进入空间或碰撞。
  const north=cz-wallDepth/2,south=cz+wallDepth/2,west=cx-wallWidth/2,east=cx+wallWidth/2
  const ridgeUnderY=eaveY+rise-shellThickness
  const gableVertices=new Float32Array([
    west,eaveY,north, west,eaveY,south, west,ridgeUnderY,cz,
    east,eaveY,north, east,eaveY,south, east,ridgeUnderY,cz,
  ])
  const gableGeometry=new THREE.BufferGeometry()
  gableGeometry.setAttribute('position',new THREE.BufferAttribute(gableVertices,3))
  // 山墙沿用旧石灰墙贴图，但从纹理中段取样，避免把只应出现在墙脚的潮痕抬到檐口。
  gableGeometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array([
    0,.35, 1,.35, .5,1,
    0,.35, 1,.35, .5,1,
  ]),2))
  gableGeometry.setIndex([0,1,2,3,5,4]); gableGeometry.computeVertexNormals()
  const gables=new THREE.Mesh(gableGeometry,sampleMat.limewashOld)
  gables.name=`${name}-gable-wall`; gables.castShadow=gables.receiveShadow=true; root.add(gables)

  // 檐口下方连续木檩和均匀椽尾。间距及截面均为外观候选值，不作为历史构造定论。
  const rafterRun=depth-wallDepth+.05
  const rafterCenterInset=rafterRun/2-.08
  const rafterY=eaveY+rise*rafterCenterInset/halfDepth-.12
  const rafterCount=Math.max(2,Math.round((width-.35)/.64))
  for(const side of [-1,1]) {
    box(`${name}-eave-wood-purlin`,[width-.24,.18,.18],[cx,eaveY-.12,cz+side*(halfDepth-.16)],mat.wood)
    for(let i=0;i<=rafterCount;i++) {
      const x=THREE.MathUtils.lerp(cx-width/2+.2,cx+width/2-.2,i/rafterCount)
      const rafter=box(`${name}-eave-wood-rafter`,[.09,.11,rafterRun],[x,rafterY,cz+side*(halfDepth-rafterRun/2+.08)],mat.wood,{shadow:false})
      rafter.rotation.x=side*angle
    }
  }

  // 两端沿坡向的封檐木板强化山墙边缘厚度。
  for(const x of [cx-width/2+.03,cx+width/2-.03]) for(const side of [-1,1]) {
    const board=box(`${name}-gable-edge-board`,[.15,.17,slopeLength+.08],[x,eaveY+rise/2-.07,cz+side*halfDepth/2],mat.wood)
    board.rotation.x=side*angle
  }

  // 檐口瓦当以低面数短圆筒表达瓦片端头；不逐片复制完整坡面几何。
  const eaveTileGeometry=new THREE.CylinderGeometry(.09,.09,.22,8,1,false,Math.PI/2,Math.PI)
  eaveTileGeometry.rotateX(Math.PI/2)
  const eaveTileCount=Math.max(2,Math.round(width/.34))
  for(const side of [-1,1]) for(let i=0;i<eaveTileCount;i++) {
    const tile=new THREE.Mesh(eaveTileGeometry,sampleMat.roofTile)
    tile.name=`${name}-eave-tile-end`
    tile.position.set(THREE.MathUtils.lerp(cx-width/2+.17,cx+width/2-.17,(i+.5)/eaveTileCount),eaveY+.02,cz+side*(halfDepth+.05))
    tile.castShadow=false; tile.receiveShadow=true; root.add(tile)
  }

  // 分段圆脊瓦覆盖两坡交线，形成远近景都可辨认的屋脊轮廓。
  const ridgePitch=.46,ridgeCount=Math.max(2,Math.round((width+.12)/ridgePitch))
  const ridgeLength=(width+.16)/ridgeCount+.035
  const ridgeGeometry=new THREE.CylinderGeometry(.17,.17,ridgeLength,10,1,false,0,Math.PI)
  ridgeGeometry.rotateZ(Math.PI/2)
  for(let i=0;i<ridgeCount;i++) {
    const ridgeTile=new THREE.Mesh(ridgeGeometry,sampleMat.roofTile)
    ridgeTile.name=`${name}-ridge-cap-tile`
    ridgeTile.position.set(THREE.MathUtils.lerp(cx-width/2,cx+width/2,(i+.5)/ridgeCount),eaveY+rise+.015,cz)
    ridgeTile.castShadow=ridgeTile.receiveShadow=true; root.add(ridgeTile)
  }
}

function flatRoof(name, center, size, y) {
  box(name, [size[0] + .6, .2, size[1] + .6], [center[0], y, center[1]], mat.roof)
  const cols = Math.floor(size[0] / 2)
  for (let i = 0; i <= cols; i++) {
    const x = center[0] - size[0] / 2 + i * size[0] / cols
    box(`${name}-air-support`, [.08, .16, size[1] - .25], [x, y + .18, center[1]], mat.dark, { shadow: false })
  }
  box(`${name}-insulation-plane`, [size[0] + .25, .1, size[1] + .25], [center[0], y + .31, center[1]], mat.concrete)
}

function wallX(name, x1, x2, z, base, height, material, openings = [], thickness = .24) {
  const sorted = openings.map(o => ({ bottom: 0, ...o })).sort((a,b) => a.center - b.center)
  let cursor = x1
  for (const o of sorted) {
    const left = Math.max(x1, o.center - o.width / 2), right = Math.min(x2, o.center + o.width / 2)
    if (left > cursor) box(name, [left-cursor,height,thickness], [(cursor+left)/2,base+height/2,z], material, { collider:true })
    if (o.bottom > 0) box(`${name}-sill`, [right-left,o.bottom,thickness], [(left+right)/2,base+o.bottom/2,z], material, { collider:true })
    const top = o.bottom + o.height
    if (top < height) box(`${name}-lintel`, [right-left,height-top,thickness], [(left+right)/2,base+(height+top)/2,z], material, { collider:true })
    cursor = Math.max(cursor, right)
  }
  if (cursor < x2) box(name, [x2-cursor,height,thickness], [(cursor+x2)/2,base+height/2,z], material, { collider:true })
}

function solidWallZ(name, z1, z2, x, base, height, material, thickness = .24) {
  box(name, [thickness,height,z2-z1], [x,base+height/2,(z1+z2)/2], material, { collider:true })
}

function wallZ(name, z1, z2, x, base, height, material, openings = [], thickness = .24) {
  const sorted=openings.map(o=>({bottom:0,...o})).sort((a,b)=>a.center-b.center)
  let cursor=z1
  for(const o of sorted) {
    const near=Math.max(z1,o.center-o.width/2),far=Math.min(z2,o.center+o.width/2)
    if(near>cursor) box(name,[thickness,height,near-cursor],[x,base+height/2,(cursor+near)/2],material,{collider:true})
    if(o.bottom>0) box(`${name}-sill`,[thickness,o.bottom,far-near],[x,base+o.bottom/2,(near+far)/2],material,{collider:true})
    const top=o.bottom+o.height
    if(top<height) box(`${name}-lintel`,[thickness,height-top,far-near],[x,base+(height+top)/2,(near+far)/2],material,{collider:true})
    cursor=Math.max(cursor,far)
  }
  if(cursor<z2) box(name,[thickness,height,z2-cursor],[x,base+height/2,(cursor+z2)/2],material,{collider:true})
}

function interiorPanelX(name,x1,x2,z,base,height,facingZ,wallThickness=.24) {
  if(x2-x1<.01||height<.01)return
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(x2-x1,height),interiorFinishMaterial(name))
  mesh.name=name
  mesh.position.set((x1+x2)/2,base+height/2,z+facingZ*(wallThickness/2+FINISH_SURFACE_GAP))
  mesh.rotation.y=facingZ>0?0:Math.PI
  mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh)
}

function interiorPanelZ(name,z1,z2,x,base,height,facingX,wallThickness=.24) {
  if(z2-z1<.01||height<.01)return
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(z2-z1,height),interiorFinishMaterial(name))
  mesh.name=name
  mesh.position.set(x+facingX*(wallThickness/2+FINISH_SURFACE_GAP),base+height/2,(z1+z2)/2)
  mesh.rotation.y=facingX>0?Math.PI/2:-Math.PI/2
  mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh)
}

function interiorWallX(name,x1,x2,z,base,height,facingZ,openings=[],wallThickness=.24) {
  const sorted=openings.map(o=>({bottom:0,...o})).sort((a,b)=>a.center-b.center)
  let cursor=x1
  for(const o of sorted) {
    const left=Math.max(x1,o.center-o.width/2),right=Math.min(x2,o.center+o.width/2)
    if(left>cursor)interiorPanelX(name,cursor,left,z,base,height,facingZ,wallThickness)
    if(o.bottom>0)interiorPanelX(`${name}-sill`,left,right,z,base,o.bottom,facingZ,wallThickness)
    const top=o.bottom+o.height
    if(top<height)interiorPanelX(`${name}-lintel`,left,right,z,base+top,height-top,facingZ,wallThickness)
    cursor=Math.max(cursor,right)
  }
  if(cursor<x2)interiorPanelX(name,cursor,x2,z,base,height,facingZ,wallThickness)
}

function interiorWallZ(name,z1,z2,x,base,height,facingX,openings=[],wallThickness=.24) {
  const sorted=openings.map(o=>({bottom:0,...o})).sort((a,b)=>a.center-b.center)
  let cursor=z1
  for(const o of sorted) {
    const near=Math.max(z1,o.center-o.width/2),far=Math.min(z2,o.center+o.width/2)
    if(near>cursor)interiorPanelZ(name,cursor,near,x,base,height,facingX,wallThickness)
    if(o.bottom>0)interiorPanelZ(`${name}-sill`,near,far,x,base,o.bottom,facingX,wallThickness)
    const top=o.bottom+o.height
    if(top<height)interiorPanelZ(`${name}-lintel`,near,far,x,base+top,height-top,facingX,wallThickness)
    cursor=Math.max(cursor,far)
  }
  if(cursor<z2)interiorPanelZ(name,cursor,z2,x,base,height,facingX,wallThickness)
}

function classroomCeiling(name,x1,x2,z1,z2,y) {
  if(x2-x1<.01||z2-z1<.01)return
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(x2-x1,z2-z1),ceilingFinishMaterial(name))
  mesh.name=name
  mesh.position.set((x1+x2)/2,y-FINISH_SURFACE_GAP,(z1+z2)/2)
  mesh.rotation.x=Math.PI/2
  mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh)
}

function railX(name, x1, x2, y, z, style = 'simple') {
  const beamMaterial=style==='b1'?mat.b2RailWarmWhite:mat.rail
  box(`${name}-top`, [x2-x1,.1,.14], [(x1+x2)/2,y+1.02,z], beamMaterial)
  box(`${name}-bottom`, [x2-x1,.1,.12], [(x1+x2)/2,y+.12,z], beamMaterial)
  addSegmentCollider(`${name}-barrier`,[x1,z],[x2,z],y,y+1.1,.14)
  if (style === 'b1') {
    b1RailingPatternPanel(name, x2-x1, y, [(x1+x2)/2,z])
    return
  }
  const spacing = style === 'b2' ? .55 : .72, count = Math.max(1, Math.ceil((x2-x1)/spacing))
  for (let i=0; i<=count; i++) {
    const x = THREE.MathUtils.lerp(x1,x2,i/count)
    const post = box(`${name}-post`, [style === 'b2' ? .1 : .07,.82,.12], [x,y+.57,z], mat.rail, { shadow:false })
    if (style === 'b1') post.rotation.z = i % 2 ? .12 : -.12
  }
}

function railZ(name, z1, z2, y, x, style = 'simple') {
  const beamMaterial=style==='b1'?mat.b2RailWarmWhite:mat.rail
  box(`${name}-top`, [.14,.1,z2-z1], [x,y+1.02,(z1+z2)/2], beamMaterial)
  box(`${name}-bottom`, [.12,.1,z2-z1], [x,y+.12,(z1+z2)/2], beamMaterial)
  addSegmentCollider(`${name}-barrier`,[x,z1],[x,z2],y,y+1.1,.14)
  if (style === 'b1') {
    b1RailingPatternPanel(name, z2-z1, y, [x,(z1+z2)/2], -Math.PI/2)
    return
  }
  const count = Math.ceil((z2-z1)/.72)
  for(let i=0;i<=count;i++) box(`${name}-post`, [.12,.82,.07], [x,y+.57,THREE.MathUtils.lerp(z1,z2,i/count)], mat.rail, { shadow:false })
}

function wingEntrySteps(name, x, z, floorY, outwardDirection, width, count) {
  const run=.32
  for(let i=0;i<count;i++) {
    const height=floorY*(count-i)/count
    const centerX=x+outwardDirection*run*(i+.5)
    box(`${name}-step`,[run,height,width],[centerX,height/2,z],mat.concrete)
    addWalkRect(`${name}-step-walk`,[centerX,z],[run,width],height)
  }
}

function b1RearDoorSteps(name, x, wallZ, floorY, wallThickness, count = 2) {
  const run=.32,width=1.25
  // 楼板已经向墙外挑出一段，台阶从楼板外缘继续向外排，不能压回楼板顶面。
  const northFloorEdge=wallZ-(CAMPUS.buildings.building1.structuralSlabEdgeOverhang??CAMPUS.buildings.building1.slabEdgeOverhang)
  for(let i=0;i<count;i++) {
    const height=floorY*(count-i)/count
    const centerZ=northFloorEdge-run*(i+.5)
    // 顶面负责提供逐级高度，实体碰撞负责封住台阶侧面。没有后者时，从
    // 台阶侧边斜切可以绕过 0.20m 的低级，直接钻进 0.40m 楼板下方。
    // walkable 让已站上低一级的玩家仍可按正常 maxStep 跨上高一级。
    box(
      `${name}-step`,[width,height,run],[x,height/2,centerZ],mat.concrete,
      {collider:{walkable:true}},
    )
    addWalkRect(`${name}-step-walk`,[x,centerZ],[width,run],height)
  }
}

function railDiagonal(name, a, b, y, style = 'b1') {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx)
  const beamMaterial=style==='b1'?mat.b2RailWarmWhite:mat.rail
  for(const [suffix,height] of [['top',1.02],['bottom',.12]]) {
    const beam=box(`${name}-${suffix}`,[length,.1,.13],[(a[0]+b[0])/2,y+height,(a[1]+b[1])/2],beamMaterial)
    beam.rotation.y=angle
  }
  addSegmentCollider(`${name}-barrier`,a,b,y,y+1.1,.14)
  if(style==='b1') {
    b1RailingPatternPanel(name,length,y,[(a[0]+b[0])/2,(a[1]+b[1])/2],angle)
    return
  }
  const count=Math.max(1,Math.ceil(length/(style==='b1'?.72:.55)))
  for(let i=0;i<=count;i++) {
    const t=i/count
    const post=box(`${name}-post`,[.07,.82,.11],[THREE.MathUtils.lerp(a[0],b[0],t),y+.57,THREE.MathUtils.lerp(a[1],b[1],t)],mat.rail,{shadow:false})
    post.rotation.y=angle
  }
}

function edgeBandDiagonal(name,a,b,topY,size,material) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)
  const beam=box(name,[length,size[0],size[1]],[(a[0]+b[0])/2,topY-size[0]/2,(a[1]+b[1])/2],material)
  beam.rotation.y=-Math.atan2(dz,dx)
}

function roundedRectPath(target,length,width,radius,clockwise=false) {
  const x=length/2,z=width/2,r=Math.min(radius,x-.001,z-.001)
  if(!clockwise) {
    target.moveTo(-x+r,-z); target.lineTo(x-r,-z); target.quadraticCurveTo(x,-z,x,-z+r)
    target.lineTo(x,z-r); target.quadraticCurveTo(x,z,x-r,z); target.lineTo(-x+r,z)
    target.quadraticCurveTo(-x,z,-x,z-r); target.lineTo(-x,-z+r); target.quadraticCurveTo(-x,-z,-x+r,-z)
  } else {
    target.moveTo(-x+r,-z); target.quadraticCurveTo(-x,-z,-x,-z+r); target.lineTo(-x,z-r)
    target.quadraticCurveTo(-x,z,-x+r,z); target.lineTo(x-r,z); target.quadraticCurveTo(x,z,x,z-r)
    target.lineTo(x,-z+r); target.quadraticCurveTo(x,-z,x-r,-z); target.lineTo(-x+r,-z)
  }
  target.closePath(); return target
}

function roundedPlanter(name,length,position,angle,config) {
  const addExtruded=(suffix,shape,height,y,material)=>{
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:4})
    geometry.rotateX(-Math.PI/2)
    const mesh=new THREE.Mesh(geometry,material); mesh.name=`${name}-${suffix}`
    mesh.position.set(position[0],y,position[1]); mesh.rotation.y=angle; mesh.castShadow=mesh.receiveShadow=true; root.add(mesh)
  }
  const bodyShape=roundedRectPath(new THREE.Shape(),length,config.width,config.cornerRadius)
  addExtruded('body',bodyShape,config.height-config.rimHeight,0,mat.plinth)
  const rimShape=roundedRectPath(new THREE.Shape(),length,config.width,config.cornerRadius)
  const innerLength=Math.max(.05,length-2*config.rimThickness),innerWidth=Math.max(.05,config.width-2*config.rimThickness)
  rimShape.holes.push(roundedRectPath(new THREE.Path(),innerLength,innerWidth,Math.max(.01,config.cornerRadius-config.rimThickness),true))
  addExtruded('rim',rimShape,config.rimHeight,config.height-config.rimHeight,mat.concrete)
}

const planterCamphorShrubPlacements=[]
const planterCamphorCellGeometries=[]
const planterFlowerCellGeometries=[]
const PLANTER_SHRUB_CARD_SCALE=1.18
const PLANTER_SHRUB_SHAPE_PROFILES=[
  {width:[1.30,1.48],height:[1.34,1.53],cards:3,spread:.045},
  {width:[1.60,1.82],height:[1.22,1.42],cards:4,spread:.065},
  {width:[1.22,1.42],height:[1.66,1.90],cards:3,spread:.035},
  {width:[1.44,1.68],height:[1.46,1.72],cards:4,spread:.055},
]
const PLANTER_FLOWER_B2_CELL_ORDER=[2,5,0,4,1,3]

function planterShrubRandom(seedText) {
  let state=2166136261
  for(let index=0;index<seedText.length;index++) {
    state^=seedText.charCodeAt(index)
    state=Math.imul(state,16777619)
  }
  return()=>{
    state+=0x6d2b79f5
    let value=state
    value=Math.imul(value^(value>>>15),value|1)
    value^=value+Math.imul(value^(value>>>7),value|61)
    return((value^(value>>>14))>>>0)/4294967296
  }
}

function queuePlanterCamphorShrub(name,x,z,baseY,scale,variant=0,axis='x') {
  planterCamphorShrubPlacements.push({name,x,z,baseY,scale,variant,axis})
}

function fillLinearPlanterWithShrubs(name,start,end,fixed,axis,config) {
  const length=Math.abs(end-start)
  const inset=Math.min(.3,length*.16)
  const usableLength=Math.max(0,length-inset*2)
  const count=Math.max(1,Math.floor(usableLength/.58)+1)
  const minimum=Math.min(start,end)+inset,maximum=Math.max(start,end)-inset
  const step=count>1?usableLength/(count-1):0
  for(let index=0;index<count;index++) {
    const random=planterShrubRandom(`${name}:${axis}:${index}`)
    const t=count===1?.5:index/(count-1)
    const evenAlong=THREE.MathUtils.lerp(minimum,maximum,t)
    const along=count===1?evenAlong:THREE.MathUtils.clamp(
      evenAlong+(random()-.5)*Math.min(.14,step*.28),minimum,maximum,
    )
    const variant=random()*Math.PI*2
    const lateral=(random()-.5)*.09
    const scale=.44+random()*.16
    const x=axis==='x'?along:fixed+lateral
    const z=axis==='x'?fixed+lateral:along
    queuePlanterCamphorShrub(`${name}-shrub-${index+1}`,x,z,config.height-.055,scale,variant,axis)
  }
}

function planterX(name,x1,x2,z,outwardDirection,config,innerOffset=0) {
  const centerZ=z+outwardDirection*(innerOffset+config.width/2)
  roundedPlanter(name,x2-x1,[(x1+x2)/2,centerZ],0,config)
  fillLinearPlanterWithShrubs(name,x1,x2,centerZ,'x',config)
}

function planterZ(name,z1,z2,x,outwardDirection,config,innerOffset=0) {
  const centerX=x+outwardDirection*(innerOffset+config.width/2)
  roundedPlanter(name,z2-z1,[centerX,(z1+z2)/2],-Math.PI/2,config)
  fillLinearPlanterWithShrubs(name,z1,z2,centerX,'z',config)
}

function shapePlate(name, points, y, material, thickness = .16, holes = []) {
  const shape=new THREE.Shape()
  points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z))
  shape.closePath()
  for(const holePoints of holes) {
    const hole=new THREE.Path()
    // 洞口方向与外轮廓相反，确保挤出三角化时识别为楼板孔洞。
    ;[...holePoints].reverse().forEach(([x,z],i)=>i?hole.lineTo(x,-z):hole.moveTo(x,-z))
    hole.closePath(); shape.holes.push(hole)
  }
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false})
  geometry.rotateX(-Math.PI/2)
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=name; mesh.position.y=y; mesh.castShadow=mesh.receiveShadow=true; root.add(mesh)
  return mesh
}

function portalFacade(name, x1, x2, openingLeft, openingRight, clearHeight, fullHeight, z, depth, material) {
  // 单一倒U形挤出体：左右门垛和通高门楣属于同一几何，不产生拼装接缝。
  const shape=new THREE.Shape()
  ;[[x1,0],[openingLeft,0],[openingLeft,clearHeight],[openingRight,clearHeight],[openingRight,0],[x2,0],[x2,fullHeight],[x1,fullHeight]].forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y))
  shape.closePath()
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false})
  geometry.translate(0,0,-depth/2)
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=name; mesh.position.z=z; mesh.castShadow=mesh.receiveShadow=true; root.add(mesh)
  return mesh
}

function b1PortalSchoolName(x,clearHeight,fullHeight,frontZ) {
  // 历史照片中的九字校名位于中央门洞正面门楣。透明贴图保留原手写字迹，
  // 平面仅比粉刷墙前移 8mm，既贴墙又避免深度闪动。
  const width=3.8
  const height=width*276/1536
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),b1SchoolNameMaterial)
  mesh.name='b1-central-portal-school-name'
  mesh.position.set(x,clearHeight+(fullHeight-clearHeight)*.52,frontZ+.008)
  mesh.castShadow=false
  mesh.receiveShadow=false
  mesh.renderOrder=3
  root.add(mesh)
  return mesh
}

function insetPolygon(points,distance) {
  const signedArea=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1]},0)/2
  const inwardSign=signedArea>0?1:-1
  const lines=points.map((p,i)=>{
    const q=points[(i+1)%points.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz)
    const nx=-dz/len*inwardSign,nz=dx/len*inwardSign
    return {p:[p[0]+nx*distance,p[1]+nz*distance],d:[dx,dz]}
  })
  return points.map((_,i)=>{
    const a=lines[(i-1+lines.length)%lines.length],b=lines[i]
    const cross=a.d[0]*b.d[1]-a.d[1]*b.d[0]
    if(Math.abs(cross)<1e-6) return b.p
    const qx=b.p[0]-a.p[0],qz=b.p[1]-a.p[1]
    const t=(qx*b.d[1]-qz*b.d[0])/cross
    return [a.p[0]+a.d[0]*t,a.p[1]+a.d[1]*t]
  })
}

const B1_ASSET_URLS = {
  doorLeft: '/assets/models/building-1/b1-classroom-door-wood-left-v01.glb?v=2',
  doorRight: '/assets/models/building-1/b1-classroom-door-wood-right-v01.glb?v=2',
  windowCorridor: '/assets/models/building-1/b1-classroom-window-wood-corridor-v01.glb?v=2',
  windowRear: '/assets/models/building-1/b1-classroom-window-wood-rear-v01.glb?v=2',
  windowB2Alloy: ['q95','q98'].includes(b2WindowWebpCandidate)
    ? `/artifacts/performance/phase6n/b2-window-webp-candidates/b2-classroom-window-alloy-webp-${b2WindowWebpCandidate}.glb?v=1`
    : '/assets/models/building-2/b2-classroom-window-alloy-v01.glb?v=webp-v6',
}
const B1_SHARED_TEXTURE_LIBRARY_URL = '/assets/models/building-openings/building-opening-shared-textures-v01.glb?v=2'

function collectSharedOpeningMaterials(scene) {
  const materials=new Map()
  scene.traverse(node=>{
    if(!node.isMesh)return
    for(const material of Array.isArray(node.material)?node.material:[node.material]) {
      const match=material?.name.match(/^shared-opening-(.+)$/)
      if(match)materials.set(match[1],material)
    }
  })
  return materials
}

function bindSharedOpeningMaterials(template,sharedMaterials) {
  template.traverse(node=>{
    if(!node.isMesh)return
    for(const material of Array.isArray(node.material)?node.material:[node.material]) {
      const set=material?.userData.sharedOpeningTextureSet
      if(!set)continue
      const shared=sharedMaterials.get(set)
      if(!shared)throw new Error(`Missing shared opening texture set: ${set}`)
      material.map=shared.map
      material.roughnessMap=shared.roughnessMap
      material.metalnessMap=shared.metalnessMap
      material.needsUpdate=true
    }
  })
}

function placeB1Asset(type, name, position, rotationY = 0, scaleX = 1) {
  b1AssetPlacements.push({ type, name, position, rotationY, scaleX })
}

function addB1AssetFallback(placement) {
  const isDoor = placement.type.startsWith('door')
  const isB2Window = placement.type === 'windowB2Alloy'
  const width = isDoor ? 1.07 : isB2Window ? 1.50 : placement.type === 'windowCorridor' ? 1.58 : 1.48
  const height = isDoor ? 2.55 : isB2Window ? 1.55 : 1.85
  const material = new THREE.MeshStandardMaterial({ color: isB2Window ? 0x7a8488 : 0x536044, roughness: isB2Window ? .42 : .86, metalness: isB2Window ? .65 : 0 })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, .06), material)
  mesh.name = `${placement.name}-glb-load-fallback`
  mesh.position.set(placement.position[0], placement.position[1] + height / 2, placement.position[2])
  mesh.rotation.y = placement.rotationY
  mesh.scale.x = placement.scaleX
  mesh.castShadow = mesh.receiveShadow = true
  b1AssetRoot.add(mesh)
}

function b1PivotDefinition(type, node) {
  const isDoor=type.startsWith('door')
  const axis=node.userData.animation_axis_blender==='X'?'x':'y'
  const inferredSign=isDoor?(node.name.includes('Hinge_L')?1:-1):-1
  const sign=isDoor?(node.userData.inward_rotation_sign??inferredSign):(node.userData.outward_rotation_sign??inferredSign)
  const recommended=node.userData.recommended_open_degrees??node.userData.recommended_open_angle_deg??(isDoor?85:20)
  const degrees=isDoor?88:node.name.includes('_Bottom_')?22:recommended
  return {
    name:node.name,node,axis,base:node.rotation[axis],openAngle:THREE.MathUtils.degToRad(sign*degrees),
    initiallyOpen:isDoor||node.name.includes('_Bottom_'),
  }
}

function nearestB1Pivot(node) {
  let parent=node.parent
  while(parent) {
    if(parent.name.includes('Pivot')) return parent.name
    parent=parent.parent
  }
  return null
}

function updateB1AssetRig(rig,recomputeBounds=false) {
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0)
  const placementMatrix=new THREE.Matrix4(),localMatrix=new THREE.Matrix4(),finalMatrix=new THREE.Matrix4()
  rig.placements.forEach((placement,placementIndex)=>{
    for(const pivot of rig.pivots) pivot.node.rotation[pivot.axis]=pivot.base+placement.interactions.get(pivot.name).current
    rig.template.updateMatrixWorld(true)
    position.fromArray(placement.position)
    quaternion.setFromAxisAngle(yAxis,placement.rotationY)
    scale.set(placement.scaleX,1,1)
    placementMatrix.compose(position,quaternion,scale)
    for(const mesh of rig.meshes) {
      localMatrix.copy(rig.inverseRoot).multiply(mesh.node.matrixWorld)
      finalMatrix.copy(placementMatrix).multiply(localMatrix)
      mesh.instances.setMatrixAt(placementIndex,finalMatrix)
    }
  })
  for(const mesh of rig.meshes) {
    mesh.instances.instanceMatrix.needsUpdate=true
    if(recomputeBounds) mesh.instances.computeBoundingSphere()
  }
}

function toggleB1Interaction(type,placementIndex,pivotName) {
  const rig=b1AssetRigs.get(type),placement=rig?.placements[placementIndex],state=placement?.interactions.get(pivotName)
  if(!state) return null
  const opening=Math.abs(state.target)<1e-4
  state.target=opening?state.openAngle:0
  return {type,placement:placement.name,pivot:pivotName,open:opening,targetAngle:+THREE.MathUtils.radToDeg(state.target).toFixed(1)}
}

function updateB1AssetAnimations(dt) {
  const alpha=1-Math.exp(-dt*10)
  let shadowChanged=false
  for(const rig of b1AssetRigs.values()) {
    let changed=false
    for(const placement of rig.placements) for(const state of placement.interactions.values()) {
      if(Math.abs(state.current-state.target)<1e-4) { state.current=state.target; continue }
      state.current=THREE.MathUtils.lerp(state.current,state.target,alpha); changed=true
    }
    if(changed) { updateB1AssetRig(rig); shadowChanged=true }
  }
  if(shadowChanged)renderer.shadowMap.needsUpdate=true
}

const SCENE_INTERACTION_MAX_DISTANCE=2.5

function isSceneObjectEffectivelyVisible(object) {
  for(let current=object;current;current=current.parent)if(!current.visible)return false
  return true
}

function isSceneInteractionOccluder(hit) {
  if(!hit.object.isMesh||!isSceneObjectEffectivelyVisible(hit.object))return false
  const materials=Array.isArray(hit.object.material)?hit.object.material:[hit.object.material]
  return materials.some(material=>material&&material.visible!==false&&material.opacity>.05&&material.depthWrite!==false)
}

function hitB1Asset(clientX,clientY,useCenter=false,skipOcclusion=false) {
  if(!b1InteractiveMeshes.length) return null
  const rect=renderer.domElement.getBoundingClientRect()
  b1InteractionPointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
  b1InteractionRaycaster.setFromCamera(b1InteractionPointer,camera)
  const hit=b1InteractionRaycaster.intersectObjects(b1InteractiveMeshes,false)[0]
  if(!hit||hit.instanceId==null||hit.distance>SCENE_INTERACTION_MAX_DISTANCE) return null
  const interaction=hit.object.userData.b1Interaction
  if(skipOcclusion)return {interaction,instanceId:hit.instanceId,distance:hit.distance}
  const blocker=b1InteractionRaycaster.intersectObjects(scene.children,true).find(isSceneInteractionOccluder)
  if(blocker&&blocker.distance+.025<hit.distance) {
    const blockerAsset=blocker.object.userData.b1Asset
    const samePlacement=blockerAsset?.type===interaction.type&&blocker.instanceId===hit.instanceId
    if(!samePlacement)return null
  }
  return {interaction,instanceId:hit.instanceId,distance:hit.distance}
}

function interactWithB1Asset(clientX,clientY,useCenter=false) {
  const hit=hitB1Asset(clientX,clientY,useCenter)
  return hit&&toggleB1Interaction(hit.interaction.type,hit.instanceId,hit.interaction.pivotName)
}

async function loadB1Assets() {
  const sharedLibraryPromise=loadTimedGltf(B1_SHARED_TEXTURE_LIBRARY_URL,'building-openings:shared-textures')
  const results = await Promise.all(Object.entries(B1_ASSET_URLS).map(async ([type, url]) => {
    try {
      const {gltf,timing}=await loadTimedGltf(url,`building-openings:${type}`)
      return [type, gltf.scene, null, timing]
    } catch (error) {
      console.warn(`Unable to load ${url}`, error)
      return [type, null, error, null]
    }
  }))
  const loaded = [], failed = []
  for (const [type, template, error] of results) {
    if (template) { b1AssetTemplates.set(type, template); loaded.push(type) }
    else failed.push({ type, message: error?.message || 'unknown error' })
  }
  let sharedLibraryTiming=null
  try {
    const {gltf,timing}=await sharedLibraryPromise
    sharedLibraryTiming=timing
    const sharedMaterials=collectSharedOpeningMaterials(gltf.scene)
    if(sharedMaterials.size!==3)throw new Error(`Expected 3 shared opening texture sets, found ${sharedMaterials.size}`)
    for(const template of b1AssetTemplates.values())bindSharedOpeningMaterials(template,sharedMaterials)
  } catch(error) {
    console.warn(`Unable to load ${B1_SHARED_TEXTURE_LIBRARY_URL}`,error)
    failed.push({type:'sharedTextures',message:error?.message||'unknown error'})
  }

  for (const type of Object.keys(B1_ASSET_URLS)) {
    const placements = b1AssetPlacements.filter(item => item.type === type)
    const template = b1AssetTemplates.get(type)
    if (!template) {
      placements.forEach(addB1AssetFallback)
      continue
    }
    template.updateMatrixWorld(true)
    const pivots=[]
    template.traverse(node=>{if(node.name.includes('Pivot')) pivots.push(b1PivotDefinition(type,node))})
    for(const placement of placements) {
      placement.interactions=new Map(pivots.map(pivot=>{
        const initial=pivot.initiallyOpen?pivot.openAngle:0
        return [pivot.name,{current:initial,target:initial,openAngle:pivot.openAngle}]
      }))
    }
    const rig={type,template,placements,pivots,meshes:[],inverseRoot:template.matrixWorld.clone().invert()}
    template.traverse(node => {
      if (!node.isMesh) return
      const pivotName=nearestB1Pivot(node)
      // 门窗是薄片结构；活动部件必须允许从室内、室外两面点击。
      const material=pivotName
        ? (Array.isArray(node.material)
            ? node.material.map(item=>{const clone=item.clone();clone.side=THREE.DoubleSide;return clone})
            : (()=>{const clone=node.material.clone();clone.side=THREE.DoubleSide;return clone})())
        : node.material
      const instances = new THREE.InstancedMesh(node.geometry, material, placements.length)
      instances.name = `b1-${type}-${node.name}-instances`
      instances.userData.b1Asset={type,placementNames:placements.map(placement=>placement.name)}
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // 日光可穿过玻璃，但窗框、格栅和开启扇仍参与室内投影。
      const isGlass=/glass/i.test(node.name)
      instances.castShadow = node.castShadow = !isGlass
      instances.receiveShadow = node.receiveShadow = true
      if(pivotName) {
        instances.userData.b1Interaction={type,pivotName}
        b1InteractiveMeshes.push(instances)
      }
      rig.meshes.push({node,instances,pivotName})
      b1AssetRoot.add(instances)
    })
    b1AssetRigs.set(type,rig)
    updateB1AssetRig(rig,true)
  }
  b1AssetLoadState = {
    status: failed.length ? 'fallback' : 'ready', loaded, failed,
    placements: b1AssetPlacements.length,interactiveMeshes:b1InteractiveMeshes.length,
    sharedTextureLibrary:B1_SHARED_TEXTURE_LIBRARY_URL,urls:{...B1_ASSET_URLS},
    b2WindowWebpCandidate:b2WindowWebpCandidate||'formal-q95',
  }
  for(const [,template,,timing] of results)if(template&&timing)markAssetReady(timing)
  if(sharedLibraryTiming)markAssetReady(sharedLibraryTiming)
  renderer.shadowMap.needsUpdate=true
}

async function loadToiletAsset() {
  const b=CAMPUS.buildings.toilet
  const candidateNames=['default','conservative']
  const assetUrl=candidateNames.includes(toiletMeshoptCandidate)
    ?`/artifacts/performance/phase6l/toilet-meshopt-candidates/toilet-meshopt-${toiletMeshoptCandidate}.glb?v=1`
    :toiletAssetLoadState.url
  try {
    // 正式厕所与阶段6L候选均使用EXT_meshopt_compression。
    await assetLoader.enableMeshoptForGltf()
    const {gltf,timing}=await loadTimedGltf(assetUrl,'toilet')
    const model=gltf.scene
    model.name='toilet-game-optimized-v01'
    model.updateMatrixWorld(true)
    const initialBounds=new THREE.Box3().setFromObject(model)
    const initialSize=initialBounds.getSize(new THREE.Vector3())
    const uniformScale=b.size[0]/initialSize.x
    model.scale.setScalar(uniformScale)
    model.updateMatrixWorld(true)
    const scaledBounds=new THREE.Box3().setFromObject(model)
    const scaledCenter=scaledBounds.getCenter(new THREE.Vector3())
    model.position.add(new THREE.Vector3(b.center[0]-scaledCenter.x,b.platformY-scaledBounds.min.y,b.center[1]-scaledCenter.z))
    let meshes=0
    model.traverse(node=>{
      if(!node.isMesh)return
      meshes++
      node.castShadow=node.receiveShadow=true
      const materials=Array.isArray(node.material)?node.material:[node.material]
      for(const material of materials) for(const texture of [material?.map,material?.normalMap,material?.roughnessMap,material?.metalnessMap]) {
        if(!texture)continue
        texture.anisotropy=renderer.capabilities.getMaxAnisotropy()
        texture.needsUpdate=true
      }
    })
    toiletAssetRoot.add(model)
    model.updateMatrixWorld(true)
    addLoadedArchitecturalAssetOutlines(model,'toilet')
    const finalBounds=new THREE.Box3().setFromObject(model)
    const finalSize=finalBounds.getSize(new THREE.Vector3())
    toiletAssetLoadState={
      ...toiletAssetLoadState,status:'loaded',url:assetUrl,
      meshoptCandidate:toiletMeshoptCandidate||'formal-conservative',meshes,
      triangles:model.userData.triangles??20000,
      size:[finalSize.x,finalSize.y,finalSize.z].map(value=>+value.toFixed(3)),
      center:[b.center[0],b.platformY,b.center[1]],
    }
    markAssetReady(timing)
  } catch(error) {
    console.warn(`Unable to load ${assetUrl}`,error)
    toiletAssetLoadState={...toiletAssetLoadState,status:'failed',url:assetUrl,message:error?.message||'unknown error'}
    throw error
  }
}

async function loadDormitoryAsset() {
  const b=CAMPUS.buildings.dormitory
  const candidateNames=['default','conservative']
  const assetUrl=candidateNames.includes(dormitoryMeshoptCandidate)
    ?`/artifacts/performance/phase6j/dormitory-meshopt-candidates/teacher-dormitory-meshopt-${dormitoryMeshoptCandidate}.glb?v=1`
    :dormitoryAssetLoadState.url
  try {
    // 正式宿舍与阶段6J候选均使用EXT_meshopt_compression。
    await assetLoader.enableMeshoptForGltf()
    const {gltf,timing}=await loadTimedGltf(assetUrl,'teacher-dormitory')
    const model=gltf.scene
    model.name='teacher-dormitory-game-optimized-v01'
    // 原模型长边沿 X、正面朝 +Z；旋转后长边沿校园南北，正面朝西，楼梯位于南端。
    model.rotation.y=-Math.PI/2
    model.updateMatrixWorld(true)
    const initialBounds=new THREE.Box3().setFromObject(model)
    const initialSize=initialBounds.getSize(new THREE.Vector3())
    const uniformScale=b.size[1]/initialSize.z
    model.scale.setScalar(uniformScale)
    model.updateMatrixWorld(true)
    const scaledBounds=new THREE.Box3().setFromObject(model)
    const scaledCenter=scaledBounds.getCenter(new THREE.Vector3())
    const assetBaseY=b.platformY-b.assetEmbed
    model.position.add(new THREE.Vector3(b.center[0]-scaledCenter.x,assetBaseY-scaledBounds.min.y,b.center[1]-scaledCenter.z))
    let meshes=0
    model.traverse(node=>{
      if(!node.isMesh)return
      meshes++
      node.castShadow=node.receiveShadow=true
      const materials=Array.isArray(node.material)?node.material:[node.material]
      for(const material of materials) for(const texture of [material?.map,material?.normalMap,material?.roughnessMap,material?.metalnessMap]) {
        if(!texture)continue
        texture.anisotropy=renderer.capabilities.getMaxAnisotropy()
        texture.needsUpdate=true
      }
    })
    dormitoryAssetRoot.add(model)
    model.updateMatrixWorld(true)
    addLoadedArchitecturalAssetOutlines(model,'teacher-dormitory')
    const finalBounds=new THREE.Box3().setFromObject(model)
    const finalSize=finalBounds.getSize(new THREE.Vector3())
    dormitoryAssetLoadState={
      ...dormitoryAssetLoadState,status:'loaded',url:assetUrl,
      meshoptCandidate:dormitoryMeshoptCandidate||'formal-conservative',meshes,triangles:25000,
      size:[finalSize.x,finalSize.y,finalSize.z].map(value=>+value.toFixed(3)),
      center:[b.center[0],assetBaseY,b.center[1]],rotationY:-90,platformEmbed:b.assetEmbed,
    }
    markAssetReady(timing)
  } catch(error) {
    console.warn(`Unable to load ${assetUrl}`,error)
    dormitoryAssetLoadState={...dormitoryAssetLoadState,status:'failed',url:assetUrl,message:error?.message||'unknown error'}
    throw error
  }
}

async function loadBanyanAsset() {
  const b=CAMPUS.facilities.banyan
  const candidateNames=['default','conservative']
  const assetUrl=candidateNames.includes(banyanMeshoptCandidate)
    ?`/artifacts/performance/phase6i/banyan-meshopt-candidates/banyan-meshopt-${banyanMeshoptCandidate}.glb?v=1`
    :b.assetUrl
  navigation.addAabbBounds({
    name:'banyan-tree-trunk',minX:b.center[0]-b.collisionRadius,maxX:b.center[0]+b.collisionRadius,
    minZ:b.center[1]-b.collisionRadius,maxZ:b.center[1]+b.collisionRadius,minY:b.y,maxY:b.y+b.targetHeight,
  })
  try {
    // 正式榕树与阶段 6I 候选均使用 EXT_meshopt_compression。
    await assetLoader.enableMeshoptForGltf()
    const {gltf,timing}=await loadTimedGltf(assetUrl,'banyan-tree')
    const model=gltf.scene
    model.name='banyan-tree-scene-optimized'
    model.rotation.y=THREE.MathUtils.degToRad(-275)
    model.updateMatrixWorld(true)
    const initialBounds=new THREE.Box3().setFromObject(model)
    const uniformScale=b.targetHeight/initialBounds.getSize(new THREE.Vector3()).y
    model.scale.setScalar(uniformScale)
    model.updateMatrixWorld(true)
    const scaledBounds=new THREE.Box3().setFromObject(model)
    const scaledCenter=scaledBounds.getCenter(new THREE.Vector3())
    model.position.add(new THREE.Vector3(b.center[0]-scaledCenter.x,b.y-scaledBounds.min.y,b.center[1]-scaledCenter.z))
    let meshes=0,triangles=0
    model.traverse(node=>{
      if(!node.isMesh)return
      meshes++
      const geometry=node.geometry
      triangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3
      node.castShadow=node.receiveShadow=true
      const materials=Array.isArray(node.material)?node.material:[node.material]
      for(const material of materials) {
        if(!material)continue
        if(material.map) {
          material.map.anisotropy=renderer.capabilities.getMaxAnisotropy()
          material.map.colorSpace=THREE.SRGBColorSpace
          material.map.needsUpdate=true
        }
        const isLeafCard=/crown|clump|foliage|leaf|unifiedanime/i.test(`${node.name} ${material.name}`)
        if(isLeafCard) {
          banyanLeafMeshes.add(node)
          material.transparent=false;material.opacity=1;material.alphaTest=.35;material.depthWrite=true
          material.side=THREE.DoubleSide
          if(!banyanLeafMaterials.has(material))banyanLeafMaterials.set(material,{
            color:material.color?.clone()??new THREE.Color(0xffffff),
          })
          material.needsUpdate=true
        }
      }
    })
    applyBanyanFoliageLighting()
    banyanAssetRoot.add(model)
    model.updateMatrixWorld(true)
    const finalSize=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
    banyanAssetLoadState={
      ...banyanAssetLoadState,status:'loaded',url:assetUrl,
      meshoptCandidate:banyanMeshoptCandidate||'formal-conservative',
      meshes,triangles:Math.round(triangles),
      size:finalSize.toArray().map(value=>+value.toFixed(3)),center:[b.center[0],b.y,b.center[1]],
      strategy:'single-full-detail-model',foliageLighting:banyanFoliageLightingState(),
    }
    markAssetReady(timing)
  } catch(error) {
    console.warn(`Unable to load ${assetUrl}`,error)
    banyanAssetLoadState={...banyanAssetLoadState,status:'failed',url:assetUrl,message:error?.message||'unknown error'}
    throw error
  }
}

async function loadPlaygroundTreeAssets() {
  const config=CAMPUS.facilities.playgroundTrees
  try {
    const assetUrls={...config.assets}
    if(['webp-q95','ktx2-uastc'].includes(broadleafTextureCandidate)) {
      assetUrls.bauhinia=`/artifacts/performance/phase6g/glb-candidates/${broadleafTextureCandidate}/bauhinia-tree-game-v11.glb?v=1`
      assetUrls.camphor=`/artifacts/performance/phase6g/glb-candidates/${broadleafTextureCandidate}/camphor-tree-game-v11.glb?v=1`
      if(broadleafTextureCandidate==='ktx2-uastc')await assetLoader.enableKtx2ForGltf()
    }
    const templates=new Map()
    const speciesState={}
    const makeLitLeafMaterial=source=>{
      if(!source)return source
      const material=(source.isMeshStandardMaterial||source.isMeshPhysicalMaterial)
        ? source
        : new THREE.MeshStandardMaterial({
          name:source.name,map:source.map||null,alphaMap:source.alphaMap||null,
          color:source.color?.clone()||new THREE.Color(0xffffff),
          roughness:.9,metalness:0,transparent:false,opacity:1,
          alphaTest:.35,depthWrite:true,side:THREE.DoubleSide,
        })
      material.transparent=false
      material.opacity=1
      material.alphaTest=.35
      material.depthWrite=true
      material.side=THREE.DoubleSide
      material.roughness=.9
      material.metalness=0
      if(material.emissive)material.emissive.setHex(0x000000)
      if('emissiveIntensity' in material)material.emissiveIntensity=0
      material.userData={...material.userData,foliageLighting:'directional-and-shadow-receiving'}
      material.needsUpdate=true
      return material
    }
    await Promise.all(Object.entries(assetUrls).map(async ([species,url])=>{
      const {gltf,timing}=await loadTimedGltf(url,`playground-tree:${species}`)
      const template=gltf.scene
      template.updateMatrixWorld(true)
      const bounds=new THREE.Box3().setFromObject(template)
      const size=bounds.getSize(new THREE.Vector3())
      let meshes=0,triangles=0
      const textureState=[]
      template.traverse(node=>{
        if(!node.isMesh)return
        meshes++
        triangles+=node.geometry.index?node.geometry.index.count/3:node.geometry.attributes.position.count/3
        node.castShadow=node.receiveShadow=true
        const sourceMaterials=Array.isArray(node.material)?node.material:[node.material]
        const isLeaf=/foliage|leaf|cluster|card/i.test(`${node.name} ${sourceMaterials.map(material=>material?.name||'').join(' ')}`)
        if(isLeaf)node.material=Array.isArray(node.material)?sourceMaterials.map(makeLitLeafMaterial):makeLitLeafMaterial(node.material)
        const materials=Array.isArray(node.material)?node.material:[node.material]
        for(const material of materials) {
          if(!material)continue
          if(material.map) {
            material.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
            material.map.colorSpace=THREE.SRGBColorSpace
            material.map.needsUpdate=true
            if(!textureState.some(texture=>texture.uuid===material.map.uuid))textureState.push({
              uuid:material.map.uuid,
              name:material.map.name,
              compressed:Boolean(material.map.isCompressedTexture),
              mipmaps:material.map.mipmaps?.length??0,
              format:material.map.format,
              type:material.map.type,
            })
          }
        }
      })
      templates.set(species,{template,sourceHeight:size.y,meshes,triangles:Math.round(triangles),url})
      speciesState[species]={url,sourceHeight:+size.y.toFixed(3),meshes,triangles:Math.round(triangles),textures:textureState}
      markAssetReady(timing)
    }))

    // 花基灌木直接复用香樟 v11 已加载的叶片贴图和材质，不再请求旧紫荆 PNG。
    const camphorTemplate=templates.get('camphor')?.template
    let camphorLeafMaterial=null
    camphorTemplate?.traverse(node=>{
      if(camphorLeafMaterial||!node.isMesh)return
      const materials=Array.isArray(node.material)?node.material:[node.material]
      if(/foliage|leaf|cluster|card/i.test(`${node.name} ${materials.map(material=>material?.name||'').join(' ')}`)) {
        camphorLeafMaterial=materials.find(material=>material?.map)||materials[0]
      }
    })
    if(!camphorLeafMaterial)throw new Error('Missing camphor foliage material for planter shrubs')
    buildPlanterCamphorShrubs(camphorLeafMaterial)
    const {texture:flowerTexture,timing:flowerTiming}=await loadTimedTexture(PLANTER_FLOWER_ATLAS_URL,'planter-flower-atlas')
    flowerTexture.name='planter-flower-atlas-v01-768'
    flowerTexture.colorSpace=THREE.SRGBColorSpace
    flowerTexture.minFilter=THREE.LinearMipmapLinearFilter
    flowerTexture.magFilter=THREE.LinearFilter
    flowerTexture.generateMipmaps=true
    flowerTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
    flowerTexture.needsUpdate=true
    const flowerMaterial=new THREE.MeshStandardMaterial({
      name:'planter-flower-watercolor-accent-v01',map:flowerTexture,color:0xffffff,
      roughness:.94,metalness:0,transparent:false,opacity:1,alphaTest:.08,
      depthWrite:true,side:THREE.DoubleSide,
    })
    const flowerStats=buildPlanterFlowerAccents(flowerMaterial)
    planterFlowerAssetLoadState={
      status:'loaded',url:PLANTER_FLOWER_ATLAS_URL,...flowerStats,
      texture:{width:flowerTexture.image?.naturalWidth??flowerTexture.image?.width??null,height:flowerTexture.image?.naturalHeight??flowerTexture.image?.height??null},
    }
    markAssetReady(flowerTiming)

    const placements=[],instanceGroups={}
    let sourceDrawObjects=0
    for(const species of Object.keys(config.assets)) {
      const source=templates.get(species)
      if(!source)throw new Error(`Missing playground tree species: ${species}`)
      const speciesPlacements=config.placements.filter(placement=>placement.species===species)
      const sourceMeshes=[]
      source.template.traverse(node=>{if(node.isMesh)sourceMeshes.push(node)})
      const instancesByName=new Map()
      for(const [meshIndex,node] of sourceMeshes.entries()) {
        const instances=new THREE.InstancedMesh(node.geometry,node.material,speciesPlacements.length)
        instances.name=`playground-tree-${species}-${meshIndex+1}-${node.name}-instances`
        instances.castShadow=node.castShadow
        instances.receiveShadow=node.receiveShadow
        instances.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        instances.userData={species,sourceMesh:node.name,placementIds:speciesPlacements.map(placement=>placement.id)}
        instancesByName.set(node.name,instances)
      }
      for(const [instanceIndex,placement] of speciesPlacements.entries()) {
        // 继续用已确认的Object3D层级计算每棵树的最终矩阵，只把计算结果写入
        // InstancedMesh。这样高度、旋转、非对称树冠居中和土圈补偿均不变。
        const model=source.template.clone(true)
        model.name=placement.id
        const uniformScale=placement.height/source.sourceHeight
        model.scale.setScalar(uniformScale)
        model.rotation.y=THREE.MathUtils.degToRad(placement.rotationY)
        let soilRing=null
        model.traverse(node=>{
          if(node.name==='Root_Soil_Ring') {
            soilRing=node
            // 裸土圈保持约0.8m的场景半径；树高变化只压低其厚度。
            node.scale.x/=uniformScale
            node.scale.z/=uniformScale
          }
        })
        model.updateMatrixWorld(true)
        const scaledBounds=new THREE.Box3().setFromObject(model),scaledCenter=scaledBounds.getCenter(new THREE.Vector3())
        const [x,z]=placement.center,ground=terrainHeightAt(x,z)
        model.position.add(new THREE.Vector3(x-scaledCenter.x,ground-scaledBounds.min.y,z-scaledCenter.z))
        model.updateMatrixWorld(true)
        model.traverse(node=>{
          if(!node.isMesh)return
          const instances=instancesByName.get(node.name)
          if(!instances)throw new Error(`Missing ${species} instance group for ${node.name}`)
          instances.setMatrixAt(instanceIndex,node.matrixWorld)
        })
        const finalBounds=new THREE.Box3().setFromObject(model),finalSize=finalBounds.getSize(new THREE.Vector3())
        const soilSize=soilRing?new THREE.Box3().setFromObject(soilRing).getSize(new THREE.Vector3()):new THREE.Vector3()
        placements.push({
          ...placement,ground:+ground.toFixed(3),scale:+uniformScale.toFixed(4),
          actualHeight:+finalSize.y.toFixed(3),soilRing:[+soilSize.x.toFixed(3),+soilSize.z.toFixed(3)],
        })
        const collisionRadius=placement.species==='bauhinia'?.38:placement.species==='casuarina'?.44*(placement.height/10):.44
        navigation.addAabbBounds({
          name:`playground-tree-${placement.id}`,
          minX:x-collisionRadius,maxX:x+collisionRadius,
          minZ:z-collisionRadius,maxZ:z+collisionRadius,
          minY:ground,maxY:ground+placement.height,
        })
      }
      for(const instances of instancesByName.values()) {
        instances.instanceMatrix.needsUpdate=true
        instances.computeBoundingBox();instances.computeBoundingSphere()
        playgroundTreeAssetRoot.add(instances)
      }
      sourceDrawObjects+=sourceMeshes.length*speciesPlacements.length
      instanceGroups[species]={placements:speciesPlacements.length,sourceMeshes:sourceMeshes.length,drawObjects:instancesByName.size}
    }
    playgroundTreeAssetLoadState={
      status:'loaded',species:speciesState,placements,
      textureCandidate:broadleafTextureCandidate||'formal-webp-q95',
      instances:placements.length,sourceDrawObjects,drawObjects:playgroundTreeAssetRoot.children.length,instanceGroups,
    }
  } catch(error) {
    console.warn('Unable to load playground tree assets',error)
    playgroundTreeAssetLoadState={...playgroundTreeAssetLoadState,status:'failed',message:error?.message||'unknown error'}
    if(planterFlowerAssetLoadState.status==='pending')planterFlowerAssetLoadState={...planterFlowerAssetLoadState,status:'failed',message:error?.message||'unknown error'}
  }
}

async function loadOldClassroomAsset() {
  const b=CAMPUS.buildings.oldClassroom
  const candidateNames=['default','conservative']
  const assetUrl=candidateNames.includes(oldClassroomMeshoptCandidate)
    ?`/artifacts/performance/phase6k/old-classroom-meshopt-candidates/old-classroom-meshopt-${oldClassroomMeshoptCandidate}.glb?v=1`
    :oldClassroomAssetLoadState.url
  try {
    // 正式旧教室与阶段6K候选均使用EXT_meshopt_compression。
    await assetLoader.enableMeshoptForGltf()
    const {gltf,timing}=await loadTimedGltf(assetUrl,'old-classroom')
    const model=gltf.scene
    model.name='old-classroom-game-optimized-v02'
    model.updateMatrixWorld(true)
    const initialBounds=new THREE.Box3().setFromObject(model)
    const initialSize=initialBounds.getSize(new THREE.Vector3())
    const uniformScale=b.size[0]/initialSize.x
    model.scale.setScalar(uniformScale)
    model.updateMatrixWorld(true)
    const scaledBounds=new THREE.Box3().setFromObject(model)
    const scaledCenter=scaledBounds.getCenter(new THREE.Vector3())
    model.position.add(new THREE.Vector3(b.center[0]-scaledCenter.x,b.platformY-scaledBounds.min.y,b.center[1]-scaledCenter.z))
    let meshes=0
    model.traverse(node=>{
      if(!node.isMesh)return
      meshes++
      node.castShadow=node.receiveShadow=true
      const materials=Array.isArray(node.material)?node.material:[node.material]
      for(const material of materials) for(const texture of [material?.map,material?.normalMap,material?.roughnessMap,material?.metalnessMap]) {
        if(!texture)continue
        texture.anisotropy=renderer.capabilities.getMaxAnisotropy()
        texture.needsUpdate=true
      }
    })
    oldClassroomAssetRoot.add(model)
    model.updateMatrixWorld(true)
    addLoadedArchitecturalAssetOutlines(model,'old-classroom')
    const finalBounds=new THREE.Box3().setFromObject(model)
    const finalSize=finalBounds.getSize(new THREE.Vector3())
    oldClassroomAssetLoadState={
      ...oldClassroomAssetLoadState,status:'loaded',url:assetUrl,
      meshoptCandidate:oldClassroomMeshoptCandidate||'formal-conservative',meshes,triangles:25000,
      size:[finalSize.x,finalSize.y,finalSize.z].map(value=>+value.toFixed(3)),
      center:[b.center[0],b.platformY,b.center[1]],rotationY:0,
    }
    markAssetReady(timing)
  } catch(error) {
    console.warn(`Unable to load ${assetUrl}`,error)
    oldClassroomAssetLoadState={...oldClassroomAssetLoadState,status:'failed',url:assetUrl,message:error?.message||'unknown error'}
    throw error
  }
}

async function loadSandpitAsset() {
  const f=CAMPUS.facilities.sandpit
  try {
    const {gltf,timing}=await loadTimedGltf(sandpitAssetLoadState.url,'sandpit')
    const sharedCementTexture=await loadSharedSandCementTexture()
    const model=gltf.scene
    model.name='sandpit-recessed-game-v01'
    model.updateMatrixWorld(true)
    const initialBounds=new THREE.Box3().setFromObject(model)
    const initialSize=initialBounds.getSize(new THREE.Vector3())
    const uniformScale=f.size[0]/initialSize.x
    model.scale.setScalar(uniformScale)
    model.updateMatrixWorld(true)
    const scaledBounds=new THREE.Box3().setFromObject(model)
    const scaledCenter=scaledBounds.getCenter(new THREE.Vector3())
    // GLB 原点位于齐平水泥边顶面；按最高点对齐场地，沙面自然落入地面孔洞。
    model.position.add(new THREE.Vector3(
      f.center[0]-scaledCenter.x,
      f.placementY-scaledBounds.max.y,
      f.center[1]-scaledCenter.z,
    ))
    let meshes=0,triangles=0
    model.traverse(node=>{
      if(!node.isMesh)return
      meshes++
      const geometry=node.geometry
      triangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3
      node.castShadow=node.receiveShadow=true
      const materials=Array.isArray(node.material)?node.material:[node.material]
      for(const material of materials) {
        if(!material)continue
        // 贴图本身偏橙；用轻微冷灰乘色收住中午直射下的黄橙溢出，保留手绘纹理。
        if(material.color)material.color.multiply(new THREE.Color(0xb7c2d0))
        material.roughness=Math.max(material.roughness??0,.82)
        bindSharedSandCementTexture(material,sharedCementTexture)
        for(const texture of [material.map,material.normalMap,material.roughnessMap]) {
          if(!texture)continue
          texture.anisotropy=renderer.capabilities.getMaxAnisotropy()
          if(texture===material.map)texture.colorSpace=THREE.SRGBColorSpace
          texture.needsUpdate=true
        }
      }
    })
    sandpitAssetRoot.add(model)
    model.updateMatrixWorld(true)
    const finalBounds=new THREE.Box3().setFromObject(model)
    const finalSize=finalBounds.getSize(new THREE.Vector3())
    sandpitAssetLoadState={
      ...sandpitAssetLoadState,status:'loaded',meshes,triangles:Math.round(triangles),
      size:[finalSize.x,finalSize.y,finalSize.z].map(value=>+value.toFixed(3)),
      center:[f.center[0],f.placementY,f.center[1]],
    }
    markAssetReady(timing)
  } catch(error) {
    console.warn(`Unable to load ${sandpitAssetLoadState.url}`,error)
    sandpitAssetLoadState={...sandpitAssetLoadState,status:'failed',message:error?.message||'unknown error'}
  }
}

async function loadActivitySandAssets() {
  const entries=[
    ['north',CAMPUS.facilities.activity.upperSand],
    ['south',CAMPUS.facilities.activity.lowerSand],
    ['southwest',CAMPUS.facilities.activity.southwestSand],
  ]
  const results=await Promise.all(entries.map(async([id,config])=>{
    try {
      const {gltf,timing}=await loadTimedGltf(config.assetUrl,`activity-sand:${id}`)
      const sharedCementTexture=await loadSharedSandCementTexture()
      // 同一 GLB URL 只解析一次；每个落位克隆 Object3D 层级，同时共享其
      // geometry、material 和 texture，避免重复解码与 GPU 纹理对象。
      const model=gltf.scene.clone(true)
      model.name=`old-classroom-activity-sand-${id}`
      model.position.set(config.center[0],config.placementY,config.center[1])
      model.rotation.y=THREE.MathUtils.degToRad(config.rotationY??0)
      let meshes=0,triangles=0
      model.traverse(node=>{
        if(!node.isMesh)return
        meshes++
        const geometry=node.geometry
        triangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3
        node.castShadow=true
        node.receiveShadow=true
        node.renderOrder=2
        const materials=Array.isArray(node.material)?node.material:[node.material]
        for(const material of materials) {
          if(!material)continue
          material.roughness=Math.max(material.roughness??0,.94)
          bindSharedSandCementTexture(material,sharedCementTexture)
          if(material.transparent) {
            material.depthWrite=false
            material.alphaTest=.015
          }
          if(material.name.includes('shared handpainted texture')&&material.color&&!material.userData.activitySandColorAdjusted) {
            // 与已确认的独立凹陷沙池采用相同冷灰乘色，压住正午光照下的黄橙溢出。
            material.color.multiply(new THREE.Color(0xb7c2d0))
            material.userData.activitySandColorAdjusted=true
          }
          for(const texture of [material.map,material.normalMap,material.roughnessMap]) {
            if(!texture)continue
            texture.anisotropy=renderer.capabilities.getMaxAnisotropy()
            if(texture===material.map)texture.colorSpace=THREE.SRGBColorSpace
            texture.needsUpdate=true
          }
        }
      })
      activitySandAssetRoot.add(model)
      model.updateMatrixWorld(true)
      const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3())
      markAssetReady(timing)
      return {
        id,status:'loaded',url:config.assetUrl,meshes,triangles:Math.round(triangles),
        size:size.toArray().map(value=>+value.toFixed(3)),center:config.center,rotationY:config.rotationY??0,
      }
    } catch(error) {
      console.warn(`Unable to load ${config.assetUrl}`,error)
      return {id,status:'failed',url:config.assetUrl,message:error?.message||'unknown error'}
    }
  }))
  const south=activitySandAssetRoot.getObjectByName('old-classroom-activity-sand-south')
  const southwest=activitySandAssetRoot.getObjectByName('old-classroom-activity-sand-southwest')
  const collectSharedResources=model=>{
    const geometries=new Set(),materials=new Set(),textures=new Set()
    model?.traverse(node=>{
      if(!node.isMesh)return
      if(node.geometry)geometries.add(node.geometry)
      for(const material of Array.isArray(node.material)?node.material:[node.material]) {
        if(!material)continue
        materials.add(material)
        for(const value of Object.values(material))if(value?.isTexture)textures.add(value)
      }
    })
    return {geometries,materials,textures}
  }
  const southResources=collectSharedResources(south)
  const southwestResources=collectSharedResources(southwest)
  const sharedCount=(left,right)=>[...left].filter(value=>right.has(value)).length
  activitySandAssetLoadState={
    status:results.every(item=>item.status==='loaded')?'loaded':'partial',assets:results,
    uniqueUrls:new Set(entries.map(([,config])=>config.assetUrl)).size,
    sharedSouthTemplate:{
      geometries:sharedCount(southResources.geometries,southwestResources.geometries),
      materials:sharedCount(southResources.materials,southwestResources.materials),
      textures:sharedCount(southResources.textures,southwestResources.textures),
    },
  }
}

async function loadPingPongAsset() {
  const table=CAMPUS.facilities.pingPong
  try {
    const [{gltf,timing},{gltf:paddleGltf,timing:paddleTiming}]=await Promise.all([
      loadTimedGltf(pingPongAssetLoadState.url,'ping-pong-table'),
      loadTimedGltf(pingPongPaddleAssetLoadState.url,'ping-pong-paddle'),
    ])
    const template=gltf.scene
    template.updateMatrixWorld(true)
    const initialBounds=new THREE.Box3().setFromObject(template,true)
    const initialSize=initialBounds.getSize(new THREE.Vector3())
    // 模型的短边沿 Z；以已确认的 1.35m 台宽做等比标定，避免拉伸破坏砖块和破损轮廓。
    const uniformScale=table.assetTargetWidth/initialSize.z
    let meshes=0,triangles=0,sourceMesh=null
    template.traverse(node=>{
      if(!node.isMesh)return
      meshes++
      sourceMesh=node
      const geometry=node.geometry
      triangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3
      node.castShadow=node.receiveShadow=true
      const materials=Array.isArray(node.material)?node.material:[node.material]
      for(const material of materials) {
        if(!material)continue
        material.roughness=Math.max(material.roughness??0,.86)
        material.metalness=Math.min(material.metalness??0,.04)
        for(const texture of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap]) {
          if(!texture)continue
          texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
          if(texture===material.map)texture.colorSpace=THREE.SRGBColorSpace
          texture.needsUpdate=true
        }
      }
    })
    const placements=[]
    const variants=[
      {rotationY:0,mirrorX:false},
      {rotationY:Math.PI,mirrorX:false},
      {rotationY:0,mirrorX:true},
      {rotationY:Math.PI,mirrorX:true},
    ]
    if(meshes!==1||!sourceMesh)throw new Error(`Expected one ping-pong source mesh, found ${meshes}`)
    if(!sourceMesh.geometry.index)throw new Error('Ping-pong mirrored instancing requires indexed geometry')
    const reflection=new THREE.Matrix4().makeScale(-1,1,1)
    const mirroredGeometry=sourceMesh.geometry.clone().applyMatrix4(reflection)
    const mirroredIndex=mirroredGeometry.index
    for(let offset=0;offset<mirroredIndex.count;offset+=3) {
      const second=mirroredIndex.getX(offset+1)
      mirroredIndex.setX(offset+1,mirroredIndex.getX(offset+2))
      mirroredIndex.setX(offset+2,second)
    }
    mirroredIndex.needsUpdate=true
    const placementConfigs=table.centers.slice(0,table.assetCount).map((center,index)=>({center,variant:variants[index%variants.length]}))
    const regularCount=placementConfigs.filter(item=>!item.variant.mirrorX).length
    const mirroredCount=placementConfigs.length-regularCount
    const regularInstances=new THREE.InstancedMesh(sourceMesh.geometry,sourceMesh.material,regularCount)
    const mirroredInstances=new THREE.InstancedMesh(mirroredGeometry,sourceMesh.material,mirroredCount)
    regularInstances.name='ping-pong-table-regular-instances'
    mirroredInstances.name='ping-pong-table-mirrored-instances'
    for(const instances of [regularInstances,mirroredInstances]) {
      instances.castShadow=sourceMesh.castShadow;instances.receiveShadow=sourceMesh.receiveShadow
      instances.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    }
    let regularIndex=0,mirroredInstanceIndex=0
    for(const [index,{center:[x,z],variant}] of placementConfigs.entries()) {
      const model=template.clone(true)
      model.name=`ping-pong-table-game-optimized-${index+1}`
      model.scale.set(variant.mirrorX?-uniformScale:uniformScale,uniformScale,uniformScale)
      model.rotation.y=variant.rotationY
      model.updateMatrixWorld(true)
      const scaledBounds=new THREE.Box3().setFromObject(model)
      const scaledCenter=scaledBounds.getCenter(new THREE.Vector3())
      model.position.add(new THREE.Vector3(x-scaledCenter.x,-scaledBounds.min.y,z-scaledCenter.z))
      model.updateMatrixWorld(true)
      let placedMesh=null
      model.traverse(node=>{if(node.isMesh)placedMesh=node})
      if(!placedMesh)throw new Error(`Missing ping-pong mesh for placement ${index+1}`)
      if(variant.mirrorX) {
        const positiveMatrix=placedMesh.matrixWorld.clone().multiply(reflection)
        if(positiveMatrix.determinant()<=0)throw new Error(`Mirrored ping-pong instance ${index+1} is not positive-scale`)
        mirroredInstances.setMatrixAt(mirroredInstanceIndex++,positiveMatrix)
      } else regularInstances.setMatrixAt(regularIndex++,placedMesh.matrixWorld)
      const finalBounds=new THREE.Box3().setFromObject(model)
      const finalSize=finalBounds.getSize(new THREE.Vector3())
      navigation.addAabbBounds({
        name:`ping-pong-table-glb-${index+1}-collider`,
        minX:finalBounds.min.x,maxX:finalBounds.max.x,
        minZ:finalBounds.min.z,maxZ:finalBounds.max.z,
        minY:finalBounds.min.y,maxY:finalBounds.max.y,
      })
      placements.push({
        center:[x,z],
        rotationY:+THREE.MathUtils.radToDeg(variant.rotationY).toFixed(0),
        mirrored:variant.mirrorX,
        size:[finalSize.x,finalSize.y,finalSize.z].map(value=>+value.toFixed(3)),
      })
    }
    for(const instances of [regularInstances,mirroredInstances]) {
      instances.instanceMatrix.needsUpdate=true
      instances.computeBoundingBox();instances.computeBoundingSphere()
      pingPongAssetRoot.add(instances)
    }
    pingPongAssetLoadState={
      ...pingPongAssetLoadState,status:'loaded',meshes,triangles:Math.round(triangles),
      textureSize:1024,placements,sourceDrawObjects:placements.length,drawObjects:pingPongAssetRoot.children.length,
      instanceGroups:{regular:regularCount,mirrored:mirroredCount},
    }
    let paddleMesh=null,paddleMeshes=0,paddleTriangles=0
    paddleGltf.scene.traverse(node=>{
      if(!node.isMesh)return
      paddleMesh=node;paddleMeshes++
      const geometry=node.geometry
      paddleTriangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3
      node.castShadow=false;node.receiveShadow=true
      const materials=Array.isArray(node.material)?node.material:[node.material]
      for(const material of materials) {
        if(!material)continue
        material.roughness=Math.max(material.roughness??0,.82)
        material.metalness=0
      }
    })
    if(paddleMeshes!==1||!paddleMesh)throw new Error(`Expected one ping-pong paddle mesh, found ${paddleMeshes}`)
    const paddleBounds=new THREE.Box3().setFromObject(paddleGltf.scene,true)
    const paddleSize=paddleBounds.getSize(new THREE.Vector3())
    pingPongPaddleAssetLoadState={
      ...pingPongPaddleAssetLoadState,status:'loaded',meshes:paddleMeshes,triangles:Math.round(paddleTriangles),
      size:paddleSize.toArray().map(value=>+value.toFixed(4)),singleMaterial:!Array.isArray(paddleMesh.material),
      source:'BlenderKit-derived-decimated',license:'BlenderKit Royalty Free',
    }
    const gameTables=placements.map((placement,index)=>({
      id:`ping-pong-table-${index+1}`,index,center:[...placement.center],
      size:[...table.game.tableSize],surfaceY:table.game.surfaceY,netTopY:table.game.netTopY,
      playerStation:[placement.center[0]+table.game.tableSize[0]/2+table.game.playerStationOffset,table.game.cameraEyeY,placement.center[1]],
      cameraTarget:[placement.center[0],table.game.cameraTargetY,placement.center[1]],
    }))
    const {createPingPongGame}=await import('./interactions/ping-pong-game.js')
    pingPongGame=createPingPongGame({
      root:scene,camera,renderer,paddleMesh,config:table,tables:gameTables,
      onEnter:beginPingPongMode,onExit:finishPingPongMode,onEvent:event=>{trackPersonalGameEvent(event);announcePingPongEvent(event)},
      isTouchMode:()=>touchModePreferred,isActiveMode:()=>mode==='pingPong',groundHeightAt,
      shadowDirection:new THREE.Vector3().subVectors(sun.target.position,sun.position).normalize(),
    })
    markAssetReady(timing);markAssetReady(paddleTiming)
    renderer.shadowMap.needsUpdate=true
  } catch(error) {
    console.warn(`Unable to load ${pingPongAssetLoadState.url}`,error)
    pingPongAssetLoadState={...pingPongAssetLoadState,status:'failed',message:error?.message||'unknown error'}
    pingPongPaddleAssetLoadState={...pingPongPaddleAssetLoadState,status:'failed',message:error?.message||'unknown error'}
  }
}

async function loadBasketballAsset() {
  const config=CAMPUS.facilities.basketballs
  try {
    const {gltf,timing}=await loadTimedGltf(basketballAssetLoadState.url,'basketball')
    const template=gltf.scene
    template.updateMatrixWorld(true)
    const initialBounds=new THREE.Box3().setFromObject(template)
    const initialSize=initialBounds.getSize(new THREE.Vector3())
    const uniformScale=config.diameter/Math.max(initialSize.x,initialSize.y,initialSize.z)
    let meshes=0,triangles=0,textureSize=0
    template.traverse(node=>{
      if(!node.isMesh)return
      meshes++
      const geometry=node.geometry
      triangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3
      // The campus sun shadow map is intentionally frozen after loading. Dynamic
      // basketballs use inexpensive projected ground shadows in their controller,
      // otherwise their initial baked positions remain as ghost shadows.
      node.castShadow=false;node.receiveShadow=true
      for(const material of Array.isArray(node.material)?node.material:[node.material]) {
        if(!material)continue
        material.roughness=Math.max(material.roughness??0,.88)
        material.metalness=0
        for(const texture of [material.map,material.normalMap]) {
          if(!texture)continue
          texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
          if(texture===material.map)texture.colorSpace=THREE.SRGBColorSpace
          textureSize=Math.max(textureSize,texture.image?.width??0,texture.image?.height??0)
          texture.needsUpdate=true
        }
      }
    })
    if(meshes!==1)throw new Error(`Expected one basketball source mesh, found ${meshes}`)
    basketballItems.length=0
    basketballAssetRoot.clear()
    const placements=[]
    for(const [index,placement] of config.placements.entries()) {
      const [x,z]=placement.center
      const model=template.clone(true)
      model.name=placement.id
      model.scale.setScalar(uniformScale)
      model.rotation.y=THREE.MathUtils.degToRad(placement.rotationY??0)
      model.updateMatrixWorld(true)
      const bounds=new THREE.Box3().setFromObject(model,true)
      const center=bounds.getCenter(new THREE.Vector3())
      const ground=(config.surfaceY??terrainHeightAt(x,z))+.008
      model.position.add(new THREE.Vector3(x-center.x,ground+config.radius-center.y,z-center.z))
      model.updateMatrixWorld(true)
      const finalBounds=new THREE.Box3().setFromObject(model,true)
      const finalSize=finalBounds.getSize(new THREE.Vector3())
      model.userData.basketballId=placement.id
      model.userData.basketballIndex=index
      basketballAssetRoot.add(model)
      const item={id:placement.id,index,model,radius:config.radius,initialPosition:model.position.clone(),initialRotationY:model.rotation.y}
      basketballItems.push(item)
      placements.push({
        id:placement.id,center:[x,z],ground:+ground.toFixed(3),rotationY:placement.rotationY??0,
        position:model.position.toArray().map(value=>+value.toFixed(3)),
        size:finalSize.toArray().map(value=>+value.toFixed(3)),
      })
    }
    basketballAssetLoadState={
      ...basketballAssetLoadState,status:'loaded',meshes,triangles:Math.round(triangles),textureSize,
      diameter:config.diameter,radius:config.radius,placements,drawObjects:basketballItems.length,
      sourceLicense:'CC0-1.0',sourceAuthor:'DigitalN8m4r3 / Miodrag Sejic',
    }
    markAssetReady(timing)
    renderer.shadowMap.needsUpdate=true
    return basketballAssetLoadState
  } catch(error) {
    console.warn(`Unable to load ${basketballAssetLoadState.url}`,error)
    basketballAssetLoadState={...basketballAssetLoadState,status:'failed',message:error?.message||'unknown error'}
    return basketballAssetLoadState
  }
}

async function loadBasketballHoopAsset() {
  const config=CAMPUS.facilities.basketballHoop
  try {
    const {gltf,timing}=await loadTimedGltf(basketballHoopAssetLoadState.url,'basketball-hoop')
    basketballHoopAssetRoot.clear()
    const model=gltf.scene
    model.name='basketball-hoop-game-optimized-v01'
    model.position.set(config.center[0],config.surfaceY,config.center[1])
    model.rotation.y=THREE.MathUtils.degToRad(config.rotationY??0)
    let meshes=0,triangles=0,materials=0,textureSize=0
    const materialSet=new Set()
    model.traverse(node=>{
      if(!node.isMesh)return
      meshes++;node.castShadow=true;node.receiveShadow=true
      const geometry=node.geometry
      triangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3
      for(const material of Array.isArray(node.material)?node.material:[node.material]) {
        if(!material)continue
        materialSet.add(material);material.roughness=Math.max(material.roughness??0,.82);material.metalness=Math.min(material.metalness??0,.08)
        if(material.map) {
          material.map.colorSpace=THREE.SRGBColorSpace
          material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
          textureSize=Math.max(textureSize,material.map.image?.width??0,material.map.image?.height??0)
          material.map.needsUpdate=true
        }
      }
    })
    materials=materialSet.size
    model.updateMatrixWorld(true)
    const bounds=new THREE.Box3().setFromObject(model,true),size=bounds.getSize(new THREE.Vector3())
    basketballHoopAssetRoot.add(model);basketballHoopModel=model

    const [cx,cz]=config.center,[bw,,bd]=config.baseSize,ground=config.surfaceY
    const hoopRotation=THREE.MathUtils.degToRad(config.rotationY??0),hoopCos=Math.cos(hoopRotation),hoopSin=Math.sin(hoopRotation)
    const hoopWorldPoint=([x,y,z])=>new THREE.Vector3(cx+x*hoopCos+z*hoopSin,ground+y,cz-x*hoopSin+z*hoopCos)
    const rimWorld=hoopWorldPoint(config.rimCenterLocal),boardWorld=hoopWorldPoint(config.boardCenterLocal)
    const boardHalfX=Math.abs(hoopCos)*config.boardSize[0]/2+Math.abs(hoopSin)*config.boardSize[2]/2
    const boardHalfZ=Math.abs(hoopSin)*config.boardSize[0]/2+Math.abs(hoopCos)*config.boardSize[2]/2
    const minX=cx-bw/2,maxX=cx+bw/2,minZ=cz-bd/2,maxZ=cz+bd/2
    navigation.addSegment('basketball-hoop-base-west',[minX,minZ],[minX,maxZ],ground-.02,ground+.13,.07)
    navigation.addSegment('basketball-hoop-base-east',[maxX,minZ],[maxX,maxZ],ground-.02,ground+.13,.07)
    navigation.addSegment('basketball-hoop-base-north',[minX,minZ],[maxX,minZ],ground-.02,ground+.13,.07)
    navigation.addSegment('basketball-hoop-base-south',[minX,maxZ],[maxX,maxZ],ground-.02,ground+.13,.07)
    navigation.addSegment('basketball-hoop-support-west',[cx-.68,minZ],[cx-.68,maxZ],ground,ground+3.55,.08)
    navigation.addSegment('basketball-hoop-support-east',[cx+.68,minZ],[cx+.68,maxZ],ground,ground+3.55,.08)
    navigation.addAabbBounds({
      name:'basketball-hoop-backboard-collider',
      minX:boardWorld.x-boardHalfX,maxX:boardWorld.x+boardHalfX,
      minZ:boardWorld.z-boardHalfZ,maxZ:boardWorld.z+boardHalfZ,
      minY:ground+config.boardCenterLocal[1]-config.boardSize[1]/2,maxY:ground+config.boardCenterLocal[1]+config.boardSize[1]/2,
    })
    basketballHoopAssetLoadState={
      ...basketballHoopAssetLoadState,status:'loaded',meshes,triangles:Math.round(triangles),materials,textureSize,
      center:[...config.center],surfaceY:config.surfaceY,rotationY:config.rotationY,
      rimWorld:rimWorld.toArray().map(value=>+value.toFixed(3)),
      boardSize:[...config.boardSize],baseSize:[...config.baseSize],
      bounds:{min:bounds.min.toArray().map(value=>+value.toFixed(3)),max:bounds.max.toArray().map(value=>+value.toFixed(3)),size:size.toArray().map(value=>+value.toFixed(3))},
      drawObjects:meshes,
    }
    markAssetReady(timing);renderer.shadowMap.needsUpdate=true
    return basketballHoopAssetLoadState
  } catch(error) {
    console.warn(`Unable to load ${basketballHoopAssetLoadState.url}`,error)
    basketballHoopAssetLoadState={...basketballHoopAssetLoadState,status:'failed',message:error?.message||'unknown error'}
    return basketballHoopAssetLoadState
  }
}

const loadBasketballAreaAssets=async()=>{
  await Promise.all([loadBasketballAsset(),loadBasketballHoopAsset()])
  if(basketballAssetLoadState.status!=='loaded'||basketballHoopAssetLoadState.status!=='loaded')return null
  const {createBasketballGame}=await import('./interactions/basketball-game.js')
  basketballGame=createBasketballGame({
    root:scene,camera,renderer,items:basketballItems,config:CAMPUS.facilities.basketballs,
    hoop:CAMPUS.facilities.basketballHoop,colliders,player:CAMPUS.player,
    shadowDirection:new THREE.Vector3().subVectors(sun.target.position,sun.position).normalize(),
    groundHeightAt,surfaceKindAt:groundSurfaceAt,isWalkMode:()=>mode==='walk',
    isTouchMode:()=>touchModePreferred,canCharge:()=>!pointWalkController?.hasCandidate()&&(automatedTestBuild||touchModePreferred||!pointerLockAvailable||pointer.isLocked),
    onEvent:event=>{trackPersonalGameEvent(event);announceBasketballEvent(event)},
  })
  return basketballGame.snapshot()
}

async function loadConcreteSlideAsset() {
  const slide=CAMPUS.facilities.slideReserve
  try {
    await assetLoader.enableMeshoptForGltf()
    const {gltf,timing}=await loadTimedGltf(concreteSlideAssetLoadState.url,'concrete-slide')
    const model=gltf.scene
    model.name='concrete-slide-game-optimized-v01'
    model.rotation.y=THREE.MathUtils.degToRad(slide.rotationY??0)
    model.updateMatrixWorld(true)
    const initialBounds=new THREE.Box3().setFromObject(model)
    const initialSize=initialBounds.getSize(new THREE.Vector3())
    const uniformScale=slide.assetTargetHeight/initialSize.y
    model.scale.setScalar(uniformScale)
    model.updateMatrixWorld(true)
    const scaledBounds=new THREE.Box3().setFromObject(model)
    const scaledCenter=scaledBounds.getCenter(new THREE.Vector3())
    model.position.add(new THREE.Vector3(
      slide.center[0]-scaledCenter.x,
      slide.y-scaledBounds.min.y,
      slide.center[1]-scaledCenter.z,
    ))
    let meshes=0,triangles=0
    model.traverse(node=>{
      if(!node.isMesh)return
      meshes++
      const geometry=node.geometry
      triangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3
      node.castShadow=node.receiveShadow=true
      const materials=Array.isArray(node.material)?node.material:[node.material]
      for(const material of materials) {
        if(!material)continue
        material.roughness=Math.max(material.roughness??0,.9)
        material.metalness=Math.min(material.metalness??0,.02)
        for(const texture of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap]) {
          if(!texture)continue
          texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
          if(texture===material.map)texture.colorSpace=THREE.SRGBColorSpace
          texture.needsUpdate=true
        }
      }
    })
    concreteSlideAssetRoot.add(model)
    model.updateMatrixWorld(true)
    const finalBounds=new THREE.Box3().setFromObject(model)
    const finalSize=finalBounds.getSize(new THREE.Vector3())
    navigation.addAabbBounds({
      name:'concrete-slide-glb-collider',
      minX:finalBounds.min.x,maxX:finalBounds.max.x,
      minZ:finalBounds.min.z,maxZ:finalBounds.max.z,
      minY:finalBounds.min.y,maxY:finalBounds.max.y,
    })
    concreteSlideAssetLoadState={
      ...concreteSlideAssetLoadState,status:'loaded',meshoptCandidate:'formal-conservative',meshes,triangles:Math.round(triangles),textureSize:1024,
      center:slide.center,rotationY:slide.rotationY??0,scale:+uniformScale.toFixed(4),
      size:[finalSize.x,finalSize.y,finalSize.z].map(value=>+value.toFixed(3)),
    }
    markAssetReady(timing)
    renderer.shadowMap.needsUpdate=true
  } catch(error) {
    console.warn(`Unable to load ${concreteSlideAssetLoadState.url}`,error)
    concreteSlideAssetLoadState={...concreteSlideAssetLoadState,status:'failed',message:error?.message||'unknown error'}
    throw error
  }
}

function oldClassroomInsetWindow(name, position, size) {
  const group = new THREE.Group(); group.name = name; group.position.set(...position); root.add(group)
  const [width,height] = size, frame = .06, depth = .07
  // 深色背板退到框后约6cm；墙体不切贯通洞，保持旧教室不可进入的简化边界。
  box(`${name}-dark-recess`, [width-.05,height-.05,.025], [0,0,-.06], mat.dark, { parent:group,shadow:false })
  for(const x of [-width/2+frame/2,-width/6,width/6,width/2-frame/2]) {
    box(`${name}-iron-vertical`, [frame,height,depth], [x,0,0], sampleMat.paintedSteel, { parent:group,shadow:false })
  }
  for(const y of [-height/2+frame/2,0,height/2-frame/2]) {
    box(`${name}-iron-horizontal`, [width,frame,depth], [0,y,0], sampleMat.paintedSteel, { parent:group,shadow:false })
  }
}

function oldClassroomDoorRecess(name, position) {
  box(`${name}-dark-recess`,[1.01,2.5,.025],[position[0],position[1]+1.25,position[2]-.05],mat.dark,{shadow:false})
}

function applyGroundUV(geometry,tileSize=3.2) {
  const positions=geometry.attributes.position,uv=[]
  for(let i=0;i<positions.count;i++) uv.push(positions.getX(i)/tileSize,-positions.getZ(i)/tileSize)
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
  return geometry
}

function groundPlane(name,size,center,y,material,tileSize=3.2) {
  const geometry=new THREE.PlaneGeometry(size[0],size[1])
  geometry.rotateX(-Math.PI/2)
  applyGroundUV(geometry,tileSize)
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=name;mesh.position.set(center[0],y,center[1]);mesh.receiveShadow=true;root.add(mesh)
  return mesh
}

function groundRectPoints(center,size) {
  const [cx,cz]=center,[width,depth]=size
  return [[cx-width/2,cz-depth/2],[cx+width/2,cz-depth/2],[cx+width/2,cz+depth/2],[cx-width/2,cz+depth/2]]
}

function sandpitOpeningPoints() {
  const f=CAMPUS.facilities.sandpit
  // 孔洞略伸入水泥框下方，既不遮住沙面，也不会在框外留下缝隙。
  const opening=[f.size[0]-f.rimWidth*2+.01,f.size[1]-f.rimWidth*2+.01]
  return groundRectPoints(f.center,opening)
}

function activitySandOpeningPoints(config) {
  // 孔洞只开在窄水泥圈的内槽下方，让凹陷沙面可见；水泥圈本身仍由高台承托。
  const opening=[config.size[0]-config.rimWidth*2+.012,config.size[1]-config.rimWidth*2+.012]
  return groundRectPoints(config.center,opening)
}

function groundShape(name,points,y,material,tileSize=3.2,holes=[]) {
  const contour=points.map(([x,z])=>new THREE.Vector2(x,-z))
  if(!THREE.ShapeUtils.isClockWise(contour))contour.reverse()
  const shape=new THREE.Shape(contour)
  for(const holePoints of holes) {
    const vertices=holePoints.map(([x,z])=>new THREE.Vector2(x,-z))
    if(THREE.ShapeUtils.isClockWise(vertices))vertices.reverse()
    shape.holes.push(new THREE.Path(vertices))
  }
  const geometry=new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI/2)
  applyGroundUV(geometry,tileSize)
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=name;mesh.position.y=y;mesh.receiveShadow=true;root.add(mesh)
  return mesh
}

let concreteRoadSampleCache
function concreteRoadSamples() {
  if(concreteRoadSampleCache)return concreteRoadSampleCache
  const points=CAMPUS.terrain.eastHighland.concreteRoad.points.map(([x,z])=>new THREE.Vector3(x,0,z))
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal')
  const segmentCount=Math.max(2,Math.ceil(curve.getLength()/.55))
  concreteRoadSampleCache=Array.from({length:segmentCount+1},(_,index)=>{
    const point=curve.getPoint(index/segmentCount)
    return [point.x,point.z]
  })
  return concreteRoadSampleCache
}

function terrainRibbon(name,points,width,material,tileSize=4,offset=.025) {
  const positions=[],uv=[],indices=[]
  for(let i=0;i<points.length;i++) {
    const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)]
    const dx=next[0]-previous[0],dz=next[1]-previous[1],length=Math.max(.001,Math.hypot(dx,dz))
    const nx=-dz/length,nz=dx/length
    for(const side of [-1,1]) {
      const x=points[i][0]+nx*width*.5*side,z=points[i][1]+nz*width*.5*side
      positions.push(x,terrainHeightAt(x,z)+offset,z);uv.push(x/tileSize,-z/tileSize)
    }
  }
  const normalY=(a,b,c)=>{
    const ax=positions[a*3],az=positions[a*3+2],bx=positions[b*3],bz=positions[b*3+2],cx=positions[c*3],cz=positions[c*3+2]
    return (bz-az)*(cx-ax)-(bx-ax)*(cz-az)
  }
  const addTriangle=(a,b,c)=>normalY(a,b,c)<0?indices.push(a,c,b):indices.push(a,b,c)
  for(let i=0;i<points.length-1;i++) {
    const left=i*2,right=left+1,nextLeft=left+2,nextRight=left+3
    addTriangle(left,right,nextLeft);addTriangle(right,nextRight,nextLeft)
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
  geometry.setIndex(indices);geometry.computeVertexNormals()
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=name;mesh.receiveShadow=true;root.add(mesh)
  return mesh
}

let eastHighlandBoundaryCache
function eastHighlandBoundaries() {
  if(eastHighlandBoundaryCache)return eastHighlandBoundaryCache
  const highland=CAMPUS.terrain.eastHighland
  const core=highland.core.map(([x,z])=>[x,z])
  // 高台边缘直接使用配置中的明确折线，不再细分或加入随机侵蚀扰动。
  eastHighlandBoundaryCache={core}
  return eastHighlandBoundaryCache
}

function highlandSlopeMesh() {
  const {core}=eastHighlandBoundaries(),highland=CAMPUS.terrain.eastHighland
  const positions=[],uv=[],indices=[],height=CAMPUS.terrain.platformHeight
  const slopeRun=height/Math.tan(THREE.MathUtils.degToRad(highland.slopeAngleDeg??60))
  const signedArea=core.reduce((area,[x,z],index)=>{
    const next=core[(index+1)%core.length]
    return area+x*next[1]-next[0]*z
  },0)
  const outwardNormals=core.map((a,index)=>{
    const b=core[(index+1)%core.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.max(.001,Math.hypot(dx,dz))
    // 正面积轮廓的外侧在每条有向边右边；负面积轮廓则相反。
    return signedArea>0?[dz/length,-dx/length]:[-dz/length,dx/length]
  })
  const foot=core.map(([x,z],index)=>{
    const previous=outwardNormals[(index-1+core.length)%core.length],next=outwardNormals[index]
    const mx=previous[0]+next[0],mz=previous[1]+next[1],miterLength=Math.max(.001,Math.hypot(mx,mz))
    const ux=mx/miterLength,uz=mz/miterLength
    const scale=Math.min(slopeRun*2,slopeRun/Math.max(.5,ux*next[0]+uz*next[1]))
    return [x+ux*scale,z+uz*scale]
  })
  let distance=0
  for(let i=0;i<core.length;i++) {
    const next=(i+1)%core.length
    const a=core[i],b=core[next],fa=foot[i],fb=foot[next]
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),base=positions.length/3
    positions.push(a[0],height,a[1], b[0],height,b[1], fb[0],.004,fb[1], fa[0],.004,fa[1])
    uv.push(distance/4,height/4,(distance+length)/4,height/4,(distance+length)/4,0,distance/4,0)
    indices.push(base,base+1,base+2,base,base+2,base+3)
    distance+=length
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
  geometry.setIndex(indices);geometry.computeVertexNormals()
  const slopeMaterial=groundMat.slopeDirt.clone()
  slopeMaterial.side=THREE.DoubleSide
  const mesh=new THREE.Mesh(geometry,slopeMaterial)
  mesh.name='east-highland-regular-slope';mesh.castShadow=mesh.receiveShadow=true;root.add(mesh)
  return mesh
}

function terrainRandom(index,seed=CAMPUS.terrain.eastHighland.surfaceSeed) {
  const value=Math.sin((index+1)*12.9898+seed*78.233)*43758.5453
  return value-Math.floor(value)
}

function createHighlandRetainingEdge() {
  const highland=CAMPUS.terrain.eastHighland,edge=highland.retainingEdge,points=eastHighlandBoundaries().core
  // 整个东侧场地的分段水泥砌块已取消；提前返回也同步取消其碰撞体。
  if(!edge.enabled)return
  const center=points.reduce((sum,[x,z])=>{sum.x+=x;sum.z+=z;return sum},{x:0,z:0})
  center.x/=points.length;center.z/=points.length
  let blockIndex=0
  for(let pointIndex=0;pointIndex<points.length;pointIndex++) {
    const a=points[pointIndex],b=points[(pointIndex+1)%points.length]
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)
    if(length<.1)continue
    const ux=dx/length,uz=dz/length
    const normalA=[-uz,ux],normalB=[uz,-ux]
    const midpoint=[(a[0]+b[0])/2,(a[1]+b[1])/2]
    const outward=(normalA[0]*(midpoint[0]-center.x)+normalA[1]*(midpoint[1]-center.z))>0?normalA:normalB
    const count=Math.max(1,Math.floor(length/(edge.blockLength+edge.joint)))
    const actualLength=length/count-edge.joint
    for(let i=0;i<count;i++,blockIndex++) {
      const t=(i+.5)/count
      const x=THREE.MathUtils.lerp(a[0],b[0],t)+outward[0]*edge.outwardOffset
      const z=THREE.MathUtils.lerp(a[1],b[1],t)+outward[1]*edge.outwardOffset
      const damage=terrainRandom(blockIndex*7+edge.damageSeed,edge.damageSeed)
      const fullGap=damage<.06
      if(fullGap)continue
      const courseHeight=edge.height/edge.courses
      for(let course=0;course<edge.courses;course++) {
        const upperDamage=course===edge.courses-1&&damage<.18
        if(upperDamage)continue
        const stagger=(course%2-.5)*(actualLength+edge.joint)*.38
        const shortening=damage>.94?.12:0
        const mesh=box(
          'east-highland-cement-masonry-edge',
          [Math.max(.3,actualLength-shortening),courseHeight-edge.joint,edge.thickness],
          [x+ux*stagger,courseHeight*(course+.5)+.025,z+uz*stagger],
          groundMat.agedConcrete,
          {shadow:true},
        )
        mesh.rotation.y=-Math.atan2(dz,dx)
      }
      addSegmentCollider(
        'east-highland-cement-masonry-edge',
        [x-ux*actualLength*.5,z-uz*actualLength*.5],
        [x+ux*actualLength*.5,z+uz*actualLength*.5],
        .02,
        edge.height+.03,
        edge.thickness,
      )
    }
  }
}

function groundAccent(name,position,size,material,opacity) {
  const accentMaterial=material.clone()
  accentMaterial.transparent=true;accentMaterial.opacity=opacity;accentMaterial.depthWrite=false
  accentMaterial.polygonOffset=true;accentMaterial.polygonOffsetFactor=-1;accentMaterial.polygonOffsetUnits=-1
  const geometry=new THREE.CircleGeometry(1,24)
  geometry.rotateX(-Math.PI/2);applyGroundUV(geometry,2.8)
  const mesh=new THREE.Mesh(geometry,accentMaterial)
  mesh.name=name;mesh.position.set(position[0],position[1],position[2]);mesh.scale.set(size[0],1,size[1]);mesh.receiveShadow=true;root.add(mesh)
  return mesh
}

function irregularGroundRect(center,size,seed) {
  const [cx,cz]=center,[width,depth]=size,minX=cx-width/2,maxX=cx+width/2,minZ=cz-depth/2,maxZ=cz+depth/2
  const jitter=index=>(terrainRandom(seed+index)-.5)*.48
  return [
    [minX+.45,minZ+jitter(1)],[cx,minZ+jitter(2)],[maxX-.55,minZ+jitter(3)],
    [maxX+jitter(4),minZ+depth*.48],[maxX+jitter(5),maxZ-.35],
    [cx+width*.18,maxZ+jitter(6)],[cx-width*.22,maxZ+jitter(7)],[minX+jitter(8),maxZ-.45],
    [minX+jitter(9),cz-depth*.08],
  ]
}

function createGround() {
  // 底层地面必须与可见校园边界共用同一轮廓；旧的 112×82m 占位矩形
  // 会在收窄后的东界之外露出一整块方形平面。
  const campusOutline=CAMPUS.world.boundary.map(([x,z])=>[x,z])
  const sandpitHole=sandpitOpeningPoints()
  // 基底与表层都为凹陷沙池留孔，否则低于地面的沙丘会被整块校园地面遮住。
  groundShape('campus-ground-base',campusOutline,-.03,mat.slope,6,[sandpitHole])
  groundShape('campus-compacted-dirt',campusOutline,-.002,groundMat.compactedDirt,6,[sandpitHole])
  const zones=CAMPUS.terrain.groundZones
  groundShape('main-aged-concrete-court',zones.mainConcrete,.006,groundMat.agedConcrete,4)
  groundShape('b1-portal-concrete-path',zones.portalConcrete,.008,groundMat.agedConcrete,4)
  groundShape('toilet-sandpit-aged-concrete-base',zones.serviceConcrete,.007,groundMat.serviceConcrete,4,[sandpitHole])
  highlandSlopeMesh()
  const activitySandHoles=[
    activitySandOpeningPoints(CAMPUS.facilities.activity.upperSand),
    activitySandOpeningPoints(CAMPUS.facilities.activity.lowerSand),
    activitySandOpeningPoints(CAMPUS.facilities.activity.southwestSand),
  ]
  groundShape('east-highland-dirt-top',eastHighlandBoundaries().core,CAMPUS.terrain.platformHeight+.003,groundMat.compactedDirt,6,activitySandHoles)
  const concreteRoad=CAMPUS.terrain.eastHighland.concreteRoad
  terrainRibbon('east-highland-concrete-road',concreteRoadSamples(),concreteRoad.width,groundMat.agedConcrete,4,.018)
  createHighlandRetainingEdge()
  // 潮色与青苔只在坡脚、排水低点少量出现，作为柔和遮罩而非整面平铺。
  groundAccent('highland-foot-damp-earth',[9.2,.009,-54.2],[2.2,.55],groundMat.dampEarth,.28)
  groundAccent('highland-foot-soft-moss',[20.7,.01,-27.3],[1.25,.38],groundMat.softMoss,.24)
  groundAccent('court-drainage-wear',[-22,.012,-46.6],[3.5,.42],groundMat.dampEarth,.12)
}

function groundDecalPlacements() {
  const cracks=[
    // 主操场：稀疏、细小且方向各异，避免形成均匀撒点。
    [-38,-31,2.5,1.4,.22,0],[-29,-37,1.8,1.3,-.7,2],[-19,-29,2.2,1.2,.85,4],
    [-10,-39,2.8,1.35,-.25,6],[.2,-31.5,1.7,1.05,.45,8],[7.1,-42,2.1,1.2,-.9,10],
    [-34,-45.2,2.4,1.25,.52,12],[-17,-44.5,1.6,1.0,-.35,1],[-5,-35,2.1,1.25,1.05,5],
    // 厕所和沙池周边：裂缝更集中、局部更宽。
    [1.62,-51.5,1.7,.85,.2,3],[9.05,-50.9,1.9,1.0,-.45,7],[1.58,-55.6,1.45,.8,.72,9],
    [9.18,-55.8,1.75,.95,.12,11],[1.62,-59.1,1.65,.9,-.65,13],[9.04,-59.6,1.8,1.0,.55,5],
    // 教学楼墙脚外沿的少量应力裂缝。
    [-21.5,-23.55,2.0,.8,.05,14],[-5.5,-23.52,1.55,.72,-.18,0],[11.8,-23.5,1.8,.75,.12,6],
    [-36,-48.35,1.8,.75,-.12,2],[-16,-48.36,2.2,.8,.16,8],[-1,-48.34,1.7,.72,-.22,10],
  ]
  return {cracks}
}

async function loadGroundDetailDecals() {
  const urls={
    cracks:'/assets/textures/ground-decals/handpainted-cracks-atlas-v01.png',
  }
  try {
    const timing=beginAssetTiming('ground-crack-atlas',urls.cracks)
    const loader=new THREE.TextureLoader()
    const crackAtlas=await loader.loadAsync(urls.cracks)
    crackAtlas.colorSpace=THREE.SRGBColorSpace
    crackAtlas.wrapS=crackAtlas.wrapT=THREE.ClampToEdgeWrapping
    crackAtlas.minFilter=THREE.LinearMipmapLinearFilter
    crackAtlas.magFilter=THREE.LinearFilter
    crackAtlas.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
    crackAtlas.needsUpdate=true
    finishAssetLoad(timing)
    const placements=groundDecalPlacements()
    const build=(name,source,items,{opacity,color,alphaTest=0})=>{
      const groups=new Map()
      for(const item of items) {
        const variant=item[5]%16
        if(!groups.has(variant))groups.set(variant,[])
        groups.get(variant).push(item)
      }
      for(const [variant,instances] of groups) {
        const material=new THREE.MeshBasicMaterial({
          name:`${name}-cell-${variant}`,map:source,color,transparent:true,opacity,
          alphaTest,depthWrite:false,side:THREE.DoubleSide,
          polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
        })
        const geometry=new THREE.PlaneGeometry(1,1)
        // 图集格子坐标烘入几何 UV，16 组实例共享一张 GPU 纹理。
        const uv=geometry.getAttribute('uv'),offsetX=(variant%4)*.25,offsetY=(3-Math.floor(variant/4))*.25
        for(let index=0;index<uv.count;index++)uv.setXY(index,uv.getX(index)*.25+offsetX,uv.getY(index)*.25+offsetY)
        uv.needsUpdate=true
        geometry.rotateX(-Math.PI/2)
        const mesh=new THREE.InstancedMesh(geometry,material,instances.length)
        mesh.name=`${name}-cell-${variant}-instances`
        mesh.renderOrder=4
        const transform=new THREE.Object3D()
        instances.forEach(([x,z,width,depth,rotation],index)=>{
          transform.position.set(x,terrainHeightAt(x,z)+.018,z)
          transform.rotation.set(0,rotation,0)
          transform.scale.set(width,1,depth)
          transform.updateMatrix()
          mesh.setMatrixAt(index,transform.matrix)
        })
        mesh.instanceMatrix.needsUpdate=true
        groundDetailRoot.add(mesh)
      }
      return items.length
    }
    const crackCount=build('court-handpainted-crack',crackAtlas,placements.cracks,{opacity:.46,color:0xa8a08d,alphaTest:.01})
    groundDetailLoadState={
      status:'loaded',atlases:1,instances:crackCount,
      drawObjects:groundDetailRoot.children.length,
    }
    markAssetReady(timing)
  } catch(error) {
    console.warn('Unable to load hand-painted ground decals',error)
    groundDetailLoadState={...groundDetailLoadState,status:'failed',message:error?.message||'unknown error'}
  }
}

function applyGatePierAtlasUv(geometry,width,height,depth,faceOffset=0) {
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv')
  const clamp=value=>THREE.MathUtils.clamp(value,0,1)
  for(let index=0;index<position.count;index++) {
    const px=position.getX(index),py=position.getY(index),pz=position.getZ(index)
    const nx=normal.getX(index),ny=normal.getY(index),nz=normal.getZ(index)
    let face=faceOffset%4,localU=.5,v=clamp(py/height+.5)
    if(Math.abs(ny)<.5) {
      if(nx>.5) {face=(faceOffset+0)%4;localU=clamp(pz/depth+.5)}
      else if(nz>.5) {face=(faceOffset+1)%4;localU=clamp(.5-px/width)}
      else if(nx<-.5) {face=(faceOffset+2)%4;localU=clamp(.5-pz/depth)}
      else {face=(faceOffset+3)%4;localU=clamp(px/width+.5)}
    } else {
      // 顶面／底面分别取同一面板最上、最下约4%的石材色带。
      localU=clamp(px/width+.5)
      const across=clamp(pz/depth+.5)
      v=ny>.5?.998-across*.038:.002+across*.038
    }
    uv.setXY(index,(face+localU)/4,v)
  }
  uv.needsUpdate=true
  return geometry
}

function gateIronBeam(name,a,b,z,thickness,depth) {
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)
  const beam=box(
    name,[length,thickness,depth],
    [(a[0]+b[0])/2,(a[1]+b[1])/2,z],mat.gateIron,
  )
  beam.rotation.z=Math.atan2(dy,dx)
  return beam
}

function gateIronSquare(name,cx,cy,size,z,thickness,depth) {
  const half=size/2
  gateIronBeam(`${name}-top`,[cx-half,cy+half],[cx+half,cy+half],z,thickness,depth)
  gateIronBeam(`${name}-bottom`,[cx-half,cy-half],[cx+half,cy-half],z,thickness,depth)
  gateIronBeam(`${name}-left`,[cx-half,cy-half],[cx-half,cy+half],z,thickness,depth)
  gateIronBeam(`${name}-right`,[cx+half,cy-half],[cx+half,cy+half],z,thickness,depth)
}

function createSchoolIronGate(gateLeft,gateRight,gateZ,config) {
  const center=(gateLeft+gateRight)/2,leafWidth=(gateRight-gateLeft-config.centerGap)/2
  const bottom=config.bottomGap,top=bottom+config.height,z=gateZ+.015
  const leaves=[
    {name:'left',x1:gateLeft,x2:center-config.centerGap/2},
    {name:'right',x1:center+config.centerGap/2,x2:gateRight},
  ]
  for(const leaf of leaves) {
    const innerLeft=leaf.x1+config.frame/2,innerRight=leaf.x2-config.frame/2
    // 双扇门使用简洁矩形外框；参考图的圆角感由略粗顶框与端部竖框收口表达。
    for(const x of [innerLeft,innerRight])box(
      `school-gate-${leaf.name}-outer-vertical`,
      [config.frame,config.height,config.depth],[x,bottom+config.height/2,z],mat.gateIron,
    )
    for(const y of [bottom+config.frame/2,config.topBandBottom,top-config.frame/2])box(
      `school-gate-${leaf.name}-horizontal-rail`,
      [leafWidth,config.frame,config.depth],[(leaf.x1+leaf.x2)/2,y,z],mat.gateIron,
    )
    // 主体竖杆贯穿全门高；上部菱形作为轻量装饰带，不加入文字或红星。
    const barCount=7
    for(let index=1;index<=barCount;index++) {
      const x=THREE.MathUtils.lerp(leaf.x1+config.frame,leaf.x2-config.frame,index/(barCount+1))
      box(
        `school-gate-${leaf.name}-vertical-bar`,
        [config.bar,config.height-2*config.frame,config.depth*.72],
        [x,bottom+config.height/2,z+.004],mat.gateIron,
      )
    }
    const diamondY=(config.topBandBottom+top)/2,diamondHeight=(top-config.topBandBottom)*.46
    for(let index=0;index<3;index++) {
      const cx=THREE.MathUtils.lerp(leaf.x1+leafWidth*.22,leaf.x2-leafWidth*.22,index/2)
      const halfW=leafWidth*.105,halfH=diamondHeight/2
      const points=[[cx,diamondY+halfH],[cx+halfW,diamondY],[cx,diamondY-halfH],[cx-halfW,diamondY]]
      for(let edge=0;edge<4;edge++)gateIronBeam(
        `school-gate-${leaf.name}-top-diamond`,points[edge],points[(edge+1)%4],z+.008,config.bar,config.depth*.62,
      )
    }
    // 下部只保留四个小方框，替代参考图较繁复的实心花饰。
    const lowerY=bottom+.25
    box(
      `school-gate-${leaf.name}-lower-rail`,
      [leafWidth,config.frame,config.depth],[(leaf.x1+leaf.x2)/2,lowerY+config.frame,z],mat.gateIron,
    )
    for(let index=0;index<4;index++)gateIronSquare(
      `school-gate-${leaf.name}-lower-square`,
      THREE.MathUtils.lerp(leaf.x1+leafWidth*.16,leaf.x2-leafWidth*.16,index/3),
      lowerY,.16,z+.008,config.bar,config.depth*.62,
    )
  }
  // 中缝仅设一个小型暗色插销盒，不做标语牌或徽记。
  box('school-gate-center-latch',[.11,.24,config.depth*.9],[center,bottom+1.02,z+.008],mat.gateIron)
}

function createBoundary() {
  const pts = CAMPUS.world.boundary, defaultHeight=CAMPUS.world.wall.height, t=CAMPUS.world.wall.thickness
  const gate=CAMPUS.world.gate,[gateX,gateZ]=gate.center,gateLeft=gateX-gate.width/2,gateRight=gateX+gate.width/2
  const pierWidth=.65,wallPierEmbed=.02
  const leftPierOuter=gateLeft-pierWidth,rightPierOuter=gateRight+pierWidth
  const samePoint=(a,b)=>Math.abs(a[0]-b[0])<.01&&Math.abs(a[1]-b[1])<.01
  const isRemovedSegment=(a,b)=>(CAMPUS.world.wall.removedSegments||[]).some(segment=>
    (samePoint(a,segment.from)&&samePoint(b,segment.to))||
    (samePoint(a,segment.to)&&samePoint(b,segment.from))
  )
  const wallHeightFor=(a,b)=>{
    const override=(CAMPUS.world.wall.heightOverrides||[]).find(segment=>
      (samePoint(a,segment.from)&&samePoint(b,segment.to))||
      (samePoint(a,segment.to)&&samePoint(b,segment.from))
    )
    return override?.height??defaultHeight
  }
  const wallMaterialFor=(a,b,height=defaultHeight)=>{
    const ax=Math.round(a[0]*100),az=Math.round(a[1]*100),bx=Math.round(b[0]*100),bz=Math.round(b[1]*100)
    const hash=(Math.imul(ax+bx,73856093)^Math.imul(az+bz,19349663))>>>0
    const variants=Math.abs(height-3)<.001?tallPerimeterWallMat:perimeterWallMat
    return variants[hash%variants.length]
  }
  const addWallSegment=(a,b)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)
    if(len<.05) return
    const h=wallHeightFor(a,b)
    const mesh=box('campus-boundary-wall',[len,h,t],[(a[0]+b[0])/2,h/2,(a[1]+b[1])/2],wallMaterialFor(a,b,h))
    mesh.rotation.y=-Math.atan2(dz,dx)
    navigation.addSegment('campus-boundary-wall',a,b,0,h,t)
  }
  for(let i=0;i<pts.length;i++) {
    const a=pts[i],b=pts[(i+1)%pts.length]
    // 围墙缺口不改变校园地面轮廓；此处同时不登记线段碰撞。
    if(isRemovedSegment(a,b))continue
    const crossesGate=Math.abs(a[1]-gateZ)<.01&&Math.abs(b[1]-gateZ)<.01&&Math.min(a[0],b[0])<gateLeft&&Math.max(a[0],b[0])>gateRight
    if(!crossesGate) { addWallSegment(a,b); continue }
    // 围墙接门柱外侧面，仅嵌入2cm收口；不得再穿过整根门柱直到净开口边。
    if(a[0]>b[0]) {
      addWallSegment(a,[rightPierOuter-wallPierEmbed,gateZ])
      addWallSegment([leftPierOuter+wallPierEmbed,gateZ],b)
    } else {
      addWallSegment(a,[leftPierOuter+wallPierEmbed,gateZ])
      addWallSegment([rightPierOuter-wallPierEmbed,gateZ],b)
    }
  }
  for(const segment of CAMPUS.world.wall.additionalSegments||[])addWallSegment(segment.from,segment.to)
  for(const [index,x] of [gateLeft-pierWidth/2,gateRight+pierWidth/2].entries()) {
    const pier=box('gate-pier',[pierWidth,2.8,pierWidth],[x,1.4,gateZ-.15],mat.gatePier,{collider:true})
    // 右柱从图集第三面起用，避免两根门柱朝向校园的一面完全相同。
    applyGatePierAtlasUv(pier.geometry,pierWidth,2.8,pierWidth,index*2)
  }
  // 校门视觉保持敞开，但行走模式不得离开校园；门柱以外仍由围墙实体碰撞封闭。
  if(gate.walkExitBlocked)navigation.addSegment(
    'campus-gate-invisible-walk-limit',
    [gateLeft,gateZ],[gateRight,gateZ],0,defaultHeight,t,
  )
  createSchoolIronGate(gateLeft,gateRight,gateZ,gate.ironGate)
  addLabel('学校大门 · 南?', [gateX,3.6,gateZ-.3])
}

function createBuilding1() {
  const b=CAMPUS.buildings.building1, [cx,cz]=b.main.center, [w,d]=b.main.size, h=b.floorHeight, base=b.raised
  const opening=b.openings, b1Window=opening.window, b1Door=opening.door
  const zNorth=cz-d/2, zFront=cz+d/2, roomFront=zFront-b.corridor
  const central=[cx-b.centralBay/2,cx+b.centralBay/2]
  const outerMin=cx-w/2,outerMax=cx+w/2
  // 四间主楼教室均以 9m 室内净宽推导；门窗、隔墙和柱位共用这一组数据。
  const mainRooms=[
    {start:outerMin+b.wall,end:outerMin+b.wall+9},
    {start:outerMin+b.wall+9+b.wall,end:central[0]},
    {start:central[1],end:central[1]+9},
    {start:central[1]+9+b.wall,end:outerMax-b.wall},
  ].map(room=>({...room,center:(room.start+room.end)/2}))
  const corridorColumnXs=[mainRooms[1].center,central[0],central[1],mainRooms[2].center]
  // 背面没有楼梯开口限制，四间教室的中线均保留结构柱，另含中央结构跨两侧柱。
  const rearColumnXs=[...mainRooms.map(room=>room.center),central[0],central[1]].sort((a,b)=>a-b)
  const classroomDividers=[(mainRooms[0].end+mainRooms[1].start)/2,(mainRooms[2].end+mainRooms[3].start)/2]
  const centralWallCenters=[central[0]+b.wall/2,central[1]-b.wall/2]
  const mainRoomSideWalls=[
    [outerMin,classroomDividers[0]],
    [classroomDividers[0],centralWallCenters[0]],
    [centralWallCenters[1],classroomDividers[1]],
    [classroomDividers[1],outerMax],
  ]
  const west=b.wings.west,east=b.wings.east
  const westOuter=west.center[0]-west.size[0]/2,westInner=west.center[0]+west.size[0]/2
  const eastInner=east.center[0]-east.size[0]/2,eastOuter=east.center[0]+east.size[0]/2
  const wingSouth=Math.max(west.center[1]+west.size[1]/2,east.center[1]+east.size[1]/2)
  // 设计挑檐从墙外皮量取：半墙厚0.12m + 挑檐0.50m = 相对墙中心线外放0.62m。
  const roofOut=b.wall/2+b.roofOverhang
  const uOutline=[
    [outerMin-roofOut,zNorth-roofOut],[outerMax+roofOut,zNorth-roofOut],
    [eastOuter+roofOut,wingSouth+roofOut],[eastInner-roofOut,wingSouth+roofOut],
    [eastInner-roofOut,zFront+b.chamfer],[eastInner-b.chamfer,zFront+roofOut],
    [westInner+b.chamfer,zFront+roofOut],[westInner+roofOut,zFront+b.chamfer],
    [westInner+roofOut,wingSouth+roofOut],[westOuter-roofOut,wingSouth+roofOut],
  ]
  const insulationOutline=insetPolygon(uOutline,b.insulationInset)
  // 基座与首层楼板按原中央侧墙内皮收口，不伸入穿堂形成凸台。
  const passageOpeningLeft=cx-b.centralOpening/2
  const passageOpeningRight=cx+b.centralOpening/2
  const portalLeft=cx-b.centralPortal.width/2
  const portalRight=cx+b.centralPortal.width/2
  const portalOpeningLeft=cx-b.centralPortal.openingWidth/2
  const portalOpeningRight=cx+b.centralPortal.openingWidth/2
  const passageBaseLeft=centralWallCenters[0]+b.wall/2
  const passageBaseRight=centralWallCenters[1]-b.wall/2
  // 楼板外边不能停在墙／栏杆中心线：0.22m包含半墙厚0.12m及约0.10m可见挑边。
  const slabOut=b.slabEdgeOverhang
  // 东、西、北三面还需完整承托外置框架柱；使用独立外放量，不改变南侧走廊宽度。
  const structuralSlabOut=b.structuralSlabEdgeOverhang??slabOut
  const [edgeHeight,edgeThickness]=b.corridorTopEdge
  const [columnWidth,columnDepth]=b.frameColumn
  const [beamWidth,beamHeight]=b.frameBeam
  const fullColumnHeight=2*h
  // 首层外廊灰色楼板压沿下方另设一圈黄色装饰沿，与柱色一致。
  const firstFloorYellowEdgeHeight=.16
  // 外墙柱只向室外突出，室内侧与墙内皮齐平，避免在教室内形成凸柱。
  // 外柱内皮退到墙内皮之后，墙面成为唯一可见基层；原先两者完全齐平会产生整条闪面。
  const rearColumnZ=zNorth-(columnDepth-b.wall)/2-STRUCTURE_JOIN_GAP
  const sideColumnOffset=(columnWidth-b.wall)/2
  const edgeInset=edgeThickness/2
  // 二层楼梯井与建筑外边相连，不是封闭的内部孔洞；外放楼板时仍须直接切出两个贯通缺口。
  const upperFloorOutline=[
    [outerMin-structuralSlabOut,zNorth-structuralSlabOut],[outerMax+structuralSlabOut,zNorth-structuralSlabOut],
    [eastOuter+structuralSlabOut,roomFront],[eastOuter-5.24,roomFront],[eastOuter-5.24,roomFront+3],[eastOuter+structuralSlabOut,roomFront+3],
    [eastOuter+structuralSlabOut,wingSouth+slabOut],[eastInner-slabOut,wingSouth+slabOut],
    [eastInner-slabOut,zFront+b.chamfer],[eastInner-b.chamfer,zFront+slabOut],
    [westInner+b.chamfer,zFront+slabOut],[westInner+slabOut,zFront+b.chamfer],
    [westInner+slabOut,wingSouth+slabOut],[westOuter-structuralSlabOut,wingSouth+slabOut],
    [westOuter-structuralSlabOut,roomFront+3],[westOuter+5.24,roomFront+3],[westOuter+5.24,roomFront],[westOuter-structuralSlabOut,roomFront],
  ]
  // 首层基座与楼板在中央穿堂处分成左右两块；约5m门洞保持院地0.00m标高。
  const groundLeftOutline=[
    [outerMin-structuralSlabOut,zNorth-structuralSlabOut],[passageBaseLeft,zNorth-structuralSlabOut],[passageBaseLeft,zFront+slabOut],
    [westInner+b.chamfer,zFront+slabOut],[westInner+slabOut,zFront+b.chamfer],
    [westInner+slabOut,wingSouth+slabOut],[westOuter-structuralSlabOut,wingSouth+slabOut],
  ]
  const groundRightOutline=[
    [passageBaseRight,zNorth-structuralSlabOut],[outerMax+structuralSlabOut,zNorth-structuralSlabOut],[eastOuter+structuralSlabOut,wingSouth+slabOut],[eastInner-slabOut,wingSouth+slabOut],
    [eastInner-slabOut,zFront+b.chamfer],[eastInner-b.chamfer,zFront+slabOut],[passageBaseRight,zFront+slabOut],
  ]
  // 下层地台在中央通道两侧（包括门洞内）整条向中间挑出 0.25m；
  // 上层楼板继续使用 groundLeft/RightOutline，因而沿通道形成连续一级踏步。
  const portalSideStepProjection=.25
  const portalStepLeftEdge=passageBaseLeft+portalSideStepProjection
  const portalStepRightEdge=passageBaseRight-portalSideStepProjection
  const plinthLeftOutline=[
    [outerMin-structuralSlabOut,zNorth-structuralSlabOut],[portalStepLeftEdge,zNorth-structuralSlabOut],[portalStepLeftEdge,zFront+slabOut],
    [westInner+b.chamfer,zFront+slabOut],[westInner+slabOut,zFront+b.chamfer],
    [westInner+slabOut,wingSouth+slabOut],[westOuter-structuralSlabOut,wingSouth+slabOut],
  ]
  const plinthRightOutline=[
    [portalStepRightEdge,zNorth-structuralSlabOut],[outerMax+structuralSlabOut,zNorth-structuralSlabOut],[eastOuter+structuralSlabOut,wingSouth+slabOut],[eastInner-slabOut,wingSouth+slabOut],
    [eastInner-slabOut,zFront+b.chamfer],[eastInner-b.chamfer,zFront+slabOut],[portalStepRightEdge,zFront+slabOut],
  ]
  // 基座只到首层楼板底；旧实现让基座与 16cm 楼板在同一轮廓上整圈重叠，
  // 中央穿堂和外墙脚因此会出现连续条纹状 z-fighting。
  const plinthTop=base-b.slabThickness
  shapePlate('b1-left-plinth',plinthLeftOutline,0,mat.concrete,plinthTop)
  shapePlate('b1-right-plinth',plinthRightOutline,0,mat.concrete,plinthTop)
  addFoundationBottomOutline('building-1-west-plinth',plinthLeftOutline,.025)
  addFoundationBottomOutline('building-1-east-plinth',plinthRightOutline,.025)
  // 基座在走廊柱列下方向院内外挑，完整承托0.45m粗柱；中央穿堂缺口保持断开。
  const plinthOut=b.plinthOverhang
  const wingPlinthNorth=zFront+b.chamfer-plinthOut/2
  const wingPlinthSouth=wingSouth+plinthOut/2
  // 所有外挑地台统一止于楼板底：地台为 0–0.24m，首层楼板为 0.24–0.40m。
  // 两层只在水平分界面接触，不再有任何竖向体积重叠。
  const overhangHeight=plinthTop
  // 前沿承托块只补楼板挑边以外的 23cm，避免与已经推进的整条地台重复。
  const frontPlinthExtensionDepth=plinthOut-slabOut
  const frontPlinthExtensionZ=zFront+slabOut+frontPlinthExtensionDepth/2
  box('b1-left-main-plinth-overhang',[portalStepLeftEdge-outerMin,overhangHeight,frontPlinthExtensionDepth],[(outerMin+portalStepLeftEdge)/2,overhangHeight/2,frontPlinthExtensionZ],mat.concrete)
  box('b1-right-main-plinth-overhang',[outerMax-portalStepRightEdge,overhangHeight,frontPlinthExtensionDepth],[(portalStepRightEdge+outerMax)/2,overhangHeight/2,frontPlinthExtensionZ],mat.concrete)
  const portalSideStepDepth=zFront+plinthOut-(zNorth-structuralSlabOut)
  const portalSideStepZ=(zNorth-structuralSlabOut+zFront+plinthOut)/2
  addWalkRect('b1-left-portal-side-step-walk',[(passageBaseLeft+portalStepLeftEdge)/2,portalSideStepZ],[portalStepLeftEdge-passageBaseLeft,portalSideStepDepth],overhangHeight)
  addWalkRect('b1-right-portal-side-step-walk',[(portalStepRightEdge+passageBaseRight)/2,portalSideStepZ],[passageBaseRight-portalStepRightEdge,portalSideStepDepth],overhangHeight)
  box('b1-west-wing-plinth-overhang',[plinthOut,overhangHeight,wingPlinthSouth-wingPlinthNorth],[westInner+plinthOut/2,overhangHeight/2,(wingPlinthNorth+wingPlinthSouth)/2],mat.concrete)
  box('b1-east-wing-plinth-overhang',[plinthOut,overhangHeight,wingPlinthSouth-wingPlinthNorth],[eastInner-plinthOut/2,overhangHeight/2,(wingPlinthNorth+wingPlinthSouth)/2],mat.concrete)
  for(let f=0;f<2;f++) {
    const y=base+f*h
    // 首层墙柱只承托到二楼楼板底；楼板厚度本身负责连接到二楼完成面。
    // 若首层墙柱仍按整层层高生成，其水平顶面会与二楼地面共面并形成闪带。
    const storeyStructureHeight=h-(f===0?b.slabThickness:0)
    // y 是本层完成面；ExtrudeGeometry 会沿 +Y 挤出，楼板底必须下移一个板厚，确保顶面正好落在 y。
    const slabBottomY=y-b.slabThickness
    if(f===0) {
      shapePlate('b1-left-ground-floor',groundLeftOutline,slabBottomY,mat.concrete,b.slabThickness)
      shapePlate('b1-right-ground-floor',groundRightOutline,slabBottomY,mat.concrete,b.slabThickness)
      addWalkPolygon('b1-left-ground-floor-walk',groundLeftOutline,y)
      addWalkPolygon('b1-right-ground-floor-walk',groundRightOutline,y)
    } else {
      shapePlate('b1-u-floor-2',upperFloorOutline,slabBottomY,mat.concrete,b.slabThickness)
      addWalkPolygon('b1-u-floor-2-walk',upperFloorOutline,y)
    }
    const rearOpen=[]
    for(const room of mainRooms) {
      if(f===0) rearOpen.push(
        {center:room.start+.9,width:b1Door.openingWidth,bottom:0,height:b1Door.height},
        {center:room.start+3.45,width:b1Window.rearWidth,bottom:b1Window.sill,height:b1Window.height},
        {center:room.start+5.55,width:b1Window.rearWidth,bottom:b1Window.sill,height:b1Window.height},
        {center:room.start+8.1,width:b1Door.openingWidth,bottom:0,height:b1Door.height},
      )
      else for(const offset of [1.35,3.45,5.55,7.65]) rearOpen.push({center:room.start+offset,width:b1Window.rearWidth,bottom:b1Window.sill,height:b1Window.height})
    }
    if(f===0) rearOpen.push({center:cx,width:b.centralOpening,bottom:0,height:h})
    else for(const direction of [-1,0,1]) rearOpen.push({
      center:cx+direction*b.centralRoomWindow.offset,
      width:b.centralRoomWindow.width,
      bottom:b1Window.sill,
      height:b1Window.height,
    })
    // 横墙越过左右端墙中心线各半个墙厚，外轮廓才能在墙角闭合为完整直角。
    wallX('b1-rear-wall',outerMin-b.wall/2,outerMax+b.wall/2,zNorth,y,storeyStructureHeight,mat.wall1,rearOpen,b.wall)
    // 走廊侧以教室模数的门—窗—窗—门占位；中央首层保留约5m通道。
    const frontOpen=[]
    for(const [roomIndex,room] of mainRooms.entries()) {
      // 主楼最外侧两间靠楼梯的一组走廊门窗取消；北立面门窗不受影响。
      if(roomIndex!==0) frontOpen.push(
        {center:room.start+.9,width:b1Door.openingWidth,bottom:0,height:b1Door.height},
        {center:room.start+3.45,width:b1Window.corridorWidth,bottom:b1Window.sill,height:b1Window.height},
      )
      if(roomIndex!==mainRooms.length-1) frontOpen.push(
        {center:room.start+5.55,width:b1Window.corridorWidth,bottom:b1Window.sill,height:b1Window.height},
        {center:room.start+8.1,width:b1Door.openingWidth,bottom:0,height:b1Door.height},
      )
    }
    if(f===0) frontOpen.push({center:cx,width:b.centralPortal.openingWidth,bottom:0,height:b.centralPortal.clearHeight-base})
    else {
      frontOpen.push({center:cx,width:b1Door.openingWidth,bottom:0,height:b1Door.height})
      for(const direction of [-1,1]) frontOpen.push({center:cx+direction*b.centralRoomWindow.offset,width:b.centralRoomWindow.width,bottom:b1Window.sill,height:b1Window.height})
    }
    wallX('b1-corridor-face',outerMin-b.wall/2,outerMax+b.wall/2,roomFront,y,storeyStructureHeight,mat.wall1,frontOpen,b.wall)
    // 一号楼正面外廊内侧为整条白色粉刷：教室外墙按门窗洞口分段贴白，
    // 顶棚则从墙内皮连续铺至走廊外缘。一、二层使用相同规则。
    const corridorInteriorWest=outerMin+b.wall/2
    const corridorInteriorEast=outerMax-b.wall/2
    const corridorCeilingY=f===0?y+h-b.slabThickness:y+h
    // 横向框架梁的可见梁底保持不变；首层梁顶只到二楼楼板底，不再插入
    // 楼板体积。白色包面则严格止于首层天花完成面，避免其顶面高出二楼
    // 地坪约 6mm，在每根梁轴线上形成横穿房间／走廊的白色闪带。
    const transverseBeamBottom=y+h-beamHeight-STRUCTURE_JOIN_GAP
    const transverseBeamHeight=beamHeight-(f===0?b.slabThickness:0)
    const transverseBeamCenterY=transverseBeamBottom+transverseBeamHeight/2
    const beamCasingBottom=transverseBeamBottom-FINISH_SURFACE_GAP
    const beamCasingTop=corridorCeilingY-FINISH_SURFACE_GAP
    const beamCasingHeight=beamCasingTop-beamCasingBottom
    const beamCasingCenterY=(beamCasingBottom+beamCasingTop)/2
    interiorWallX(
      `b1-main-corridor-inner-wall-white-finish-floor-${f+1}`,
      corridorInteriorWest,corridorInteriorEast,roomFront,y,corridorCeilingY-y,1,frontOpen,b.wall,
    )
    if(f===0) {
      // 楼梯紧贴主楼正面墙上行，首层和二层白色粉刷之间原先正好漏出
      // 0.16m 的楼板侧边。楼板边比墙面完成面退后约 0.14m，从楼梯斜看
      // 就是一整条凹槽。用独立的楼板带完成面补齐这段高度；上下边分别与
      // 两层墙面贴边相接，不与任何一层饰面共面重叠。
      interiorPanelX(
        'b1-main-corridor-floor-joint-white-finish',
        corridorInteriorWest,corridorInteriorEast,roomFront,
        corridorCeilingY,b.slabThickness,1,b.wall,
      )
    }
    // 首层主走廊天花不能横跨东西两端的楼梯井。旧的整张单面天花从下方
    // 看像悬空楼板，上到二层后又因背面剔除而消失；首层只铺两个洞口之间
    // 的中段。二层上方没有继续上行的楼梯，仍保留完整屋顶天花。
    const corridorCeilingWest=f===0?westOuter+5.24:corridorInteriorWest
    const corridorCeilingEast=f===0?eastOuter-5.24:corridorInteriorEast
    classroomCeiling(
      `b1-main-corridor-white-ceiling-floor-${f+1}`,
      corridorCeilingWest,corridorCeilingEast,roomFront+b.wall/2,zFront+slabOut,corridorCeilingY,
    )
    for(const [roomIndex,room] of mainRooms.entries()) {
      const [westWall,eastWall]=mainRoomSideWalls[roomIndex]
      const innerWest=westWall+b.wall/2,innerEast=eastWall-b.wall/2
      const innerNorth=zNorth+b.wall/2,innerSouth=roomFront-b.wall/2
      const rearRoomOpen=rearOpen.filter(o=>o.center>innerWest&&o.center<innerEast)
      const frontRoomOpen=frontOpen.filter(o=>o.center>innerWest&&o.center<innerEast)
      interiorWallX(`b1-room-${roomIndex+1}-rear-interior-floor-${f+1}`,innerWest,innerEast,zNorth,y,h,1,rearRoomOpen,b.wall)
      interiorWallX(`b1-room-${roomIndex+1}-front-interior-floor-${f+1}`,innerWest,innerEast,roomFront,y,h,-1,frontRoomOpen,b.wall)
      interiorWallZ(`b1-room-${roomIndex+1}-west-interior-floor-${f+1}`,innerNorth,innerSouth,westWall,y,h,1,[],b.wall)
      interiorWallZ(`b1-room-${roomIndex+1}-east-interior-floor-${f+1}`,innerNorth,innerSouth,eastWall,y,h,-1,[],b.wall)
      const ceilingY=f===0?y+h-b.slabThickness:y+h
      classroomCeiling(`b1-room-${roomIndex+1}-ceiling-floor-${f+1}`,innerWest,innerEast,innerNorth,innerSouth,ceilingY)
      const roomCenterZ=(innerNorth+innerSouth)/2
      // 一号楼主楼：西半部教室朝东授课，东半部教室朝西授课；
      // 两端墙都设黑板，但讲台只放在实际授课墙一侧。
      addClassroomFixtures(
        `b1-main-room-${roomIndex+1}-floor-${f+1}`,y,ceilingY,b.wall,
        [
          ['west',[westWall,roomCenterZ],[1,0]],
          ['east',[eastWall,roomCenterZ],[-1,0]],
        ],
        room.center<cx?'east':'west',
        [innerWest,innerEast,innerNorth,innerSouth],
      )
      const roomCultureId=`b1-main-room-${roomIndex+1}-floor-${f+1}`
      const teachingSide=room.center<cx?'east':'west'
      for(const [side,offset] of [['west',2.175],['east',6.825]])schoolEphemeraAnchors.b1Corridor.push({
        id:`${roomCultureId}-corridor-${side}`,roomId:roomCultureId,
        point:[room.start+offset,roomFront],normal:[0,1],offset:b.wall/2+FINISH_SURFACE_GAP+.003,
        floorY:y,centerHeight:1.58,size:[.384,.96],role:side===teachingSide?'front':'rear',
        doorDirection:side==='west'?[-1,0]:[1,0],
        office:classroomOfficeRooms.has(roomCultureId),category:'b1Corridor',group:`b1-main-floor-${f+1}`,
      })
      for(const x of corridorColumnXs) if(x>innerWest&&x<innerEast) {
        box(
          `b1-room-${roomIndex+1}-interior-beam-floor-${f+1}`,
          [beamWidth+2*FINISH_SURFACE_GAP,beamCasingHeight,innerSouth-innerNorth],
          [x,beamCasingCenterY,(innerNorth+innerSouth)/2],
          mat.interiorOverheadWhite,
        )
      }
      // 中央门洞两侧的框架梁恰好落在教室边界上，不能按“完全位于室内”筛选。
      // 只包白朝教室的半根梁，门洞通道一侧仍保留原有黄色外部结构色。
      const passageBoundaryBeam=roomIndex===1
        ?{x:central[0],direction:-1}
        :roomIndex===2?{x:central[1],direction:1}:null
      if(passageBoundaryBeam) {
        const casingWidth=beamWidth/2+2*FINISH_SURFACE_GAP
        box(
          `b1-room-${roomIndex+1}-passage-boundary-interior-beam-floor-${f+1}`,
          [casingWidth,beamCasingHeight,innerSouth-innerNorth],
          [passageBoundaryBeam.x+passageBoundaryBeam.direction*(beamWidth/4+FINISH_SURFACE_GAP/2),beamCasingCenterY,(innerNorth+innerSouth)/2],
          mat.interiorOverheadWhite,
        )
      }
    }
    if(f===0) {
      // 历史照片中的南向中央门面是一个通至一层顶部的整体凸出体，5m门洞从中挖出。
      const portal=b.centralPortal
      const portalFaceZ=roomFront+b.wall/2+portal.projection/2
      // 门洞正面整圈凸出门框同属白色粉刷范围，使用与穿堂内墙一致的白色，
      // 不再沿用偏暖的浅黄色外墙白。
      const portalFullHeight=y+storeyStructureHeight
      portalFacade('b1-central-portal-facade',portalLeft,portalRight,portalOpeningLeft,portalOpeningRight,portal.clearHeight,portalFullHeight,portalFaceZ,portal.projection,mat.interiorWhite)
      b1PortalSchoolName(cx,portal.clearHeight,portalFullHeight,portalFaceZ+portal.projection/2)
      // 真正凌空的是前、后横向墙面紧邻门洞的墙垛：基座缩回后需单独向下补到地面。
      // 南侧门洞的室内面必须一直补到 4.20m 门洞净边；若仍按后门 5m 开口收口，
      // 门垛靠通道内侧的墙脚会缺少 0.40m，形成用户指出的凹角。
      const rearPierBands=[[passageBaseLeft,passageOpeningLeft],[passageOpeningRight,passageBaseRight]]
      const frontPierBands=[[passageBaseLeft,portalOpeningLeft],[portalOpeningRight,passageBaseRight]]
      for(const [z,bands] of [[zNorth,rearPierBands],[roomFront,frontPierBands]]) for(const [x1,x2] of bands) {
        // 补块与上下墙体完全共面；描线几何轻微外扩，避免边线被相邻表面深度遮掉。
        box('b1-passage-face-pier-ground-fill',[x2-x1,base,b.wall],[(x1+x2)/2,base/2,z],mat.wall1,{collider:true,outlineScale:1.06})
      }
    }
    for(const [roomIndex,room] of mainRooms.entries()) {
      if(roomIndex!==0) {
        placeB1Asset('doorLeft',`b1-main-room-${roomIndex+1}-door-left-floor-${f+1}`,[room.start+.9,y,roomFront])
        placeB1Asset('windowCorridor',`b1-main-room-${roomIndex+1}-corridor-window-west-floor-${f+1}`,[room.start+3.45,y+b1Window.sill,roomFront])
      }
      if(roomIndex!==mainRooms.length-1) {
        placeB1Asset('windowCorridor',`b1-main-room-${roomIndex+1}-corridor-window-east-floor-${f+1}`,[room.start+5.55,y+b1Window.sill,roomFront])
        placeB1Asset('doorRight',`b1-main-room-${roomIndex+1}-door-right-floor-${f+1}`,[room.start+8.1,y,roomFront])
      }
      if(f===0) {
        // 北面首层完整保留两扇门；从北侧观察时左右铰链方向相反。
        placeB1Asset('doorRight',`b1-main-room-${roomIndex+1}-rear-door-west-floor-1`,[room.start+.9,y,zNorth],Math.PI)
        placeB1Asset('doorLeft',`b1-main-room-${roomIndex+1}-rear-door-east-floor-1`,[room.start+8.1,y,zNorth],Math.PI)
        b1RearDoorSteps(`b1-main-room-${roomIndex+1}-rear-door-west`,room.start+.9,zNorth,base,b.wall)
        b1RearDoorSteps(`b1-main-room-${roomIndex+1}-rear-door-east`,room.start+8.1,zNorth,base,b.wall)
        placeB1Asset('windowRear',`b1-main-room-${roomIndex+1}-rear-window-west-floor-1`,[room.start+3.45,y+b1Window.sill,zNorth],Math.PI)
        placeB1Asset('windowRear',`b1-main-room-${roomIndex+1}-rear-window-east-floor-1`,[room.start+5.55,y+b1Window.sill,zNorth],Math.PI)
      } else for(const [windowIndex,offset] of [1.35,3.45,5.55,7.65].entries()) {
        placeB1Asset('windowRear',`b1-main-room-${roomIndex+1}-rear-window-${windowIndex+1}-floor-2`,[room.start+offset,y+b1Window.sill,zNorth],Math.PI)
      }
    }
    if(f===1) {
      placeB1Asset('doorLeft','b1-central-room-door-floor-2',[cx,y,roomFront])
      const centralWindowScale=(b.centralRoomWindow.width-.02)/1.58
      for(const direction of [-1,1]) placeB1Asset(
        'windowCorridor',
        `b1-central-room-window-${direction<0?'west':'east'}-floor-2`,
        [cx+direction*b.centralRoomWindow.offset,y+b1Window.sill,roomFront],
        0,
        centralWindowScale,
      )
      const centralRearWindowScale=(b.centralRoomWindow.width-.02)/1.48
      for(const direction of [-1,0,1]) placeB1Asset(
        'windowRear',
        `b1-central-room-rear-window-${direction<0?'west':direction>0?'east':'center'}-floor-2`,
        [cx+direction*b.centralRoomWindow.offset,y+b1Window.sill,zNorth],
        Math.PI,
        centralRearWindowScale,
      )
    }
    // 四间主楼教室逐间封闭：隔墙只到教室前墙，不切断连续外廊。
    for(const x of classroomDividers) solidWallZ('b1-classroom-partition',zNorth,roomFront,x,y,storeyStructureHeight,mat.wall1,b.wall)
    // 中央穿堂／二层小房间两侧墙，以及主楼两端墙。
    // 中央小房间／首层穿堂的侧墙止于教室前墙线；1.5m 外廊内只保留前缘柱，不得伸墙阻断走廊。
    for(const x of centralWallCenters) solidWallZ('b1-central-side-wall',zNorth,roomFront,x,y,storeyStructureHeight,mat.wall1,b.wall)
    if(f===0) {
      // 中央门洞内部为白色粉刷空间；结构墙不改材质，只在通道侧增加独立饰面。
      // 饰面从0.40m地台完成面起，到二层楼板底止，保留下方水泥地台内圈。
      const passageInnerNorth=zNorth+b.wall/2
      const passageInnerSouth=roomFront-b.wall/2
      const passageFinishHeight=h-b.slabThickness
      interiorPanelZ('b1-passage-west-white-finish',passageInnerNorth,passageInnerSouth,centralWallCenters[0],y,passageFinishHeight,1,b.wall)
      interiorPanelZ('b1-passage-east-white-finish',passageInnerNorth,passageInnerSouth,centralWallCenters[1],y,passageFinishHeight,-1,b.wall)
      // 一号楼中央穿堂两侧各设一块公告／教学黑板。4.5m 宽，比标准教室黑板宽1m；
      // 沿通道方向居中，复用同一黑板与粉笔槽材质，不压缩中央通行净宽。
      const passageBoardCenterZ=(passageInnerNorth+passageInnerSouth)/2
      schoolEphemeraAnchors.passageGuide=addClassroomBlackboard(
        'b1-passage-west',
        [centralWallCenters[0],passageBoardCenterZ],[1,0],0,b.wall,{width:4.5,writable:false},
      )
      schoolEphemeraAnchors.passageDevelopment=addClassroomBlackboard(
        'b1-passage-east',
        [centralWallCenters[1],passageBoardCenterZ],[-1,0],0,b.wall,{width:4.5,writable:false},
      )
      // 两端门洞的墙垛同样属于穿堂内墙。此前只处理纵向侧墙，导致从通道内
      // 正对门洞时，开口左右仍露出黄色结构基层。饰面仅贴向通道的一侧，
      // 并从完成面以上起铺，地台内圈继续保留水泥材质。
      interiorWallX(
        'b1-passage-north-opening-white-finish',
        passageBaseLeft,passageBaseRight,zNorth,y,passageFinishHeight,1,
        [{center:cx,width:b.centralOpening,bottom:0,height:h}],b.wall,
      )
      interiorWallX(
        'b1-passage-south-opening-white-finish',
        passageBaseLeft,passageBaseRight,roomFront,y,passageFinishHeight,-1,
        [{center:cx,width:b.centralPortal.openingWidth,bottom:0,height:b.centralPortal.clearHeight-base}],b.wall,
      )
      // 门洞厚度产生的左右内口也需粉白；wallThickness=0 让饰面只向开口内
      // 偏移 FINISH_SURFACE_GAP，不会把位置误算到墙体半厚之外。
      const northRevealNear=zNorth-b.wall/2
      const southRevealFar=roomFront+b.wall/2+b.centralPortal.projection
      interiorPanelZ('b1-passage-north-opening-west-reveal-white-finish',northRevealNear,passageInnerNorth,passageOpeningLeft,y,passageFinishHeight,1,0)
      interiorPanelZ('b1-passage-north-opening-east-reveal-white-finish',northRevealNear,passageInnerNorth,passageOpeningRight,y,passageFinishHeight,-1,0)
      interiorPanelZ('b1-passage-south-opening-west-reveal-white-finish',passageInnerSouth,southRevealFar,portalOpeningLeft,y,b.centralPortal.clearHeight-base,1,0)
      interiorPanelZ('b1-passage-south-opening-east-reveal-white-finish',passageInnerSouth,southRevealFar,portalOpeningRight,y,b.centralPortal.clearHeight-base,-1,0)
      classroomCeiling('b1-passage-south-opening-soffit-white-finish',portalOpeningLeft,portalOpeningRight,passageInnerSouth,southRevealFar,b.centralPortal.clearHeight)
      classroomCeiling('b1-passage-white-ceiling',passageBaseLeft,passageBaseRight,passageInnerNorth,passageInnerSouth,y+h-b.slabThickness)
    } else {
      // 二层中央房间是独立的白色粉刷室内：四面墙按实际门窗洞口收边，
      // 天花覆盖完整净空；结构墙仍保留原材质，饰面继续使用独立防闪面偏移。
      const centralRoomInnerWest=passageBaseLeft
      const centralRoomInnerEast=passageBaseRight
      const centralRoomInnerNorth=zNorth+b.wall/2
      const centralRoomInnerSouth=roomFront-b.wall/2
      const centralRearOpen=rearOpen.filter(o=>o.center>centralRoomInnerWest&&o.center<centralRoomInnerEast)
      const centralFrontOpen=frontOpen.filter(o=>o.center>centralRoomInnerWest&&o.center<centralRoomInnerEast)
      interiorWallX('b1-central-room-rear-white-finish-floor-2',centralRoomInnerWest,centralRoomInnerEast,zNorth,y,h,1,centralRearOpen,b.wall)
      interiorWallX('b1-central-room-front-white-finish-floor-2',centralRoomInnerWest,centralRoomInnerEast,roomFront,y,h,-1,centralFrontOpen,b.wall)
      interiorPanelZ('b1-central-room-west-white-finish-floor-2',centralRoomInnerNorth,centralRoomInnerSouth,centralWallCenters[0],y,h,1,b.wall)
      interiorPanelZ('b1-central-room-east-white-finish-floor-2',centralRoomInnerNorth,centralRoomInnerSouth,centralWallCenters[1],y,h,-1,b.wall)
      classroomCeiling('b1-central-room-white-ceiling-floor-2',centralRoomInnerWest,centralRoomInnerEast,centralRoomInnerNorth,centralRoomInnerSouth,y+h)
    }
    for(const x of [outerMin,outerMax]) solidWallZ('b1-main-end-wall',zNorth-b.wall/2,roomFront+b.wall/2,x,y,storeyStructureHeight,mat.wall1,b.wall)
    if(f===1) railX('b1-upper-continuous',westInner+b.chamfer,eastInner-b.chamfer,y,zFront+.08,'b1')
    else {
      railX('b1-lower-west',westInner+b.chamfer,central[0],y,zFront+.08,'b1'); railX('b1-lower-east',central[1],eastInner-b.chamfer,y,zFront+.08,'b1')
      // 中央门洞前的栏杆缺口两端以实体竖边收口，避免上下横梁悬空。
      for(const x of central) box('b1-central-railing-opening-end',[.08,.9,.12],[x,y+.57,zFront+.08],mat.rail,{shadow:false})
      const mainPlanterOffset=b.plinthOverhang-.08+b.flowerBed.foundationGap
      planterX('b1-flower-bed-main-west',westInner+b.chamfer,central[0],zFront+.08,1,b.flowerBed,mainPlanterOffset)
      planterX('b1-flower-bed-main-east',central[1],eastInner-b.chamfer,zFront+.08,1,b.flowerBed,mainPlanterOffset)
    }
    railDiagonal('b1-west-chamfer-rail',[westInner+b.chamfer,zFront+.08],[westInner,zFront+b.chamfer],y,'b1')
    railDiagonal('b1-east-chamfer-rail',[eastInner-b.chamfer,zFront+.08],[eastInner,zFront+b.chamfer],y,'b1')
    // 每层顶部沿走廊外缘设置20×20cm连续压沿／边梁。
    const edgeTop=y+h
    // 首层边梁原本顶到二楼完成面，顶面与二楼楼板共面，沿整条教室前廊产生
    // 锯齿闪带。首层统一退到完成面以下一个结构缝；二层上方没有相邻楼板，
    // 仍保持原标高。正面、倒角和两翼全部使用同一规则。
    const corridorEdgeTop=edgeTop-(f===0?STRUCTURE_JOIN_GAP:0)
    const corridorEdgeMaterial=f===1?mat.wall2:mat.concrete
    box('b1-main-corridor-top-edge',[eastInner-westInner-2*b.chamfer,edgeHeight,edgeThickness],[(westInner+eastInner)/2,corridorEdgeTop-edgeHeight/2,zFront+slabOut-edgeInset],corridorEdgeMaterial)
    if(f===0) {
      // 北侧中央门洞顶部需要的是与墙面齐平的横向压沿／边梁，并非向外挑出的檐口。
      // 它属于北墙缺失部分：材质与两侧墙相同，宽度严格等于门洞净宽；
      // 顶部只接触二层楼板底面、左右只接触墙端面，不再互相穿入产生闪面。
      const northPortalTopEdgeWidth=b.centralOpening
      const northPortalTopEdgeHeight=beamHeight
      const northPortalTopEdgeY=edgeTop-b.slabThickness-northPortalTopEdgeHeight/2
      box('b1-north-portal-top-edge',[northPortalTopEdgeWidth,northPortalTopEdgeHeight,b.wall],[cx,northPortalTopEdgeY,zNorth],mat.wall1)
      interiorPanelX('b1-north-portal-top-edge-white-finish',passageOpeningLeft,passageOpeningRight,zNorth,northPortalTopEdgeY-northPortalTopEdgeHeight/2,northPortalTopEdgeHeight,1,b.wall)
      classroomCeiling('b1-north-portal-top-edge-soffit-white-finish',passageOpeningLeft,passageOpeningRight,zNorth-b.wall/2,zNorth+b.wall/2,northPortalTopEdgeY-northPortalTopEdgeHeight/2)
    }
    edgeBandDiagonal('b1-west-chamfer-top-edge',[westInner+b.chamfer,zFront+slabOut-edgeInset],[westInner+slabOut-edgeInset,zFront+b.chamfer],corridorEdgeTop,[edgeHeight,edgeThickness],corridorEdgeMaterial)
    edgeBandDiagonal('b1-east-chamfer-top-edge',[eastInner-b.chamfer,zFront+slabOut-edgeInset],[eastInner-slabOut+edgeInset,zFront+b.chamfer],corridorEdgeTop,[edgeHeight,edgeThickness],corridorEdgeMaterial)
    if(f===0) {
      // 正面与两个倒角补齐黄色连续沿；其顶部停在灰色压沿下方，二者只留
      // 结构收口缝而不发生体积重叠。
      const yellowEdgeTop=corridorEdgeTop-edgeHeight-STRUCTURE_JOIN_GAP
      box(
        'b1-first-floor-main-corridor-yellow-edge',
        [eastInner-westInner-2*b.chamfer,firstFloorYellowEdgeHeight,edgeThickness],
        [(westInner+eastInner)/2,yellowEdgeTop-firstFloorYellowEdgeHeight/2,zFront+slabOut-edgeInset],
        mat.wall2,
      )
      edgeBandDiagonal(
        'b1-first-floor-west-chamfer-yellow-edge',
        [westInner+b.chamfer,zFront+slabOut-edgeInset],[westInner+slabOut-edgeInset,zFront+b.chamfer],
        yellowEdgeTop,[firstFloorYellowEdgeHeight,edgeThickness],mat.wall2,
      )
      edgeBandDiagonal(
        'b1-first-floor-east-chamfer-yellow-edge',
        [eastInner-b.chamfer,zFront+slabOut-edgeInset],[eastInner-slabOut+edgeInset,zFront+b.chamfer],
        yellowEdgeTop,[firstFloorYellowEdgeHeight,edgeThickness],mat.wall2,
      )
    }
    // 走廊柱由循环外的通高构件生成；这里只生成每层横梁。
    for(const x of corridorColumnXs) {
      box('b1-transverse-frame-beam',[beamWidth,transverseBeamHeight,zFront-rearColumnZ],[x,transverseBeamCenterY,(rearColumnZ+zFront)/2],mat.wall2)
    }
  }
  // 柱子是贯穿两层的单一结构件，直接穿过层间楼板；不能按楼层截断，
  // 否则楼板厚度会在立面上形成一段明显的空白带。
  for(const x of corridorColumnXs) box('b1-corridor-column',[columnWidth,fullColumnHeight,columnDepth],[x,base+fullColumnHeight/2,zFront],mat.wall2,{collider:true})
  for(const x of rearColumnXs) box('b1-rear-column',[columnWidth,fullColumnHeight,columnDepth],[x,base+fullColumnHeight/2,rearColumnZ],mat.wall2,{collider:true})
  // 左右两组教室各自在两间教室的分隔线补柱；中央门洞正中不设柱。
  for(const x of classroomDividers) box('b1-rear-classroom-divider-column',[columnWidth,fullColumnHeight,columnDepth],[x,base+fullColumnHeight/2,rearColumnZ],mat.wall2,{collider:true})
  // 左右端角柱同时向侧墙外侧偏移，使两个室内面都不凸入教室。
  box('b1-rear-west-corner-column',[columnWidth,fullColumnHeight,columnDepth],[outerMin-sideColumnOffset,base+fullColumnHeight/2,rearColumnZ],mat.wall2,{collider:true})
  box('b1-rear-east-corner-column',[columnWidth,fullColumnHeight,columnDepth],[outerMax+sideColumnOffset,base+fullColumnHeight/2,rearColumnZ],mat.wall2,{collider:true})
  // 两翼教室将同一门窗规则旋转90°；北侧约3m留给折返楼梯。
  for(const [side,wing] of Object.entries(b.wings)) {
    const [wx,wz]=wing.center,[ww,wd]=wing.size, innerX=side==='west'?wx+ww/2:wx-ww/2
    const outerX=side==='west'?wx-ww/2:wx+ww/2
    const outerColumnX=outerX+(side==='west'?-1:1)*((columnWidth-b.wall)/2+STRUCTURE_JOIN_GAP)
    const roomFaceX=side==='west'?innerX-b.corridor:innerX+b.corridor
    // 楼梯北侧紧贴横向教室前墙，翼部教室再紧贴楼梯南侧。
    const roomNorth=roomFront+3,roomSouth=wz+wd/2,roomWidth=ww-b.corridor
    // 两翼南侧教室的北端框架轴原先落在几何中点，柱边会吃进相邻窗框
    // 约 16.5cm。整条轴线（内外两根柱及每层横梁）统一向北移 20cm，
    // 使柱与窗框恢复约 3.5cm 的净缝，同时保持梁柱严格同轴。
    const southClassroomFrameZ=(roomNorth+roomSouth)/2-.2
    const wingFrameZs=[roomNorth,southClassroomFrameZ,roomSouth]
    const roomCenterX=(outerX+roomFaceX)/2
    // 首层翼部入口位于第一根柱的教室门一侧：柱保留，栏杆从柱南面起断开1.50m。
    const entryGapStart=roomNorth+columnDepth/2
    const entryGapEnd=entryGapStart+b.wingEntry.width
    const entryCenterZ=(entryGapStart+entryGapEnd)/2
    // 入口缺口两端使用比上下横梁更粗的暖白实体柱：18cm方柱从水泥地面
    // 起步，柱顶比上横梁顶面高5cm。北端紧邻 roomNorth 结构柱，因此对应
    // 栏杆按端柱半宽9cm＋2cm施工缝回收，避免实体和描边重新进入结构柱。
    const entryRailingPostSize=.18
    const entryRailingPostHeight=1.12
    const entryRailColumnClearance=entryRailingPostSize/2+.02
    const entryRailNorthEnd=entryGapStart-entryRailColumnClearance
    const courtyardDirection=side==='west'?1:-1
    // 楼梯外墙处在二层楼板的贯通洞口边，不能再依靠楼板遮挡上下两段墙的
    // 对接缝。改为从首层完成面一直贯通到屋顶底面的单体墙；南北端各嵌入
    // 相邻横墙 12mm，封住斜视角下会透出天空的角缝。首层储物门仍只开在
    // 墙体下部，门洞上方由同一块墙连续封闭。
    const stairDoorZ=roomFront+2.15
    const stairWallOpen=[{center:stairDoorZ,width:.92,bottom:0,height:1.5}]
    wallZ(
      `b1-${side}-stair-exterior-wall`,
      roomFront-b.wall/2-STRUCTURE_JOIN_GAP,roomNorth+b.wall/2+STRUCTURE_JOIN_GAP,
      outerX,base,fullColumnHeight,mat.wall1,stairWallOpen,b.wall,
    )
    // 楼梯间侧只显示白色粉刷，保留墙体外侧原有立面颜色。饰面沿门洞分段，
    // 因此不会用一张整面板把首层储物门重新封住。
    interiorWallZ(
      `b1-${side}-stair-exterior-wall-white-finish`,
      roomFront-b.wall/2-STRUCTURE_JOIN_GAP,roomNorth+b.wall/2+STRUCTURE_JOIN_GAP,
      outerX,base,fullColumnHeight,side==='west'?1:-1,stairWallOpen,b.wall,
    )
    box(
      `b1-${side}-under-stair-door`,[.07,1.42,.84],
      [outerX+(side==='west'?-.16:.16),base+.71,stairDoorZ],mat.wood,
    )
    // 楼梯另一侧的北端横墙同样跨过楼板洞口，使用一整块通高墙消除层间
    // 接缝。原先上下两块墙在黄色横梁处交接，横梁又比墙厚 1cm，斜看会
    // 形成一条贯通的凹槽／色带。
    box(
      `b1-${side}-north-end-wall`,[roomWidth+b.wall,fullColumnHeight,b.wall],
      [roomCenterX,base+fullColumnHeight/2,roomNorth],mat.wall1,{collider:true},
    )
    interiorPanelX(
      `b1-${side}-north-end-wall-white-finish`,
      roomCenterX-(roomWidth+b.wall)/2,roomCenterX+(roomWidth+b.wall)/2,
      roomNorth,base,fullColumnHeight,-1,b.wall,
    )
    // 楼梯间墙体不仅正面需要粉白，墙厚在门口／转角处露出的端面也属于
    // 室内可见面。用零墙厚饰面贴到实体端面外侧，避免改动外立面材质，
    // 同时以 FINISH_SURFACE_GAP 与基层错开，消除共面闪动。
    const stairMainEndX=side==='west'?outerMin-b.wall/2:outerMax+b.wall/2
    interiorPanelZ(
      `b1-${side}-stair-main-wall-reveal-white-finish`,
      roomFront-b.wall/2,roomFront+b.wall/2,stairMainEndX,
      base,fullColumnHeight,side==='west'?-1:1,0,
    )
    const stairOuterWallEndZ=roomFront-b.wall/2-STRUCTURE_JOIN_GAP
    interiorPanelX(
      `b1-${side}-stair-outer-wall-end-white-finish`,
      outerX-b.wall/2,outerX+b.wall/2,stairOuterWallEndZ,
      base,fullColumnHeight,-1,0,
    )
    const stairNorthWallInnerEndX=side==='west'
      ?roomCenterX+(roomWidth+b.wall)/2
      :roomCenterX-(roomWidth+b.wall)/2
    interiorPanelZ(
      `b1-${side}-stair-north-wall-end-white-finish`,
      roomNorth-b.wall/2,roomNorth+b.wall/2,stairNorthWallInnerEndX,
      base,fullColumnHeight,side==='west'?1:-1,0,
    )
    // 二层主走廊白色天花只到走廊外缘，楼梯折返平台上方余下约1.3m
    // 曾直接露出屋面板的褐色底面。补片只覆盖这段互补区间，边界与既有
    // 天花端面对接而不重叠；东西楼梯使用相同的白色顶棚规则。
    const stairHoleInnerX=outerX+(side==='west'?5.24:-5.24)
    const stairCeilingWest=Math.min(outerX+b.wall/2,stairHoleInnerX)
    const stairCeilingEast=Math.max(outerX-b.wall/2,stairHoleInnerX)
    const stairCeilingNorth=zFront+slabOut
    const stairCeilingSouth=roomNorth-b.wall/2
    classroomCeiling(
      `b1-${side}-stairwell-white-ceiling`,
      stairCeilingWest,stairCeilingEast,
      stairCeilingNorth,stairCeilingSouth,base+fullColumnHeight,
    )
    for(let f=0;f<2;f++) {
      const y=base+f*h
      const storeyStructureHeight=h-(f===0?b.slabThickness:0)
      const corridorOpen=[
        {center:roomNorth+.9,width:b1Door.openingWidth,bottom:0,height:b1Door.height},
        {center:roomNorth+3.45,width:b1Window.corridorWidth,bottom:b1Window.sill,height:b1Window.height},
        {center:roomNorth+5.55,width:b1Window.corridorWidth,bottom:b1Window.sill,height:b1Window.height},
        {center:roomNorth+8.1,width:b1Door.openingWidth,bottom:0,height:b1Door.height},
      ]
      const outerOpen=[1.35,3.45,5.55,7.65].map(offset=>({center:roomNorth+offset,width:b1Window.rearWidth,bottom:b1Window.sill,height:b1Window.height}))
      wallZ(`b1-${side}-corridor-face`,roomNorth-b.wall/2,roomSouth+b.wall/2,roomFaceX,y,storeyStructureHeight,mat.wall1,corridorOpen,b.wall)
      wallZ(`b1-${side}-outer-face`,roomNorth-b.wall/2,roomSouth+b.wall/2,outerX,y,storeyStructureHeight,mat.wall1,outerOpen,b.wall)
      // 南端墙仍按普通教室墙处理；北端楼梯墙已在楼层循环外以通高单体封闭。
      box(`b1-${side}-south-end-wall`,[roomWidth+b.wall,storeyStructureHeight,b.wall],[roomCenterX,y+storeyStructureHeight/2,roomSouth],mat.wall1,{collider:true})
      const classroomWest=Math.min(outerX,roomFaceX)+b.wall/2
      const classroomEast=Math.max(outerX,roomFaceX)-b.wall/2
      const classroomNorth=roomNorth+b.wall/2,classroomSouth=roomSouth-b.wall/2
      const corridorFacingX=side==='west'?-1:1
      const outerFacingX=-corridorFacingX
      interiorWallZ(`b1-${side}-room-corridor-interior-floor-${f+1}`,classroomNorth,classroomSouth,roomFaceX,y,h,corridorFacingX,corridorOpen,b.wall)
      interiorWallZ(`b1-${side}-room-outer-interior-floor-${f+1}`,classroomNorth,classroomSouth,outerX,y,h,outerFacingX,outerOpen,b.wall)
      interiorWallX(`b1-${side}-room-north-interior-floor-${f+1}`,classroomWest,classroomEast,roomNorth,y,h,1,[],b.wall)
      interiorWallX(`b1-${side}-room-south-interior-floor-${f+1}`,classroomWest,classroomEast,roomSouth,y,h,-1,[],b.wall)
      const wingCeilingY=f===0?y+h-b.slabThickness:y+h
      const transverseBeamBottom=y+h-beamHeight-STRUCTURE_JOIN_GAP
      const transverseBeamHeight=beamHeight-(f===0?b.slabThickness:0)
      const transverseBeamCenterY=transverseBeamBottom+transverseBeamHeight/2
      const beamCasingBottom=transverseBeamBottom-FINISH_SURFACE_GAP
      const beamCasingTop=wingCeilingY-FINISH_SURFACE_GAP
      const beamCasingHeight=beamCasingTop-beamCasingBottom
      const beamCasingCenterY=(beamCasingBottom+beamCasingTop)/2
      classroomCeiling(`b1-${side}-room-ceiling-floor-${f+1}`,classroomWest,classroomEast,classroomNorth,classroomSouth,wingCeilingY)
      // 两翼教室的前后黑板位于南、北端墙；授课面统一在北墙。
      // 讲台随北墙布置，学生桌椅由北向南排开并面向北侧黑板。
      addClassroomFixtures(
        `b1-${side}-wing-room-floor-${f+1}`,y,wingCeilingY,b.wall,
        [
          ['north',[roomCenterX,roomNorth],[0,1]],
          ['south',[roomCenterX,roomSouth],[0,-1]],
        ],
        'north',
        [classroomWest,classroomEast,classroomNorth,classroomSouth],
      )
      // 左右两翼外廊与主楼正面外廊采用同一白色粉刷规则：门窗侧墙面朝
      // 走廊的一面贴白，顶棚覆盖教室段的完整走廊宽度与一、二层。
      const wingCorridorFacingX=-corridorFacingX
      const wingRoomCultureId=`b1-${side}-wing-room-floor-${f+1}`
      for(const [doorSide,offset] of [['north',2.175],['south',6.825]])schoolEphemeraAnchors.b1Corridor.push({
        id:`${wingRoomCultureId}-corridor-${doorSide}`,roomId:wingRoomCultureId,
        point:[roomFaceX,roomNorth+offset],normal:[wingCorridorFacingX,0],offset:b.wall/2+FINISH_SURFACE_GAP+.003,
        floorY:y,centerHeight:1.58,size:[.48,1.20],role:doorSide==='north'?'front':'rear',
        doorDirection:doorSide==='north'?[0,-1]:[0,1],
        office:classroomOfficeRooms.has(wingRoomCultureId),category:'b1Corridor',group:`b1-${side}-wing-floor-${f+1}`,
      })
      interiorWallZ(
        `b1-${side}-corridor-inner-wall-white-finish-floor-${f+1}`,
        classroomNorth,classroomSouth,roomFaceX,y,wingCeilingY-y,wingCorridorFacingX,corridorOpen,b.wall,
      )
      const wingCorridorOuterX=innerX+courtyardDirection*slabOut
      const wingCorridorWallX=roomFaceX+wingCorridorFacingX*b.wall/2
      classroomCeiling(
        `b1-${side}-corridor-white-ceiling-floor-${f+1}`,
        Math.min(wingCorridorWallX,wingCorridorOuterX),Math.max(wingCorridorWallX,wingCorridorOuterX),
        classroomNorth,roomSouth+slabOut,wingCeilingY,
      )
      // 主楼走廊天花止于 zFront 外缘，翼楼走廊天花从 classroomNorth 才
      // 开始；两者之间的楼梯—翼廊转接楼板底原先没有粉刷面，首层和二层
      // 都会露出一块灰黑矩形。用独立暖白天花补齐这段实际存在的水平楼板，
      // x 方向从楼梯洞内边界接到翼廊墙内皮，四边只作端面对接而不重叠。
      const stairJunctionInnerX=outerX+(side==='west'?5.24:-5.24)
      classroomCeiling(
        `b1-${side}-stair-corridor-junction-white-ceiling-floor-${f+1}`,
        Math.min(stairJunctionInnerX,wingCorridorWallX),Math.max(stairJunctionInnerX,wingCorridorWallX),
        zFront+slabOut,classroomNorth,wingCeilingY,
      )
      box(
        `b1-${side}-room-interior-beam-floor-${f+1}`,
        [classroomEast-classroomWest,beamCasingHeight,beamWidth+2*FINISH_SURFACE_GAP],
        // 室内白色包面必须跟随南教室框架轴同步北移；继续留在原中线会让
        // 已移动的黄色结构梁从包面南边露出一条色带。
        [(classroomWest+classroomEast)/2,beamCasingCenterY,southClassroomFrameZ],
        mat.interiorOverheadWhite,
      )
      const corridorWallCenterX=roomFaceX
      const corridorRotation=side==='west'?Math.PI/2:-Math.PI/2
      const northDoorType=side==='west'?'doorRight':'doorLeft'
      const southDoorType=side==='west'?'doorLeft':'doorRight'
      placeB1Asset(northDoorType,`b1-${side}-room-door-north-floor-${f+1}`,[corridorWallCenterX,y,roomNorth+.9],corridorRotation)
      placeB1Asset(southDoorType,`b1-${side}-room-door-south-floor-${f+1}`,[corridorWallCenterX,y,roomNorth+8.1],corridorRotation)
      for(const [windowIndex,offset] of [3.45,5.55].entries()) placeB1Asset(
        'windowCorridor',
        `b1-${side}-room-corridor-window-${windowIndex+1}-floor-${f+1}`,
        [corridorWallCenterX,y+b1Window.sill,roomNorth+offset],
        corridorRotation,
      )
      const outerWallCenterX=outerX
      const outerRotation=side==='west'?-Math.PI/2:Math.PI/2
      for(const [windowIndex,offset] of [1.35,3.45,5.55,7.65].entries()) placeB1Asset(
        'windowRear',
        `b1-${side}-room-outer-window-${windowIndex+1}-floor-${f+1}`,
        [outerWallCenterX,y+b1Window.sill,roomNorth+offset],
        outerRotation,
      )
      if(f===0) {
        railZ(`b1-${side}-rail-north`,zFront+b.chamfer,entryRailNorthEnd,y,innerX,'b1')
        railZ(`b1-${side}-rail-south`,entryGapEnd,roomSouth,y,innerX,'b1')
        // 两翼首层入口缺口的南北两端均设置落地并略高于上横梁的暖白实体柱。
        for(const z of [entryRailNorthEnd,entryGapEnd]) box(
          `b1-${side}-wing-entry-railing-end`,
          [entryRailingPostSize,entryRailingPostHeight,entryRailingPostSize],
          [innerX,y+entryRailingPostHeight/2,z],
          mat.b2RailWarmWhite,{shadow:false},
        )
        const wingPlanterOffset=b.plinthOverhang+b.flowerBed.foundationGap
        planterZ(`b1-${side}-flower-bed-south`,entryGapEnd,roomSouth,innerX,courtyardDirection,b.flowerBed,wingPlanterOffset)
        wingEntrySteps(`b1-${side}-wing-entry`,innerX+courtyardDirection*slabOut,entryCenterZ,base,courtyardDirection,b.wingEntry.width,b.wingEntry.steps)
      } else railZ(`b1-${side}-rail`,zFront+b.chamfer,roomSouth,y,innerX,'b1')
      // 两翼朝校门的走廊端头同样封栏，与内侧纵向栏杆在南端闭合。
      railX(`b1-${side}-south-end-rail`,Math.min(roomFaceX,innerX),Math.max(roomFaceX,innerX),y,roomSouth+.08,'b1')
      const edgeTop=y+h
      const corridorEdgeTop=edgeTop-(f===0?STRUCTURE_JOIN_GAP:0)
      const edgeX=side==='west'?innerX+slabOut-edgeInset:innerX-slabOut+edgeInset
      const corridorEdgeMaterial=f===1?mat.wall2:mat.concrete
      box(`b1-${side}-corridor-top-edge`,[edgeThickness,edgeHeight,roomSouth-(zFront+b.chamfer)+slabOut-edgeInset],[edgeX,corridorEdgeTop-edgeHeight/2,(zFront+b.chamfer+roomSouth+slabOut-edgeInset)/2],corridorEdgeMaterial)
      box(`b1-${side}-south-top-edge`,[Math.abs(roomFaceX-edgeX),edgeHeight,edgeThickness],[(roomFaceX+edgeX)/2,corridorEdgeTop-edgeHeight/2,roomSouth+slabOut-edgeInset],corridorEdgeMaterial)
      if(f===0) {
        // 两翼朝院内的长边续接正面黄色沿；南端已有黄色横向框架梁，不再
        // 重复叠加一根同位置构件。
        const yellowEdgeTop=corridorEdgeTop-edgeHeight-STRUCTURE_JOIN_GAP
        box(
          `b1-${side}-first-floor-inner-yellow-edge`,
          [edgeThickness,firstFloorYellowEdgeHeight,roomSouth-(zFront+b.chamfer)+slabOut-edgeInset],
          [edgeX,yellowEdgeTop-firstFloorYellowEdgeHeight/2,(zFront+b.chamfer+roomSouth+slabOut-edgeInset)/2],
          mat.wall2,
        )
      }
      // 三组翼部框架柱分别对齐教室北墙、调整后的南教室框架轴和南墙；
      // 倒角斜边本身没有柱。
      for(const z of wingFrameZs) {
        // 北端梁埋在楼梯横墙内，厚度收进两侧墙皮，不能再从楼梯间露成横槽。
        const transverseBeamDepth=z===roomNorth?b.wall-2*STRUCTURE_JOIN_GAP:beamWidth
        box('b1-wing-transverse-frame-beam',[Math.abs(innerX-outerColumnX),transverseBeamHeight,transverseBeamDepth],[(innerX+outerColumnX)/2,transverseBeamCenterY,z],mat.wall2)
      }
    }
    // 两翼柱同样使用通高单体，消除首层与二层之间的断口和水平描边。
    for(const z of wingFrameZs) {
      box('b1-wing-inner-column',[columnWidth,fullColumnHeight,columnDepth],[innerX,base+fullColumnHeight/2,z],mat.wall2,{collider:true})
      box('b1-wing-outer-column',[columnWidth,fullColumnHeight,columnDepth],[outerColumnX,base+fullColumnHeight/2,z],mat.wall2,{collider:true})
    }
  }
  shapePlate('b1-u-roof',uOutline,base+2*h+.1,mat.schoolRoofConcrete,.2)
  shapePlate('b1-u-insulation-plane',insulationOutline,base+2*h+.42,mat.roof,.1)
  // 两处楼梯位于主楼两端与翼楼教室之间，梯段横向并左右镜像。
  createB1Staircase('b1-west-stair',westOuter,westOuter+5.24,roomFront,base,h)
  createB1Staircase('b1-east-stair',eastOuter,eastOuter-5.24,roomFront,base,h)
  addLabel('1号教学楼 · 2层 · A/B',[cx,9.2,cz])
}

function createSteps(name,x,z,base,height,count,dir=1) {
  for(let i=0;i<count;i++) {
    const top=base+(i+1)*height/count
    box(name,[1.2,top-base,.28],[x+dir*.65,base+(top-base)/2,z-i*.28],mat.concrete)
  }
  box(`${name}-landing`,[2.7,.16,1.2],[x,base+height/2,z-count*.28-.45],mat.concrete)
  for(let i=0;i<count;i++) {
    const top=base+height/2+(i+1)*height/(2*count)
    box(name,[1.2,top-(base+height/2),.28],[x-dir*.65,base+height/2+(top-base-height/2)/2,z-(count-i)*.28],mat.concrete)
  }
}

function b2RailingPost(name, x, y, z, config, rotationY=0) {
  const height=config.height-.23
  const inner=-config.depth*.2,outer=inner+config.depth,topOuter=inner+config.depth*.4
  const shape=new THREE.Shape()
  // 侧剖面：靠走廊一边近直，朝院一边在偏下位置外凸后收回。
  ;[[inner,0],[topOuter,0],[outer,.24],[topOuter,height],[inner,height]].forEach(([depth,py],i)=>i?shape.lineTo(depth,py):shape.moveTo(depth,py))
  shape.closePath()
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:config.frontWidth,bevelEnabled:false})
  geometry.translate(0,0,-config.frontWidth/2)
  // 外廊位于建筑南侧（+Z）；将折点较大的凸面明确朝向外侧，而非教室一侧。
  geometry.rotateY(-Math.PI/2)
  const mesh=new THREE.Mesh(geometry,mat.b2RailWarmWhite)
  mesh.name=name; mesh.position.set(x,y+.17,z); mesh.rotation.y=rotationY; mesh.castShadow=false; mesh.receiveShadow=true; root.add(mesh)
  return mesh
}

function b2RailX(name,x1,x2,y,z,config) {
  box(`${name}-top`,[x2-x1,.12,.24],[(x1+x2)/2,y+config.height-.06,z],mat.b2RailWarmWhite)
  box(`${name}-bottom`,[x2-x1,.12,.18],[(x1+x2)/2,y+.11,z],mat.b2RailWarmWhite)
  addSegmentCollider(`${name}-barrier`,[x1,z],[x2,z],y,y+config.height,.24)
  // 10cm栏杆片＋约20cm净空，中心节距约30cm；整段取整数格后均匀分配。
  const pitch=config.frontWidth+config.clearGap,count=Math.max(1,Math.round((x2-x1)/pitch))
  for(let i=0;i<=count;i++) b2RailingPost(`${name}-asymmetric-post`,THREE.MathUtils.lerp(x1,x2,i/count),y,z,config)
}

function b2RailZ(name,z1,z2,y,x,config,outwardX) {
  const length=z2-z1,centerZ=(z1+z2)/2
  box(`${name}-top`,[.24,.12,length],[x,y+config.height-.06,centerZ],mat.b2RailWarmWhite)
  box(`${name}-bottom`,[.18,.12,length],[x,y+.11,centerZ],mat.b2RailWarmWhite)
  addSegmentCollider(`${name}-barrier`,[x,z1],[x,z2],y,y+config.height,.24)
  const pitch=config.frontWidth+config.clearGap,count=Math.max(1,Math.round(length/pitch))
  const rotationY=outwardX>0?Math.PI/2:-Math.PI/2
  for(let i=0;i<=count;i++) b2RailingPost(`${name}-asymmetric-post`,x,y,THREE.MathUtils.lerp(z1,z2,i/count),config,rotationY)
}

function b2StairHalfWall(name,x,zStart,zEnd,base,rise,outwardZ=1,capWidth=.24) {
  const length=Math.abs(zEnd-zStart),dir=Math.sign(zEnd-zStart)
  const shape=new THREE.Shape()
  ;[[0,0],[length,rise],[length,rise+1],[0,1]].forEach(([run,py],i)=>i?shape.lineTo(run,py):shape.moveTo(run,py))
  shape.closePath()
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:false})
  geometry.translate(0,0,-.07); geometry.rotateY(dir>0?-Math.PI/2:Math.PI/2)
  const wall=new THREE.Mesh(geometry,schoolSurfaceVariant(mat.concrete,name))
  wall.name=`${name}-halfwall`; wall.position.set(x,base,zStart); wall.castShadow=wall.receiveShadow=true; root.add(wall)
  addSegmentCollider(`${name}-barrier`,[x,zStart],[x,zEnd],base,base+rise+1,.14)
  // 压顶长度必须取斜边真长。旧值只取水平投影，旋转后压顶两端缩短，
  // 且其下表面会穿进斜扶手墙顶面约 1cm，形成连续颗粒状闪动带。
  const capLength=Math.hypot(length,rise)
  const capAngle=Math.atan2(rise,length)
  const capCenterOffset=.05*Math.cos(capAngle)+STRUCTURE_JOIN_GAP
  const cap=box(`${name}-cap`,[capWidth,.1,capLength],[x,base+rise/2+1+capCenterOffset,(zStart+zEnd)/2],mat.concrete)
  cap.rotation.x=-capAngle*outwardZ
}

function createB2Staircase(name,cx,frontY,frontZ,floorHeight,config,bayWidth) {
  const rise=floorHeight/2,run=config.risersPerFlight*config.tread
  const slabThickness=.16,undersideFinishThickness=.012
  // 两跑楼梯各自使用独立的中央扶手墙与压顶。两道构件在中心面零缝贴合，
  // 但各自只占中心线的一侧，因此不会再互相穿入或形成共面闪动。
  const centralWallThickness=.14,centralCapWidth=centralWallThickness
  const centralGuardCenterOffset=centralWallThickness/2
  // 中央扶手墙侧留缝；实体侧墙处则让梯板明确埋入 18mm。若只与墙内皮齐平，
  // 梯板斜边会以点线形式争夺墙面深度；若向楼梯井缩进，斜边又会露成一道细缝。
  const joinGap=FINISH_SURFACE_GAP
  const innerFlightEdge=centralGuardCenterOffset+centralWallThickness/2+joinGap,outerFlightEdge=config.width+joinGap
  const flightWidth=outerFlightEdge-innerFlightEdge
  const laneCenterOffset=(innerFlightEdge+outerFlightEdge)/2
  const lowerX=cx+laneCenterOffset,upperX=cx-laneCenterOffset
  const addFlight=(suffix,x,zStart,zEnd,yStart)=>{
    const dir=Math.sign(zEnd-zStart),slopeLength=Math.hypot(run,rise),angle=-dir*Math.atan2(rise,run)
    const walkX=x
    const slabCenterY=yStart+rise/2-slabThickness/2
    const slabCenterZ=(zStart+zEnd)/2
    const slab=box(`${name}-${suffix}-inclined-slab`,[flightWidth,slabThickness,slopeLength],[x,slabCenterY,slabCenterZ],mat.concrete)
    slab.rotation.x=angle
    // 楼梯板底面使用暖白粉刷完成面；薄饰面沿梯板局部法线向下偏移，
    // 与承重板底相切而不共面，避免近看闪动。
    const undersideOffset=(slabThickness+undersideFinishThickness)/2
    const underside=box(
      `${name}-${suffix}-inclined-slab-white-underside`,
      [flightWidth,undersideFinishThickness,slopeLength],
      [x,slabCenterY-Math.cos(angle)*undersideOffset,slabCenterZ-Math.sin(angle)*undersideOffset],
      ceilingFinishMaterial(`${name}-${suffix}-inclined-slab-white-underside`),
    )
    underside.rotation.x=angle
    addWalkSlopeZ(`${name}-${suffix}-continuous-walk`,walkX,flightWidth,zStart,zEnd,yStart,yStart+rise)
    // 每级只保留薄水平踏步；承重体是下方斜向楼梯板，楼梯下方不再被实心梯级填满。
    for(let i=0;i<config.risersPerFlight;i++) {
      const top=yStart+(i+1)*rise/config.risersPerFlight
      const treadZ=zStart+dir*(i+.5)*config.tread
      box(`${name}-${suffix}-tread`,[flightWidth,.055,config.tread+.025],[x,top-.0275,treadZ],mat.concrete)
      addWalkRect(`${name}-${suffix}-tread-walk`,[walkX,treadZ],[flightWidth,config.tread+.025],top)
    }
  }
  addFlight('lower',lowerX,frontZ,frontZ-run,frontY)
  // 折返平台的后沿伸进背墙／楼板 18mm，避免平台与楼层板只以数学边线接触，
  // 从楼梯井侧斜看时露出一条贯通的大缝。
  const landingDepth=config.landingDepth+joinGap
  const landingCenterZ=frontZ-run-config.landingDepth/2-joinGap/2
  box(`${name}-mid-landing`,[bayWidth+2*joinGap,slabThickness,landingDepth],[cx,frontY+rise-slabThickness/2,landingCenterZ],mat.concrete)
  box(
    `${name}-mid-landing-white-underside`,
    [bayWidth+2*joinGap,undersideFinishThickness,landingDepth],
    [cx,frontY+rise-slabThickness-undersideFinishThickness/2,landingCenterZ],
    ceilingFinishMaterial(`${name}-mid-landing-white-underside`),
  )
  addWalkRect(`${name}-mid-landing-walk`,[cx,landingCenterZ],[bayWidth,config.landingDepth],frontY+rise)
  addFlight('upper',upperX,frontZ-run,frontZ,frontY+rise)
  // 楼层入口平台由整层楼板连续生成，不再用左右两块窄板拼接。
  // 旧做法会在平台中线、平台外沿和楼层板之间同时留下可见缝隙。
  b2StairHalfWall(`${name}-lower-center`,cx+centralGuardCenterOffset,frontZ,frontZ-run,frontY,rise,-1,centralCapWidth)
  b2StairHalfWall(`${name}-upper-center`,cx-centralGuardCenterOffset,frontZ-run,frontZ,frontY+rise,rise,1,centralCapWidth)
}

function createB2Roof(name,b,wallTop) {
  const [cx,cz]=b.center,[w,d]=b.size,overhang=b.roofOverhang
  const roofW=w+overhang*2,roofD=d+overhang*2
  box(`${name}-slab`,[roofW,.2,roofD],[cx,wallTop+.1,cz],mat.schoolRoofConcrete)
  const layerW=roofW-2*b.insulationInset,layerD=roofD-2*b.insulationInset
  // 隔热砖缝后续由贴图表达；几何只保留一整片薄板和少量架空支撑。
  const supportCount=6
  for(let i=0;i<supportCount;i++) {
    const x=THREE.MathUtils.lerp(cx-layerW/2+.2,cx+layerW/2-.2,i/(supportCount-1))
    box(`${name}-air-support`,[.12,.22,layerD],[x,wallTop+.31,cz],mat.dark,{shadow:false})
  }
  box(`${name}-insulation-plane`,[layerW,.1,layerD],[cx,wallTop+.47,cz],mat.roof)
}

function b2StairHalfWallX(name,wallZ,xStart,xEnd,base,rise,capZ=wallZ,capDepth=.24,wallThickness=.14) {
  const length=Math.abs(xEnd-xStart),dir=Math.sign(xEnd-xStart)
  const shape=new THREE.Shape()
  ;[[0,0],[length,rise],[length,rise+1],[0,1]].forEach(([run,py],i)=>i?shape.lineTo(run,py):shape.moveTo(run,py))
  shape.closePath()
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:wallThickness,bevelEnabled:false})
  geometry.translate(0,0,-wallThickness/2)
  // 不能用 X 轴负缩放镜像：它会反转全部三角面绕序，而顶点法线仍朝原方向，
  // FrontSide 材质下就会缺面，视觉上像扶手与楼梯互相穿透。绕 Y 轴 180°
  // 得到相同的 X 向镜像，并保持正行列式、面绕序和法线一致。
  if(dir<0) geometry.rotateY(Math.PI)
  const wall=new THREE.Mesh(geometry,mat.concrete)
  wall.name=`${name}-halfwall`; wall.position.set(xStart,base,wallZ); wall.castShadow=wall.receiveShadow=true; root.add(wall)
  addSegmentCollider(`${name}-barrier`,[xStart,wallZ],[xEnd,wallZ],base,base+rise+1,wallThickness)
  const capLength=Math.hypot(length,rise)
  const cap=box(`${name}-cap`,[capLength,.1,capDepth],[(xStart+xEnd)/2,base+rise/2+1.03,capZ],mat.concrete)
  cap.rotation.z=dir*Math.atan2(rise,length)
}

function createB1Staircase(name,xOuter,xInner,zFront,base,height) {
  const risers=10,landingDepth=1.18,laneWidth=1.5,slabThickness=.16
  const outwardDir=Math.sign(xOuter-xInner),rise=height/2
  const midInnerX=xOuter-outwardDir*landingDepth
  const run=Math.abs(midInnerX-xInner),tread=run/risers
  const nearLaneZ=zFront+laneWidth/2,farLaneZ=zFront+laneWidth*1.5,centerGuardZ=zFront+laneWidth
  // 从各自翼楼走廊朝外看：西楼梯左侧、东楼梯右侧都对应南侧（far）梯道。
  // 因此首层入口统一放在 far 梯道，折返后从 near 梯道进入二层；东西两端
  // 借由 outwardDir 自然形成镜像，而不再分别维护两套易错的楼梯几何。
  const lowerZ=farLaneZ,upperZ=nearLaneZ
  // 中央砌筑扶手墙厚 0.14m。梯板和踏步原先一直延伸到墙体中心线，
  // 因而有约 0.07m 埋入墙内；描边后会在墙另一侧形成明显横向穿模。
  const centralWallThickness=.14,centralCapDepth=.24,antiFlickerGap=.006
  // 总计14cm的中央扶手墙拆成南北两个7cm半墙，总计24cm的压顶拆成两个
  // 12cm半压顶；两者在中心面零缝贴合，但合并外轮廓仍保持原设计厚度，
  // 不会因为把两个完整厚度构件并排放置而在另一跑形成退进的槽带。
  const splitWallThickness=centralWallThickness/2,splitCapDepth=centralCapDepth/2
  const innerInset=centralWallThickness/2+antiFlickerGap,flightDepth=laneWidth-innerInset
  const undersideFinishThickness=.012
  const addFlight=(suffix,xStart,xEnd,z,yStart)=>{
    const dir=Math.sign(xEnd-xStart),slopeLength=Math.hypot(run,rise)
    const guardSide=Math.sign(z-centerGuardZ),flightZ=z+guardSide*innerInset/2
    const slabCenterX=(xStart+xEnd)/2,slabCenterY=yStart+rise/2-slabThickness/2
    const slabAngle=dir*Math.atan2(rise,run)
    const slab=box(`${name}-${suffix}-inclined-slab`,[slopeLength,slabThickness,flightDepth],[slabCenterX,slabCenterY,flightZ],mat.concrete)
    slab.rotation.z=slabAngle
    // 楼梯板底面使用暖白粉刷完成面；完成面与板底端面相切，
    // 没有共面重叠，也不会从踏步上方露出。
    const undersideOffset=(slabThickness+undersideFinishThickness)/2
    const underside=box(
      `${name}-${suffix}-inclined-slab-white-underside`,
      [slopeLength,undersideFinishThickness,flightDepth],
      [slabCenterX+Math.sin(slabAngle)*undersideOffset,slabCenterY-Math.cos(slabAngle)*undersideOffset,flightZ],
      ceilingFinishMaterial(`${name}-${suffix}-inclined-slab-white-underside`),
    )
    underside.rotation.z=slabAngle
    addSlopeColliderX(`${name}-${suffix}-inclined-slab-collider`,xStart,xEnd,flightZ,flightDepth,yStart,yStart+rise,slabThickness)
    addWalkSlopeX(`${name}-${suffix}-continuous-walk`,xStart,xEnd,z,laneWidth,yStart,yStart+rise)
    for(let i=0;i<risers;i++) {
      const top=yStart+(i+1)*rise/risers
      const treadX=xStart+dir*(i+.5)*tread
      box(`${name}-${suffix}-tread`,[tread+.025,.055,flightDepth],[treadX,top-.0275,flightZ],mat.concrete)
      // 行走面保持原 1.5m 净宽；中央扶手墙的独立碰撞负责限制内缘，
      // 不让视觉收边的 7.6cm 缩减可行走宽度。
      addWalkRect(`${name}-${suffix}-tread-walk`,[treadX,z],[tread+.025,laneWidth],top)
    }
  }

  // 与二号楼相同：斜楼梯板承重，薄踏步铺在板面；两跑在外端连续平台折返。
  addFlight('lower',xInner,midInnerX,lowerZ,base)
  const midLandingX=xOuter-outwardDir*landingDepth/2
  box(`${name}-mid-landing`,[landingDepth,slabThickness,laneWidth*2],[midLandingX,base+rise-slabThickness/2,zFront+laneWidth],mat.concrete)
  box(
    `${name}-mid-landing-white-underside`,
    [landingDepth,undersideFinishThickness,laneWidth*2],
    [midLandingX,base+rise-slabThickness-undersideFinishThickness/2,zFront+laneWidth],
    ceilingFinishMaterial(`${name}-mid-landing-white-underside`),
  )
  addWalkRect(`${name}-mid-landing-walk`,[midLandingX,zFront+laneWidth],[landingDepth,laneWidth*2],base+rise)
  addFlight('upper',midInnerX,xInner,upperZ,base+rise)

  // 靠门洞一侧的首层接驳必须从地面真实落地。原先只有一块位于 +0.40m 的薄板，
  // 既超过玩家 0.35m 的抬步高度，也没有侧面实体，因此会同时出现上不去和穿台。
  const accessCenterX=xInner-outwardDir*landingDepth/2
  // 接驳平台位于已有整层楼板范围内，只作为下方承托；顶面必须藏在完成面下，
  // 否则矩形平台与楼板三角化顶面完全重合并产生大片三角闪斑。
  const floorSlabThickness=CAMPUS.buildings.building1.slabThickness
  const lowerAccessHeight=base-floorSlabThickness
  box(`${name}-lower-access-landing`,[landingDepth,lowerAccessHeight,laneWidth],[accessCenterX,lowerAccessHeight/2,lowerZ],mat.concrete,{collider:{walkable:true}})
  const entryStepRun=.34
  const accessOuterEdge=xInner-outwardDir*landingDepth
  const entryStepX=accessOuterEdge-outwardDir*entryStepRun/2
  box(`${name}-ground-entry-step`,[entryStepRun,base/2,laneWidth],[entryStepX,base/4,lowerZ],mat.concrete,{collider:{walkable:true}})
  addWalkRect(`${name}-ground-entry-step-walk`,[entryStepX,lowerZ],[entryStepRun,laneWidth],base/2)
  // 到达平台位于楼板洞口内部，而不是已有楼板之下；其实体必须占据完整的
  // 二层楼板厚度（3.34–3.50m），顶面与二层完成面齐平。旧实现把整块板
  // 再下移了一层板厚，导致它只能从楼梯下方看见、上楼后却消失。
  const upperAccessTop=base+height
  box(`${name}-upper-access-landing`,[landingDepth,slabThickness,laneWidth],[accessCenterX,upperAccessTop-slabThickness/2,upperZ],mat.concrete)
  box(
    `${name}-upper-access-landing-white-underside`,
    [landingDepth,undersideFinishThickness,laneWidth],
    [accessCenterX,upperAccessTop-slabThickness-undersideFinishThickness/2,upperZ],
    ceilingFinishMaterial(`${name}-upper-access-landing-white-underside`),
  )
  addWalkRect(`${name}-lower-access-walk`,[accessCenterX,lowerZ],[landingDepth,laneWidth],base)
  addWalkRect(`${name}-upper-access-walk`,[accessCenterX,upperZ],[landingDepth,laneWidth],base+height)

  // 二层不再继续向上：下跑这一半在顶层形成临空边，补同二号楼一致的1m半墙与突出压顶；上跑到达口保持开放。
  const topGuardX=xInner+outwardDir*.07
  // 换向后临空边位于 far 梯道，横向护墙必须从 upper 跑中央半墙的近侧外缘
  // 起步。这里是两个互相垂直构件的端面对接：若从中心线另一侧再留结构缝，
  // 二楼近看会在墙体和压顶之间形成明显断口。墙身与压顶分别从斜扶手的
  // 外缘精确起步，只共享转角端面，不产生两张共面的重叠表面。
  const stairBackZ=zFront+2*laneWidth
  const topGuardWallStart=centerGuardZ-centralWallThickness/2
  const topGuardWallDepth=stairBackZ-topGuardWallStart
  const topGuardWallZ=(topGuardWallStart+stairBackZ)/2
  box(`${name}-top-stairwell-guard`,[.14,1,topGuardWallDepth],[topGuardX,base+height+.5,topGuardWallZ],mat.concrete,{collider:true})
  const topGuardCapStart=centerGuardZ-centralCapDepth/2
  const topGuardCapEnd=stairBackZ+.08
  const topGuardCapDepth=topGuardCapEnd-topGuardCapStart
  box(`${name}-top-stairwell-guard-cap`,[.26,.1,topGuardCapDepth],[topGuardX,base+height+1.03,(topGuardCapStart+topGuardCapEnd)/2],mat.concrete)
  const wallOffset=splitWallThickness/2,capOffset=splitCapDepth/2
  const lowerWallNear=centerGuardZ+wallOffset-splitWallThickness/2
  const upperWallFar=centerGuardZ-wallOffset+splitWallThickness/2
  const lowerCapNear=centerGuardZ+capOffset-splitCapDepth/2
  const upperCapFar=centerGuardZ-capOffset+splitCapDepth/2
  b1StairJointChecks.push({
    name,
    flightToWallGap:+antiFlickerGap.toFixed(3),
    guardToWallGap:+(topGuardWallStart-(centerGuardZ-centralWallThickness/2)).toFixed(3),
    capToCapGap:+(topGuardCapStart-(centerGuardZ-centralCapDepth/2)).toFixed(3),
    // 两跑中央扶手分别位于中心面的两侧；边界相等，所以间隙和交叠都为零。
    centralWallGap:+Math.max(0,lowerWallNear-upperWallFar).toFixed(3),
    centralWallOverlap:+Math.max(0,upperWallFar-lowerWallNear).toFixed(3),
    centralCapGap:+Math.max(0,lowerCapNear-upperCapFar).toFixed(3),
    centralCapOverlap:+Math.max(0,upperCapFar-lowerCapNear).toFixed(3),
  })

  // 两跑内缘使用二号楼同款约1m高砌筑半墙和突出水泥压顶；楼梯中部仍不设柱。
  b2StairHalfWallX(`${name}-lower-center`,centerGuardZ+wallOffset,xInner,midInnerX,base,rise,centerGuardZ+capOffset,splitCapDepth,splitWallThickness)
  b2StairHalfWallX(`${name}-upper-center`,centerGuardZ-wallOffset,midInnerX,xInner,base+rise,rise,centerGuardZ-capOffset,splitCapDepth,splitWallThickness)
}

function createBuilding2() {
  const b=CAMPUS.buildings.building2,[cx,cz]=b.center,[w,d]=b.size,h=b.floorHeight,base=b.raised,t=b.wall
  const west=cx-w/2,east=cx+w/2,back=cz-d/2,front=cz+d/2
  // 外尺寸链：4×9m教室净宽＋4.5m楼梯净宽＋6道0.24m横墙＝41.94m。
  const xWalls=[west+t/2]
  xWalls.push(xWalls[0]+b.classroom[0]+t)
  xWalls.push(xWalls[1]+b.classroom[0]+t)
  xWalls.push(xWalls[2]+b.stairBay+t)
  xWalls.push(xWalls[3]+b.classroom[0]+t)
  xWalls.push(xWalls[4]+b.classroom[0]+t)
  const rooms=[
    [xWalls[0]+t/2,xWalls[1]-t/2], [xWalls[1]+t/2,xWalls[2]-t/2],
    [xWalls[3]+t/2,xWalls[4]-t/2], [xWalls[4]+t/2,xWalls[5]-t/2],
  ].map(([start,end])=>({start,end,center:(start+end)/2}))
  const roomSideWalls=[[xWalls[0],xWalls[1]],[xWalls[1],xWalls[2]],[xWalls[3],xWalls[4]],[xWalls[4],xWalls[5]]]
  const stairInner=[xWalls[2]+t/2,xWalls[3]-t/2]
  // 进深链：0.24m后墙＋7m教室净深＋0.24m前墙＋2m外廊＝9.48m。
  const rearWallZ=back+t/2,roomFront=back+t+b.classroom[1]+t/2,corridorInner=roomFront+t/2
  const opening=b.openings
  // 后部转折平台直接贴住背墙；楼梯井从背墙内皮贯通到教室前立面。
  const rearInner=back+t,stairRun=b.stair.risersPerFlight*b.stair.tread
  const stairFront=rearInner+b.stair.landingDepth+stairRun
  const fullFloor=[[west,back],[east,back],[east,front],[west,front]]
  const foundationFront=front+b.foundationSouthExtension
  const foundationOutline=[[west,back],[east,back],[east,foundationFront],[west,foundationFront]]
  // 楼层板本身一直铺到两跑楼梯的起步线，形成完整的通宽层间平台；
  // 楼梯井只在起步线以北开洞，避免再用两块独立平台与楼板拼缝。
  const stairWellHole=[[stairInner[0],rearInner],[stairInner[1],rearInner],[stairInner[1],stairFront],[stairInner[0],stairFront]]

  // +0.30m是首层完成面，不是楼板底；地坪下以独立基座承托。基座南沿
  // 比首层楼板外挑0.30m，以整条外露水泥地基形成一级连续踏步。
  shapePlate('b2-plinth',foundationOutline,0,mat.concrete,base-b.slabThickness)
  addFoundationBottomOutline('building-2-plinth',foundationOutline,.025)
  addWalkRect(
    'b2-foundation-south-step-walk',
    [cx,front+b.foundationSouthExtension/2],
    [w,b.foundationSouthExtension],
    base-b.slabThickness,
  )
  for(let f=0;f<b.floors;f++) {
    const y=base+f*h
    // 一、二层的墙柱、梁和端部压沿只能做到上一层楼板底。
    // 旧几何一直延伸到上一层完成面，实际穿入了整块楼板，在近距离斜视时
    // 会露出横向浅色带并产生深度闪动。
    const hasUpperSlab=f<b.floors-1
    const storeyStructureHeight=h-(hasUpperSlab?b.slabThickness:0)
    const frameBeamBottom=y+h-b.frameBeam[1]-STRUCTURE_JOIN_GAP
    const frameBeamHeight=b.frameBeam[1]-(hasUpperSlab?b.slabThickness:0)
    const frameBeamCenterY=frameBeamBottom+frameBeamHeight/2
    // 只有二、三层需要为下方楼梯开洞；首层没有地下层，必须铺满整块水泥楼板。
    const floorHoles=f===0?[]:[stairWellHole]
    shapePlate(`b2-floor-${f+1}`,fullFloor,y-b.slabThickness,mat.concrete,b.slabThickness,floorHoles)
    addWalkPolygon(`b2-floor-${f+1}-walk`,fullFloor,y,floorHoles)
    // 首层地台保留水泥／基座本色；只有二、三层悬空楼板的
    // 外露侧边使用外墙黄色。饰面置于楼板外皮之外，不与水泥侧面共面。
    if(f>0) {
      const slabEdgeFinishDepth=FINISH_SURFACE_GAP
      const slabEdgeFinishY=y-b.slabThickness/2
      box(
        `b2-floor-${f+1}-front-yellow-edge`,
        [w,b.slabThickness,slabEdgeFinishDepth],
        [cx,slabEdgeFinishY,front+slabEdgeFinishDepth/2],mat.b2ExteriorYellow,
      )
      box(
        `b2-floor-${f+1}-rear-yellow-edge`,
        [w,b.slabThickness,slabEdgeFinishDepth],
        [cx,slabEdgeFinishY,back-slabEdgeFinishDepth/2],mat.b2ExteriorYellow,
      )
      box(
        `b2-floor-${f+1}-west-yellow-edge`,
        [slabEdgeFinishDepth,b.slabThickness,d],
        [west-slabEdgeFinishDepth/2,slabEdgeFinishY,cz],mat.b2ExteriorYellow,
      )
      box(
        `b2-floor-${f+1}-east-yellow-edge`,
        [slabEdgeFinishDepth,b.slabThickness,d],
        [east+slabEdgeFinishDepth/2,slabEdgeFinishY,cz],mat.b2ExteriorYellow,
      )
    }
    const rearOpen=[]
    for(const room of rooms) for(const off of [-3.3,-1.1,1.1,3.3]) rearOpen.push({center:room.center+off,width:opening.window[0],bottom:opening.sill,height:opening.window[1]})
    wallX('b2-rear',west,east,rearWallZ,y,storeyStructureHeight,mat.b2ExteriorYellow,rearOpen,t)
    const frontOpen=[]
    for(const room of rooms) {
      for(const off of [-3.875,3.875]) frontOpen.push({center:room.center+off,width:opening.doorOpeningWidth,bottom:0,height:opening.door[1]+opening.doorTransom})
      for(const off of [-1.15,1.15]) frontOpen.push({center:room.center+off,width:opening.window[0],bottom:opening.sill,height:opening.window[1]})
    }
    frontOpen.push({center:cx,width:b.stairBay,bottom:0,height:h})
    wallX('b2-front',west,east,roomFront,y,storeyStructureHeight,mat.b2ExteriorYellow,frontOpen,t)

    for(const [roomIndex,room] of rooms.entries()) {
      const [westWall,eastWall]=roomSideWalls[roomIndex]
      const rearRoomOpen=rearOpen.filter(o=>o.center>room.start&&o.center<room.end)
      const frontRoomOpen=frontOpen.filter(o=>o.center>room.start&&o.center<room.end)
      const innerRear=rearWallZ+t/2,innerFront=roomFront-t/2
      interiorWallX(`b2-room-${roomIndex+1}-rear-interior-floor-${f+1}`,room.start,room.end,rearWallZ,y,storeyStructureHeight,1,rearRoomOpen,t)
      interiorWallX(`b2-room-${roomIndex+1}-front-interior-floor-${f+1}`,room.start,room.end,roomFront,y,storeyStructureHeight,-1,frontRoomOpen,t)
      interiorWallZ(`b2-room-${roomIndex+1}-west-interior-floor-${f+1}`,innerRear,innerFront,westWall,y,storeyStructureHeight,1,[],t)
      interiorWallZ(`b2-room-${roomIndex+1}-east-interior-floor-${f+1}`,innerRear,innerFront,eastWall,y,storeyStructureHeight,-1,[],t)
      const ceilingY=f<b.floors-1?y+h-b.slabThickness:y+h
      classroomCeiling(`b2-room-${roomIndex+1}-ceiling-floor-${f+1}`,room.start,room.end,innerRear,innerFront,ceilingY)
      const roomCenterZ=(innerRear+innerFront)/2
      // 二号楼所有教室统一朝东授课：东西墙各一块黑板，讲台只在东墙。
      addClassroomFixtures(
        `b2-room-${roomIndex+1}-floor-${f+1}`,y,ceilingY,t,
        [
          ['west',[westWall,roomCenterZ],[1,0]],
          ['east',[eastWall,roomCenterZ],[-1,0]],
        ],
        'east',
        [westWall+t/2,eastWall-t/2,innerRear,innerFront],
      )
      const b2RoomCultureId=`b2-room-${roomIndex+1}-floor-${f+1}`
      for(const [side,offset] of [['west',-2.6375],['east',2.6375]])schoolEphemeraAnchors.b2ClassroomPosters.push({
        id:`${b2RoomCultureId}-interior-${side}`,roomId:b2RoomCultureId,
        point:[room.center+offset,roomFront],normal:[0,1],offset:t/2+FINISH_SURFACE_GAP+.003,
        floorY:y,role:side==='east'?'front':'rear',doorDirection:side==='west'?[-1,0]:[1,0],
        office:classroomOfficeRooms.has(b2RoomCultureId),
      })
    }

    // 二号楼外廊顶棚为连续白色粉刷面：一、二层贴在上一层楼板底，
    // 三层贴在屋面板底。范围严格止于端墙内皮和走廊外边，不覆盖黄色外沿。
    const corridorCeilingY=hasUpperSlab?y+h-b.slabThickness:y+h
    classroomCeiling(
      `b2-corridor-white-ceiling-floor-${f+1}`,
      xWalls[0]+t/2,xWalls[5]-t/2,corridorInner,front,corridorCeilingY,
    )

    // 楼梯井需保持上下贯通，不能用整张天花封住洞口。每层只粉白入口平台
    // 上方实际存在的楼板底；顶层再补楼梯洞范围内的屋面底，形成完整白色天花。
    const stairCeilingY=hasUpperSlab?y+h-b.slabThickness:y+h
    classroomCeiling(
      `b2-stairwell-access-white-ceiling-floor-${f+1}`,
      stairInner[0],stairInner[1],stairFront,corridorInner,stairCeilingY,
    )
    if(!hasUpperSlab) classroomCeiling(
      'b2-stairwell-top-white-ceiling',
      stairInner[0],stairInner[1],rearInner,stairFront,stairCeilingY,
    )

    // 两道教室隔墙、楼梯间两侧墙和端墙都使用同一净尺寸链。
    for(const x of [xWalls[1],xWalls[4]]) solidWallZ('b2-classroom-partition',back+t,roomFront-t/2,x,y,storeyStructureHeight,mat.b2ExteriorYellow,t)
    for(const x of [xWalls[2],xWalls[3]]) solidWallZ('b2-stair-side-wall',back+t,corridorInner,x,y,storeyStructureHeight,mat.b2ExteriorYellow,t)
    for(const x of [xWalls[0],xWalls[5]]) solidWallZ('b2-end-wall',back,roomFront+t/2,x,y,storeyStructureHeight,mat.b2ExteriorYellow,t)

    for(const room of rooms) {
      // 二号楼复用一号楼同款木门 GLB；左门左铰链、右门右铰链，均向教室内开启。
      for(const [doorIndex,off] of [-3.875,3.875].entries()) {
        const x=room.center+off
        placeB1Asset(
          doorIndex===0?'doorLeft':'doorRight',
          `b2-room-${rooms.indexOf(room)+1}-door-${doorIndex===0?'left':'right'}-floor-${f+1}`,
          [x,y,roomFront],
        )
      }
      for(const off of [-1.15,1.15]) {
        const x=room.center+off
        placeB1Asset(
          'windowB2Alloy',
          `b2-room-${rooms.indexOf(room)+1}-front-window-${off<0?'left':'right'}-floor-${f+1}`,
          [x,y+opening.sill,roomFront],
        )
      }
      // 两组正窗之间的粗墙柱是墙体／结构构件，不属于走廊栏杆柱。
      box('b2-front-classroom-center-pier',[b.frameColumn[0],storeyStructureHeight,b.frameColumn[1]],[room.center,y+storeyStructureHeight/2,roomFront+t/2+.08],mat.white,{collider:true})
      schoolEphemeraAnchors.b2Columns.push({
        id:`b2-room-${rooms.indexOf(room)+1}-front-column-poster-floor-${f+1}`,
        point:[room.center,roomFront+t/2+.08+b.frameColumn[1]/2],normal:[0,1],offset:.003,
        floorY:y,centerHeight:1.48,size:[.384,.96],category:'b2Columns',group:`b2-floor-${f+1}`,
      })
      for(const off of [-3.3,-1.1,1.1,3.3]) {
        const x=room.center+off
        placeB1Asset(
          'windowB2Alloy',
          `b2-room-${rooms.indexOf(room)+1}-rear-window-${off.toFixed(1)}-floor-${f+1}`,
          [x,y+opening.sill,rearWallZ],
          Math.PI,
        )
      }
    }

    // 后墙柱与横向框架梁上下对齐；走廊外缘不添加虚构的大柱。
    for(const x of xWalls) {
      // 后柱的室内侧略退到墙皮之后，避免白柱与黄墙在同一平面争夺深度。
      const rearFrameColumnZ=rearWallZ-(b.frameColumn[1]-t)/2-STRUCTURE_JOIN_GAP
      box('b2-rear-frame-column',[b.frameColumn[0],storeyStructureHeight,b.frameColumn[1]],[x,y+storeyStructureHeight/2,rearFrameColumnZ],mat.white,{collider:true})
      // 横梁穿过教室隔墙时必须完全收进墙厚；旧梁与24cm隔墙同宽，
      // 两侧整段共面。朝走廊的端面也后退12mm，不再与前墙外皮齐平。
      const transverseBeamWidth=b.frameBeam[0]-2*STRUCTURE_JOIN_GAP
      const transverseBeamFrontZ=corridorInner-STRUCTURE_JOIN_GAP
      box(
        'b2-transverse-frame-beam',
        [transverseBeamWidth,frameBeamHeight,transverseBeamFrontZ-rearFrameColumnZ],
        [x,frameBeamCenterY,(rearFrameColumnZ+transverseBeamFrontZ)/2],
        mat.white,
      )
    }
    // 走廊外沿属于黄色立面体系。既有正面梁沿东西向连续；
    // 三层均在东西两端各补一段南北向回折梁沿。回折梁只做到
    // 正面梁的内皮，两者端面相贴而不互相穿入。
    box('b2-corridor-edge-beam',[w,frameBeamHeight,.24],[cx,frameBeamCenterY,front-.12],mat.b2ExteriorYellow)
    const returnEdgeEndZ=front-.24
    const returnEdgeLength=returnEdgeEndZ-corridorInner
    for(const [side,x] of [['west',xWalls[0]],['east',xWalls[5]]]) box(
      `b2-${side}-corridor-ceiling-return-edge-floor-${f+1}`,
      [.24,frameBeamHeight,returnEdgeLength],
      [x,frameBeamCenterY,(corridorInner+returnEdgeEndZ)/2],
      mat.b2ExteriorYellow,
    )
    // 每间教室正面中轴的白色墙柱上方设南北向通梁。
    // 通梁从教室北侧内墙贯穿室内和走廊，经过柱头后到黄色外沿梁
    // 的北侧内皮为止；南端只端面相贴，不插入黄色梁。
    const northSouthBeamStartZ=rearWallZ+t/2
    const northSouthBeamLength=returnEdgeEndZ-northSouthBeamStartZ
    for(const room of rooms) box(
      `b2-classroom-column-north-south-beam-floor-${f+1}`,
      [b.frameColumn[0],frameBeamHeight,northSouthBeamLength],
      [room.center,frameBeamCenterY,(northSouthBeamStartZ+returnEdgeEndZ)/2],
      schoolSurfaceMat.b2Interior[0],
    )
    box('b2-rear-frame-beam',[w,frameBeamHeight,.28],[cx,frameBeamCenterY,rearWallZ-.08-STRUCTURE_JOIN_GAP],mat.white)
    if(f>0) {
      // 二、三层正面栏杆与左右端部护栏闭合，封住外廊两个敞开端头。
      b2RailX(`b2-rail-continuous-${f}`,xWalls[0],xWalls[5],y,front-.15,b.railing)
      b2RailZ(`b2-west-corridor-end-rail-${f}`,corridorInner,front-.15,y,xWalls[0],b.railing,-1)
      b2RailZ(`b2-east-corridor-end-rail-${f}`,corridorInner,front-.15,y,xWalls[5],b.railing,1)
    }
  }
  // 楼梯间两侧墙与后墙跨越三层连续可见。使用独立通高白色完成面覆盖
  // 墙身及层间楼板侧边，避免逐层饰面在16cm楼板处留下黄色横带。
  const stairwellFinishHeight=b.floors*h
  interiorPanelZ(
    'b2-stairwell-west-wall-white-finish',
    rearInner,corridorInner,xWalls[2],base,stairwellFinishHeight,1,t,
  )
  interiorPanelZ(
    'b2-stairwell-east-wall-white-finish',
    rearInner,corridorInner,xWalls[3],base,stairwellFinishHeight,-1,t,
  )
  interiorPanelX(
    'b2-stairwell-rear-wall-white-finish',
    stairInner[0],stairInner[1],rearWallZ,base,stairwellFinishHeight,1,t,
  )
  // 正面看右侧进入上行，后平台折返，再由左侧回到上一层走廊。
  for(let f=0;f<b.floors-1;f++) createB2Staircase(`b2-central-stair-${f+1}`,cx,base+f*h,stairFront,h,b.stair,b.stairBay)
  // 三层不再继续向上：入口平台已并入连续楼层板，只需在井口后缘设护栏。
  const topFloorY=base+(b.floors-1)*h
  const topRightX=cx+b.stairBay/2-b.stair.width/2
  box('b2-top-right-stairwell-guard',[b.stair.width,1,.14],[topRightX,topFloorY+.5,stairFront-.07],mat.concrete,{collider:true})
  box('b2-top-right-stairwell-guard-cap',[b.stair.width+.16,.1,.26],[topRightX,topFloorY+1.03,stairFront-.07],mat.concrete)
  createB2Roof('b2-roof',b,base+b.floors*h)
  addLabel('2号教学楼 · 3层 · A/B',[cx,12.2,cz])
}

function createOldClassroomProcedural() {
  const b=CAMPUS.buildings.oldClassroom,[cx,cz]=b.center,[w,d]=b.size,base=b.platformY,h=b.eaveHeight
  box('old-classroom-body',[w,h,d],[cx,base+h/2,cz],mat.oldWall,{collider:true})
  const facadeGeometry=new THREE.PlaneGeometry(w,h)
  const facadeSample=new THREE.Mesh(facadeGeometry,sampleMat.limewashOld)
  facadeSample.name='old-classroom-south-facade-material-wall'
  facadeSample.position.set(cx,base+h/2,cz+d/2+.006)
  facadeSample.castShadow=false; facadeSample.receiveShadow=true
  root.add(facadeSample)

  // 东西两端山墙下部与正立面统一使用旧白石灰墙贴图；坡顶三角面由屋顶组件接续同一材质。
  for(const [side,x,rotationY] of [
    ['west',cx-w/2-.006,-Math.PI/2],
    ['east',cx+w/2+.006,Math.PI/2],
  ]) {
    const sideGeometry=new THREE.PlaneGeometry(d,h)
    const sideSample=new THREE.Mesh(sideGeometry,sampleMat.limewashOld)
    sideSample.name=`old-classroom-${side}-side-material-wall`
    sideSample.rotation.y=rotationY
    sideSample.position.set(x,base+h/2,cz)
    sideSample.castShadow=false; sideSample.receiveShadow=true
    root.add(sideSample)
  }

  // 薄视觉贴片只用于样板地面，不参与碰撞，也不改变高台标高。
  const apronGeometry=new THREE.PlaneGeometry(w/2,2.8)
  const apronSample=new THREE.Mesh(apronGeometry,sampleMat.concreteAged)
  apronSample.name='old-classroom-west-room-material-sample-ground'
  apronSample.rotation.x=-Math.PI/2
  apronSample.position.set(cx-w/4,base+.012,cz+d/2+1.4)
  apronSample.receiveShadow=true; root.add(apronSample)

  for(const [roomIndex,room] of [cx-w/4,cx+w/4].entries()) {
    for(const [doorIndex,off] of [-5.2,5.2].entries()) {
      const position=[room+off,base,cz+d/2+.07]
      const type=doorIndex===0?'doorLeft':'doorRight'
      oldClassroomDoorRecess(`old-classroom-room-${roomIndex+1}-door-${doorIndex+1}`,position)
      placeB1Asset(type,`old-classroom-room-${roomIndex+1}-door-${doorIndex+1}`,position)
    }
    for(const [windowIndex,off] of [-2.6,0,2.6].entries()) {
      oldClassroomInsetWindow(
        `old-classroom-room-${roomIndex+1}-inset-window-${windowIndex+1}`,
        [room+off,base+1.55,cz+d/2+.075],
        [1.45,1.3],
      )
    }
    for(const off of [-4.2,-1.4,1.4,4.2]) box('old-rear-window',[1.15,1.15,.08],[room+off,base+1.55,cz-d/2-.045],mat.steel)
  }
  detailedOldClassroomRoof('old-classroom-roof',[cx,cz],[w+.6,d+.9],[w,d],base+h,1.75)
  addLabel('旧教室 · 两间 · C',[cx,6.2,cz])
}

function createOldClassroom() {
  const b=CAMPUS.buildings.oldClassroom,[cx,cz]=b.center,[w,d]=b.size
  rectangularFoundationOutline('old-classroom',b.center,b.size,b.platformY+.022)
  // 建筑不可进入；视觉使用完整 GLB，碰撞保持为集中配置尺寸的轻量占地盒。
  navigation.addAabbBounds({
    name:'old-classroom-glb-footprint',
    minX:cx-w/2,maxX:cx+w/2,minZ:cz-d/2,maxZ:cz+d/2,
    minY:b.platformY,maxY:b.platformY+4.79,
  })
  addLabel('旧教室 · GLB · 两间 · C',[cx,6.2,cz])
}

function createToilet() {
  const b=CAMPUS.buildings.toilet,[cx,cz]=b.center,[w,d]=b.size
  rectangularFoundationOutline('toilet',b.center,b.size,b.platformY+.022)
  // 厕所不可进入；渲染改用独立 GLB，碰撞保持为轻量占地盒，不依赖高面数网格。
  navigation.addAabbBounds({name:'toilet-glb-footprint',minX:cx-w/2,maxX:cx+w/2,minZ:cz-d/2,maxZ:cz+d/2,minY:b.platformY,maxY:b.platformY+3.4})
  addLabel('厕所 · GLB · 不可进入 · A-',[cx,5.6,cz])
}

function createDormitoryProcedural() {
  const b=CAMPUS.buildings.dormitory,[cx,cz]=b.center,[w,d]=b.size,base=b.platformY,h=b.floorHeight
  const corridorCenterX=cx-w/2-b.corridor/2,corridorSurfaceY=base+h+.16
  box('dorm-body',[w,h*2,d],[cx,base+h,cz],mat.brick,{collider:true})
  // 西向三开间：每间均为“窗—门—窗”；一层直临地面，二层临外挑走廊。
  for(let f=0;f<2;f++) for(const off of [-4,0,4]) {
    box('dorm-door',[.08,2,1],[cx-w/2-.05,base+f*h+1,cz+off],mat.wood)
    for(const windowOffset of [-1.25,1.25]) {
      box('dorm-window',[.08,1.25,1.08],[cx-w/2-.055,base+f*h+1.55,cz+off+windowOffset],mat.steel)
    }
  }
  box('dorm-upper-corridor',[b.corridor,.16,d],[corridorCenterX,base+h+.08,cz],mat.concrete)
  addWalkRect('dorm-upper-corridor-walk',[corridorCenterX,cz],[b.corridor,d],corridorSurfaceY)
  for(const z of [cz-d/2,cz,cz+d/2]) box('dorm-corridor-post',[.16,h,.16],[cx-w/2-b.corridor,base+h+h/2,z],mat.white)
  railZ('dorm-upper-rail',cz-d/2,cz+d/2,corridorSurfaceY,cx-w/2-b.corridor)
  // 南侧1 m宽单跑楼梯：整跑位于连续高台上，从东端高台面向西上升并接入阳台。
  const stair=b.exteriorStair,southEdge=cz+d/2,stairZ=southEdge+stair.width/2
  const landingWest=cx-w/2-b.corridor,landingEast=cx-w/2
  const topX=landingEast,bottomX=topX+stair.run
  const bottomY=b.platformY,topY=corridorSurfaceY,stairRise=topY-bottomY
  const stairSlabLength=Math.hypot(stair.run,stairRise)
  // 梯下是封闭的三角形实体空间，不采用其他楼梯的开放薄板做法。
  const wedgeShape=new THREE.Shape()
  wedgeShape.moveTo(bottomX,bottomY); wedgeShape.lineTo(topX,topY); wedgeShape.lineTo(topX,bottomY); wedgeShape.closePath()
  const wedgeGeometry=new THREE.ExtrudeGeometry(wedgeShape,{depth:stair.width,bevelEnabled:false})
  wedgeGeometry.translate(0,0,southEdge)
  const wedge=new THREE.Mesh(wedgeGeometry,mat.oldWall); wedge.name='dorm-exterior-stair-solid-wedge'; wedge.castShadow=wedge.receiveShadow=true; root.add(wedge)
  const stairSlab=box('dorm-exterior-stair-slab',[stairSlabLength,stair.slabThickness,stair.width],[(bottomX+topX)/2,(bottomY+topY)/2,stairZ],mat.concrete)
  stairSlab.rotation.z=-Math.atan2(stairRise,stair.run)
  for(let i=1;i<=stair.steps;i++) {
    const t=i/stair.steps
    const treadX=THREE.MathUtils.lerp(bottomX,topX,t)
    const treadTop=THREE.MathUtils.lerp(bottomY,topY,t)
    const treadDepth=stair.run/stair.steps+.04
    box('dorm-exterior-stair-tread',[treadDepth,.08,stair.width],[treadX,treadTop-.04,stairZ],mat.concrete)
    addWalkRect('dorm-exterior-stair-tread-walk',[treadX,stairZ],[treadDepth,stair.width],treadTop)
  }
  // 二层阳台南端的水平衔接平台。
  box('dorm-exterior-stair-top-landing',[b.corridor,.16,stair.width],[corridorCenterX,topY-.08,stairZ],mat.concrete)
  addWalkRect('dorm-exterior-stair-top-landing-walk',[corridorCenterX,stairZ],[b.corridor,stair.width],topY)
  // 仅南侧外缘设置封闭水泥矮墙；靠宿舍墙一侧不设扶手。
  const parapetShape=new THREE.Shape()
  parapetShape.moveTo(bottomX,bottomY); parapetShape.lineTo(bottomX,bottomY+stair.parapetHeight)
  parapetShape.lineTo(topX,topY+stair.parapetHeight); parapetShape.lineTo(topX,topY); parapetShape.closePath()
  const parapetGeometry=new THREE.ExtrudeGeometry(parapetShape,{depth:stair.parapetThickness,bevelEnabled:false})
  parapetGeometry.translate(0,0,southEdge+stair.width-stair.parapetThickness)
  const parapetMaterial=mat.concrete.clone(); parapetMaterial.side=THREE.DoubleSide
  const parapet=new THREE.Mesh(parapetGeometry,parapetMaterial); parapet.name='dorm-stair-solid-parapet-wall'; parapet.castShadow=parapet.receiveShadow=true; root.add(parapet)
  addSegmentCollider('dorm-stair-solid-parapet-barrier',[bottomX,southEdge+stair.width],[topX,southEdge+stair.width],bottomY,topY+stair.parapetHeight,stair.parapetThickness)
  // 阳台栏杆依次延伸到平台西边和南边，转角处与楼梯水泥扶手闭合。
  const landingOuterZ=southEdge+stair.width
  railZ('dorm-stair-landing-west-rail',southEdge,landingOuterZ,topY,landingWest)
  railX('dorm-stair-landing-south-rail',landingWest,landingEast,topY,landingOuterZ)
  const roofWest=cx-w/2-b.corridor-b.roofOverhang
  const roofEast=cx+w/2+b.roofOverhang
  gableRoof('dorm-roof',[(roofWest+roofEast)/2,cz],roofEast-roofWest,d+2*b.roofOverhang,base+h*2,1.45,mat.roof)
  addLabel('教师宿舍 · 2层 · A-/C',[cx,9,cz])
}

function createDormitory() {
  const b=CAMPUS.buildings.dormitory,[cx,cz]=b.center,[w,d]=b.size
  rectangularFoundationOutline('teacher-dormitory',b.center,b.size,b.platformY+.022)
  // 楼体不可进入，但西侧外廊和南端外楼梯必须留空；不能用模型外包盒封死楼梯。
  navigation.addAabbBounds({
    name:'teacher-dormitory-building-footprint',
    minX:cx-w/2,maxX:cx+w/2,
    minZ:cz-d/2,maxZ:cz+d/2,
    minY:b.platformY,maxY:b.platformY+7.19,
  })
  const stair=b.exteriorStair
  const corridorCenterX=cx-w/2-b.corridor/2
  const corridorSurfaceY=b.platformY+b.floorHeight+.16
  addWalkRect('dorm-glb-upper-corridor-walk',[corridorCenterX,cz],[b.corridor,d],corridorSurfaceY)
  const southEdge=cz+d/2,stairZ=southEdge+stair.width/2
  const topX=cx-w/2,bottomX=topX+stair.run
  addWalkSlopeX('dorm-glb-exterior-stair-continuous-walk',bottomX,topX,stairZ,stair.width,b.platformY,corridorSurfaceY)
  for(let i=1;i<=stair.steps;i++) {
    const t=i/stair.steps
    addWalkRect('dorm-glb-exterior-stair-tread-walk',[THREE.MathUtils.lerp(bottomX,topX,t),stairZ],[stair.run/stair.steps+.04,stair.width],THREE.MathUtils.lerp(b.platformY,corridorSurfaceY,t))
  }
  addWalkRect('dorm-glb-exterior-stair-top-landing-walk',[corridorCenterX,stairZ],[b.corridor,stair.width],corridorSurfaceY)
  addLabel('教师宿舍 · GLB · 2层 · A-/C',[cx,9,cz])
}

const planterFoliageCardGeometry=new THREE.PlaneGeometry(1,1)

function createPlanterStadiumPath(width,depth,PathType=THREE.Shape) {
  const path=new PathType(),radius=depth/2,straightHalf=width/2-radius
  path.moveTo(-straightHalf,-radius)
  path.lineTo(straightHalf,-radius)
  path.absarc(straightHalf,0,radius,-Math.PI/2,Math.PI/2,false)
  path.lineTo(-straightHalf,radius)
  path.absarc(-straightHalf,0,radius,Math.PI/2,Math.PI*1.5,false)
  path.closePath()
  return path
}

function createPlanterStadiumGeometry(width,depth,height,{inner=null,seed=1,wear=.004}={}) {
  const shape=createPlanterStadiumPath(width,depth)
  if(inner)shape.holes.push(createPlanterStadiumPath(inner[0],inner[1],THREE.Path))
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,steps:1,curveSegments:12,bevelEnabled:false})
  geometry.rotateX(-Math.PI/2)
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal')
  // 用坐标哈希对重复顶点施加一致的微扰，保持封闭轮廓，同时让石米水泥不显得机械光滑。
  for(let index=0;index<position.count;index++) {
    const x=position.getX(index),y=position.getY(index),z=position.getZ(index)
    const noise=Math.sin((x*41.7+y*73.1+z*57.9+seed*13.3)*3.07)
      *Math.sin((x*17.1-y*31.3+z*89.7+seed*5.9)*2.31)
    const amount=wear*(Math.abs(normal.getY(index))>.72?.38:1)*noise
    position.setXYZ(index,x+normal.getX(index)*amount,y+normal.getY(index)*amount,z+normal.getZ(index)*amount)
  }
  position.needsUpdate=true
  geometry.computeVertexNormals()
  const correctedNormal=geometry.getAttribute('normal')
  // 粗糙度只改变轮廓，不应把圆弧侧壁的光照方向带出水平面。
  // 顶／底面保持垂直法线，所有内外侧壁法线则强制投影到 XZ 平面。
  for(let index=0;index<correctedNormal.count;index++) {
    const nx=correctedNormal.getX(index),ny=correctedNormal.getY(index),nz=correctedNormal.getZ(index)
    if(Math.abs(ny)>.72)correctedNormal.setXYZ(index,0,Math.sign(ny)||1,0)
    else {
      const horizontalLength=Math.hypot(nx,nz)||1
      correctedNormal.setXYZ(index,nx/horizontalLength,0,nz/horizontalLength)
    }
  }
  correctedNormal.needsUpdate=true
  geometry.computeBoundingSphere()
  return geometry
}

function addPlanterStadiumPart(name,width,depth,height,position,material,options={}) {
  const geometry=createPlanterStadiumGeometry(width,depth,height,options)
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=name;mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true
  root.add(mesh)
  return mesh
}

function addPlanterSwordCluster(name,x,z,baseY,variant=0) {
  const width=.43,height=.73
  for(let index=0;index<3;index++) {
    const mesh=new THREE.Mesh(planterFoliageCardGeometry,planterSwordLeafMaterials[(index+Math.floor(variant))%2])
    mesh.name=`${name}-cutout-card-${index}`
    mesh.position.set(x+Math.sin(index*2.6+variant)*.012,baseY+height/2,z+Math.cos(index*2.3+variant)*.012)
    mesh.scale.set(width*(index===1?.92:1),height*(index===2?.96:1),1)
    mesh.rotation.y=variant+index*Math.PI/3
    mesh.castShadow=true;mesh.receiveShadow=false;root.add(mesh)
  }
}

function planterCamphorCellGeometry(cellIndex) {
  if(planterCamphorCellGeometries[cellIndex])return planterCamphorCellGeometries[cellIndex]
  const geometry=planterFoliageCardGeometry.clone()
  const uv=geometry.attributes.uv
  const column=cellIndex%3,row=Math.floor(cellIndex/3)
  for(let index=0;index<uv.count;index++) {
    uv.setXY(index,column/3+uv.getX(index)/3,(1-row)/2+uv.getY(index)/2)
  }
  uv.needsUpdate=true
  planterCamphorCellGeometries[cellIndex]=geometry
  return geometry
}

function buildPlanterCamphorShrubs(material) {
  const matricesByCell=Array.from({length:6},()=>[])
  const transform=new THREE.Object3D()
  for(const {name,x,z,baseY,scale,variant} of planterCamphorShrubPlacements) {
    // 固定种子让每株使用不同但可复现的叶簇、冠幅和高度，刷新页面不会换形。
    const random=planterShrubRandom(`${name}:${variant.toFixed(5)}`)
    const profile=PLANTER_SHRUB_SHAPE_PROFILES[Math.floor(random()*PLANTER_SHRUB_SHAPE_PROFILES.length)]
    const width=scale*THREE.MathUtils.lerp(profile.width[0],profile.width[1],random())
    const height=scale*THREE.MathUtils.lerp(profile.height[0],profile.height[1],random())
    const cardCount=profile.cards
    const cellOrder=[0,1,2,3,4,5]
    for(let index=cellOrder.length-1;index>0;index--) {
      const swapIndex=Math.floor(random()*(index+1))
      ;[cellOrder[index],cellOrder[swapIndex]]=[cellOrder[swapIndex],cellOrder[index]]
    }
    const baseAngle=variant+random()*Math.PI
    for(let index=0;index<cardCount;index++) {
      const cellIndex=cellOrder[index]
      const cardAngle=baseAngle+index*Math.PI/cardCount+(random()-.5)*.22
      const cardWidth=width*(.82+random()*.25)*PLANTER_SHRUB_CARD_SCALE
      const cardHeight=height*(.82+random()*.20)*PLANTER_SHRUB_CARD_SCALE
      const spread=width*profile.spread*random()
      transform.name=`${name}-camphor-card-${index}`
      transform.position.set(
        x+Math.cos(cardAngle+Math.PI/2)*spread,
        baseY+cardHeight/2+height*random()*.035,
        z+Math.sin(cardAngle+Math.PI/2)*spread,
      )
      transform.scale.set(cardWidth,cardHeight,1)
      transform.rotation.set(0,cardAngle,0)
      transform.updateMatrix()
      matricesByCell[cellIndex].push({matrix:transform.matrix.clone(),shrub:name})
    }
  }
  for(const [cellIndex,cards] of matricesByCell.entries()) {
    if(!cards.length)continue
    const instances=new THREE.InstancedMesh(planterCamphorCellGeometry(cellIndex),material,cards.length)
    instances.name=`planter-camphor-shrub-cell-${cellIndex+1}-instances`
    for(const [index,{matrix}] of cards.entries())instances.setMatrixAt(index,matrix)
    instances.instanceMatrix.needsUpdate=true
    instances.computeBoundingBox();instances.computeBoundingSphere()
    instances.castShadow=true;instances.receiveShadow=false
    instances.userData={atlasCell:cellIndex+1,shrubs:[...new Set(cards.map(card=>card.shrub))]}
    root.add(instances)
  }
  renderer.shadowMap.needsUpdate=true
}

function planterFlowerCellGeometry(cellIndex) {
  if(planterFlowerCellGeometries[cellIndex])return planterFlowerCellGeometries[cellIndex]
  const geometry=planterFoliageCardGeometry.clone()
  const uv=geometry.attributes.uv
  const column=cellIndex%3,row=Math.floor(cellIndex/3)
  for(let index=0;index<uv.count;index++) {
    uv.setXY(index,column/3+uv.getX(index)/3,(1-row)/2+uv.getY(index)/2)
  }
  uv.needsUpdate=true
  planterFlowerCellGeometries[cellIndex]=geometry
  return geometry
}

function selectPlanterFlowerPlacements() {
  const selected=new Set(),building2Groups=new Map()
  for(const placement of planterCamphorShrubPlacements) {
    const match=placement.name.match(/^(b2-front-planter-\d+)-(west|center|east)-shrub$/)
    if(match) {
      if(!building2Groups.has(match[1]))building2Groups.set(match[1],[])
      building2Groups.get(match[1]).push(placement)
      continue
    }
    if(planterShrubRandom(`${placement.name}:flower-selection`)()<.30)selected.add(placement)
  }
  // 二号楼每座独立花基只点缀一株，既不漏空，也不把三株全部铺满花。
  for(const [planterName,placements] of building2Groups) {
    placements.sort((a,b)=>a.name.localeCompare(b.name))
    const random=planterShrubRandom(`${planterName}:flower-selection`)
    selected.add(placements[Math.floor(random()*placements.length)])
  }
  return [...selected]
}

function buildPlanterFlowerAccents(material) {
  const placements=selectPlanterFlowerPlacements()
  const cardGeometries=[],cellCounts=Array(6).fill(0),transform=new THREE.Object3D()
  for(const placement of placements) {
    const {name,x,z,baseY,scale,axis}=placement
    const random=planterShrubRandom(`${name}:flower-card`)
    const b2Match=name.match(/^b2-front-planter-(\d+)-/)
    const cellIndex=b2Match?PLANTER_FLOWER_B2_CELL_ORDER[Number(b2Match[1])-1]:Math.floor(random()*6)
    const alongOffset=(random()-.5)*scale*.34
    const courtyardOffset=axis==='z'?(name.includes('b1-east-')?-.045:.045):.045
    transform.position.set(
      x+(axis==='z'?courtyardOffset:alongOffset),
      baseY+scale*(1.06+random()*.34),
      z+(axis==='z'?alongOffset:courtyardOffset),
    )
    transform.scale.set(scale*(1.42+random()*.22),scale*(1.34+random()*.20),1)
    transform.rotation.set(0,(axis==='z'?Math.PI/2:0)+(random()-.5)*.12,(random()-.5)*.16)
    transform.updateMatrix()
    const geometry=planterFlowerCellGeometry(cellIndex).clone()
    geometry.applyMatrix4(transform.matrix)
    cardGeometries.push(geometry);cellCounts[cellIndex]++
  }
  const geometry=mergeGeometries(cardGeometries,false)
  for(const cardGeometry of cardGeometries)cardGeometry.dispose()
  if(!geometry)throw new Error('Unable to merge planter flower cards')
  geometry.computeBoundingBox();geometry.computeBoundingSphere()
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name='planter-flower-accent-cards-merged'
  mesh.castShadow=false;mesh.receiveShadow=false
  mesh.userData={placements:placements.map(placement=>placement.name),cellCounts}
  root.add(mesh)
  return {placements:placements.length,cards:placements.length,drawObjects:1,cellCounts}
}

function createBuilding2Planters() {
  const planters=CAMPUS.facilities.building2Planters,[width,height,depth]=planters.size
  for(const [index,[x,z]] of planters.centers.entries()) {
    const name=`b2-front-planter-${index+1}`
    // 本体为直边连接两个完整半圆端头；上沿另做向外挑出的粗糙胶囊形压边。
    const bodyHeight=height-.08
    addPlanterStadiumPart(`${name}-body`,width,depth,bodyHeight,[x,0,z],planterAggregateMaterial,{seed:710+index*19,wear:.006})
    const rimHeight=.10,rimOuter=[width+.12,depth+.12],rimInner=[width-.24,depth-.22]
    addPlanterStadiumPart(
      `${name}-rim`,rimOuter[0],rimOuter[1],rimHeight,[x,height-rimHeight,z],planterAggregateMaterial,
      {inner:rimInner,seed:760+index*23,wear:.005},
    )
    addPlanterStadiumPart(
      `${name}-soil`,rimInner[0]-.035,rimInner[1]-.035,.024,[x,height-rimHeight+.012,z],planterSoilMaterial,
      {seed:790+index*29,wear:.003},
    )

    addPlanterSwordCluster(`${name}-west-sword`,x-.96,z,height-.055,index*.41)
    queuePlanterCamphorShrub(`${name}-west-shrub`,x-.55,z,height-.06,.52,index+.2)
    queuePlanterCamphorShrub(`${name}-center-shrub`,x,z,height-.06,.60,index+.7)
    queuePlanterCamphorShrub(`${name}-east-shrub`,x+.51,z,height-.06,.49,index+1.1)
    addPlanterSwordCluster(`${name}-east-sword`,x+.97,z,height-.055,index*.41+1.35)
    navigation.addAabb(name,[x,height/2,z],planters.size)
  }
}

function createB1NorthGraniteBenches() {
  const benches=CAMPUS.facilities.b1NorthGraniteBenches
  const [,seatThickness]=benches.seatSize
  const [legWidth,legHeight,legDepth]=benches.legSize
  for(const [index,[x,z]] of benches.centers.entries()) {
    const name=`b1-north-east-granite-bench-${index+1}`
    createChippedGraniteBox(
      `${name}-seat`,benches.seatSize,
      [x,benches.totalHeight-seatThickness/2,z],
      820+index*37,
    )
    // 室外石板凳复用教室桌凳的座位交互、HUD 与坐下/起身状态机。
    // 板凳位于一号楼北侧，坐下后默认朝北看向操场。
    classroomSeatingInteractions.push({
      id:`${name}-seat`,type:'bench',classroom:null,
      center:[x,benches.totalHeight-seatThickness/2,z],size:[...benches.seatSize],
      sitPosition:[x,1.12,z],facing:[0,-1],
    })
    for(const [legIndex,offsetX] of benches.legOffsets.entries())createChippedGraniteBox(
      `${name}-leg-${legIndex+1}`,[legWidth,legHeight,legDepth],
      [x+offsetX,legHeight/2,z],
      910+index*41+legIndex*11,
    )
  }
}

function createB1NorthBambooClimb() {
  const config=CAMPUS.facilities.b1NorthBambooClimb
  const [[westX,westZ],[eastX,eastZ]]=config.treeCenters
  const spanX=eastX-westX,spanZ=eastZ-westZ,spanLength=Math.hypot(spanX,spanZ)
  const insetRatio=config.treeClearance/spanLength
  const start=[westX+spanX*insetRatio,config.crossbarHeight,westZ+spanZ*insetRatio]
  const end=[eastX-spanX*insetRatio,config.crossbarHeight,eastZ-spanZ*insetRatio]
  const up=new THREE.Vector3(0,1,0)
  const addCylinderBetween=(name,aValues,bValues,radius,material,segments=12)=>{
    const a=new THREE.Vector3(...aValues),b=new THREE.Vector3(...bValues)
    const direction=b.clone().sub(a),length=direction.length()
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,segments),material)
    mesh.name=name;mesh.position.copy(a).add(b).multiplyScalar(.5)
    mesh.quaternion.setFromUnitVectors(up,direction.normalize())
    mesh.castShadow=mesh.receiveShadow=true;root.add(mesh)
    navigation.addAabbBounds({
      name:`${name}-collider`,
      minX:Math.min(a.x,b.x)-radius,maxX:Math.max(a.x,b.x)+radius,
      minZ:Math.min(a.z,b.z)-radius,maxZ:Math.max(a.z,b.z)+radius,
      minY:Math.min(a.y,b.y)-radius,maxY:Math.max(a.y,b.y)+radius,
    })
    return mesh
  }
  addCylinderBetween('b1-north-bamboo-climb-crossbar',start,end,config.crossbarRadius,bambooClimbSteelMaterial)
  const centerX=(westX+eastX)/2,centerZ=(westZ+eastZ)/2
  const axisX=spanX/spanLength,axisZ=spanZ/spanLength
  // 竹竿位于横梁北侧并与其外表面相切，避免两个圆柱在连接处互相穿插。
  const northNormalX=axisZ,northNormalZ=-axisX
  const bambooNorthOffset=config.crossbarRadius+config.bambooRadius
  const bambooCenters=[]
  for(const [index,side] of [-1,1].entries()) {
    const x=centerX+axisX*side*config.bambooSpacing/2+northNormalX*bambooNorthOffset
    const z=centerZ+axisZ*side*config.bambooSpacing/2+northNormalZ*bambooNorthOffset
    const name=`b1-north-bamboo-climb-pole-${index+1}`
    addCylinderBetween(name,[x,0,z],[x,config.bambooHeight,z],config.bambooRadius,bambooClimbMaterial,14)
    const nodeCount=Math.floor((config.bambooHeight-.18)/config.nodeSpacing)
    for(let nodeIndex=1;nodeIndex<=nodeCount;nodeIndex++) {
      const y=nodeIndex*config.nodeSpacing
      const node=new THREE.Mesh(
        new THREE.CylinderGeometry(config.bambooRadius*1.13,config.bambooRadius*1.13,.024,14),
        bambooClimbNodeMaterial,
      )
      node.name=`${name}-node-${nodeIndex}`;node.position.set(x,y,z)
      node.castShadow=node.receiveShadow=true;root.add(node)
    }
    bambooCenters.push([+x.toFixed(3),+z.toFixed(3)])
  }
  return {
    center:[centerX,centerZ],crossbarHeight:config.crossbarHeight,bambooHeight:config.bambooHeight,
    bambooNorthOffset,bambooCenters,
  }
}

function createActivityParallelBars() {
  const bars=CAMPUS.facilities.activity.parallelBars
  const railGeometry=new THREE.CylinderGeometry(bars.pipeRadius,bars.pipeRadius,bars.railLength,10)
  railGeometry.rotateX(Math.PI/2)
  const postHeight=bars.railY-bars.postBottomY
  const postGeometry=new THREE.CylinderGeometry(bars.pipeRadius,bars.pipeRadius,postHeight,10)
  const firstX=bars.center[0]-(bars.count-1)*bars.spacingX/2
  const placements=[]
  for(let groupIndex=0;groupIndex<bars.count;groupIndex++) {
    const groupX=firstX+groupIndex*bars.spacingX
    const groupName=`activity-north-sand-parallel-bars-${groupIndex+1}`
    for(const side of [-1,1]) {
      const railX=groupX+side*bars.railGap/2
      const rail=new THREE.Mesh(railGeometry,activityParallelBarMaterial)
      rail.name=`${groupName}-rail-${side<0?'west':'east'}`
      rail.position.set(railX,bars.railY,bars.center[1])
      rail.castShadow=rail.receiveShadow=true
      root.add(rail)
      navigation.addAabbBounds({
        name:`${rail.name}-collider`,
        minX:railX-bars.pipeRadius,maxX:railX+bars.pipeRadius,
        minZ:bars.center[1]-bars.railLength/2,maxZ:bars.center[1]+bars.railLength/2,
        minY:bars.railY-bars.pipeRadius,maxY:bars.railY+bars.pipeRadius,
      })
      for(const end of [-1,1]) {
        const postZ=bars.center[1]+end*(bars.railLength/2-bars.postInset)
        const post=new THREE.Mesh(postGeometry,activityParallelBarMaterial)
        post.name=`${groupName}-post-${side<0?'west':'east'}-${end<0?'north':'south'}`
        post.position.set(railX,bars.postBottomY+postHeight/2,postZ)
        post.castShadow=post.receiveShadow=true
        root.add(post)
        navigation.addAabbBounds({
          name:`${post.name}-collider`,
          minX:railX-bars.pipeRadius,maxX:railX+bars.pipeRadius,
          minZ:postZ-bars.pipeRadius,maxZ:postZ+bars.pipeRadius,
          minY:bars.postBottomY,maxY:bars.railY,
        })
      }
    }
    placements.push({center:[+groupX.toFixed(3),bars.center[1]],rotationY:0})
  }
  return {groups:bars.count,rails:bars.count*2,posts:bars.count*4,placements}
}

function createActivityHighLowBar() {
  const config=CAMPUS.facilities.activity.highLowBar
  const highY=config.sandSurfaceY+config.highHeight
  const lowY=config.sandSurfaceY+config.lowHeight
  const middleZ=config.center[1]
  const northZ=middleZ-config.highSpan
  const southZ=middleZ+config.lowSpan
  const unitMainGeometry=new THREE.CylinderGeometry(config.pipeRadius,config.pipeRadius,1,10)
  const unitBraceGeometry=new THREE.CylinderGeometry(config.braceRadius,config.braceRadius,1,10)
  const up=new THREE.Vector3(0,1,0)
  const parts=[]
  const addPipeBetween=(name,start,end,geometry)=>{
    const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end)
    const direction=b.clone().sub(a),length=direction.length()
    const mesh=new THREE.Mesh(geometry,activityParallelBarMaterial)
    mesh.name=name
    mesh.position.copy(a).add(b).multiplyScalar(.5)
    mesh.quaternion.setFromUnitVectors(up,direction.normalize())
    mesh.scale.set(1,length,1)
    mesh.castShadow=mesh.receiveShadow=true
    root.add(mesh)
    const radius=geometry===unitBraceGeometry?config.braceRadius:config.pipeRadius
    navigation.addAabbBounds({
      name:`${name}-collider`,
      minX:Math.min(a.x,b.x)-radius,maxX:Math.max(a.x,b.x)+radius,
      minZ:Math.min(a.z,b.z)-radius,maxZ:Math.max(a.z,b.z)+radius,
      minY:Math.min(a.y,b.y)-radius,maxY:Math.max(a.y,b.y)+radius,
    })
    parts.push(name)
  }
  const x=config.center[0]
  addPipeBetween('activity-southwest-high-bar',[x,highY,northZ],[x,highY,middleZ],unitMainGeometry)
  addPipeBetween('activity-southwest-low-bar',[x,lowY,middleZ],[x,lowY,southZ],unitMainGeometry)
  const posts=[
    ['north',northZ,highY],
    ['middle',middleZ,highY],
    ['south',southZ,lowY],
  ]
  for(const [id,z,topY] of posts) {
    addPipeBetween(`activity-southwest-high-low-bar-${id}-post`,[x,config.postBottomY,z],[x,topY,z],unitMainGeometry)
    for(const side of [-1,1]) {
      addPipeBetween(
        `activity-southwest-high-low-bar-${id}-brace-${side<0?'west':'east'}`,
        [x,config.sandSurfaceY+config.braceJoinHeight,z],
        [x+side*config.braceSpread,config.sandSurfaceY-.035,z],
        unitBraceGeometry,
      )
    }
  }
  return {
    center:config.center,highHeight:config.highHeight,lowHeight:config.lowHeight,
    highSpan:config.highSpan,lowSpan:config.lowSpan,parts:parts.length,
  }
}

function createActivityMonkeyBars() {
  const config=CAMPUS.facilities.activity.monkeyBars
  const westX=config.center[0]-config.length/2
  const eastX=config.center[0]+config.length/2
  const middleX=THREE.MathUtils.lerp(westX,eastX,config.slopeFraction)
  const lowY=config.sandSurfaceY+config.lowHeight
  const highY=config.sandSurfaceY+config.highHeight
  const northZ=config.center[1]-config.width/2
  const southZ=config.center[1]+config.width/2
  const railGeometry=new THREE.CylinderGeometry(config.railRadius,config.railRadius,1,10)
  const rungGeometry=new THREE.CylinderGeometry(config.rungRadius,config.rungRadius,1,10)
  const up=new THREE.Vector3(0,1,0)
  const parts=[]
  const addPipeBetween=(name,start,end,geometry,radius)=>{
    const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end)
    const direction=b.clone().sub(a),length=direction.length()
    const mesh=new THREE.Mesh(geometry,activityParallelBarMaterial)
    mesh.name=name
    mesh.position.copy(a).add(b).multiplyScalar(.5)
    mesh.quaternion.setFromUnitVectors(up,direction.normalize())
    mesh.scale.set(1,length,1)
    mesh.castShadow=mesh.receiveShadow=true
    root.add(mesh)
    navigation.addAabbBounds({
      name:`${name}-collider`,
      minX:Math.min(a.x,b.x)-radius,maxX:Math.max(a.x,b.x)+radius,
      minZ:Math.min(a.z,b.z)-radius,maxZ:Math.max(a.z,b.z)+radius,
      minY:Math.min(a.y,b.y)-radius,maxY:Math.max(a.y,b.y)+radius,
    })
    parts.push(name)
  }
  // 每侧纵梁明确分成两段：西半段由1.7m斜升到2.1m，东半段保持2.1m水平。
  for(const [id,z] of [['north',northZ],['south',southZ]]) {
    addPipeBetween(`activity-south-sand-monkey-bars-${id}-sloped-rail`,[westX,lowY,z],[middleX,highY,z],railGeometry,config.railRadius)
    addPipeBetween(`activity-south-sand-monkey-bars-${id}-level-rail`,[middleX,highY,z],[eastX,highY,z],railGeometry,config.railRadius)
  }
  // 横档在斜段随高度抬升，越过中间支撑后全部保持高端水平标高。
  for(let index=0;index<config.topRungCount;index++) {
    const ratio=index/(config.topRungCount-1)
    const x=THREE.MathUtils.lerp(westX,eastX,ratio)
    const y=ratio<=config.slopeFraction
      ? THREE.MathUtils.lerp(lowY,highY,ratio/config.slopeFraction)
      : highY
    addPipeBetween(`activity-south-sand-monkey-bars-top-rung-${index+1}`,[x,y,northZ],[x,y,southZ],rungGeometry,config.rungRadius)
  }
  // 西端、两段交接处、东端各有一面落地梯架，给斜段和水平段真实支撑。
  for(const [endId,x,topY] of [['west-low',westX,lowY],['middle-high',middleX,highY],['east-high',eastX,highY]]) {
    for(const [sideId,z] of [['north',northZ],['south',southZ]]) {
      addPipeBetween(`activity-south-sand-monkey-bars-${endId}-${sideId}-post`,[x,config.postBottomY,z],[x,topY,z],railGeometry,config.railRadius)
    }
    for(let index=0;index<config.endLadderRungCount;index++) {
      const ratio=(index+1)/(config.endLadderRungCount+1)
      const y=THREE.MathUtils.lerp(config.sandSurfaceY+.12,topY-.16,ratio)
      addPipeBetween(`activity-south-sand-monkey-bars-${endId}-ladder-rung-${index+1}`,[x,y,northZ],[x,y,southZ],rungGeometry,config.rungRadius)
    }
  }
  return {
    center:config.center,length:config.length,width:config.width,
    lowHeight:config.lowHeight,highHeight:config.highHeight,
    slopeFraction:config.slopeFraction,topRungs:config.topRungCount,
    supportFrames:3,endLadderRungs:config.endLadderRungCount*3,parts:parts.length,
  }
}

function createFacilities() {
  const f=CAMPUS.facilities
  createBuilding2Planters()
  createB1NorthGraniteBenches()
  const b1NorthBambooClimbStats=createB1NorthBambooClimb()
  const activityParallelBarStats=createActivityParallelBars()
  const activityHighLowBarStats=createActivityHighLowBar()
  const activityMonkeyBarStats=createActivityMonkeyBars()
  // 东侧活动场三块沙地由独立 GLB 异步加载；这里不再生成矩形薄板占位。
  // 六组双杠、高低单杠和攀爬天梯均已按用户示意图正式生成。
  for(const [index,[x,z]] of f.pingPong.centers.entries()) {
    const table=f.pingPong
    if(index<table.assetCount) {
      continue
    }
    const support=table.support
    for(const direction of [-1,1]) {
      box(
        'pingpong-brick-support',
        support.size,
        [x+direction*support.offset,support.size[1]/2,z],
        mat.brick,
        {collider:true},
      )
    }
    box(
      'pingpong-concrete-top',
      [table.topSize[0],table.topThickness,table.topSize[1]],
      [x,table.surfaceHeight-table.topThickness/2,z],
      mat.concrete,
      {collider:true},
    )
    box(
      'pingpong-net',
      [table.netThickness,table.netHeight,table.topSize[1]],
      [x,table.surfaceHeight+table.netHeight/2,z],
      mat.dark,
    )
  }
  // 水泥滑梯由独立优化 GLB 异步加载；这里不再生成任何可见占位图形。
  const flag=f.flag,lowerTop=flag.lower.height,upperTop=lowerTop+flag.upper.height
  box(
    'flag-platform-lower',
    [flag.lower.size[0],flag.lower.height,flag.lower.size[1]],
    [flag.center[0],flag.lower.height/2,flag.center[1]],
    mat.concrete,
    {collider:true},
  )
  box(
    'flag-platform-upper',
    [flag.upper.size[0],flag.upper.height,flag.upper.size[1]],
    [flag.center[0],lowerTop+flag.upper.height/2,flag.center[1]],
    mat.concrete,
    {collider:true},
  )
  cylinder(
    'flagpole',
    flag.pole.radius,
    flag.pole.height,
    [flag.center[0],upperTop+flag.pole.height/2,flag.center[1]],
    mat.dark,
    12,
  )
  addLabel('东侧器械场地 · 高台 +0.5m',[26.5,3.7,-47.5])
  return {
    b1NorthBambooClimb:b1NorthBambooClimbStats,
    activityParallelBars:activityParallelBarStats,
    activityHighLowBar:activityHighLowBarStats,
    activityMonkeyBars:activityMonkeyBarStats,
  }
}

createGround(); createBoundary(); createBuilding1(); createBuilding2(); createOldClassroom(); createToilet(); createDormitory();
const facilityStats=createFacilities()
flagRaisingGame=createFlagRaisingController({
  root:scene,camera,renderer,config:CAMPUS.facilities.flag,
  isTouchMode:()=>touchModePreferred,isActiveMode:()=>mode==='flagRaising',
  onEnter:beginFlagRaisingMode,onExit:finishFlagRaisingMode,onEvent:event=>{trackPersonalGameEvent(event);announceFlagRaisingEvent(event)},
  hitExit:(x,y)=>webglHud.hitFlagRaisingExit(x,y),
})
bambooClimbGame=createBambooClimbGame({
  root:scene,camera,renderer,config:CAMPUS.facilities.b1NorthBambooClimb,
  poles:facilityStats.b1NorthBambooClimb.bambooCenters,
  isTouchMode:()=>touchModePreferred,isActiveMode:()=>mode==='bambooClimb',
  onEnter:beginBambooClimbMode,onExit:finishBambooClimbMode,onEvent:event=>{trackPersonalGameEvent(event);announceBambooClimbEvent(event)},
  hitExit:(x,y)=>webglHud.hitBambooClimbExit(x,y),
})
longJumpGame=createLongJumpGame({
  root:scene,camera,renderer,config:CAMPUS.facilities.longJump,groundHeightAt,
  isActiveMode:()=>mode==='longJump',onEnter:beginLongJumpMode,onExit:finishLongJumpMode,onEvent:event=>{trackPersonalGameEvent(event);announceLongJumpEvent(event)},
  hitExit:(x,y)=>webglHud.hitLongJumpExit(x,y),hitRestart:(x,y)=>webglHud.hitLongJumpRestart(x,y),
})
hopscotchGame=createHopscotchController({
  root:scene,camera,renderer,config:CAMPUS.facilities.hopscotch,
  isTouchMode:()=>touchModePreferred,isActiveMode:()=>mode==='hopscotch',
  onEnter:beginHopscotchMode,onExit:finishHopscotchMode,onEvent:event=>{trackPersonalGameEvent(event);announceHopscotchEvent(event)},
  hitExit:(x,y)=>webglHud.hitHopscotchExit(x,y),
})
shuttlecockGame=createShuttlecockController({
  root:scene,camera,renderer,config:CAMPUS.facilities.shuttlecock,
  isTouchMode:()=>touchModePreferred,isActiveMode:()=>mode==='shuttlecock',
  onEnter:beginShuttlecockMode,onExit:finishShuttlecockMode,onEvent:event=>{trackPersonalGameEvent(event);announceShuttlecockEvent(event)},
  hitExit:(x,y)=>webglHud.hitShuttlecockExit(x,y),
})
jacksGame=createJacksGame({
  root:scene,camera,renderer,config:CAMPUS.facilities.jacksGame,
  isActiveMode:()=>mode==='jacks',onEnter:beginJacksMode,onExit:finishJacksMode,onEvent:event=>{trackPersonalGameEvent(event);announceJacksEvent(event)},
  hitExit:(x,y)=>webglHud.hitJacksExit(x,y),
})
{
  const config=CAMPUS.facilities.longJump,[x,z]=config.boardCenter,[width,height,depth]=config.boardSize
  navigation.addAabb('long-jump-takeoff-board-collider',[x,config.boardTopY-height/2,z],[width,height,depth],{walkable:true})
  navigation.addWalkRect('long-jump-takeoff-board-walk',[x,z],[width,depth],config.boardTopY)
}
const octopusHandheldConfig=CAMPUS.facilities.octopusHandheld
const octopusHandheldDeskAnchor=classroomDeskAnchors.find(anchor=>anchor.name===octopusHandheldConfig.placement.deskId)
if(!octopusHandheldDeskAnchor)throw new Error(`Octopus handheld desk anchor not found: ${octopusHandheldConfig.placement.deskId}`)
const fireHandheldConfig=CAMPUS.facilities.fireHandheld
const fireHandheldDeskAnchor=classroomDeskAnchors.find(anchor=>anchor.name===fireHandheldConfig.placement.deskId)
if(!fireHandheldDeskAnchor)throw new Error(`Fire handheld desk anchor not found: ${fireHandheldConfig.placement.deskId}`)
const ensureOctopusHandheldGame=()=>octopusHandheldGame??=createOctopusHandheldGame({
  renderer,camera,scene,worldParent:ensureClassroomDetailRoots(octopusHandheldConfig.placement.classroom).render,
  deskAnchor:octopusHandheldDeskAnchor,config:octopusHandheldConfig,
  isTouchMode:()=>touchModePreferred,isActiveMode:()=>mode==='handheldOctopus',isOccluder:isSceneInteractionOccluder,
  onEnter:beginOctopusHandheldMode,onExit:finishOctopusHandheldMode,onEvent:trackPersonalGameEvent,playTone:type=>gameAudio.playTone(type,{volume:.72}),
})
const ensureFireHandheldGame=()=>fireHandheldGame??=createFireHandheldGame({
  renderer,camera,scene,worldParent:ensureClassroomDetailRoots(fireHandheldConfig.placement.classroom).render,
  deskAnchor:fireHandheldDeskAnchor,config:fireHandheldConfig,
  isTouchMode:()=>touchModePreferred,isActiveMode:()=>mode==='handheldFire',isOccluder:isSceneInteractionOccluder,
  onEnter:beginFireHandheldMode,onExit:finishFireHandheldMode,onEvent:trackPersonalGameEvent,playTone:type=>gameAudio.playTone(`fire${type[0].toUpperCase()}${type.slice(1)}`,{volume:.72}),
})
const rubiksCubeConfig=CAMPUS.facilities.rubiksCube
const rubiksCubePlacement=rubiksCubeConfig.cubes[0]
const rubiksCubeDeskAnchor=classroomDeskAnchors.find(anchor=>anchor.name===rubiksCubePlacement.deskId)
if(!rubiksCubeDeskAnchor)throw new Error(`Rubik's cube desk anchor not found: ${rubiksCubePlacement.deskId}`)
const ensureRubiksCubeGame=()=>{
  if(rubiksCubeGame)return rubiksCubeGame
  rubiksCubeGame=createRubiksCubeGame({
    renderer,camera,scene,worldParent:ensureClassroomDetailRoots(rubiksCubePlacement.classroom).render,
    deskAnchor:rubiksCubeDeskAnchor,config:rubiksCubeConfig,assetLoader,
    isTouchMode:()=>touchModePreferred,isActiveMode:()=>mode==='rubiksCube',isOccluder:isSceneInteractionOccluder,
    onEnter:beginRubiksCubeMode,onExit:finishRubiksCubeMode,onEvent:event=>{trackPersonalGameEvent(event);announceRubiksCubeEvent(event)},
    playTurn:()=>gameAudio.play('chalkPickup',{volume:.2,rate:.72+Math.random()*.08}),
  })
  void rubiksCubeGame.load().catch(error=>console.error('Rubik\'s cube load failed',error))
  return rubiksCubeGame
}
function syncHandheldClassroomLod(activeRooms) {
  if(activeRooms.has(octopusHandheldConfig.placement.classroom))ensureOctopusHandheldGame()
  if(activeRooms.has(fireHandheldConfig.placement.classroom))ensureFireHandheldGame()
  if(activeRooms.has(rubiksCubePlacement.classroom))ensureRubiksCubeGame()
}

const classroomIdForOpeningName=name=>{
  let match=name.match(/^b1-main-room-(\d+)-.*-floor-(\d+)/)
  if(match)return `b1-main-room-${match[1]}-floor-${match[2]}`
  match=name.match(/^b1-(west|east)-room-door-.*-floor-(\d+)/)
  if(match)return `b1-${match[1]}-wing-room-floor-${match[2]}`
  match=name.match(/^b2-room-(\d+)-door-.*-floor-(\d+)/)
  if(match)return `b2-room-${match[1]}-floor-${match[2]}`
  return null
}
for(const zone of classroomInteriorZones)zone.doors=[]
for(const placement of b1AssetPlacements) {
  if(!placement.type.startsWith('door'))continue
  const classroom=classroomIdForOpeningName(placement.name)
  const zone=classroom&&classroomInteriorZones.find(item=>item.name===classroom)
  if(zone)zone.doors.push({position:[...placement.position],rotationY:placement.rotationY})
}

const classroomDeskProxyRoot=new THREE.Group()
classroomDeskProxyRoot.name='outdoor-classroom-lod-proxies'
scene.add(classroomDeskProxyRoot)
const createSimpleDeskProxyGeometry=()=>{
  const parts=[
    furnitureComponent([1.20,.04,.40],[0,.58,0]),
    furnitureComponent([1.06,.03,.32],[0,.405,0]),
    furnitureComponent([1.06,.16,.03],[0,.49,-.155]),
    ...[-.53,0,.53].map(x=>furnitureComponent([.03,.16,.32],[x,.49,0])),
    ...[-.535,.535].flatMap(x=>[-.145,.145].map(z=>furnitureComponent([.055,.56,.055],[x,.28,z]))),
    furnitureComponent([1.02,.05,.04],[0,.14,-.145]),
    ...[-.30,.30].flatMap(x=>[
      furnitureComponent([.32,.04,.24],[x,.36,.52]),
      furnitureComponent([.04,.34,.18],[x-.12,.17,.52]),
      furnitureComponent([.04,.34,.18],[x+.12,.17,.52]),
    ]),
  ]
  const merged=mergeGeometries(parts,false)
  parts.forEach(part=>part.dispose())
  return merged
}
const createSimpleTeacherDeskProxyGeometry=()=>{
  const parts=[
    furnitureComponent([1.20,.04,.40],[0,.74,0]),
    furnitureComponent([1.08,.70,.04],[0,.35,.18]),
    furnitureComponent([.055,.72,.40],[-.54,.36,0]),
    furnitureComponent([.055,.72,.40],[.54,.36,0]),
    furnitureComponent([1.06,.10,.04],[0,.665,-.17]),
    furnitureComponent([.42,.16,.20],[.30,.64,-.08]),
    furnitureComponent([1.20,.10,.025],[0,.81,.19]),
  ]
  const merged=mergeGeometries(parts,false)
  parts.forEach(part=>part.dispose())
  return merged
}
const classroomDeskProxyGeometry=createSimpleDeskProxyGeometry()
const classroomDeskProxyMaterial=new THREE.MeshStandardMaterial({
  name:'outdoor-classroom-furniture-lod-untextured',color:0x746b5c,roughness:1,metalness:0,
})
const classroomDeskProxyMesh=new THREE.InstancedMesh(
  classroomDeskProxyGeometry,classroomDeskProxyMaterial,classroomDeskAnchors.length,
)
classroomDeskProxyMesh.name='inactive-classroom-simple-desk-instances'
classroomDeskProxyMesh.castShadow=false;classroomDeskProxyMesh.receiveShadow=true
classroomDeskProxyMesh.frustumCulled=false
const classroomDeskProxyRecords=[]
const proxyMatrix=new THREE.Matrix4(),proxyQuaternion=new THREE.Quaternion(),proxyScale=new THREE.Vector3(1,1,1)
for(const [index,anchor] of classroomDeskAnchors.entries()) {
  const classroom=anchor.classroom??anchor.name.replace(/-row-\d+-column-\d+-student-desk$/,'')
  proxyQuaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),anchor.rotationY)
  proxyScale.fromArray(anchor.proxyScale??[1,1,1])
  proxyMatrix.compose(
    new THREE.Vector3(anchor.position[0],anchor.floorY??anchor.position[1]-.602,anchor.position[2]),
    proxyQuaternion,proxyScale,
  )
  classroomDeskProxyMesh.setMatrixAt(index,proxyMatrix)
  classroomDeskProxyRecords.push({classroom,matrix:proxyMatrix.clone()})
}
proxyScale.set(1,1,1)
classroomDeskProxyMesh.instanceMatrix.needsUpdate=true
classroomDeskProxyRoot.add(classroomDeskProxyMesh)
const classroomLodProxyEntries=[{mesh:classroomDeskProxyMesh,records:classroomDeskProxyRecords}]

const teacherDeskProxyGeometry=createSimpleTeacherDeskProxyGeometry()
const teacherDeskProxyMesh=new THREE.InstancedMesh(
  teacherDeskProxyGeometry,classroomDeskProxyMaterial,classroomTeacherDeskAnchors.length,
)
teacherDeskProxyMesh.name='outdoor-classroom-teacher-desk-lod-instances'
teacherDeskProxyMesh.castShadow=false;teacherDeskProxyMesh.receiveShadow=true;teacherDeskProxyMesh.frustumCulled=false
const teacherDeskProxyRecords=[]
for(const [index,anchor] of classroomTeacherDeskAnchors.entries()) {
  const classroom=classroomInteriorZones.find(zone=>anchor.name.startsWith(zone.name))?.name
  proxyQuaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),anchor.rotationY)
  proxyMatrix.compose(
    new THREE.Vector3(anchor.position[0],anchor.position[1]-.76,anchor.position[2]),
    proxyQuaternion,proxyScale,
  )
  teacherDeskProxyMesh.setMatrixAt(index,proxyMatrix)
  teacherDeskProxyRecords.push({classroom,matrix:proxyMatrix.clone()})
}
teacherDeskProxyMesh.instanceMatrix.needsUpdate=true
classroomDeskProxyRoot.add(teacherDeskProxyMesh)
classroomLodProxyEntries.push({mesh:teacherDeskProxyMesh,records:teacherDeskProxyRecords})

const blackboardProxyMaterial=new THREE.MeshStandardMaterial({
  name:'outdoor-classroom-blackboard-lod-untextured',color:0x17221e,roughness:1,metalness:0,
})
const blackboardProxyRecords=schoolEphemeraAnchors.classrooms.flatMap(room=>room.boards.map(board=>({classroom:room.id,board})))
const blackboardProxyMesh=new THREE.InstancedMesh(
  new THREE.BoxGeometry(1,1,1),blackboardProxyMaterial,blackboardProxyRecords.length,
)
blackboardProxyMesh.name='outdoor-classroom-blackboard-lod-instances'
blackboardProxyMesh.castShadow=false;blackboardProxyMesh.receiveShadow=true;blackboardProxyMesh.frustumCulled=false
for(const [index,record] of blackboardProxyRecords.entries()) {
  const {board}=record,[nx,nz]=board.normal
  proxyQuaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(nx,nz))
  proxyMatrix.compose(
    new THREE.Vector3(
      board.wallCenter[0]+nx*board.boardOffset,
      board.floorY+board.board.bottom+board.board.height/2,
      board.wallCenter[1]+nz*board.boardOffset,
    ),
    proxyQuaternion,new THREE.Vector3(board.board.width,board.board.height,board.board.depth),
  )
  blackboardProxyMesh.setMatrixAt(index,proxyMatrix)
  record.matrix=proxyMatrix.clone()
}
blackboardProxyMesh.instanceMatrix.needsUpdate=true
classroomDeskProxyRoot.add(blackboardProxyMesh)
classroomLodProxyEntries.push({mesh:blackboardProxyMesh,records:blackboardProxyRecords})

const b2InteriorWallProxyMaterial=new THREE.MeshStandardMaterial({
  name:'outdoor-b2-interior-wall-lod-white-untextured',color:0xd9dcd5,roughness:1,metalness:0,
  emissive:0x72798b,emissiveIntensity:.24,
})
const b2InteriorWallClassroom=name=>{
  const match=name.match(/^b2-room-(\d+)-(?:rear|front|west|east)-interior-floor-(\d+)/)
  return match?`b2-room-${match[1]}-floor-${match[2]}`:null
}
root.updateMatrixWorld(true)
const b2InteriorWallProxyRecords=[]
for(const templateFloor of [1,3]) {
  const templateClassroom=`b2-room-1-floor-${templateFloor}`
  const templateZone=classroomInteriorZones.find(zone=>zone.name===templateClassroom)
  const [minX,maxX,minZ,maxZ]=templateZone.bounds
  const centerX=(minX+maxX)/2,centerZ=(minZ+maxZ)/2
  const parts=[]
  root.traverse(object=>{
    if(!object.isMesh||b2InteriorWallClassroom(object.name)!==templateClassroom)return
    const geometry=object.geometry.clone()
    geometry.applyMatrix4(object.matrixWorld)
    geometry.translate(-centerX,-templateZone.floorY,-centerZ)
    parts.push(geometry)
  })
  const geometry=mergeGeometries(parts,false)
  parts.forEach(part=>part.dispose())
  if(!geometry)continue
  const zones=classroomInteriorZones.filter(zone=>zone.name.startsWith('b2-')&&(templateFloor===1?zone.floorY<6:zone.floorY>=6))
  const mesh=new THREE.InstancedMesh(geometry,b2InteriorWallProxyMaterial,zones.length)
  mesh.name=`outdoor-b2-interior-wall-lod-floor-group-${templateFloor}`
  mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false
  const records=[]
  for(const [index,zone] of zones.entries()) {
    const [zoneMinX,zoneMaxX,zoneMinZ,zoneMaxZ]=zone.bounds
    const matrix=new THREE.Matrix4().makeTranslation(
      (zoneMinX+zoneMaxX)/2,zone.floorY,(zoneMinZ+zoneMaxZ)/2,
    )
    mesh.setMatrixAt(index,matrix)
    records.push({classroom:zone.name,matrix})
    b2InteriorWallProxyRecords.push({classroom:zone.name})
  }
  mesh.instanceMatrix.needsUpdate=true
  classroomDeskProxyRoot.add(mesh)
  classroomLodProxyEntries.push({mesh,records})
}
let schoolEphemera=null
const loadSchoolEphemera=async()=>{
  if(!schoolEphemera) {
    const {createSchoolEphemera}=await import('./school-ephemera.js')
    schoolEphemera=createSchoolEphemera({root,renderer,assetLoader,anchors:schoolEphemeraAnchors})
  }
  const snapshot=await schoolEphemera.load()
  schoolEphemera.setActiveRooms(activeClassroomDetailRooms)
  return snapshot
}
const schoolEphemeraSnapshot=()=>schoolEphemera?.snapshot()??{status:'idle',uniqueTextures:0,drawObjects:0,instances:0,placements:{}}
const passageMediaLinks=createPassageMediaLinks({
  camera,renderer,board:schoolEphemeraAnchors.passageDevelopment,maxDistance:SCENE_INTERACTION_MAX_DISTANCE,
})
let passageSiteQrSession=null
const openPassageSiteQr=()=>{
  if(siteQrOverlay.isOpen())return true
  passageSiteQrSession={wasPointerLocked:pointer.isLocked}
  pointerLockRequestPending=false
  if(pointer.isLocked)pointer.unlock()
  document.body.classList.add('viewer-open')
  pointWalkController.cancel('site-qr-open');velocity.set(0,0,0);keys.clear();resetTouchControls()
  siteQrOverlay.show()
  renderFrame()
  return true
}
const closePassageSiteQr=({restorePointerLock=true}={})=>{
  if(!siteQrOverlay.hide())return false
  const previous=passageSiteQrSession
  passageSiteQrSession=null
  document.body.classList.remove('viewer-open')
  renderFrame()
  if(restorePointerLock&&previous?.wasPointerLocked&&!touchModePreferred&&pointerLockAvailable)requestGamePointerLock()
  return true
}

let schoolBooks=null
const loadSchoolBooks=async()=>{
  if(!schoolBooks) {
    const {createSchoolBooks}=await import('./school-books.js')
    schoolBooks=createSchoolBooks({
      root,renderer,assetLoader,
      studentAnchors:classroomDeskAnchors,
      teacherAnchors:classroomTeacherDeskAnchors,
      officesExcluded:[...classroomOfficeRooms],
    })
  }
  const snapshot=await schoolBooks.load()
  schoolBooks.setActiveRooms(activeClassroomDetailRooms)
  return snapshot
}
const schoolBooksSnapshot=()=>schoolBooks?.snapshot()??{status:'idle',seed:'school-books-v1',uniqueTextures:0,drawObjects:0,books:0,instances:0}

let compositionPages=null
const loadCompositionPages=async()=>{
  const books=await loadSchoolBooks()
  if(!compositionPages) {
    const {createCompositionPages}=await import('./composition-pages.js')
    compositionPages=createCompositionPages({
      root,renderer,assetLoader,
      studentAnchors:classroomDeskAnchors,
      teacherAnchors:classroomTeacherDeskAnchors,
      occupiedAnchorNames:new Set(books.assignments.map(item=>item.id.replace(/-book-\d+$/,''))),
      officesExcluded:[...classroomOfficeRooms],
    })
  }
  return compositionPages.load()
}
const compositionPagesSnapshot=()=>compositionPages?.snapshot()??{status:'idle',seed:'composition-pages-b2-v1',pages:0,uniqueTextures:0,drawObjects:0}

let comicBooks=null,comicBooksCreationPromise=null
const loadComicBooks=async()=>{
  if(!comicBooks) {
    comicBooksCreationPromise??=import('./comic-books.js').then(({createComicBooks})=>{
      comicBooks??=createComicBooks({
        root,renderer,assetLoader,studentAnchors:classroomDeskAnchors,
        officesExcluded:[...classroomOfficeRooms],
        excludedAnchorNames:[octopusHandheldConfig.placement.deskId,fireHandheldConfig.placement.deskId],
      })
      return comicBooks
    })
    await comicBooksCreationPromise
  }
  const snapshot=await comicBooks.load()
  comicBooks.setActiveRooms(activeClassroomDetailRooms)
  return snapshot
}
const comicBooksSnapshot=()=>comicBooks?.snapshot()??{status:'idle',seed:'comic-books-b2-cubbies-v1',books:0,cubbies:0,classrooms:0,uniqueTextures:0,drawObjects:0}

let snackBags=null,snackBagsCreationPromise=null
const loadSnackBags=async()=>{
  const comics=await loadComicBooks()
  if(!snackBags) {
    snackBagsCreationPromise??=import('./snack-bags.js').then(({createSnackBags})=>{
      snackBags??=createSnackBags({
        renderer,assetLoader,studentAnchors:classroomDeskAnchors,
        occupiedAnchorNames:comics.assignments.map(item=>item.anchor),
        roomRootFor:classroom=>ensureClassroomDetailRoots(classroom).render,
      })
      return snackBags
    })
    await snackBagsCreationPromise
  }
  return snackBags.load()
}
const snackBagsSnapshot=()=>snackBags?.snapshot()??{
  status:'idle',modelUrl:'/assets/models/snacks/bubuxing-seafood-snack-bag-game-v02.glb',
  instances:0,classrooms:0,orientation:'flat-front-up',
}
let pencilBoxes=null,pencilBoxesCreationPromise=null
const loadPencilBoxes=async()=>{
  const [books,pages,comics,snacks]=await Promise.all([
    loadSchoolBooks(),loadCompositionPages(),loadComicBooks(),loadSnackBags(),
  ])
  if(!pencilBoxes) {
    const occupiedAnchorNames=[
      ...books.assignments.map(item=>item.id.replace(/-book-\d+$/,'')),
      ...pages.assignments.filter(item=>item.surface==='student').map(item=>item.anchor),
      ...comics.assignments.map(item=>item.anchor),
      ...snacks.assignments.map(item=>item.anchor),
      octopusHandheldConfig.placement.deskId,fireHandheldConfig.placement.deskId,rubiksCubePlacement.deskId,
    ]
    pencilBoxesCreationPromise??=import('./pencil-boxes.js').then(({createPencilBoxes})=>{
      pencilBoxes??=createPencilBoxes({
        renderer,assetLoader,studentAnchors:classroomDeskAnchors,occupiedAnchorNames,
        officesExcluded:[...classroomOfficeRooms],
        roomRootFor:classroom=>ensureClassroomDetailRoots(classroom).render,
      })
      return pencilBoxes
    })
    await pencilBoxesCreationPromise
  }
  return pencilBoxes.load()
}
const pencilBoxesSnapshot=()=>pencilBoxes?.snapshot()??{
  status:'idle',modelUrl:'/assets/models/pencil-box/flower-angel-pencil-box-game-v01.glb',
  instances:0,classrooms:0,variants:0,workingModelSize:{width:.210,depth:.075,height:.022},
}
const ensureSnackModelViewer=async()=>{
  if(snackModelViewer)return snackModelViewer
  snackModelViewerPromise??=import('./prop-model-viewer.js').then(({createPropModelViewer})=>{
    snackModelViewer??=createPropModelViewer({renderer})
    return snackModelViewer
  })
  return snackModelViewerPromise
}
const snackModelViewerSnapshot=()=>snackModelViewer?.snapshot()??{
  active:null,classroom:null,rotationY:0,displayScale:null,sourceSize:null,sharedModel:false,extraModelRequests:0,closeBounds:null,
}
const beginOverlayViewerSession=kind=>{
  if(!overlayViewerSession)overlayViewerSession={kind,wasPointerLocked:pointer.isLocked}
  else overlayViewerSession.kind=kind
  pointerLockRequestPending=false
  if(pointer.isLocked)pointer.unlock()
  document.body.classList.add('viewer-open')
  pointWalkController.cancel('viewer-open');velocity.set(0,0,0)
}
const closeOverlayViewer=({restorePointerLock=true}={})=>{
  if(!overlayViewerOpen()&&!overlayViewerSession)return false
  const previous=overlayViewerSession
  documentViewer?.close();snackModelViewer?.close();overlayViewerSession=null
  document.body.classList.remove('viewer-open')
  renderFrame()
  if(restorePointerLock&&previous?.wasPointerLocked&&!touchModePreferred&&pointerLockAvailable)requestGamePointerLock()
  return true
}
const openSnackModelViewer=async item=>{
  const source=snackBags?.instanceForId(item?.id)
  if(!source)return false
  beginOverlayViewerSession('prop')
  try {
    const viewer=await ensureSnackModelViewer()
    const opened=viewer.open(source,item,{
      kind:'snack',title:'卜卜星 海鲜味',initialRotationY:Math.PI-.10,pitch:-.08,
      action:'flip',actionLabel:'点击翻面',
    })
    if(opened){
      personalRecords.recordObject({id:item.id,kind:'snack',typeId:'snack:bubuxing',label:'卜卜星海鲜味'})
      personalRecords.recordSnackBag(item.id);renderFrame()
    }else closeOverlayViewer()
    return opened
  } catch(error){closeOverlayViewer();throw error}
}
const openPencilBoxModelViewer=async item=>{
  const source=pencilBoxes?.instanceForId(item?.id)
  if(!source)return false
  beginOverlayViewerSession('prop')
  try {
    const viewer=await ensureSnackModelViewer()
    const opened=viewer.open(source,item,pencilBoxes.viewerOptionsFor(item))
    if(opened){personalRecords.recordObject({id:item.id,kind:'pencil-box',variant:item.variant,label:item.label});renderFrame()}
    else closeOverlayViewer()
    return opened
  } catch(error){closeOverlayViewer();throw error}
}
const pencilBoxInteractionRaycaster=new THREE.Raycaster()
const pencilBoxInteractionPointer=new THREE.Vector2()
let pencilBoxHitDiagnostics=null
function hitViewablePencilBox(clientX,clientY,useCenter=false,skipOcclusion=false) {
  const pickables=pencilBoxes?.pickables()??[]
  if(!pickables.length)return null
  const rect=renderer.domElement.getBoundingClientRect()
  pencilBoxInteractionPointer.set(
    useCenter?0:(clientX-rect.left)/rect.width*2-1,
    useCenter?0:-((clientY-rect.top)/rect.height)*2+1,
  )
  pencilBoxInteractionRaycaster.setFromCamera(pencilBoxInteractionPointer,camera)
  const hit=pencilBoxInteractionRaycaster.intersectObjects(pickables,true)[0]
  const item=hit&&pencilBoxes.itemForObject(hit.object)
  if(!hit||!item||hit.distance>SCENE_INTERACTION_MAX_DISTANCE) {
    if(!skipOcclusion)pencilBoxHitDiagnostics={result:'miss'}
    return null
  }
  // 铅笔盒只对当前可见教室的两个轻量包围盒做命中测试；不要为了这类桌面
  // 小物递归扫描完整校园场景。教室流式根与 2.5 m 距离共同限制可交互范围。
  if(!skipOcclusion)pencilBoxHitDiagnostics={
    result:'hit',candidate:item.id,distance:+hit.distance.toFixed(4),
    candidateProxyCount:pickables.length,recursiveSceneScan:false,
  }
  return {item,source:pencilBoxes.instanceForId(item.id),distance:hit.distance,point:hit.point.toArray()}
}
const snackInteractionRaycaster=new THREE.Raycaster()
const snackInteractionPointer=new THREE.Vector2()
let snackHitDiagnostics=null
function hitViewableSnack(clientX,clientY,useCenter=false,skipOcclusion=false) {
  const pickables=snackBags?.instances()??[]
  if(!pickables.length)return null
  const rect=renderer.domElement.getBoundingClientRect()
  snackInteractionPointer.set(
    useCenter?0:(clientX-rect.left)/rect.width*2-1,
    useCenter?0:-((clientY-rect.top)/rect.height)*2+1,
  )
  snackInteractionRaycaster.setFromCamera(snackInteractionPointer,camera)
  const hit=snackInteractionRaycaster.intersectObjects(pickables,true)[0]
  const item=hit&&snackBags.itemForObject(hit.object)
  if(!hit||!item||hit.distance>SCENE_INTERACTION_MAX_DISTANCE) {
    if(!skipOcclusion)snackHitDiagnostics={result:'miss'}
    return null
  }
  if(!skipOcclusion) {
    const blocker=snackInteractionRaycaster.intersectObjects(scene.children,true).find(isSceneInteractionOccluder)
    const blockerItem=blocker&&snackBags.itemForObject(blocker.object)
    if(blocker&&blocker.distance+.025<hit.distance&&blockerItem?.id!==item.id) {
      snackHitDiagnostics={
        result:'occluded',candidate:item.id,candidateDistance:+hit.distance.toFixed(4),
        blockerName:blocker.object.name||blocker.object.parent?.name||'unnamed',
        blockerDistance:+blocker.distance.toFixed(4),
      }
      return null
    }
  }
  if(!skipOcclusion)snackHitDiagnostics={result:'hit',candidate:item.id,distance:+hit.distance.toFixed(4)}
  return {item,source:snackBags.instanceForId(item.id),distance:hit.distance,point:hit.point.toArray()}
}

const loadDocumentViewer=async()=>{
  await Promise.all([loadSchoolBooks(),loadCompositionPages(),loadComicBooks()])
  if(!documentViewer) {
    const {createDocumentViewer}=await import('./document-viewer.js')
    documentViewer=createDocumentViewer({
      renderer,
      documentIds:[...schoolBooks.documentIds(),...compositionPages.documentIds(),...comicBooks.documentIds()],
      packedDocuments:[comicBooks.viewerPack()],
    })
  }
  return documentViewer.load()
}
const documentViewerSnapshot=()=>documentViewer?.snapshot()??{loaded:false,preloadedBlobs:0,active:null,activeKind:null,opening:false,decodedTextures:0,closeBounds:null}
const openDocumentViewer=async item=>{
  if(!documentViewer||!item)return false
  beginOverlayViewerSession('document')
  try {
    const opened=await documentViewer.open(item)
    if(opened){personalRecords.recordDocument(item);renderFrame()}
    else closeOverlayViewer()
    return opened
  } catch(error){closeOverlayViewer();throw error}
}
const documentInteractionRaycaster=new THREE.Raycaster()
const documentInteractionPointer=new THREE.Vector2()
let documentHitDiagnostics=null
function hitViewableDocument(clientX,clientY,useCenter=false,skipOcclusion=false) {
  const pickables=[
    ...(schoolBooks?.pickables()??[]),...(compositionPages?.pickables()??[]),...(comicBooks?.pickables()??[]),
  ]
  if(!pickables.length)return null
  const rect=renderer.domElement.getBoundingClientRect()
  documentInteractionPointer.set(
    useCenter?0:(clientX-rect.left)/rect.width*2-1,
    useCenter?0:-((clientY-rect.top)/rect.height)*2+1,
  )
  documentInteractionRaycaster.setFromCamera(documentInteractionPointer,camera)
  const hit=documentInteractionRaycaster.intersectObjects(pickables,false)[0]
  if(!hit||hit.distance>SCENE_INTERACTION_MAX_DISTANCE){if(!skipOcclusion)documentHitDiagnostics={result:'miss'};return null}
  const item=hit.instanceId==null
    ?hit.object.userData.documentItem
    :hit.object.userData.documentItems?.[hit.instanceId]
  if(!item){if(!skipOcclusion)documentHitDiagnostics={result:'missing-item'};return null}
  if(!skipOcclusion) {
    const blocker=documentInteractionRaycaster.intersectObjects(scene.children,true).find(isSceneInteractionOccluder)
    const sameSurface=blocker&&blocker.object===hit.object&&(hit.instanceId==null||blocker.instanceId===hit.instanceId)
    if(blocker&&blocker.distance+.025<hit.distance&&!sameSurface) {
      documentHitDiagnostics={
        result:'occluded',candidate:item.id,candidateDistance:+hit.distance.toFixed(4),
        blockerName:blocker.object.name||blocker.object.parent?.name||'unnamed',
        blockerDistance:+blocker.distance.toFixed(4),
      }
      return null
    }
  }
  if(!skipOcclusion)documentHitDiagnostics={result:'hit',candidate:item.id,distance:+hit.distance.toFixed(4)}
  return {item,distance:hit.distance,point:hit.point.toArray()}
}

let schoolChalk=null
const loadSchoolChalk=async()=>{
  if(!schoolChalk) {
    const {createSchoolChalk}=await import('./school-chalk.js')
    schoolChalk=createSchoolChalk({
      root,renderer,teacherAnchors:classroomTeacherDeskAnchors,
      classrooms:schoolEphemeraAnchors.classrooms,
      officesExcluded:[...classroomOfficeRooms],
    })
  }
  return schoolChalk.load()
}
const schoolChalkSnapshot=()=>schoolChalk?.snapshot()??{status:'idle',seed:'school-chalk-v1',boxes:0,chalks:0,drawObjects:0,uniqueTextures:0,externalRequests:0}

const loadGameAudio=()=>gameAudio.preload()
const loadWebglHud=()=>webglHud.load()
const loadSiteQrOverlay=()=>siteQrOverlay.load()

let blackboardDrawing=null
const loadBlackboardDrawing=async()=>{
  if(!blackboardDrawing) {
    const {createBlackboardDrawing}=await import('./interactions/blackboard-drawing.js')
    const passageDrawingBlockers=[schoolEphemeraAnchors.passageGuide,schoolEphemeraAnchors.passageDevelopment].map(board=>({
      id:board.id,
      center:[
        board.wallCenter[0]+board.normal[0]*board.boardOffset,
        board.floorY+board.board.bottom+board.board.height/2,
        board.wallCenter[1]+board.normal[1]*board.boardOffset,
      ],
      normal:[...board.normal],tangent:[board.normal[1],-board.normal[0]],
      width:board.board.width,height:board.board.height,
    }))
    blackboardDrawing=createBlackboardDrawing({
      root,camera,renderer,scene,boards:classroomTeachingBlackboards,
      blockedSurfaces:passageDrawingBlockers,
      maxDistance:SCENE_INTERACTION_MAX_DISTANCE,isOccluder:isSceneInteractionOccluder,
      onEnter:beginBlackboardDrawing,onExit:finishBlackboardDrawing,
      onEvent:announceBlackboardAudioEvent,
    })
  }
  return blackboardDrawing.snapshot()
}

let chalkThrowing=null
const createChalkCollisionWorlds=()=>classroomInteriorZones.map(zone=>({
  id:zone.name,floorY:zone.floorY,ceilingY:zone.ceilingY,bounds:[...zone.bounds],
  boxes:[
    ...colliders.filter(collider=>
      collider.name?.startsWith(`${zone.name}-`)&&!collider.oriented&&!collider.slopeX&&
      [collider.minX,collider.maxX,collider.minY,collider.maxY,collider.minZ,collider.maxZ].every(Number.isFinite),
    ),
    ...walkSurfaces.filter(surface=>
      surface.name?.startsWith(`${zone.name}-`)&&surface.type==='rect'&&surface.height>zone.floorY+.01,
    ).map(surface=>({
      name:surface.name,minX:surface.minX,maxX:surface.maxX,minZ:surface.minZ,maxZ:surface.maxZ,
      minY:zone.floorY,maxY:surface.height,
    })),
  ].map(({name,minX,maxX,minY,maxY,minZ,maxZ})=>({name,minX,maxX,minY,maxY,minZ,maxZ})),
}))
const loadChalkThrowing=async()=>{
  await loadSchoolChalk()
  if(!chalkThrowing) {
    const {createChalkThrowing}=await import('./interactions/chalk-throwing.js')
    chalkThrowing=createChalkThrowing({
      root,camera,renderer,schoolChalk,maxDistance:SCENE_INTERACTION_MAX_DISTANCE,
      collisionWorlds:createChalkCollisionWorlds(),
      onEvent:announceChalkEvent,
    })
  }
  return chalkThrowing.snapshot()
}

const classroomFurniturePlacementAudit=(()=>{
  const positions=classroomDeskAnchors.map(anchor=>anchor.position)
  const range=axis=>[Math.min(...positions.map(position=>position[axis])),Math.max(...positions.map(position=>position[axis]))].map(value=>+value.toFixed(3))
  const outside=classroomDeskAnchors.filter(({position:[x,y,z]})=>x<-25||x>20||z>-3||z<-62||y<.3||y>8).slice(0,20)
  return {stats:{...classroomFurnitureStats},x:range(0),y:range(1),z:range(2),outside}
})()

function artisticOutlineTier(name) {
  if(/^(b1-u-roof|b1-central-portal-facade|b2-roof-(slab|insulation-plane))$/.test(name))return 'primary'
  // 讲台使用现有的次级插画边线；靠墙边埋在墙内会自然被深度遮挡，
  // 外露顶边、倒角、竖角和落地接缝则帮助读出20cm结构高差。
  if(/^(b1|b2)-.*-(podium|teacher-desk)$/.test(name))return 'secondary'
  // 一号楼栏杆的暖白上下横梁保留连续结构描边；花格仍依靠透明纹样自身读形，
  // 不对三层裁切面重复描边，避免斜视时形成过密黑线。
  if(/^b1-(?:upper-continuous|lower-(?:west|east)|(?:west|east)-(?:chamfer-rail|rail(?:-north|-south)?|south-end-rail))-(?:top|bottom)$/.test(name))return 'secondary'
  if(/^b1-(?:west|east)-wing-entry-railing-end$/.test(name))return 'secondary'
  if(/^(flag-platform-(lower|upper)|b1-(left|right)-ground-floor|b1-u-floor-2|b1-main-corridor-top-edge|b1-(corridor-column|rear-column|rear-classroom-divider-column|rear-(west|east)-corner-column|wing-(inner|outer)-column|passage-face-pier-ground-fill)|b1-(west|east)-(chamfer-top-edge|corridor-top-edge|south-top-edge)|b2-(plinth|floor-[1-3]|corridor-edge-beam|front-classroom-center-pier|rear-frame-column|entry-step-(lower|upper)))$/.test(name))return 'secondary'
  if(/^b1-(west|east)-stair-.*(inclined-slab|mid-landing|access-landing|halfwall|cap|top-stairwell-guard)$/.test(name))return 'secondary'
  if(/^b2-central-stair-.*(inclined-slab|mid-landing|access-landing|halfwall|cap)$/.test(name))return 'secondary'
  return null
}

function outlineHash(text) {
  let value=2166136261
  for(let i=0;i<text.length;i++){value^=text.charCodeAt(i);value=Math.imul(value,16777619)}
  return value>>>0
}

function collectArtisticOutline(mesh,tier,target,thresholdOverride=null,minimumOverride=null) {
  const edges=new THREE.EdgesGeometry(mesh.geometry,thresholdOverride??(tier==='primary'?32:42))
  edges.applyMatrix4(mesh.matrixWorld)
  const position=edges.getAttribute('position')
  if(!position)return
  edges.computeBoundingBox()
  const center=edges.boundingBox.getCenter(new THREE.Vector3())
  const minimum=minimumOverride??(tier==='primary'?.28:.38)
  const base=target[`${tier}Base`],stroke=target[`${tier}Stroke`]
  const a=new THREE.Vector3(),b=new THREE.Vector3(),pointA=new THREE.Vector3(),pointB=new THREE.Vector3()
  const seed=outlineHash(mesh.name)
  for(let i=0;i<position.count;i+=2) {
    a.fromBufferAttribute(position,i);b.fromBufferAttribute(position,i+1)
    const length=a.distanceTo(b)
    if(length<minimum)continue
    const offsetPoint=point=>point.addScaledVector(point.clone().sub(center).normalize(),.007)
    pointA.copy(a);pointB.copy(b);offsetPoint(pointA);offsetPoint(pointB)
    base.push(pointA.x,pointA.y,pointA.z,pointB.x,pointB.y,pointB.z)
    const random=index=>{
      const value=Math.sin((seed+i*19+index*71)*12.9898)*43758.5453
      return value-Math.floor(value)
    }
    const strokeLength=.65+random(1)*.85,gap=.08+random(2)*.18
    let cursor=random(3)*gap*.8
    for(let segment=0;cursor<length&&segment<96;segment++) {
      const currentLength=strokeLength*(.72+random(segment+7)*.55)
      const start=cursor,end=Math.min(length,cursor+currentLength)
      if(end-start>.16) {
        pointA.lerpVectors(a,b,start/length);pointB.lerpVectors(a,b,end/length)
        offsetPoint(pointA);offsetPoint(pointB)
        stroke.push(pointA.x,pointA.y,pointA.z,pointB.x,pointB.y,pointB.z)
      }
      cursor=end+gap*(.65+random(segment+31)*.9)
    }
  }
  edges.dispose()
}

function addArtisticPositionGroups(positions,prefix='static',parent=artisticOutlineRoot) {
  let groups=0
  for(const [name,values] of Object.entries(positions)) {
    if(!values.length)continue
    const geometry=new LineSegmentsGeometry()
    geometry.setPositions(values)
    const lines=new LineSegments2(geometry,artisticOutlineMaterials[name])
    lines.name=`artistic-outline-${prefix}-${name}`
    lines.frustumCulled=false
    lines.renderOrder=4
    parent.add(lines)
    groups++
  }
  return groups
}

function addLoadedArchitecturalAssetOutlines(model,label) {
  const positions={primaryBase:[],primaryStroke:[],secondaryBase:[],secondaryStroke:[]}
  let outlinedMeshes=0
  model.updateMatrixWorld(true)
  model.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return
    // 合并后的建筑 GLB 只提取长硬边；排除瓦片、小五金与三角面内部拼接。
    collectArtisticOutline(mesh,'secondary',positions,62,.7)
    outlinedMeshes++
  })
  addArtisticPositionGroups(positions,`asset-${label}`)
  batchStats.outlinedParts+=outlinedMeshes
  return outlinedMeshes
}

function collectArtisticHighlandBoundary(target) {
  const points=eastHighlandBoundaries().core
  const base=target.primaryBase,stroke=target.primaryStroke
  for(let i=0;i<points.length;i++) {
    const a=new THREE.Vector3(points[i][0],CAMPUS.terrain.platformHeight+.018,points[i][1])
    const next=points[(i+1)%points.length]
    const b=new THREE.Vector3(next[0],CAMPUS.terrain.platformHeight+.018,next[1])
    const length=a.distanceTo(b)
    base.push(a.x,a.y,a.z,b.x,b.y,b.z)
    const seed=outlineHash(`east-highland-boundary-${i}`)
    const random=index=>{
      const value=Math.sin((seed+index*71)*12.9898)*43758.5453
      return value-Math.floor(value)
    }
    let cursor=random(1)*.12
    for(let segment=0;cursor<length&&segment<96;segment++) {
      const end=Math.min(length,cursor+.7+random(segment+4)*.8)
      const p0=a.clone().lerp(b,cursor/length),p1=a.clone().lerp(b,end/length)
      stroke.push(p0.x,p0.y,p0.z,p1.x,p1.y,p1.z)
      cursor=end+.08+random(segment+19)*.17
    }
  }
}

function collectArtisticOpeningOutlines(target) {
  const base=target.secondaryBase,stroke=target.secondaryStroke
  const dimensions={
    doorLeft:[CAMPUS.buildings.building1.openings.door.openingWidth,CAMPUS.buildings.building1.openings.door.height],
    doorRight:[CAMPUS.buildings.building1.openings.door.openingWidth,CAMPUS.buildings.building1.openings.door.height],
    windowCorridor:[CAMPUS.buildings.building1.openings.window.corridorWidth,CAMPUS.buildings.building1.openings.window.height],
    windowRear:[CAMPUS.buildings.building1.openings.window.rearWidth,CAMPUS.buildings.building1.openings.window.height],
    windowB2Alloy:CAMPUS.buildings.building2.openings.window,
  }
  const appendSegment=(a,b,seed)=>{
    base.push(a.x,a.y,a.z,b.x,b.y,b.z)
    const length=a.distanceTo(b)
    if(length<.08)return
    const random=index=>{const value=Math.sin((seed+index*71)*12.9898)*43758.5453;return value-Math.floor(value)}
    let cursor=random(1)*.08
    for(let segment=0;cursor<length&&segment<24;segment++) {
      const end=Math.min(length,cursor+.48+random(segment+5)*.62)
      const p0=a.clone().lerp(b,cursor/length),p1=a.clone().lerp(b,end/length)
      stroke.push(p0.x,p0.y,p0.z,p1.x,p1.y,p1.z)
      cursor=end+.045+random(segment+19)*.11
    }
  }
  const appendOpening=(name,type,position,rotationY,scaleX=1)=>{
    const isBuilding2=name.startsWith('b2-')
    const size=isBuilding2&&/^door/.test(type)
      ?[CAMPUS.buildings.building2.openings.doorOpeningWidth,CAMPUS.buildings.building2.openings.door[1]+CAMPUS.buildings.building2.openings.doorTransom]
      :dimensions[type]
    if(!size)return
    const width=size[0]*scaleX,height=size[1],cos=Math.cos(rotationY),sin=Math.sin(rotationY)
    const horizontal=new THREE.Vector3(cos,0,-sin),normal=new THREE.Vector3(sin,0,cos)
    const center=new THREE.Vector3(position[0],position[1],position[2])
    const localCorners=[[-width/2,0],[width/2,0],[width/2,height],[-width/2,height]]
    // 门窗模型位于墙体中心面。洞口轮廓必须落到墙体内、外两张表皮之外，
    // 否则会被约 24cm 厚的墙体和门窗框遮住，看起来像是没有描线。
    const wallThickness=isBuilding2?CAMPUS.buildings.building2.wall:CAMPUS.buildings.building1.wall
    const faceOffset=wallThickness/2+.018
    for(const side of [-1,1]) {
      const corners=localCorners.map(([x,y])=>center.clone().addScaledVector(horizontal,x).addScaledVector(normal,side*faceOffset).setY(center.y+y))
      for(let edge=0;edge<4;edge++)appendSegment(corners[edge],corners[(edge+1)%4],outlineHash(`${name}-${side}-${edge}`))
    }
  }
  for(const placement of b1AssetPlacements)appendOpening(placement.name,placement.type,placement.position,placement.rotationY,placement.scaleX)

  // 一号楼中央穿堂的北侧开口没有门窗模型，单独补一组双面洞口线。
  const b=CAMPUS.buildings.building1,[cx,cz]=b.main.center,zNorth=cz-b.main.size[1]/2
  const passagePosition=[cx,0,zNorth]
  const passageType='b1CentralPassage'
  dimensions[passageType]=[b.centralOpening,b.floorHeight]
  appendOpening('b1-central-passage-rear-opening',passageType,passagePosition,0,1)
}

const emptyArtisticPositions=()=>({primaryBase:[],primaryStroke:[],secondaryBase:[],secondaryStroke:[]})
const classroomInteriorDetailName=name=>/(?:-interior(?:-|$)|room-ceiling|blackboard|chalk-tray|podium|teacher-desk|wall-fan|student-desk|student-stool|office-.*-(?:desk|chair)|office-furniture|ceiling-light)/.test(name)
const classroomForInteriorName=name=>{
  if(!classroomInteriorDetailName(name))return null
  const direct=classroomInteriorZones.find(zone=>name.startsWith(zone.name))
  if(direct)return direct.name
  let match=name.match(/^b1-main-room-(\d+)-.*-floor-(\d+)/)
  if(match)return `b1-main-room-${match[1]}-floor-${match[2]}`
  match=name.match(/^b1-(west|east)-room-.*-floor-(\d+)/)
  if(match)return `b1-${match[1]}-wing-room-floor-${match[2]}`
  match=name.match(/^b2-room-(\d+)-.*-floor-(\d+)/)
  if(match)return `b2-room-${match[1]}-floor-${match[2]}`
  return null
}

function buildArtisticOutlines(meshes) {
  const commonPositions=emptyArtisticPositions()
  const roomPositions=new Map()
  let outlinedParts=0
  for(const mesh of meshes) {
    const tier=artisticOutlineTier(mesh.name)
    if(!tier)continue
    const classroom=classroomForInteriorName(mesh.name)
    if(classroom&&!roomPositions.has(classroom))roomPositions.set(classroom,emptyArtisticPositions())
    collectArtisticOutline(mesh,tier,classroom?roomPositions.get(classroom):commonPositions);outlinedParts++
  }
  collectArtisticHighlandBoundary(commonPositions);outlinedParts++
  collectArtisticOpeningOutlines(commonPositions);outlinedParts+=b1AssetPlacements.length+1
  addArtisticPositionGroups(commonPositions)
  for(const [classroom,positions] of roomPositions)addArtisticPositionGroups(
    positions,classroom,ensureClassroomDetailRoots(classroom).outline,
  )
  return outlinedParts
}

// 灰盒完全静态。按材质和顶点格式合批，将上千个构件压缩为少量绘制批次；
// 碰撞数据仍保留在独立的米制 AABB / 线段数组中，不依赖渲染网格。
function bakeStaticScene() {
  root.updateMatrixWorld(true)
  const groups=new Map(), meshes=[]
  root.traverse(o=>{ if(o.isMesh) meshes.push(o) })
  const outlinedParts=buildArtisticOutlines(meshes)
  for(const mesh of meshes) {
    const zone=classroomForInteriorName(mesh.name)??'common'
    const attrs=Object.keys(mesh.geometry.attributes).sort().join(',')
    // 阴影行为也是合批条件；否则不同构件合并后会丢失各自的 cast/receive 设置。
    const key=`${zone}|${mesh.material.uuid}|${mesh.geometry.index?'i':'n'}|${attrs}|${mesh.castShadow?'cast':'no-cast'}|${mesh.receiveShadow?'receive':'no-receive'}`
    if(!groups.has(key)) groups.set(key,{zone,material:mesh.material,geometries:[],castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow})
    const geometry=mesh.geometry.clone(); geometry.applyMatrix4(mesh.matrixWorld)
    groups.get(key).geometries.push(geometry)
  }
  for(const mesh of meshes) mesh.parent.remove(mesh)
  let batch=0
  const zoneBatches={common:0,building1:0,building2:0}
  for(const {zone,material,geometries,castShadow,receiveShadow} of groups.values()) {
    const merged=mergeGeometries(geometries,false)
    if(!merged) continue
    const mesh=new THREE.Mesh(merged,material); mesh.name=`static-batch-${zone}-${++batch}`
    mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow
    ;(zone==='common'?root:ensureClassroomDetailRoots(zone).render).add(mesh)
    zoneBatches[zone==='common'?'common':zone.startsWith('b1-')?'building1':'building2']++
  }
  return {sourceMeshes:meshes.length,batches:batch,zoneBatches,outlinedParts}
}
const batchStats=bakeStaticScene()
applyCoolShadowTintToScene()
let slingshotPlayCorner=null
const loadSlingshotPlayCorner=async()=>{
  if(!slingshotPlayCorner) {
    const {createSlingshotPlayCorner}=await import('./interactions/slingshot-play-corner.js')
    slingshotPlayCorner=createSlingshotPlayCorner({
      scene,renderer,assetLoader,navigation,config:CAMPUS.facilities.slingshotCorner,
    })
  }
  const result=await slingshotPlayCorner.load()
  if(!slingshotGame) {
    const {createSlingshotGame}=await import('./interactions/slingshot-game.js')
    slingshotGame=createSlingshotGame({
      scene,camera,renderer,config:CAMPUS.facilities.slingshotCorner,parts:slingshotPlayCorner.gameParts(),
      isActiveMode:()=>mode==='slingshot',onEnter:beginSlingshotMode,onExit:finishSlingshotMode,onEvent:event=>{trackPersonalGameEvent(event);announceSlingshotEvent(event)},
    })
  }
  return result
}
const completeSceneAssetTasks=[
  ['perimeter-environment',perimeterEnvironment.load],
  ['building-1-openings',loadB1Assets],['banyan-tree',loadBanyanAsset],['ground-detail-decals',loadGroundDetailDecals],
  ['toilet',loadToiletAsset],['teacher-dormitory',loadDormitoryAsset],['playground-trees',loadPlaygroundTreeAssets],['old-classroom',loadOldClassroomAsset],
  ['sandpit',loadSandpitAsset],['activity-sand',loadActivitySandAssets],['ping-pong-table',loadPingPongAsset],['basketball-area',loadBasketballAreaAssets],['concrete-slide',loadConcreteSlideAsset],['slingshot-corner',loadSlingshotPlayCorner],
  ['school-ephemera',loadSchoolEphemera],['school-books',loadSchoolBooks],['composition-pages',loadCompositionPages],['comic-books',loadComicBooks],['snack-bags',loadSnackBags],['pencil-boxes',loadPencilBoxes],['document-viewer',loadDocumentViewer],['school-chalk',loadSchoolChalk],['blackboard-drawing',loadBlackboardDrawing],['chalk-throwing',loadChalkThrowing],['game-audio',loadGameAudio],['webgl-hud',loadWebglHud],['site-qr-overlay',loadSiteQrOverlay],
].map(([id,load])=>({id,load}))
const completeSceneAssetTaskIds=Object.freeze(completeSceneAssetTasks.map(task=>task.id))
let sceneLoadPromise=null
let fullSceneIsReady=false
const loadAssetBatch=tasks=>Promise.all(tasks.map(task=>
  task.load().then(value=>{
    loadingTaskCompleted++
    updateLoadingUi()
    return value
  })
))
const finalizeCompleteScene=()=>{
  const finalizeStartedAt=performance.now()
  applyCoolShadowTintToScene()
  // 场景主体静态，只有门窗动画时才刷新阴影贴图。
  renderer.shadowMap.autoUpdate=false
  renderer.shadowMap.needsUpdate=true
  // 完整场景进入后先准备东南侧空中入场镜头；加载层开始淡出时才播放，
  // 最终仍精确落到既有校门出生点，再交还第一人称控制。
  prepareArrivalView()
  // 测试／预热接口可以在用户尚未点击入口时直接完成资源加载；这种只读路径
  // 没有可见的入口层淡出，因此直接恢复既有校门状态。
  if(!experienceRequested||shouldReduceArrivalMotion())finishArrivalFlight()
  const gpuStart=performance.now()
  scenePreGpuMs=gpuStart-finalizeStartedAt
  renderFrame()
  renderer.getContext().finish()
  const gpuUploadEstimateMs=performance.now()-gpuStart
  const gpuReadyMs=performance.now()-performanceStartedAt
  for(const timing of pendingGpuReady) {
    timing.gpuUploadEstimateMs=gpuUploadEstimateMs
    timing.gpuReadyMs=gpuReadyMs
  }
  pendingGpuReady.length=0
  sceneReadyAt=gpuReadyMs
  fullSceneIsReady=true
  sceneIsReady=true
  updateLoadingUi()
  revealCampus()
  return true
}
const startSceneLoading=()=>{
  if(sceneLoadPromise)return sceneLoadPromise
  loadingTaskTotal=completeSceneAssetTasks.length
  loadingTaskCompleted=0
  // 三类沙地都会等待这张公共纹理；在完整批起点占用一个并发槽，避免
  // GLB完成后才开始下载而形成依赖尾部。失败仍由物理加载屏障统一拦截。
  void loadSharedSandCementTexture().catch(()=>{})
  sceneLoadPromise=loadAssetBatch(completeSceneAssetTasks)
    .then(()=>{businessAssetsReadyAt=performance.now();return runtimeLoadTracker.waitForIdle()})
    .then(()=>{physicalAssetsReadyAt=performance.now();return true})
    .then(finalizeCompleteScene)
  sceneLoadPromise.catch(handleSceneLoadFailure)
  return sceneLoadPromise
}
const handleSceneLoadFailure=error=>{
  loadingFailure=error
  if(experienceRequested) {
    stopLoadingTips()
    loadingMessage.textContent='有一部分校园资源没有准备好。'
    loadingRetry.hidden=false
  }
  console.error('校园资源加载失败',error)
}

// 第一人称运动与碰撞 -------------------------------------------------------
let mode='aerial',seatedState=null,aerialReturnState=null,last=performance.now(),artisticOutlinesEnabled=performanceProfile.artisticOutlines.enabled,onboardingShown=false
const PAUSABLE_MINIGAME_MODES=new Set(['slingshot','pingPong','bambooClimb','longJump','hopscotch','shuttlecock','jacks','handheldOctopus','handheldFire','rubiksCube','flagRaising'])
const POINTER_LOCK_MINIGAME_MODES=new Set(['slingshot','pingPong','bambooClimb','longJump','hopscotch','shuttlecock'])
const minigamePause={active:false,mode:null,startedAt:0,reason:null,resumePending:false}

const minigameControllerFor=selectedMode=>({
  slingshot:slingshotGame,pingPong:pingPongGame,bambooClimb:bambooClimbGame,longJump:longJumpGame,
  hopscotch:hopscotchGame,shuttlecock:shuttlecockGame,jacks:jacksGame,
  handheldOctopus:octopusHandheldGame,handheldFire:fireHandheldGame,rubiksCube:rubiksCubeGame,flagRaising:flagRaisingGame,
})[selectedMode]??null

const pauseActiveMinigame=(reason='escape')=>{
  if(touchModePreferred||!PAUSABLE_MINIGAME_MODES.has(mode))return false
  if(minigamePause.active)return true
  minigamePause.active=true;minigamePause.mode=mode;minigamePause.startedAt=performance.now();minigamePause.reason=reason;minigamePause.resumePending=false
  keys.clear();velocity.set(0,0,0);minigameControllerFor(mode)?.pauseInput?.()
  pointerLockRequestPending=false
  if(pointer.isLocked)pointer.unlock()
  document.body.classList.add('minigame-paused')
  webglHud.setMinigamePaused(true)
  return true
}

const clearMinigamePause=()=>{
  minigamePause.active=false;minigamePause.mode=null;minigamePause.startedAt=0;minigamePause.reason=null;minigamePause.resumePending=false
  document.body.classList.remove('minigame-paused')
  webglHud.setMinigamePaused(false)
}

const completePausedMinigameResume=()=>{
  if(!minigamePause.active)return false
  const pausedMode=minigamePause.mode,duration=performance.now()-minigamePause.startedAt
  minigameControllerFor(pausedMode)?.resumeAfterPause?.(duration)
  webglHud.resumeAfterMinigamePause(duration)
  clearMinigamePause()
  return true
}

const resumePausedMinigame=()=>{
  if(!minigamePause.active)return false
  if(POINTER_LOCK_MINIGAME_MODES.has(minigamePause.mode)&&!touchModePreferred&&!pointer.isLocked&&!automatedTestBuild){
    minigamePause.resumePending=true;minigamePause.reason='resume-pending';requestGamePointerLock();return true
  }
  return completePausedMinigameResume()
}

const exitPausedMinigame=()=>{
  if(!minigamePause.active)return false
  const pausedMode=minigamePause.mode
  clearMinigamePause()
  minigameControllerFor(pausedMode)?.exit?.()
  return true
}
const exitActiveMinigame=()=>{
  if(!PAUSABLE_MINIGAME_MODES.has(mode))return false
  if(minigamePause.active)return exitPausedMinigame()
  minigameControllerFor(mode)?.exit?.()
  return true
}
const minigameTutorialState={basketball:{inside:false,shown:false},pingPong:{inside:false,shown:false}}
const keys=new Set(), velocity=new THREE.Vector3(), forward=new THREE.Vector3(), right=new THREE.Vector3()
const MOVEMENT_KEY_CODES=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']
const keyboardMovementActive=()=>MOVEMENT_KEY_CODES.some(code=>keys.has(code))
const MOVE_SPEED_SCALE=.8
let cachedSceneInteraction='default'
const pointWalkController=createPointWalkController({
  scene,camera,renderer,navigation,player:CAMPUS.player,speed:CAMPUS.player.speed*MOVE_SPEED_SCALE,
  onEvent:event=>{
    if(event.type==='blocked')showToast('这里走不过去')
  },
})
let footstepCooldown=0
let footstepSide=-1
const TOUCH_LOOK_SENSITIVITY=.0038
const cicadaTreePositions=CAMPUS.facilities.playgroundTrees.placements
  .filter(placement=>placement.species==='casuarina')
  .map(placement=>placement.center)
const westernmostCicadaTree=cicadaTreePositions.reduce((westernmost,position)=>position[0]<westernmost[0]?position:westernmost)
const cicadaForward=new THREE.Vector3(),cicadaRight=new THREE.Vector3()
let cicadaAmbientStarted=false,lastCicadaAmbientUpdateAt=-Infinity
const CICADA_LOOP_DURATION_MS=21.324*1000
let cicadaChorusEndsAt=0
let westernmostCicadaWasNear=false
const frogPondSource=[CAMPUS.buildings.building2.center[0],-92]
let frogAmbientStarted=false,lastFrogAmbientUpdateAt=-Infinity
const touchMoveInput=new THREE.Vector2()
let touchJoystickPointerId=null,touchLookPointerId=null,touchLookLastX=0,touchLookLastY=0,touchLookStartX=0,touchLookStartY=0,touchLookMoved=false,touchTapActivations=0
const touchLookPointers=new Map()
let touchBasketballHeldAtStart=false,touchBasketballMultiTouch=false,touchBasketballShootPointerId=null,touchBasketballResetTimer=0,touchBasketballResetPerformed=false
const arrivalConfig=CAMPUS.player.arrival
const arrivalMotionOverride=new URLSearchParams(location.search).get('arrivalMotion')
const reducedMotionQuery=matchMedia('(prefers-reduced-motion: reduce)')
const arrivalPositionStart=new THREE.Vector3(...arrivalConfig.start)
const arrivalControl1=new THREE.Vector3(...arrivalConfig.control1)
const arrivalControl2=new THREE.Vector3(...arrivalConfig.control2)
const arrivalPositionEnd=new THREE.Vector3(...CAMPUS.player.spawn)
const arrivalLookStart=new THREE.Vector3(...arrivalConfig.lookStart)
const arrivalLookEnd=new THREE.Vector3(...arrivalConfig.lookEnd)
const arrivalPositionSample=new THREE.Vector3(),arrivalLookSample=new THREE.Vector3()
let arrivalState={status:'idle',startedAt:null,progress:0}
const toast=document.querySelector('#toast')
const classroomGtaoPresets={outdoor:gtaoProfile.outdoor,indoor:gtaoProfile.indoor}
let indoorShadowExperimentEnabled=true,currentClassroomZone=null,indoorGtaoActive=false
let personalRoomCandidate=null,personalRoomCandidateSince=0,personalRoomCandidateRecorded=false
const buildingInteriorStreamingEnabled=new URLSearchParams(location.search).get('interiorStreaming')!=='off'
const CLASSROOM_DETAIL_ENTER_DISTANCE=3
const CLASSROOM_DETAIL_EXIT_DISTANCE=4.25
let activeClassroomDetailRooms=new Set()
let classroomDetailInteractionPin=null
let classroomLodVisible=true
function classroomZoneAt(position=camera.position) {
  const feetY=position.y-CAMPUS.player.eyeHeight
  return classroomInteriorZones.find(({floorY,bounds:[minX,maxX,minZ,maxZ]})=>
    position.x>=minX&&position.x<=maxX&&position.z>=minZ&&position.z<=maxZ&&feetY>=floorY-.08&&feetY<=floorY+.45
  )??null
}
function updatePersonalRoomVisit(now) {
  const room=mode==='seated'&&seatedState?.classroom?seatedState.classroom:classroomZoneAt()?.name??null
  if(room!==personalRoomCandidate){
    personalRoomCandidate=room;personalRoomCandidateSince=room?now:0
    personalRoomCandidateRecorded=Boolean(room&&personalRecords.snapshot().visitedRooms[room]);return
  }
  if(room&&!personalRoomCandidateRecorded&&now-personalRoomCandidateSince>=800){personalRecords.recordRoom(room);personalRoomCandidateRecorded=true}
}
function updateCicadaAmbient(now,force=false) {
  if(!cicadaAmbientStarted||(!force&&now-lastCicadaAmbientUpdateAt<250))return
  lastCicadaAmbientUpdateAt=now
  if(cicadaChorusEndsAt<=0) {
    const loopCount=1+Math.floor(Math.random()*2)
    cicadaChorusEndsAt=now+loopCount*CICADA_LOOP_DURATION_MS
  }
  if(document.hidden||!['walk','seated'].includes(mode)) {
    gameAudio.updateAmbient('cicadas',{volume:0,rampSeconds:.35})
    return
  }
  const westernmostDistance=Math.hypot(
    westernmostCicadaTree[0]-camera.position.x,westernmostCicadaTree[1]-camera.position.z,
  )
  const westernmostCicadaIsNear=westernmostDistance<=5
  if(westernmostCicadaIsNear&&!westernmostCicadaWasNear&&now>=cicadaChorusEndsAt) {
    cicadaChorusEndsAt=now+CICADA_LOOP_DURATION_MS
  }
  westernmostCicadaWasNear=westernmostCicadaIsNear
  let nearest=null,nearestDistance=Infinity
  for(const [x,z] of cicadaTreePositions) {
    const distance=Math.hypot(x-camera.position.x,z-camera.position.z)
    if(distance<nearestDistance){nearest=[x,z];nearestDistance=distance}
  }
  if(!nearest)return
  const proximity=1-THREE.MathUtils.smoothstep(nearestDistance,2.5,32)
  const indoor=mode==='seated'||Boolean(classroomZoneAt())
  const volume=now<cicadaChorusEndsAt?(.007+.084*proximity**1.35)*(indoor?.2:1):0
  camera.getWorldDirection(cicadaForward);cicadaForward.y=0;cicadaForward.normalize()
  cicadaRight.set(-cicadaForward.z,0,cicadaForward.x)
  const dx=nearest[0]-camera.position.x,dz=nearest[1]-camera.position.z
  const pan=nearestDistance>.001?THREE.MathUtils.clamp((dx*cicadaRight.x+dz*cicadaRight.z)/nearestDistance*.55,-.55,.55):0
  gameAudio.updateAmbient('cicadas',{volume,pan,rampSeconds:force?1.2:.7})
}
document.addEventListener('visibilitychange',()=>updateCicadaAmbient(performance.now(),true))
function updateFrogAmbient(now,force=false) {
  if(!frogAmbientStarted||(!force&&now-lastFrogAmbientUpdateAt<250))return
  lastFrogAmbientUpdateAt=now
  if(document.hidden||!['walk','seated'].includes(mode)) {
    gameAudio.updateAmbient('frogs',{volume:0,rampSeconds:.35})
    return
  }
  const zone=mode==='seated'&&seatedState
    ?classroomInteriorZones.find(item=>item.name===seatedState.classroom)??null
    :classroomZoneAt()
  const insideB2=Boolean(zone?.name.startsWith('b2-'))
  if(!insideB2) {
    gameAudio.updateAmbient('frogs',{volume:0,rampSeconds:.25})
    return
  }
  const floorNumber=Number(zone.name.match(/-floor-(\d+)$/)?.[1]??1)
  const floorAttenuation=[1,1,.55,.3][floorNumber]??.3
  // 原始池塘录音约 -51 LUFS，明显低于其他环境声；保留源文件不重编码，
  // 仅在二号楼教室内由独立 GainNode 做适度补偿，并随楼层升高继续衰减。
  const volume=1.08*floorAttenuation
  camera.getWorldDirection(cicadaForward);cicadaForward.y=0;cicadaForward.normalize()
  cicadaRight.set(-cicadaForward.z,0,cicadaForward.x)
  const dx=frogPondSource[0]-camera.position.x,dz=frogPondSource[1]-camera.position.z
  const distance=Math.hypot(dx,dz)
  const pan=distance>.001?THREE.MathUtils.clamp((dx*cicadaRight.x+dz*cicadaRight.z)/distance*.72,-.72,.72):0
  gameAudio.updateAmbient('frogs',{volume,pan,rampSeconds:force?1.1:.7})
}
document.addEventListener('visibilitychange',()=>updateFrogAmbient(performance.now(),true))
const classroomDoorDistanceSq=(zone,feetX,feetY,feetZ)=>{
  let nearest=Infinity
  for(const {position:[x,y,z]} of zone.doors) {
    const dx=feetX-x,dy=feetY-y,dz=feetZ-z
    nearest=Math.min(nearest,dx*dx+dy*dy+dz*dz)
  }
  return nearest
}
const hiddenClassroomDeskProxyMatrix=new THREE.Matrix4().makeScale(0,0,0)
let inactiveSceneTextureReleases=0
const collectObjectTextures=(object,target)=>{
  if(!object.material)return
  for(const material of Array.isArray(object.material)?object.material:[object.material]) {
    if(!material)continue
    for(const value of Object.values(material))if(value?.isTexture)target.add(value)
  }
}
const releaseInactiveSceneTextures=()=>{
  const visibleTextures=new Set(),inactiveTextures=new Set()
  camera.updateMatrixWorld(true)
  const projectionView=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)
  const frustum=new THREE.Frustum().setFromProjectionMatrix(projectionView)
  scene.traverse(object=>collectObjectTextures(
    object,
    isSceneObjectEffectivelyVisible(object)&&(
      !object.isMesh||!object.frustumCulled||frustum.intersectsObject(object)
    )?visibleTextures:inactiveTextures,
  ))
  let released=0
  for(const texture of inactiveTextures) {
    if(visibleTextures.has(texture))continue
    texture.dispose()
    released++
  }
  inactiveSceneTextureReleases+=released
  return released
}
function applyClassroomDetailRooms(desired,force=false,lodVisible=classroomLodVisible) {
  const unchanged=!force&&lodVisible===classroomLodVisible&&desired.size===activeClassroomDetailRooms.size&&[...desired].every(room=>activeClassroomDetailRooms.has(room))
  if(unchanged)return
  activeClassroomDetailRooms=desired
  classroomLodVisible=lodVisible
  classroomDeskProxyRoot.visible=lodVisible
  for(const zone of classroomInteriorZones) {
    const visible=desired.has(zone.name)
    ensureClassroomDetailRoots(zone.name).render.visible=visible
    ensureClassroomDetailRoots(zone.name).outline.visible=visible
  }
  for(const {mesh,records} of classroomLodProxyEntries) {
    for(const [index,record] of records.entries())mesh.setMatrixAt(
      index,desired.has(record.classroom)?hiddenClassroomDeskProxyMatrix:record.matrix,
    )
    mesh.instanceMatrix.needsUpdate=true
  }
  schoolEphemera?.setActiveRooms(desired)
  schoolBooks?.setActiveRooms(desired)
  comicBooks?.setActiveRooms(desired)
  syncHandheldClassroomLod(desired)
  releaseInactiveSceneTextures()
}
function syncBuildingInteriorStreaming(force=false) {
  const occupiedZone=mode==='seated'&&seatedState
    ?classroomInteriorZones.find(item=>item.name===seatedState.classroom)??null
    :classroomZoneAt()
  const feetX=camera.position.x,feetY=camera.position.y-(mode==='seated'?1.12:CAMPUS.player.eyeHeight),feetZ=camera.position.z
  const desired=new Set()
  for(const zone of classroomInteriorZones) {
    const threshold=activeClassroomDetailRooms.has(zone.name)
      ?CLASSROOM_DETAIL_EXIT_DISTANCE
      :CLASSROOM_DETAIL_ENTER_DISTANCE
    if(!buildingInteriorStreamingEnabled||zone===occupiedZone||zone.name===classroomDetailInteractionPin||classroomDoorDistanceSq(zone,feetX,feetY,feetZ)<=threshold*threshold)desired.add(zone.name)
  }
  applyClassroomDetailRooms(desired,force,buildingInteriorStreamingEnabled&&!occupiedZone)
}
function updateClassroomShadowPreset(force=false) {
  currentClassroomZone=classroomZoneAt()
  const nextIndoor=indoorShadowExperimentEnabled&&Boolean(currentClassroomZone)
  if(!force&&nextIndoor===indoorGtaoActive)return
  indoorGtaoActive=nextIndoor
  const preset=classroomGtaoPresets[nextIndoor?'indoor':'outdoor']
  gtaoPass.updateGtaoMaterial(preset)
  gtaoPass.blendIntensity=preset.blendIntensity
}

const indoorLightingActive=()=>Boolean(currentClassroomZone||(mode==='seated'&&seatedState?.classroom))
function updateIndoorLighting(dt,immediate=false) {
  const target=indoorLightingActive()
    ?performanceProfile.lighting.hemisphereIndoorIntensity
    :performanceProfile.lighting.hemisphereOutdoorIntensity
  hemisphere.intensity=immediate
    ?target
    :THREE.MathUtils.damp(hemisphere.intensity,target,performanceProfile.lighting.indoorTransitionLambda,dt)
}

function updateArtisticOutlineStyle() {
  artisticOutlineRoot.visible=artisticOutlinesEnabled
  const preset=performanceProfile.artisticOutlines[mode==='aerial'?'aerial':'near']
  artisticOutlineMaterials.primaryBase.opacity=preset.primaryBase
  artisticOutlineMaterials.primaryStroke.opacity=preset.primaryStroke
  artisticOutlineMaterials.secondaryBase.opacity=preset.secondaryBase
  artisticOutlineMaterials.secondaryStroke.opacity=preset.secondaryStroke
  artisticOutlineMaterials.foundationStroke.opacity=preset.foundationStroke
}

function terrainHeightAt(x,z) {
  const height=CAMPUS.terrain.platformHeight,{core}=eastHighlandBoundaries()
  if(pointInPolygon(x,z,core))return height
  return 0
}

function sandpitGroundHeightAt(x,z) {
  const f=CAMPUS.facilities.sandpit
  const inner=f.size[0]-f.rimWidth*2,half=inner/2-f.sandInset
  const localX=x-f.center[0]
  // Blender -Y 是校园南侧，导出到 glTF 后对应 Three.js +Z。
  const localY=-(z-f.center[1])
  if(Math.abs(localX)>half||Math.abs(localY)>half)return null
  const gaussian=(px,py,cx,cy,sx,sy)=>Math.exp(-(((px-cx)/sx)**2+((py-cy)/sy)**2)*2)
  let height=-.14
  height+=.038*Math.sin(localX*1.25+.4)*Math.cos(localY*1.08-.2)
  height+=.024*Math.sin(localX*2.1-localY*.65)
  height+=.072*gaussian(localX,localY,-1.28,.92,1.05,.78)
  height+=.062*gaussian(localX,localY,1.32,.36,.92,.68)
  height+=.050*gaussian(localX,localY,-.10,-.20,.78,.56)
  height+=.042*gaussian(localX,localY,.65,1.66,.70,.48)
  height-=.030*gaussian(localX,localY,-.55,1.52,.62,.48)
  const footprints=[
    [-1.70,-1.82,-.20,.13,.25],[-1.42,-1.58,-.13,.12,.24],[-.96,-2.02,.18,.13,.26],[-.68,-1.73,.22,.12,.24],
    [-.25,-1.48,-.08,.13,.25],[.05,-1.27,-.02,.12,.23],[.62,-2.08,.12,.14,.27],[.88,-1.75,.08,.12,.24],
    [1.38,-1.58,-.24,.13,.25],[1.62,-1.31,-.18,.12,.23],[-1.28,-.95,.08,.12,.24],[1.12,-.84,-.12,.12,.24],
  ]
  for(const [cx,cy,angle,sx,sy] of footprints) {
    const cos=Math.cos(angle),sin=Math.sin(angle),dx=localX-cx,dy=localY-cy
    const rx=dx*cos+dy*sin,ry=-dx*sin+dy*cos
    height-=.034*Math.exp(-((rx/sx)**2+(ry/sy)**2)*2.2)
  }
  for(const [cx,cy,sx,sy,amount] of [[-1.15,-2,.50,.34,.068],[0,-1.72,.62,.40,.082],[1.10,-2.02,.52,.35,.072]]) {
    height-=amount*gaussian(localX,localY,cx,cy,sx,sy)
  }
  const edge=Math.max(Math.abs(localX),Math.abs(localY))/(inner/2)
  const edgeBlend=Math.max(0,edge-.84)/.16
  height=height*(1-edgeBlend)+(-.155)*edgeBlend
  return f.placementY+THREE.MathUtils.clamp(height,-.22,-.035)
}

function activitySandGroundHeightAt(x,z) {
  const activity=CAMPUS.facilities.activity
  // 只在水泥圈内槽返回下沉沙面高度；窄边框区域继续使用高台高度。
  for(const config of [activity.upperSand,activity.lowerSand,activity.southwestSand]) {
    const halfWidth=config.size[0]/2-config.rimWidth
    const halfDepth=config.size[1]/2-config.rimWidth
    if(Math.abs(x-config.center[0])<=halfWidth&&Math.abs(z-config.center[1])<=halfDepth) {
      const localX=x-config.center[0],localZ=z-config.center[1]
      const relief=config===activity.upperSand ? 0.022 : 0.016
      let height=config.placementY-config.recessDepth
      height+=relief*.44*Math.sin(localX*.82+.35)*Math.cos(localZ*1.18-.25)
      height+=relief*.24*Math.sin(localX*1.58-localZ*.52)
      height+=relief*.16*Math.cos(localX*.36+localZ*1.82)
      return THREE.MathUtils.clamp(height,config.placementY-.142,config.placementY-.072)
    }
  }
  return null
}

function pointInPolygon(x,z,points) {
  let inside=false
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,zi]=points[i],[xj,zj]=points[j]
    if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi)) inside=!inside
  }
  return inside
}

function groundSurfaceAt(x,z) {
  const {core}=eastHighlandBoundaries(),zones=CAMPUS.terrain.groundZones,highland=CAMPUS.terrain.eastHighland
  if(activitySandGroundHeightAt(x,z)!=null)return 'activity-sand'
  if(sandpitGroundHeightAt(x,z)!=null)return 'activity-sand'
  const road=highland.concreteRoad
  const roadPoints=concreteRoadSamples()
  for(let i=0;i<roadPoints.length-1;i++) {
    const a=roadPoints[i],b=roadPoints[i+1]
    if(distanceToSegment(x,z,a[0],a[1],b[0],b[1])<=road.width/2)return 'aged-concrete-road'
  }
  if(pointInPolygon(x,z,core))return 'highland-compacted-dirt'
  if(pointInPolygon(x,z,zones.portalConcrete)||pointInPolygon(x,z,zones.mainConcrete)||pointInPolygon(x,z,zones.serviceConcrete))return 'aged-concrete'
  return 'compacted-dirt'
}

function footstepAudioGroupAt(x,z,feetY) {
  // 楼梯可行走面已有稳定命名；复用导航代理判断，避免为脚步声扫描渲染场景。
  const onStairs=walkSurfaces.some(surface=>
    /(?:stair|step)/.test(surface.name)&&
    walkSurfaceContains(surface,x,z)&&
    Math.abs(walkSurfaceHeightAt(surface,x,z)-feetY)<.08
  )
  if(onStairs)return 'footstepsStairs'
  if(groundSurfaceAt(x,z)==='activity-sand')return 'footstepsSand'
  return 'footsteps'
}

function walkSurfaceContains(surface,x,z) {
  return navigation.surfaceContains(surface,x,z)
}

function walkSurfaceHeightAt(surface,x,z) {
  return navigation.surfaceHeightAt(surface,x,z)
}

function groundHeightAt(x,z,reference=0) {
  return navigation.groundHeightAt(x,z,reference)
}

function distanceToSegment(px,pz,ax,az,bx,bz) {
  const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz,t=l2?Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/l2)):0
  return Math.hypot(px-(ax+t*dx),pz-(az+t*dz))
}

function blocked(x,z,y) {
  return navigation.blocked(x,z,y)
}

function movePlayer(dx,dz) {
  return navigation.move(camera.position,dx,dz)
}

const sampleCubicBezier=(target,a,b,c,d,t)=>target.copy(a).multiplyScalar((1-t)**3)
  .addScaledVector(b,3*(1-t)**2*t)
  .addScaledVector(c,3*(1-t)*t*t)
  .addScaledVector(d,t**3)

function prepareArrivalView() {
  mode='arrival';orbit.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  perimeterEnvironment.syncMode(mode)
  document.body.classList.remove('walking','seated','fallback-controls','fallback-dragging')
  document.body.classList.add('arriving')
  touchControls.setAttribute('aria-hidden','true')
  camera.position.copy(arrivalPositionStart)
  camera.lookAt(arrivalLookStart)
  arrivalState={status:'prepared',startedAt:null,progress:0}
}

function finishArrivalFlight() {
  camera.position.copy(arrivalPositionEnd);camera.rotation.set(0,0,0)
  arrivalState={status:'complete',startedAt:arrivalState.startedAt,progress:1}
  document.body.classList.remove('arriving')
  enterWalk(false,false)
  gameAudio.startAmbient('cicadas',{volume:0})
  cicadaAmbientStarted=true
  updateCicadaAmbient(performance.now(),true)
  gameAudio.startAmbient('frogs',{volume:0})
  frogAmbientStarted=true
  updateFrogAmbient(performance.now(),true)
  gameAudio.play('uiConfirm',{volume:.42,rate:.82})
}

function startArrivalFlight() {
  if(arrivalState.status==='running'||arrivalState.status==='complete')return
  if(shouldReduceArrivalMotion()){finishArrivalFlight();return}
  arrivalState={status:'running',startedAt:performance.now(),progress:0}
}

function shouldReduceArrivalMotion() {
  return arrivalMotionOverride==='0'||(arrivalMotionOverride!=='1'&&(reducedMotionQuery.matches||automatedTestBuild))
}

function updateArrivalFlight(now) {
  if(arrivalState.status!=='running')return
  const linearProgress=THREE.MathUtils.clamp((now-arrivalState.startedAt)/arrivalConfig.durationMs,0,1)
  // 二次缓出从一开始就有明显速度，并持续减速到柔和落地；贝塞尔控制点
  // 只负责保留已确认的东南侧下降弧线，不再额外加入前段缓入。
  const easedProgress=1-(1-linearProgress)**2
  sampleCubicBezier(arrivalPositionSample,arrivalPositionStart,arrivalControl1,arrivalControl2,arrivalPositionEnd,easedProgress)
  arrivalLookSample.lerpVectors(arrivalLookStart,arrivalLookEnd,easedProgress)
  camera.position.copy(arrivalPositionSample)
  camera.lookAt(arrivalLookSample)
  arrivalState.progress=linearProgress
  if(linearProgress>=1)finishArrivalFlight()
}

function resetTouchControls() {
  if(touchJoystickPointerId!=null&&touchJoystick.hasPointerCapture?.(touchJoystickPointerId))touchJoystick.releasePointerCapture(touchJoystickPointerId)
  if(touchBasketballShootPointerId!=null&&touchLookZone.hasPointerCapture?.(touchBasketballShootPointerId))touchLookZone.releasePointerCapture(touchBasketballShootPointerId)
  clearTimeout(touchBasketballResetTimer);touchBasketballResetTimer=0
  basketballGame?.cancelCharge()
  touchMoveInput.set(0,0)
  touchJoystickPointerId=null;touchLookPointerId=null;touchLookMoved=false;touchLookPointers.clear();touchBasketballShootPointerId=null
  touchBasketballHeldAtStart=false;touchBasketballMultiTouch=false;touchBasketballResetPerformed=false
  touchJoystickKnob.style.transform='translate3d(0,0,0)'
  touchJoystick.classList.remove('active');touchLookZone.classList.remove('active')
}

function enterWalk(reset=true,requestPointerLock=true) {
  if(minigamePause.active)clearMinigamePause()
  const previousMode=mode
  const returningFromAerial=!reset&&previousMode==='aerial'&&aerialReturnState
  if(pingPongGame?.snapshot().status==='active')pingPongGame.exit()
  if(bambooClimbGame?.snapshot().status==='active')bambooClimbGame.exit()
  if(longJumpGame?.snapshot().status==='active')longJumpGame.exit()
  if(hopscotchGame?.snapshot().status==='active')hopscotchGame.exit()
  if(shuttlecockGame?.snapshot().status==='active')shuttlecockGame.exit()
  if(jacksGame?.snapshot().status==='active')jacksGame.exit()
  if(octopusHandheldGame?.snapshot().status==='active')octopusHandheldGame.exit()
  if(fireHandheldGame?.snapshot().status==='active')fireHandheldGame.exit()
  if(rubiksCubeGame?.isActive())rubiksCubeGame.exit()
  if(slingshotGame?.snapshot().status==='active')slingshotGame.exit()
  if(reset)basketballGame?.resetSession()
  seatedState=null;document.body.classList.remove('seated')
  mode='walk'; orbit.enabled=false; document.body.classList.add('walking')
  perimeterEnvironment.syncMode(mode)
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  webglHud.setViewMode('walk')
  if(reset||(previousMode==='aerial'&&!returningFromAerial)) {
    camera.position.fromArray(CAMPUS.player.spawn);camera.rotation.set(0,0,0)
  } else if(returningFromAerial) {
    camera.position.copy(aerialReturnState.position);camera.quaternion.copy(aerialReturnState.quaternion)
    aerialReturnState=null
  }
  if(touchModePreferred) {
    document.body.classList.remove('fallback-controls','fallback-dragging')
    renderer.domElement.focus({preventScroll:true})
  } else if(pointerLockAvailable) {
    document.body.classList.remove('fallback-controls')
    if(pointer.isLocked||requestPointerLock) {
      if(!pointer.isLocked)requestGamePointerLock()
    } else {
      renderer.domElement.focus({preventScroll:true})
    }
  } else {
    document.body.classList.add('fallback-controls')
    renderer.domElement.focus({preventScroll:true})
  }
  pointWalkController.setEnabled(true)
  if(!onboardingShown){onboardingShown=true;webglHud.showTutorial(touchModePreferred?'mobile':'desktop')}
}

function enterAerial() {
  if(chalkThrowing?.hasHeld()){showToast('请先把手里的粉笔抛出');return}
  if(basketballGame?.hasHeld()){showToast('请先把手里的篮球投出或复位');return}
  if(pingPongGame?.snapshot().status==='active'){showToast('请先离开乒乓球模式');return}
  if(bambooClimbGame?.snapshot().status==='active'){showToast('请先离开爬竹竿模式');return}
  if(longJumpGame?.snapshot().status==='active'){showToast('请先离开跳远模式');return}
  if(shuttlecockGame?.snapshot().status==='active'){showToast('请先离开踢毽子模式');return}
  if(jacksGame?.snapshot().status==='active'){showToast('请先离开抓石子模式');return}
  if(octopusHandheldGame?.snapshot().status==='active'){showToast('请先离开掌机模式');return}
  if(fireHandheldGame?.snapshot().status==='active'){showToast('请先离开掌机模式');return}
  if(rubiksCubeGame?.isActive()){showToast('请先退出魔方');return}
  if(slingshotGame?.snapshot().status==='active'){showToast('请先放下弹弓');return}
  if(flagRaisingGame?.snapshot().status==='active'){showToast('请先离开升旗台');return}
  if(mode==='walk')aerialReturnState={position:camera.position.clone(),quaternion:camera.quaternion.clone()}
  seatedState=null;document.body.classList.remove('seated')
  mode='aerial'; if(pointer.isLocked)pointer.unlock(); document.body.classList.remove('walking','fallback-controls','fallback-dragging'); orbit.enabled=true
  perimeterEnvironment.syncMode(mode)
  fallbackLookDragging=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  camera.position.fromArray(CAMPUS.player.aerial.position); orbit.target.fromArray(CAMPUS.player.aerial.target); orbit.update()
  webglHud.setViewMode('aerial')
}

let slingshotReturnState=null,slingshotTutorialShown=false
function beginSlingshotMode() {
  if(mode!=='walk'||chalkThrowing?.hasHeld()||basketballGame?.hasHeld())return false
  if(pingPongGame?.snapshot().status==='active'||bambooClimbGame?.snapshot().status==='active'||longJumpGame?.snapshot().status==='active')return false
  slingshotReturnState={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,wasPointerLocked:pointer.isLocked}
  camera.fov=CAMPUS.facilities.slingshotCorner.game.aimingFov;camera.updateProjectionMatrix()
  mode='slingshot';orbit.enabled=false;pointer.enabled=true;keys.clear();velocity.set(0,0,0);resetTouchControls()
  fallbackLookDragging=false;document.body.classList.remove('walking','fallback-controls','fallback-dragging');document.body.classList.add('slingshot-mode')
  touchControls.setAttribute('aria-hidden','true')
  if(!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  return true
}
function finishSlingshotMode() {
  if(!slingshotReturnState)return
  const previous=slingshotReturnState;slingshotReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  document.body.classList.remove('slingshot-mode');document.body.classList.add('walking');touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
}
function announceSlingshotEvent(event) {
  if(event.type==='slingshot-enter'){
    webglHud.prepareArcadeComicGame('slingshot')
    if(!slingshotTutorialShown){slingshotTutorialShown=true;webglHud.showMinigameTutorial(touchModePreferred?'slingshot-mobile':'slingshot-desktop',7200)}
  }
  else if(event.type==='slingshot-charge-start'||event.type==='slingshot-game-charge-start')gameAudio.play('uiClick',{volume:.16,rate:.72})
  else if(event.type==='slingshot-shot')gameAudio.play('basketballBounce',{volume:.52,rate:1.2+(event.pullRatio??0)*.08})
  else if(event.type==='slingshot-projectile-bounce')gameAudio.playThrottled('chalkImpact',45,{volume:.12+Math.min(event.speed??0,8)*.025,rate:1.12+event.bounce*.08})
  else if(event.type==='slingshot-hit'){
    gameAudio.play('chalkImpact',{volume:.34,rate:event.targetType==='hanging'?.82:.72})
    webglHud.playArcadeComicCelebration('slingshot','hit','hit',950)
  }
  else if(event.type==='slingshot-miss')webglHud.playArcadeComicCelebration('slingshot','miss','plain',850)
  else if(event.type==='slingshot-select'||event.type==='slingshot-distance')gameAudio.play('uiClick',{volume:.20,rate:1.04})
  else if(event.type==='slingshot-tremor-start')gameAudio.play('uiClick',{volume:.11,rate:.58})
  else if(event.type==='slingshot-exit')webglHud.stopArcadeComicCelebration('slingshot')
}

let longJumpReturnState=null
function beginLongJumpMode() {
  if(mode!=='walk')return false
  if(chalkThrowing?.hasHeld()){showToast('请先把手里的粉笔抛出');return false}
  if(basketballGame?.hasHeld()){showToast('请先把手里的篮球投出或复位');return false}
  if(pingPongGame?.snapshot().status==='active'||bambooClimbGame?.snapshot().status==='active')return false
  longJumpReturnState={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,wasPointerLocked:pointer.isLocked}
  mode='longJump';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  fallbackLookDragging=false;document.body.classList.remove('walking','fallback-controls','fallback-dragging')
  document.body.classList.add('long-jump-mode');touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  return true
}

function finishLongJumpMode() {
  if(!longJumpReturnState)return
  const previous=longJumpReturnState;longJumpReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  document.body.classList.remove('long-jump-mode');document.body.classList.add('walking')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast('已离开跳远模式')
}

function announceLongJumpEvent(event) {
  if(event.type==='long-jump-charge-start')gameAudio.play('uiClick',{volume:.34,rate:1.05})
  else if(event.type==='long-jump-launch'){
    webglHud.playArcadeComicCelebration('longJump','jump','plain',800)
    gameAudio.play('longJumpTakeoff',{volume:.72,rate:event.overrun?.88:1})
    gameAudio.play('longJumpAir',{volume:.42,rate:event.overrun?.92:1})
  }
  else if(event.type==='long-jump-land')gameAudio.play('longJumpLand',{volume:.86,rate:event.overrun?.94:1})
  else if(event.type==='long-jump-result'){
    const phrase=event.overrun?'overrun':event.distance>=2?'far':event.distance>=1.6?'good':event.distance>=1.3?'again':'more'
    if(event.distance>=2&&!event.overrun){
      webglHud.playArcadeComicCelebration('longJump',phrase,'major',1100)
      gameAudio.play('uiConfirm',{volume:.52,rate:1.2})
    }else webglHud.playArcadeComicCelebration('longJump',phrase,'plain',1000)
  }
}

let jacksReturnState=null
function beginJacksMode() {
  if(mode!=='walk'||chalkThrowing?.hasHeld()||basketballGame?.hasHeld())return false
  if(pingPongGame?.snapshot().status==='active'||bambooClimbGame?.snapshot().status==='active'||longJumpGame?.snapshot().status==='active'||hopscotchGame?.snapshot().status==='active'||shuttlecockGame?.snapshot().status==='active')return false
  jacksReturnState={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,wasPointerLocked:pointer.isLocked}
  mode='jacks';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  if(pointer.isLocked)pointer.unlock()
  fallbackLookDragging=false;document.body.classList.remove('walking','fallback-controls','fallback-dragging')
  document.body.classList.add('jacks-mode');touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  return true
}

function finishJacksMode() {
  if(!jacksReturnState)return
  const previous=jacksReturnState;jacksReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  document.body.classList.remove('jacks-mode');document.body.classList.add('walking')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast('已离开抓石子')
}

function announceJacksEvent(event) {
  if(event.type==='jacks-enter')webglHud.prepareArcadeComicGame('jacks')
  else if(event.type==='jacks-scatter')gameAudio.play('chalkImpact',{volume:.14,rate:.72})
  else if(event.type==='jacks-toss')gameAudio.play('uiClick',{volume:.16,rate:.88})
  else if(event.type==='jacks-gather')gameAudio.play('chalkPickup',{volume:.18,rate:.82})
  else if(event.type==='jacks-catch'||event.type==='jacks-stage-complete'){
    gameAudio.play('uiConfirm',{volume:.20,rate:event.type==='jacks-stage-complete'?1.02:.9})
    if(event.type==='jacks-stage-complete')webglHud.playArcadeComicCelebration('jacks',event.stage===1?'stage-one':event.stage===2?'stage-two':'stage-three','hit',1000)
  }
  else if(event.type==='jacks-failure'){
    gameAudio.play('uiClick',{volume:.16,rate:.68})
    webglHud.playArcadeComicCelebration('jacks',event.reason==='disturbed'?'disturbed':event.reason==='missed-catch'?'miss':event.reason==='timeout'?'hurry':'again','plain',950)
  }
  else if(event.type==='jacks-complete'){gameAudio.play('uiConfirm',{volume:.26,rate:1.08});webglHud.playArcadeComicCelebration('jacks','complete','major',1100)}
  else if(event.type==='jacks-exit')webglHud.stopArcadeComicCelebration('jacks')
}

let hopscotchReturnState=null
function beginHopscotchMode() {
  if(mode!=='walk')return false
  if(chalkThrowing?.hasHeld()){showToast('请先把手里的粉笔抛出');return false}
  if(basketballGame?.hasHeld()){showToast('请先把手里的篮球投出或复位');return false}
  hopscotchReturnState={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,wasPointerLocked:pointer.isLocked}
  mode='hopscotch';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  fallbackLookDragging=false;document.body.classList.remove('walking','fallback-controls','fallback-dragging');document.body.classList.add('hopscotch-mode')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true');return true
}
function finishHopscotchMode() {
  if(!hopscotchReturnState)return
  const previous=hopscotchReturnState;hopscotchReturnState=null;mode='walk';pointer.enabled=true
  camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  document.body.classList.remove('hopscotch-mode');document.body.classList.add('walking');touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock();showToast('已离开跳房子')
}
function announceHopscotchEvent(event) {
  if(event.type==='hopscotch-enter')webglHud.prepareArcadeComicGame('hopscotch')
  else if(event.type==='hopscotch-throw-release')gameAudio.play('basketballThrow',{volume:.13,rate:1.18})
  else if(event.type==='hopscotch-tile-impact')gameAudio.play('chalkImpact',{volume:.42,rate:.68})
  else if(event.type==='hopscotch-hop-land'){
    if(event.footMode==='double'){
      gameAudio.play('footsteps',{volume:.46,rate:.79,pan:-.13})
      gameAudio.play('footsteps',{volume:.42,rate:.75,pan:.13})
    }else gameAudio.play('footsteps',{volume:.52,rate:.86,pan:event.cell%2?-.1:.1})
  }
  else if(event.type==='hopscotch-pickup')gameAudio.play('chalkPickup',{volume:.38,rate:.72})
  else if(event.type==='hopscotch-throw-settled')webglHud.playArcadeComicCelebration('hopscotch','throw-good','plain',900)
  else if(event.type==='hopscotch-round-complete'){
    gameAudio.play('uiConfirm',{volume:.38,rate:1.08})
    webglHud.playArcadeComicCelebration('hopscotch',event.courseComplete?'complete':'round',event.courseComplete?'major':'hit',event.courseComplete?1100:1000)
  }
  else if(event.type==='hopscotch-fault'){
    gameAudio.play('uiClick',{volume:.28,rate:.72})
    const reason=String(event.reason??'')
    const phrase=reason.includes('踩线')||reason.includes('压线')?'line':reason.includes('投错格')?'wrong-tile':reason.includes('双格')||reason.includes('单脚')||reason.includes('跳错格')||reason.includes('踩进')?'wrong-feet':'throw-wide'
    webglHud.playArcadeComicCelebration('hopscotch',phrase,'plain',950)
  }else if(event.type==='hopscotch-exit')webglHud.stopArcadeComicCelebration('hopscotch')
}

let shuttlecockReturnState=null
function beginShuttlecockMode() {
  if(mode!=='walk')return false
  if(chalkThrowing?.hasHeld()){showToast('请先把手里的粉笔抛出');return false}
  if(basketballGame?.hasHeld()){showToast('请先把手里的篮球投出或复位');return false}
  if(pingPongGame?.snapshot().status==='active'||bambooClimbGame?.snapshot().status==='active'||longJumpGame?.snapshot().status==='active')return false
  shuttlecockReturnState={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,wasPointerLocked:pointer.isLocked}
  mode='shuttlecock';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  fallbackLookDragging=false;document.body.classList.remove('walking','fallback-controls','fallback-dragging')
  document.body.classList.add('shuttlecock-mode');touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  return true
}

function finishShuttlecockMode() {
  if(!shuttlecockReturnState)return
  const previous=shuttlecockReturnState;shuttlecockReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  document.body.classList.remove('shuttlecock-mode');document.body.classList.add('walking')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast('已离开踢毽子模式')
}

function announceShuttlecockEvent(event) {
  if(event.type==='shuttlecock-enter')gameAudio.play('uiClick',{volume:.26,rate:1.05})
  else if(event.type==='shuttlecock-serve')gameAudio.play('uiClick',{volume:.26,rate:1.05})
  else if(event.type==='shuttlecock-kick'){
    gameAudio.play('shuttlecockKick',{volume:.38,rate:event.foot==='left'?.72:.76,pan:event.foot==='left'?-.08:.08})
    if(event.newBest&&event.streak>=5)shuttlecockGame?.playGroundTitle('record','major',1100)
    else if(event.streak>0&&event.streak%10===0)shuttlecockGame?.playGroundTitle('ten','hit',1000)
  }
  else if(event.type==='shuttlecock-miss'){
    gameAudio.play('uiClick',{volume:.18,rate:.76})
    shuttlecockGame?.playGroundTitle(event.reason==='wrong-foot'?'switch-foot':'watch','plain',900)
  }
  else if(event.type==='shuttlecock-drop'){
    gameAudio.play('footsteps',{volume:.18,rate:.86})
    shuttlecockGame?.playGroundTitle(event.reason==='ground'?'miss':'again','plain',950)
  }else if(event.type==='shuttlecock-exit'){shuttlecockGame?.stopGroundTitle();webglHud.stopArcadeComicCelebration('shuttlecock')}
}

let bambooClimbReturnState=null
function beginBambooClimbMode({index}) {
  if(mode!=='walk'||chalkThrowing?.hasHeld()||basketballGame?.hasHeld()||pingPongGame?.snapshot().status==='active')return false
  bambooClimbReturnState={
    position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,
    wasPointerLocked:pointer.isLocked,pole:index,
  }
  mode='bambooClimb';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  fallbackLookDragging=false;document.body.classList.remove('walking','fallback-controls','fallback-dragging')
  document.body.classList.add('bamboo-climb-mode');touchControls.setAttribute('aria-hidden','true')
  return true
}

function finishBambooClimbMode() {
  if(!bambooClimbReturnState)return
  const previous=bambooClimbReturnState;bambooClimbReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  document.body.classList.add('walking');document.body.classList.remove('bamboo-climb-mode')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast('已离开爬竹竿模式')
}

let octopusHandheldReturnState=null
function beginOctopusHandheldMode({classroom}) {
  if(mode!=='walk'||chalkThrowing?.hasHeld()||basketballGame?.hasHeld()||pingPongGame?.snapshot().status==='active'||bambooClimbGame?.snapshot().status==='active')return false
  octopusHandheldReturnState={
    position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,
    wasPointerLocked:pointer.isLocked,previousDetailPin:classroomDetailInteractionPin,classroom,
  }
  mode='handheldOctopus';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  if(pointer.isLocked)pointer.unlock()
  fallbackLookDragging=false;classroomDetailInteractionPin=classroom
  applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,classroom]),true)
  document.body.classList.remove('walking','fallback-controls','fallback-dragging')
  document.body.classList.add('handheld-octopus-mode');touchControls.setAttribute('aria-hidden','true')
  updateCicadaAmbient(performance.now(),true);updateFrogAmbient(performance.now(),true)
  return true
}

function finishOctopusHandheldMode() {
  if(!octopusHandheldReturnState)return
  const previous=octopusHandheldReturnState;octopusHandheldReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  classroomDetailInteractionPin=previous.previousDetailPin
  document.body.classList.remove('handheld-octopus-mode');document.body.classList.add('walking')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  syncBuildingInteriorStreaming(true);updateCicadaAmbient(performance.now(),true);updateFrogAmbient(performance.now(),true)
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast('已收起掌机')
}

let fireHandheldReturnState=null
function beginFireHandheldMode({classroom}) {
  if(mode!=='walk'||chalkThrowing?.hasHeld()||basketballGame?.hasHeld()||pingPongGame?.snapshot().status==='active'||bambooClimbGame?.snapshot().status==='active'||octopusHandheldGame?.snapshot().status==='active')return false
  fireHandheldReturnState={
    position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,
    wasPointerLocked:pointer.isLocked,previousDetailPin:classroomDetailInteractionPin,classroom,
  }
  mode='handheldFire';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  if(pointer.isLocked)pointer.unlock()
  fallbackLookDragging=false;classroomDetailInteractionPin=classroom
  applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,classroom]),true)
  document.body.classList.remove('walking','fallback-controls','fallback-dragging')
  document.body.classList.add('handheld-fire-mode');touchControls.setAttribute('aria-hidden','true')
  updateCicadaAmbient(performance.now(),true);updateFrogAmbient(performance.now(),true)
  return true
}

function finishFireHandheldMode() {
  if(!fireHandheldReturnState)return
  const previous=fireHandheldReturnState;fireHandheldReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  classroomDetailInteractionPin=previous.previousDetailPin
  document.body.classList.remove('handheld-fire-mode');document.body.classList.add('walking')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  syncBuildingInteriorStreaming(true);updateCicadaAmbient(performance.now(),true);updateFrogAmbient(performance.now(),true)
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast('已收起掌机')
}

let rubiksCubeReturnState=null
function beginRubiksCubeMode({classroom}) {
  if((mode!=='walk'&&mode!=='seated')||chalkThrowing?.hasHeld()||basketballGame?.hasHeld()){
    if(chalkThrowing?.hasHeld()||basketballGame?.hasHeld())showToast('请先放下手里的物品')
    return false
  }
  rubiksCubeReturnState={mode,wasPointerLocked:pointer.isLocked,previousDetailPin:classroomDetailInteractionPin,classroom}
  mode='rubiksCube';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  pointWalkController.cancel('rubiks-cube-enter')
  if(pointer.isLocked)pointer.unlock()
  fallbackLookDragging=false;classroomDetailInteractionPin=classroom
  applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,classroom]),true)
  document.body.classList.remove('walking','seated','fallback-controls','fallback-dragging')
  document.body.classList.add('rubiks-cube-mode');touchControls.setAttribute('aria-hidden','true')
  updateCicadaAmbient(performance.now(),true);updateFrogAmbient(performance.now(),true)
  return true
}

function finishRubiksCubeMode() {
  if(!rubiksCubeReturnState)return
  const previous=rubiksCubeReturnState;rubiksCubeReturnState=null
  mode=previous.mode;pointer.enabled=true;classroomDetailInteractionPin=previous.previousDetailPin
  document.body.classList.remove('rubiks-cube-mode')
  document.body.classList.toggle('walking',mode==='walk'||mode==='seated')
  document.body.classList.toggle('seated',mode==='seated')
  touchControls.setAttribute('aria-hidden',touchModePreferred&&mode==='walk'?'false':'true')
  syncBuildingInteriorStreaming(true);updateCicadaAmbient(performance.now(),true);updateFrogAmbient(performance.now(),true)
  if(previous.wasPointerLocked&&mode==='walk'&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast('已放下魔方')
}

function announceRubiksCubeEvent(event) {
  if(event.type==='rubiks-cube-enter')gameAudio.play('uiClick',{volume:.3,rate:.92})
  else if(event.type==='rubiks-cube-complete')gameAudio.play('uiConfirm',{volume:.5,rate:1.16})
}

function announceBambooClimbEvent(event) {
  if(event.type==='bamboo-climb-rise'){
    if(event.perfect)webglHud.playArcadeComicCelebration('bambooClimb','power','hit',850)
    else webglHud.playArcadeComicCelebration('bambooClimb','steady','plain',800)
    gameAudio.play('uiConfirm',{volume:.34,rate:event.perfect?1.14:1.02})
  }
  else if(event.type==='bamboo-climb-failure'){
    webglHud.playArcadeComicCelebration('bambooClimb','slip','plain',1000,'again')
    gameAudio.play('uiClick',{volume:.28,rate:.74})
  }
  else if(event.type==='bamboo-climb-complete'){
    webglHud.playArcadeComicCelebration('bambooClimb','top','major',1100)
    gameAudio.play('uiConfirm',{volume:.55,rate:1.22})
  }
  else if(event.type==='bamboo-climb-slide-start')gameAudio.play('uiClick',{volume:.3,rate:.82})
}

let flagRaisingReturnState=null
function beginFlagRaisingMode() {
  if(mode!=='walk')return false
  if(chalkThrowing?.hasHeld()){showToast('请先把手里的粉笔抛出');return false}
  if(basketballGame?.hasHeld()){showToast('请先把手里的篮球投出或复位');return false}
  flagRaisingReturnState={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,wasPointerLocked:pointer.isLocked}
  mode='flagRaising';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls();pointWalkController.cancel('flag-raising-enter')
  pointerLockRequestPending=false;if(pointer.isLocked)pointer.unlock()
  fallbackLookDragging=false;document.body.classList.remove('walking','fallback-controls','fallback-dragging');document.body.classList.add('flag-raising-mode')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  return true
}

function finishFlagRaisingMode() {
  if(!flagRaisingReturnState)return
  const previous=flagRaisingReturnState;flagRaisingReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.fov=previous.fov;camera.updateProjectionMatrix()
  document.body.classList.remove('flag-raising-mode');document.body.classList.add('walking')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast(flagRaisingGame?.snapshot().completed?'国旗已经升起':'已离开升旗台')
}

function announceFlagRaisingEvent(event) {
  if(event.type==='flag-raising-enter')gameAudio.play('flagRopeGrab',{volume:.22,rate:.9})
  else if(event.type==='flag-raising-grab')gameAudio.play('flagRopeGrab',{volume:.18,rate:1.02})
  else if(event.type==='flag-raising-pull')gameAudio.playThrottled('flagRopePull',110,{volume:.16+Math.min(.12,(event.delta??0)*.7),rate:.86+(event.progress??0)*.08})
  else if(event.type==='flag-raising-regrip')gameAudio.play('flagRopeTap',{volume:.16,rate:event.cancelled?.82:.96})
  else if(event.type==='flag-raising-complete')gameAudio.play('flagRaisingComplete',{volume:.44,rate:1.04})
}

let pingPongReturnState=null
const syncPingPongProjection=()=>{
  const game=CAMPUS.facilities.pingPong.game
  const portraitVerticalFov=THREE.MathUtils.radToDeg(2*Math.atan(
    Math.tan(THREE.MathUtils.degToRad(game.cameraMinHorizontalFov/2))/camera.aspect,
  ))
  camera.fov=touchModePreferred&&innerHeight>innerWidth
    ?Math.min(game.cameraMaxPortraitVerticalFov,portraitVerticalFov)
    :game.cameraVerticalFov
  camera.updateProjectionMatrix()
}
const beginPingPongMode=(table,index)=>{
  if(mode!=='walk'||chalkThrowing?.hasHeld()||basketballGame?.hasHeld())return false
  pingPongReturnState={
    mode,position:camera.position.clone(),quaternion:camera.quaternion.clone(),
    wasPointerLocked:pointer.isLocked,table:index,
  }
  mode='pingPong';orbit.enabled=false;pointer.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  fallbackLookDragging=false;document.body.classList.remove('walking','fallback-controls','fallback-dragging')
  touchControls.setAttribute('aria-hidden','true')
  camera.position.fromArray(table.playerStation);camera.lookAt(...table.cameraTarget);syncPingPongProjection()
  return true
}

const finishPingPongMode=()=>{
  if(!pingPongReturnState)return
  const previous=pingPongReturnState;pingPongReturnState=null
  mode='walk';pointer.enabled=true;camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);syncCameraProjection()
  document.body.classList.add('walking');document.body.classList.remove('ping-pong-mode')
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&!pointer.isLocked)requestGamePointerLock()
  showToast('已离开乒乓球模式')
}

const classroomSeatingById=new Map(classroomSeatingInteractions.map(interaction=>{
  const center=new THREE.Vector3(...interaction.center)
  const half=new THREE.Vector3(...interaction.size).multiplyScalar(.5)
  interaction.bounds=new THREE.Box3(center.clone().sub(half),center.clone().add(half))
  return [interaction.id,interaction]
}))
const classroomSeatingByRoom=new Map()
const CLASSROOM_SEATING_CELL_SIZE=4
const classroomSeatingSpatialGrid=new Map()
for(const interaction of classroomSeatingInteractions) {
  if(!classroomSeatingByRoom.has(interaction.classroom))classroomSeatingByRoom.set(interaction.classroom,[])
  classroomSeatingByRoom.get(interaction.classroom).push(interaction)
  const key=`${Math.floor(interaction.center[0]/CLASSROOM_SEATING_CELL_SIZE)},${Math.floor(interaction.center[2]/CLASSROOM_SEATING_CELL_SIZE)}`
  if(!classroomSeatingSpatialGrid.has(key))classroomSeatingSpatialGrid.set(key,[])
  classroomSeatingSpatialGrid.get(key).push(interaction)
}
const seatingRaycaster=new THREE.Raycaster()
const seatingPointer=new THREE.Vector2()
const seatingHitPoint=new THREE.Vector3()
const seatedGroundMaterials=new Set([...Object.values(groundMat),mat.concrete])

function hitClassroomSeating(clientX,clientY,useCenter=false,skipOcclusion=false) {
  const rect=renderer.domElement.getBoundingClientRect()
  const x=useCenter?rect.left+rect.width/2:clientX
  const y=useCenter?rect.top+rect.height/2:clientY
  seatingPointer.set((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1)
  seatingRaycaster.setFromCamera(seatingPointer,camera)
  let closest=null
  const room=classroomZoneAt()?.name
  const nearby=[]
  if(room)nearby.push(...classroomSeatingByRoom.get(room)??[])
  else {
    const cellX=Math.floor(camera.position.x/CLASSROOM_SEATING_CELL_SIZE)
    const cellZ=Math.floor(camera.position.z/CLASSROOM_SEATING_CELL_SIZE)
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)nearby.push(...classroomSeatingSpatialGrid.get(`${cellX+dx},${cellZ+dz}`)??[])
  }
  for(const interaction of nearby) {
    const point=seatingRaycaster.ray.intersectBox(interaction.bounds,seatingHitPoint)
    if(!point)continue
    const distance=seatingRaycaster.ray.origin.distanceTo(point)
    if(!closest||distance<closest.distance)closest={interaction,distance,point:point.clone()}
  }
  if(!closest||closest.distance>SCENE_INTERACTION_MAX_DISTANCE)return null
  if(skipOcclusion)return closest
  const visibleHit=seatingRaycaster.intersectObjects(scene.children,true).find(isSceneInteractionOccluder)
  if(visibleHit&&visibleHit.distance+.06<closest.distance)return null
  return closest
}

function hitSeatedGround(clientX,clientY,useCenter=false) {
  const rect=renderer.domElement.getBoundingClientRect()
  const x=useCenter?rect.left+rect.width/2:clientX
  const y=useCenter?rect.top+rect.height/2:clientY
  seatingPointer.set((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1)
  seatingRaycaster.setFromCamera(seatingPointer,camera)
  const hit=seatingRaycaster.intersectObjects(scene.children,true).find(isSceneInteractionOccluder)
  if(!hit)return false
  const materials=Array.isArray(hit.object.material)?hit.object.material:[hit.object.material]
  return materials.some(material=>seatedGroundMaterials.has(material))
}

function enterClassroomSeat(hit) {
  if(basketballGame?.hasHeld()){showToast('手持篮球时不能坐下');return false}
  const source=hit.interaction
  const seat=source.type!=='desk'
    ?source
    :source.seatIds.map(id=>classroomSeatingById.get(id)).reduce((nearest,candidate)=>{
      if(!nearest)return candidate
      const candidateDistance=new THREE.Vector3(...candidate.center).distanceToSquared(hit.point)
      const nearestDistance=new THREE.Vector3(...nearest.center).distanceToSquared(hit.point)
      return candidateDistance<nearestDistance?candidate:nearest
    },null)
  if(!seat)return false
  seatedState={
    sourceId:source.id,seatId:seat.id,classroom:seat.classroom,
    previousPosition:camera.position.clone(),previousQuaternion:camera.quaternion.clone(),
  }
  mode='seated';orbit.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  document.body.classList.add('walking','seated')
  camera.position.fromArray(seat.sitPosition)
  camera.lookAt(camera.position.x+seat.facing[0],camera.position.y,camera.position.z+seat.facing[1])
  webglHud.setViewMode('walk')
  touchControls.setAttribute('aria-hidden','true')
  showToast('已坐下 · 点击地面起身')
  gameAudio.play('furniture',{volume:.72,rate:.92+Math.random()*.12})
  return true
}

function leaveClassroomSeat() {
  if(!seatedState)return false
  const previous=seatedState
  seatedState=null;mode='walk';document.body.classList.remove('seated');document.body.classList.add('walking')
  camera.position.copy(previous.previousPosition);camera.quaternion.copy(previous.previousQuaternion)
  touchControls.setAttribute('aria-hidden',touchModePreferred?'false':'true')
  showToast('已起身')
  gameAudio.play('furniture',{volume:.58,rate:1.02+Math.random()*.1})
  return true
}

function showToast(text) { toast.textContent=text; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove('show'),1700) }

function trackPersonalGameEvent(event) {
  const type=event?.type
  if(type==='basketball-shot')personalRecords.recordGame('basketball')
  else if(type==='basketball-score')personalRecords.recordGame('basketball',{played:false,max:{bestPoints:event.totalPoints}})
  else if(type==='ping-pong-toss'&&event.side==='player')personalRecords.recordGame('pingPong')
  else if(type==='ping-pong-point'||type==='ping-pong-match-end'){
    const state=pingPongGame?.snapshot(),max={longestRally:state?.stats?.rally??0}
    const increment=type==='ping-pong-match-end'?{matches:1,...(event.winner==='player'?{wins:1}:{})}:{}
    personalRecords.recordGame('pingPong',{played:false,max,increment})
  }
  else if(type==='long-jump-launch')personalRecords.recordGame('longJump',{max:{maxDistance:event.distance}})
  else if(type==='bamboo-climb-charge-start')personalRecords.recordGame('bambooClimb')
  else if(type==='bamboo-climb-rise')personalRecords.recordGame('bambooClimb',{played:false,max:{maxHeight:bambooClimbGame?.snapshot().climbHeight??0}})
  else if(type==='bamboo-climb-complete')personalRecords.recordGame('bambooClimb',{played:false,max:{maxHeight:event.climbHeight},min:{leastFailures:bambooClimbGame?.snapshot().failures??0},increment:{completions:1}})
  else if(type==='hopscotch-throw-release')personalRecords.recordGame('hopscotch')
  else if(type==='hopscotch-round-complete')personalRecords.recordGame('hopscotch',{played:false,max:{bestProgress:event.bestProgress??event.target}})
  else if(type==='shuttlecock-kick')personalRecords.recordGame('shuttlecock',{max:{bestStreak:event.best??event.streak}})
  else if(type==='shuttlecock-miss')personalRecords.recordGame('shuttlecock')
  else if(type==='jacks-toss')personalRecords.recordGame('jacks')
  else if(type==='jacks-stage-complete')personalRecords.recordGame('jacks',{played:false,max:{highestStage:event.stage,bestStreak:event.streak}})
  else if(type==='jacks-complete')personalRecords.recordGame('jacks',{played:false,max:{highestStage:3,bestStreak:event.streak},increment:{completions:1}})
  else if(type==='slingshot-shot')personalRecords.recordGame('slingshot')
  else if(type==='slingshot-hit')personalRecords.recordGame('slingshot',{played:false,max:{bestHits:slingshotGame?.snapshot().hits??0}})
  else if(type==='rubiks-cube-move')personalRecords.recordGame('rubiksCube')
  else if(type==='rubiks-cube-complete')personalRecords.recordGame('rubiksCube',{played:false,min:{fewestMoves:event.moves},increment:{completions:1}})
  else if(type==='flag-raising-pull')personalRecords.recordGame('flagRaising')
  else if(type==='flag-raising-complete')personalRecords.recordGame('flagRaising',{played:false,increment:{completions:1}})
  else if(type==='octopus-handheld-enter')personalRecords.recordMysteryDevice('handheldOctopus')
  else if(type==='octopus-handheld-start')personalRecords.recordGame('handheldOctopus')
  else if(type==='octopus-handheld-score')personalRecords.recordGame('handheldOctopus',{played:false,max:{[event.game]:event.score}})
  else if(type==='fire-handheld-enter')personalRecords.recordMysteryDevice('handheldFire')
  else if(type==='fire-handheld-start')personalRecords.recordGame('handheldFire')
  else if(type==='fire-handheld-score')personalRecords.recordGame('handheldFire',{played:false,max:{[event.game]:event.score}})
}

const announceChalkEvent=event=>{
  if(event.type==='pickup') {
    showToast('已拿起粉笔 · 点击准星方向抛出')
    gameAudio.play('chalkPickup',{volume:.48,rate:1.04+Math.random()*.12})
  } else if(event.type==='throw') {
    showToast('粉笔已抛出')
    gameAudio.play('viewSwitch',{volume:.22,rate:1.42})
  } else if(event.type==='collision') {
    const volume=THREE.MathUtils.clamp(event.speed/7,.14,.55)
    gameAudio.playThrottled('chalkImpact',55,{volume,rate:.92+Math.random()*.18})
  } else if(event.type==='recall') {
    showToast('粉笔已全部收回')
    gameAudio.play('uiConfirm',{volume:.5,rate:1.08})
  }
}

const announceBasketballEvent=event=>{
  if(event.type==='basketball-pickup'){
    showToast(touchModePreferred?'已拿起篮球 · 拖动转向，按住右下角投篮按钮蓄力':'已拿起篮球 · 按住左键蓄力，松开投篮');gameAudio.play('basketballPickup',{volume:.54,rate:.96+Math.random()*.08})
  } else if(event.type==='basketball-shot'){
    showToast(event.assisted?`辅助弧线已拟合 · ${event.points}分球 · 力量 ${Math.round(event.charge*100)}%`:`篮球已出手 · ${event.points}分球 · 力量 ${Math.round(event.charge*100)}%`)
    gameAudio.play('basketballThrow',{volume:.34,rate:.94+event.power*.12})
  } else if(event.type==='basketball-kick'){
    showToast('已踢出篮球');gameAudio.play('basketballBounce',{volume:.68,rate:1.22})
  }
  else if(event.type==='basketball-reset')showToast('篮球已全部复位')
  else if(event.type==='basketball-score'){
    webglHud.flashBasketballPoints(event.points);gameAudio.play('basketballScore',{volume:.56,rate:1.08});gameAudio.play('uiConfirm',{volume:.26,rate:1.12})
  } else if(event.type==='basketball-collision'){
    const volume=THREE.MathUtils.clamp(event.speed/10,.12,.72)
    if(event.surface==='backboard')gameAudio.playThrottled('basketballBackboard',85,{volume,rate:.94+Math.random()*.08})
    else if(event.surface==='rim'||event.surface==='frame')gameAudio.playThrottled('basketballRim',70,{volume:volume*.82,rate:.92+Math.random()*.16})
    else gameAudio.playThrottled('basketballBounce',55,{
      volume:THREE.MathUtils.clamp(event.speed/8,.18,.94),
      rate:1.2+THREE.MathUtils.clamp(event.speed/32,0,.14)+Math.random()*.06,
    })
  }
}

const PING_PONG_GOOD_FEEDBACK_CHANCE=.30
const PING_PONG_GOOD_FEEDBACK_COOLDOWN_MS=2400
let lastPingPongGoodFeedbackAt=-Infinity
const shouldShowPingPongGoodFeedback=(now=performance.now(),sample=Math.random())=>{
  if(now-lastPingPongGoodFeedbackAt<PING_PONG_GOOD_FEEDBACK_COOLDOWN_MS||sample>=PING_PONG_GOOD_FEEDBACK_CHANCE)return false
  lastPingPongGoodFeedbackAt=now;return true
}

const announcePingPongEvent=event=>{
  if(event.type==='ping-pong-enter'||event.type==='ping-pong-match-start') {
    lastPingPongGoodFeedbackAt=-Infinity
    gameAudio.play('uiConfirm',{volume:.34,rate:1.05})
  } else if(event.type==='ping-pong-paddle-hit') {
    if(event.side==='player'&&!event.serve){
      if(event.smash)webglHud.flashPingPongFeedback('扣杀','',720)
      else if(shouldShowPingPongGoodFeedback())webglHud.flashPingPongFeedback('好球','',720)
    }
    gameAudio.playThrottled('pingPongPaddle',35,{volume:.42,rate:.96+Math.random()*.09})
  } else if(event.type==='ping-pong-table-bounce') {
    gameAudio.playThrottled('pingPongTable',35,{volume:THREE.MathUtils.clamp(event.speed/11,.18,.46),rate:1.08+Math.random()*.08})
  } else if(event.type==='ping-pong-net') {
    gameAudio.playThrottled('pingPongNet',70,{volume:.28,rate:1.04+Math.random()*.08})
  } else if(event.type==='ping-pong-point') {
    webglHud.flashPingPongFeedback('得分',`${event.winner==='player'?'玩家':'电脑'} +1`)
    gameAudio.play('uiClick',{volume:.30,rate:event.winner==='player'?1.18:.82})
  } else if(event.type==='ping-pong-match-end') {
    webglHud.flashPingPongFeedback('比赛结束',event.winner==='player'?'玩家胜':'电脑胜',1500)
    gameAudio.play('uiConfirm',{volume:.54,rate:event.winner==='player'?1.12:.78})
  }
}

const announceBlackboardAudioEvent=event=>{
  if(event.type==='stroke-start'||event.type==='stroke-move') {
    const group=event.tool==='eraser'?'blackboardErase':'chalkWrite'
    gameAudio.playThrottled(group,event.type==='stroke-start'?0:260,{
      volume:event.tool==='eraser'?.38:.22,
      rate:event.tool==='eraser'?.82+Math.random()*.08:.92+Math.random()*.06,
    })
  } else if(event.type==='tool'||event.type==='undo'||event.type==='clear'||event.type==='done') {
    gameAudio.play('uiClick',{volume:.28,rate:1.08})
  }
}

let blackboardReturnState=null
const beginBlackboardDrawing=board=>{
  if(basketballGame?.hasHeld()){showToast('手持篮球时不能进入黑板模式');return false}
  blackboardReturnState={
    mode,position:camera.position.clone(),quaternion:camera.quaternion.clone(),
    wasPointerLocked:pointer.isLocked,
  }
  mode='blackboard';orbit.enabled=false;keys.clear();velocity.set(0,0,0);resetTouchControls()
  if(pointer.isLocked)pointer.unlock()
  fallbackLookDragging=false;document.body.classList.remove('fallback-dragging')
  touchControls.setAttribute('aria-hidden','true')
  const target=new THREE.Vector3(...board.center)
  camera.position.set(
    target.x+board.normal[0]*2.05,
    target.y,
    target.z+board.normal[1]*2.05,
  )
  camera.lookAt(target)
  showToast('已进入黑板绘画模式')
  return true
}
const finishBlackboardDrawing=()=>{
  if(!blackboardReturnState)return
  const previous=blackboardReturnState;blackboardReturnState=null
  mode=previous.mode==='walk'?'walk':previous.mode
  camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion)
  document.body.classList.toggle('walking',mode==='walk')
  touchControls.setAttribute('aria-hidden',touchModePreferred&&mode==='walk'?'false':'true')
  if(previous.wasPointerLocked&&!touchModePreferred&&pointerLockAvailable) {
    requestGamePointerLock()
  }
  showToast('已离开黑板绘画模式')
}
const togglePrimaryView=()=>{
  if(mode==='seated'||mode==='arrival'||mode==='pingPong'||mode==='bambooClimb'||mode==='longJump'||mode==='hopscotch'||mode==='shuttlecock'||mode==='slingshot'||mode==='blackboard'||mode==='handheldOctopus'||mode==='handheldFire')return false
  gameAudio.play('viewSwitch',{volume:.42})
  mode==='walk'?enterAerial():enterWalk(false)
  return true
}
function enableFallbackControls() {
  pointerLockAvailable=false
  if(mode!=='walk'||touchModePreferred)return
  document.body.classList.add('fallback-controls')
  renderer.domElement.focus({preventScroll:true})
  showToast('当前浏览器已切换为拖动视角模式')
}
function handlePointerLockError() {
  pointerLockRequestPending=false
  if(minigamePause.active&&minigamePause.resumePending){minigamePause.resumePending=false;minigamePause.reason='pointer-lock-error';showToast('未能恢复鼠标控制 · 请再点一次继续游戏');return}
  // 浏览器可能因时序暂时拒绝本次请求；保留 Pointer Lock 能力，让下一次
  // 完整点击继续重试，不能因一次失败永久切换到 fallback 模式。
  if(mode==='walk'&&!touchModePreferred) {
    keys.clear();velocity.set(0,0,0)
    showToast('未能重新锁定 · 请再点击一次画面')
    return
  }
}
pointer.addEventListener('lock',()=>{
  pointerLockRequestPending=false
  pointerLockHasSucceeded=true
  if(sceneOverlayOpen()){pointer.unlock();return}
  if(minigamePause.active){
    if(minigamePause.resumePending&&mode===minigamePause.mode)completePausedMinigameResume()
    else pointer.unlock()
    return
  }
  if(mode!=='walk'||touchModePreferred)return
  showToast('鼠标视角已锁定 · Esc 释放')
})
pointer.addEventListener('unlock',()=>{
  pointerLockRequestPending=false
  if(POINTER_LOCK_MINIGAME_MODES.has(mode)){pauseActiveMinigame('pointer-unlock');return}
  if(mode==='walk')pointWalkController.cancel('pointer-unlock')
  if(mode!=='walk'||touchModePreferred||!pointerLockAvailable)return
  keys.clear();velocity.set(0,0,0)
  showToast('鼠标已释放 · 点击画面重新锁定')
})
addEventListener('blur',()=>pauseActiveMinigame('window-blur'))
document.addEventListener('pointerlockerror',handlePointerLockError)
renderer.domElement.addEventListener('pointerdown',event=>{
  if(mode!=='walk'||touchModePreferred||pointerLockAvailable||event.button!==0)return
  fallbackLookDragging=true;fallbackLookMoved=false;fallbackLookLastX=event.clientX;fallbackLookLastY=event.clientY
  renderer.domElement.setPointerCapture?.(event.pointerId)
  document.body.classList.add('fallback-dragging')
  event.preventDefault()
})
renderer.domElement.addEventListener('pointermove',event=>{
  if(!fallbackLookDragging||mode!=='walk'||touchModePreferred||pointerLockAvailable)return
  const dx=event.clientX-fallbackLookLastX,dy=event.clientY-fallbackLookLastY
  fallbackLookLastX=event.clientX;fallbackLookLastY=event.clientY
  if(Math.abs(dx)+Math.abs(dy)>2)fallbackLookMoved=true
  camera.rotation.order='YXZ'
  camera.rotation.y-=dx*.0024
  camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-dy*.0024,-Math.PI/2+.04,Math.PI/2-.04)
  camera.rotation.z=0
})
const finishFallbackLook=event=>{
  if(!fallbackLookDragging)return
  fallbackLookDragging=false
  renderer.domElement.releasePointerCapture?.(event.pointerId)
  document.body.classList.remove('fallback-dragging')
}
renderer.domElement.addEventListener('pointerup',finishFallbackLook)
renderer.domElement.addEventListener('pointercancel',finishFallbackLook)

const updateTouchJoystick=event=>{
  const base=touchJoystick.querySelector('.touch-joystick-base')
  const rect=base.getBoundingClientRect(),centerX=rect.left+rect.width/2,centerY=rect.top+rect.height/2
  const maxDistance=Math.max(24,Math.min(rect.width,rect.height)*.3)
  let dx=event.clientX-centerX,dy=event.clientY-centerY
  const distance=Math.hypot(dx,dy)
  if(distance>maxDistance){dx=dx/distance*maxDistance;dy=dy/distance*maxDistance}
  touchMoveInput.set(dx/maxDistance,dy/maxDistance)
  if(touchMoveInput.length()<.12)touchMoveInput.set(0,0)
  touchJoystickKnob.style.transform=`translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`
}
touchJoystick.addEventListener('pointerdown',event=>{
  if(!touchModePreferred||mode!=='walk'||touchJoystickPointerId!=null)return
  pointWalkController.cancel('joystick-input')
  touchJoystickPointerId=event.pointerId;touchJoystick.classList.add('active')
  touchJoystick.setPointerCapture?.(event.pointerId);updateTouchJoystick(event)
  event.preventDefault();event.stopPropagation()
})
touchJoystick.addEventListener('pointermove',event=>{
  if(event.pointerId!==touchJoystickPointerId)return
  updateTouchJoystick(event);event.preventDefault();event.stopPropagation()
})
const finishTouchJoystick=event=>{
  if(event.pointerId!==touchJoystickPointerId)return
  if(touchJoystick.hasPointerCapture?.(event.pointerId))touchJoystick.releasePointerCapture(event.pointerId)
  touchJoystickPointerId=null
  touchMoveInput.set(0,0);touchJoystickKnob.style.transform='translate3d(0,0,0)';touchJoystick.classList.remove('active')
  event.preventDefault();event.stopPropagation()
}
touchJoystick.addEventListener('pointerup',finishTouchJoystick)
touchJoystick.addEventListener('pointercancel',finishTouchJoystick)

renderer.domElement.addEventListener('pointerdown',event=>{
  if(!touchModePreferred||mode!=='slingshot'||!webglHud.hitSlingshotDistance(event.clientX,event.clientY))return
  slingshotGame?.toggleStation();event.preventDefault();event.stopImmediatePropagation()
},{capture:true})

touchLookZone.addEventListener('pointerdown',event=>{
  if(snackModelViewer?.isOpen()){
    if(snackModelViewer.pointerDown(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='flagRaising'){
    if(flagRaisingGame?.pointerDown(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='jacks'){
    if(jacksGame?.pointerDown(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='hopscotch'){
    if(hopscotchGame?.pointerDown(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='shuttlecock'){
    if(shuttlecockGame?.pointerDown(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='longJump'){
    if(longJumpGame?.pointerDown(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='bambooClimb'){
    if(bambooClimbGame?.pointerDown(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(webglHud.hitPersonalRecord(event.clientX,event.clientY)) {
    openPersonalRecordBook('overview');event.preventDefault();event.stopPropagation();return
  }
  if(webglHud.hitViewToggle(event.clientX,event.clientY)) {
    togglePrimaryView();event.preventDefault();event.stopPropagation();return
  }
  if(webglHud.hitBasketballShoot(event.clientX,event.clientY)){
    if(touchBasketballShootPointerId==null&&basketballGame?.beginCharge()){
      touchBasketballShootPointerId=event.pointerId;touchLookZone.setPointerCapture?.(event.pointerId)
    }
    event.preventDefault();event.stopPropagation();return
  }
  if(!touchModePreferred||(mode!=='walk'&&mode!=='seated')||touchLookPointers.has(event.pointerId))return
  touchLookPointers.set(event.pointerId,{startX:event.clientX,startY:event.clientY,moved:false})
  if(touchLookPointerId==null){
    touchLookPointerId=event.pointerId
    touchLookStartX=touchLookLastX=event.clientX;touchLookStartY=touchLookLastY=event.clientY;touchLookMoved=false
    touchBasketballHeldAtStart=mode==='walk'&&Boolean(basketballGame?.hasHeld())
  } else if(mode==='walk'&&touchLookPointers.size===2&&basketballGame?.canReset()){
    touchBasketballMultiTouch=true;touchBasketballResetPerformed=false;basketballGame.cancelCharge()
    clearTimeout(touchBasketballResetTimer)
    touchBasketballResetTimer=setTimeout(()=>{
      if(!touchBasketballMultiTouch||touchLookPointers.size!==2||[...touchLookPointers.values()].some(pointer=>pointer.moved))return
      basketballGame.resetAll();touchBasketballResetPerformed=true
      gameAudio.play('uiConfirm',{volume:.42,rate:.86})
    },900)
  }
  touchLookZone.classList.add('active')
  event.preventDefault();event.stopPropagation()
})
touchLookZone.addEventListener('pointermove',event=>{
  if(snackModelViewer?.isOpen()){
    if(snackModelViewer.pointerMove(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='flagRaising'){
    if(flagRaisingGame?.pointerMove(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='jacks'){
    if(jacksGame?.pointerMove(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='hopscotch'){if(hopscotchGame?.pointerMove(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='shuttlecock'){
    if(shuttlecockGame?.pointerMove(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='longJump'){event.preventDefault();event.stopPropagation();return}
  if(mode==='bambooClimb'){
    if(bambooClimbGame?.pointerMove(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(event.pointerId===touchBasketballShootPointerId){event.preventDefault();event.stopPropagation();return}
  const pointer=touchLookPointers.get(event.pointerId);if(!pointer)return
  if(Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)>10){
    pointer.moved=true
    if(touchBasketballMultiTouch){clearTimeout(touchBasketballResetTimer);touchBasketballResetTimer=0}
  }
  if(event.pointerId!==touchLookPointerId||touchBasketballMultiTouch){event.preventDefault();event.stopPropagation();return}
  let dx=event.clientX-touchLookLastX,dy=event.clientY-touchLookLastY
  touchLookLastX=event.clientX;touchLookLastY=event.clientY
  if(!touchLookMoved) {
    if(Math.hypot(event.clientX-touchLookStartX,event.clientY-touchLookStartY)<=10) {
      event.preventDefault();event.stopPropagation();return
    }
    touchLookMoved=true;dx=event.clientX-touchLookStartX;dy=event.clientY-touchLookStartY
  }
  camera.rotation.order='YXZ';camera.rotation.y-=dx*TOUCH_LOOK_SENSITIVITY
  camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-dy*TOUCH_LOOK_SENSITIVITY,-Math.PI/2+.04,Math.PI/2-.04);camera.rotation.z=0
  event.preventDefault();event.stopPropagation()
})
const finishTouchLook=(event,activate)=>{
  if(!touchLookPointers.has(event.pointerId))return
  const wasPrimary=event.pointerId===touchLookPointerId
  const wasMultiTouch=touchBasketballMultiTouch
  const heldPointTarget=touchBasketballHeldAtStart&&mode==='walk'&&pointWalkController.hasCandidate()
  const shouldActivate=activate&&wasPrimary&&!touchLookMoved&&(!touchBasketballHeldAtStart||heldPointTarget)&&!wasMultiTouch
  touchLookPointers.delete(event.pointerId)
  if(wasMultiTouch){
    clearTimeout(touchBasketballResetTimer);touchBasketballResetTimer=0
    if(touchLookPointers.size===0){touchBasketballMultiTouch=false;touchBasketballResetPerformed=false;touchBasketballHeldAtStart=false;touchLookPointerId=null;touchLookMoved=false;touchLookZone.classList.remove('active')}
  } else if(wasPrimary){
    touchLookPointerId=null;touchLookMoved=false;touchBasketballHeldAtStart=false;touchLookZone.classList.remove('active')
  }
  if(shouldActivate){
    touchTapActivations++
    if(mode==='walk'&&pointWalkController.isMoving()){pointWalkController.cancel('tap-stop');velocity.set(0,0,0);showToast('已停止')}
    else {
      if(mode==='walk'&&basketballGame?.hasHeld()&&pointWalkController.hasCandidate())pointWalkController.confirm()
      else {
        const activated=activateSceneInteraction(innerWidth/2,innerHeight/2,true)
        if(!activated&&mode==='walk')pointWalkController.confirm()
      }
    }
  }
  event.preventDefault();event.stopPropagation()
}
const finishTouchBasketballShoot=(event,release)=>{
  if(event.pointerId!==touchBasketballShootPointerId)return false
  if(touchLookZone.hasPointerCapture?.(event.pointerId))touchLookZone.releasePointerCapture(event.pointerId)
  touchBasketballShootPointerId=null
  if(release)basketballGame?.releaseCharge();else basketballGame?.cancelCharge()
  event.preventDefault();event.stopPropagation();return true
}
touchLookZone.addEventListener('pointerup',event=>{
  if(snackModelViewer?.isOpen()){
    if(snackModelViewer.pointerUp(event)){
      if(snackModelViewer.consumeClick(event)==='close')closeOverlayViewer()
      event.preventDefault();event.stopPropagation()
    }
    return
  }
  if(mode==='flagRaising'){if(flagRaisingGame?.pointerUp(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='jacks'){if(jacksGame?.pointerUp(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='hopscotch'){if(hopscotchGame?.pointerUp(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='shuttlecock'){if(shuttlecockGame?.pointerUp(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='longJump'){if(longJumpGame?.pointerUp(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='bambooClimb'){if(bambooClimbGame?.pointerUp(event)){event.preventDefault();event.stopPropagation()}return}
  if(!finishTouchBasketballShoot(event,true))finishTouchLook(event,true)
})
touchLookZone.addEventListener('pointercancel',event=>{
  if(snackModelViewer?.isOpen()){
    snackModelViewer.pointerUp(event);event.preventDefault();event.stopPropagation();return
  }
  if(mode==='flagRaising'){if(flagRaisingGame?.pointerCancel(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='jacks'){if(jacksGame?.pointerCancel(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='hopscotch'){if(hopscotchGame?.pointerCancel(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='shuttlecock'){if(shuttlecockGame?.pointerCancel(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='longJump'){if(longJumpGame?.pointerCancel(event)){event.preventDefault();event.stopPropagation()}return}
  if(mode==='bambooClimb'){if(bambooClimbGame?.pointerCancel(event)){event.preventDefault();event.stopPropagation()}return}
  if(!finishTouchBasketballShoot(event,false))finishTouchLook(event,false)
})

const announceB1Interaction=interaction=>{
  if(!interaction)return false
  const part=interaction.type.startsWith('door')?'门':interaction.pivot.includes('_Middle_')?'中窗':'气窗'
  showToast(`${part}已${interaction.open?'打开':'关闭'}`)
  gameAudio.play(interaction.open?'doorOpen':'doorClose',{
    volume:part==='门'?.72:.52,
    rate:part==='门'?.92+Math.random()*.14:1.12+Math.random()*.14,
  })
  return true
}
const activateSceneInteraction=(clientX,clientY,useCenter=false)=>{
  if(mode==='seated') {
    const rubiksCubeInteraction=rubiksCubeGame?.interact(clientX,clientY,useCenter)
    if(rubiksCubeInteraction)return rubiksCubeInteraction.type
    const pencilBoxHit=hitViewablePencilBox(clientX,clientY,useCenter)
    if(pencilBoxHit){void openPencilBoxModelViewer(pencilBoxHit.item);return 'view-pencil-box-model'}
    const snackHit=hitViewableSnack(clientX,clientY,useCenter)
    if(snackHit){void openSnackModelViewer(snackHit.item);return 'view-snack-model'}
    const documentHit=hitViewableDocument(clientX,clientY,useCenter)
    if(documentHit){void openDocumentViewer(documentHit.item);return 'view-document'}
    const interaction=interactWithB1Asset(clientX,clientY,useCenter)
    if(announceB1Interaction(interaction))return 'opening'
    // 坐下后准星已经明确显示“站起来”；没有命中更高优先级物件的任意点击
    // 都直接起身，不再要求玩家在桌凳遮挡之间寻找一小块可射中的地面。
    return leaveClassroomSeat()?'stand':null
  }
  if(mode!=='walk')return null
  const flagRaisingInteraction=flagRaisingGame?.interact(clientX,clientY,useCenter)
  if(flagRaisingInteraction)return flagRaisingInteraction.type
  const rubiksCubeInteraction=rubiksCubeGame?.interact(clientX,clientY,useCenter)
  if(rubiksCubeInteraction)return rubiksCubeInteraction.type
  const fireInteraction=fireHandheldGame?.interact(clientX,clientY,useCenter)
  if(fireInteraction)return fireInteraction.type
  const handheldInteraction=octopusHandheldGame?.interact(clientX,clientY,useCenter)
  if(handheldInteraction)return handheldInteraction.type
  const bambooClimbInteraction=bambooClimbGame?.interact(clientX,clientY,useCenter)
  if(bambooClimbInteraction)return bambooClimbInteraction.type
  const longJumpInteraction=longJumpGame?.interact(clientX,clientY,useCenter)
  if(longJumpInteraction)return longJumpInteraction.type
  const hopscotchInteraction=hopscotchGame?.interact(clientX,clientY,useCenter)
  if(hopscotchInteraction)return hopscotchInteraction.type
  const shuttlecockInteraction=shuttlecockGame?.interact(clientX,clientY,useCenter)
  if(shuttlecockInteraction)return shuttlecockInteraction.type
  const jacksInteraction=jacksGame?.interact(clientX,clientY,useCenter)
  if(jacksInteraction)return jacksInteraction.type
  const slingshotInteraction=slingshotGame?.interact(clientX,clientY,useCenter)
  if(slingshotInteraction)return slingshotInteraction.type
  const pingPongInteraction=pingPongGame?.interact(clientX,clientY,useCenter)
  if(pingPongInteraction)return pingPongInteraction.type
  const basketballInteraction=basketballGame?.interact(clientX,clientY,useCenter)
  if(basketballInteraction)return basketballInteraction.type
  const chalkInteraction=chalkThrowing?.interact(clientX,clientY,useCenter)
  if(chalkInteraction)return chalkInteraction.type
  const pencilBoxHit=hitViewablePencilBox(clientX,clientY,useCenter)
  if(pencilBoxHit){void openPencilBoxModelViewer(pencilBoxHit.item);return 'view-pencil-box-model'}
  const snackHit=hitViewableSnack(clientX,clientY,useCenter)
  if(snackHit){void openSnackModelViewer(snackHit.item);return 'view-snack-model'}
  const documentHit=hitViewableDocument(clientX,clientY,useCenter)
  if(documentHit){void openDocumentViewer(documentHit.item);return 'view-document'}
  const passageMediaLink=passageMediaLinks.hit(clientX,clientY,useCenter)
  if(passageMediaLink){
    const interaction=passageMediaLinks.interact(clientX,clientY,useCenter)
    if(interaction?.type==='show-passage-site-qr'){
      openPassageSiteQr()
      showToast('视频号二维码')
      return interaction.type
    }
    showToast(`正在打开${passageMediaLink.label}`)
    return interaction?.type??null
  }
  const blackboardHit=blackboardDrawing.hit(clientX,clientY,useCenter)
  if(blackboardHit&&blackboardDrawing.enter(blackboardHit.board))return 'blackboard'
  const seating=hitClassroomSeating(clientX,clientY,useCenter)
  if(seating&&enterClassroomSeat(seating))return 'seat'
  return announceB1Interaction(interactWithB1Asset(clientX,clientY,useCenter))?'opening':null
}

const consumeMinigamePausePointer=event=>{
  if(!minigamePause.active)return
  if(event.type==='click'){
    const action=webglHud.hitMinigamePauseAction(event.clientX,event.clientY)
    if(action==='resume')resumePausedMinigame()
    else if(action==='exit')exitPausedMinigame()
  }
  event.preventDefault();event.stopImmediatePropagation()
}
for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click','wheel'])renderer.domElement.addEventListener(type,consumeMinigamePausePointer,{capture:true,passive:false})

const consumePersonalRecordPointer=event=>{
  const action=personalRecordBook.hitAction(event.clientX,event.clientY)
  if(!personalRecordBook.isOpen()&&!action)return
  if(event.type==='click'){
    if(action==='open-menu')openPersonalRecordMenu()
    else if(action==='resume'||action==='close')closePersonalRecordBook()
    else if(action==='open-book')personalRecordBook.openBook(personalRecordViewModel(),'overview')
    else if(action?.startsWith('tab:'))personalRecordBook.applyAction(action)
    renderFrame()
  }
  event.preventDefault();event.stopImmediatePropagation()
}
for(const target of [renderer.domElement,touchLookZone])for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click','wheel'])target.addEventListener(type,consumePersonalRecordPointer,{capture:true,passive:false})

const consumeDocumentViewerPointer=event=>{
  if(!documentViewer?.isOpen())return
  if(event.type==='click'&&documentViewer.clickAction(event)==='close')closeOverlayViewer()
  event.preventDefault();event.stopImmediatePropagation()
}
for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click','wheel'])renderer.domElement.addEventListener(type,consumeDocumentViewerPointer,{capture:true,passive:false})
const consumeSiteQrPointer=event=>{
  if(!siteQrOverlay.isOpen())return
  if(event.type==='click'&&siteQrOverlay.hitAction(event.clientX,event.clientY)==='close')closePassageSiteQr()
  if(event.type==='wheel')event.preventDefault()
  event.stopImmediatePropagation()
}
for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click','wheel'])renderer.domElement.addEventListener(type,consumeSiteQrPointer,{capture:true,passive:false})
const consumeDocumentViewerTouchPointer=event=>{
  if(!documentViewer?.isOpen())return
  if(event.type==='pointerup'&&documentViewer.clickAction(event)==='close')closeOverlayViewer()
  event.preventDefault();event.stopImmediatePropagation()
}
for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])touchLookZone.addEventListener(type,consumeDocumentViewerTouchPointer,{capture:true,passive:false})

renderer.domElement.addEventListener('pointerdown',event=>{
  if(snackModelViewer?.isOpen()){
    if(snackModelViewer.pointerDown(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='rubiksCube')rubiksCubeGame?.pointerDown(event)
})
renderer.domElement.addEventListener('pointermove',event=>{
  if(snackModelViewer?.isOpen()){
    if(snackModelViewer.pointerMove(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='rubiksCube')rubiksCubeGame?.pointerMove(event)
})
renderer.domElement.addEventListener('pointerup',event=>{
  if(snackModelViewer?.isOpen()){
    if(snackModelViewer.pointerUp(event)){event.preventDefault();event.stopPropagation()}
    return
  }
  if(mode==='rubiksCube')rubiksCubeGame?.pointerUp(event)
})
renderer.domElement.addEventListener('pointercancel',event=>{
  if(snackModelViewer?.isOpen()){
    snackModelViewer.pointerUp(event);return
  }
  if(mode==='rubiksCube')rubiksCubeGame?.pointerCancel(event)
})
renderer.domElement.addEventListener('wheel',event=>{
  if(snackModelViewer?.wheel(event)){event.preventDefault();event.stopPropagation()}
},{passive:false})

renderer.domElement.addEventListener('click',event=>{
  if(flagRaisingGame?.consumePostExitClick(event))return
  if(rubiksCubeGame?.consumePostExitClick(event))return
  if(jacksGame?.consumePostExitClick(event))return
  if(longJumpGame?.consumePostExitClick(event))return
  if(fireHandheldGame?.consumePostExitClick(event))return
  if(octopusHandheldGame?.consumePostExitClick(event))return
  if(snackModelViewer?.isOpen()){
    if(snackModelViewer.consumeClick(event)==='close')closeOverlayViewer()
    return
  }
  if(mode==='walk'&&pointWalkController.isMoving()){pointWalkController.cancel('click-stop');velocity.set(0,0,0);showToast('已停止');return}
  // Pointer Lock 下 click 仍可能沿用锁定前最后一次鼠标坐标。若玩家刚从
  // 右上角按钮进入第一人称，这个陈旧坐标会让之后的任意场景点击都再次
  // 命中视角按钮；锁定状态只允许中央准星交互，切换视角使用 V 键。
  if(!pointer.isLocked&&webglHud.hitPersonalRecord(event.clientX,event.clientY)) {
    openPersonalRecordBook('overview');return
  }
  if(!pointer.isLocked&&webglHud.hitViewToggle(event.clientX,event.clientY)) {
    togglePrimaryView();return
  }
  if(touchModePreferred&&mode==='walk')return
  // When Esc has released the pointer, the next canvas click is reserved for
  // restoring pointer lock. Do not let that same click activate a blackboard,
  // seat, chalk item, door, or window and change modes before lock() runs.
  if(mode==='walk'&&!automatedTestBuild&&!pointer.isLocked&&pointerLockAvailable) {
    requestGamePointerLock()
    return
  }
  if(!pointerLockAvailable&&fallbackLookMoved){fallbackLookMoved=false;return}
  // 行走锁鼠标与坐下状态都使用屏幕中央的 WebGL 准星。Pointer Lock 下 click
  // 事件的 clientX/clientY 不保证仍是中央位置；若直接使用会出现悬停显示“查看”，
  // 点击却按空白处理并起身的问题。
  if(mode==='walk'&&basketballGame?.hasHeld()&&pointWalkController.hasCandidate()){pointWalkController.confirm();return}
  const activated=activateSceneInteraction(event.clientX,event.clientY,mode==='seated'||(mode==='walk'&&pointer.isLocked))
  if(!activated&&mode==='walk')pointWalkController.confirm()
})
addEventListener('keydown',e=>{
  if(personalRecordBook.isOpen()){
    if(e.code==='Escape'||e.code==='KeyX')closePersonalRecordBook()
    e.preventDefault();return
  }
  if(siteQrOverlay.isOpen()){
    if(e.code==='Escape')closePassageSiteQr()
    e.preventDefault();return
  }
  if(snackModelViewer?.isOpen()) {
    if(e.code==='KeyX'){closeOverlayViewer();e.preventDefault()}
    return
  }
  if(documentViewer?.isOpen()) {
    if(e.code==='KeyX'){closeOverlayViewer();e.preventDefault()}
    return
  }
  if(e.code==='KeyX'&&exitActiveMinigame()){e.preventDefault();return}
  if(minigamePause.active){e.preventDefault();return}
  if(e.code==='Escape'&&pauseActiveMinigame('escape')){e.preventDefault();return}
  if(e.code==='Escape'&&openPersonalRecordMenu()){e.preventDefault();return}
  if(mode==='flagRaising'){e.preventDefault();return}
  if(mode==='rubiksCube') {
    if(rubiksCubeGame?.handleKey(e.code,e))e.preventDefault()
    return
  }
  if(mode==='handheldOctopus') {
    octopusHandheldGame?.handleKey(e.code,true,e.repeat)
    e.preventDefault();return
  }
  if(mode==='handheldFire') {
    fireHandheldGame?.handleKey(e.code,true,e.repeat)
    e.preventDefault();return
  }
  if(mode==='pingPong') {
    if(e.code==='KeyM'){pingPongGame?.startMatch();e.preventDefault()}
    return
  }
  if(mode==='bambooClimb') {
    return
  }
  if(mode==='longJump') {
    if(e.code==='Space'){
      const state=longJumpGame?.snapshot()
      if(state?.phase==='aiming')longJumpGame.beginCharge()
      e.preventDefault()
    }
    return
  }
  if(mode==='hopscotch'){
    if(hopscotchGame?.handleKey(e.code,true,e.repeat))e.preventDefault()
    return
  }
  if(mode==='shuttlecock'){
    if(shuttlecockGame?.handleKey(e.code,true,e.repeat))e.preventDefault()
    return
  }
  if(mode==='jacks'){
    return
  }
  if(mode==='slingshot'){
    if(import.meta.env.DEV&&e.code==='KeyK'&&!e.repeat)slingshotGame?.beginCharge()
    else if(import.meta.env.DEV&&e.code==='KeyO'&&!e.repeat)slingshotGame?.releaseCharge()
    else if(import.meta.env.DEV&&e.code==='KeyT'&&!e.repeat)slingshotGame?.testFireAt('red-flat-bar')
    else if(import.meta.env.DEV&&e.code==='KeyY'&&!e.repeat)slingshotGame?.testFireAt('loose-4')
    else if(slingshotGame?.handleKey(e.code,true,e.repeat))e.preventDefault()
    return
  }
  if(mode==='blackboard') {
    if(e.code==='Escape'){blackboardDrawing.exit();e.preventDefault()}
    return
  }
  keys.add(e.code)
  if(mode==='walk'&&MOVEMENT_KEY_CODES.includes(e.code)){
    pointWalkController.cancel('keyboard-input');e.preventDefault()
  }
  if(e.code==='KeyV'&&mode!=='seated'&&mode!=='arrival'){
    togglePrimaryView()
  }
  if(import.meta.env.DEV&&e.code==='KeyG')applyPerformanceCamera('slingshotCorner')
  if(import.meta.env.DEV&&e.code==='KeyH')applyPerformanceCamera('slingshotDistanceLines')
  if(import.meta.env.DEV&&e.code==='KeyJ'&&mode==='walk')slingshotGame?.enter('wood')
  if(e.code==='KeyL'){debugObjects.forEach(o=>o.visible=!o.visible);showToast(debugObjects[0].visible?'建筑标签已打开':'建筑标签已关闭')}
})
addEventListener('keyup',e=>{
  if(minigamePause.active){e.preventDefault();return}
  if(mode==='flagRaising'){e.preventDefault();return}
  if(mode==='hopscotch'){if(hopscotchGame?.handleKey(e.code,false,e.repeat))e.preventDefault();return}
  if(mode==='shuttlecock'){if(shuttlecockGame?.handleKey(e.code,false,e.repeat))e.preventDefault();return}
  if(mode==='longJump'&&e.code==='Space'){if(longJumpGame?.snapshot().phase==='charging')longJumpGame.releaseCharge();e.preventDefault();return}
  if(mode==='slingshot'){if(slingshotGame?.handleKey(e.code,false,e.repeat))e.preventDefault();return}
  if(mode==='handheldOctopus'){if(octopusHandheldGame?.handleKey(e.code,false,e.repeat))e.preventDefault();return}
  if(mode==='handheldFire'){if(fireHandheldGame?.handleKey(e.code,false,e.repeat))e.preventDefault();return}
  keys.delete(e.code)
})
addEventListener('blur',()=>{
  for(const code of ['ArrowLeft','KeyA','ArrowRight','KeyD','Digit1','Digit2','KeyT'])octopusHandheldGame?.handleKey(code,false,false)
  for(const code of ['ArrowLeft','KeyA','ArrowRight','KeyD','Digit1','Digit2','KeyT'])fireHandheldGame?.handleKey(code,false,false)
  for(const code of ['ArrowLeft','KeyA','ArrowRight','KeyD'])shuttlecockGame?.handleKey(code,false,false)
  slingshotGame?.cancelCharge()
  rubiksCubeGame?.suspend()
  keys.clear();resetTouchControls()
  pointWalkController.cancel('window-blur')
})
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseActiveMinigame('document-hidden');pointWalkController.cancel('document-hidden');rubiksCubeGame?.suspend()}})
addEventListener('resize',()=>{
  syncVisualViewport()
  if(touchJoystickPointerId!=null||touchLookPointerId!=null)resetTouchControls()
  syncCameraProjection()
  if(mode==='pingPong')syncPingPongProjection()
  const pixelRatioLimit=maxPixelRatioForViewport()
  activeRendererPixelRatio=Math.min(requestedRendererPixelRatio(),pixelRatioLimit)
  activeComposerPixelRatio=Math.min(requestedComposerPixelRatio(),pixelRatioLimit)
  renderer.setPixelRatio(activeRendererPixelRatio);composer.setPixelRatio(activeComposerPixelRatio)
  renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight)
  webglHud.resize()
  personalRecordBook.resize()
  siteQrOverlay.resize()
  documentViewer?.resize()
  snackModelViewer?.resize()
  octopusHandheldGame?.resize()
  fireHandheldGame?.resize()
  rubiksCubeGame?.resize()
  for(const material of Object.values(artisticOutlineMaterials))material.resolution.set(innerWidth,innerHeight)
})

let lastHudProbeAt=0
const resolveWebglHudInteraction=()=>{
  if(mode==='seated') {
    if(rubiksCubeGame?.hit(innerWidth/2,innerHeight/2,true,true))return 'play-rubiks-cube'
    if(hitViewablePencilBox(innerWidth/2,innerHeight/2,true,true))return 'look'
    if(hitViewableSnack(innerWidth/2,innerHeight/2,true,true))return 'look'
    if(hitViewableDocument(innerWidth/2,innerHeight/2,true,true))return 'look'
    const opening=hitB1Asset(innerWidth/2,innerHeight/2,true,true)
    if(opening)return opening.interaction.type.startsWith('door')?'open-door':'open-window'
    return 'stand-up'
  }
  if(mode!=='walk')return 'default'
  if(chalkThrowing?.hasHeld())return 'throw-chalk'
  if(basketballGame?.hasHeld())return 'shoot-basketball'
  if(flagRaisingGame?.hit(innerWidth/2,innerHeight/2,true))return 'start-flag-raising'
  if(rubiksCubeGame?.hit(innerWidth/2,innerHeight/2,true,true))return 'play-rubiks-cube'
  if(fireHandheldGame?.hit(innerWidth/2,innerHeight/2,true,true))return 'play-handheld'
  if(octopusHandheldGame?.hit(innerWidth/2,innerHeight/2,true,true))return 'play-handheld'
  if(bambooClimbGame?.hit(innerWidth/2,innerHeight/2,true))return 'start-bamboo-climb'
  if(longJumpGame?.hit(innerWidth/2,innerHeight/2,true))return 'start-long-jump'
  if(hopscotchGame?.hit(innerWidth/2,innerHeight/2,true))return 'start-hopscotch'
  if(shuttlecockGame?.hit(innerWidth/2,innerHeight/2,true))return 'start-shuttlecock'
  if(jacksGame?.hit(innerWidth/2,innerHeight/2,true))return 'start-jacks'
  const slingshotHit=slingshotGame?.hit(innerWidth/2,innerHeight/2,true)
  if(slingshotHit){
    if(slingshotHit.type==='firing-line')return slingshotHit.stationDistance===5?'select-slingshot-5m':'select-slingshot-10m'
    return slingshotHit.id==='wire'?'select-slingshot-wire':'select-slingshot-wood'
  }
  if(pingPongGame?.hit(innerWidth/2,innerHeight/2,true))return 'start-ping-pong'
  if(basketballGame?.hitBall(innerWidth/2,innerHeight/2,true))return 'pick-up-basketball'
  if(chalkThrowing?.hitPickable(innerWidth/2,innerHeight/2,true))return 'pick-up-chalk'
  if(hitViewablePencilBox(innerWidth/2,innerHeight/2,true,true))return 'look'
  if(hitViewableSnack(innerWidth/2,innerHeight/2,true,true))return 'look'
  if(hitViewableDocument(innerWidth/2,innerHeight/2,true,true))return 'look'
  const passageLink=passageMediaLinks.hit(innerWidth/2,innerHeight/2,true)
  if(passageLink)return passageLink.hudInteraction
  if(blackboardDrawing?.hit(innerWidth/2,innerHeight/2,true,true))return 'write'
  if(hitClassroomSeating(innerWidth/2,innerHeight/2,true,true))return 'sit-down'
  const opening=hitB1Asset(innerWidth/2,innerHeight/2,true,true)
  if(opening)return opening.interaction.type.startsWith('door')?'open-door':'open-window'
  return 'default'
}

const updateWebglHud=(now)=>{
  const enabled=(mode==='walk'||mode==='seated'||mode==='slingshot')&&!sceneOverlayOpen()&&!document.body.classList.contains('fallback-controls')
  pointWalkController.setEnabled(mode==='walk'&&!sceneOverlayOpen())
  const topRightButtonsVisible=(mode==='walk'||mode==='aerial')&&!sceneOverlayOpen()
  webglHud.setViewToggleVisible(topRightButtonsVisible)
  webglHud.setPersonalRecordVisible(topRightButtonsVisible)
  const pointTargetVisible=mode==='walk'&&pointWalkController.hasCandidate()
  webglHud.setPointTargetVisible(pointTargetVisible)
  webglHud.setPointWalking(mode==='walk'&&pointWalkController.isMoving())
  webglHud.setEnabled(enabled)
  webglHud.setPosture(mode==='seated'?'sitting':velocity.lengthSq()>.04?'walking':'standing')
  if(enabled&&now-lastHudProbeAt>=120) {
    lastHudProbeAt=now
    cachedSceneInteraction=resolveWebglHudInteraction()
  } else if(!enabled){cachedSceneInteraction='default';webglHud.setInteraction('default')}
  if(pointTargetVisible&&basketballGame?.hasHeld()&&basketballGame.isCharging())basketballGame.cancelCharge()
  webglHud.setInteraction(pointTargetVisible&&basketballGame?.hasHeld()?'default':cachedSceneInteraction)
  if(mode==='slingshot')webglHud.setInteraction('default')
  const basketballHudState=basketballGame?.hudState()??{visible:false,charging:false}
  webglHud.setBasketballHud({...basketballHudState,shootButtonVisible:Boolean(touchModePreferred&&mode==='walk'&&basketballGame?.hasHeld()&&!pointTargetVisible),shootPressed:touchBasketballShootPointerId!=null})
  const slingshotHudState=slingshotGame?.snapshot()
  webglHud.setSlingshotHud({
    visible:mode==='slingshot',touch:touchModePreferred,distance:slingshotHudState?.distance??10,
    selectedId:slingshotHudState?.selectedId??'wood',shots:slingshotHudState?.shots??0,hits:slingshotHudState?.hits??0,
  })
  webglHud.setPingPongHud(pingPongGame?.hudState()??{visible:false})
  webglHud.setBambooClimbHud(bambooClimbGame?.hudState()??{visible:false})
  webglHud.setLongJumpHud(longJumpGame?.hudState()??{visible:false})
  webglHud.setHopscotchHud(hopscotchGame?.hudState()??{visible:false})
  webglHud.setShuttlecockHud(shuttlecockGame?.hudState()??{visible:false})
  webglHud.setJacksHud(jacksGame?.hudState()??{visible:false})
  webglHud.setFlagRaisingHud(flagRaisingGame?.hudState()??{visible:false})
  updateMinigameProximityTutorials()
  webglHud.update(now)
}

const updateMinigameProximityTutorials=()=>{
  if(mode!=='walk')return
  const hoop=CAMPUS.facilities.basketballHoop,court=hoop.court
  const angle=THREE.MathUtils.degToRad(hoop.rotationY??0),cos=Math.cos(angle),sin=Math.sin(angle)
  const dx=camera.position.x-hoop.center[0],dz=camera.position.z-hoop.center[1]
  const localX=dx*cos-dz*sin,localZ=dx*sin+dz*cos,courtForward=-localZ
  // 篮球教学与常驻玩法 HUD 都严格限制在已画出的半场线内，避免范围延伸到沙地互动区。
  const insideBasketball=Math.abs(localX)<=court.width/2&&courtForward>=court.baselineForward&&courtForward<=court.baselineForward+court.length
  const basketballState=minigameTutorialState.basketball
  if(insideBasketball&&!basketballState.inside&&!basketballState.shown){
    basketballState.shown=true
    webglHud.showMinigameTutorial(touchModePreferred?'basketball-mobile':'basketball-desktop')
  }
  basketballState.inside=insideBasketball

  const pingPongDistanceSq=CAMPUS.facilities.pingPong.centers.reduce((nearest,[x,z])=>Math.min(nearest,(camera.position.x-x)**2+(camera.position.z-z)**2),Infinity)
  const insidePingPong=pingPongDistanceSq<=4.5**2,pingPongState=minigameTutorialState.pingPong
  if(insidePingPong&&!pingPongState.inside&&!pingPongState.shown){
    pingPongState.shown=true
    webglHud.showMinigameTutorial(touchModePreferred?'ping-pong-mobile':'ping-pong-desktop')
  }
  pingPongState.inside=insidePingPong
}

function animate(now) {
  requestAnimationFrame(animate); const dt=Math.min(.05,(now-last)/1000); last=now
  snackModelViewer?.update(dt)
  if(sceneReadyAt!=null) {
    frameDurations.push(dt*1000)
    if(frameDurations.length>1200)frameDurations.shift()
  }
  if(!minigamePause.active&&(activeClassroomDetailRooms.has(octopusHandheldConfig.placement.classroom)||mode==='handheldOctopus'))octopusHandheldGame?.update(now)
  if(!minigamePause.active&&(activeClassroomDetailRooms.has(fireHandheldConfig.placement.classroom)||mode==='handheldFire'))fireHandheldGame?.update(now)
  if(!minigamePause.active&&(activeClassroomDetailRooms.has(rubiksCubePlacement.classroom)||mode==='rubiksCube'))rubiksCubeGame?.update(now)
  if(mode==='handheldOctopus') { renderFrame();return }
  if(mode==='handheldFire') { renderFrame();return }
  if(mode==='rubiksCube') { renderFrame();return }
  updateB1AssetAnimations(dt)
  chalkThrowing?.update(dt)
  basketballGame?.update(dt,camera.position,velocity)
  if(!minigamePause.active)flagRaisingGame?.update(now)
  if(!minigamePause.active){
    pingPongGame?.update(dt)
    bambooClimbGame?.update(now)
    longJumpGame?.update(now,dt)
    hopscotchGame?.update(now,dt)
    shuttlecockGame?.update(dt,now)
    jacksGame?.update(now)
    slingshotGame?.update(dt,now)
  }
  updateArtisticOutlineStyle()
  if(mode==='arrival')updateArrivalFlight(now)
  else if(mode==='aerial') orbit.update()
  else if(mode==='walk'&&!sceneOverlayOpen()&&(touchModePreferred||pointer.isLocked||!pointerLockAvailable)) {
    const beforeX=camera.position.x,beforeZ=camera.position.z
    const keyboardActive=keyboardMovementActive()
    const allowPointTarget=!keyboardActive&&(cachedSceneInteraction==='default'||basketballGame?.hasHeld())&&!chalkThrowing?.hasHeld()
    const pointResult=pointWalkController.update(dt,now,{allowTarget:allowPointTarget})
    let movementInputActive=pointResult.moving||pointResult.moved
    if(!pointResult.moving&&!pointResult.moved){
      camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(forward,camera.up).normalize()
      const input=new THREE.Vector3()
      if(keys.has('KeyW')||keys.has('ArrowUp'))input.add(forward)
      if(keys.has('KeyS')||keys.has('ArrowDown'))input.sub(forward)
      if(keys.has('KeyD')||keys.has('ArrowRight'))input.add(right)
      if(keys.has('KeyA')||keys.has('ArrowLeft'))input.sub(right)
      const touchMagnitude=Math.min(1,touchMoveInput.length())
      movementInputActive=keyboardActive||touchMagnitude>.12
      if(touchMagnitude)input.addScaledVector(right,touchMoveInput.x).addScaledVector(forward,-touchMoveInput.y)
      if(input.lengthSq())input.normalize().multiplyScalar(keyboardActive?1:touchMagnitude||1)
      const baseSpeed=keys.has('ShiftLeft')?CAMPUS.player.sprint:CAMPUS.player.speed
      velocity.lerp(input.multiplyScalar(baseSpeed*MOVE_SPEED_SCALE),1-Math.exp(-dt*12))
      movePlayer(velocity.x*dt,velocity.z*dt)
    }else if(dt>0)velocity.set((camera.position.x-beforeX)/dt,0,(camera.position.z-beforeZ)/dt)
    const travelled=Math.hypot(camera.position.x-beforeX,camera.position.z-beforeZ)
    footstepCooldown=Math.max(0,footstepCooldown-dt)
    if(movementInputActive&&travelled>.0005) {
      if(footstepCooldown<=0) {
        footstepCooldown=keyboardActive&&keys.has('ShiftLeft')?.35:.52
        const footstepGroup=footstepAudioGroupAt(
          camera.position.x,camera.position.z,camera.position.y-CAMPUS.player.eyeHeight,
        )
        gameAudio.play(footstepGroup,{
          volume:keyboardActive&&keys.has('ShiftLeft')?.28:.22,
          rate:footstepGroup==='footstepsSand'?(keyboardActive&&keys.has('ShiftLeft')?.8:.74):(keyboardActive&&keys.has('ShiftLeft')?.87:.8),
          pan:footstepSide*.18,
        })
        footstepSide*=-1
      }
    } else if(!movementInputActive||velocity.lengthSq()<.01)footstepCooldown=0
    if(longJumpGame?.proximity(camera.position))showToast('这里可以跳远 · 对准踏板点击开始')
  }
  updateWebglHud(now)
  updateCicadaAmbient(now)
  updateFrogAmbient(now)
  updateClassroomShadowPreset()
  updateIndoorLighting(dt)
  syncBuildingInteriorStreaming()
  updatePersonalRoomVisit(now)
  renderFrame()
}
requestAnimationFrame(animate)

function runB1StairCollisionRegression() {
  const b=CAMPUS.buildings.building1
  const stairFrontZ=b.main.center[1]+b.main.size[1]/2-b.corridor
  // 换向后从南侧梯道进入，在外端平台向北折返，从北侧梯道到达二层。
  const entryLaneZ=stairFrontZ+1.5*1.5
  const route=(startX,direction)=>{
    const position=new THREE.Vector3(startX,CAMPUS.player.eyeHeight,entryLaneZ)
    const stages=[
      ['ground-to-platform',direction*.12,0,8],['lower-flight',direction*.12,0,35],
      ['outer-landing',direction*.12,0,11],['landing-turn',0,-.12,14],
      ['align-upper',-direction*.12,0,11],['upper-flight',-direction*.12,0,35],
    ]
    const results=stages.map(([name,dx,dz,count])=>{
      let failed=0
      for(let i=0;i<count;i++)if(!navigation.move(position,dx,dz))failed++
      return {name,failed,ground:+(position.y-CAMPUS.player.eyeHeight).toFixed(3),x:+position.x.toFixed(3),z:+position.z.toFixed(3)}
    })
    return {pass:results.every(stage=>stage.failed===0)&&Math.abs(results.at(-1).ground-3.5)<.01,results}
  }
  const west=route(-17.5,-1),east=route(12.5,1)
  const sidePosition=new THREE.Vector3(-18.67,CAMPUS.player.eyeHeight,-16.25)
  for(let i=0;i<8;i++)navigation.move(sidePosition,0,.12)
  const sideBlocked=sidePosition.z<=-16.03
  const zNorth=b.main.center[1]-b.main.size[1]/2
  const northFloorEdge=zNorth-(b.structuralSlabEdgeOverhang??b.slabEdgeOverhang)
  const outerMin=b.main.center[0]-b.main.size[0]/2
  const central=[b.main.center[0]-b.centralBay/2,b.main.center[0]+b.centralBay/2]
  const rooms=[
    {start:outerMin+b.wall},
    {start:outerMin+b.wall+9+b.wall},
    {start:central[1]},
    {start:central[1]+9+b.wall},
  ]
  const rearDoorXs=rooms.flatMap(room=>[room.start+.9,room.start+8.1])
  const rearDoorDirect=rearDoorXs.map(x=>{
    const position=new THREE.Vector3(x,CAMPUS.player.eyeHeight,northFloorEdge-.76)
    for(let step=0;step<22;step++)navigation.move(position,0,.07)
    const ground=position.y-CAMPUS.player.eyeHeight
    return {x:+x.toFixed(3),ground:+ground.toFixed(3),entered:position.z>zNorth+b.wall/2&&Math.abs(ground-b.raised)<.01}
  })
  const rearDoorDiagonal=rearDoorXs.flatMap(x=>[-1,1].map(side=>{
    // 从高一级台阶正侧方斜切门洞：修复前会跳过低一级，并以 0m 地面高度
    // 进入 0.40m 楼板范围。修复后应被台阶侧面或门侧墙垛挡住。
    const position=new THREE.Vector3(
      x+side*(1.25/2+CAMPUS.player.radius+.04),CAMPUS.player.eyeHeight,northFloorEdge-.16,
    )
    for(let step=0;step<20;step++)navigation.move(position,-side*.07,.055)
    const ground=position.y-CAMPUS.player.eyeHeight
    const penetrated=position.z>zNorth+b.wall/2&&ground<b.raised-.01
    return {x:+x.toFixed(3),side,ground:+ground.toFixed(3),final:[+position.x.toFixed(3),+position.z.toFixed(3)],penetrated}
  }))
  const rearDoorSteps={
    pass:rearDoorDirect.every(sample=>sample.entered)&&rearDoorDiagonal.every(sample=>!sample.penetrated),
    direct:rearDoorDirect,diagonal:rearDoorDiagonal,
  }
  return {
    pass:west.pass&&east.pass&&sideBlocked&&rearDoorSteps.pass,
    west,east,sideBlocked,sideFinalZ:+sidePosition.z.toFixed(3),rearDoorSteps,
  }
}

const performanceReviewCameras={
  aerial:{position:[36,58,42],target:[-4,0,-34]},
  gate:{position:[-2.5,2.2,4.5],target:[-2.5,1.5,-10]},
  courtyard:{position:[-2.5,2.0,-10],target:[-7,2.2,-38]},
  mainField:{position:[18,8,-28],target:[-8,1.5,-45]},
  activityBasketball:{position:[9.8,2.35,-38.8],target:[15.1,1.55,-44.1]},
  activity:{position:[7.5,6.5,-43],target:[18,.5,-55]},
  dormitorySlide:{position:[14,6,-19],target:[25,2,-24]},
  slingshotCorner:{position:[20.6,2.05,-18.0],target:[23.45,1.72,-13.05]},
  slingshotDistanceLines:{position:[20.9,5.4,-29.0],target:[23.25,.55,-17.9]},
  b1Culture:{position:[3.175,1.65,-14.55],target:[3.175,1.65,-15.72]},
  b1InteriorCulture:{position:[5.5,1.65,-19.2],target:[5.5,1.55,-15.72]},
  b1FrontBoardCulture:{position:[5.5,1.65,-18.5],target:[1.1,1.85,-18.5]},
  b1RearBoardCulture:{position:[5.5,1.65,-18.5],target:[9.9,1.85,-18.5]},
  b1TeacherDeskProps:{position:[-15.56,1.72,-18.42],target:[-16.42,1.36,-19.1]},
  b2Culture:{position:[-12.89,1.8,-45.5],target:[-12.89,1.8,-48.3]},
  b1Planters:{position:[7,1.45,-10.6],target:[7,.72,-13.72]},
  b2Planters:{position:[-16.38,1.4,-44.15],target:[-16.38,.72,-47.18]},
}

const applyPerformanceCamera=name=>{
  const checkpoint=performanceReviewCameras[name]
  if(!checkpoint)throw new Error(`Unknown performance camera: ${name}`)
  mode='review';pointer.unlock();orbit.enabled=false;classroomDetailInteractionPin=null
  perimeterEnvironment.syncMode(name==='aerial'?'aerial':mode)
  camera.position.fromArray(checkpoint.position)
  camera.lookAt(...checkpoint.target)
  syncBuildingInteriorStreaming(true)
  renderFrame()
  return checkpoint
}

const performanceSnapshot=()=>{
  renderFrame()
  const sceneRendererInfo=measureSceneRenderInfo()
  const resources=performance.getEntriesByType('resource')
  const resourceTotals=resources.reduce((totals,entry)=>({
    transferBytes:totals.transferBytes+(entry.transferSize||0),
    encodedBytes:totals.encodedBytes+(entry.encodedBodySize||0),
    decodedBytes:totals.decodedBytes+(entry.decodedBodySize||0),
  }),{transferBytes:0,encodedBytes:0,decodedBytes:0})
  const context=renderer.getContext()
  return {
    readyMs:sceneReadyAt,
    loading:{
      requestedAtMs:loadingRequestedAt==null?null:loadingRequestedAt-performanceStartedAt,
      clickToReadyMs:loadingRequestedAt==null||sceneReadyAt==null?null:sceneReadyAt-(loadingRequestedAt-performanceStartedAt),
      completed:loadingTaskCompleted,total:loadingTaskTotal,
      phases:{
        businessTasksMs:loadingRequestedAt==null||businessAssetsReadyAt==null?null:businessAssetsReadyAt-loadingRequestedAt,
        physicalBarrierTailMs:businessAssetsReadyAt==null||physicalAssetsReadyAt==null?null:physicalAssetsReadyAt-businessAssetsReadyAt,
        preGpuSceneSetupMs:scenePreGpuMs,
        gpuUploadAndFirstFrameMs:pendingGpuReady[0]?.gpuUploadEstimateMs??([...assetTimings.values()][0]?.gpuUploadEstimateMs??null),
      },
    },
    renderer:sceneRendererInfo,
    buffers:{
      css:[innerWidth,innerHeight],drawing:[renderer.domElement.width,renderer.domElement.height],
      composer:[composer.readBuffer.width,composer.readBuffer.height],
      rendererDpr:renderer.getPixelRatio(),composerDpr:activeComposerPixelRatio,
      maxDrawingBuffer:{...drawingBufferLimit},pixelRatioLimit:maxPixelRatioForViewport(),
      gtao:[composer.readBuffer.width,composer.readBuffer.height],
      shadowMap:[sun.shadow.mapSize.x,sun.shadow.mapSize.y],
    },
    textures:textureMemoryEstimate(),
    frames:frameTimingReport(),
    resources:{requests:resources.length,...resourceTotals},
    navigation:{totals:{colliders:colliders.length,walkSurfaces:walkSurfaces.length},spatial:navigation.spatialPolicy,candidates:navigation.candidateStats()},
    quality:{
      profile:performanceProfile.id,automaticDowngrade:performanceProfile.automaticDowngrade,
      modelLodEnabled:performanceProfile.modelDetail.lodEnabled,downgradeReasons:[],
      gtaoEnabled:gtaoPass.enabled,smaaEnabled:smaaPass.enabled,artisticOutlinesEnabled,shadowsEnabled:renderer.shadowMap.enabled,
    },
    device:{
      userAgent:navigator.userAgent,devicePixelRatio,navigatorDeviceMemory:navigator.deviceMemory??null,
      hardwareConcurrency:navigator.hardwareConcurrency??null,
      webglVersion:renderer.capabilities.isWebGL2?2:1,maxTextureSize:renderer.capabilities.maxTextureSize,
      maxAnisotropy:renderer.capabilities.getMaxAnisotropy(),renderer:context.getParameter(context.RENDERER),vendor:context.getParameter(context.VENDOR),
    },
  }
}

// 验收适配器只进入开发／测试构建，正式入口不携带这批测量与碰撞探针。
if(import.meta.env.DEV||import.meta.env.VITE_ENABLE_TEST_API==='1')window.__CAMPUS_TEST__={
  version:CAMPUS.meta.version,
  config:CAMPUS,
  performanceProfile:()=>structuredClone(performanceProfile),
  sunGlare:()=>sunGlare.snapshot(),
  audio:()=>gameAudio.snapshot(),
  hud:()=>webglHud.snapshot(),
  personalRecords:()=>({raw:personalRecords.snapshot(),view:personalRecordViewModel(),book:personalRecordBook.snapshot()}),
  openPersonalRecordMenu:()=>{openPersonalRecordMenu();renderFrame();return personalRecordBook.snapshot()},
  openPersonalRecordBook:(page='overview')=>{openPersonalRecordBook(page);renderFrame();return personalRecordBook.snapshot()},
  personalRecordAction:action=>{personalRecordBook.applyAction(action);renderFrame();return personalRecordBook.snapshot()},
  closePersonalRecordBook:()=>{closePersonalRecordBook();renderFrame();return personalRecordBook.snapshot()},
  clearPersonalRecords:()=>{const result=personalRecords.clear();personalRecordBook.setViewModel(personalRecordViewModel());renderFrame();return{result,...window.__CAMPUS_TEST__.personalRecords()}},
  recordPersonalRoom:id=>{personalRecords.recordRoom(id);return window.__CAMPUS_TEST__.personalRecords()},
  recordPersonalDocument:item=>{personalRecords.recordDocument(item);return window.__CAMPUS_TEST__.personalRecords()},
  recordPersonalObject:item=>{personalRecords.recordObject(item);return window.__CAMPUS_TEST__.personalRecords()},
  recordPersonalSnackBag:id=>{personalRecords.recordSnackBag(id);return window.__CAMPUS_TEST__.personalRecords()},
  recordPersonalMysteryDevice:id=>{personalRecords.recordMysteryDevice(id);return window.__CAMPUS_TEST__.personalRecords()},
  recordPersonalGame:(id,update={})=>{personalRecords.recordGame(id,update);return window.__CAMPUS_TEST__.personalRecords()},
  minigamePause:()=>({...minigamePause}),
  flagRaising:()=>flagRaisingGame?.snapshot()??null,
  focusFlagPlatform:(distance=2,level='lower')=>{
    const config=CAMPUS.facilities.flag
    const targetY=level==='upper'?config.lower.height+config.upper.height*.5:config.lower.height*.5
    camera.position.set(config.center[0],CAMPUS.player.eyeHeight,config.center[1]+distance)
    camera.lookAt(config.center[0],targetY,config.center[1]);renderFrame()
    return {level,player:window.__CAMPUS_TEST__.player(),hit:flagRaisingGame?.hit(innerWidth/2,innerHeight/2,true)??null}
  },
  enterFlagRaising:()=>{flagRaisingGame?.enter();flagRaisingGame?.settle();renderFrame();return{mode,flag:flagRaisingGame?.snapshot(),hud:webglHud.snapshot().flagRaising}},
  pullFlagRope:(pixels=CAMPUS.facilities.flag.game.strokePixels)=>{const result=flagRaisingGame?.testPull(pixels);renderFrame();return result},
  advanceFlagRaising:(milliseconds=700)=>{flagRaisingGame?.update(performance.now()+milliseconds);renderFrame();return flagRaisingGame?.snapshot()},
  exitFlagRaising:()=>{const result=flagRaisingGame?.exit();renderFrame();return{mode,flag:flagRaisingGame?.snapshot(),result}},
  resetFlagRaising:()=>{const result=flagRaisingGame?.reset();renderFrame();return result},
  pauseMinigame:()=>{pauseActiveMinigame('test');renderFrame();return{pause:{...minigamePause},hud:webglHud.snapshot().minigamePause}},
  resumeMinigame:()=>{resumePausedMinigame();renderFrame();return{pause:{...minigamePause},mode}},
  exitPausedMinigame:()=>{exitPausedMinigame();renderFrame();return{pause:{...minigamePause},mode}},
  setHudInteraction:name=>{webglHud.setInteraction(name);return webglHud.snapshot()},
  prepareArcadeComicHud:(game='basketball')=>webglHud.prepareArcadeComicGame(game),
  playArcadeComicCelebration:(game='basketball',phrase=null,kind='major',duration=1050,secondaryPhrase=null)=>{webglHud.playArcadeComicCelebration(game,phrase,kind,duration,secondaryPhrase);return webglHud.snapshot().arcadeComic},
  flashPingPongFeedback:(title,detail='',duration=900)=>{webglHud.flashPingPongFeedback(title,detail,duration);return webglHud.snapshot().arcadeComic},
  resetPingPongGoodFeedback:()=>{lastPingPongGoodFeedbackAt=-Infinity;return true},
  probePingPongGoodFeedback:(now,sample)=>shouldShowPingPongGoodFeedback(now,sample),
  setArcadeHudSample:(game,values={})=>{
    if(game==='basketball')webglHud.setBasketballHud({visible:true,points:values.points??0,hits:values.hits??0,attempts:values.attempts??0})
    else if(game==='pingPong')webglHud.setPingPongHud({visible:true,mode:values.mode??'练习',playerScore:values.playerScore??0,aiScore:values.aiScore??0,server:values.server??'玩家',phase:'ready',prompt:''})
    else if(game==='longJump')webglHud.setLongJumpHud({visible:true,phase:'result',distance:values.distance??0,evaluation:'',result:true})
    else if(game==='bambooClimb')webglHud.setBambooClimbHud({visible:true,phase:'rising',side:'left',progress:values.progress??0,feedback:values.rise==null?'':`抓稳 +${values.rise}厘米`})
    else if(game==='hopscotch')webglHud.setHopscotchHud({visible:true,target:values.target??1,bestProgress:values.bestProgress??0})
    else if(game==='shuttlecock')webglHud.setShuttlecockHud({visible:true,streak:values.streak??0,best:values.best??0,expectedFoot:'left'})
    else if(game==='jacks')webglHud.setJacksHud({visible:true,stage:values.stage??1,remaining:values.remaining??6,streak:values.streak??0,failures:values.failures??0})
    return webglHud.snapshot()[game]
  },
  locomotion:()=>({pointWalk:pointWalkController.snapshot()}),
  probePointTarget:(allowTarget=true)=>{
    pointWalkController.probe(performance.now()+1000,{allowTarget})
    renderFrame()
    return window.__CAMPUS_TEST__.locomotion()
  },
  confirmPointWalk:()=>pointWalkController.confirm(),
  advancePointWalk:(seconds=1,steps=60)=>{
    const dt=seconds/Math.max(1,steps)
    let result=null
    for(let index=0;index<steps;index++)result=pointWalkController.update(dt,performance.now()+index*dt*1000,{allowTarget:true})
    renderFrame()
    return {result,locomotion:window.__CAMPUS_TEST__.locomotion(),player:window.__CAMPUS_TEST__.player()}
  },
  cancelPointWalk:(reason='test')=>pointWalkController.cancel(reason),
  focusCampusGuide:(distance=1.8)=>{
    const board=schoolEphemeraAnchors.passageGuide
    if(!board)return null
    const target=new THREE.Vector3(
      board.wallCenter[0]+board.normal[0]*board.boardOffset,
      board.floorY+board.board.bottom+board.board.height/2,
      board.wallCenter[1]+board.normal[1]*board.boardOffset,
    )
    camera.position.copy(target).add(new THREE.Vector3(board.normal[0],0,board.normal[1]).multiplyScalar(distance))
    camera.lookAt(target);renderFrame()
    return {id:'b1-passage-west-campus-guide',target:target.toArray(),distance}
  },
  passageMediaLinks:()=>passageMediaLinks.snapshot(),
  passageSiteQr:()=>siteQrOverlay.snapshot(),
  closePassageSiteQr:()=>closePassageSiteQr({restorePointerLock:false}),
  focusDevelopmentProcess:(distance=2.2)=>{
    const board=schoolEphemeraAnchors.passageDevelopment
    if(!board)return null
    const target=new THREE.Vector3(
      board.wallCenter[0]+board.normal[0]*board.boardOffset,
      board.floorY+board.board.bottom+board.board.height/2,
      board.wallCenter[1]+board.normal[1]*board.boardOffset,
    )
    camera.position.copy(target).add(new THREE.Vector3(board.normal[0],0,board.normal[1]).multiplyScalar(distance))
    camera.lookAt(target);renderFrame()
    return {id:'b1-passage-east-development-process',target:target.toArray(),distance}
  },
  focusPassageMediaLink:(label='小红书',distance=1.8)=>{
    const board=schoolEphemeraAnchors.passageDevelopment
    const targetInfo=passageMediaLinks.snapshot().links.find(link=>link.label===label)
    if(!board||!targetInfo)return null
    const [left,right,top,bottom]=targetInfo.bounds
    const u=(left+right)/2,v=(top+bottom)/2
    const tangent=new THREE.Vector3(board.normal[1],0,-board.normal[0])
    const target=new THREE.Vector3(
      board.wallCenter[0]+board.normal[0]*board.boardOffset,
      board.floorY+board.board.bottom+board.board.height*(1-v),
      board.wallCenter[1]+board.normal[1]*board.boardOffset,
    ).addScaledVector(tangent,(u-.5)*board.board.width)
    camera.position.copy(target).add(new THREE.Vector3(board.normal[0],0,board.normal[1]).multiplyScalar(distance))
    camera.lookAt(target);renderFrame()
    const hit=passageMediaLinks.hit(innerWidth/2,innerHeight/2,true)
    return {id:'b1-passage-east-development-process',target:target.toArray(),distance,hit}
  },
  playAudio:(group,options)=>gameAudio.play(group,options),
  modelDetailAudit:()=>{
    let lodObjects=0
    scene.traverse(node=>{if(node.isLOD)lodObjects++})
    return {lodEnabled:performanceProfile.modelDetail.lodEnabled,strategy:performanceProfile.modelDetail.strategy,lodObjects}
  },
  planterShrubAudit:()=>{
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3()
    const groups=[],cardWidths=[],cardHeights=[]
    root.traverse(node=>{
      if(!node.isInstancedMesh||!node.name.startsWith('planter-camphor-shrub-cell-'))return
      groups.push({name:node.name,atlasCell:node.userData.atlasCell,count:node.count,shrubs:node.userData.shrubs.length})
      for(let index=0;index<node.count;index++) {
        node.getMatrixAt(index,matrix);matrix.decompose(position,quaternion,scale)
        cardWidths.push(scale.x);cardHeights.push(scale.y)
      }
    })
    return {
      placements:planterCamphorShrubPlacements.length,groups,cards:cardWidths.length,
      cardWidth:[Math.min(...cardWidths),Math.max(...cardWidths)].map(value=>+value.toFixed(3)),
      cardHeight:[Math.min(...cardHeights),Math.max(...cardHeights)].map(value=>+value.toFixed(3)),
      cardScale:PLANTER_SHRUB_CARD_SCALE,flowers:{...planterFlowerAssetLoadState},
    }
  },
  entryReady:()=>startSceneLoading().then(()=>true),
  ready:()=>startSceneLoading().then(()=>true),
  loadingState:()=>({
    started:Boolean(sceneLoadPromise),ready:sceneIsReady,fullReady:fullSceneIsReady,
    completed:loadingTaskCompleted,total:loadingTaskTotal,
    taskIds:[...completeSceneAssetTaskIds],
    physical:runtimeLoadTracker.snapshot(),
  }),
  performanceSnapshot,
  assetTimings:()=>assetTimingReport(),
  loadingMetrics:()=>({
    requestedAtMs:loadingRequestedAt==null?null:loadingRequestedAt-performanceStartedAt,
    readyAtMs:sceneReadyAt,
    clickToReadyMs:loadingRequestedAt==null||sceneReadyAt==null?null:sceneReadyAt-(loadingRequestedAt-performanceStartedAt),
    completed:loadingTaskCompleted,total:loadingTaskTotal,
    phases:{
      businessTasksMs:loadingRequestedAt==null||businessAssetsReadyAt==null?null:businessAssetsReadyAt-loadingRequestedAt,
      physicalBarrierTailMs:businessAssetsReadyAt==null||physicalAssetsReadyAt==null?null:physicalAssetsReadyAt-businessAssetsReadyAt,
      preGpuSceneSetupMs:scenePreGpuMs,
      gpuUploadAndFirstFrameMs:[...assetTimings.values()][0]?.gpuUploadEstimateMs??null,
    },
  }),
  frameTimings:()=>frameTimingReport(),
  sampleFrameTimings:(samples=180,warmup=30)=>new Promise(resolve=>{
    const values=[]
    let previous=performance.now(),remainingWarmup=warmup
    const sample=now=>{
      const duration=now-previous;previous=now
      if(remainingWarmup>0)remainingWarmup--
      else values.push(duration)
      if(values.length<samples)requestAnimationFrame(sample)
      else resolve({samples:values.length,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),p99Ms:percentile(values,.99),maxMs:Math.max(...values)})
    }
    requestAnimationFrame(sample)
  }),
  fixedCameras:()=>structuredClone(performanceReviewCameras),
  applyFixedCamera:applyPerformanceCamera,
  resetNavigationCandidateStats:()=>{navigation.resetCandidateStats();return navigation.candidateStats()},
  controls:()=>({
    mode,pointerLockAvailable,pointerLocked:pointer.isLocked,pointerLookEnabled:pointer.enabled,
    minigamePaused:minigamePause.active,minigamePauseMode:minigamePause.mode,
    keyboardMovementActive:keyboardMovementActive(),movementKeys:MOVEMENT_KEY_CODES.filter(code=>keys.has(code)),
    touchModePreferred,touchControlsVisible:touchControls.getAttribute('aria-hidden')==='false',
    touchMovement:touchMoveInput.toArray().map(value=>+value.toFixed(3)),
    touchJoystickActive:touchJoystickPointerId!=null,touchLookActive:touchLookPointerId!=null,touchTapActivations,
    touchLookPointers:touchLookPointers.size,basketballMultiTouch:touchBasketballMultiTouch,basketballShootActive:touchBasketballShootPointerId!=null,basketballResetPerformed:touchBasketballResetPerformed,
    fallback:document.body.classList.contains('fallback-controls'),
    dragging:fallbackLookDragging,
    seated:seatedState?{sourceId:seatedState.sourceId,seatId:seatedState.seatId,classroom:seatedState.classroom}:null,
    blackboard:blackboardDrawing.snapshot().active,
    rotation:[camera.rotation.x,camera.rotation.y,camera.rotation.z].map(value=>+value.toFixed(4)),
    projection:{
      aspect:+camera.aspect.toFixed(4),verticalFov:+camera.fov.toFixed(2),
      horizontalFov:+THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect)).toFixed(2),
    },
  }),
  arrival:()=>({
    ...arrivalState,durationMs:arrivalConfig.durationMs,
    position:camera.position.toArray().map(value=>+value.toFixed(3)),
    spawn:[...CAMPUS.player.spawn],start:[...arrivalConfig.start],
  }),
  classroomSeating:()=>({
    policy:{maxDistance:SCENE_INTERACTION_MAX_DISTANCE,requiresClearLineOfSight:true},
    interactions:classroomSeatingInteractions.length,
    desks:classroomSeatingInteractions.filter(item=>item.type==='desk').length,
    stools:classroomSeatingInteractions.filter(item=>item.type==='stool').length,
    chairs:classroomSeatingInteractions.filter(item=>item.type==='chair').length,
    benches:classroomSeatingInteractions.filter(item=>item.type==='bench').length,
    sittingEyeHeight:1.12,
    seated:seatedState?{sourceId:seatedState.sourceId,seatId:seatedState.seatId,classroom:seatedState.classroom}:null,
    sampleStool:(()=>{const item=classroomSeatingInteractions.find(entry=>entry.type==='stool');return item?{id:item.id,center:[...item.center],facing:[...item.facing]}:null})(),
    sampleChair:(()=>{const item=classroomSeatingInteractions.find(entry=>entry.type==='chair');return item?{id:item.id,center:[...item.center],facing:[...item.facing],classroom:item.classroom,zone:item.zone}:null})(),
    sampleBench:(()=>{const item=classroomSeatingInteractions.find(entry=>entry.type==='bench');return item?{id:item.id,center:[...item.center],facing:[...item.facing]}:null})(),
    ids:classroomSeatingInteractions.map(item=>item.id),
  }),
  blackboardDrawing:()=>({
    ...blackboardDrawing.snapshot(),
    ids:classroomTeachingBlackboards.map(board=>board.id),
    passageBoards:[schoolEphemeraAnchors.passageGuide,schoolEphemeraAnchors.passageDevelopment].map(board=>({
      id:board.id,writable:board.board.writable,
    })),
  }),
  focusPassageBlackboard:(side='west',distance=1.8)=>{
    if(blackboardDrawing.isActive())blackboardDrawing.exit()
    const board=side==='east'?schoolEphemeraAnchors.passageDevelopment:schoolEphemeraAnchors.passageGuide
    if(!board)return null
    mode='walk';orbit.enabled=false
    if(pointer.isLocked)pointer.unlock()
    const target=new THREE.Vector3(
      board.wallCenter[0]+board.normal[0]*board.boardOffset,
      board.floorY+board.board.bottom+board.board.height/2,
      board.wallCenter[1]+board.normal[1]*board.boardOffset,
    )
    camera.position.copy(target).add(new THREE.Vector3(board.normal[0],0,board.normal[1]).multiplyScalar(distance))
    camera.lookAt(target);renderFrame()
    const drawingHit=blackboardDrawing.hit(innerWidth/2,innerHeight/2,true)
    return {id:board.id,writable:board.board.writable,distance,drawingHit:drawingHit?.board.id??null}
  },
  focusTeachingBlackboard:(id=classroomTeachingBlackboards[0]?.id,distance=1.35)=>{
    if(blackboardDrawing.isActive())blackboardDrawing.exit()
    const board=classroomTeachingBlackboards.find(item=>item.id===id)
    if(!board)return null
    mode='walk';orbit.enabled=false
    if(pointer.isLocked)pointer.unlock()
  document.body.classList.add('walking')
    camera.position.set(
      board.center[0]+board.normal[0]*distance,
      board.center[1],
      board.center[2]+board.normal[1]*distance,
    )
    camera.lookAt(...board.center)
    applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,board.classroom]),true)
    renderFrame()
    const hit=blackboardDrawing.hit(innerWidth/2,innerHeight/2,true)
    return {id:board.id,camera:camera.position.toArray(),target:[...board.center],hit:hit?{id:hit.board.id,distance:+hit.distance.toFixed(3)}:null}
  },
  exitBlackboardDrawing:()=>blackboardDrawing.exit(),
  sitClassroomSeat:id=>{
    const interaction=classroomSeatingById.get(id)
    return interaction?enterClassroomSeat({interaction,point:new THREE.Vector3(...interaction.center)}):false
  },
  leaveClassroomSeat,
  seatedGroundPoint:()=>{
    const seat=seatedState?classroomSeatingById.get(seatedState.seatId):null
    if(seat) {
      camera.lookAt(
        seat.center[0]+seat.facing[0]*.35,
        seat.center[1]-.19,
        seat.center[2]+seat.facing[1]*.35,
      )
      camera.updateMatrixWorld(true)
    }
    const rect=renderer.domElement.getBoundingClientRect()
    for(let y=rect.height-2;y>=rect.height*.48;y-=12)for(let x=8;x<=rect.width-8;x+=16) {
      if(hitSeatedGround(rect.left+x,rect.top+y,false))return {x:+x.toFixed(1),y:+y.toFixed(1)}
    }
    return null
  },
  classroomSeatWallOcclusionAudit:id=>{
    const interaction=classroomSeatingById.get(id)
    const zone=interaction&&classroomInteriorZones.find(item=>item.name===interaction.classroom)
    if(!interaction||!zone)return null
    const [minX,maxX,minZ,maxZ]=zone.bounds,[x,y,z]=interaction.center
    const candidates=[
      {camera:[minX-.25,y,z],distance:x-minX+.25},
      {camera:[maxX+.25,y,z],distance:maxX-x+.25},
      {camera:[x,y,minZ-.25],distance:z-minZ+.25},
      {camera:[x,y,maxZ+.25],distance:maxZ-z+.25},
    ].filter(item=>item.distance<=SCENE_INTERACTION_MAX_DISTANCE).sort((a,b)=>a.distance-b.distance)
    return candidates.map(item=>{
      mode='walk';orbit.enabled=false;camera.position.fromArray(item.camera);camera.lookAt(x,y,z);renderFrame()
      return {distance:+item.distance.toFixed(3),blocked:hitClassroomSeating(innerWidth/2,innerHeight/2,true)==null}
    })
  },
  sceneSummary:()=>({objects:root.children.length,colliders:colliders.length,walkSurfaces:walkSurfaces.length,labels:debugObjects.length,...batchStats}),
  buildingInteriorStreaming:()=>({
    enabled:buildingInteriorStreamingEnabled,
    policy:{enterDistance:CLASSROOM_DETAIL_ENTER_DISTANCE,exitDistance:CLASSROOM_DETAIL_EXIT_DISTANCE},
    inactiveSceneTextureReleases,
    activeRooms:[...activeClassroomDetailRooms].sort(),
    lod:{visible:classroomLodVisible,studentDesks:classroomDeskProxyRecords.length,teacherDesks:teacherDeskProxyRecords.length,blackboards:blackboardProxyRecords.length,b2WhiteWallShells:b2InteriorWallProxyRecords.length,drawObjects:classroomLodProxyEntries.length},
    roots:Object.fromEntries(['building1','building2'].map(building=>[building,{
      visible:buildingInteriorRenderRoots[building].visible,
      rooms:buildingInteriorRenderRoots[building].children.length,
      visibleRooms:buildingInteriorRenderRoots[building].children.filter(room=>room.visible).length,
      batches:buildingInteriorRenderRoots[building].children.reduce((sum,room)=>sum+room.children.length,0),
      outlineBatches:buildingInteriorOutlineRoots[building].children.reduce((sum,room)=>sum+room.children.length,0),
    }])),
  }),
  focusClassroomDoor:(classroom,distance=CLASSROOM_DETAIL_ENTER_DISTANCE)=>{
    const zone=classroomInteriorZones.find(item=>item.name===classroom)
    const door=zone?.doors[0]
    if(!door)return null
    const [x,y,z]=door.position,normalX=Math.sin(door.rotationY),normalZ=Math.cos(door.rotationY)
    mode='walk';orbit.enabled=false
    camera.position.set(x+normalX*distance,y+CAMPUS.player.eyeHeight,z+normalZ*distance)
    camera.lookAt(x,y+1.2,z)
    syncBuildingInteriorStreaming(true);renderFrame()
    return {classroom,distance,camera:camera.position.toArray(),streaming:[...activeClassroomDetailRooms].sort()}
  },
  classroomFixtures:()=>({...classroomFixtureStats}),
  schoolEphemera:()=>schoolEphemeraSnapshot(),
  schoolBooks:()=>schoolBooksSnapshot(),
  compositionPages:()=>compositionPagesSnapshot(),
  comicBooks:()=>comicBooksSnapshot(),
  snackBags:()=>snackBagsSnapshot(),
  pencilBoxes:()=>pencilBoxesSnapshot(),
  snackModelViewer:()=>snackModelViewerSnapshot(),
  focusSnackBag:(id=null,distance=.46)=>{
    const assignment=snackBagsSnapshot().assignments?.find(item=>!id||item.id===id)
    if(!assignment)return null
    mode='walk';orbit.enabled=false
    if(pointer.isLocked)pointer.unlock()
    document.body.classList.add('walking')
    classroomDetailInteractionPin=assignment.classroom
    applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,assignment.classroom]),true)
    const target=new THREE.Vector3(...assignment.position)
    camera.position.set(
      target.x+Math.sin(assignment.rotationY)*distance,
      target.y+.16,
      target.z+Math.cos(assignment.rotationY)*distance,
    )
    camera.lookAt(target);renderFrame()
    return {assignment,camera:camera.position.toArray(),target:target.toArray()}
  },
  hitSnackBag:()=>{
    const hit=hitViewableSnack(innerWidth/2,innerHeight/2,true)
    return hit?{item:hit.item,distance:+hit.distance.toFixed(4),diagnostics:{...snackHitDiagnostics}}:null
  },
  openSnackModelViewer:async(id=null)=>{
    const item=snackBagsSnapshot().assignments?.find(candidate=>!id||candidate.id===id)
    if(!item)return null
    await openSnackModelViewer(item);renderFrame()
    return snackModelViewerSnapshot()
  },
  closeSnackModelViewer:()=>{
    closeOverlayViewer({restorePointerLock:false});classroomDetailInteractionPin=null;syncBuildingInteriorStreaming(true);renderFrame()
    return snackModelViewerSnapshot()
  },
  focusPencilBox:(id=null,distance=.46)=>{
    const assignment=pencilBoxesSnapshot().assignments?.find(item=>!id||item.id===id)
    if(!assignment)return null
    mode='walk';orbit.enabled=false
    if(pointer.isLocked)pointer.unlock()
    document.body.classList.add('walking')
    classroomDetailInteractionPin=assignment.classroom
    applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,assignment.classroom]),true)
    const bounds=assignment.worldBounds
    const target=new THREE.Vector3(
      (bounds.min[0]+bounds.max[0])/2,
      (bounds.min[1]+bounds.max[1])/2,
      (bounds.min[2]+bounds.max[2])/2,
    )
    camera.position.set(
      target.x+Math.sin(assignment.rotationY)*distance,
      target.y+(assignment.state==='open'?.19:.13),
      target.z+Math.cos(assignment.rotationY)*distance,
    )
    camera.lookAt(target);renderFrame()
    return {assignment,camera:camera.position.toArray(),target:target.toArray()}
  },
  hitPencilBox:()=>{
    const hit=hitViewablePencilBox(innerWidth/2,innerHeight/2,true)
    return hit?{item:hit.item,distance:+hit.distance.toFixed(4),diagnostics:{...pencilBoxHitDiagnostics}}:null
  },
  openPencilBoxModelViewer:async(id=null)=>{
    const item=pencilBoxesSnapshot().assignments?.find(candidate=>!id||candidate.id===id)
    if(!item)return null
    await openPencilBoxModelViewer(item);renderFrame()
    return snackModelViewerSnapshot()
  },
  documentViewer:()=>documentViewerSnapshot(),
  focusViewableDocument:(id=null,distance=.72)=>{
    const assignment=compositionPagesSnapshot().assignments.find(item=>!id||item.id===id)
      ??schoolBooksSnapshot().assignments.find(item=>!id||item.assetId===id)
      ??comicBooksSnapshot().assignments.find(item=>!id||item.id===id)
    if(!assignment)return null
    mode='walk';orbit.enabled=false
    if(pointer.isLocked)pointer.unlock()
    document.body.classList.add('walking')
    const target=new THREE.Vector3(...(assignment.coverPosition??assignment.position))
    const focusDistance=assignment.kind==='comic'?Math.min(distance,.38):distance
    if(assignment.kind==='comic')camera.position.set(
      target.x+Math.sin(assignment.rotationY)*focusDistance,
      target.y+.32,
      target.z+Math.cos(assignment.rotationY)*focusDistance,
    )
    else camera.position.set(target.x,target.y+distance,target.z+.18)
    camera.lookAt(target)
    if(assignment.classroom) {
      classroomDetailInteractionPin=assignment.classroom
      applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,assignment.classroom]),true)
    }
    renderFrame()
    const hit=hitViewableDocument(innerWidth/2,innerHeight/2,true)
    const rawHit=hitViewableDocument(innerWidth/2,innerHeight/2,true,true)
    return {
      assignment,hit:hit?{item:hit.item,distance:+hit.distance.toFixed(3)}:null,
      rawHit:rawHit?{item:rawHit.item,distance:+rawHit.distance.toFixed(3)}:null,
      camera:camera.position.toArray(),diagnostics:documentHitDiagnostics?{...documentHitDiagnostics}:null,
    }
  },
  openViewableDocument:async()=>{
    const hit=hitViewableDocument(innerWidth/2,innerHeight/2,true)
    if(!hit)return null
    await openDocumentViewer(hit.item);renderFrame()
    return documentViewerSnapshot()
  },
  closeViewableDocument:()=>{
    closeOverlayViewer({restorePointerLock:false});classroomDetailInteractionPin=null;syncBuildingInteriorStreaming(true);renderFrame()
    return documentViewerSnapshot()
  },
  schoolChalk:()=>schoolChalkSnapshot(),
  chalkThrowing:()=>chalkThrowing.snapshot(),
  focusPickableChalk:(id=null,distance=.48)=>{
    let item=schoolChalk.pickables().find(candidate=>!id||candidate.id===id)
    if(!item) {
      const assignment=schoolChalkSnapshot().assignments.find(candidate=>candidate.location==='desk'&&(!id||candidate.id===id))
      if(assignment){schoolChalk.activateClassroom(assignment.classroom);item=schoolChalk.pickables().find(candidate=>candidate.id===assignment.id)}
    }
    if(!item)return null
    mode='walk';orbit.enabled=false
    if(pointer.isLocked)pointer.unlock()
    document.body.classList.add('walking')
    const target=new THREE.Vector3(...item.position)
    camera.position.set(target.x,target.y+.24,target.z+distance)
    camera.lookAt(target);renderFrame()
    const hit=chalkThrowing.hitPickable(innerWidth/2,innerHeight/2,true)
    return {
      id:item.id,color:item.color,position:[...item.position],camera:camera.position.toArray(),
      hit:hit?{id:hit.item.id,distance:+hit.distance.toFixed(3),missDistance:+hit.missDistance.toFixed(3)}:null,
    }
  },
  focusChalkBox:(id=null,distance=.48)=>{
    const box=schoolChalkSnapshot().boxAssignments.find(candidate=>!id||candidate.id===id)
    if(!box)return null
    schoolChalk.activateClassroom(box.classroom)
    mode='walk';orbit.enabled=false
    if(pointer.isLocked)pointer.unlock()
    document.body.classList.add('walking')
    const target=new THREE.Vector3(box.position[0],box.position[1]+.025,box.position[2])
    camera.position.set(
      target.x+Math.sin(box.rotationY)*distance,
      target.y+.24,
      target.z+Math.cos(box.rotationY)*distance,
    )
    camera.lookAt(target);chalkThrowing.update(0);renderFrame()
    const hit=chalkThrowing.hitRecallBox(innerWidth/2,innerHeight/2,true)
    return {id:box.id,classroom:box.classroom,camera:camera.position.toArray(),hit:hit?{id:hit.box.id,distance:+hit.distance.toFixed(3)}:null}
  },
  focusSettledChalk:(id=null,distance=.42)=>{
    const projectile=chalkThrowing.snapshot().projectiles.find(item=>item.status==='settled'&&(!id||item.sourceId===id))
    if(!projectile)return null
    mode='walk';orbit.enabled=false
    if(pointer.isLocked)pointer.unlock()
    document.body.classList.add('walking')
    const target=new THREE.Vector3(...projectile.position)
    camera.position.set(target.x,target.y+.32,target.z+distance)
    camera.lookAt(target);renderFrame()
    const hit=chalkThrowing.hitPickable(innerWidth/2,innerHeight/2,true)
    return {id:projectile.sourceId,position:[...projectile.position],camera:camera.position.toArray(),hit:hit?{id:hit.item.id,distance:+hit.distance.toFixed(3)}:null}
  },
  aimChalkThrow:target=>{camera.lookAt(...target);renderFrame();return camera.quaternion.toArray()},
  projectWorld:position=>{
    const projected=new THREE.Vector3(...position).project(camera)
    return {x:(projected.x+1)*innerWidth/2,y:(1-projected.y)*innerHeight/2,ndc:[projected.x,projected.y,projected.z]}
  },
  throwHeldChalk:()=>chalkThrowing.throwHeld(),
  advanceChalkPhysics:(seconds=3)=>{
    const frames=Math.ceil(Math.max(0,seconds)*120)
    for(let frame=0;frame<frames;frame++)chalkThrowing.update(1/120)
    renderFrame();return chalkThrowing.snapshot()
  },
  classroomFurniture:()=>({
    ...classroomFurnitureStats,deskAnchors:classroomDeskAnchors.length,
    lightingContrast:{...classroomFurnitureOrientationShade},
    teacherDesks:classroomTeacherDeskAnchors.length,
    teacherDeskAnchors:classroomTeacherDeskAnchors.map(anchor=>({...anchor})),
    placementAudit:classroomFurniturePlacementAudit,
    minimumClearances:classroomFurnitureLayoutChecks.filter(item=>item.type!=='office').reduce((minimum,item)=>({
      podiumToFirstDesk:Math.min(minimum.podiumToFirstDesk,item.podiumToFirstDesk),
      columnAisle:Math.min(minimum.columnAisle,item.columnAisle),
      rear:Math.min(minimum.rear,item.rearClearance),side:Math.min(minimum.side,item.sideClearance),
    }),{podiumToFirstDesk:Infinity,columnAisle:Infinity,rear:Infinity,side:Infinity}),
    layouts:classroomFurnitureLayoutChecks.map(item=>({...item})),
    officeLayouts:classroomFurnitureLayoutChecks.filter(item=>item.type==='office').map(item=>({...item})),
    officePlacements:teacherOfficeFurniturePlacements.map(item=>({...item,desk:[...item.desk],chair:[...item.chair],chairFacing:[...item.chairFacing]})),
  }),
  // 近距离建筑验收时返回屏幕点下的真实网格名称，避免仅凭材质颜色猜测穿模来源。
  inspectSceneAt:(clientX=innerWidth/2,clientY=innerHeight/2)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    const pointer=new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-((clientY-rect.top)/rect.height)*2+1)
    const raycaster=new THREE.Raycaster()
    raycaster.setFromCamera(pointer,camera)
    return raycaster.intersectObjects(scene.children,true).filter(hit=>hit.object.isMesh).slice(0,12).map(hit=>({
      name:hit.object.name,distance:+hit.distance.toFixed(3),
      point:hit.point.toArray().map(value=>+value.toFixed(3)),
      material:Array.isArray(hit.object.material)?'multi':Object.entries(mat).find(([,material])=>material===hit.object.material)?.[0]??hit.object.material?.type,
    }))
  },
  largeMeshBounds:(minimumSpan=15)=>{
    const bounds=[]
    scene.traverse(object=>{
      if(!object.isMesh)return
      const box3=new THREE.Box3().setFromObject(object)
      const size=box3.getSize(new THREE.Vector3()),center=box3.getCenter(new THREE.Vector3())
      if(Math.max(size.x,size.z)<minimumSpan)return
      bounds.push({name:object.name,size:size.toArray().map(value=>+value.toFixed(2)),center:center.toArray().map(value=>+value.toFixed(2)),min:box3.min.toArray().map(value=>+value.toFixed(2)),max:box3.max.toArray().map(value=>+value.toFixed(2)),color:object.material?.color?`#${object.material.color.getHexString()}`:null})
    })
    return bounds.sort((a,b)=>b.size[0]*b.size[2]-a.size[0]*a.size[2])
  },
  navigation:()=>({
    engine:'independent-numeric-navigation',maxSubstep:navigation.maxSubstep,
    colliders:colliders.length,walkSurfaces:walkSurfaces.length,spatial:navigation.spatialPolicy,candidates:navigation.candidateStats(),
  }),
  gateExitCollisionRegression:()=>{
    const gate=CAMPUS.world.gate,limitZ=gate.center[1]-CAMPUS.player.radius-CAMPUS.world.wall.thickness/2
    const samples=[-.35,0,.35].map(ratio=>{
      const position=new THREE.Vector3(gate.center[0]+gate.width*ratio,CAMPUS.player.eyeHeight,gate.center[1]-.9)
      for(let step=0;step<24;step++)navigation.move(position,0,.08)
      return {x:+position.x.toFixed(3),z:+position.z.toFixed(3),blocked:position.z<=limitZ+.001}
    })
    return {pass:samples.every(sample=>sample.blocked),limitZ:+limitZ.toFixed(3),samples}
  },
  b1StairCollisionRegression:()=>runB1StairCollisionRegression(),
  walkSurfaceDetails:(pattern='')=>walkSurfaces.filter(surface=>!pattern||surface.name.includes(pattern)).map(surface=>({...surface})),
  lighting:()=>({
    exposure:renderer.toneMappingExposure,hemisphere:+hemisphere.intensity.toFixed(3),sun:sun.intensity,bounceFill:bounceFill.intensity,
    hemisphereTarget:indoorLightingActive()?performanceProfile.lighting.hemisphereIndoorIntensity:performanceProfile.lighting.hemisphereOutdoorIntensity,
    hemisphereOutdoor:performanceProfile.lighting.hemisphereOutdoorIntensity,
    hemisphereIndoor:performanceProfile.lighting.hemisphereIndoorIntensity,
    indoorBoostActive:indoorLightingActive(),
    hemisphereSky:`#${hemisphere.color.getHexString()}`,hemisphereGround:`#${hemisphere.groundColor.getHexString()}`,
    groundBounceEnabled:false,
    bounceFillPosition:bounceFill.position.toArray(),bounceFillTarget:bounceFill.target.position.toArray(),
    atmosphere:scene.background?.isColor?`#${scene.background.getHexString()}`:'equirectangular-panorama',
    sunPosition:sun.position.toArray(),sunTarget:sun.target.position.toArray(),
    shadowBounds:[sun.shadow.camera.left,sun.shadow.camera.right,sun.shadow.camera.bottom,sun.shadow.camera.top],
  }),
  setShadowExtent:extent=>{
    const value=THREE.MathUtils.clamp(Number(extent)||performanceProfile.shadows.cameraExtent,48,72)
    sun.shadow.camera.left=sun.shadow.camera.bottom=-value
    sun.shadow.camera.right=sun.shadow.camera.top=value
    sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;renderFrame()
    return [sun.shadow.camera.left,sun.shadow.camera.right,sun.shadow.camera.bottom,sun.shadow.camera.top]
  },
  postProcessing:()=>({
    gtaoEnabled:gtaoPass.enabled,blendIntensity:gtaoPass.blendIntensity,
    radius:gtaoPass.gtaoMaterial.uniforms.radius.value,
    smaaEnabled:smaaPass.enabled,
    outlinedParts:batchStats.outlinedParts,artisticOutlinesEnabled,
  }),
  renderResolutionPolicy:(width=innerWidth,height=innerHeight,dpr=devicePixelRatio)=>{
    const limit=maxPixelRatioForViewport(width,height)
    const rendererDpr=Math.min(dpr,performanceProfile.renderer.maxPixelRatio,limit)
    const composerRequested=highDensityTouchRendering
      ?Math.min(dpr,performanceProfile.postProcessing.touchComposerPixelRatio)
      :performanceProfile.postProcessing.composerPixelRatio
    const composerDpr=Math.min(composerRequested,limit)
    return {
      css:[width,height],maxDrawingBuffer:{...drawingBufferLimit},pixelRatioLimit:limit,
      rendererDpr,composerDpr,
      drawing:[Math.floor(width*rendererDpr),Math.floor(height*rendererDpr)],
      composer:[Math.floor(width*composerDpr),Math.floor(height*composerDpr)],
    }
  },
  indoorShadows:()=>({
    enabled:indoorShadowExperimentEnabled,inside:Boolean(currentClassroomZone),zone:currentClassroomZone?.name??null,
    gtaoPreset:indoorGtaoActive?'indoor':'outdoor',
  }),
  setIndoorShadowsEnabled:enabled=>{
    indoorShadowExperimentEnabled=Boolean(enabled)
    updateClassroomShadowPreset(true);renderFrame();return window.__CAMPUS_TEST__.indoorShadows()
  },
  setArtisticOutlinesEnabled:enabled=>{artisticOutlinesEnabled=Boolean(enabled);updateArtisticOutlineStyle();renderFrame();return artisticOutlinesEnabled},
  setGtaoEnabled:enabled=>{gtaoPass.enabled=Boolean(enabled);renderFrame();return gtaoPass.enabled},
  setSmaaEnabled:enabled=>{smaaPass.enabled=Boolean(enabled);renderFrame();return smaaPass.enabled},
  benchmarkPost:(enabled,samples=3)=>{
    gtaoPass.enabled=Boolean(enabled)
    const start=performance.now()
    for(let i=0;i<samples;i++){renderFrame();renderer.getContext().finish()}
    return {enabled:gtaoPass.enabled,samples,msPerFrame:(performance.now()-start)/samples}
  },
  building1StairJoints:()=>b1StairJointChecks.map(item=>({...item})),
  captureFrame:()=>{
    renderFrame();return renderer.domElement.toDataURL('image/png')
  },
  building1Assets:()=>({...b1AssetLoadState,drawObjects:b1AssetRoot.children.length}),
  building1SharedTextures:()=>{
    const textures=new Set(),sets=new Set()
    let materialBindings=0
    b1AssetRoot.traverse(node=>{
      if(!node.isMesh)return
      for(const material of Array.isArray(node.material)?node.material:[node.material]) {
        const set=material?.userData.sharedOpeningTextureSet
        if(!set)continue
        sets.add(set);materialBindings++
        for(const texture of [material.map,material.roughnessMap,material.metalnessMap])if(texture)textures.add(texture)
      }
    })
    return {materialBindings,textureSets:[...sets].sort(),uniqueTextures:textures.size,library:B1_SHARED_TEXTURE_LIBRARY_URL}
  },
  toiletAsset:()=>({...toiletAssetLoadState,drawObjects:toiletAssetRoot.children.length}),
  dormitoryAsset:()=>({...dormitoryAssetLoadState,drawObjects:dormitoryAssetRoot.children.length}),
  banyanAsset:()=>({...banyanAssetLoadState,foliageLighting:banyanFoliageLightingState(),drawObjects:banyanAssetRoot.children.length}),
  banyanFoliageLighting:()=>banyanFoliageLightingState(),
  setBanyanFoliageLighting:candidate=>{
    const applied=applyBanyanFoliageLighting(candidate)
    if(applied)renderFrame()
    return applied?banyanFoliageLightingState():null
  },
  playgroundTrees:()=>({...playgroundTreeAssetLoadState,drawObjects:playgroundTreeAssetRoot.children.length}),
  planterFlowers:()=>({...planterFlowerAssetLoadState}),
  playgroundTreeInstances:()=>{
    const geometries=new Set(),materials=new Set(),matrix=new THREE.Matrix4()
    let instanceMeshes=0,instanceSlots=0,finiteMatrices=0
    playgroundTreeAssetRoot.traverse(node=>{
      if(!node.isInstancedMesh)return
      instanceMeshes++;instanceSlots+=node.count
      geometries.add(node.geometry)
      for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material)
      for(let index=0;index<node.count;index++) {
        node.getMatrixAt(index,matrix)
        if(matrix.elements.every(Number.isFinite)&&Math.abs(matrix.determinant())>1e-8)finiteMatrices++
      }
    })
    return {instanceMeshes,instanceSlots,finiteMatrices,uniqueGeometries:geometries.size,uniqueMaterials:materials.size}
  },
  sandpitAsset:()=>({...sandpitAssetLoadState,drawObjects:sandpitAssetRoot.children.length}),
  activitySandAssets:()=>({...activitySandAssetLoadState,drawObjects:activitySandAssetRoot.children.length}),
  sharedSandTexture:()=>{
    const textures=new Set(),formats=new Set()
    let materialBindings=0
    for(const assetRoot of [sandpitAssetRoot,activitySandAssetRoot])assetRoot.traverse(node=>{
      if(!node.isMesh)return
      for(const material of Array.isArray(node.material)?node.material:[node.material]) {
        if(material?.userData.sharedBaseColorTexture!=='../../textures/sand/sandpit-cement-rim-albedo-v01.png?v=1')continue
        materialBindings++
        if(material.map)textures.add(material.map)
        if(material.map?.userData.sourceFormat)formats.add(material.map.userData.sourceFormat)
      }
    })
    return {materialBindings,uniqueTextures:textures.size,sourceFormats:[...formats],pilot:{...sharedSandTextureLoadState}}
  },
  activityParallelBars:()=>({...facilityStats.activityParallelBars}),
  b1NorthBambooClimb:()=>({...facilityStats.b1NorthBambooClimb}),
  bambooClimbGame:()=>bambooClimbGame?.snapshot()??{status:'loading'},
  enterBambooClimb:(pole=0)=>bambooClimbGame?.enterPole(pole)??null,
  setBambooClimbCursor:(x,y)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    bambooClimbGame?.setCursorFromClient(rect.left+(x+1)*.5*rect.width,rect.top+(1-y)*.5*rect.height)
    return bambooClimbGame?.snapshot()??null
  },
  beginBambooClimbCharge:()=>bambooClimbGame?.beginCharge()??false,
  releaseBambooClimbCharge:ratio=>bambooClimbGame?.releaseCharge(ratio)??null,
  settleBambooClimb:()=>bambooClimbGame?.settle()??null,
  startBambooClimbSlide:()=>bambooClimbGame?.startSlide()??false,
  stepBambooClimbSlide:ratio=>{bambooClimbGame?.stepSlide(ratio);return bambooClimbGame?.snapshot()??null},
  exitBambooClimb:()=>bambooClimbGame?.exit()??null,
  longJumpGame:()=>longJumpGame?.snapshot()??{status:'loading'},
  probeLongJumpInteraction:()=>longJumpGame?.hit(innerWidth/2,innerHeight/2,true)??null,
  enterLongJump:()=>longJumpGame?.enter()??null,
  beginLongJumpCharge:(angleDegrees=0)=>{longJumpGame?.beginCharge(angleDegrees);return longJumpGame?.snapshot()??null},
  releaseLongJumpCharge:ratio=>longJumpGame?.releaseCharge(ratio)??null,
  settleLongJump:()=>longJumpGame?.settle()??null,
  restartLongJump:()=>{longJumpGame?.restart();return longJumpGame?.snapshot()??null},
  exitLongJump:()=>longJumpGame?.exit()??null,
  jacksGame:()=>jacksGame?.snapshot()??{status:'loading'},
  probeJacksInteraction:()=>jacksGame?.hit(innerWidth/2,innerHeight/2,true)??null,
  enterJacks:()=>jacksGame?.enter()??null,
  settleJacks:()=>jacksGame?.settle()??null,
  beginJacksTurn:()=>{jacksGame?.beginTurn();return jacksGame?.snapshot()??null},
  setJacksHand:(x,z)=>{jacksGame?.setHandLocal(x,z);return jacksGame?.snapshot()??null},
  gatherJacks:indices=>jacksGame?.attemptGather(indices)??null,
  catchJacks:()=>{jacksGame?.catchKing();return jacksGame?.snapshot()??null},
  exitJacks:()=>jacksGame?.exit()??null,
  hopscotchGame:()=>hopscotchGame?.snapshot()??{status:'loading'},
  probeHopscotchInteraction:()=>hopscotchGame?.hit(innerWidth/2,innerHeight/2,true)??null,
  enterHopscotch:(layoutId='connected-a')=>hopscotchGame?.enter({layoutId})??null,
  throwHopscotchTile:(cell,lateral=0,longitudinal=0)=>hopscotchGame?.throwTile({cell,lateral,longitudinal})??null,
  hopHopscotch:(cell=null,lateral=0,footMode=null)=>hopscotchGame?.hop({cell,lateral,footMode})??null,
  beginHopscotchThrow:()=>hopscotchGame?.beginThrow()??false,
  releaseHopscotchThrow:(ratio,aim=null)=>hopscotchGame?.releaseThrow(ratio,aim)??null,
  lookHopscotch:(dx,dy=0,touch=false)=>{hopscotchGame?.look(dx,dy,touch);return hopscotchGame?.snapshot()??null},
  advanceHopscotch:seconds=>hopscotchGame?.advance(seconds)??null,
  settleHopscotch:()=>hopscotchGame?.settle()??null,
  nextHopscotchRound:()=>{hopscotchGame?.nextRound();return hopscotchGame?.snapshot()??null},
  exitHopscotch:()=>hopscotchGame?.exit()??null,
  shuttlecockGame:()=>shuttlecockGame?.snapshot()??{status:'loading'},
  focusShuttlecock:(distance=1.7)=>{
    const [x,z]=CAMPUS.facilities.shuttlecock.center,y=CAMPUS.facilities.shuttlecock.groundY
    mode='walk';orbit.enabled=false;if(pointer.isLocked)pointer.unlock();document.body.classList.add('walking')
    camera.position.set(x,y+CAMPUS.player.eyeHeight,z+distance);camera.lookAt(x,y+.14,z);renderFrame()
    return {hit:shuttlecockGame?.hit(innerWidth/2,innerHeight/2,true)??null,player:window.__CAMPUS_TEST__.player()}
  },
  enterShuttlecock:()=>shuttlecockGame?.enter()??null,
  kickShuttlecock:foot=>shuttlecockGame?.kick(foot)??null,
  moveShuttlecockPlayer:value=>shuttlecockGame?.setMove(value)??0,
  setShuttlecockState:state=>shuttlecockGame?.setState(state)??null,
  advanceShuttlecock:seconds=>shuttlecockGame?.advance(seconds)??null,
  playShuttlecockGroundTitle:(phrase,kind='plain',duration=950)=>shuttlecockGame?.playGroundTitle(phrase,kind,duration)??false,
  probeShuttlecockExit:(x,y)=>webglHud.hitShuttlecockExit(x,y),
  exitShuttlecock:()=>shuttlecockGame?.exit()??null,
  rubiksCube:()=>rubiksCubeGame?.snapshot()??{status:'unloaded',id:rubiksCubePlacement.id,classroom:rubiksCubePlacement.classroom,deskId:rubiksCubePlacement.deskId},
  focusRubiksCube:(distance=.48)=>{
    classroomDetailInteractionPin=rubiksCubePlacement.classroom
    applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,rubiksCubePlacement.classroom]),true)
    const game=ensureRubiksCubeGame(),state=game.snapshot();if(!state?.placement)return state
    const [x,y,z]=state.placement.position,rotation=rubiksCubeDeskAnchor.rotationY
    const front=new THREE.Vector3(Math.sin(rotation),0,Math.cos(rotation))
    mode='walk';orbit.enabled=false;if(pointer.isLocked)pointer.unlock();document.body.classList.add('walking')
    camera.position.set(x+front.x*distance,y+.16,z+front.z*distance);camera.lookAt(x,y,z);renderFrame()
    return {
      camera:camera.position.toArray(),
      hit:game.hit(innerWidth/2,innerHeight/2,true,true),
      visibleHit:game.hit(innerWidth/2,innerHeight/2,true,false),
      state:game.snapshot(),
    }
  },
  enterRubiksCube:()=>ensureRubiksCubeGame().enter()??null,
  exitRubiksCube:()=>rubiksCubeGame?.exit()??null,
  handleRubiksPointer:(type,event)=>{rubiksCubeGame?.[type]?.(event);return rubiksCubeGame?.snapshot()??null},
  handleRubiksKey:(code,event={})=>{rubiksCubeGame?.handleKey(code,event);return rubiksCubeGame?.snapshot()??null},
  probeRubiksGesture:(cubieId,normal,dx,dy)=>rubiksCubeGame?.probeGesture(cubieId,normal,dx,dy)??null,
  octopusHandheld:()=>octopusHandheldGame?.snapshot()??{status:'unloaded',id:octopusHandheldConfig.id,placement:{classroom:octopusHandheldConfig.placement.classroom,deskId:octopusHandheldConfig.placement.deskId,cubby:octopusHandheldConfig.placement.cubby}},
  focusOctopusHandheld:(distance=.52)=>{
    classroomDetailInteractionPin=octopusHandheldConfig.placement.classroom
    applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,octopusHandheldConfig.placement.classroom]),true)
    const state=ensureOctopusHandheldGame().snapshot();if(!state?.placement)return null
    const [x,y,z]=state.placement.position,rotation=octopusHandheldDeskAnchor.rotationY
    const front=new THREE.Vector3(Math.sin(rotation),0,Math.cos(rotation))
    mode='walk';orbit.enabled=false;if(pointer.isLocked)pointer.unlock();document.body.classList.add('walking')
    classroomDetailInteractionPin=state.placement.classroom
    applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,state.placement.classroom]),true)
    camera.position.set(x+front.x*distance,y+.18,z+front.z*distance);camera.lookAt(x,y,z);renderFrame()
    const hit=octopusHandheldGame.hit(innerWidth/2,innerHeight/2,true,true)
    const visibleHit=octopusHandheldGame.hit(innerWidth/2,innerHeight/2,true,false)
    return {camera:camera.position.toArray(),hit,visibleHit,state:octopusHandheldGame.snapshot()}
  },
  enterOctopusHandheld:()=>ensureOctopusHandheldGame().enter()??null,
  exitOctopusHandheld:()=>octopusHandheldGame?.exit()??null,
  startOctopusGame:(game='gameA')=>octopusHandheldGame?.startGame(game)??null,
  moveOctopusDiver:(direction='right')=>{octopusHandheldGame?.move(direction);return octopusHandheldGame?.snapshot()??null},
  missOctopusDiver:()=>{octopusHandheldGame?.registerMiss();return octopusHandheldGame?.snapshot()??null},
  scoreOctopus:(points=1)=>{octopusHandheldGame?.scorePoints(points);return octopusHandheldGame?.snapshot()??null},
  setOctopusState:state=>octopusHandheldGame?.setTestState(state)??null,
  advanceOctopusTicks:(count=1)=>octopusHandheldGame?.advanceTicks(count)??null,
  handleOctopusPointer:(type,event)=>{octopusHandheldGame?.handlePointer(type,event);return octopusHandheldGame?.snapshot()??null},
  consumeOctopusPostExitClick:event=>octopusHandheldGame?.consumePostExitClick(event)??false,
  fireHandheld:()=>fireHandheldGame?.snapshot()??{status:'unloaded',id:fireHandheldConfig.id,placement:{classroom:fireHandheldConfig.placement.classroom,deskId:fireHandheldConfig.placement.deskId,cubby:fireHandheldConfig.placement.cubby}},
  focusFireHandheld:(distance=.52)=>{
    classroomDetailInteractionPin=fireHandheldConfig.placement.classroom
    applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,fireHandheldConfig.placement.classroom]),true)
    const state=ensureFireHandheldGame().snapshot();if(!state?.placement)return null
    const [x,y,z]=state.placement.position,rotation=fireHandheldDeskAnchor.rotationY
    const front=new THREE.Vector3(Math.sin(rotation),0,Math.cos(rotation))
    mode='walk';orbit.enabled=false;if(pointer.isLocked)pointer.unlock();document.body.classList.add('walking')
    classroomDetailInteractionPin=state.placement.classroom
    applyClassroomDetailRooms(new Set([...activeClassroomDetailRooms,state.placement.classroom]),true)
    camera.position.set(x+front.x*distance,y+.18,z+front.z*distance);camera.lookAt(x,y,z);renderFrame()
    const hit=fireHandheldGame.hit(innerWidth/2,innerHeight/2,true,true)
    const visibleHit=fireHandheldGame.hit(innerWidth/2,innerHeight/2,true,false)
    return {camera:camera.position.toArray(),hit,visibleHit,state:fireHandheldGame.snapshot()}
  },
  enterFireHandheld:()=>ensureFireHandheldGame().enter()??null,
  exitFireHandheld:()=>fireHandheldGame?.exit()??null,
  startFireGame:(game='gameA')=>{fireHandheldGame?.startGame(game);return fireHandheldGame?.snapshot()??null},
  moveFireStretcher:(direction='right')=>{fireHandheldGame?.move(direction);return fireHandheldGame?.snapshot()??null},
  missFire:()=>{fireHandheldGame?.registerMiss();return fireHandheldGame?.snapshot()??null},
  setFireState:state=>fireHandheldGame?.setTestState(state)??null,
  advanceFireTicks:(count=1)=>fireHandheldGame?.advanceTicks(count)??null,
  handleFirePointer:(type,event)=>{fireHandheldGame?.handlePointer(type,event);return fireHandheldGame?.snapshot()??null},
  consumeFirePostExitClick:event=>fireHandheldGame?.consumePostExitClick(event)??false,
  handheldLod:()=>({
    activeRooms:[...activeClassroomDetailRooms].sort(),
    octopus:{classroom:octopusHandheldConfig.placement.classroom,instanceLoaded:Boolean(octopusHandheldGame),drawEligible:activeClassroomDetailRooms.has(octopusHandheldConfig.placement.classroom)},
    fire:{classroom:fireHandheldConfig.placement.classroom,instanceLoaded:Boolean(fireHandheldGame),drawEligible:activeClassroomDetailRooms.has(fireHandheldConfig.placement.classroom)},
  }),
  moveOutsideHandheldLod:()=>{
    classroomDetailInteractionPin=null;mode='walk';camera.position.fromArray(CAMPUS.player.spawn)
    syncBuildingInteriorStreaming(true);renderFrame()
    return {
      octopus:{instanceLoaded:Boolean(octopusHandheldGame),drawEligible:activeClassroomDetailRooms.has(octopusHandheldConfig.placement.classroom)},
      fire:{instanceLoaded:Boolean(fireHandheldGame),drawEligible:activeClassroomDetailRooms.has(fireHandheldConfig.placement.classroom)},
    }
  },
  activityHighLowBar:()=>({...facilityStats.activityHighLowBar}),
  activityMonkeyBars:()=>({...facilityStats.activityMonkeyBars}),
  pingPongAsset:()=>({
    ...pingPongAssetLoadState,drawObjects:pingPongAssetRoot.children.length,
    paddle:{...pingPongPaddleAssetLoadState},game:pingPongGame?.snapshot()??{status:'loading'},
  }),
  pingPongGame:()=>pingPongGame?.snapshot()??{status:'loading'},
  enterPingPongTable:(index=0)=>pingPongGame?.enterTable(index)??null,
  startPingPongMatch:()=>pingPongGame?.startMatch()??null,
  servePingPong:(side='player')=>pingPongGame?.serve(side)??null,
  beginPingPongAction:(chargeSeconds=0)=>pingPongGame?.beginPlayerAction(chargeSeconds)??false,
  endPingPongAction:()=>pingPongGame?.endPlayerAction()??false,
  advancePingPong:(seconds=1)=>pingPongGame?.advance(seconds)??null,
  setPingPongBall:state=>pingPongGame?.setBallState(state)??null,
  awardPingPongPoint:(winner='player',reason='测试判定')=>pingPongGame?.awardPoint(winner,reason)??null,
  setPingPongScore:(player,ai)=>pingPongGame?.setScore(player,ai)??null,
  exitPingPong:()=>pingPongGame?.exit()??null,
  basketballAsset:()=>({
    ...basketballAssetLoadState,drawObjects:basketballAssetRoot.children.length,
    items:basketballItems.map(item=>({
      id:item.id,index:item.index,radius:item.radius,
      position:item.model.position.toArray().map(value=>+value.toFixed(3)),
      rotationY:+THREE.MathUtils.radToDeg(item.model.rotation.y).toFixed(1),
    })),
  }),
  basketballHoop:()=>({
    ...basketballHoopAssetLoadState,
    drawObjects:basketballHoopAssetRoot.children.length,
    configuredSurfaceY:CAMPUS.facilities.basketballHoop.surfaceY,
    visibleConcreteY:.006,
    groundGap:basketballHoopAssetLoadState.bounds?.min?.[1]==null?null:+(basketballHoopAssetLoadState.bounds.min[1]-.006).toFixed(4),
  }),
  basketballGame:()=>basketballGame?.snapshot()??{status:'loading'},
  focusBasketball:(id='hoop-basketball-02',distance=1.25)=>{
    const item=basketballGame?.items().find(candidate=>candidate.id===id)
    if(!item)return null
    mode='walk';orbit.enabled=false;camera.position.set(item.model.position.x,item.model.position.y+.35,item.model.position.z+distance)
    camera.lookAt(item.model.position);renderFrame();return basketballGame.snapshot()
  },
  pickupBasketball:id=>basketballGame?.pickup(basketballGame.items().find(item=>item.id===id))??null,
  setBasketballCharge:seconds=>basketballGame?.beginCharge(seconds)??false,
  releaseBasketballShot:seconds=>basketballGame?.releaseCharge(seconds)??null,
  basketballScoreValue:distance=>basketballGame?.scoreValue(distance)??null,
  kickBasketball:id=>basketballGame?.kick(basketballGame.items().find(item=>item.id===id))??null,
  resetBasketballs:()=>basketballGame?.resetAll()??null,
  advanceBasketball:seconds=>basketballGame?.advance(seconds)??null,
  setBasketballState:(id,state)=>basketballGame?.setBallState(id,state)??null,
  pingPongInstances:()=>{
    const geometries=new Set(),materials=new Set(),matrix=new THREE.Matrix4()
    let instanceMeshes=0,instanceSlots=0,finitePositiveMatrices=0
    pingPongAssetRoot.traverse(node=>{
      if(!node.isInstancedMesh)return
      instanceMeshes++;instanceSlots+=node.count;geometries.add(node.geometry)
      for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material)
      for(let index=0;index<node.count;index++) {
        node.getMatrixAt(index,matrix)
        if(matrix.elements.every(Number.isFinite)&&matrix.determinant()>1e-8)finitePositiveMatrices++
      }
    })
    return {instanceMeshes,instanceSlots,finitePositiveMatrices,uniqueGeometries:geometries.size,uniqueMaterials:materials.size}
  },
  concreteSlideAsset:()=>({...concreteSlideAssetLoadState,drawObjects:concreteSlideAssetRoot.children.length}),
  slingshotPlayCorner:()=>slingshotPlayCorner?.snapshot()??{status:'idle',gate:'B-graybox'},
  slingshotGame:()=>slingshotGame?.snapshot()??{status:'loading'},
  enterSlingshot:(id='wood',distance=10)=>slingshotGame?.enter(id,distance)??null,
  selectSlingshot:id=>{slingshotGame?.select(id);return slingshotGame?.snapshot()??null},
  setSlingshotDistance:distance=>{slingshotGame?.setStation(distance);return slingshotGame?.snapshot()??null},
  beginSlingshotCharge:()=>{slingshotGame?.beginCharge();return slingshotGame?.snapshot()??null},
  releaseSlingshotCharge:()=>{slingshotGame?.releaseCharge();return slingshotGame?.snapshot()??null},
  resetSlingshotTargets:()=>{slingshotGame?.resetTargets();return slingshotGame?.snapshot()??null},
  testFireSlingshotAt:(id='red-flat-bar')=>{slingshotGame?.testFireAt(id);return slingshotGame?.snapshot()??null},
  exitSlingshot:()=>slingshotGame?.exit()??null,
  groundDetails:()=>({...groundDetailLoadState,drawObjects:groundDetailRoot.children.length}),
  assetRegistry:()=>assetLoader.snapshot(),
  setReviewCamera:(position,target)=>{
    mode='review';pointer.unlock();orbit.enabled=false
    camera.position.fromArray(position);camera.lookAt(...target);renderFrame()
    return {camera:camera.position.toArray(),target}
  },
  focusSandpit:()=>{
    const f=CAMPUS.facilities.sandpit
    mode='review';pointer.unlock();orbit.enabled=false
    camera.position.set(f.center[0]-8,f.placementY+5.2,f.center[1]+8)
    camera.lookAt(f.center[0],f.placementY-.08,f.center[1])
    renderFrame()
    return {camera:camera.position.toArray(),center:f.center}
  },
  focusActivitySand:()=>{
    const f=CAMPUS.facilities.activity
    mode='review';pointer.unlock();orbit.enabled=false
    camera.position.set(f.center[0]-10,5.4,f.center[1]+9)
    camera.lookAt(f.center[0]-3,.52,f.center[1])
    renderFrame()
    return {camera:camera.position.toArray(),north:f.upperSand.center,south:f.lowerSand.center,southwest:f.southwestSand.center}
  },
  focusPingPong:()=>{
    const [x,z]=CAMPUS.facilities.pingPong.centers[0]
    mode='review';pointer.unlock();orbit.enabled=false
    camera.position.set(x+3.4,2.25,z+3.1)
    camera.lookAt(x,.42,z)
    renderFrame()
    return {camera:camera.position.toArray(),center:[x,z]}
  },
  focusBanyan:()=>{
    const b=CAMPUS.facilities.banyan
    enterAerial()
    orbit.target.set(b.center[0],b.y+b.targetHeight*.52,b.center[1])
    camera.position.set(b.center[0]-15,b.y+10,b.center[1]+17)
    orbit.update()
    renderFrame()
    return {camera:camera.position.toArray(),target:orbit.target.toArray()}
  },
  focusBanyanFromGround:()=>{
    const b=CAMPUS.facilities.banyan
    mode='review'
    pointer.unlock()
    orbit.enabled=false
    const target=new THREE.Vector3(b.center[0],b.y+b.targetHeight*.56,b.center[1])
    camera.position.set(b.center[0]-4.2,b.y+1.65,b.center[1]+4.2)
    camera.lookAt(target)
    renderFrame()
    return {camera:camera.position.toArray(),target:target.toArray()}
  },
  focusBanyanBase:()=>{
    const b=CAMPUS.facilities.banyan
    mode='review'
    pointer.unlock()
    orbit.enabled=false
    const target=new THREE.Vector3(b.center[0],b.y+1.15,b.center[1])
    camera.position.set(b.center[0]-5.3,b.y+2.15,b.center[1]+5.3)
    camera.lookAt(target)
    renderFrame()
    return {camera:camera.position.toArray(),target:target.toArray()}
  },
  oldClassroomAsset:()=>({...oldClassroomAssetLoadState,drawObjects:oldClassroomAssetRoot.children.length}),
  building1Interactions:()=>({
    policy:{maxDistance:SCENE_INTERACTION_MAX_DISTANCE,requiresClearLineOfSight:true},
    rigs:[...b1AssetRigs.values()].map(rig=>({type:rig.type,placements:rig.placements.length,pivots:rig.pivots.map(p=>p.name),interactiveMeshes:rig.meshes.filter(m=>m.pivotName).length})),
    placementStates:b1AssetPlacements.map(placement=>({name:placement.name,type:placement.type,position:[...placement.position],rotationY:placement.rotationY,parts:placement.interactions?[...placement.interactions.entries()].map(([pivot,state])=>({pivot,current:+THREE.MathUtils.radToDeg(state.current).toFixed(1),target:+THREE.MathUtils.radToDeg(state.target).toFixed(1)})):[]})),
  }),
  toggleBuilding1Interaction:(placementName,pivotContains)=>{
    const placement=b1AssetPlacements.find(item=>item.name===placementName),rig=placement&&b1AssetRigs.get(placement.type)
    if(!placement||!rig) return null
    const index=rig.placements.indexOf(placement),pivot=rig.pivots.find(item=>item.name.includes(pivotContains))
    return pivot?toggleB1Interaction(placement.type,index,pivot.name):null
  },
  building1DoorKinematics:(placementName)=>{
    const placement=b1AssetPlacements.find(item=>item.name===placementName),rig=placement&&b1AssetRigs.get(placement.type)
    if(!placement||!rig||!placement.type.startsWith('door'))return null
    const index=rig.placements.indexOf(placement),matrix=new THREE.Matrix4(),position=new THREE.Vector3()
    const part=(pattern)=>{const mesh=rig.meshes.find(item=>pattern.test(item.node.name));if(!mesh)return null;mesh.instances.getMatrixAt(index,matrix);position.setFromMatrixPosition(matrix);return {name:mesh.node.name,pivot:mesh.pivotName||null,position:[+position.x.toFixed(4),+position.y.toFixed(4),+position.z.toFixed(4)]}}
    return {placement:placement.name,type:placement.type,hinge:part(/Hinge_2$/),leaf:part(/Leaf_Stile_Latch$/)}
  },
  building2WindowKinematics:(placementName)=>{
    const placement=b1AssetPlacements.find(item=>item.name===placementName&&item.type==='windowB2Alloy'),rig=placement&&b1AssetRigs.get(placement.type)
    if(!placement||!rig)return null
    const index=rig.placements.indexOf(placement),matrix=new THREE.Matrix4(),position=new THREE.Vector3()
    const part=(pattern)=>{const mesh=rig.meshes.find(item=>pattern.test(item.node.name));if(!mesh)return null;mesh.instances.getMatrixAt(index,matrix);position.setFromMatrixPosition(matrix);return {name:mesh.node.name,pivot:mesh.pivotName||null,position:[+position.x.toFixed(4),+position.y.toFixed(4),+position.z.toFixed(4)]}}
    return {
      placement:placement.name,
      rotationY:+placement.rotationY.toFixed(4),
      grille:part(/B2_Grille_Wave_2_12$/),
      mainLeft:part(/B2_Main_L_Sash_InnerStile$/),
      topLeft:part(/B2_Top_L_Sash_TopRail$/),
    }
  },
  advanceBuilding1Interactions:(seconds=.6)=>{for(let elapsed=0;elapsed<seconds;elapsed+=1/60)updateB1AssetAnimations(1/60);renderFrame();return true},
  focusBuilding1Interaction:(placementName,distance=1,side=1,lateral=0)=>{
    const placement=b1AssetPlacements.find(item=>item.name===placementName)
    if(!placement)return null
    const rig=b1AssetRigs.get(placement.type),instanceIndex=rig?.placements.indexOf(placement)
    const interactiveMesh=rig?.meshes.find(item=>item.pivotName)
    if(!interactiveMesh||instanceIndex<0)return null
    const matrix=new THREE.Matrix4();interactiveMesh.instances.getMatrixAt(instanceIndex,matrix)
    interactiveMesh.node.geometry.computeBoundingBox()
    const targetVector=interactiveMesh.node.geometry.boundingBox.clone().applyMatrix4(matrix).getCenter(new THREE.Vector3())
    const normal=[Math.sin(placement.rotationY),Math.cos(placement.rotationY)]
    const tangent=[normal[1],-normal[0]]
    const target=targetVector.toArray()
    mode='review';pointer.unlock();orbit.enabled=false
    camera.position.set(target[0]+normal[0]*distance*side+tangent[0]*lateral,target[1],target[2]+normal[1]*distance*side+tangent[1]*lateral)
    camera.lookAt(...target);renderFrame()
    const hit=hitB1Asset(innerWidth/2,innerHeight/2,true)
    return {camera:camera.position.toArray(),target,hit:hit?{type:hit.interaction.type,pivot:hit.interaction.pivotName,instanceId:hit.instanceId,distance:+hit.distance.toFixed(3)}:null}
  },
  probeBuilding1Interaction:(clientX,clientY)=>{const hit=hitB1Asset(clientX,clientY);if(!hit)return null;const rig=b1AssetRigs.get(hit.interaction.type);return {placement:rig?.placements[hit.instanceId]?.name,pivot:hit.interaction.pivotName,distance:+hit.distance.toFixed(3)}},
  building1OpeningHeights:()=>{
    const b=CAMPUS.buildings.building1,w=b.openings.window
    return Array.from({length:b.floors},(_,floor)=>{
      const finishedFloor=b.raised+floor*b.floorHeight
      return {
        floor:floor+1,
        slabBottom:+(finishedFloor-b.slabThickness).toFixed(2),
        slabTop:+finishedFloor.toFixed(2),
        doorBottom:+finishedFloor.toFixed(2),
        windowBottom:+(finishedFloor+w.sill).toFixed(2),
        openingTop:+(finishedFloor+w.sill+w.height).toFixed(2),
      }
    })
  },
  building2Dimensions:()=>{
    const b=CAMPUS.buildings.building2,t=b.wall
    return {
      outside:[4*b.classroom[0]+b.stairBay+6*t,2*t+b.classroom[1]+b.corridor],
      classroomClear:[b.classroom[0],b.classroom[1]],stairClear:b.stairBay,
      floorHeight:b.floorHeight,wallTop:b.raised+b.floors*b.floorHeight,
    }
  },
  player:()=>({mode,x:+camera.position.x.toFixed(2),y:+camera.position.y.toFixed(2),z:+camera.position.z.toFixed(2),ground:+(camera.position.y-CAMPUS.player.eyeHeight).toFixed(2)}),
  teleport:(x,z,lookX=x,lookZ=z-1,reference=0,lookY=null,cameraY=null)=>{mode='walk';orbit.enabled=false;camera.position.set(x,cameraY??groundHeightAt(x,z,reference)+CAMPUS.player.eyeHeight,z);camera.lookAt(lookX,lookY??camera.position.y,lookZ);return window.__CAMPUS_TEST__.player()},
  teleportLevel:(x,z,ground,lookX=x,lookZ=z-1)=>{mode='walk';orbit.enabled=false;camera.position.set(x,ground+CAMPUS.player.eyeHeight,z);camera.lookAt(lookX,camera.position.y,lookZ);return window.__CAMPUS_TEST__.player()},
  walkStep:(dx,dz)=>({moved:movePlayer(dx,dz),player:window.__CAMPUS_TEST__.player()}),
  render:()=>renderFrame(),
  view:(position,target)=>{mode='aerial';perimeterEnvironment.syncMode(mode);orbit.enabled=false;camera.position.fromArray(position);orbit.target.fromArray(target);orbit.update();renderFrame();return window.__CAMPUS_TEST__.player()},
  probe:(x,z,reference=0)=>{const ground=groundHeightAt(x,z,reference);return {ground,blocked:blocked(x,z,ground+CAMPUS.player.eyeHeight)}},
  terrainSamples:()=>{
    const highland=CAMPUS.terrain.eastHighland
    const samples={
      entranceDirt:[-2.5,-8],portalConcrete:[-2.5,-18],mainConcrete:[-7,-34],
      toiletLow:[5.34,-58.67],sandpitLow:CAMPUS.facilities.sandpit.center,oldClassroomTop:CAMPUS.buildings.oldClassroom.center,
      dormitoryTop:CAMPUS.buildings.dormitory.center,slideTop:CAMPUS.facilities.slideReserve.center,
      banyanLow:CAMPUS.facilities.banyan.center,
      roadByOldClassroom:CAMPUS.terrain.eastHighland.concreteRoad.points.at(-1),
    }
    return Object.fromEntries(Object.entries(samples).map(([name,[x,z]])=>[name,{x,z,height:+terrainHeightAt(x,z).toFixed(3),surface:groundSurfaceAt(x,z)}]))
  },
  groundSurface:(x,z)=>groundSurfaceAt(x,z),
  groundMaterials:()=>Object.fromEntries(Object.entries(groundMat).map(([name,material])=>[name,{family:material.userData.materialFamily,tileSize:material.userData.meterTileSize}])),
  collisionDetails:(x,z,y)=>colliders.filter(c=>{
    const feetY=y-CAMPUS.player.eyeHeight,r=CAMPUS.player.radius
    if(c.slopeX){
      if(x<c.minX||x>c.maxX||z+r<c.minZ||z-r>c.maxZ)return false
      const t=THREE.MathUtils.clamp((x-c.xStart)/(c.xEnd-c.xStart),0,1),surfaceY=THREE.MathUtils.lerp(c.yStart,c.yEnd,t)
      return feetY<surfaceY-.08&&y>surfaceY-c.thickness+.02
    }
    if(y<c.minY-.05||feetY>=c.maxY-.02)return false
    if(c.walkable&&c.maxY-feetY<=CAMPUS.player.maxStep+.001)return false
    return c.oriented?distanceToSegment(x,z,c.ax,c.az,c.bx,c.bz)<r+c.thickness/2:x+r>c.minX&&x-r<c.maxX&&z+r>c.minZ&&z-r<c.maxZ
  }).map(c=>({...c})),
  checkpoints:{gate:[-2.5,-3],courtyard:[-2.5,-11],passage:[-2.5,-20.7],field:[-7,-34],toilet:[4.51,-53],activity:[16.51,-52.67],dorm:[22,-30],slide:[22,-13]},
}

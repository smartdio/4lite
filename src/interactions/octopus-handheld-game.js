import * as THREE from 'three'
import segmentManifest from './data/octopus-lcd-segments-v03.json'
import semanticLayout from './data/octopus-lcd-semantic-layout-v05.json'
import {getUserDataStore} from '../state/user-data-store.js'

const DEVICE={width:.114,height:.064,depth:.010,imageAspect:1659/948}
const LCD_RECT=[484/1659,262/948,668/1659,425/948]
const BUTTON_LAYOUT={
  left:{center:[.114,.781],size:[.105,.183],shape:'circle'},right:{center:[.886,.781],size:[.105,.183],shape:'circle'},
  gameA:{center:[.886,.156],size:[.094,.072],shape:'rect'},gameB:{center:[.886,.328],size:[.094,.072],shape:'rect'},time:{center:[.886,.500],size:[.094,.072],shape:'rect'},
}
const DIVERS=['segment.039','segment.055','segment.066','segment.069','segment.070']
const CARGO=['segment.043','segment.067','segment.074','segment.073','segment.071']
const LIVES=['segment.001','segment.002','segment.003']
const TENTACLES=[
  {base:['segment.041'],pathA:['segment.042','segment.040'],pathB:['segment.044','segment.047','segment.052']},
  {base:['segment.045'],pathA:['segment.048','segment.053','segment.061','segment.064']},
  {base:['segment.051'],pathA:['segment.057','segment.062','segment.065']},
  {base:['segment.059'],pathA:['segment.063','segment.068']},
]
const TENTACLE_MAX=[3,4,3,2]
// The approved 75-piece manual atlas did not include the two mode labels. They
// are extracted from the confirmed face image and packed into the free part of
// atlas v04; inverse-scaled screen rects keep them aligned with the fixed LCD
// status panel while the rest of the LCD remains at the approved 94% scale.
const MODE_SEGMENTS={
  'mode.gameA':{atlasRect:[2,260,82,24],screenRect:[12,345,79,24]},
  'mode.gameB':{atlasRect:[90,260,82,24],screenRect:[12,372,79,24]},
}
const LCD_LAYOUT_VERSION='manual-color-v06-mode-indicators'
// The boat-side departure slot is protected. The leftmost arm's upper branch is
// still animated, but contact checks begin after the diver leaves the boat.
const HAZARDS=[null,{tentacle:0,length:3,route:'pathB'},{tentacle:1,length:4},{tentacle:2,length:3},{tentacle:3,length:2}]
const STORAGE_NAMESPACE='handheldOctopus'
const clampScore=value=>THREE.MathUtils.clamp(Math.round(Number(value)||0),0,999)
const validateStorage=value=>({highScores:{gameA:clampScore(value?.highScores?.gameA),gameB:clampScore(value?.highScores?.gameB)}})
const round=(value,digits=4)=>+value.toFixed(digits)
const atlasId=semanticId=>semanticLayout.segments[semanticId]?.atlasSegmentId

function makeCanvasTexture(canvas) {
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture
}

function makeExitControl() {
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=128
  const context=canvas.getContext('2d');context.strokeStyle='rgba(210,198,171,.55)';context.fillStyle='rgba(18,17,15,.58)';context.lineWidth=5
  context.beginPath();context.roundRect(5,5,374,118,22);context.fill();context.stroke();context.fillStyle='rgba(218,207,181,.76)';context.font='500 38px sans-serif'
  context.textAlign='center';context.textBaseline='middle';context.fillText('退出',192,64)
  const material=new THREE.MeshBasicMaterial({map:makeCanvasTexture(canvas),transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.name='octopus-handheld-exit';mesh.renderOrder=30;return mesh
}

function makeHelpControl(inputMode) {
  const touch=inputMode==='touch',canvas=document.createElement('canvas');canvas.width=1000;canvas.height=touch?174:126
  const context=canvas.getContext('2d');context.strokeStyle='rgba(210,198,171,.32)';context.fillStyle='rgba(18,17,15,.52)';context.lineWidth=3
  context.beginPath();context.roundRect(3,3,994,canvas.height-6,15);context.fill();context.stroke();context.textBaseline='middle';context.textAlign='left'
  const row=(label,body,y,bodySize=25)=>{context.font=`600 ${touch?26:22}px sans-serif`;context.fillStyle='rgba(202,184,146,.72)';context.fillText(label,24,y);context.font=`400 ${bodySize}px sans-serif`;context.fillStyle='rgba(210,204,187,.66)';context.fillText(body,112,y)}
  if(touch){
    row('玩法','向右取宝 · 向左返船 · 躲避触手 · 三次失误结束',34,31)
    row('操作','点按主机左右键移动、取宝和返船',87,31)
    row('模式','点按 GAME A / GAME B / TIME · 右上角退出',140,29)
  }else{
    row('玩法','向右取宝 · 向左返船 · 躲避触手 · 三次失误结束',37)
    row('键盘','←/A 左移 · →/D 右移 · 1 游戏A · 2 游戏B · T 时钟 · X 退出 · Esc 暂停',89,22)
  }
  const material=new THREE.MeshBasicMaterial({map:makeCanvasTexture(canvas),transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.name='octopus-handheld-help';mesh.renderOrder=30;mesh.userData.aspect=canvas.height/canvas.width;return mesh
}

function makeSegmentGeometry(width,height,z,segmentScale=1,segmentOffsetX=0,segmentOffsetY=0) {
  const positions=[],uvs=[],enabled=[],indices=[],segmentOffsets=new Map()
  const [screenWidth,screenHeight]=segmentManifest.screenSize,[atlasWidth,atlasHeight]=segmentManifest.atlasSize,[lcdX,lcdY,lcdWidth,lcdHeight]=LCD_RECT
  let quad=0
  for(const [segmentId,segment] of [...Object.entries(segmentManifest.segments),...Object.entries(MODE_SEGMENTS)]) {
    const [sx,sy,sw,sh]=segment.screenRect,[ax,ay,aw,ah]=segment.atlasRect
    const offsetX=segmentId.startsWith('mode.')?0:segmentOffsetX
    const centerX=-width/2+(lcdX+lcdWidth/2)*width,centerY=height/2-(lcdY+lcdHeight/2)*height
    const rawX0=-width/2+(lcdX+sx/screenWidth*lcdWidth)*width,rawX1=-width/2+(lcdX+(sx+sw)/screenWidth*lcdWidth)*width
    const rawY1=height/2-(lcdY+sy/screenHeight*lcdHeight)*height,rawY0=height/2-(lcdY+(sy+sh)/screenHeight*lcdHeight)*height
    const x0=centerX+(rawX0-centerX)*segmentScale+offsetX*width,x1=centerX+(rawX1-centerX)*segmentScale+offsetX*width
    const y0=centerY+(rawY0-centerY)*segmentScale+segmentOffsetY*height,y1=centerY+(rawY1-centerY)*segmentScale+segmentOffsetY*height
    const u0=ax/atlasWidth,u1=(ax+aw)/atlasWidth,v0=1-(ay+ah)/atlasHeight,v1=1-ay/atlasHeight
    positions.push(x0,y0,z,x1,y0,z,x1,y1,z,x0,y1,z);uvs.push(u0,v0,u1,v0,u1,v1,u0,v1);enabled.push(0,0,0,0)
    indices.push(quad*4,quad*4+1,quad*4+2,quad*4,quad*4+2,quad*4+3);segmentOffsets.set(segmentId,quad*4);quad++
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('enabled',new THREE.Float32BufferAttribute(enabled,1));geometry.setIndex(indices);geometry.computeBoundingSphere();geometry.userData.segmentOffsets=segmentOffsets;return geometry
}

function makeSegmentMaterial(atlasTexture) {
  return new THREE.ShaderMaterial({name:'octopus-lcd-segment-atlas-material',transparent:true,depthWrite:false,depthTest:false,toneMapped:false,
    uniforms:{atlas:{value:atlasTexture},ink:{value:new THREE.Color(0x26362f)},opacity:{value:.88}},
    vertexShader:'attribute float enabled; varying vec2 vUv; varying float vEnabled; void main(){vUv=uv;vEnabled=enabled;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform sampler2D atlas; uniform vec3 ink; uniform float opacity; varying vec2 vUv; varying float vEnabled; void main(){float a=texture2D(atlas,vUv).a*vEnabled*opacity;if(a<0.001)discard;gl_FragColor=vec4(ink,a);}',
  })
}

function setMeshSegments(mesh,visible) {
  const attribute=mesh.geometry.getAttribute('enabled'),values=attribute.array;let changed=false
  for(const [segmentId,offset] of mesh.geometry.userData.segmentOffsets) {const value=visible.has(segmentId)?1:0;if(values[offset]===value)continue;values[offset]=values[offset+1]=values[offset+2]=values[offset+3]=value;changed=true}
  if(changed)attribute.needsUpdate=true;return changed
}

function createPhotorealVisual(config,onAssetStatus) {
  const loader=new THREE.TextureLoader(),status={deviceBase:'loading',lcdAtlas:'loading'},notify=()=>onAssetStatus({...status})
  const configureBase=texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4}
  const configureAtlas=texture=>{texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter}
  const baseTexture=loader.load(config.assets.deviceBaseUrl,texture=>{configureBase(texture);status.deviceBase='ready';notify()},undefined,()=>{status.deviceBase='error';notify()});configureBase(baseTexture)
  const atlasTexture=loader.load(config.assets.lcdAtlasUrl,texture=>{configureAtlas(texture);status.lcdAtlas='ready';notify()},undefined,()=>{status.lcdAtlas='error';notify()});configureAtlas(atlasTexture)
  const imageHeight=DEVICE.height,imageWidth=imageHeight*DEVICE.imageAspect,buttonLayout=config.buttonsNormalized??BUTTON_LAYOUT
  const baseMaterial=new THREE.MeshBasicMaterial({name:'octopus-oc22-photoreal-face',map:baseTexture,toneMapped:false})
  const createFace=(name,z)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(imageWidth,imageHeight),baseMaterial);mesh.name=name;mesh.position.z=z;return mesh}
  const createSegments=(name,z)=>{const mesh=new THREE.Mesh(makeSegmentGeometry(imageWidth,imageHeight,z,config.lcdSegmentScale??1,config.lcdSegmentOffset?.[0]??0,config.lcdSegmentOffset?.[1]??0),makeSegmentMaterial(atlasTexture));mesh.name=name;mesh.renderOrder=10;return mesh}
  const worldRoot=new THREE.Group();worldRoot.name='octopus-oc22-world-photoreal-shell'
  const shell=new THREE.Mesh(new THREE.BoxGeometry(DEVICE.width,DEVICE.height,DEVICE.depth),new THREE.MeshStandardMaterial({color:0x652328,roughness:.72,metalness:0}));shell.name='octopus-oc22-thin-shell';shell.castShadow=shell.receiveShadow=true;worldRoot.add(shell)
  const worldFace=createFace('octopus-oc22-world-photoreal-face',DEVICE.depth/2+.00008);worldFace.castShadow=true;worldRoot.add(worldFace)
  const worldSegments=createSegments('octopus-oc22-world-static-time-segments',DEVICE.depth/2+.00016);worldRoot.add(worldSegments)
  const overlayRoot=new THREE.Group();overlayRoot.name='octopus-oc22-fullscreen-photoreal-layers';overlayRoot.add(createFace('octopus-oc22-fullscreen-photoreal-face',0))
  const overlaySegments=createSegments('octopus-oc22-fullscreen-lcd-segments',.0001);overlayRoot.add(overlaySegments)
  const buttonOverlays=new Map()
  for(const [key,layout] of Object.entries(buttonLayout)) {
    const w=layout.size[0]*imageWidth,h=layout.size[1]*imageHeight,geometry=layout.shape==='circle'?new THREE.CircleGeometry(Math.min(w,h)/2,48):new THREE.PlaneGeometry(w,h)
    const material=new THREE.MeshBasicMaterial({color:key==='left'||key==='right'?0x4b0710:0x343838,transparent:true,opacity:.25,depthWrite:false,depthTest:false,toneMapped:false})
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`octopus-oc22-${key}-pressed-overlay`;mesh.position.set((layout.center[0]-.5)*imageWidth,(.5-layout.center[1])*imageHeight,.0002);mesh.visible=false;mesh.renderOrder=20;overlayRoot.add(mesh);buttonOverlays.set(key,mesh)
  }
  notify();return{worldRoot,overlayRoot,worldSegments,overlaySegments,buttonOverlays,buttonLayout,imageWidth,imageHeight}
}

export function createOctopusHandheldGame({renderer,camera,scene,worldParent,deskAnchor,config,isTouchMode=()=>false,isActiveMode=()=>false,isOccluder=()=>true,onEnter=()=>true,onExit=()=>{},onEvent=()=>{},playTone=()=>{},now=()=>Date.now(),random=Math.random}) {
  let assetStatus={deviceBase:'loading',lcdAtlas:'loading'}
  const visual=createPhotorealVisual(config,status=>{assetStatus=status}),device=visual.worldRoot,placement=config.placement,localX=placement.cubby==='right'?.265:-.265
  const deskFloorY=deskAnchor.position[1]-.602,cos=Math.cos(deskAnchor.rotationY),sin=Math.sin(deskAnchor.rotationY),localZ=placement.localZ??-.08
  const worldPosition=new THREE.Vector3(deskAnchor.position[0]+localX*cos+localZ*sin,deskFloorY+.418+DEVICE.height/2+.003,deskAnchor.position[2]-localX*sin+localZ*cos)
  device.position.copy(worldPosition);device.rotation.order='YXZ';device.rotation.y=deskAnchor.rotationY;device.rotation.x=THREE.MathUtils.degToRad(placement.tiltDegrees??-8);worldParent.add(device)
  const proxy=new THREE.Mesh(new THREE.BoxGeometry(DEVICE.width*1.55,DEVICE.height*1.55,.06),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}))
  proxy.name='octopus-oc22-interaction-proxy';proxy.position.copy(device.position);proxy.quaternion.copy(device.quaternion);proxy.layers.set(config.proxyLayer??8);worldParent.add(proxy)
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();raycaster.layers.set(config.proxyLayer??8)
  const overlayScene=new THREE.Scene();overlayScene.name='octopus-handheld-fullscreen-scene';overlayScene.background=new THREE.Color(0x000000)
  const overlayCamera=new THREE.OrthographicCamera(-.07,.07,.04,-.04,.001,1);overlayCamera.position.z=.3;overlayScene.add(visual.overlayRoot)
  const exitControl=makeExitControl(),desktopHelpControl=makeHelpControl('desktop'),touchHelpControl=makeHelpControl('touch');overlayScene.add(exitControl,desktopHelpControl,touchHelpControl);let overlayButtonBounds={},exitBounds=null
  const userDataStore=getUserDataStore(),storage=userDataStore.registerNamespace(STORAGE_NAMESPACE,{version:1,defaultValue:{highScores:{gameA:0,gameB:0}},validate:validateStorage})
  let saved=storage.get(),active=false,displayMode='time',phase='clock',score=0,misses=0,cargo=0,diverPosition=0
  let tentacles=[0,1,1,0],tentacleRoutes=['pathB','pathA','pathA','pathA'],tentacleDirections=[1,1,-1,1],tentacleFloors=[0,0,0,0]
  let nextTickAt=0,caughtStartedAt=0,caughtUntil=0,caughtPose='struggle',caughtFrame=0,pickupUntil=0,pickupFrame=0,boatCargoUntil=0,ticks=0,demoDirection=1,segmentBufferUpdates=0,lastWorldMinute=-1,lastHitDiagnostics=null,visibleSegmentIds=[]
  const pressed=new Set(),pointerOwners=new Map(),buttonPointerOwners=new Map(),keyboardPressed=new Set()
  const speedCycle=()=>score%(config.game.speedCyclePoints??100)
  const speedStage=()=>Math.min(4,Math.floor(speedCycle()/(config.game.speedStagePoints??20)))
  const tickMs=()=>displayMode==='time'?820:(config.game.speedTables?.[displayMode]?.[speedStage()]??(displayMode==='gameB'?config.game.gameBTickMs:config.game.gameATickMs))
  const highScoreKey=()=>displayMode==='gameB'?'gameB':'gameA'
  const persistHighScore=()=>{if(!['gameA','gameB'].includes(displayMode))return;const key=highScoreKey();if(score<=saved.highScores[key])return;saved=validateStorage({...saved,highScores:{...saved.highScores,[key]:score}});storage.set(saved)}
  const addDigits=(set,digits,slots)=>{digits.forEach((digit,index)=>{for(const electrode of semanticLayout.digitGlyphs[digit]||[]){const id=atlasId(`digit.${slots[index]}.${electrode}`);if(id)set.add(id)}})}
  const addTentacles=set=>{tentacles.forEach((length,index)=>{const data=TENTACLES[index];data.base.forEach(id=>set.add(id));const route=index===0?tentacleRoutes[0]:'pathA';(data[route]||[]).slice(0,length).forEach(id=>set.add(id))})}
  const resolveVisibleSegments=(state={displayMode,phase,score,misses,cargo,diverPosition})=>{
    const set=new Set(['segment.038']);LIVES.slice(0,Math.max(0,3-state.misses)).forEach(id=>set.add(id));addTentacles(set)
    if(state.displayMode==='time'){const date=new Date(now()),digits=[...String(date.getHours()).padStart(2,'0'),...String(date.getMinutes()).padStart(2,'0')];addDigits(set,digits,[0,1,2,3]);set.add('segment.019');set.add(DIVERS[state.diverPosition]||DIVERS[0])}
    else{set.add(state.displayMode==='gameB'?'mode.gameB':'mode.gameA');addDigits(set,[...String(state.score).padStart(3,'0')],[1,2,3]);if(state.phase==='caught'||state.phase==='gameOver'){if(caughtPose==='upper')set.add('segment.004');else{['segment.046','segment.049','segment.054'].forEach(id=>set.add(id));(caughtFrame?['segment.056','segment.060']:['segment.050','segment.058']).forEach(id=>set.add(id))}}else{set.add(DIVERS[state.diverPosition]||DIVERS[0]);if(state.cargo>0)set.add(CARGO[state.diverPosition]);if(state.diverPosition===4&&pickupUntil>performance.now())set.add(pickupFrame?'segment.075':'segment.072');if(boatCargoUntil>performance.now())set.add('segment.018')}}return set
  }
  const applySegments=()=>{const visible=resolveVisibleSegments();visibleSegmentIds=[...visible].filter(Boolean).sort();if(setMeshSegments(visual.overlaySegments,visible))segmentBufferUpdates++}
  const applyWorldTime=()=>setMeshSegments(visual.worldSegments,resolveVisibleSegments({displayMode:'time',phase:'clock',score:0,misses:0,cargo:0,diverPosition:0}))
  const scorePoints=points=>{const previous=score;score=(score+points)%1000;let restored=false;for(const bonus of config.game.clearMissesAt??[200,500])if(previous<bonus&&score>=bonus){restored=misses>0;misses=0}persistHighScore();applySegments();if(['gameA','gameB'].includes(displayMode))onEvent({type:'octopus-handheld-score',game:displayMode,score});if(restored)playTone('bonus');return snapshot()}
  const resetArms=()=>{tentacles=[0,1,1,0];tentacleRoutes=['pathB','pathA','pathA','pathA'];tentacleDirections=[1,1,-1,1];tentacleFloors=[0,0,0,0]}
  const startGame=game=>{displayMode=game==='gameB'?'gameB':'gameA';phase='playing';score=0;misses=0;cargo=0;diverPosition=0;resetArms();ticks=0;caughtUntil=pickupUntil=boatCargoUntil=0;nextTickAt=performance.now()+tickMs();applySegments();playTone('start');onEvent({type:'octopus-handheld-start',game:displayMode});return snapshot()}
  const showTime=()=>{displayMode='time';phase='clock';score=0;misses=0;cargo=0;diverPosition=0;resetArms();demoDirection=1;caughtUntil=pickupUntil=boatCargoUntil=0;nextTickAt=performance.now()+tickMs();applySegments();applyWorldTime();return snapshot()}
  const registerMiss=(at=performance.now())=>{if(phase!=='playing')return false;misses++;phase=misses>=config.game.gameOverMisses?'gameOver':'caught';caughtStartedAt=at;caughtPose='upper';caughtFrame=0;pickupUntil=boatCargoUntil=0;caughtUntil=at+(phase==='gameOver'?(config.game.gameOverDurationMs??1350):(config.game.caughtDurationMs??900));persistHighScore();playTone(phase==='gameOver'?'gameOver':'miss');applySegments();return true}
  const collisionActive=()=>{const hazard=HAZARDS[diverPosition];return !!hazard&&(!hazard.route||tentacleRoutes[hazard.tentacle]===hazard.route)&&tentacles[hazard.tentacle]>=hazard.length}
  const move=direction=>{
    if(!['gameA','gameB'].includes(displayMode)||phase!=='playing')return false
    let actionTone='step'
    if(direction==='right'){
      if(diverPosition<DIVERS.length-1)diverPosition++
      else{cargo++;pickupFrame^=1;pickupUntil=performance.now()+(config.game.pickupFrameMs??130);scorePoints(config.game.scorePerTreasure??1);actionTone='treasure'}
    }else if(direction==='left'){
      if(diverPosition===DIVERS.length-1&&cargo===0)return false
      if(diverPosition>0)diverPosition--
      if(diverPosition===0&&cargo>0){cargo=0;boatCargoUntil=performance.now()+(config.game.boatCargoFrameMs??180);scorePoints(config.game.returnBonus??3);actionTone='boat'}
    }
    if(collisionActive())registerMiss();else{playTone(actionTone);applySegments()}
    return true
  }
  const advanceTentacles=()=>{
    const index=displayMode==='time'?ticks%tentacles.length:Math.floor(random()*tentacles.length)%tentacles.length
    const maximum=index===0?TENTACLES[0][tentacleRoutes[0]].length:TENTACLE_MAX[index],floor=Math.min(tentacleFloors[index],maximum)
    tentacles[index]=THREE.MathUtils.clamp(tentacles[index]+tentacleDirections[index],floor,maximum)
    if(tentacles[index]>=maximum){tentacleDirections[index]=-1;tentacleFloors[index]=displayMode==='gameB'&&random()<.32?1:0}
    else if(tentacles[index]<=floor){tentacleDirections[index]=1;tentacleFloors[index]=0;if(index===0)tentacleRoutes[0]=random()<.5?'pathA':'pathB'}
    let missed=false
    if(displayMode==='time'){
      diverPosition+=demoDirection
      if(diverPosition>=DIVERS.length-1){diverPosition=DIVERS.length-1;demoDirection=-1}
      if(diverPosition<=0){diverPosition=0;demoDirection=1}
      if(collisionActive()){diverPosition=0;demoDirection=1}
    }else if(phase==='playing'&&collisionActive())missed=registerMiss()
    if(displayMode!=='time'&&!missed)playTone('arm')
    ticks++;applySegments()
  }
  const refreshPressed=button=>{const value=(buttonPointerOwners.get(button)?.size||0)>0||keyboardPressed.has(button);value?pressed.add(button):pressed.delete(button);const mesh=visual.buttonOverlays.get(button);if(mesh){mesh.visible=value;mesh.scale.setScalar(value?.96:1)}}
  const activateButton=button=>{if(button==='left')return move('left');if(button==='right')return move('right');if(button==='gameA')return startGame('gameA');if(button==='gameB')return startGame('gameB');if(button==='time')return showTime();if(button==='exit'){exit();return true}return false}
  const buttonAt=(clientX,clientY)=>{if(exitBounds&&clientX>=exitBounds.left&&clientX<=exitBounds.right&&clientY>=exitBounds.top&&clientY<=exitBounds.bottom)return'exit';for(const[key,bounds]of Object.entries(overlayButtonBounds))if(clientX>=bounds.left&&clientX<=bounds.right&&clientY>=bounds.top&&clientY<=bounds.bottom)return key;return null}
  const releasePointer=pointerId=>{const button=pointerOwners.get(pointerId);if(!button)return false;pointerOwners.delete(pointerId);if(button!=='exit'){buttonPointerOwners.get(button)?.delete(pointerId);refreshPressed(button)}return true}
  let postExitClick=null
  const handlePointer=(type,event)=>{if(!isActiveMode())return false;if(type==='pointerdown'){const button=buttonAt(event.clientX,event.clientY);if(!button)return false;pointerOwners.set(event.pointerId,button);if(button!=='exit'){if(!buttonPointerOwners.has(button))buttonPointerOwners.set(button,new Set());buttonPointerOwners.get(button).add(event.pointerId);refreshPressed(button);activateButton(button)}return true}if(type==='pointermove'){const button=pointerOwners.get(event.pointerId);if(!button)return false;if(buttonAt(event.clientX,event.clientY)!==button)releasePointer(event.pointerId);return true}const button=pointerOwners.get(event.pointerId);if(!button)return false;const shouldExit=type==='pointerup'&&button==='exit'&&buttonAt(event.clientX,event.clientY)==='exit';releasePointer(event.pointerId);if(shouldExit){postExitClick={x:event.clientX,y:event.clientY,expiresAt:performance.now()+750};activateButton('exit')}return true}
  const consumePostExitClick=event=>{const pending=postExitClick;postExitClick=null;if(!pending||performance.now()>pending.expiresAt||!event)return false;return Math.hypot(event.clientX-pending.x,event.clientY-pending.y)<=24}
  const handleKey=(code,down=true,repeat=false)=>{const mapping={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Digit1:'gameA',Digit2:'gameB',KeyT:'time'},button=mapping[code];if(!button)return false;down?keyboardPressed.add(button):keyboardPressed.delete(button);refreshPressed(button);if(down&&!repeat)activateButton(button);return true}
  const setRay=(clientX,clientY,useCenter=false)=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1);raycaster.near=0;raycaster.far=config.interactionDistance;raycaster.setFromCamera(pointer,camera)}
  const hit=(clientX,clientY,useCenter=false,skipOcclusion=false)=>{if(active||proxy.parent?.visible===false){lastHitDiagnostics={result:'inactive-or-hidden'};return null}setRay(clientX,clientY,useCenter);const candidate=raycaster.intersectObject(proxy,false)[0];if(!candidate){lastHitDiagnostics={result:'miss'};return null}if(!skipOcclusion){const belongsToDevice=object=>{for(let node=object;node;node=node.parent)if(node===device||node===proxy)return true;return false},isEffectivelyVisible=object=>{for(let node=object;node;node=node.parent)if(node.visible===false)return false;return true},blocker=raycaster.intersectObjects(scene.children,true).find(result=>isEffectivelyVisible(result.object)&&isOccluder(result)&&!belongsToDevice(result.object));if(blocker&&blocker.distance+.018<candidate.distance){lastHitDiagnostics={result:'occluded',candidateDistance:round(candidate.distance),blockerDistance:round(blocker.distance),blockerName:blocker.object.name||blocker.object.parent?.name||'unnamed'};return null}}lastHitDiagnostics={result:'hit',candidateDistance:round(candidate.distance),skipOcclusion};return{id:config.id,classroom:config.placement.classroom,deskId:deskAnchor.name,distance:candidate.distance,point:candidate.point.toArray()}}
  const enter=()=>{if(active||onEnter({id:config.id,deskId:deskAnchor.name,classroom:config.placement.classroom})===false)return null;postExitClick=null;active=true;device.visible=false;visual.overlayRoot.visible=true;showTime();resize();onEvent({type:'octopus-handheld-enter',id:config.id});return snapshot()}
  const interact=(clientX,clientY,useCenter=false)=>hit(clientX,clientY,useCenter)?(enter(),{type:'octopus-handheld-enter'}):null
  const clearPressed=()=>{pointerOwners.clear();buttonPointerOwners.clear();keyboardPressed.clear();for(const button of[...pressed])refreshPressed(button)}
  const pauseInput=()=>{clearPressed();return true}
  const resumeAfterPause=durationMs=>{
    const delta=Math.max(0,durationMs||0)
    nextTickAt+=delta
    if(caughtStartedAt)caughtStartedAt+=delta
    if(caughtUntil)caughtUntil+=delta
    if(pickupUntil)pickupUntil+=delta
    if(boatCargoUntil)boatCargoUntil+=delta
    return true
  }
  const exit=()=>{if(!active)return false;persistHighScore();active=false;clearPressed();device.visible=true;visual.overlayRoot.visible=false;showTime();onExit();return true}
  const update=at=>{
    const minute=Math.floor(now()/60000);if(minute!==lastWorldMinute){lastWorldMinute=minute;applyWorldTime()}
    if(pickupUntil&&at>=pickupUntil){pickupUntil=0;applySegments()}
    if(boatCargoUntil&&at>=boatCargoUntil){boatCargoUntil=0;applySegments()}
    if(phase==='caught'&&at>=caughtUntil){phase='playing';diverPosition=0;cargo=0;caughtPose='struggle';nextTickAt=at+tickMs();applySegments()}
    else if(phase==='caught'||phase==='gameOver'){
      const pose=at-caughtStartedAt<240?'upper':'struggle',frame=Math.floor(Math.max(0,at-caughtStartedAt-240)/180)%2
      if(pose!==caughtPose||frame!==caughtFrame){caughtPose=pose;caughtFrame=frame;applySegments()}
    }
    if((phase==='playing'||displayMode==='time')&&at>=nextTickAt){const steps=Math.min(4,1+Math.floor((at-nextTickAt)/Math.max(1,tickMs())));for(let i=0;i<steps;i++)advanceTentacles();nextTickAt=at+tickMs()}
  }
  const resize=()=>{const rect=renderer.domElement.getBoundingClientRect(),aspect=Math.max(.2,rect.width/Math.max(1,rect.height)),desiredWidth=visual.imageWidth*1.08,desiredHeight=visual.imageHeight*1.20;let viewWidth=desiredWidth,viewHeight=desiredWidth/aspect;if(viewHeight<desiredHeight){viewHeight=desiredHeight;viewWidth=viewHeight*aspect}overlayCamera.left=-viewWidth/2;overlayCamera.right=viewWidth/2;overlayCamera.top=viewHeight/2;overlayCamera.bottom=-viewHeight/2;overlayCamera.updateProjectionMatrix();const project=point=>new THREE.Vector3(...point).project(overlayCamera);overlayButtonBounds={};for(const[key,layout]of Object.entries(visual.buttonLayout)){const x=(layout.center[0]-.5)*visual.imageWidth,y=(.5-layout.center[1])*visual.imageHeight,center=project([x,y,.0003]),edge=project([x+layout.size[0]*visual.imageWidth/2,y+layout.size[1]*visual.imageHeight/2,.0003]),cx=(center.x+1)*rect.width/2,cy=(1-center.y)*rect.height/2,padding=Math.max(10,Math.min(rect.width,rect.height)*.014),hx=Math.max(Math.abs(edge.x-center.x)*rect.width/2+padding,24),hy=Math.max(Math.abs(edge.y-center.y)*rect.height/2+padding,20);overlayButtonBounds[key]={left:cx-hx,right:cx+hx,top:cy-hy,bottom:cy+hy}}const touch=isTouchMode(),helpControl=touch?touchHelpControl:desktopHelpControl;desktopHelpControl.visible=!touch;touchHelpControl.visible=touch;const helpWidth=Math.min(touch ? .096 : .068,viewWidth*(touch ? .78 : .52)),helpHeight=helpWidth*helpControl.userData.aspect;helpControl.scale.set(helpWidth,helpHeight,1);helpControl.position.set(touch?0:-viewWidth*.028,overlayCamera.top-helpHeight*.58,.02);const exitWidth=Math.min(.0096,viewWidth*.08),exitHeight=exitWidth/3;exitControl.scale.set(exitWidth,exitHeight,1);const safeX=viewWidth*Math.min(24,rect.width*.06)/Math.max(1,rect.width),safeY=viewHeight*Math.min(24,rect.height*.06)/Math.max(1,rect.height);exitControl.position.set(overlayCamera.right-Math.max(exitWidth*.64,safeX),overlayCamera.top-Math.max(exitHeight*.78,safeY),.02);const exitCenter=project([exitControl.position.x,exitControl.position.y,.02]),cx=(exitCenter.x+1)*rect.width/2,cy=(1-exitCenter.y)*rect.height/2,pxWidth=exitWidth/viewWidth*rect.width,pxHeight=exitHeight/viewHeight*rect.height,hitWidth=Math.max(pxWidth,44),hitHeight=Math.max(pxHeight,44);exitBounds={left:cx-hitWidth/2,right:cx+hitWidth/2,top:cy-hitHeight/2,bottom:cy+hitHeight/2}}
  const render=()=>{if(!active)return false;const previousAutoClear=renderer.autoClear,previousColor=renderer.getClearColor(new THREE.Color()),previousAlpha=renderer.getClearAlpha();renderer.autoClear=true;renderer.setClearColor(0x000000,1);renderer.render(overlayScene,overlayCamera);renderer.setClearColor(previousColor,previousAlpha);renderer.autoClear=previousAutoClear;return true}
  const setTestState=state=>{if(state.displayMode)displayMode=state.displayMode;if(state.phase){phase=state.phase;if(phase==='caught'){caughtStartedAt=performance.now()-300;caughtUntil=performance.now()+(config.game.caughtDurationMs??900);caughtPose=state.caughtPose??'struggle'}}if(state.score!=null)score=clampScore(state.score);if(state.misses!=null)misses=THREE.MathUtils.clamp(Math.round(state.misses),0,3);if(state.cargo!=null)cargo=Math.max(0,Math.round(state.cargo));if(state.diverPosition!=null)diverPosition=THREE.MathUtils.clamp(Math.round(state.diverPosition),0,DIVERS.length-1);if(state.tentacles)tentacles=state.tentacles.map((value,index)=>THREE.MathUtils.clamp(Math.round(value),0,TENTACLE_MAX[index])).slice(0,4);if(state.tentacleRoutes)tentacleRoutes=state.tentacleRoutes.slice(0,4);if(state.tentacleDirections)tentacleDirections=state.tentacleDirections.map(value=>value<0?-1:1).slice(0,4);if(state.tentacleFloors)tentacleFloors=state.tentacleFloors.map((value,index)=>THREE.MathUtils.clamp(Math.round(value),0,TENTACLE_MAX[index])).slice(0,4);if(state.caughtPose)caughtPose=state.caughtPose;if(state.caughtFrame!=null)caughtFrame=Math.abs(Math.round(state.caughtFrame))%2;if(state.pickupFrame!=null)pickupFrame=Math.abs(Math.round(state.pickupFrame))%2;if(state.pickupVisible!=null)pickupUntil=state.pickupVisible?performance.now()+100000:0;if(state.boatCargoVisible!=null)boatCargoUntil=state.boatCargoVisible?performance.now()+100000:0;applySegments();return snapshot()}
  const advanceTicks=count=>{for(let index=0;index<count;index++)advanceTentacles();return snapshot()}
  const snapshot=()=>({status:active?'active':'idle',id:config.id,displayMode,phase,score,misses,cargo,diverPosition,tentacles:[...tentacles],tentacleRoutes:[...tentacleRoutes],tentacleDirections:[...tentacleDirections],tentacleFloors:[...tentacleFloors],caughtPose,caughtFrame,pickupFrame,pickupVisible:pickupUntil>performance.now(),boatCargoVisible:boatCargoUntil>performance.now(),speedCycle:speedCycle(),speedStage:speedStage(),tickMs:tickMs(),ticks,pressed:[...pressed],pressedOverlays:[...pressed],highScores:{...saved.highScores},visibleSegmentIds:[...visibleSegmentIds],lcdLayoutVersion:LCD_LAYOUT_VERSION,assetStatus:{...assetStatus},segmentBufferUpdates,rendering:{lcdMode:'atlas-enabled-buffer',canvasTextureUploads:0},helpVariant:isTouchMode()?'touch':'desktop',placement:{classroom:config.placement.classroom,deskId:deskAnchor.name,cubby:config.placement.cubby,position:worldPosition.toArray().map(value=>round(value)),workingSize:[DEVICE.width,DEVICE.height,DEVICE.depth]},buttonBounds:Object.fromEntries(Object.entries(overlayButtonBounds).map(([key,value])=>[key,{...value}])),exitBounds:exitBounds?{...exitBounds}:null,persistence:{...userDataStore.snapshot(),namespace:STORAGE_NAMESPACE,namespaceVersion:1},lastHitDiagnostics:lastHitDiagnostics?{...lastHitDiagnostics}:null})
  visual.overlayRoot.visible=false;applySegments();applyWorldTime()
  const listeners={pointerdown:event=>{if(handlePointer('pointerdown',event)){renderer.domElement.setPointerCapture?.(event.pointerId);event.preventDefault();event.stopPropagation()}},pointermove:event=>{if(handlePointer('pointermove',event)){event.preventDefault();event.stopPropagation()}},pointerup:event=>{if(handlePointer('pointerup',event)){if(renderer.domElement.hasPointerCapture?.(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);event.preventDefault();event.stopPropagation()}},pointercancel:event=>{if(handlePointer('pointercancel',event)){event.preventDefault();event.stopPropagation()}},lostpointercapture:event=>handlePointer('lostpointercapture',event)}
  for(const[type,listener]of Object.entries(listeners))renderer.domElement.addEventListener(type,listener);window.addEventListener('blur',clearPressed)
  return{hit,interact,enter,exit,update,render,resize,handleKey,handlePointer,pauseInput,resumeAfterPause,consumePostExitClick,snapshot,startGame,showTime,move,registerMiss,scorePoints,setTestState,advanceTicks,resolveVisibleSegments}
}

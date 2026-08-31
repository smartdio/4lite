import * as THREE from 'three'

const clamp=THREE.MathUtils.clamp
const rounded=(value,digits=3)=>+value.toFixed(digits)
const GROUND_TITLE_ATLAS_URL='/assets/ui/arcade-comic-v01/arcade-comic-shuttlecock-v01.png'
const GROUND_TITLE_ATLAS_SIZE=[1024,768]
const GROUND_TITLE_RECTS={'switch-foot':[0,0,512,256],watch:[512,0,512,256],miss:[0,256,512,256],again:[512,256,512,256],ten:[0,512,512,256],record:[512,512,512,256]}
const GROUND_BURST_ATLAS_URL='/assets/ui/arcade-comic-v01/arcade-comic-bursts-v01.png'
const GROUND_BURST_ATLAS_SIZE=[2048,2048]
const GROUND_BURST_RECTS={major:[0,0,1024,1024],hit:[1024,0,1024,1024]}

const setAtlasUv=(geometry,[x,y,width,height],[atlasWidth,atlasHeight]=GROUND_TITLE_ATLAS_SIZE)=>{
  const u0=x/atlasWidth,u1=(x+width)/atlasWidth,v1=1-y/atlasHeight,v0=1-(y+height)/atlasHeight
  const uv=geometry.getAttribute('uv')
  uv.setXY(0,u0,v1);uv.setXY(1,u1,v1);uv.setXY(2,u0,v0);uv.setXY(3,u1,v0);uv.needsUpdate=true
}

export function createShuttlecockController({
  root,camera,renderer,config,isTouchMode=()=>false,isActiveMode=()=>false,
  onEnter=()=>true,onExit=()=>{},onEvent=()=>{},hitExit=()=>false,
}) {
  const group=new THREE.Group();group.name='shuttlecock-game-working-model';root.add(group)
  const [centerX,centerZ]=config.center,groundY=config.groundY
  const clothMaterial=new THREE.MeshStandardMaterial({color:0x7d3d2d,roughness:.92,metalness:0})
  const weightMaterial=new THREE.MeshStandardMaterial({color:0x625d51,roughness:.74,metalness:.28})
  const shuttle=new THREE.Group();shuttle.name='self-made-feather-shuttlecock-working-model';group.add(shuttle)
  const weight=new THREE.Mesh(new THREE.CylinderGeometry(config.weightTopRadius,config.weightBottomRadius,.025,14),weightMaterial);weight.position.y=.0125;shuttle.add(weight)
  const cloth=new THREE.Mesh(new THREE.SphereGeometry(config.clothRadius,14,8),clothMaterial);cloth.scale.y=.56;cloth.position.y=.041;shuttle.add(cloth)
  const featherTexture=new THREE.TextureLoader().load(config.featherTextureUrl)
  featherTexture.colorSpace=THREE.SRGBColorSpace;featherTexture.minFilter=THREE.LinearMipmapLinearFilter;featherTexture.magFilter=THREE.LinearFilter
  featherTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  const featherGeometry=new THREE.PlaneGeometry(config.featherWidth,config.featherHeight);featherGeometry.translate(0,config.featherHeight/2,0)
  const featherCount=config.featherColors.length
  for(let index=0;index<featherCount;index++){
    const angle=index*Math.PI*2/featherCount
    const featherMaterial=new THREE.MeshStandardMaterial({
      name:`shuttlecock-dyed-feather-material-${index+1}`,map:featherTexture,color:config.featherColors[index],
      transparent:true,alphaTest:.025,depthWrite:false,roughness:.96,metalness:0,side:THREE.DoubleSide,
    })
    const featherPivot=new THREE.Group();featherPivot.name=`shuttlecock-feather-direction-${index+1}`
    featherPivot.position.set(Math.sin(angle)*config.featherRootRadius,.048,Math.cos(angle)*config.featherRootRadius);featherPivot.rotation.y=angle
    const feather=new THREE.Mesh(featherGeometry,featherMaterial)
    feather.name=`shuttlecock-dyed-old-feather-${index+1}`
    feather.rotation.x=config.featherSplay;feather.rotation.z=(index-(featherCount-1)/2)*config.featherTwist;feather.renderOrder=4+index
    featherPivot.add(feather);shuttle.add(featherPivot)
  }
  const shadowMaterial=new THREE.ShaderMaterial({
    name:'shuttlecock-height-projection-material',transparent:true,depthWrite:false,depthTest:true,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    uniforms:{opacity:{value:.34}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform float opacity; varying vec2 vUv; void main(){float d=length((vUv-.5)*2.0);float core=1.0-smoothstep(.05,.48,d);float soft=1.0-smoothstep(.18,1.0,d);float a=(soft*.72+core*.28)*opacity;if(a<.004)discard;gl_FragColor=vec4(.075,.065,.05,a);}',
  })
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,32),shadowMaterial)
  shadow.name='shuttlecock-height-projection';shadow.rotation.x=-Math.PI/2;shadow.position.y=groundY+.008;shadow.renderOrder=3;group.add(shadow)

  // 踢毽子必须持续看清脚边和毽子，反馈标题因此作为地面贴花显示，而不是覆盖屏幕中央。
  const groundTitleTexture=new THREE.TextureLoader().load(GROUND_TITLE_ATLAS_URL)
  groundTitleTexture.colorSpace=THREE.SRGBColorSpace;groundTitleTexture.wrapS=groundTitleTexture.wrapT=THREE.ClampToEdgeWrapping
  groundTitleTexture.generateMipmaps=true;groundTitleTexture.minFilter=THREE.LinearMipmapLinearFilter;groundTitleTexture.magFilter=THREE.LinearFilter
  groundTitleTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  const groundTitleMaterial=new THREE.MeshBasicMaterial({
    name:'shuttlecock-ground-title-material',map:groundTitleTexture,transparent:true,opacity:1,alphaTest:.02,
    depthTest:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
  })
  const groundBurstTexture=new THREE.TextureLoader().load(GROUND_BURST_ATLAS_URL)
  groundBurstTexture.colorSpace=THREE.SRGBColorSpace;groundBurstTexture.wrapS=groundBurstTexture.wrapT=THREE.ClampToEdgeWrapping
  groundBurstTexture.generateMipmaps=true;groundBurstTexture.minFilter=THREE.LinearMipmapLinearFilter;groundBurstTexture.magFilter=THREE.LinearFilter
  groundBurstTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  const groundBurstMaterial=new THREE.MeshBasicMaterial({
    name:'shuttlecock-ground-burst-material',map:groundBurstTexture,transparent:true,opacity:1,alphaTest:.02,
    depthTest:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
  })
  const groundTitleRoot=new THREE.Group();groundTitleRoot.name='shuttlecock-ground-title';groundTitleRoot.position.set(centerX,groundY+.014,centerZ+.82);groundTitleRoot.rotation.x=-Math.PI/2;groundTitleRoot.visible=false;group.add(groundTitleRoot)
  const groundBursts={}
  for(const [name,rect] of Object.entries(GROUND_BURST_RECTS)){
    const geometry=new THREE.PlaneGeometry(2.35,2.35);setAtlasUv(geometry,rect,GROUND_BURST_ATLAS_SIZE)
    const mesh=new THREE.Mesh(geometry,groundBurstMaterial);mesh.name=`shuttlecock-ground-burst-${name}`;mesh.visible=false;mesh.position.z=-.001;mesh.renderOrder=3;mesh.frustumCulled=false
    groundTitleRoot.add(mesh);groundBursts[name]=mesh
  }
  const groundTitles={}
  for(const [name,rect] of Object.entries(GROUND_TITLE_RECTS)){
    const geometry=new THREE.PlaneGeometry(1.9,.95);setAtlasUv(geometry,rect)
    const mesh=new THREE.Mesh(geometry,groundTitleMaterial);mesh.name=`shuttlecock-ground-title-${name}`;mesh.visible=false;mesh.renderOrder=4;mesh.frustumCulled=false
    groundTitleRoot.add(mesh);groundTitles[name]=mesh
  }

  const safeZoneHeight=config.kickMaxY-config.kickMinY
  const safeZoneMaterial=new THREE.MeshBasicMaterial({
    name:'shuttlecock-safe-zone-material',color:0x65b96a,transparent:true,opacity:config.safeZoneOpacity,
    depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false,
  })
  const safeZone=new THREE.Mesh(new THREE.CylinderGeometry(config.kickReach,config.kickReach,safeZoneHeight,32,1,true),safeZoneMaterial)
  safeZone.name='shuttlecock-safe-kick-volume';safeZone.renderOrder=2;group.add(safeZone)

  const proxyLayer=9
  const proxyMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false})
  const proxy=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.5,12),proxyMaterial)
  proxy.name='shuttlecock-game-interaction-proxy';proxy.position.set(centerX,groundY+.25,centerZ);proxy.layers.set(proxyLayer);group.add(proxy)
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();raycaster.layers.set(proxyLayer)

  let phase='idle',streak=0,best=readBest(),expectedFoot='left',feedback='',feedbackUntil=0
  let groundTitleName=null,groundTitleStartedAt=0,groundTitleDuration=0,groundTitleKind='plain'
  let accumulator=0,playerOffset=0,moveInput=0,pointerId=null,pointerStartX=0,pointerStartY=0,pointerMoved=false
  const position=new THREE.Vector3(centerX,groundY+.03,centerZ),velocity=new THREE.Vector3()
  const cameraBase=new THREE.Vector3(centerX,groundY+config.eyeHeight,centerZ+config.cameraSouthOffset)

  function readBest(){
    try{return Math.max(0,Number.parseInt(localStorage.getItem(config.storageKey)??'0',10)||0)}catch{return 0}
  }
  const writeBest=()=>{try{localStorage.setItem(config.storageKey,String(best))}catch{/* storage is optional */}}
  const active=()=>phase!=='idle'
  const syncVisual=()=>{
    shuttle.position.copy(position);shuttle.rotation.y+=velocity.y*.0008
    const lean=clamp(velocity.x*.08,-.25,.25);shuttle.rotation.z=lean
    const height=Math.max(0,position.y-groundY),heightRatio=clamp(height/config.shadowFadeHeight,0,1)
    const radius=THREE.MathUtils.lerp(config.shadowNearRadius,config.shadowFarRadius,heightRatio)
    shadow.position.set(position.x,groundY+.008,position.z);shadow.scale.set(radius,radius*config.shadowAspect,1)
    shadowMaterial.uniforms.opacity.value=THREE.MathUtils.lerp(config.shadowNearOpacity,config.shadowFarOpacity,heightRatio)
    const footCenter=expectedFoot==='left'?-config.footOffset:config.footOffset
    safeZone.position.set(centerX+playerOffset+footCenter,groundY+(config.kickMinY+config.kickMaxY)/2,centerZ)
    safeZone.visible=active()&&phase!=='dropped'
    const kickable=kickableNow()
    safeZoneMaterial.opacity=kickable?config.safeZoneActiveOpacity:config.safeZoneOpacity
  }
  const facePlayArea=()=>{
    camera.position.set(cameraBase.x+playerOffset,cameraBase.y,cameraBase.z)
    camera.lookAt(centerX+playerOffset*.28,groundY+config.lookHeight,centerZ)
  }
  const setPointer=(clientX,clientY,useCenter=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
    raycaster.near=0;raycaster.far=config.interactionDistance;raycaster.setFromCamera(pointer,camera)
  }
  const hit=(clientX,clientY,useCenter=false)=>{
    if(active())return null
    setPointer(clientX,clientY,useCenter)
    const candidate=raycaster.intersectObject(proxy,false)[0]
    return candidate?{distance:rounded(candidate.distance),point:candidate.point.toArray().map(value=>rounded(value)),target:'shuttlecock'}:null
  }
  const resetRound=()=>{
    streak=0;expectedFoot='left';accumulator=0;feedback='按 Q 用左脚开始';feedbackUntil=Infinity
    position.set(centerX+playerOffset,groundY+config.readyHeight,centerZ)
    velocity.set(0,0,0);phase='ready';syncVisual()
  }
  const enter=()=>{
    if(active())return snapshot()
    if(onEnter({center:[centerX,centerZ]})===false)return null
    playerOffset=0;moveInput=0;pointerId=null;resetRound();facePlayArea()
    onEvent({type:'shuttlecock-enter'});return snapshot()
  }
  const interact=(clientX,clientY,useCenter=false)=>hit(clientX,clientY,useCenter)&&enter()?{type:'shuttlecock-enter'}:null
  const drop=reason=>{
    if(phase!=='playing')return false
    phase='dropped';velocity.set(0,0,0);position.y=groundY+.03
    if(streak>best){best=streak;writeBest()}
    feedback=reason==='out'?'出界了':streak?`落地 · ${streak} 次`:'没接住';feedbackUntil=Infinity
    onEvent({type:'shuttlecock-drop',reason,streak,best});syncVisual();return true
  }
  const kick=foot=>{
    if(!active())return null
    if(phase==='dropped')resetRound()
    if((phase!=='playing'&&phase!=='ready')||(foot!=='left'&&foot!=='right'))return null
    const starting=phase==='ready'
    const relativeX=position.x-(centerX+playerOffset)
    const inWindow=starting||(position.y>=groundY+config.kickMinY&&position.y<=groundY+config.kickMaxY&&velocity.y<config.maxRisingKickVelocity)
    const footCenter=foot==='left'?-config.footOffset:config.footOffset
    const inReach=Math.abs(relativeX-footCenter)<=config.kickReach
    if(foot!==expectedFoot||!inWindow||!inReach){
      feedback=foot!==expectedFoot?'换另一只脚':!inReach?'挪过去接':'看准落下时';feedbackUntil=performance.now()+650
      onEvent({type:'shuttlecock-miss',foot,reason:foot!==expectedFoot?'wrong-foot':!inReach?'out-of-reach':'timing'});return {type:'shuttlecock-miss',foot}
    }
    const previousBest=best
    streak++;if(streak>best){best=streak;writeBest()}
    phase='playing'
    expectedFoot=foot==='left'?'right':'left'
    const deterministicDrift=((streak*37)%9-4)*config.driftStep
    const footArc=foot==='left'?config.footArcVelocity:-config.footArcVelocity
    velocity.set(-relativeX*config.centeringStrength+footArc+deterministicDrift,config.kickVelocity+Math.min(streak,12)*config.kickVelocityGain,0)
    position.y=Math.max(position.y,groundY+config.kickMinY)
    feedback=streak%10===0?`${streak} 次！`:`${foot==='left'?'左':'右'}脚 · ${streak}`;feedbackUntil=performance.now()+520
    const result={type:'shuttlecock-kick',foot,streak,best,previousBest,newBest:streak>previousBest,starting,position:position.toArray().map(value=>rounded(value)),velocity:velocity.toArray().map(value=>rounded(value))}
    syncVisual();onEvent(result);return result
  }
  const step=fixedStep=>{
    if(phase!=='playing')return
    const verticalAcceleration=velocity.y>0?config.riseGravity:config.fallGravity
    velocity.y-=verticalAcceleration*fixedStep
    velocity.x*=Math.exp(-config.horizontalDrag*fixedStep)
    position.addScaledVector(velocity,fixedStep)
    if(Math.abs(position.x-centerX)>config.outRadius||Math.abs(position.z-centerZ)>config.outRadius){drop('out');return}
    if(position.y<=groundY+.03)drop('ground')
  }
  const update=(dt,now=performance.now())=>{
    if(!active())return
    playerOffset=clamp(playerOffset+moveInput*config.playerSpeed*dt,-config.playerRange,config.playerRange);facePlayArea()
    accumulator=Math.min(config.fixedStep*config.maxSubsteps,accumulator+Math.max(0,dt))
    let steps=0;while(accumulator>=config.fixedStep&&steps++<config.maxSubsteps){step(config.fixedStep);accumulator-=config.fixedStep}
    if(feedbackUntil!==Infinity&&now>=feedbackUntil)feedback=''
    if(groundTitleName){
      const t=clamp((now-groundTitleStartedAt)/groundTitleDuration,0,1),mesh=groundTitles[groundTitleName]
      const enter=t<.18?THREE.MathUtils.lerp(.72,1.08,t/.18):t<.34?THREE.MathUtils.lerp(1.08,1,(t-.18)/.16):1
      const emphasis=groundTitleKind==='major'?1.12:groundTitleKind==='hit'?1.06:1
      mesh.scale.set(enter*emphasis,enter*emphasis,1);groundTitleMaterial.opacity=t<.72?1:1-(t-.72)/.28
      const burst=groundBursts[groundTitleKind]
      if(burst){
        const burstScale=t<.16?THREE.MathUtils.lerp(.38,1.18,t/.16):t<.32?THREE.MathUtils.lerp(1.18,1,(t-.16)/.16):1
        burst.scale.setScalar(burstScale*(groundTitleKind==='major'?1.08:1));burst.rotation.z=Math.sin(t*Math.PI)*.025
        groundBurstMaterial.opacity=t<.62?1:1-(t-.62)/.38
      }
      if(t>=1)stopGroundTitle()
    }
    syncVisual()
  }
  const playGroundTitle=(name,kind='plain',duration=950)=>{
    const selected=groundTitles[name]?name:'again'
    for(const [key,mesh] of Object.entries(groundTitles))mesh.visible=key===selected
    for(const [key,mesh] of Object.entries(groundBursts))mesh.visible=key===kind
    groundTitleName=selected;groundTitleKind=kind;groundTitleStartedAt=performance.now();groundTitleDuration=Math.max(800,duration)
    groundTitleMaterial.opacity=1;groundBurstMaterial.opacity=1;groundTitleRoot.visible=true;return true
  }
  function stopGroundTitle(){
    groundTitleName=null;groundTitleRoot.visible=false;groundTitleMaterial.opacity=1;groundBurstMaterial.opacity=1
    for(const mesh of Object.values(groundTitles))mesh.visible=false
    for(const mesh of Object.values(groundBursts))mesh.visible=false
    return true
  }
  const advance=seconds=>{
    const steps=Math.ceil(Math.max(0,seconds)/config.fixedStep)
    for(let index=0;index<steps&&phase==='playing';index++)step(config.fixedStep)
    syncVisual();return snapshot()
  }
  const setState=({shuttlePosition,shuttleVelocity,nextFoot,playerX,gamePhase}={})=>{
    if(shuttlePosition)position.fromArray(shuttlePosition)
    if(shuttleVelocity)velocity.fromArray(shuttleVelocity)
    if(nextFoot)expectedFoot=nextFoot
    if(Number.isFinite(playerX))playerOffset=clamp(playerX,-config.playerRange,config.playerRange)
    if(gamePhase)phase=gamePhase
    syncVisual();facePlayArea();return snapshot()
  }
  const setMove=value=>{moveInput=clamp(value,-1,1);return moveInput}
  const kickableNow=()=>{
    if(phase!=='playing'||velocity.y>=config.maxRisingKickVelocity)return false
    const relativeX=position.x-(centerX+playerOffset),footCenter=expectedFoot==='left'?-config.footOffset:config.footOffset
    return position.y>=groundY+config.kickMinY&&position.y<=groundY+config.kickMaxY&&Math.abs(relativeX-footCenter)<=config.kickReach
  }
  const handleKey=(code,pressed,repeat=false)=>{
    if(!active())return false
    if(code==='KeyR'&&pressed){resetRound();return true}
    if(code==='KeyA'||code==='ArrowLeft'){setMove(pressed?-1:moveInput<0?0:moveInput);return true}
    if(code==='KeyD'||code==='ArrowRight'){setMove(pressed?1:moveInput>0?0:moveInput);return true}
    if(pressed&&!repeat&&(code==='KeyQ'||code==='KeyZ')){kick('left');return true}
    if(pressed&&!repeat&&code==='KeyE'){kick('right');return true}
    if(pressed&&!repeat&&code==='Space'){kick(expectedFoot);return true}
    return false
  }
  const pointerDown=event=>{
    if(!active()||event.button!==0)return false
    if(hitExit(event.clientX,event.clientY)){exit();return true}
    pointerId=event.pointerId;pointerStartX=event.clientX;pointerStartY=event.clientY;pointerMoved=false
    event.currentTarget?.setPointerCapture?.(event.pointerId);return true
  }
  const pointerMove=event=>{
    if(!active())return false
    if(document.pointerLockElement&&!isTouchMode()){
      playerOffset=clamp(playerOffset+(event.movementX??0)*config.pointerMoveScale,-config.playerRange,config.playerRange);facePlayArea();return true
    }
    if(pointerId!==event.pointerId)return false
    const dx=event.clientX-pointerStartX
    if(Math.hypot(dx,event.clientY-pointerStartY)>10)pointerMoved=true
    if(pointerMoved){playerOffset=clamp(playerOffset+dx*config.dragMoveScale,-config.playerRange,config.playerRange);pointerStartX=event.clientX;facePlayArea()}
    return true
  }
  const pointerUp=event=>{
    if(!active()||event.button!==0||pointerId!==event.pointerId)return false
    pointerId=null
    if(!pointerMoved){
      const rect=renderer.domElement.getBoundingClientRect();kick(event.clientX<rect.left+rect.width/2?'left':'right')
    }
    return true
  }
  const pointerCancel=event=>{if(!active()||pointerId!==event.pointerId)return false;pointerId=null;pointerMoved=false;return true}
  const pauseInput=()=>{pointerId=null;pointerMoved=false;moveInput=0;return true}
  const resumeAfterPause=durationMs=>{
    const delta=Math.max(0,durationMs||0)
    if(Number.isFinite(feedbackUntil))feedbackUntil+=delta
    groundTitleStartedAt+=delta
    return true
  }
  renderer.domElement.addEventListener('pointerdown',event=>{if(isActiveMode()&&pointerDown(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointermove',event=>{if(isActiveMode()&&pointerMove(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointerup',event=>{if(isActiveMode()&&pointerUp(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointercancel',event=>{if(isActiveMode()&&pointerCancel(event)){event.preventDefault();event.stopPropagation()}})
  const exit=()=>{
    if(!active())return null
    phase='idle';moveInput=0;pointerId=null;feedback='';stopGroundTitle();position.set(centerX,groundY+.03,centerZ);velocity.set(0,0,0);syncVisual()
    onExit();onEvent({type:'shuttlecock-exit'});return snapshot()
  }
  const heightState=()=>{
    const height=Math.max(0,position.y-groundY)
    return {height:rounded(height),heightRatio:rounded(clamp(height/config.heightGuideMax,0,1)),descending:velocity.y<0,kickWindow:[rounded(config.kickMinY/config.heightGuideMax),rounded(config.kickMaxY/config.heightGuideMax)]}
  }
  const hudState=()=>({visible:active(),phase,streak,best,expectedFoot,feedback,kickable:kickableNow(),...heightState(),playerOffset:rounded(playerOffset),touch:isTouchMode()})
  const snapshot=()=>({
    status:active()?'active':'idle',phase,streak,best,expectedFoot,feedback,kickable:kickableNow(),...heightState(),playerOffset:rounded(playerOffset),
    position:position.toArray().map(value=>rounded(value)),velocity:velocity.toArray().map(value=>rounded(value)),
    model:{
      kind:'textured-working-value',feathers:featherCount,featherArrangement:'radial-splay',featherSize:[config.featherWidth,config.featherHeight],
      featherColors:config.featherColors.map(color=>`#${color.toString(16).padStart(6,'0')}`),transparentFeatherTexture:true,
      rootStructure:'texture-stems-into-cloth-base',bundle:'compact',baseRadius:config.clothRadius,modernPlastic:false,
    },
    projection:{visible:shadow.visible,radius:rounded(shadow.scale.x),opacity:rounded(shadowMaterial.uniforms.opacity.value)},
    groundTitle:{visible:groundTitleRoot.visible,phrase:groundTitleName,kind:groundTitleKind,burstVisible:Object.values(groundBursts).some(mesh=>mesh.visible),position:groundTitleRoot.position.toArray().map(value=>rounded(value)),rotationX:rounded(groundTitleRoot.rotation.x)},
    safeZone:{
      visible:safeZone.visible,shape:'cylinder',center:safeZone.position.toArray().map(value=>rounded(value)),
      radius:rounded(config.kickReach),height:rounded(safeZoneHeight),opacity:rounded(safeZoneMaterial.opacity),
    },
    policy:{fixedStep:config.fixedStep,maxSubsteps:config.maxSubsteps,interactionProxies:1,storageKey:config.storageKey},
  })
  syncVisual()
  return {hit,interact,enter,exit,update,advance,kick,setMove,setState,playGroundTitle,stopGroundTitle,handleKey,pointerDown,pointerMove,pointerUp,pointerCancel,pauseInput,resumeAfterPause,hudState,snapshot}
}

import * as THREE from 'three'
import {currentLocale} from '../i18n/index.js'
import {createDodgeballSimulation} from './dodgeball/simulation.js'
import {createDodgeballScene} from './dodgeball/scene.js'
import {createDodgeballHud} from './dodgeball/hud.js'
import {isDodgeballPlayPoint} from './dodgeball/aim.js'

/** Campus adapter. The simulation, world and HUD never own the campus renderer. */
export function createDodgeballGame({
  renderer,campusRoot,campusCamera,config,isTouchMode=()=>false,isActiveMode=()=>false,
  onEnter=()=>true,onExit=()=>{},onEvent=()=>{},onPause=()=>{},onResume=()=>{},
}) {
  let world=null,hud=null,loadPromise=null,loaded=false,active=false,paused=false,disposed=false
  let portrait=false,postExitClick=null,matchCount=0,lastControlledId=null
  let footstepTime=0,rendering={world:{calls:0,triangles:0},total:{calls:0,triangles:0}}
  let viewport={left:0,top:0,width:1920,height:1080},chargePointer=null,chargeKey=false
  const inputKeys=new Set(),pointers=new Map(),move={x:0,z:0}
  const sim=createDodgeballSimulation({config:config.game??{},onEvent})
  const entry=new THREE.Group();entry.name='dodgeball-campus-chalk-entry';campusRoot.add(entry)
  const e=config.entry,[cx,cz]=e.center,[width,depth]=e.size,y=e.surfaceY??.012
  const positions=[]
  const quad=(x,z,w,d)=>{
    const l=x-w/2,r=x+w/2,n=z-d/2,s=z+d/2
    positions.push(l,y,n,l,y,s,r,y,n,r,y,n,l,y,s,r,y,s)
  }
  for(const x of [cx-width/2,cx+width/2])quad(x,cz,.065,depth)
  for(const z of [cz-depth/2,cz+depth/2])quad(cx,z,width,.065)
  for(const x of [cx-width/2+.65,cx+width/2-.65])quad(x,cz,.065,depth*.60)
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals()
  const chalk=new THREE.MeshStandardMaterial({color:0xeee9d7,roughness:1,polygonOffset:true,polygonOffsetFactor:-2})
  const lines=new THREE.Mesh(geometry,chalk);lines.receiveShadow=true;lines.name='dodgeball-chalk-lines';entry.add(lines)
  const labelCanvas=document.createElement('canvas');labelCanvas.width=1024;labelCanvas.height=256
  const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#eee9d7';ctx.textAlign='center';ctx.textBaseline='middle'
  ctx.font=`900 ${currentLocale==='en'?68:110}px "PingFang SC","Microsoft YaHei",sans-serif`
  ctx.fillText(currentLocale==='en'?'HOT-BLOODED DODGE':'热血躲避',512,128)
  const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace
  labelTexture.minFilter=THREE.LinearMipmapLinearFilter;labelTexture.magFilter=THREE.LinearFilter
  const labelMaterial=new THREE.MeshBasicMaterial({map:labelTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3})
  const label=new THREE.Mesh(new THREE.PlaneGeometry(3.6,.9),labelMaterial)
  label.name='dodgeball-ground-title';label.rotation.x=-Math.PI/2;label.position.set(cx,y+.005,cz+depth/2-.58);entry.add(label)
  const proxyMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false})
  const proxy=new THREE.Mesh(new THREE.BoxGeometry(width,.10,depth),proxyMaterial)
  proxy.name='dodgeball-entry-proxy';proxy.position.set(cx,y+.035,cz);proxy.layers.set(e.proxyLayer??12);entry.add(proxy)
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2()
  raycaster.layers.set(e.proxyLayer??12)
  const savedColor=new THREE.Color(),savedViewport=new THREE.Vector4(),savedScissor=new THREE.Vector4()
  const rendererState={}
  const sceneView={paused:false}
  function updateWorld(dt=0) {sceneView.paused=paused||portrait;world?.update(sim.state,dt,sceneView)}

  function hit(clientX,clientY,useCenter=false) {
    if(!loaded||active||disposed)return null
    // A nearby ground-level rectangle needs no recursive scene raycast.
    const dx=Math.max(0,Math.abs(campusCamera.position.x-cx)-width/2)
    const dz=Math.max(0,Math.abs(campusCamera.position.z-cz)-depth/2)
    if(Math.hypot(dx,dz)>e.interactionDistance||Math.abs(campusCamera.position.y-(e.eyeHeight??1.6)-y)>.75)return null
    const rect=renderer.domElement.getBoundingClientRect()
    ndc.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:1-(clientY-rect.top)/rect.height*2)
    campusCamera.updateMatrixWorld(true);entry.updateMatrixWorld(true)
    // Proximity gates the player, not the clicked point. A nearby player may
    // click any blank part of the whole rectangle, including its far corner.
    raycaster.near=0
    raycaster.far=Math.hypot(Math.abs(campusCamera.position.x-cx)+width/2,
      Math.abs(campusCamera.position.z-cz)+depth/2,Math.abs(campusCamera.position.y-y)+.1)+.1
    raycaster.setFromCamera(ndc,campusCamera)
    const found=raycaster.intersectObject(proxy,false)[0]
    return found?{id:'dodgeball',distance:found.distance,point:found.point.toArray()}:null
  }
  function resize() {
    const r=renderer.domElement.getBoundingClientRect(),aspect=16/9
    const w=Math.min(r.width,r.height*aspect),h=w/aspect
    viewport={left:r.left+(r.width-w)/2,top:r.top+(r.height-h)/2,width:w,height:h}
    const nextPortrait=isTouchMode()&&r.height>r.width
    if(nextPortrait&&!portrait&&active&&sim.state.phase!=='selection'&&!paused)onPause('portrait')
    portrait=nextPortrait
    updateHud()
    return viewport
  }
  function updateHud() {
    hud?.update(sim.state,{paused,portrait,touch:isTouchMode(),viewport,move})
  }
  function saveRenderer() {
    rendererState.autoClear=renderer.autoClear;rendererState.toneMapping=renderer.toneMapping
    rendererState.exposure=renderer.toneMappingExposure;rendererState.output=renderer.outputColorSpace
    rendererState.shadowEnabled=renderer.shadowMap.enabled;rendererState.shadowType=renderer.shadowMap.type
    rendererState.shadowAuto=renderer.shadowMap.autoUpdate;rendererState.shadowNeeds=renderer.shadowMap.needsUpdate
    rendererState.scissor=renderer.getScissorTest();rendererState.alpha=renderer.getClearAlpha()
    rendererState.target=renderer.getRenderTarget()
    rendererState.infoAutoReset=renderer.info.autoReset
    renderer.getClearColor(savedColor);renderer.getViewport(savedViewport);renderer.getScissor(savedScissor)
  }
  function restoreRenderer() {
    renderer.autoClear=rendererState.autoClear;renderer.toneMapping=rendererState.toneMapping
    renderer.toneMappingExposure=rendererState.exposure;renderer.outputColorSpace=rendererState.output
    renderer.shadowMap.enabled=rendererState.shadowEnabled;renderer.shadowMap.type=rendererState.shadowType
    renderer.shadowMap.autoUpdate=rendererState.shadowAuto;renderer.shadowMap.needsUpdate=rendererState.shadowNeeds
    renderer.info.autoReset=rendererState.infoAutoReset
    renderer.setRenderTarget(rendererState.target)
    renderer.setClearColor(savedColor,rendererState.alpha);renderer.setViewport(savedViewport)
    renderer.setScissor(savedScissor);renderer.setScissorTest(rendererState.scissor)
  }
  function render(force=false) {
    if(!loaded||(!active&&!force)||disposed)return false
    saveRenderer()
    try {
      const rect=renderer.domElement.getBoundingClientRect()
      renderer.setRenderTarget(null)
      renderer.autoClear=true;renderer.setScissorTest(false);renderer.setViewport(0,0,rect.width,rect.height)
      renderer.setClearColor(0x18252a,1);renderer.clear(true,true,true)
      const x=viewport.left-rect.left,z=rect.height-(viewport.top-rect.top)-viewport.height
      renderer.setViewport(x,z,viewport.width,viewport.height);renderer.setScissor(x,z,viewport.width,viewport.height);renderer.setScissorTest(true)
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.outputColorSpace=THREE.SRGBColorSpace
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true
      renderer.info.autoReset=false
      const beforeCalls=renderer.info.render.calls,beforeTriangles=renderer.info.render.triangles
      renderer.render(world.scene,world.camera)
      rendering.world={calls:renderer.info.render.calls-beforeCalls,triangles:renderer.info.render.triangles-beforeTriangles}
      renderer.autoClear=false;renderer.clearDepth();hud.render()
      rendering.total={calls:renderer.info.render.calls-beforeCalls,triangles:renderer.info.render.triangles-beforeTriangles}
    } finally { restoreRenderer() }
    return true
  }
  function load() {
    if(loadPromise)return loadPromise
    loadPromise=(async()=>{
      world=createDodgeballScene()
      hud=await createDodgeballHud({renderer,locale:currentLocale})
      if(disposed){world.dispose();hud.dispose();return null}
      renderer.initTexture(labelTexture);loaded=true;resize()
      // Shader/texture warmup uses the same renderer and restores all shared state.
      for(const ballMode of ['beanbag','pingpong']){sim.select(ballMode);updateWorld();updateHud();render(true)}
      // The cue is hidden in selection. Draw its shared instance buffers once
      // behind the campus loading barrier, without starting/recording a match.
      world.update({...sim.state,phase:'held',ball:{...sim.state.ball,ownerId:0},aim:{...sim.state.aim,ownerId:0}},0)
      render(true);updateWorld()
      return snapshot()
    })()
    return loadPromise
  }
  function clearInput() {
    for(const id of pointers.keys())if(renderer.domElement.hasPointerCapture?.(id))renderer.domElement.releasePointerCapture(id)
    pointers.clear();inputKeys.clear();chargePointer=null;chargeKey=false;move.x=move.z=0;sim.clearInput()
  }
  function enter() {
    if(!loaded||active||disposed||onEnter()===false)return null
    active=true;paused=false;postExitClick=null;matchCount=0;sim.select(sim.state.ballMode??'pingpong');clearInput();resize()
    updateWorld();updateHud();onEvent({type:'dodgeball-enter'});return snapshot()
  }
  function exit() {
    if(!active)return false
    // A held pointer can release after keyboard X (or after a second finger
    // exits). Consume its later click even though campus mode is already back.
    if(pointers.size)postExitClick={any:true,expiresAt:performance.now()+2000}
    clearInput();active=false;paused=false;sim.select(sim.state.ballMode);onExit();onEvent({type:'dodgeball-exit'});return true
  }
  function start() {
    if(!active||paused||portrait)return false
    clearInput();sim.start(sim.state.ballMode,matchCount++%2?'red':'blue');lastControlledId=sim.state.controlledId
    updateWorld();updateHud();return true
  }
  function action(name) {
    if(name==='exit')return exit()
    if(name==='resume'){if(!portrait)onResume();return true}
    if(name==='pause'){onPause('button');return true}
    if(paused||portrait)return false
    if(name==='pingpong'||name==='beanbag'){sim.select(name);updateHud();return true}
    if(name==='start'||name==='restart')return start()
    if(name==='select'){clearInput();sim.select(sim.state.ballMode);updateHud();return true}
    if(name==='jump')return sim.jump()
    if(name==='catch')return sim.catchBall()
    return false
  }
  function designPoint(event) {
    return {x:(event.clientX-viewport.left)/viewport.width*1920,y:(event.clientY-viewport.top)/viewport.height*1080}
  }
  function syncMove() {
    let x=Number(inputKeys.has('KeyD')||inputKeys.has('ArrowRight'))-Number(inputKeys.has('KeyA')||inputKeys.has('ArrowLeft'))
    let z=Number(inputKeys.has('KeyS')||inputKeys.has('ArrowDown'))-Number(inputKeys.has('KeyW')||inputKeys.has('ArrowUp'))
    for(const p of pointers.values())if(p.action==='joystick'){x+=p.mx??0;z+=p.mz??0}
    // End-line attackers only move up/down. Ignored A/D or diagonal joystick
    // motion must not reduce their legal movement before normalization.
    if(sim.state.players.find(player=>player.id===sim.state.controlledId)?.role==='attack')x=0
    const length=Math.max(1,Math.hypot(x,z));move.x=x/length;move.z=z/length;sim.setMove(move.x,move.z)
  }
  function pointerDown(event) {
    if(!active)return false
    const p=designPoint(event),name=hud.hit(p.x,p.y)
    const actor=sim.state.players.find(player=>player.id===sim.state.controlledId)
    const entry={action:name,startX:p.x,startY:p.y,mx:0,mz:0}
    pointers.set(event.pointerId,entry)
    if(!paused&&!portrait) {
      if(name==='jump'||name==='catch')action(name)
      else if(!name&&event.pointerType==='mouse'&&event.button===0&&isDodgeballPlayPoint(p.x,p.y)&&actor?.role==='defend') {
        // One press opens the normal catch window. No mouse aiming, charging,
        // hold-repeat, or release action: both roles share the primary button.
        entry.action='catch';sim.catchBall()
      }
      else if(name==='throw'||(!name&&event.pointerType!=='touch'&&event.button===0&&isDodgeballPlayPoint(p.x,p.y))) {
        if(sim.beginCharge()){entry.action='throw';chargePointer=event.pointerId}
      }
    }
    renderer.domElement.setPointerCapture?.(event.pointerId);return true
  }
  function pointerMove(event) {
    if(!active)return false
    const p=designPoint(event),owner=pointers.get(event.pointerId)
    if(paused||portrait)return true
    if(owner?.action==='joystick') {
      const radius=Math.max(55,90*1920/Math.max(960,viewport.width)),dx=(p.x-owner.startX)/radius,dz=(p.y-owner.startY)/radius
      // Normalize in syncMove, after filtering axes unavailable to this role.
      owner.mx=dx;owner.mz=dz;syncMove()
    }
    updateHud();return true
  }
  function pointerEnd(event,cancel=false) {
    if(!active)return false
    const owner=pointers.get(event.pointerId);pointers.delete(event.pointerId)
    if(renderer.domElement.hasPointerCapture?.(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId)
    if(!owner)return true
    const p=designPoint(event)
    if(owner.action==='throw'&&chargePointer===event.pointerId) {
      chargePointer=null
      if(!cancel&&!paused&&!portrait)sim.releaseCharge();else sim.clearInput()
    } else if(!cancel&&owner.action&&hud.hit(p.x,p.y)===owner.action&&!['joystick','jump','catch'].includes(owner.action)) {
      if(owner.action==='exit')postExitClick={x:event.clientX,y:event.clientY,expiresAt:performance.now()+750}
      action(owner.action)
    }
    syncMove();updateHud();return true
  }
  function handleKey(code,down=true,repeat=false) {
    if(!active)return false
    if(down&&!repeat&&code==='KeyX')return exit()
    if(down&&!repeat&&code==='Escape'){if(paused){if(!portrait)onResume()}else onPause('escape');return true}
    if(paused||portrait)return true
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code)) {
      down?inputKeys.add(code):inputKeys.delete(code);syncMove();return true
    }
    if(code==='KeyK') {
      if(down&&!repeat) {
        const actor=sim.state.players.find(player=>player.id===sim.state.controlledId)
        if(actor?.role==='defend')sim.catchBall()
        else if(sim.beginCharge())chargeKey=true
      } else if(!down&&chargeKey){chargeKey=false;sim.releaseCharge();syncMove()}
    } else if(down&&!repeat) {
      if(code==='Space')sim.jump()
      if(code==='Enter'&&['selection','finished'].includes(sim.state.phase))start()
      if(code==='Digit1'&&sim.state.phase==='selection')sim.select('pingpong')
      if(code==='Digit2'&&sim.state.phase==='selection')sim.select('beanbag')
    }
    return true
  }
  function update(dt) {
    if(!active||!loaded)return
    // A round reset can clear simulation input without changing the controlled
    // id. Physical held keys/joystick stay authoritative across every handoff.
    if(!paused&&!portrait){syncMove();sim.update(dt)}
    if(lastControlledId!==sim.state.controlledId){chargePointer=null;chargeKey=false;lastControlledId=sim.state.controlledId;syncMove()}
    const actor=sim.state.players.find(player=>player.id===sim.state.controlledId)
    if(!paused&&!portrait&&actor?.alive&&actor.y<.01&&Math.hypot(actor.vx,actor.vz)>.3){
      footstepTime-=dt
      if(footstepTime<=0){footstepTime=.32;onEvent({type:'dodgeball-step',pan:actor.x/40})}
    }else footstepTime=0
    updateWorld(paused?0:dt);updateHud()
  }
  function snapshot() {
    return {...sim.snapshot(),status:active?'active':'idle',loaded,paused,portrait,viewport:{...viewport},
      entry:{center:[...e.center],size:[...e.size],proxies:1,collision:false},
      visual:world?.snapshot()??null,hud:hud?.snapshot()??null,rendering:structuredClone(rendering),input:{keys:[...inputKeys],pointers:pointers.size,move:{...move}}}
  }
  function pauseInput(){paused=true;clearInput();updateWorld();updateHud();return true}
  function resumeAfterPause(){if(portrait)return false;paused=false;clearInput();updateWorld();updateHud();return true}
  function dispose(){if(disposed)return;exit();disposed=true;world?.dispose();hud?.dispose();campusRoot.remove(entry);geometry.dispose();chalk.dispose();label.geometry.dispose();labelMaterial.dispose();labelTexture.dispose();proxy.geometry.dispose();proxyMaterial.dispose()}
  return {load,hit,enter,exit,start,update,render,resize,handleKey,pointerDown,pointerMove,isActive:()=>active,
    pointerUp:event=>pointerEnd(event),pointerCancel:event=>pointerEnd(event,true),pauseInput,resumeAfterPause,snapshot,dispose,
    interact:(x,y,center=false)=>hit(x,y,center)&&enter()?{type:'start-dodgeball'}:null,
    consumePostExitClick:event=>{const p=postExitClick;postExitClick=null;return Boolean(p&&performance.now()<p.expiresAt&&(p.any||Math.hypot(event.clientX-p.x,event.clientY-p.y)<24))},
    setTestState:patch=>{sim.setTestState(patch);updateWorld();updateHud();return snapshot()},
    stepFor:seconds=>{if(!paused&&!portrait)sim.stepFor(seconds);updateWorld();updateHud();return snapshot()},
  }
}

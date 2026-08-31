import * as THREE from 'three'

const rounded=(value,digits=4)=>+value.toFixed(digits)

export function createBambooClimbGame({
  root,camera,renderer,config,poles,isTouchMode=()=>false,isActiveMode=()=>false,
  onEnter=()=>true,onExit=()=>{},onEvent=()=>{},hitExit=()=>false,
}) {
  const game=config.game
  const proxyLayer=7
  const proxyGeometry=new THREE.CylinderGeometry(Math.max(.12,config.bambooRadius*2.4),Math.max(.12,config.bambooRadius*2.4),config.bambooHeight,10)
  const proxyMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false})
  const proxies=poles.map((center,index)=>{
    const mesh=new THREE.Mesh(proxyGeometry,proxyMaterial)
    mesh.name=`b1-north-bamboo-climb-game-proxy-${index+1}`
    mesh.position.set(center[0],config.bambooHeight/2,center[1]);mesh.layers.set(proxyLayer)
    mesh.userData.bambooPoleIndex=index;root.add(mesh);return mesh
  })
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2()
  raycaster.layers.set(proxyLayer)
  let activePole=null,phase='idle',side='left',chargeStartedAt=0,chargeRatio=0
  let climbHeight=0,failures=0,feedback='',feedbackUntil=0
  let riseStartedAt=0,riseFrom=game.initialEyeY,riseTo=game.initialEyeY
  let slideStartedAt=0
  let cursorX=0,cursorY=game.arrowCenterY,pointerId=null
  let lookTargetY=game.initialEyeY+game.lookAheadY

  const active=()=>activePole!=null
  const setPointer=(clientX,clientY,useCenter=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
    raycaster.near=0;raycaster.far=game.interactionDistance;raycaster.setFromCamera(pointer,camera)
  }
  const hit=(clientX,clientY,useCenter=false)=>{
    if(active())return null
    setPointer(clientX,clientY,useCenter)
    const candidate=raycaster.intersectObjects(proxies,false)[0]
    return candidate?{pole:candidate.object.userData.bambooPoleIndex,distance:candidate.distance,point:candidate.point.toArray()}:null
  }
  const lookAtPole=eyeY=>{
    if(activePole==null)return
    const [x,z]=poles[activePole]
    camera.position.set(x,eyeY,z-game.cameraNorthOffset)
    lookTargetY=Math.min(config.bambooHeight-game.topFocusBelow,eyeY+game.lookAheadY)
    camera.lookAt(x,lookTargetY,z)
    camera.rotateY(-cursorX*game.headYawRadians)
    camera.rotateX((cursorY-game.arrowCenterY)*game.headPitchRadians)
    camera.rotateZ(-cursorX*game.headRollRadians)
  }
  const enterPole=index=>{
    if(index<0||index>=poles.length)return null
    if(active())exit()
    if(onEnter({index,center:[...poles[index]]})===false)return null
    activePole=index;phase='aiming';side='left';chargeStartedAt=0;chargeRatio=0
    climbHeight=0;failures=0;feedback='左手开始';feedbackUntil=performance.now()+1100
    cursorX=0;cursorY=game.arrowCenterY;pointerId=null
    lookAtPole(game.initialEyeY)
    const result={type:'bamboo-climb-enter',pole:index};onEvent(result);return snapshot()
  }
  const interact=(clientX,clientY,useCenter=false)=>{
    const candidate=hit(clientX,clientY,useCenter)
    return candidate&&enterPole(candidate.pole)?{type:'bamboo-climb-enter',pole:candidate.pole}:null
  }
  const targetX=()=>side==='left'?-game.arrowCenterX:game.arrowCenterX
  const cursorOnArrow=()=>Math.abs(cursorX-targetX())<=game.arrowHalfWidth&&Math.abs(cursorY-game.arrowCenterY)<=game.arrowHalfHeight
  const setCursorFromClient=(clientX,clientY)=>{
    if(!active()||phase==='charging')return false
    const rect=renderer.domElement.getBoundingClientRect()
    cursorX=THREE.MathUtils.clamp((clientX-rect.left)/rect.width*2-1,-.96,.96)
    cursorY=THREE.MathUtils.clamp(-((clientY-rect.top)/rect.height)*2+1,-.92,.92)
    lookAtPole(camera.position.y)
    return true
  }
  const moveCursor=(movementX,movementY)=>{
    if(!active()||phase==='charging')return false
    const rect=renderer.domElement.getBoundingClientRect()
    cursorX=THREE.MathUtils.clamp(cursorX+movementX/Math.max(1,rect.width)*game.cursorSpeed,-.96,.96)
    cursorY=THREE.MathUtils.clamp(cursorY-movementY/Math.max(1,rect.height)*game.cursorSpeed,-.92,.92)
    lookAtPole(camera.position.y)
    return true
  }
  const nudgeAimFromClient=(clientX,clientY)=>{
    if(!active()||phase==='charging')return false
    const rect=renderer.domElement.getBoundingClientRect()
    const offsetX=(clientX-rect.left)/rect.width*2-1
    const offsetY=-((clientY-rect.top)/rect.height)*2+1
    cursorX=THREE.MathUtils.clamp(cursorX+offsetX,-.96,.96)
    cursorY=THREE.MathUtils.clamp(cursorY+offsetY,-.92,.92)
    lookAtPole(camera.position.y)
    return true
  }
  const beginCharge=(overrideNow=null)=>{
    if(!active()||phase!=='aiming'||!cursorOnArrow())return false
    phase='charging';chargeRatio=0;chargeStartedAt=overrideNow??performance.now();feedback=''
    onEvent({type:'bamboo-climb-charge-start',pole:activePole,side});return true
  }
  const failCharge=(now=performance.now())=>{
    if(phase!=='charging')return false
    phase='failure';chargeRatio=1;chargeStartedAt=now;failures++;feedback='脱手 再试';feedbackUntil=now+game.failureDelayMs
    onEvent({type:'bamboo-climb-failure',pole:activePole,side,failures});return true
  }
  const releaseCharge=(overrideRatio=null)=>{
    if(phase!=='charging')return null
    const now=performance.now()
    const ratio=overrideRatio??Math.max(0,(now-chargeStartedAt)/(game.chargeSeconds*1000))
    chargeRatio=ratio
    if(ratio>1){failCharge(now);return {type:'bamboo-climb-failure',rise:0,ratio:rounded(ratio,3),side}}
    const requested=game.maxRise*THREE.MathUtils.clamp(ratio/game.perfectRatio,0,1)
    const remaining=Math.max(0,game.finishEyeY-(game.initialEyeY+climbHeight))
    const rise=Math.min(requested,remaining),perfect=ratio>=game.perfectRatio
    riseFrom=game.initialEyeY+climbHeight;climbHeight+=rise;riseTo=game.initialEyeY+climbHeight
    phase='rising';riseStartedAt=now;feedback=perfect?`用力 +${Math.round(rise*100)}厘米`:`抓稳 +${Math.round(rise*100)}厘米`;feedbackUntil=now+950
    const result={type:'bamboo-climb-rise',pole:activePole,side,ratio:rounded(ratio,3),rise:rounded(rise),perfect}
    onEvent(result);return result
  }
  const finishRise=()=>{
    if(phase!=='rising')return false
    const reachedTop=game.initialEyeY+climbHeight>=game.finishEyeY-1e-6
    if(reachedTop){cursorX=0;cursorY=game.arrowCenterY}
    lookAtPole(riseTo)
    if(reachedTop) {
      phase='complete';chargeRatio=0;feedback='到顶';feedbackUntil=Infinity
      onEvent({type:'bamboo-climb-complete',pole:activePole,climbHeight:rounded(climbHeight)})
    } else {
      side=side==='left'?'right':'left';phase='aiming';chargeRatio=0
    }
    return true
  }
  const startSlide=(overrideNow=null)=>{
    if(phase!=='complete')return false
    phase='sliding';slideStartedAt=overrideNow??performance.now();chargeRatio=0;feedback=''
    cursorX=0;cursorY=game.arrowCenterY;lookAtPole(game.finishEyeY)
    onEvent({type:'bamboo-climb-slide-start',pole:activePole});return true
  }
  const stepSlide=ratio=>{
    if(phase!=='sliding')return false
    const t=THREE.MathUtils.clamp(ratio,0,1),eased=t*t*(3-2*t)
    lookAtPole(THREE.MathUtils.lerp(game.finishEyeY,game.initialEyeY,eased))
    if(t>=1){onEvent({type:'bamboo-climb-slide-complete',pole:activePole});exit()}
    return true
  }
  const settle=()=>{
    if(phase==='rising')finishRise()
    else if(phase==='failure'){phase='aiming';chargeRatio=0;feedback=''}
    else if(phase==='sliding')stepSlide(1)
    return snapshot()
  }
  const update=now=>{
    if(!active())return
    if(phase==='charging') {
      chargeRatio=Math.max(0,(now-chargeStartedAt)/(game.chargeSeconds*1000))
      if(chargeRatio>1)failCharge(now)
    } else if(phase==='rising') {
      const t=THREE.MathUtils.clamp((now-riseStartedAt)/game.riseDurationMs,0,1)
      const eased=1-(1-t)**3;lookAtPole(THREE.MathUtils.lerp(riseFrom,riseTo,eased))
      if(t>=1)finishRise()
    } else if(phase==='failure'&&now>=feedbackUntil) {
      phase='aiming';chargeRatio=0;feedback=''
    } else if(phase==='sliding') {
      stepSlide((now-slideStartedAt)/game.slideDurationMs)
    }
    if(feedbackUntil!==Infinity&&now>=feedbackUntil&&phase!=='failure')feedback=''
  }
  const pauseInput=()=>{
    if(pointerId!=null&&renderer.domElement.hasPointerCapture?.(pointerId))renderer.domElement.releasePointerCapture(pointerId)
    pointerId=null
    if(phase==='charging'){phase='aiming';chargeRatio=0;feedback=''}
    return true
  }
  const resumeAfterPause=durationMs=>{
    const delta=Math.max(0,durationMs||0)
    chargeStartedAt+=delta;riseStartedAt+=delta;slideStartedAt+=delta
    if(Number.isFinite(feedbackUntil))feedbackUntil+=delta
    return true
  }
  const exit=()=>{
    if(!active())return null
    const previous=activePole;activePole=null;phase='idle';pointerId=null;chargeRatio=0;feedback=''
    onExit({index:previous,center:[...poles[previous]]});onEvent({type:'bamboo-climb-exit',pole:previous})
    return snapshot()
  }
  const pointerDown=event=>{
    if(!active()||event.button!==0)return false
    if(hitExit(event.clientX,event.clientY)){exit();return true}
    if(phase==='complete'){startSlide();return true}
    if(phase==='sliding')return true
    if(isTouchMode())nudgeAimFromClient(event.clientX,event.clientY)
    if(!beginCharge())return false
    pointerId=event.pointerId;renderer.domElement.setPointerCapture?.(event.pointerId);return true
  }
  const pointerMove=event=>{
    if(!active()||phase==='charging')return false
    if(document.pointerLockElement&&!isTouchMode())moveCursor(event.movementX??0,event.movementY??0)
    else if(!isTouchMode())setCursorFromClient(event.clientX,event.clientY)
    return true
  }
  const pointerUp=event=>{
    if(!active()||event.button!==0||pointerId!=null&&event.pointerId!==pointerId)return false
    pointerId=null
    if(phase==='charging')releaseCharge()
    return true
  }
  const pointerCancel=event=>{
    if(!active()||pointerId!=null&&event.pointerId!==pointerId)return false
    pointerId=null;if(phase==='charging')failCharge();return true
  }
  renderer.domElement.addEventListener('pointermove',event=>{if(isActiveMode()&&pointerMove(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointerdown',event=>{if(isActiveMode()&&pointerDown(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointerup',event=>{if(isActiveMode()&&pointerUp(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointercancel',event=>{if(isActiveMode()&&pointerCancel(event)){event.preventDefault();event.stopPropagation()}})

  const hudState=()=>({
    visible:active(),phase,side,charging:phase==='charging',chargeRatio:THREE.MathUtils.clamp(chargeRatio,0,1),
    aim:[rounded(cursorX,3),rounded(cursorY,3)],arrowCenter:[rounded(targetX(),3),rounded(game.arrowCenterY,3)],feedback,progress:climbHeight/(game.finishEyeY-game.initialEyeY),failures,complete:phase==='complete'||phase==='sliding',
  })
  const snapshot=()=>({
    status:active()?'active':'idle',phase,side,activePole,chargeRatio:rounded(chargeRatio,3),
    climbHeight:rounded(climbHeight),cameraHeight:rounded(camera.position.y),lookTargetHeight:rounded(lookTargetY),failures,complete:phase==='complete'||phase==='sliding',sliding:phase==='sliding',
    cursor:[rounded(cursorX,3),rounded(cursorY,3)],cursorOnArrow:cursorOnArrow(),
    config:{chargeSeconds:game.chargeSeconds,perfectRatio:game.perfectRatio,maxRise:game.maxRise,initialEyeY:game.initialEyeY,finishEyeY:game.finishEyeY},
  })
  return {hit,interact,enterPole,exit,update,hudState,snapshot,setCursorFromClient,moveCursor,nudgeAimFromClient,beginCharge,releaseCharge,settle,finishRise,startSlide,stepSlide,pointerDown,pointerMove,pointerUp,pointerCancel,pauseInput,resumeAfterPause}
}

import * as THREE from 'three'

const clamp=THREE.MathUtils.clamp
const rounded=(value,digits=3)=>+value.toFixed(digits)
const easeOutCubic=t=>1-(1-t)**3
const shortestDegrees=degrees=>((degrees+180)%360+360)%360-180

export function createLongJumpGame({
  root,camera,renderer,config,groundHeightAt,
  onEnter=()=>true,onExit=()=>{},onEvent=()=>{},
  hitExit=()=>false,hitRestart=()=>false,isActiveMode=()=>false,
}) {
  const group=new THREE.Group();group.name='toilet-sandpit-long-jump';root.add(group)
  const [boardX,boardZ]=config.boardCenter
  const [boardWidth,boardHeight,boardDepth]=config.boardSize
  const boardMaterial=new THREE.MeshStandardMaterial({color:0xb7a67d,roughness:.94,metalness:0})
  const board=new THREE.Mesh(new THREE.BoxGeometry(boardWidth,boardHeight,boardDepth),boardMaterial)
  board.name='long-jump-takeoff-board';board.position.set(boardX,config.boardTopY-boardHeight/2,boardZ);board.receiveShadow=true;group.add(board)
  const boardStripeMaterial=new THREE.MeshStandardMaterial({color:0xe8dfbd,roughness:.96,metalness:0})
  const boardStripe=new THREE.Mesh(new THREE.BoxGeometry(boardWidth*.92,.006,.045),boardStripeMaterial)
  boardStripe.name='long-jump-takeoff-line';boardStripe.position.set(boardX,config.boardTopY+.004,boardZ-boardDepth*.28);group.add(boardStripe)

  const proxyLayer=8
  const proxyMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false})
  const proxy=new THREE.Mesh(new THREE.BoxGeometry(boardWidth+.18,.42,boardDepth+.32),proxyMaterial)
  proxy.name='long-jump-board-interaction-proxy';proxy.position.set(boardX,.2,boardZ);proxy.layers.set(proxyLayer);group.add(proxy)
  const [sandX,sandZ]=config.interactionSandCenter,[sandWidth,sandDepth]=config.interactionSandSize
  const sandProxy=new THREE.Mesh(new THREE.BoxGeometry(sandWidth,.12,sandDepth),proxyMaterial)
  sandProxy.name='long-jump-sand-interaction-proxy';sandProxy.position.set(sandX,-.10,sandZ);sandProxy.layers.set(proxyLayer);group.add(sandProxy)
  const interactionProxies=[proxy,sandProxy]
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();raycaster.layers.set(proxyLayer)

  const markerMaterial=new THREE.MeshBasicMaterial({color:0xb8322b,depthTest:false,depthWrite:false,toneMapped:false})
  const marker=new THREE.Mesh(new THREE.BoxGeometry(5.35,.024,.065),markerMaterial)
  marker.name='long-jump-result-line';marker.renderOrder=40;marker.visible=false;group.add(marker)

  let phase='idle',angleTurns=0,angleSpeed=config.minTurnsPerSecond,angleError=0
  let chargeStartedAt=0,powerRatio=0,distance=0,evaluation='',overrun=false
  let phaseStartedAt=0,entryFromPosition=new THREE.Vector3(),entryFromQuaternion=new THREE.Quaternion()
  let flightFrom=new THREE.Vector3(),flightTo=new THREE.Vector3(),flightDurationMs=650
  let landingFromPosition=new THREE.Vector3(),landingViewPosition=new THREE.Vector3()
  let landingFromQuaternion=new THREE.Quaternion(),landingToQuaternion=new THREE.Quaternion()
  let pointerId=null,postExitUntil=0,proximityInside=false,proximityShown=false

  const active=()=>phase!=='idle'
  const takeoffLineZ=boardZ-boardDepth/2
  const crouchPosition=new THREE.Vector3(boardX,config.crouchEyeY,boardZ+.015)
  const faceNorth=()=>camera.lookAt(boardX,config.aimingFocusY,boardZ-2.15)
  const setPointer=(clientX,clientY,useCenter=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
    raycaster.near=0;raycaster.far=config.interactionDistance;raycaster.setFromCamera(pointer,camera)
  }
  const hit=(clientX,clientY,useCenter=false)=>{
    if(active())return null
    setPointer(clientX,clientY,useCenter)
    const candidate=raycaster.intersectObjects(interactionProxies,false)[0]
    return candidate?{distance:candidate.distance,point:candidate.point.toArray(),target:candidate.object===sandProxy?'sand':'board'}:null
  }
  const setMarker=()=>{
    const z=takeoffLineZ-distance,y=groundHeightAt(boardX,z,0)+.035
    marker.position.set(boardX,y,z);marker.visible=true
  }
  const clearMarker=()=>{marker.visible=false}
  const evaluationFor=value=>value>=2?'跳得真远！':value>=1.6?'不错！':value>=1.3?'再来一次！':'再用点力！'
  const computeDistance=ratio=>{
    if(ratio>1){
      overrun=true
      const excess=clamp((ratio-1)/.22,0,1)
      distance=THREE.MathUtils.lerp(config.overrunMaxDistance,config.overrunMinDistance,excess)
      evaluation='用力过头啦！'
    }else{
      overrun=false
      const angleQuality=clamp(1-Math.abs(angleError)/90,0,1)
      const powerQuality=clamp(ratio,0,1)
      distance=.55+1.65*(.25+.75*angleQuality)*(.25+.75*powerQuality)
      distance=clamp(distance,config.minDistance,config.maxDistance)
      evaluation=evaluationFor(distance)
    }
    distance=+distance.toFixed(2)
  }
  const launch=(ratio=powerRatio)=>{
    if(phase!=='charging')return null
    powerRatio=Math.max(0,ratio);computeDistance(powerRatio)
    phase='flight';phaseStartedAt=performance.now();pointerId=null
    flightFrom.copy(camera.position)
    const landingZ=takeoffLineZ-distance
    flightTo.set(boardX,groundHeightAt(boardX,landingZ,0)+config.landingEyeHeight,landingZ)
    flightDurationMs=550+160*(distance/config.maxDistance)
    clearMarker();onEvent({type:'long-jump-launch',distance,angleError:rounded(angleError,2),powerRatio:rounded(powerRatio),overrun})
    return snapshot()
  }
  const beginCharge=(overrideAngleDegrees=null,overrideNow=null)=>{
    if(phase!=='aiming')return false
    if(overrideAngleDegrees!=null)angleTurns=((overrideAngleDegrees/360)%1+1)%1
    angleError=shortestDegrees(angleTurns*360);phase='charging';chargeStartedAt=overrideNow??performance.now();powerRatio=0
    onEvent({type:'long-jump-charge-start',angleError:rounded(angleError,2)});return true
  }
  const releaseCharge=overrideRatio=>{
    if(phase!=='charging')return null
    const ratio=overrideRatio??(performance.now()-chargeStartedAt)/(config.chargeSeconds*1000)
    return launch(ratio)
  }
  const enter=()=>{
    if(active())return snapshot()
    entryFromPosition.copy(camera.position);entryFromQuaternion.copy(camera.quaternion)
    if(onEnter({center:[boardX,boardZ]})===false)return null
    phase='entering';phaseStartedAt=performance.now();angleTurns=0;angleError=0;powerRatio=0;distance=0;evaluation='';overrun=false;pointerId=null;clearMarker()
    onEvent({type:'long-jump-enter'});return snapshot()
  }
  const interact=(clientX,clientY,useCenter=false)=>hit(clientX,clientY,useCenter)&&enter()?{type:'long-jump-enter'}:null
  const restart=()=>{
    if(phase!=='result')return false
    entryFromPosition.copy(camera.position);entryFromQuaternion.copy(camera.quaternion);clearMarker()
    phase='entering';phaseStartedAt=performance.now();powerRatio=0;distance=0;evaluation='';overrun=false
    onEvent({type:'long-jump-restart'});return true
  }
  const exit=()=>{
    if(!active())return null
    phase='idle';pointerId=null;clearMarker();postExitUntil=performance.now()+300
    onExit();onEvent({type:'long-jump-exit'});return snapshot()
  }
  const update=(now,dt=0)=>{
    if(!active())return
    if(phase==='entering'){
      const t=clamp((now-phaseStartedAt)/config.entryDurationMs,0,1),e=easeOutCubic(t)
      camera.position.lerpVectors(entryFromPosition,crouchPosition,e);faceNorth()
      if(t>=1){phase='aiming';phaseStartedAt=now}
    }else if(phase==='aiming'){
      angleSpeed=THREE.MathUtils.lerp(config.minTurnsPerSecond,config.maxTurnsPerSecond,.5+.5*Math.sin(now*.0017))
      angleTurns=(angleTurns+angleSpeed*dt)%1
      const bob=.022*Math.sin(now*.0051)+.009*Math.sin(now*.0087+.8)
      camera.position.copy(crouchPosition);camera.position.y+=bob;faceNorth()
    }else if(phase==='charging'){
      powerRatio=Math.max(0,(now-chargeStartedAt)/(config.chargeSeconds*1000))
      const bob=.029*Math.sin(now*.0064)+.008*Math.sin(now*.011+.4)
      camera.position.copy(crouchPosition);camera.position.y+=bob;faceNorth()
      if(powerRatio>1.02)launch(powerRatio)
    }else if(phase==='flight'){
      const t=clamp((now-phaseStartedAt)/flightDurationMs,0,1),e=easeOutCubic(t)
      camera.position.lerpVectors(flightFrom,flightTo,e)
      camera.position.y+=Math.sin(Math.PI*t)*(.38+.24*distance/config.maxDistance)
      camera.lookAt(boardX,camera.position.y-.18,camera.position.z-2)
      if(t>=1){
        phase='landing';phaseStartedAt=now;landingFromPosition.copy(camera.position);landingFromQuaternion.copy(camera.quaternion);setMarker()
        const viewZ=flightTo.z-config.resultViewBackOffset
        landingViewPosition.set(boardX,groundHeightAt(boardX,viewZ,0)+config.resultViewEyeHeight,viewZ)
        camera.position.copy(landingViewPosition);camera.lookAt(boardX,marker.position.y,marker.position.z);landingToQuaternion.copy(camera.quaternion)
        camera.position.copy(landingFromPosition);camera.quaternion.copy(landingFromQuaternion)
        onEvent({type:'long-jump-land',distance,evaluation,overrun})
      }
    }else if(phase==='landing'){
      const elapsed=now-phaseStartedAt
      if(elapsed<config.landingPauseMs){camera.position.copy(landingFromPosition);camera.position.y-=.035*Math.sin(Math.PI*elapsed/config.landingPauseMs)}
      else{
        const t=clamp((elapsed-config.landingPauseMs)/config.turnDurationMs,0,1)
        camera.position.lerpVectors(landingFromPosition,landingViewPosition,easeOutCubic(t))
        camera.quaternion.slerpQuaternions(landingFromQuaternion,landingToQuaternion,easeOutCubic(t))
        if(t>=1){phase='result';phaseStartedAt=now;onEvent({type:'long-jump-result',distance,evaluation,overrun})}
      }
    }else if(phase==='result'&&now-phaseStartedAt>=config.resultDurationMs){
      exit()
    }
  }
  const proximity=(position)=>{
    if(active())return false
    const inside=Math.hypot(position.x-boardX,position.z-boardZ)<=config.proximityRadius
    const entered=inside&&!proximityInside&&!proximityShown
    proximityInside=inside;if(entered)proximityShown=true
    if(!inside&&Math.hypot(position.x-boardX,position.z-boardZ)>config.proximityRadius*1.7)proximityShown=false
    return entered
  }
  const pointerDown=event=>{
    if(!active()||event.button!==0)return false
    if(hitExit(event.clientX,event.clientY)){exit();return true}
    if(phase==='result')return true
    if(phase!=='aiming')return phase==='charging'||phase==='flight'||phase==='landing'
    if(!beginCharge())return false
    pointerId=event.pointerId;event.currentTarget?.setPointerCapture?.(event.pointerId);return true
  }
  const pointerUp=event=>{
    if(!active()||event.button!==0||pointerId!=null&&event.pointerId!==pointerId)return false
    pointerId=null;if(phase==='charging')releaseCharge();return true
  }
  const pointerCancel=event=>{
    if(!active()||pointerId!=null&&event.pointerId!==pointerId)return false
    pointerId=null;if(phase==='charging')launch(1.03);return true
  }
  const pauseInput=()=>{
    if(pointerId!=null&&renderer.domElement.hasPointerCapture?.(pointerId))renderer.domElement.releasePointerCapture(pointerId)
    pointerId=null
    if(phase==='charging'){phase='aiming';powerRatio=0;chargeStartedAt=0}
    return true
  }
  const resumeAfterPause=durationMs=>{
    const delta=Math.max(0,durationMs||0);phaseStartedAt+=delta
    if(chargeStartedAt)chargeStartedAt+=delta
    return true
  }
  renderer.domElement.addEventListener('pointerdown',event=>{if(isActiveMode()&&pointerDown(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointerup',event=>{if(isActiveMode()&&pointerUp(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointercancel',event=>{if(isActiveMode()&&pointerCancel(event)){event.preventDefault();event.stopPropagation()}})
  const consumePostExitClick=()=>performance.now()<=postExitUntil
  const settle=()=>{
    let guard=0
    while(guard++<5&&phase!=='idle'&&phase!=='aiming'&&phase!=='result'){
      if(phase==='entering')update(phaseStartedAt+config.entryDurationMs+1,0)
      else if(phase==='charging')launch(powerRatio||1)
      else if(phase==='flight')update(phaseStartedAt+flightDurationMs+1,0)
      else if(phase==='landing')update(phaseStartedAt+config.landingPauseMs+config.turnDurationMs+1,0)
    }
    return snapshot()
  }
  const hudState=()=>({visible:active(),phase,angleTurns,angleError,powerRatio,overrun,distance,evaluation,result:phase==='result'})
  const snapshot=()=>({status:active()?'active':'idle',phase,angleTurns:rounded(angleTurns),angleSpeed:rounded(angleSpeed),angleError:rounded(angleError,2),powerRatio:rounded(powerRatio),distance,evaluation,overrun,markerVisible:marker.visible,markerZ:marker.visible?rounded(marker.position.z):null,board:[boardX,config.boardTopY,boardZ],takeoffLineZ:rounded(takeoffLineZ),camera:camera.position.toArray().map(v=>rounded(v))})
  return {hit,interact,enter,exit,restart,update,proximity,hudState,snapshot,beginCharge,releaseCharge,settle,pointerDown,pointerUp,pointerCancel,pauseInput,resumeAfterPause,consumePostExitClick}
}

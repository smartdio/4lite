import * as THREE from 'three'

const clamp=THREE.MathUtils.clamp
const rounded=(value,digits=3)=>+value.toFixed(digits)
const easeInOut=t=>t*t*(3-2*t)

const drawStar=(context,cx,cy,outerRadius,rotation)=>{
  context.beginPath()
  for(let index=0;index<10;index++){
    const radius=index%2===0?outerRadius:outerRadius*.382
    const angle=rotation+index*Math.PI/5
    const x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius
    if(index===0)context.moveTo(x,y);else context.lineTo(x,y)
  }
  context.closePath();context.fill()
}

const createFlagTexture=renderer=>{
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512
  const context=canvas.getContext('2d')
  context.fillStyle='#de2910';context.fillRect(0,0,canvas.width,canvas.height)
  context.fillStyle='#ffde00'
  const unit=canvas.width/30
  drawStar(context,5*unit,5*unit,3*unit,-Math.PI/2)
  for(const [x,y] of [[10,2],[12,4],[12,7],[10,9]]){
    const rotation=Math.atan2(5-y,5-x)
    drawStar(context,x*unit,y*unit,unit,rotation)
  }
  const texture=new THREE.CanvasTexture(canvas)
  texture.name='flag-raising-national-flag-texture'
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true
  return texture
}

const createFlagGeometry=(width,height,columns=18,rows=12)=>{
  const vertices=[],uvs=[],indices=[]
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
    const u=column/columns,v=row/rows
    vertices.push(-u*width,-v*height,0);uvs.push(u,1-v)
  }
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1
    indices.push(a,c,b,b,c,d)
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setIndex(indices);geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2))
  geometry.computeVertexNormals();geometry.computeBoundingSphere()
  geometry.userData.basePositions=new Float32Array(vertices)
  return geometry
}

const pointSegmentDistance=(px,py,ax,ay,bx,by)=>{
  const dx=bx-ax,dy=by-ay,lengthSq=dx*dx+dy*dy
  const ratio=lengthSq?clamp(((px-ax)*dx+(py-ay)*dy)/lengthSq,0,1):0
  return Math.hypot(px-(ax+dx*ratio),py-(ay+dy*ratio))
}

export function createFlagRaisingController({
  root,camera,renderer,config,
  isTouchMode=()=>false,isActiveMode=()=>false,
  onEnter=()=>true,onExit=()=>{},onEvent=()=>{},hitExit=()=>false,
}){
  const group=new THREE.Group();group.name='flag-raising-apparatus';root.add(group)
  const [centerX,centerZ]=config.center,game=config.game,[flagWidth,flagHeight]=game.flagSize
  const upperTop=config.lower.height+config.upper.height

  const ropeMaterial=new THREE.MeshStandardMaterial({name:'flag-raising-rope-material',color:0xb9a57b,roughness:1,metalness:0})
  const metalMaterial=new THREE.MeshStandardMaterial({name:'flag-raising-hardware-material',color:0x777a73,roughness:.72,metalness:.38})
  const flagMaterial=new THREE.MeshStandardMaterial({name:'flag-raising-cloth-material',map:createFlagTexture(renderer),roughness:.92,metalness:0,side:THREE.DoubleSide})
  const flagGeometry=createFlagGeometry(flagWidth,flagHeight)
  const flag=new THREE.Mesh(flagGeometry,flagMaterial);flag.name='flag-raising-cloth';flag.castShadow=false;flag.receiveShadow=true;flag.visible=false;group.add(flag)

  const ropeHeight=game.pulleyY-game.ropeBottomY
  const ropeGeometry=new THREE.CylinderGeometry(.008,.008,ropeHeight,7)
  const ropeWest=new THREE.Mesh(ropeGeometry,ropeMaterial),ropeEast=new THREE.Mesh(ropeGeometry,ropeMaterial)
  ropeWest.name='flag-raising-halyard-west';ropeEast.name='flag-raising-halyard-east'
  for(const [mesh,x] of [[ropeWest,centerX-.034],[ropeEast,centerX+.034]]){
    mesh.position.set(x,game.ropeBottomY+ropeHeight/2,centerZ+game.ropeSouthOffset);mesh.castShadow=false;group.add(mesh)
  }
  const ropeLoopControlDrop=game.ropeLoopRadius*4/3
  const ropeLoopCurve=new THREE.CubicBezierCurve3(
    new THREE.Vector3(centerX-.034,game.ropeBottomY,centerZ+game.ropeSouthOffset),
    new THREE.Vector3(centerX-.034,game.ropeBottomY-ropeLoopControlDrop,centerZ+game.ropeSouthOffset),
    new THREE.Vector3(centerX+.034,game.ropeBottomY-ropeLoopControlDrop,centerZ+game.ropeSouthOffset),
    new THREE.Vector3(centerX+.034,game.ropeBottomY,centerZ+game.ropeSouthOffset),
  )
  const ropeLoop=new THREE.Mesh(new THREE.TubeGeometry(ropeLoopCurve,14,.008,7,false),ropeMaterial)
  ropeLoop.name='flag-raising-halyard-bottom-loop';ropeLoop.castShadow=false;group.add(ropeLoop)
  const pulley=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.055,18),metalMaterial)
  pulley.name='flag-raising-top-pulley';pulley.rotation.z=Math.PI/2;pulley.position.set(centerX,game.pulleyY,centerZ+game.ropeSouthOffset);group.add(pulley)
  const cleat=new THREE.Mesh(new THREE.BoxGeometry(.15,.035,.035),metalMaterial)
  cleat.name='flag-raising-rope-cleat';cleat.rotation.z=.32;cleat.position.set(centerX,game.ropeBottomY+.12,centerZ+game.ropeSouthOffset+.018);group.add(cleat)

  const proxyMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false})
  const proxy=new THREE.Mesh(new THREE.BoxGeometry(config.lower.size[0]+.18,upperTop+.18,config.lower.size[1]+.18),proxyMaterial)
  proxy.name='flag-platform-interaction-proxy';proxy.position.set(centerX,(upperTop+.18)/2,centerZ);proxy.layers.set(game.proxyLayer);root.add(proxy)
  const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();raycaster.layers.set(game.proxyLayer)

  let phase='idle',completed=false,targetProgress=0,displayProgress=0,pointerId=null,captureTarget=null
  let strokeStartY=0,strokeAppliedPixels=0,ropePullRatio=0,regripStartedAt=0,phaseStartedAt=0
  let entryPosition=new THREE.Vector3(),entryQuaternion=new THREE.Quaternion(),entryFov=60,entryTargetFov=game.cameraFov
  let interactionBaseFov=game.cameraFov,interactionHighFov=game.cameraHighFov
  let entryTargetPosition=new THREE.Vector3(centerX+game.cameraLateralOffset,game.cameraEyeY,centerZ+game.cameraSouthOffset),entryTargetQuaternion=new THREE.Quaternion()
  const followTarget=new THREE.Vector3(),followTargetQuaternion=new THREE.Quaternion(),followMatrix=new THREE.Matrix4()
  let pullImpulse=0,lastUpdateAt=performance.now(),dropStartedAt=0,dropFrom=0,postExitUntil=0
  const ropeViewTop=new THREE.Vector3(),ropeViewBottom=new THREE.Vector3()
  const ropeProjectionTop=new THREE.Vector3(),ropeProjectionBottom=new THREE.Vector3()

  const active=()=>phase!=='idle'
  const flagTopY=progress=>THREE.MathUtils.lerp(game.lowTopY,game.highTopY,progress)
  const updateFollowTarget=(progress,out=followTargetQuaternion)=>{
    followTarget.set(centerX-flagWidth*.43,flagTopY(progress)-flagHeight*.48,centerZ)
    followMatrix.lookAt(camera.position,followTarget,camera.up);out.setFromRotationMatrix(followMatrix);return out
  }
  const setPointer=(clientX,clientY,useCenter=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointerNdc.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
    raycaster.near=0;raycaster.far=game.interactionDistance;raycaster.setFromCamera(pointerNdc,camera)
  }
  const hit=(clientX,clientY,useCenter=false)=>{
    if(active())return null
    setPointer(clientX,clientY,useCenter)
    const candidate=raycaster.intersectObject(proxy,false)[0]
    return candidate?{distance:rounded(candidate.distance),point:candidate.point.toArray().map(value=>rounded(value)),target:'flag-platform'}:null
  }
  const updateFlagTransform=()=>{
    const topY=flagTopY(displayProgress)
    flag.position.set(centerX-config.pole.radius-.008,topY,centerZ)
    const ropeExtension=ropePullRatio*.32
    for(const rope of [ropeWest,ropeEast]){
      rope.scale.y=1+ropeExtension/ropeHeight
      rope.position.y=game.ropeBottomY+ropeHeight/2-ropeExtension/2
    }
    ropeLoop.position.y=-ropeExtension
    pulley.rotation.x=displayProgress*Math.PI*18+ropePullRatio*.6
  }
  const updateFlagCloth=(now,dt)=>{
    const position=flagGeometry.getAttribute('position'),base=flagGeometry.userData.basePositions,time=now*.001
    const wind=1.08+.24*Math.sin(time*.31)+.13*Math.sin(time*.73+1.2)
    for(let index=0;index<position.count;index++){
      const x0=base[index*3],y0=base[index*3+1],u=clamp(-x0/flagWidth,0,1),v=clamp(-y0/flagHeight,0,1),influence=u*u
      const foldPhase=time*1.15+u*10.2-v*2.4
      const contraction=u*.085+influence*.028*Math.sin(foldPhase)
      const horizontalFold=influence*(.038*Math.sin(time*1.8+u*5.1+v*1.2)+.018*Math.sin(time*3.2+u*11-v*2.1))
      const verticalWave=influence*wind*(.058*Math.sin(time*1.75+u*4.8-v*1.5)+.029*Math.sin(time*4.15+u*8.4+v*2.2))
      const depthWave=influence*wind*(.145*Math.sin(time*2.05+u*5.7+v*.9)+.064*Math.sin(time*3.9+u*10.4-v*1.5)+.022*Math.cos(time*2.6+v*6.2))
      const inertia=influence*pullImpulse*(.055+.026*Math.sin(Math.PI*v))
      const farEdgeSag=game.flagFarEdgeDrop*Math.pow(u,1.55)
      position.setXYZ(index,x0+contraction+horizontalFold,y0-farEdgeSag+verticalWave-inertia,depthWave+inertia*.82)
    }
    position.needsUpdate=true
    if((Math.floor(now/32)&1)===0)flagGeometry.computeVertexNormals()
    pullImpulse*=Math.exp(-dt*5.5)
  }
  const ropeScreenSegments=()=>{
    const rect=renderer.domElement.getBoundingClientRect()
    const bottomY=game.ropeBottomY-ropePullRatio*.32
    const clipZ=-Math.max(camera.near*1.02,.02)
    const toCss=point=>[rect.left+(point.x+1)*rect.width/2,rect.top+(1-point.y)*rect.height/2]
    const projectStrand=x=>{
      ropeViewTop.set(x,game.pulleyY,centerZ+game.ropeSouthOffset).applyMatrix4(camera.matrixWorldInverse)
      ropeViewBottom.set(x,bottomY,centerZ+game.ropeSouthOffset).applyMatrix4(camera.matrixWorldInverse)
      if(ropeViewTop.z>clipZ&&ropeViewBottom.z>clipZ)return null
      if(ropeViewTop.z>clipZ)ropeViewTop.lerp(ropeViewBottom,(clipZ-ropeViewTop.z)/(ropeViewBottom.z-ropeViewTop.z))
      else if(ropeViewBottom.z>clipZ)ropeViewBottom.lerp(ropeViewTop,(clipZ-ropeViewBottom.z)/(ropeViewTop.z-ropeViewBottom.z))
      ropeProjectionTop.copy(ropeViewTop).applyMatrix4(camera.projectionMatrix)
      ropeProjectionBottom.copy(ropeViewBottom).applyMatrix4(camera.projectionMatrix)
      return [toCss(ropeProjectionTop),toCss(ropeProjectionBottom)]
    }
    return [projectStrand(centerX-.034),projectStrand(centerX+.034)].filter(Boolean)
  }
  const ropeScreenHit=(clientX,clientY)=>{
    const width=isTouchMode()?game.ropeTouchHitRadius:game.ropeHitRadius
    return ropeScreenSegments().some(([[ax,ay],[bx,by]])=>pointSegmentDistance(clientX,clientY,ax,ay,bx,by)<=width)
  }
  const enter=()=>{
    if(active())return snapshot()
    entryPosition.copy(camera.position);entryQuaternion.copy(camera.quaternion);entryFov=camera.fov
    const portrait=isTouchMode()&&renderer.domElement.clientHeight>renderer.domElement.clientWidth
    interactionBaseFov=portrait?game.cameraPortraitFov:game.cameraFov
    interactionHighFov=portrait?game.cameraPortraitHighFov:game.cameraHighFov
    entryTargetFov=completed?interactionHighFov:interactionBaseFov
    camera.position.copy(entryTargetPosition);updateFollowTarget(completed?1:0,entryTargetQuaternion)
    camera.position.copy(entryPosition);camera.quaternion.copy(entryQuaternion)
    if(onEnter({center:[centerX,centerZ]})===false)return null
    phase='entering';phaseStartedAt=performance.now();pointerId=null;ropePullRatio=0
    targetProgress=completed?1:0;displayProgress=targetProgress;dropStartedAt=0
    flag.visible=true
    onEvent({type:'flag-raising-enter',completed});return snapshot()
  }
  const interact=(clientX,clientY,useCenter=false)=>hit(clientX,clientY,useCenter)&&enter()?{type:'flag-raising-enter'}:null
  const finishStroke=(cancelled=false)=>{
    if(pointerId!=null&&captureTarget?.hasPointerCapture?.(pointerId))captureTarget.releasePointerCapture(pointerId)
    captureTarget=null
    pointerId=null
    if(completed){phase='complete';ropePullRatio=0;return true}
    phase='regrip';regripStartedAt=performance.now();onEvent({type:'flag-raising-regrip',cancelled,progress:targetProgress});return true
  }
  const applyPullPixels=pixels=>{
    if(phase!=='pulling'||pixels<=0||completed)return false
    const nextPixels=clamp(strokeAppliedPixels+pixels,0,game.strokePixels),applied=nextPixels-strokeAppliedPixels
    if(applied<=0)return true
    strokeAppliedPixels=nextPixels;ropePullRatio=nextPixels/game.strokePixels
    const previous=targetProgress;targetProgress=clamp(targetProgress+applied/game.strokePixels*game.strokeProgress,0,1)
    pullImpulse=Math.min(1.35,pullImpulse+applied/game.strokePixels*.5)
    onEvent({type:'flag-raising-pull',delta:targetProgress-previous,progress:targetProgress})
    if(targetProgress>=1){completed=true;phase='complete';pointerId=null;ropePullRatio=0;onEvent({type:'flag-raising-complete'})}
    return true
  }
  const pointerDown=event=>{
    if(!active()||event.button!==0)return false
    if(hitExit(event.clientX,event.clientY)){exit();return true}
    if(!['ready','regrip'].includes(phase)||!ropeScreenHit(event.clientX,event.clientY))return false
    // 玩家常会在绳段回弹尚未结束时立即重新抓绳。直接接管下一次
    // 下拉，避免吞掉 pointerdown 后整次拖动都没有反应。
    if(phase==='regrip')ropePullRatio=0
    phase='pulling';pointerId=event.pointerId;strokeStartY=event.clientY;strokeAppliedPixels=0;ropePullRatio=0
    captureTarget=event.currentTarget??renderer.domElement;captureTarget.setPointerCapture?.(event.pointerId);onEvent({type:'flag-raising-grab'});return true
  }
  const pointerMove=event=>{
    if(phase!=='pulling'||pointerId!=null&&event.pointerId!==pointerId)return false
    const nextY=Math.max(strokeStartY,event.clientY),pixels=nextY-strokeStartY-strokeAppliedPixels
    return applyPullPixels(pixels)
  }
  const pointerUp=event=>{
    if(phase!=='pulling'||pointerId!=null&&event.pointerId!==pointerId)return false
    return finishStroke(false)
  }
  const pointerCancel=event=>{
    if(phase!=='pulling'||pointerId!=null&&event.pointerId!==pointerId)return false
    return finishStroke(true)
  }
  const pauseInput=()=>phase==='pulling'?finishStroke(true):true
  const resumeAfterPause=durationMs=>{
    const delta=Math.max(0,durationMs||0);phaseStartedAt+=delta;regripStartedAt+=delta;lastUpdateAt+=delta;return true
  }
  const exit=()=>{
    if(!active())return null
    if(pointerId!=null&&captureTarget?.hasPointerCapture?.(pointerId))captureTarget.releasePointerCapture(pointerId)
    pointerId=null;captureTarget=null;ropePullRatio=0
    if(!completed&&targetProgress>0){dropStartedAt=performance.now();dropFrom=displayProgress;targetProgress=0}
    phase='idle';flag.visible=completed;postExitUntil=performance.now()+300;onExit();onEvent({type:'flag-raising-exit',completed});return snapshot()
  }
  const update=now=>{
    const dt=Math.min(.05,Math.max(0,(now-lastUpdateAt)/1000));lastUpdateAt=now
    if(phase==='entering'){
      const ratio=clamp((now-phaseStartedAt)/game.entryDurationMs,0,1),eased=easeInOut(ratio)
      camera.position.lerpVectors(entryPosition,entryTargetPosition,eased);camera.quaternion.slerpQuaternions(entryQuaternion,entryTargetQuaternion,eased)
      camera.fov=THREE.MathUtils.lerp(entryFov,entryTargetFov,eased);camera.updateProjectionMatrix()
      if(ratio>=1)phase=completed?'complete':'ready'
    }else if(phase==='regrip'){
      const ratio=clamp((now-regripStartedAt)/game.regripDurationMs,0,1);ropePullRatio*=1-easeInOut(ratio)
      if(ratio>=1){ropePullRatio=0;phase='ready'}
    }
    if(dropStartedAt){
      const ratio=clamp((now-dropStartedAt)/game.cancelDropDurationMs,0,1);displayProgress=THREE.MathUtils.lerp(dropFrom,0,easeInOut(ratio))
      if(ratio>=1){dropStartedAt=0;displayProgress=0}
    }else displayProgress=THREE.MathUtils.damp(displayProgress,targetProgress,12,dt)
    if(active()&&phase!=='entering'){
      camera.quaternion.slerp(updateFollowTarget(displayProgress),1-Math.exp(-dt*7.5))
      const desiredFov=THREE.MathUtils.lerp(interactionBaseFov,interactionHighFov,easeInOut(displayProgress)),nextFov=THREE.MathUtils.damp(camera.fov,desiredFov,6.5,dt)
      if(Math.abs(nextFov-camera.fov)>.001){camera.fov=nextFov;camera.updateProjectionMatrix()}
    }
    updateFlagTransform()
    if(flag.visible)updateFlagCloth(now,dt);else pullImpulse=0
  }
  const testPull=(pixels=game.strokePixels)=>{
    if(phase==='entering')phase=completed?'complete':'ready'
    if(phase!=='ready')return snapshot()
    phase='pulling';strokeAppliedPixels=0;applyPullPixels(Math.max(0,pixels))
    if(phase==='pulling'){phase='ready';ropePullRatio=0}
    displayProgress=targetProgress;updateFlagTransform();return snapshot()
  }
  const reset=()=>{completed=false;targetProgress=displayProgress=0;dropStartedAt=0;phase='idle';flag.visible=false;updateFlagTransform();return snapshot()}
  const settle=()=>{
    displayProgress=targetProgress
    if(phase==='entering'){
      camera.position.copy(entryTargetPosition);camera.quaternion.copy(entryTargetQuaternion);camera.fov=entryTargetFov;camera.updateProjectionMatrix()
    }
    if(phase==='entering'||phase==='regrip')phase=completed?'complete':'ready'
    ropePullRatio=0;updateFlagTransform();return snapshot()
  }
  const hudState=()=>({visible:active(),phase,complete:completed,progress:targetProgress,touch:isTouchMode()})
  const ropeBounds=()=>{
    const segments=ropeScreenSegments(),values=segments.flat(),pad=isTouchMode()?game.ropeTouchHitRadius:game.ropeHitRadius
    return {left:Math.min(...values.map(point=>point[0]))-pad,right:Math.max(...values.map(point=>point[0]))+pad,top:Math.min(...values.map(point=>point[1]))-pad,bottom:Math.max(...values.map(point=>point[1]))+pad}
  }
  const snapshot=()=>{
    const ropeSegments=active()?ropeScreenSegments().map(segment=>segment.map(point=>point.map(value=>rounded(value,1)))):null
    return {status:active()?'active':'idle',phase,completed,progress:rounded(targetProgress),displayProgress:rounded(displayProgress),ropePullRatio:rounded(ropePullRatio),flagTopY:rounded(flagTopY(displayProgress)),flagVisible:flag.visible,ropeBounds:active()?ropeBounds():null,ropePoints:ropeSegments?.[0]??null,ropeSegments,vertices:flagGeometry.getAttribute('position').count,flagTexture:[768,512],drawObjects:7,postExitUntil}
  }

  renderer.domElement.addEventListener('pointerdown',event=>{if(isActiveMode()&&pointerDown(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointermove',event=>{if(isActiveMode()&&pointerMove(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointerup',event=>{if(isActiveMode()&&pointerUp(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointercancel',event=>{if(isActiveMode()&&pointerCancel(event)){event.preventDefault();event.stopPropagation()}})

  updateFlagTransform()
  return {hit,interact,enter,exit,update,pointerDown,pointerMove,pointerUp,pointerCancel,pauseInput,resumeAfterPause,hudState,snapshot,testPull,reset,settle,consumePostExitClick:()=>performance.now()<=postExitUntil}
}

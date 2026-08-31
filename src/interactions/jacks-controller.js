import * as THREE from 'three'
import {getUserDataStore} from '../state/user-data-store.js'

const STORAGE_NAMESPACE='jacksGame'
const clamp=THREE.MathUtils.clamp
const rounded=(value,digits=3)=>+value.toFixed(digits)
const easeOutCubic=value=>1-(1-value)**3

const validateProgress=value=>({
  highestStage:clamp(Math.round(Number(value?.highestStage)||0),0,3),
  completions:clamp(Math.round(Number(value?.completions)||0),0,9999),
  bestStreak:clamp(Math.round(Number(value?.bestStreak)||0),0,9999),
})

export function createJacksGame({
  root,camera,renderer,config,
  onEnter=()=>true,onExit=()=>{},onEvent=()=>{},
  hitExit=()=>false,isActiveMode=()=>false,
}) {
  const group=new THREE.Group();group.name='jacks-game-working-value';root.add(group)
  const [centerX,centerZ]=config.center,floorY=config.floorY
  const stoneCount=config.stoneCount
  const scatterLayout=config.scatterLayout.slice(0,stoneCount)
  if(scatterLayout.length!==stoneCount)throw new Error('Jacks scatterLayout must cover every stone')

  // The visible pieces are deliberately small procedural placeholders. Their count,
  // cloth form and exact colours remain replaceable working values pending user memory.
  const stoneMaterials=[0x77736a,0x8b8172,0x686a64].map(color=>new THREE.MeshStandardMaterial({color,roughness:.92,metalness:0}))
  const stoneGeometry=new THREE.DodecahedronGeometry(config.stoneRadius,1)
  const stones=scatterLayout.map(([x,z],index)=>{
    const mesh=new THREE.Mesh(stoneGeometry,stoneMaterials[index%stoneMaterials.length])
    mesh.name=`jacks-rounded-stone-${index+1}`;mesh.scale.set(1+index%3*.08,.62+(index%2)*.08,.88+(index%4)*.04)
    mesh.rotation.set(.2+index*.31,index*.73,.12+index*.17);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh)
    return {mesh,index,available:true,local:new THREE.Vector2(x,z)}
  })
  const bagMaterial=new THREE.MeshStandardMaterial({color:0x9d5945,roughness:.96,metalness:0})
  const bag=new THREE.Mesh(new THREE.SphereGeometry(config.kingRadius,18,12),bagMaterial)
  bag.name='jacks-cloth-king-working-value';bag.scale.set(1.08,.68,.92);bag.castShadow=true;group.add(bag)
  const knot=new THREE.Mesh(new THREE.ConeGeometry(config.kingRadius*.24,config.kingRadius*.30,10),bagMaterial)
  knot.name='jacks-cloth-king-knot';knot.position.y=config.kingRadius*.72;bag.add(knot)

  const handRoot=new THREE.Group();handRoot.name='jacks-replaceable-hand-proxy';handRoot.visible=false;group.add(handRoot)
  const handOutlineMaterial=new THREE.MeshBasicMaterial({color:0x302c25,transparent:true,opacity:.82,depthWrite:false,toneMapped:false})
  const handFillMaterial=new THREE.MeshBasicMaterial({color:0xfff2cb,transparent:true,opacity:.78,depthWrite:false,toneMapped:false})
  const handOutline=new THREE.Mesh(new THREE.RingGeometry(.036,.052,24),handOutlineMaterial)
  const handFill=new THREE.Mesh(new THREE.CircleGeometry(.034,24),handFillMaterial)
  for(const mesh of [handOutline,handFill]){mesh.rotation.x=-Math.PI/2;mesh.position.y=.002;mesh.renderOrder=5;handRoot.add(mesh)}

  const shadowMaterial=new THREE.MeshBasicMaterial({color:0x3b332b,transparent:true,opacity:.14,depthWrite:false,toneMapped:false})
  const kingShadow=new THREE.Mesh(new THREE.CircleGeometry(config.kingRadius*.9,20),shadowMaterial)
  kingShadow.name='jacks-king-shadow';kingShadow.rotation.x=-Math.PI/2;kingShadow.position.y=floorY+.003;group.add(kingShadow)

  const proxyLayer=config.proxyLayer??10
  const proxyMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false})
  const proxy=new THREE.Mesh(new THREE.CylinderGeometry(config.interactionRadius,config.interactionRadius,.08,20),proxyMaterial)
  proxy.name='jacks-lightweight-entry-proxy';proxy.position.set(centerX,floorY+.04,centerZ);proxy.layers.set(proxyLayer);root.add(proxy)
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();raycaster.layers.set(proxyLayer)

  const storage=getUserDataStore().registerNamespace(STORAGE_NAMESPACE,{
    version:1,defaultValue:{highestStage:0,completions:0,bestStreak:0},validate:validateProgress,
  })
  let progress=storage.get()
  let phase='idle',stage=1,remaining=stoneCount,turn=0,streak=0,failures=0
  let feedback='',failureReason=null,phaseStartedAt=0,gatherDeadline=0,catchDeadline=0,catchFromY=0
  let pointerId=null,selectedIndices=[],handLocal=new THREE.Vector2(),aimOrigin=new THREE.Vector2(),aimMoved=false
  let catchAimOrigin=new THREE.Vector2(),catchMoved=false,catchOnTarget=false
  let entryFromPosition=new THREE.Vector3(),entryFromQuaternion=new THREE.Quaternion()
  const closeupPosition=new THREE.Vector3(centerX,config.cameraEyeY,centerZ+config.cameraSouthOffset)
  const catchTargetLocal=new THREE.Vector2(-config.kingRestOffset[0],config.kingRestOffset[1])
  let postExitUntil=0

  const active=()=>phase!=='idle'
  const requiredCount=()=>Math.min(stage,remaining)
  const setPointer=(clientX,clientY,useCenter=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
    raycaster.near=0;raycaster.far=config.interactionDistance;raycaster.setFromCamera(pointer,camera)
  }
  const hit=(clientX,clientY,useCenter=false)=>{
    if(active())return null
    setPointer(clientX,clientY,useCenter)
    const candidate=raycaster.intersectObject(proxy,false)[0]
    return candidate?{distance:rounded(candidate.distance),point:candidate.point.toArray().map(value=>rounded(value)),target:'jacks'}:null
  }
  const lookAtPlayArea=()=>camera.lookAt(centerX,floorY+.03,centerZ)
  const placeStone=stone=>{
    stone.mesh.position.set(centerX+stone.local.x,floorY+config.stoneRadius*.55,centerZ+stone.local.y)
    stone.mesh.visible=stone.available
  }
  const resetPieces=()=>{
    for(const stone of stones){stone.available=true;placeStone(stone)}
    remaining=stoneCount;turn=0;selectedIndices=[]
    bag.position.set(centerX-config.kingRestOffset[0],floorY+config.kingRadius*.62,centerZ+config.kingRestOffset[1])
    bag.rotation.set(0,0,0)
    kingShadow.position.x=bag.position.x;kingShadow.position.z=bag.position.z;kingShadow.scale.setScalar(1)
    handLocal.set(0,0);aimOrigin.set(0,0);aimMoved=false;catchAimOrigin.set(0,0);catchMoved=false;catchOnTarget=false
    handRoot.position.set(centerX,floorY+.006,centerZ)
  }
  // Idle presentation is also the discoverable scene entry. Place every piece
  // immediately instead of waiting for the first game entry to reset them.
  resetPieces()
  const saveProgress=completedStage=>{
    progress={
      highestStage:Math.max(progress.highestStage,completedStage),
      completions:progress.completions+(completedStage===3?1:0),
      bestStreak:Math.max(progress.bestStreak,streak),
    }
    storage.set(progress)
  }
  const startScatter=(now=performance.now())=>{
    resetPieces();phase='scattering';phaseStartedAt=now;feedback=`撒开石子 · 抓${stage}`;failureReason=null
    onEvent({type:'jacks-scatter',stage,stoneCount});return snapshot()
  }
  const enter=(now=performance.now())=>{
    if(active())return snapshot()
    entryFromPosition.copy(camera.position);entryFromQuaternion.copy(camera.quaternion)
    if(onEnter({center:[centerX,centerZ]})===false)return null
    phase='entering';phaseStartedAt=now;stage=1;streak=0;failures=0;feedback='轻轻撒开石子';failureReason=null;pointerId=null
    resetPieces();handRoot.visible=true
    onEvent({type:'jacks-enter'});return snapshot()
  }
  const interact=(clientX,clientY,useCenter=false)=>hit(clientX,clientY,useCenter)&&enter()?{type:'jacks-enter'}:null
  const beginTurn=(now=performance.now())=>{
    if(phase!=='ready')return false
    phase='tossing';phaseStartedAt=now;gatherDeadline=now+config.gatherTimeoutMs;catchDeadline=0;selectedIndices=[]
    aimOrigin.copy(handLocal);aimMoved=false
    feedback=`子王抛起来了 · 移动光标抓${requiredCount()}`;failureReason=null
    onEvent({type:'jacks-toss',stage,required:requiredCount()});return true
  }
  const setHandLocal=(x,z)=>{
    handLocal.set(clamp(x,-config.playRadius,config.playRadius),clamp(z,-config.playRadius,config.playRadius))
    if(phase==='tossing'&&!aimMoved&&handLocal.distanceToSquared(aimOrigin)>=config.aimMoveThreshold**2){
      aimMoved=true;feedback=`对准石子 · 点击抓${requiredCount()}`
    }
    if(phase==='catching'){
      catchMoved=handLocal.distanceToSquared(catchAimOrigin)>=config.aimMoveThreshold**2
      catchOnTarget=handLocal.distanceToSquared(catchTargetLocal)<=config.catchRadius**2
      feedback=catchMoved&&catchOnTarget?'对准了 · 点击接回子王':'移动光标到子王下方'
    }
    handRoot.position.set(centerX+handLocal.x,floorY+.006,centerZ+handLocal.y);return handLocal.toArray()
  }
  const setHandFromClient=(clientX,clientY)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    return setHandLocal(((clientX-rect.left)/rect.width-.5)*config.playRadius*2,((clientY-rect.top)/rect.height-.56)*config.playRadius*1.55)
  }
  const nearestAvailableIndices=count=>stones.filter(stone=>stone.available).sort((a,b)=>a.local.distanceToSquared(handLocal)-b.local.distanceToSquared(handLocal)).slice(0,count).map(stone=>stone.index)
  const fail=(reason,now=performance.now())=>{
    if(!active()||phase==='failure')return false
    for(const index of selectedIndices){stones[index].available=true;placeStone(stones[index])}
    selectedIndices=[];phase='failure';phaseStartedAt=now;failureReason=reason;failures++;streak=0
    feedback=reason==='disturbed'?'碰动别的石子了':reason==='missed-catch'?'没有接住子王':reason==='timeout'?'子王落下来了':'这一把重来'
    bag.position.y=floorY+config.kingRadius*.62;bag.rotation.set(0,0,0);onEvent({type:'jacks-failure',reason,stage,failures});return true
  }
  const attemptGather=(indices=null,now=performance.now())=>{
    if(phase!=='tossing')return {ok:false,reason:'wrong-phase'}
    if(now>gatherDeadline){fail('timeout',now);return {ok:false,reason:'timeout'}}
    if(indices==null&&!aimMoved){
      feedback='先移动光标，对准石子';onEvent({type:'jacks-gather-not-aimed',stage});return {ok:false,reason:'not-aimed'}
    }
    const required=requiredCount(),chosen=indices??nearestAvailableIndices(required)
    if(chosen.length!==required||new Set(chosen).size!==required||chosen.some(index=>!stones[index]?.available)){
      fail('disturbed',now);return {ok:false,reason:'disturbed'}
    }
    const chosenSet=new Set(chosen)
    const disturbed=stones.some(stone=>stone.available&&!chosenSet.has(stone.index)&&stone.local.distanceTo(handLocal)<config.disturbRadius)
    if(indices==null&&disturbed){fail('disturbed',now);return {ok:false,reason:'disturbed'}}
    selectedIndices=[...chosen]
    for(const index of selectedIndices){stones[index].available=false;stones[index].mesh.visible=false}
    catchFromY=bag.position.y
    phase='catching';phaseStartedAt=now;catchDeadline=now+config.catchTimeoutMs
    catchAimOrigin.copy(handLocal);catchMoved=false;catchOnTarget=false;feedback='移动光标接回子王'
    onEvent({type:'jacks-gather',stage,count:required,indices:[...selectedIndices]})
    return {ok:true,count:required,indices:[...selectedIndices]}
  }
  const catchKing=(now=performance.now(),requireAim=false)=>{
    if(phase!=='catching')return false
    if(now>catchDeadline){fail('missed-catch',now);return false}
    if(requireAim&&(!catchMoved||!catchOnTarget)){
      feedback=catchMoved?'手要移到子王下方':'先移动光标接子王'
      onEvent({type:'jacks-catch-not-aimed',stage,catchMoved,catchOnTarget});return false
    }
    remaining-=selectedIndices.length;turn++;streak++;selectedIndices=[]
    bag.position.y=floorY+config.kingRadius*.62;bag.rotation.set(0,0,0)
    if(remaining<=0){phase='roundComplete';phaseStartedAt=now;feedback=`抓${stage}完成`;saveProgress(stage);onEvent({type:'jacks-stage-complete',stage,streak})}
    else {phase='success';phaseStartedAt=now;feedback=`接住了 · 还剩${remaining}枚`;onEvent({type:'jacks-catch',stage,remaining,streak})}
    return true
  }
  const exit=()=>{
    if(!active())return null
    phase='idle';pointerId=null;selectedIndices=[];handRoot.visible=false;postExitUntil=performance.now()+300
    resetPieces();onExit();onEvent({type:'jacks-exit'});return snapshot()
  }
  const update=(now)=>{
    if(!active())return
    if(phase==='entering'){
      const t=clamp((now-phaseStartedAt)/config.entryDurationMs,0,1),e=easeOutCubic(t)
      camera.position.lerpVectors(entryFromPosition,closeupPosition,e);lookAtPlayArea()
      if(t>=1)startScatter(now)
    }else if(phase==='scattering'){
      const t=clamp((now-phaseStartedAt)/config.scatterDurationMs,0,1)
      stones.forEach((stone,index)=>{placeStone(stone);stone.mesh.position.y+=Math.sin(Math.PI*t)*(.05+.012*(index%3))})
      bag.position.y=floorY+config.kingRadius*.62
      if(t>=1){phase='ready';phaseStartedAt=now;feedback=`抓${stage} · 点击抛起子王`}
    }else if(phase==='tossing'){
      const t=clamp((now-phaseStartedAt)/config.tossFlightMs,0,1)
      bag.position.y=floorY+config.kingRadius*.62+Math.sin(Math.PI*t)*config.tossHeight
      bag.rotation.y=t*Math.PI*1.4;bag.rotation.z=Math.sin(Math.PI*t)*.28
      kingShadow.scale.setScalar(1-.38*Math.sin(Math.PI*t))
      if(now>gatherDeadline)fail('timeout',now)
    }else if(phase==='catching'){
      const t=clamp((now-phaseStartedAt)/config.catchTimeoutMs,0,1)
      bag.position.y=THREE.MathUtils.lerp(catchFromY,floorY+config.kingRadius*.62,t*t)
      if(now>catchDeadline)fail('missed-catch',now)
    }else if(phase==='success'&&now-phaseStartedAt>=config.feedbackDurationMs){phase='ready';phaseStartedAt=now;feedback=`抓${stage} · 再来一把`}
    else if(phase==='failure'&&now-phaseStartedAt>=config.failureDurationMs){phase='ready';phaseStartedAt=now;feedback=`抓${stage} · 重新来`;failureReason=null}
    else if(phase==='roundComplete'&&now-phaseStartedAt>=config.roundPauseMs){
      if(stage>=3){phase='gameComplete';phaseStartedAt=now;feedback='一、二、三都抓完了 · 点击退出';onEvent({type:'jacks-complete',streak,failures})}
      else {stage++;startScatter(now)}
    }
  }
  const pointerDown=event=>{
    if(!active()||event.button!==0)return false
    if(hitExit(event.clientX,event.clientY)){exit();return true}
    setHandFromClient(event.clientX,event.clientY)
    if(phase==='catching'){catchKing(performance.now(),true);return true}
    if(phase==='tossing'){attemptGather();return true}
    if(phase==='gameComplete'){exit();return true}
    if(phase!=='ready')return true
    beginTurn();pointerId=null
    return true
  }
  const pointerMove=event=>{
    if(!active())return false
    if(phase==='ready'||phase==='tossing'||phase==='catching')setHandFromClient(event.clientX,event.clientY)
    return true
  }
  const pointerUp=event=>{
    if(!active()||event.button!==0)return false
    pointerId=null;return true
  }
  const pointerCancel=event=>{
    if(!active())return false
    pointerId=null;return true
  }
  const pauseInput=()=>{pointerId=null;return true}
  const resumeAfterPause=durationMs=>{
    const delta=Math.max(0,durationMs||0)
    phaseStartedAt+=delta;gatherDeadline+=delta;catchDeadline+=delta
    return true
  }
  renderer.domElement.addEventListener('pointerdown',event=>{if(isActiveMode()&&pointerDown(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointermove',event=>{if(isActiveMode()&&pointerMove(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointerup',event=>{if(isActiveMode()&&pointerUp(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointercancel',event=>{if(isActiveMode()&&pointerCancel(event)){event.preventDefault();event.stopPropagation()}})

  const settle=()=>{
    let guard=0
    while(guard++<8&&active()&&!['ready','gameComplete','failure'].includes(phase)){
      if(phase==='entering')update(phaseStartedAt+config.entryDurationMs+1)
      else if(phase==='scattering')update(phaseStartedAt+config.scatterDurationMs+1)
      else if(phase==='success')update(phaseStartedAt+config.feedbackDurationMs+1)
      else if(phase==='roundComplete')update(phaseStartedAt+config.roundPauseMs+1)
      else break
    }
    return snapshot()
  }
  const hudState=()=>({visible:active(),phase,stage,required:requiredCount(),remaining,turn,streak,failures,feedback,failureReason,complete:phase==='gameComplete'})
  const snapshot=()=>({
    status:active()?'active':'idle',phase,stage,required:requiredCount(),remaining,turn,streak,failures,feedback,failureReason,
    center:[centerX,floorY,centerZ],stoneCount,available:stones.filter(stone=>stone.available).map(stone=>stone.index),selected:[...selectedIndices],
    hand:handLocal.toArray().map(value=>rounded(value)),aimMoved,catchMoved,catchOnTarget,
    catchTarget:catchTargetLocal.toArray().map(value=>rounded(value)),kingY:rounded(bag.position.y),proxyLayer,progress:{...progress},
    camera:camera.position.toArray().map(value=>rounded(value)),drawObjects:stones.length+5,recursiveSceneQueries:0,
  })
  return {hit,interact,enter,exit,update,settle,hudState,snapshot,startScatter,beginTurn,setHandLocal,attemptGather,catchKing,pointerDown,pointerMove,pointerUp,pointerCancel,pauseInput,resumeAfterPause,consumePostExitClick:()=>performance.now()<=postExitUntil}
}

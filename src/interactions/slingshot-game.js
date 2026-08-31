import * as THREE from 'three'
import {createSlingshotElasticRig} from './slingshot-elastic-rig.js'

const clamp=THREE.MathUtils.clamp
const rounded=(value,digits=4)=>+value.toFixed(digits)
const wrapAngle=value=>Math.atan2(Math.sin(value),Math.cos(value))

export function aimAnglesToward(from,target) {
  const dx=target.x-from.x,dy=target.y-from.y,dz=target.z-from.z
  const horizontal=Math.hypot(dx,dz)
  return {yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,horizontal)}
}

// 将晃动作为角度误差加入发射方向；误差会随飞行距离自然放大，
// 而不是在弹丸起点附加一个固定的左右／上下位移。
export function shotDirectionFromAim(yaw,pitch,offsetYaw=0,offsetPitch=0,target=new THREE.Vector3()) {
  return target.set(0,0,-1).applyEuler(new THREE.Euler(pitch+offsetPitch,yaw+offsetYaw,0,'YXZ')).normalize()
}

export function segmentIntersectsBox(from,to,bounds,ray=new THREE.Ray(),direction=new THREE.Vector3(),point=new THREE.Vector3()) {
  direction.subVectors(to,from)
  const length=direction.length();if(length<=1e-7)return bounds.containsPoint(to)
  ray.set(from,direction.multiplyScalar(1/length))
  const intersection=ray.intersectBox(bounds,point)
  return Boolean(intersection&&intersection.distanceToSquared(from)<=length*length+1e-8)
}

export function bounceVariation(sequence,bounce,maxDirectionRadians=THREE.MathUtils.degToRad(14),verticalVariation=.16) {
  const sample=offset=>{
    const value=Math.sin((sequence*127.1+bounce*311.7+offset)*43758.5453)
    return (value-Math.floor(value))*2-1
  }
  return {directionRadians:sample(1.37)*maxDirectionRadians,verticalScale:1+sample(4.91)*verticalVariation}
}

export function applyGroundBounce(velocity,restitution=.42,friction=.72,directionRadians=0,verticalScale=1) {
  const impactSpeed=Math.max(0,-velocity.y)
  const horizontalSpeed=Math.hypot(velocity.x,velocity.z)*friction
  const heading=Math.atan2(velocity.x,velocity.z)+directionRadians
  velocity.x=Math.sin(heading)*horizontalSpeed;velocity.z=Math.cos(heading)*horizontalSpeed
  velocity.y=impactSpeed*restitution*verticalScale
  return impactSpeed
}

export function createSlingshotGame({
  scene,camera,renderer,config,parts,
  isActiveMode=()=>false,onEnter=()=>true,onExit=()=>{},onEvent=()=>{},
}) {
  const game=config.game
  if(!game)throw new Error('Slingshot game config is required')
  const root=new THREE.Group();root.name='slingshot-game-runtime';scene.add(root)
  const proxyMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false})
  const slingshotProxies=config.slingshots.map(item=>{
    const size=item.interactionProxySize??[.24,.18,.26],offset=item.interactionProxyOffset??[0,.09,0]
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(...size),proxyMaterial)
    proxy.name=`slingshot-${item.id}-interaction-proxy`;proxy.position.set(item.center[0]+offset[0],item.center[1]+offset[1],item.center[2]+offset[2])
    proxy.layers.set(game.proxyLayer);proxy.userData.entryType='slingshot';proxy.userData.slingshotId=item.id;root.add(proxy);return proxy
  })
  const firingLineProxies=config.firingLines.map(line=>{
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(line.width,.16,Math.max(.5,line.depth)),proxyMaterial)
    proxy.name=`slingshot-${line.id}-entry-proxy`;proxy.position.set(line.center[0],config.surfaceY+.08,line.center[1]);proxy.rotation.y=line.rotationY??0
    proxy.layers.set(game.proxyLayer);proxy.userData.entryType='firing-line';proxy.userData.distance=line.distance;root.add(proxy);return proxy
  })
  const proxies=[...slingshotProxies,...firingLineProxies]
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();raycaster.layers.set(game.proxyLayer)

  const heldRoot=new THREE.Group();heldRoot.name='slingshot-held-view-root';heldRoot.visible=false
  root.add(heldRoot)
  const heldViewOffset=new THREE.Vector3(...game.held.position)
  let heldModel=null,elasticRig=null

  const projectileGeometry=new THREE.SphereGeometry(game.projectileRadius,10,7)
  const projectileMaterial=new THREE.MeshStandardMaterial({
    name:'slingshot-soft-clay-pellet',color:0xd2b98f,roughness:.92,metalness:0,
    emissive:0x4a3925,emissiveIntensity:.28,
  })
  const projectiles=Array.from({length:game.projectilePoolSize},(_,index)=>{
    const mesh=new THREE.Mesh(projectileGeometry,projectileMaterial);mesh.name=`slingshot-projectile-${index+1}`;mesh.visible=false;mesh.castShadow=false;root.add(mesh)
    return {mesh,active:false,velocity:new THREE.Vector3(),previous:new THREE.Vector3(),age:0,sequence:0,bounces:0}
  })
  let projectileSequence=0,accumulator=0

  const hangingStates=parts.hangingTargets.map(target=>({
    ...target,angleX:0,angleZ:0,velocityX:0,velocityZ:0,
  }))
  const looseStates=parts.looseBlocks.map(target=>({
    ...target,velocity:new THREE.Vector3(),angularVelocity:new THREE.Vector3(),active:false,
  }))
  const targetBounds=new THREE.Box3(),expandedBounds=new THREE.Box3()
  const collisionRay=new THREE.Ray(),collisionDirection=new THREE.Vector3(),collisionPoint=new THREE.Vector3()
  const tempVector=new THREE.Vector3(),tempVector2=new THREE.Vector3()
  const localAimQuaternion=new THREE.Quaternion(),localAimEuler=new THREE.Euler(0,0,0,'YXZ')
  const shotDirection=new THREE.Vector3(),shotOrigin=new THREE.Vector3()
  const platform=parts.stonePlatform

  let phase='idle',selectedId=game.defaultSlingshot,distance=game.defaultDistance
  let baseYaw=0,pointerId=null,nextChargeAt=0,shots=0,hits=0,lastHit=null
  let appliedAimYaw=0,appliedAimPitch=0

  const active=()=>phase!=='idle'
  const stationFor=value=>config.firingLines.find(line=>line.distance===value)??config.firingLines.at(-1)
  const groundAt=(x,z)=>{
    const halfX=platform.topSize[0]/2+.03,halfZ=platform.topSize[2]/2+.03
    return Math.abs(x-platform.center[0])<=halfX&&Math.abs(z-platform.center[1])<=halfZ?platform.topY:config.surfaceY
  }
  const setRay=(clientX,clientY,useCenter=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
    raycaster.near=0;raycaster.far=game.interactionDistance;raycaster.setFromCamera(pointer,camera)
  }
  const hit=(clientX,clientY,useCenter=false)=>{
    if(active())return null
    setRay(clientX,clientY,useCenter)
    const candidate=raycaster.intersectObjects(proxies,false)[0]
    if(!candidate)return null
    return {
      type:candidate.object.userData.entryType,
      id:candidate.object.userData.slingshotId??selectedId,
      stationDistance:candidate.object.userData.distance??game.defaultDistance,
      hitDistance:candidate.distance,
      point:candidate.point.toArray(),
      proxyName:candidate.object.name,
    }
  }

  const resetTargets=()=>{
    for(const state of hangingStates){state.angleX=state.angleZ=state.velocityX=state.velocityZ=0;state.pivot.rotation.set(0,0,0)}
    for(const state of looseStates){state.active=false;state.velocity.set(0,0,0);state.angularVelocity.set(0,0,0);state.mesh.position.copy(state.restPosition);state.mesh.quaternion.copy(state.restQuaternion)}
    lastHit=null
  }
  const resetProjectiles=()=>{
    for(const projectile of projectiles){projectile.active=false;projectile.mesh.visible=false;projectile.velocity.set(0,0,0);projectile.age=0;projectile.bounces=0}
  }
  const restoreWorldModels=()=>{for(const model of parts.worldModels.values())model.visible=true}

  const configureHeldModel=id=>{
    elasticRig?.dispose();elasticRig=null
    if(heldModel){heldRoot.remove(heldModel);heldModel=null}
    heldModel=parts.createHeldModel(id)
    if(!heldModel)return false
    heldRoot.add(heldModel)
    const heldConfig=game.held[id],elastic=game.elastic,profile=game.profiles[id]
    elasticRig=createSlingshotElasticRig({
      parent:heldRoot,
      config:{
        leftAnchor:heldConfig.leftAnchor,rightAnchor:heldConfig.rightAnchor,restPouchCenter:heldConfig.restPouchCenter,
        pouchSize:heldConfig.pouchSize,pullAxis:[0,0,1],maxPull:elastic.maxPull,chargeSeconds:elastic.chargeSeconds,
        anchorEmbed:heldConfig.anchorEmbed,bindingRadius:heldConfig.bindingRadius,restBandSag:heldConfig.restBandSag,
        pouchCupDepth:heldConfig.pouchCupDepth,drawPouchY:heldConfig.drawPouchY,
        visualPullScale:heldConfig.visualPullScale,drawBandWidthScale:heldConfig.drawBandWidthScale,
        perspectiveOriginY:-game.held.position[1],perspectiveOriginZ:-game.held.position[2],
        leftBindingCenter:heldConfig.leftBindingCenter,rightBindingCenter:heldConfig.rightBindingCenter,
        bindingTiltRadians:THREE.MathUtils.degToRad(heldConfig.bindingTiltDegrees),
        maxHoldSteadySeconds:elastic.maxHoldSteadySeconds,tremorRampSeconds:elastic.tremorRampSeconds,
        maxTremorRadians:THREE.MathUtils.degToRad(profile.maxTremorDegrees),
        chargeSwayRadians:THREE.MathUtils.degToRad(profile.chargeSwayDegrees),chargeSwayRampSeconds:elastic.chargeSwayRampSeconds,
        spring:elastic.spring,damping:elastic.damping,settleDamping:elastic.settleDamping,settleAfterSeconds:elastic.settleAfterSeconds,
        forwardHoldSeconds:elastic.forwardHoldSeconds,
        forkDipAttack:elastic.forkDipAttack,forkDipDuration:elastic.forkDipDuration,maxForkDip:elastic.maxForkDip,
        maxForkPitchRadians:THREE.MathUtils.degToRad(elastic.maxForkPitchDegrees),
        pouchCenterAttack:elastic.pouchCenterAttack,pouchCenterHold:elastic.pouchCenterHold,pouchDropDuration:elastic.pouchDropDuration,
        minLaunchSpeed:profile.minLaunchSpeed,maxLaunchSpeed:profile.maxLaunchSpeed,
      },
      onEvent:event=>onEvent(event),
    })
    restoreWorldModels();const worldModel=parts.worldModels.get(id);if(active()&&worldModel)worldModel.visible=false
    selectedId=id;return true
  }
  const setStation=value=>{
    const station=stationFor(value);if(!station)return false
    distance=station.distance
    camera.position.set(station.center[0],config.surfaceY+game.eyeHeight,station.center[1])
    const target={x:config.shootingTarget[0],y:game.targetHeight,z:config.shootingTarget[1]}
    const aim=aimAnglesToward(camera.position,target)
    camera.rotation.set(aim.pitch,aim.yaw,0,'YXZ')
    appliedAimYaw=appliedAimPitch=0;baseYaw=aim.yaw;return true
  }
  const chooseStation=value=>{
    if(!setStation(value))return false
    onEvent({type:'slingshot-distance',distance});return true
  }
  const toggleStation=()=>chooseStation(distance===5?10:5)
  const select=id=>{
    if(!config.slingshots.some(item=>item.id===id)||id===selectedId)return false
    const changed=configureHeldModel(id);if(changed){elasticRig.reset();phase='ready';onEvent({type:'slingshot-select',id})}return changed
  }

  const enter=(id=selectedId,stationDistance=game.defaultDistance)=>{
    if(active())return snapshot()
    const requestedStation=stationFor(stationDistance)
    if(onEnter({id,distance:requestedStation.distance})===false)return null
    phase='ready';shots=0;hits=0;accumulator=0;nextChargeAt=0;pointerId=null
    resetProjectiles();resetTargets();heldRoot.visible=true
    configureHeldModel(id);setStation(requestedStation.distance)
    onEvent({type:'slingshot-enter',id:selectedId,distance});return snapshot()
  }
  const interact=(clientX,clientY,useCenter=false)=>{
    const candidate=hit(clientX,clientY,useCenter)
    return candidate&&enter(candidate.id,candidate.stationDistance)?{
      type:'slingshot-enter',id:candidate.id,distance:candidate.stationDistance,entryType:candidate.type,
    }:null
  }
  const exit=()=>{
    if(!active())return null
    phase='idle';pointerId=null;heldRoot.visible=false;heldRoot.rotation.set(0,0,0)
    elasticRig?.reset();resetProjectiles();resetTargets();restoreWorldModels();onExit();onEvent({type:'slingshot-exit'});return snapshot()
  }

  const beginCharge=()=>{
    if(phase!=='ready'||performance.now()<nextChargeAt||!elasticRig)return false
    if(!elasticRig.beginCharge())return false
    phase='charging';onEvent({type:'slingshot-game-charge-start',id:selectedId,distance});return true
  }
  const launchProjectile=result=>{
    let projectile=projectiles.find(item=>!item.active)
    if(!projectile)projectile=projectiles.reduce((oldest,item)=>item.sequence<oldest.sequence?item:oldest,projectiles[0])
    elasticRig.pouch.getWorldPosition(shotOrigin)
    // 相机当前已包含可见晃动。还原基础瞄准角后，再明确叠加释放瞬间
    // 记录的水平角／俯仰角误差，确保偏差进入弹道且不会重复计算。
    shotDirectionFromAim(
      camera.rotation.y-appliedAimYaw,camera.rotation.x-appliedAimPitch,
      result.tremorYaw,result.tremorPitch,shotDirection,
    )
    projectile.active=true;projectile.mesh.visible=true;projectile.mesh.position.copy(shotOrigin)
    projectile.velocity.copy(shotDirection).multiplyScalar(result.launchSpeed);projectile.age=0;projectile.bounces=0;projectile.sequence=++projectileSequence
    shots++;onEvent({type:'slingshot-shot',id:selectedId,distance,speed:result.launchSpeed,pullRatio:result.pullRatio,tremorIntensity:result.tremorIntensity})
  }
  const releaseCharge=()=>{
    if(phase!=='charging'||!elasticRig)return null
    const result=elasticRig.release();phase='ready';pointerId=null;nextChargeAt=performance.now()+180
    if(result)launchProjectile(result);return result
  }
  const cancelCharge=()=>{if(phase==='charging'){elasticRig.reset();phase='ready';pointerId=null;heldRoot.rotation.set(0,0,0);return true}return false}

  const impactHanging=(state,projectile)=>{
    const speed=projectile.velocity.length(),directionZ=Math.sign(projectile.velocity.z)||1
    state.velocityX-=directionZ*clamp(speed*.075,.35,1.45)
    const worldCenter=state.mesh.getWorldPosition(tempVector)
    state.velocityZ+=clamp(-projectile.velocity.x*.055+(projectile.mesh.position.x-worldCenter.x)*speed*1.8,-.8,.8)
    hits++;lastHit=state.id;onEvent({type:'slingshot-hit',target:state.id,targetType:'hanging',speed})
  }
  const impactLoose=(state,projectile)=>{
    const speed=projectile.velocity.length()
    state.active=true;state.velocity.addScaledVector(projectile.velocity,.075);state.velocity.y=Math.max(state.velocity.y,.38+speed*.018)
    state.angularVelocity.set((Math.random()-.5)*6,(Math.random()-.5)*4,(Math.random()-.5)*6)
    hits++;lastHit=state.id;onEvent({type:'slingshot-hit',target:state.id,targetType:'standing',speed})
  }
  const segmentHitsBounds=(from,to,bounds)=>{
    return segmentIntersectsBox(from,to,bounds,collisionRay,collisionDirection,collisionPoint)
  }
  const hitTargets=(projectile,previous)=>{
    for(const state of hangingStates){
      targetBounds.setFromObject(state.mesh);expandedBounds.copy(targetBounds).expandByScalar(game.projectileRadius)
      if(segmentHitsBounds(previous,projectile.mesh.position,expandedBounds)){impactHanging(state,projectile);return true}
    }
    for(const state of looseStates){
      targetBounds.setFromObject(state.mesh);expandedBounds.copy(targetBounds).expandByScalar(game.projectileRadius)
      if(segmentHitsBounds(previous,projectile.mesh.position,expandedBounds)){impactLoose(state,projectile);return true}
    }
    return false
  }
  const deactivate=(projectile,miss=false,reason='settled')=>{
    if(!projectile.active)return
    const sequence=projectile.sequence,bounces=projectile.bounces
    projectile.active=false;projectile.mesh.visible=false;projectile.velocity.set(0,0,0)
    if(miss)onEvent({type:'slingshot-miss',sequence,bounces,reason,id:selectedId,distance})
  }
  const stepProjectile=(projectile,dt)=>{
    projectile.previous.copy(projectile.mesh.position)
    projectile.age+=dt;projectile.velocity.y-=game.gravity*dt;projectile.mesh.position.addScaledVector(projectile.velocity,dt)
    const position=projectile.mesh.position,targetZ=config.shootingTarget[1],backZ=stationFor(game.defaultDistance).center[1]-game.safeLaneBackMargin
    if(hitTargets(projectile,projectile.previous)){deactivate(projectile,false,'hit');return}
    const floor=groundAt(position.x,position.z)+game.projectileRadius
    if(position.y<=floor){
      const impactSpeed=Math.max(0,-projectile.velocity.y)
      if(projectile.bounces<game.projectileMaxBounces&&impactSpeed>=game.projectileMinBounceSpeed){
        const nextBounce=projectile.bounces+1
        const variation=bounceVariation(projectile.sequence,nextBounce,THREE.MathUtils.degToRad(game.projectileBounceDirectionDegrees),game.projectileBounceVerticalVariation)
        position.y=floor;applyGroundBounce(projectile.velocity,game.projectileRestitution,game.projectileGroundFriction,variation.directionRadians,variation.verticalScale);projectile.bounces=nextBounce
        onEvent({type:'slingshot-projectile-bounce',bounce:projectile.bounces,speed:impactSpeed,directionRadians:variation.directionRadians,verticalScale:variation.verticalScale})
      }else {deactivate(projectile,true,'settled');return}
    }
    if(projectile.age>game.projectileLifetime||Math.abs(position.x-config.shootingTarget[0])>game.safeLaneHalfWidth||
      position.z<backZ||position.z>targetZ+game.safeLaneEndMargin||position.y>4.2)deactivate(projectile,true,'out')
  }
  const stepTargets=dt=>{
    for(const state of hangingStates){
      const frequency=game.gravity/Math.max(state.length,.2)
      state.velocityX+=(-frequency*Math.sin(state.angleX)-game.hangingDampingX*state.velocityX)*dt
      state.velocityZ+=(-frequency*Math.sin(state.angleZ)-game.hangingDampingZ*state.velocityZ)*dt
      state.angleX+=state.velocityX*dt;state.angleZ+=state.velocityZ*dt
      state.pivot.rotation.x=state.angleX;state.pivot.rotation.z=state.angleZ
    }
    for(const state of looseStates){
      if(!state.active)continue
      state.velocity.y-=game.gravity*dt;state.mesh.position.addScaledVector(state.velocity,dt)
      state.mesh.rotation.x+=state.angularVelocity.x*dt;state.mesh.rotation.y+=state.angularVelocity.y*dt;state.mesh.rotation.z+=state.angularVelocity.z*dt
      const floor=groundAt(state.mesh.position.x,state.mesh.position.z),half=Math.max(...state.size)/2
      if(state.mesh.position.y-half<=floor){
        state.mesh.position.y=floor+half
        if(state.velocity.y<0)state.velocity.y*=-.18
        state.velocity.x*=.78;state.velocity.z*=.78;state.angularVelocity.multiplyScalar(.82)
        if(state.velocity.lengthSq()<.003&&state.angularVelocity.lengthSq()<.02){state.velocity.set(0,0,0);state.angularVelocity.set(0,0,0);state.active=false}
      }
    }
  }
  const clampAim=()=>{
    camera.rotation.order='YXZ'
    const yawDelta=clamp(wrapAngle(camera.rotation.y-baseYaw),-THREE.MathUtils.degToRad(game.aimYawDegrees),THREE.MathUtils.degToRad(game.aimYawDegrees))
    camera.rotation.y=baseYaw+yawDelta
    camera.rotation.x=clamp(camera.rotation.x,THREE.MathUtils.degToRad(game.aimPitchMinDegrees),THREE.MathUtils.degToRad(game.aimPitchMaxDegrees))
    camera.rotation.z=0
  }
  const syncHeldTransform=()=>{
    const elasticState=elasticRig?.snapshot(),dip=elasticState?.forkDip??0,forkPitch=elasticState?.forkPitch??0
    localAimEuler.set(forkPitch,0,0);localAimQuaternion.setFromEuler(localAimEuler)
    heldRoot.position.copy(heldViewOffset).add(tempVector.set(0,-dip,0)).applyQuaternion(camera.quaternion).add(camera.position)
    heldRoot.quaternion.copy(camera.quaternion).multiply(localAimQuaternion)
  }
  const update=(dt)=>{
    if(!active())return
    camera.rotation.order='YXZ';camera.rotation.y-=appliedAimYaw;camera.rotation.x-=appliedAimPitch
    appliedAimYaw=appliedAimPitch=0;clampAim();elasticRig?.update(dt)
    const aimOffset=elasticRig?.snapshot().aimOffset
    appliedAimYaw=aimOffset?.yaw??0;appliedAimPitch=aimOffset?.pitch??0
    camera.rotation.y+=appliedAimYaw;camera.rotation.x+=appliedAimPitch
    syncHeldTransform()
    accumulator=Math.min(accumulator+dt,game.fixedStep*game.maxSubsteps)
    while(accumulator>=game.fixedStep){for(const projectile of projectiles)if(projectile.active)stepProjectile(projectile,game.fixedStep);stepTargets(game.fixedStep);accumulator-=game.fixedStep}
  }
  const testFireAt=(targetId='red-flat-bar')=>{
    if(!active()||!elasticRig)return null
    const target=[...hangingStates,...looseStates].find(item=>item.id===targetId);if(!target)return null
    setStation(5);syncHeldTransform();elasticRig.pouch.getWorldPosition(shotOrigin);target.mesh.getWorldPosition(tempVector)
    const horizontal=Math.hypot(tempVector.x-shotOrigin.x,tempVector.z-shotOrigin.z),time=horizontal/game.profiles[selectedId].maxLaunchSpeed
    tempVector2.copy(tempVector);tempVector2.y+=.5*game.gravity*time*time
    camera.lookAt(tempVector2);camera.rotation.order='YXZ';baseYaw=camera.rotation.y;syncHeldTransform()
    elasticRig.beginCharge();elasticRig.setPullRatio(1);phase='charging'
    return releaseCharge()
  }

  const pointerDown=event=>{
    if(!active()||event.button!==0)return false
    if(!beginCharge())return phase==='charging'
    pointerId=event.pointerId;renderer.domElement.setPointerCapture?.(event.pointerId);return true
  }
  const pointerUp=event=>{
    if(!active()||event.button!==0||pointerId!=null&&event.pointerId!==pointerId)return false
    if(renderer.domElement.hasPointerCapture?.(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId)
    if(phase==='charging')releaseCharge();pointerId=null;return true
  }
  const pointerCancel=event=>{
    if(!active()||pointerId!=null&&event.pointerId!==pointerId)return false
    cancelCharge();pointerId=null;return true
  }
  const handleKey=(code,down=true,repeat=false)=>{
    if(!active())return false
    if(down&&!repeat&&code==='Digit1'){select('wood');return true}
    if(down&&!repeat&&code==='Digit2'){select('wire');return true}
    if(down&&!repeat&&code==='Digit5'){chooseStation(5);return true}
    if(down&&!repeat&&code==='Digit0'){chooseStation(10);return true}
    if(down&&!repeat&&(code==='KeyW'||code==='ArrowUp')){chooseStation(5);return true}
    if(down&&!repeat&&(code==='KeyS'||code==='ArrowDown')){chooseStation(10);return true}
    if(down&&!repeat&&code==='KeyR'){resetTargets();return true}
    if(code==='Space'){if(down&&!repeat)beginCharge();else if(!down&&phase==='charging')releaseCharge();return true}
    return false
  }
  renderer.domElement.addEventListener('pointerdown',event=>{if(isActiveMode()&&pointerDown(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointerup',event=>{if(isActiveMode()&&pointerUp(event)){event.preventDefault();event.stopPropagation()}})
  renderer.domElement.addEventListener('pointercancel',event=>{if(isActiveMode()&&pointerCancel(event)){event.preventDefault();event.stopPropagation()}})

  const snapshot=()=>({
    status:active()?'active':'idle',phase,selectedId,distance,shots,hits,lastHit,
    performance:{...game.profiles[selectedId]},
    charging:elasticRig?.snapshot()??null,
    projectiles:projectiles.filter(item=>item.active).map(item=>({position:item.mesh.position.toArray().map(value=>rounded(value)),velocity:item.velocity.toArray().map(value=>rounded(value)),age:rounded(item.age)})),
    targets:{hanging:hangingStates.map(state=>({id:state.id,angleX:rounded(state.angleX),angleZ:rounded(state.angleZ)})),standing:looseStates.map(state=>({id:state.id,active:state.active,position:state.mesh.position.toArray().map(value=>rounded(value))}))},
    policy:{powerMeter:false,dragToShoot:false,chargeSeconds:game.elastic.chargeSeconds,maxHoldSteadySeconds:game.elastic.maxHoldSteadySeconds,safeLaneHalfWidth:game.safeLaneHalfWidth,fixedStep:game.fixedStep,maxSubsteps:game.maxSubsteps},
  })
  const pauseInput=()=>{cancelCharge();pointerId=null;return true}
  const resumeAfterPause=durationMs=>{nextChargeAt+=Math.max(0,durationMs||0);return true}
  return {root,hit,interact,enter,exit,update,handleKey,pointerDown,pointerUp,pointerCancel,beginCharge,releaseCharge,cancelCharge,pauseInput,resumeAfterPause,select,setStation,toggleStation,resetTargets,testFireAt,snapshot}
}

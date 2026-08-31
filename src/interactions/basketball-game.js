import * as THREE from 'three'

const GRAVITY=9.81
const FIXED_STEP=1/120
const MAX_SUBSTEPS=8
const UP=new THREE.Vector3(0,1,0)

const rounded=(value,digits=4)=>+value.toFixed(digits)
const roundedArray=(values,digits=4)=>values.map(value=>rounded(value,digits))

export function createBasketballGame({
  root,camera,renderer,items,config,hoop,colliders,player,
  groundHeightAt,surfaceKindAt,isWalkMode,isTouchMode,canCharge,onEvent,shadowDirection,
}) {
  const group=new THREE.Group();group.name='basketball-game-runtime';root.add(group)
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2()
  const tempA=new THREE.Vector3(),tempB=new THREE.Vector3(),tempC=new THREE.Vector3(),tempD=new THREE.Vector3()
  const heldTilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/5)
  const hoopCenter=new THREE.Vector3(hoop.center[0],hoop.surfaceY,hoop.center[1])
  const hoopRotation=THREE.MathUtils.degToRad(hoop.rotationY??0),hoopCos=Math.cos(hoopRotation),hoopSin=Math.sin(hoopRotation)
  const worldFromHoopLocal=([x,y,z])=>new THREE.Vector3(
    hoopCenter.x+x*hoopCos+z*hoopSin,
    hoopCenter.y+y,
    hoopCenter.z-x*hoopSin+z*hoopCos,
  )
  const rimCenter=worldFromHoopLocal(hoop.rimCenterLocal)
  const clearScoreRadius=hoop.rimInnerDiameter/2-config.radius+(config.interaction.scoreTolerance??.015)
  const shadowRay=(shadowDirection?.clone()??new THREE.Vector3(.24,-.94,.18)).normalize()
  if(shadowRay.y>-.15)shadowRay.set(.24,-.94,.18).normalize()
  const shadowAngle=Math.atan2(shadowRay.z,shadowRay.x)
  const shadowGeometry=new THREE.CircleGeometry(1,28)
  shadowGeometry.rotateX(-Math.PI/2)
  const makeShadowMaterial=()=>new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,
    uniforms:{opacity:{value:.32}},
    vertexShader:`varying vec2 shadowUv;void main(){shadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 shadowUv;uniform float opacity;void main(){float radius=length(shadowUv-vec2(.5))*2.0;float alpha=(1.0-smoothstep(.72,1.0,radius))*opacity;if(alpha<.003)discard;gl_FragColor=vec4(.055,.06,.065,alpha);}`,
  })
  const court=hoop.court
  const threePointDistance=Math.max(0,config.interaction.threePointDistance??court?.threePointRadius??6.25)
  const fourPointDistance=Math.max(threePointDistance+.01,config.interaction.fourPointDistance??9)
  const pointsForDistance=distance=>distance>=fourPointDistance?4:distance>=threePointDistance?3:2
  const courtVertices=[],courtIndices=[]
  const courtPoint=(u,v)=>worldFromHoopLocal([u,.009,-v])
  const addCourtStripe=(a,b,width=court.paintWidth)=>{
    const dx=b[0]-a[0],dv=b[1]-a[1],length=Math.hypot(dx,dv)||1,ou=-dv/length*width/2,ov=dx/length*width/2
    const start=courtVertices.length/3
    for(const [u,v] of [[a[0]+ou,a[1]+ov],[a[0]-ou,a[1]-ov],[b[0]-ou,b[1]-ov],[b[0]+ou,b[1]+ov]])courtVertices.push(...courtPoint(u,v).toArray())
    courtIndices.push(start,start+1,start+2,start,start+2,start+3)
  }
  const addCourtArc=(center,radius,start,end,segments=40)=>{
    let previous=[center[0]+Math.cos(start)*radius,center[1]+Math.sin(start)*radius]
    for(let index=1;index<=segments;index++) {
      const angle=THREE.MathUtils.lerp(start,end,index/segments),next=[center[0]+Math.cos(angle)*radius,center[1]+Math.sin(angle)*radius]
      addCourtStripe(previous,next);previous=next
    }
  }
  if(court) {
    const half=court.width/2,base=court.baselineForward,end=base+court.length,lane=court.laneWidth/2,free=base+court.freeThrowDistance
    addCourtStripe([-half,base],[half,base]);addCourtStripe([-half,base],[-half,end]);addCourtStripe([half,base],[half,end]);addCourtStripe([-half,end],[half,end])
    addCourtStripe([-lane,base],[-lane,free]);addCourtStripe([lane,base],[lane,free]);addCourtStripe([-lane,free],[lane,free]);addCourtArc([0,free],lane,0,Math.PI*2,44)
    addCourtArc([0,end],court.centerCircleRadius,Math.PI,Math.PI*2,28)
    const rimForward=-hoop.rimCenterLocal[2],join=Math.acos(Math.min(1,(half-.28)/court.threePointRadius))
    addCourtArc([0,rimForward],court.threePointRadius,join,Math.PI-join,42)
    const joinV=rimForward+Math.sin(join)*court.threePointRadius
    addCourtStripe([-half+.28,base],[-half+.28,joinV]);addCourtStripe([half-.28,base],[half-.28,joinV])
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(courtVertices,3));geometry.setIndex(courtIndices);geometry.computeVertexNormals()
    const material=new THREE.MeshBasicMaterial({color:0xe7e0c9,transparent:true,opacity:.68,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})
    const markings=new THREE.Mesh(geometry,material);markings.name='basketball-half-court-markings';markings.renderOrder=2;group.add(markings)
  }
  const runtimeItems=items.map(item=>{
    const shadow=new THREE.Mesh(shadowGeometry,makeShadowMaterial())
    shadow.name=`${item.id}-projected-shadow`;shadow.rotation.y=shadowAngle;shadow.renderOrder=3;group.add(shadow)
    return {
      ...item,status:'resting',sleeping:true,velocity:new THREE.Vector3(),angularVelocity:new THREE.Vector3(),
      sleepTime:0,age:0,shot:null,wasAboveRim:false,scoredShotId:null,lastGround:hoop.surfaceY,
      initialQuaternion:item.model.quaternion.clone(),shadow,shadowLastPosition:new THREE.Vector3(Infinity,Infinity,Infinity),
    }
  })
  const chargeDecisionRatio=config.interaction.chargeDecisionRatio??.62
  let held=null,charging=false,chargeStartedAt=0,chargeOverride=null,chargeDuration=config.interaction.chargeMaxSecondsFar,accumulator=0,shotSequence=0
  let attempts=0,hits=0,points=0,collisions=0,resets=0,pushes=0,kicks=0,suppressInteractionUntil=0
  let cachedRecommendation={ratio:chargeDecisionRatio,miss:Infinity},recommendationUpdatedAt=-Infinity
  const playerInsideCourt=()=>{
    if(!court)return false
    const dx=camera.position.x-hoopCenter.x,dz=camera.position.z-hoopCenter.z
    const localX=dx*hoopCos-dz*hoopSin,localZ=dx*hoopSin+dz*hoopCos,courtForward=-localZ
    return Math.abs(localX)<=court.width/2&&courtForward>=court.baselineForward&&courtForward<=court.baselineForward+court.length
  }
  const activeShot=()=>runtimeItems.some(item=>item.shot&&!item.shot.expired&&!item.shot.scored)
  const canReset=()=>Boolean(held||activeShot()||playerInsideCourt())
  const hudState={visible:false,points:0,hits:0,attempts:0,charging:false,chargeRatio:0,decisionRatio:chargeDecisionRatio,recommendedRatio:chargeDecisionRatio,reachable:false,mode:'webgl-button'}

  const updateShadow=(item,force=false)=>{
    const ball=item.model.position
    if(!force&&item.shadowLastPosition.distanceToSquared(ball)<1e-8)return
    item.shadowLastPosition.copy(ball)
    let ground=groundHeightAt(ball.x,ball.z,ball.y)
    let distance=(ground-ball.y)/shadowRay.y
    let x=ball.x+shadowRay.x*distance,z=ball.z+shadowRay.z*distance
    // One correction is enough for ramps and raised surfaces without raycasting the scene.
    ground=groundHeightAt(x,z,ball.y)
    distance=(ground-ball.y)/shadowRay.y
    x=ball.x+shadowRay.x*distance;z=ball.z+shadowRay.z*distance
    const height=Math.max(0,ball.y-item.radius-ground)
    const spread=Math.min(height,5)
    const minor=item.radius*(.82+spread*.11)
    const incidence=1+Math.hypot(shadowRay.x,shadowRay.z)/Math.max(.2,-shadowRay.y)*.28
    const major=minor*(incidence+spread*.035)
    const opacity=.34*Math.exp(-height*.31)
    item.shadow.position.set(x,ground+.018,z)
    item.shadow.scale.set(major,1,minor)
    item.shadow.material.uniforms.opacity.value=opacity
    item.shadow.visible=item.model.visible&&height<7&&opacity>.025&&Number.isFinite(x+ground+z)
  }

  const setPointer=(clientX,clientY,useCenter=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height*2-1))
    raycaster.near=0;raycaster.far=Infinity;raycaster.setFromCamera(pointer,camera)
  }

  const hitBall=(clientX,clientY,useCenter=false,maxDistance=config.interaction.pickupDistance)=>{
    if(held)return null
    setPointer(clientX,clientY,useCenter)
    let closest=null
    for(const item of runtimeItems) {
      const hit=raycaster.intersectObject(item.model,true)[0]
      if(!hit||hit.distance>maxDistance||closest&&hit.distance>=closest.distance)continue
      closest={item,distance:hit.distance,point:hit.point.clone()}
    }
    return closest
  }

  const placeHeld=()=>{
    if(!held)return
    const direction=tempA;camera.getWorldDirection(direction).normalize()
    const right=tempB.crossVectors(direction,camera.up).normalize()
    held.model.position.copy(camera.position).addScaledVector(direction,.48).addScaledVector(right,.22).addScaledVector(camera.up,-.18)
    held.model.quaternion.copy(camera.quaternion).multiply(heldTilt)
    held.model.visible=true
  }

  const pickup=item=>{
    if(held||!item)return null
    held=item;item.status='held';item.sleeping=false;item.velocity.set(0,0,0);item.angularVelocity.set(0,0,0)
    item.shot=null;item.wasAboveRim=false;placeHeld();updateUi()
    const result={type:'basketball-pickup',id:item.id};onEvent?.(result);return result
  }

  const interact=(clientX,clientY,useCenter=false)=>{
    if(!isWalkMode())return null
    if(performance.now()<suppressInteractionUntil)return {type:'basketball-shot-release'}
    if(held)return {type:'basketball-held'}
    const hit=hitBall(clientX,clientY,useCenter)
    return hit?pickup(hit.item):null
  }

  const beginCharge=(override=null)=>{
    if(!held||!isWalkMode()||charging)return false
    const distance=Math.hypot(held.model.position.x-rimCenter.x,held.model.position.z-rimCenter.z)
    const distanceRatio=THREE.MathUtils.smoothstep(distance,config.interaction.chargeNearDistance,config.interaction.chargeFarDistance)
    chargeDuration=THREE.MathUtils.lerp(config.interaction.chargeMaxSecondsNear,config.interaction.chargeMaxSecondsFar,distanceRatio)
    charging=true;chargeStartedAt=performance.now();chargeOverride=override
    updateUi();return true
  }

  const chargeSeconds=()=>chargeOverride??Math.max(0,(performance.now()-chargeStartedAt)/1000)
  const chargeRatio=()=>THREE.MathUtils.clamp((chargeSeconds()-config.interaction.chargeMinSeconds)/(chargeDuration-config.interaction.chargeMinSeconds),0,1)
  const speedForRatio=ratio=>THREE.MathUtils.lerp(config.interaction.throwSpeedMin,config.interaction.throwSpeedMax,ratio*ratio*(3-2*ratio))
  const assistedTarget=position=>{
    const frontX=position.x-rimCenter.x,frontZ=position.z-rimCenter.z,frontLength=Math.hypot(frontX,frontZ)||1
    const offset=config.interaction.shotAssist?.targetFrontOffset??0
    return {x:rimCenter.x+frontX/frontLength*offset,z:rimCenter.z+frontZ/frontLength*offset}
  }
  const predictRawShot=(position,look,speed)=>{
    const vx=look.x*speed,vz=look.z*speed,vy=look.y*speed+config.interaction.throwUpwardBias
    const height=rimCenter.y-position.y,discriminant=vy*vy-2*GRAVITY*height
    if(discriminant<0)return null
    const time=(vy+Math.sqrt(discriminant))/GRAVITY
    if(time<=.08||time>4)return null
    const target=assistedTarget(position),dx=target.x-position.x,dz=target.z-position.z
    const miss=Math.hypot(position.x+vx*time-target.x,position.z+vz*time-target.z)
    const correction=Math.hypot(dx/time-vx,dz/time-vz)/Math.max(speed,.001)
    return {time,miss,correction,vx,vy,vz,dx,dz}
  }
  const assistCandidate=(position,look,speed)=>{
    const assist=config.interaction.shotAssist
    if(!assist?.enabled)return null
    const dx=rimCenter.x-position.x,dz=rimCenter.z-position.z,distance=Math.hypot(dx,dz),lookDistance=Math.hypot(look.x,look.z)
    const aimDot=lookDistance&&distance?(look.x*dx+look.z*dz)/(lookDistance*distance):-1
    if(!distance||distance>assist.maxDistance||aimDot<assist.minAimDot)return null
    const prediction=predictRawShot(position,look,speed)
    return prediction&&prediction.miss<=assist.fitRadius&&prediction.correction<=assist.maxVelocityCorrection?prediction:null
  }
  const recommendedRatio=position=>{
    camera.getWorldDirection(tempC).normalize()
    let bestRatio=1,bestMiss=Infinity
    for(let index=0;index<=40;index++) {
      const ratio=index/40,prediction=predictRawShot(position,tempC,speedForRatio(ratio))
      if(prediction&&prediction.miss<bestMiss){bestMiss=prediction.miss;bestRatio=ratio}
    }
    return {ratio:bestRatio,miss:bestMiss}
  }
  const mappedPowerRatio=(displayRatio,idealRatio)=>displayRatio<=chargeDecisionRatio
    ?displayRatio/chargeDecisionRatio*idealRatio
    :idealRatio+(displayRatio-chargeDecisionRatio)/(1-chargeDecisionRatio)*(1-idealRatio)

  const fitAssistedShot=(item,speed,look)=>{
    item.velocity.copy(look).multiplyScalar(speed).addScaledVector(UP,config.interaction.throwUpwardBias)
    const prediction=assistCandidate(item.model.position,look,speed)
    if(!prediction)return false
    item.velocity.x=prediction.dx/prediction.time;item.velocity.z=prediction.dz/prediction.time
    return true
  }

  const releaseCharge=(override=null)=>{
    if(!held||!charging)return null
    if(override!=null)chargeOverride=override
    const ratio=chargeRatio()
    const direction=tempA;camera.getWorldDirection(direction).normalize()
    const right=tempB.crossVectors(direction,camera.up).normalize()
    const item=held
    item.model.position.copy(camera.position).addScaledVector(direction,.56).addScaledVector(right,.18).addScaledVector(camera.up,-.16)
    const idealRatio=recommendedRatio(item.model.position).ratio,powerRatio=mappedPowerRatio(ratio,idealRatio)
    const speed=speedForRatio(powerRatio)
    const assisted=fitAssistedShot(item,speed,direction)
    item.angularVelocity.set(8+ratio*8,4,10-ratio*3)
    item.status='airborne';item.sleeping=false;item.sleepTime=0;item.age=0;item.wasAboveRim=item.model.position.y>rimCenter.y
    const releaseDistance=Math.hypot(item.model.position.x-rimCenter.x,item.model.position.z-rimCenter.z)
    const shotPoints=pointsForDistance(releaseDistance)
    item.shot={id:++shotSequence,age:0,scored:false,expired:false,assisted,releaseDistance,points:shotPoints}
    attempts++;held=null;charging=false;chargeOverride=null;suppressInteractionUntil=performance.now()+180
    updateUi()
    const result={type:'basketball-shot',id:item.id,shotId:item.shot.id,speed:rounded(speed,2),charge:rounded(ratio,3),power:rounded(powerRatio,3),assisted,distance:rounded(releaseDistance,2),points:shotPoints}
    onEvent?.(result);return result
  }

  const cancelCharge=()=>{
    if(!charging)return false
    charging=false;chargeOverride=null;updateUi();return true
  }

  const resetItem=item=>{
    item.model.position.copy(item.initialPosition);item.model.quaternion.copy(item.initialQuaternion)
    item.velocity.set(0,0,0);item.angularVelocity.set(0,0,0);item.status='resting';item.sleeping=true
    item.sleepTime=0;item.age=0;item.shot=null;item.wasAboveRim=false;item.scoredShotId=null
  }

  const resetAll=()=>{
    held=null;cancelCharge();for(const item of runtimeItems)resetItem(item);resets++;updateUi()
    const result={type:'basketball-reset',count:runtimeItems.length};onEvent?.(result);return result
  }

  const resetSession=()=>{
    held=null;cancelCharge();for(const item of runtimeItems)resetItem(item)
    attempts=0;hits=0;points=0;collisions=0;resets=0;pushes=0;kicks=0;shotSequence=0
    accumulator=0;suppressInteractionUntil=0;chargeOverride=null;chargeStartedAt=0
    updateUi();return snapshot()
  }

  const kick=(item=null)=>{
    if(held||!isWalkMode())return null
    if(!item)item=hitBall(renderer.domElement.clientWidth/2,renderer.domElement.clientHeight/2,true,config.interaction.kickDistance)?.item
    if(!item)return null
    const direction=tempA;camera.getWorldDirection(direction);direction.y=0
    if(direction.lengthSq()<1e-5)direction.set(0,0,-1);direction.normalize()
    item.velocity.copy(direction).multiplyScalar(config.interaction.kickSpeed);item.velocity.y=config.interaction.kickUpwardSpeed
    item.status='airborne';item.sleeping=false;item.sleepTime=0;item.shot=null;item.wasAboveRim=false;kicks++
    const result={type:'basketball-kick',id:item.id};onEvent?.(result);updateUi();return result
  }

  const closestPointOnSegment=(point,a,b,target)=>{
    const ab=tempD.copy(b).sub(a),lengthSq=ab.lengthSq()
    const t=lengthSq?THREE.MathUtils.clamp(tempC.copy(point).sub(a).dot(ab)/lengthSq,0,1):0
    return target.copy(a).addScaledVector(ab,t)
  }

  const resolveSphereAabb=(item,box,restitution=.42)=>{
    const p=item.model.position,r=item.radius
    if(p.x+r<box.minX||p.x-r>box.maxX||p.y+r<box.minY||p.y-r>box.maxY||p.z+r<box.minZ||p.z-r>box.maxZ)return false
    tempA.set(THREE.MathUtils.clamp(p.x,box.minX,box.maxX),THREE.MathUtils.clamp(p.y,box.minY,box.maxY),THREE.MathUtils.clamp(p.z,box.minZ,box.maxZ))
    tempB.copy(p).sub(tempA);let distance=tempB.length()
    if(distance>=r)return false
    if(distance<1e-6) {
      const faces=[[Math.abs(p.x-box.minX),-1,0,0],[Math.abs(box.maxX-p.x),1,0,0],[Math.abs(p.y-box.minY),0,-1,0],[Math.abs(box.maxY-p.y),0,1,0],[Math.abs(p.z-box.minZ),0,0,-1],[Math.abs(box.maxZ-p.z),0,0,1]].sort((a,b)=>a[0]-b[0])
      tempB.set(faces[0][1],faces[0][2],faces[0][3]);distance=0
    } else tempB.multiplyScalar(1/distance)
    p.addScaledVector(tempB,r-distance+.001)
    const incoming=item.velocity.dot(tempB)
    if(incoming<0)item.velocity.addScaledVector(tempB,-incoming*(1+restitution))
    collisions++;return true
  }

  const resolveSphereCapsule=(item,a,b,radius,restitution=.48,itemRadius=item.radius)=>{
    closestPointOnSegment(item.model.position,a,b,tempA)
    tempB.copy(item.model.position).sub(tempA)
    const target=itemRadius+radius,distance=tempB.length()
    if(distance>=target)return false
    if(distance<1e-6)tempB.set(0,1,0);else tempB.multiplyScalar(1/distance)
    item.model.position.addScaledVector(tempB,target-distance+.001)
    const incoming=item.velocity.dot(tempB)
    if(incoming<0)item.velocity.addScaledVector(tempB,-incoming*(1+restitution))
    collisions++;return true
  }

  const boardCenter=worldFromHoopLocal(hoop.boardCenterLocal)
  const boardHalfX=Math.abs(hoopCos)*hoop.boardSize[0]/2+Math.abs(hoopSin)*hoop.boardSize[2]/2
  const boardHalfZ=Math.abs(hoopSin)*hoop.boardSize[0]/2+Math.abs(hoopCos)*hoop.boardSize[2]/2
  const boardBox={
    minX:boardCenter.x-boardHalfX,maxX:boardCenter.x+boardHalfX,
    minY:hoop.surfaceY+hoop.boardCenterLocal[1]-hoop.boardSize[1]/2,maxY:hoop.surfaceY+hoop.boardCenterLocal[1]+hoop.boardSize[1]/2,
    minZ:boardCenter.z-boardHalfZ,maxZ:boardCenter.z+boardHalfZ,
  }
  const ringSegments=[]
  for(let index=0;index<20;index++) {
    const a=index/20*Math.PI*2,b=(index+1)/20*Math.PI*2,rr=hoop.rimInnerDiameter/2+hoop.rimTubeRadius
    ringSegments.push([
      new THREE.Vector3(rimCenter.x+Math.cos(a)*rr,rimCenter.y,rimCenter.z+Math.sin(a)*rr),
      new THREE.Vector3(rimCenter.x+Math.cos(b)*rr,rimCenter.y,rimCenter.z+Math.sin(b)*rr),
    ])
  }
  const frameSegments=[]
  const addFrame=(a,b,r=.035)=>frameSegments.push([worldFromHoopLocal(a),worldFromHoopLocal(b),r])
  const bw=.68,frontZ=-.608,rearZ=.608
  addFrame([-bw,.036,frontZ],[bw,.036,frontZ],.035);addFrame([-bw,.036,rearZ],[bw,.036,rearZ],.035)
  addFrame([-bw,.036,frontZ],[-bw,.036,rearZ],.035);addFrame([bw,.036,frontZ],[bw,.036,rearZ],.035)
  for(const side of [-1,1]) {
    addFrame([side*bw,.064,rearZ],[side*bw,3.396,-1.316],.04)
    addFrame([side*bw,3.396,-1.316],[side*bw,3.396,-1.651],.035)
    addFrame([side*bw,3.020,-1.651],[side*bw,3.020,-1.099],.035)
    addFrame([side*bw,.064,frontZ],[side*bw,2.169,frontZ],.035)
    addFrame([side*bw,3.020,-1.400],[side*bw,1.648,frontZ],.036)
    addFrame([side*bw,2.64,-1.651],[side*bw,3.61,-1.651],.035)
  }
  addFrame([-bw,1.648,frontZ],[bw,1.648,frontZ],.030)
  addFrame([-bw,2.169,frontZ],[bw,2.169,frontZ],.035)

  const collideWorld=item=>{
    const collisionSpeed=item.velocity.length()
    if(resolveSphereAabb(item,boardBox,.68))onEvent?.({type:'basketball-collision',id:item.id,speed:rounded(collisionSpeed,2),surface:'backboard'})
    const rimDistance=Math.hypot(item.model.position.x-rimCenter.x,item.model.position.z-rimCenter.z)
    const assistedRimGrace=item.shot?.assisted&&!item.shot.expired&&Math.abs(item.model.position.y-rimCenter.y)<.36&&rimDistance<hoop.rimInnerDiameter/2+item.radius*.75
    let rimHit=false,frameHit=false
    if(!assistedRimGrace)for(const [a,b] of ringSegments)rimHit=resolveSphereCapsule(item,a,b,hoop.rimTubeRadius,.55,item.radius*(config.interaction.rimCollisionRadiusScale??1))||rimHit
    for(const [a,b,r] of frameSegments)frameHit=resolveSphereCapsule(item,a,b,r,.40)||frameHit
    if(rimHit)onEvent?.({type:'basketball-collision',id:item.id,speed:rounded(collisionSpeed,2),surface:'rim'})
    else if(frameHit)onEvent?.({type:'basketball-collision',id:item.id,speed:rounded(collisionSpeed,2),surface:'frame'})
    const p=item.model.position,r=item.radius
    for(const collider of colliders) {
      if(collider.name?.startsWith('basketball-hoop-')||collider.slopeX)continue
      if(collider.oriented) {
        if(p.y+r<collider.minY||p.y-r>collider.maxY)continue
        tempA.set(collider.ax,THREE.MathUtils.clamp(p.y,collider.minY,collider.maxY),collider.az)
        tempB.set(collider.bx,tempA.y,collider.bz)
        resolveSphereCapsule(item,tempA,tempB,(collider.thickness??.14)/2,.38)
      } else if([collider.minX,collider.maxX,collider.minY,collider.maxY,collider.minZ,collider.maxZ].every(Number.isFinite))resolveSphereAabb(item,collider,.38)
    }
  }

  const scoreCheck=(item,previousY)=>{
    if(!item.shot||item.shot.expired||item.shot.scored)return
    if(item.model.position.y>rimCenter.y+item.radius*.35)item.wasAboveRim=true
    if(!item.wasAboveRim||previousY<=rimCenter.y||item.model.position.y>rimCenter.y||item.velocity.y>=0)return
    const dx=item.model.position.x-rimCenter.x,dz=item.model.position.z-rimCenter.z
    if(Math.hypot(dx,dz)>clearScoreRadius)return
    const awardedPoints=item.shot.points??pointsForDistance(item.shot.releaseDistance??0)
    item.shot.scored=true;item.scoredShotId=item.shot.id;hits++;points+=awardedPoints;updateUi()
    onEvent?.({type:'basketball-score',id:item.id,shotId:item.shot.id,points:awardedPoints,totalPoints:points,distance:rounded(item.shot.releaseDistance??0,2),hits,attempts})
  }

  const expireShotOnGround=item=>{if(item.shot&&!item.shot.scored)item.shot.expired=true}
  const stepItem=(item,dt)=>{
    if(item===held||item.sleeping)return
    item.age+=dt;if(item.shot){item.shot.age+=dt;if(item.shot.age>8)item.shot.expired=true}
    const previousY=item.model.position.y
    item.velocity.y-=GRAVITY*dt
    item.model.position.addScaledVector(item.velocity,dt)
    item.model.rotation.x+=item.angularVelocity.x*dt;item.model.rotation.y+=item.angularVelocity.y*dt;item.model.rotation.z+=item.angularVelocity.z*dt
    scoreCheck(item,previousY)
    collideWorld(item)
    const ground=groundHeightAt(item.model.position.x,item.model.position.z,item.model.position.y),kind=surfaceKindAt(item.model.position.x,item.model.position.z)
    item.lastGround=ground
    if(item.model.position.y-item.radius<=ground) {
      const impact=-item.velocity.y
      item.model.position.y=ground+item.radius
      const restitution=kind==='aged-concrete'?.72:kind==='activity-sand'?.18:.35
      if(item.velocity.y<0)item.velocity.y=-item.velocity.y*restitution
      item.velocity.x*=kind==='activity-sand'?.80:.94;item.velocity.z*=kind==='activity-sand'?.80:.94
      item.angularVelocity.multiplyScalar(.94);collisions++
      if(impact>.25)onEvent?.({type:'basketball-collision',id:item.id,speed:rounded(impact,2),surface:kind})
      expireShotOnGround(item)
      if(Math.abs(item.velocity.y)<.42)item.velocity.y=0
    }
    const netDistance=Math.hypot(item.model.position.x-rimCenter.x,item.model.position.z-rimCenter.z)
    if(netDistance<.20&&item.model.position.y<rimCenter.y&&item.model.position.y>rimCenter.y-.58)item.velocity.multiplyScalar(.988)
    const horizontal=Math.hypot(item.velocity.x,item.velocity.z)
    if(item.velocity.y===0) {
      item.status=horizontal>.08?'rolling':'resting'
      const deceleration=(kind==='activity-sand'?5.5:kind==='aged-concrete'?1.1:2.4)*dt
      if(horizontal>0) {
        const next=Math.max(0,horizontal-deceleration),scale=next/horizontal
        item.velocity.x*=scale;item.velocity.z*=scale
      }
      if(horizontal<.08){item.sleepTime+=dt;if(item.sleepTime>=.6){item.sleeping=true;item.status='resting';item.velocity.set(0,0,0);item.angularVelocity.set(0,0,0)}}
      else item.sleepTime=0
    } else {item.status='airborne';item.sleepTime=0}
    const bounds=config.interaction.worldBounds??[-60,60,-80,20]
    if(item.model.position.y<-2||item.model.position.x<bounds[0]||item.model.position.x>bounds[1]||item.model.position.z<bounds[2]||item.model.position.z>bounds[3]||
      !item.model.position.toArray().every(Number.isFinite)||item.age>90)resetItem(item)
  }

  const pushByPlayer=(position,velocity)=>{
    const feet=position.y-player.eyeHeight
    for(const item of runtimeItems) {
      if(item===held||item.status==='airborne'||Math.abs(item.model.position.y-item.radius-feet)>.35)continue
      const dx=item.model.position.x-position.x,dz=item.model.position.z-position.z,minDistance=player.radius+item.radius
      const distance=Math.hypot(dx,dz)
      if(distance>=minDistance)continue
      const nx=distance>1e-5?dx/distance:1,nz=distance>1e-5?dz/distance:0
      item.model.position.x=position.x+nx*(minDistance+.002);item.model.position.z=position.z+nz*(minDistance+.002)
      item.velocity.x=THREE.MathUtils.clamp(item.velocity.x+velocity.x*.72,-4,4)
      item.velocity.z=THREE.MathUtils.clamp(item.velocity.z+velocity.z*.72,-4,4)
      item.sleeping=false;item.status='rolling';item.sleepTime=0;pushes++
    }
  }

  const updateUi=()=>{
    const visible=isWalkMode()&&(playerInsideCourt()||held||activeShot())
    if(held&&performance.now()-recommendationUpdatedAt>=120){cachedRecommendation=recommendedRatio(held.model.position);recommendationUpdatedAt=performance.now()}
    const recommendation=held?cachedRecommendation:null
    const ratio=charging?chargeRatio():0
    const powerRatio=charging?mappedPowerRatio(ratio,recommendation.ratio):0
    const prediction=charging?assistCandidate(held.model.position,tempC,speedForRatio(powerRatio)):null
    hudState.visible=visible;hudState.points=points;hudState.hits=hits;hudState.attempts=attempts;hudState.charging=charging
    hudState.chargeRatio=ratio;hudState.recommendedRatio=recommendation?.ratio??chargeDecisionRatio;hudState.reachable=Boolean(prediction)
  }

  const update=(dt,playerPosition=camera.position,playerVelocity=tempA.set(0,0,0))=>{
    placeHeld();pushByPlayer(playerPosition,playerVelocity)
    accumulator=Math.min(accumulator+Math.min(.05,Math.max(0,dt)),FIXED_STEP*MAX_SUBSTEPS)
    let steps=0
    while(accumulator>=FIXED_STEP&&steps<MAX_SUBSTEPS) {
      for(const item of runtimeItems)stepItem(item,FIXED_STEP)
      accumulator-=FIXED_STEP;steps++
    }
    for(const item of runtimeItems)updateShadow(item)
    updateUi()
  }

  const advance=seconds=>{
    const steps=Math.ceil(Math.max(0,seconds)/FIXED_STEP)
    for(let index=0;index<steps;index++)for(const item of runtimeItems)stepItem(item,FIXED_STEP)
    for(const item of runtimeItems)updateShadow(item)
    updateUi();return snapshot()
  }

  const setBallState=(id,state={})=>{
    const item=runtimeItems.find(candidate=>candidate.id===id);if(!item)return null
    if(state.position)item.model.position.fromArray(state.position)
    if(state.velocity)item.velocity.fromArray(state.velocity)
    if(state.status)item.status=state.status
    item.sleeping=state.sleeping??false;item.sleepTime=0;item.age=state.age??0
    if(state.shot) {
      const releaseDistance=state.shot.releaseDistance??0
      item.shot={id:state.shot.id??++shotSequence,age:state.shot.age??0,scored:Boolean(state.shot.scored),expired:Boolean(state.shot.expired),assisted:Boolean(state.shot.assisted),releaseDistance,points:state.shot.points??pointsForDistance(releaseDistance)}
      if(state.countAttempt)attempts++
    }
    if(state.wasAboveRim!=null)item.wasAboveRim=Boolean(state.wasAboveRim)
    return snapshot()
  }

  const snapshot=()=>({
    status:'ready',policy:{maxDistance:config.interaction.pickupDistance,persistence:config.persistence,fixedStep:FIXED_STEP,maxSubsteps:MAX_SUBSTEPS,shotAssist:config.interaction.shotAssist,court:hoop.court,scoring:{twoPointMax:rounded(threePointDistance),threePointMax:rounded(fourPointDistance),fourPointMin:rounded(fourPointDistance)}},
    held:held?.id??null,charging,charge:charging?rounded(chargeRatio(),3):0,chargeDuration:rounded(chargeDuration,3),attempts,hits,points,score:points,ratio:`${hits}/${attempts}`,
    collisions,resets,pushes,kicks,rimWorld:roundedArray(rimCenter.toArray()),clearScoreRadius:rounded(clearScoreRadius),
    items:runtimeItems.map(item=>({id:item.id,status:item.status,sleeping:item.sleeping,position:roundedArray(item.model.position.toArray()),velocity:roundedArray(item.velocity.toArray()),shot:item.shot?{...item.shot,age:rounded(item.shot.age)}:null,scoredShotId:item.scoredShotId,
      shadow:{visible:item.shadow.visible,position:roundedArray(item.shadow.position.toArray()),scale:roundedArray([item.shadow.scale.x,item.shadow.scale.z]),opacity:rounded(item.shadow.material.uniforms.opacity.value,3)},
    })),
    ui:{...hudState,touch:isTouchMode(),canReset:canReset(),insideCourt:playerInsideCourt()},
  })

  renderer.domElement.addEventListener('pointerdown',event=>{
    if(event.button!==0||isTouchMode()||!held||!isWalkMode()||!canCharge())return
    beginCharge()
  })
  addEventListener('pointerup',event=>{if(event.button===0&&!isTouchMode()&&charging)releaseCharge()})
  addEventListener('blur',cancelCharge)
  addEventListener('keydown',event=>{
    if(event.code==='Escape')cancelCharge()
    if(!isWalkMode())return
    if(event.code===config.interaction.kickKey){if(kick())event.preventDefault()}
    if(event.code===config.interaction.resetKey){resetAll();event.preventDefault()}
  })
  for(const item of runtimeItems)updateShadow(item,true)
  updateUi()

  return {
    interact,hitBall,pickup,beginCharge,releaseCharge,cancelCharge,kick,resetAll,resetSession,update,advance,setBallState,snapshot,
    hasHeld:()=>Boolean(held),isCharging:()=>charging,canReset,hudState:()=>hudState,scoreValue:distance=>pointsForDistance(Math.max(0,Number(distance)||0)),rimCenter:()=>rimCenter.clone(),items:()=>runtimeItems,
  }
}

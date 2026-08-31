import * as THREE from 'three'

// 玩家导航世界只保存米制数值数据，不持有 Mesh、Geometry、Material、阴影或后期渲染对象。
// 渲染帧变慢时，位移会被拆成固定长度的小步，避免跨过窄踏步或入口检测区。
export function createPlayerNavigation({player,baseHeightAt,maxSubstep=.08}) {
  const colliders=[]
  const walkSurfaces=[]
  const spatialCellSize=2
  const localQueryRadius=1
  const colliderGrid=new Map(),walkSurfaceGrid=new Map()
  const snapRadii=[.18,.34,.52,.68,.8]
  const snapAngleOffsets=[Math.PI/2,-Math.PI/2,0,Math.PI,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4]
  const queryStats={
    blocked:{calls:0,totalCandidates:0,maxCandidates:0,lastCandidates:0},
    ground:{calls:0,totalCandidates:0,maxCandidates:0,lastCandidates:0},
  }

  const recordCandidates=(kind,count)=>{
    const stats=queryStats[kind]
    stats.calls++
    stats.totalCandidates+=count
    stats.lastCandidates=count
    stats.maxCandidates=Math.max(stats.maxCandidates,count)
  }

  const distanceToSegment=(px,pz,ax,az,bx,bz)=>{
    const dx=bx-ax,dz=bz-az,lengthSquared=dx*dx+dz*dz
    const t=lengthSquared?THREE.MathUtils.clamp(((px-ax)*dx+(pz-az)*dz)/lengthSquared,0,1):0
    return Math.hypot(px-(ax+t*dx),pz-(az+t*dz))
  }

  const pointInPolygon=(x,z,points)=>{
    let inside=false
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const [xi,zi]=points[i],[xj,zj]=points[j]
      if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi))inside=!inside
    }
    return inside
  }

  const cellCoordinate=value=>Math.floor(value/spatialCellSize)
  const cellKey=(x,z)=>`${x},${z}`
  const distanceToBounds=(x,z,bounds)=>Math.hypot(
    x<bounds.minX?bounds.minX-x:x>bounds.maxX?x-bounds.maxX:0,
    z<bounds.minZ?bounds.minZ-z:z>bounds.maxZ?z-bounds.maxZ:0,
  )
  const indexSpatialItem=(grid,item,bounds)=>{
    item.navigationBounds=bounds
    const minCellX=cellCoordinate(bounds.minX-localQueryRadius),maxCellX=cellCoordinate(bounds.maxX+localQueryRadius)
    const minCellZ=cellCoordinate(bounds.minZ-localQueryRadius),maxCellZ=cellCoordinate(bounds.maxZ+localQueryRadius)
    for(let cellX=minCellX;cellX<=maxCellX;cellX++)for(let cellZ=minCellZ;cellZ<=maxCellZ;cellZ++) {
      const key=cellKey(cellX,cellZ),bucket=grid.get(key)
      if(bucket)bucket.push(item);else grid.set(key,[item])
    }
    return item
  }
  const nearbySpatialItems=(grid,x,z,radius=localQueryRadius)=>{
    const bucket=grid.get(cellKey(cellCoordinate(x),cellCoordinate(z)))??[]
    return bucket.filter(item=>distanceToBounds(x,z,item.navigationBounds)<=radius+.001)
  }
  const colliderBounds=collider=>collider.oriented?{
    minX:Math.min(collider.ax,collider.bx)-collider.thickness/2,maxX:Math.max(collider.ax,collider.bx)+collider.thickness/2,
    minZ:Math.min(collider.az,collider.bz)-collider.thickness/2,maxZ:Math.max(collider.az,collider.bz)+collider.thickness/2,
  }:{minX:collider.minX,maxX:collider.maxX,minZ:collider.minZ,maxZ:collider.maxZ}
  const surfaceBounds=surface=>{
    if(surface.type==='polygon')return {
      minX:Math.min(...surface.points.map(point=>point[0])),maxX:Math.max(...surface.points.map(point=>point[0])),
      minZ:Math.min(...surface.points.map(point=>point[1])),maxZ:Math.max(...surface.points.map(point=>point[1])),
    }
    if(surface.type==='ramp')return {
      minX:Math.min(surface.ax,surface.bx)-surface.width/2,maxX:Math.max(surface.ax,surface.bx)+surface.width/2,
      minZ:Math.min(surface.az,surface.bz)-surface.width/2,maxZ:Math.max(surface.az,surface.bz)+surface.width/2,
    }
    return {minX:surface.minX,maxX:surface.maxX,minZ:surface.minZ,maxZ:surface.maxZ}
  }
  const registerCollider=collider=>{colliders.push(collider);indexSpatialItem(colliderGrid,collider,colliderBounds(collider));return collider}
  const registerWalkSurface=surface=>{walkSurfaces.push(surface);indexSpatialItem(walkSurfaceGrid,surface,surfaceBounds(surface));return surface}

  const addAabb=(name,center,size,options={})=>registerCollider({
    name,minX:center[0]-size[0]/2,maxX:center[0]+size[0]/2,
    minZ:center[2]-size[2]/2,maxZ:center[2]+size[2]/2,
    minY:center[1]-size[1]/2,maxY:center[1]+size[1]/2,
    ...options,
  })
  const addAabbBounds=collider=>registerCollider({...collider})
  const addSegment=(name,a,b,minY,maxY,thickness=.14)=>registerCollider({name,oriented:true,ax:a[0],az:a[1],bx:b[0],bz:b[1],minY,maxY,thickness})
  const addSlopeColliderX=(name,xStart,xEnd,z,width,yStart,yEnd,thickness=.16)=>registerCollider({name,slopeX:true,xStart,xEnd,minX:Math.min(xStart,xEnd),maxX:Math.max(xStart,xEnd),minZ:z-width/2,maxZ:z+width/2,yStart,yEnd,thickness})

  const addWalkRect=(name,center,size,height,options={})=>registerWalkSurface({name,type:'rect',minX:center[0]-size[0]/2,maxX:center[0]+size[0]/2,minZ:center[1]-size[1]/2,maxZ:center[1]+size[1]/2,height,...options})
  const addWalkPolygon=(name,points,height,holes=[],options={})=>registerWalkSurface({name,type:'polygon',points,holes,height,...options})
  const addWalkSlopeX=(name,xStart,xEnd,z,width,yStart,yEnd,options={})=>registerWalkSurface({name,type:'slopeX',xStart,xEnd,minX:Math.min(xStart,xEnd),maxX:Math.max(xStart,xEnd),minZ:z-width/2,maxZ:z+width/2,yStart,yEnd,...options})
  const addWalkSlopeZ=(name,x,width,zStart,zEnd,yStart,yEnd,options={})=>registerWalkSurface({name,type:'slopeZ',zStart,zEnd,minX:x-width/2,maxX:x+width/2,minZ:Math.min(zStart,zEnd),maxZ:Math.max(zStart,zEnd),yStart,yEnd,...options})
  const addWalkRamp=(name,a,b,width,yStart,yEnd,options={})=>registerWalkSurface({name,type:'ramp',ax:a[0],az:a[1],bx:b[0],bz:b[1],width,yStart,yEnd,...options})

  const surfaceContains=(surface,x,z)=>{
    if(surface.type==='rect')return x>=surface.minX&&x<=surface.maxX&&z>=surface.minZ&&z<=surface.maxZ
    if(surface.type==='slopeX'||surface.type==='slopeZ')return x>=surface.minX&&x<=surface.maxX&&z>=surface.minZ&&z<=surface.maxZ
    if(surface.type==='ramp')return distanceToSegment(x,z,surface.ax,surface.az,surface.bx,surface.bz)<=surface.width/2
    return pointInPolygon(x,z,surface.points)&&!surface.holes.some(hole=>pointInPolygon(x,z,hole))
  }

  const surfaceHeightAt=(surface,x,z)=>{
    if(surface.type==='slopeX')return THREE.MathUtils.lerp(surface.yStart,surface.yEnd,THREE.MathUtils.clamp((x-surface.xStart)/(surface.xEnd-surface.xStart),0,1))
    if(surface.type==='slopeZ')return THREE.MathUtils.lerp(surface.yStart,surface.yEnd,THREE.MathUtils.clamp((z-surface.zStart)/(surface.zEnd-surface.zStart),0,1))
    if(surface.type==='ramp') {
      const dx=surface.bx-surface.ax,dz=surface.bz-surface.az,lengthSquared=dx*dx+dz*dz
      const t=lengthSquared?THREE.MathUtils.clamp(((x-surface.ax)*dx+(z-surface.az)*dz)/lengthSquared,0,1):0
      return THREE.MathUtils.lerp(surface.yStart,surface.yEnd,t)
    }
    return surface.height
  }

  const groundHeightAt=(x,z,reference=0,record=true,spatialContext=null)=>{
    const candidates=[{height:baseHeightAt(x,z),stepUp:player.maxStep}]
    const nearbySurfaces=spatialContext?.walkSurfaces??nearbySpatialItems(walkSurfaceGrid,x,z)
    for(const surface of nearbySurfaces) {
      if(surfaceContains(surface,x,z))candidates.push({height:surfaceHeightAt(surface,x,z),stepUp:surface.stepUp??player.maxStep})
    }
    if(record)recordCandidates('ground',nearbySurfaces.length)
    const reachable=candidates.filter(candidate=>candidate.height<=reference+candidate.stepUp+.001)
    return reachable.length?Math.max(...reachable.map(candidate=>candidate.height)):Math.min(...candidates.map(candidate=>candidate.height))
  }

  const blocked=(x,z,eyeY,record=true,spatialContext=null)=>{
    const r=player.radius,feetY=eyeY-player.eyeHeight
    const nearbyColliders=spatialContext?.colliders??nearbySpatialItems(colliderGrid,x,z)
    let examined=0
    for(const collider of nearbyColliders) {
      examined++
      if(collider.slopeX) {
        if(x<collider.minX||x>collider.maxX||z+r<collider.minZ||z-r>collider.maxZ)continue
        const t=THREE.MathUtils.clamp((x-collider.xStart)/(collider.xEnd-collider.xStart),0,1)
        const surfaceY=THREE.MathUtils.lerp(collider.yStart,collider.yEnd,t),undersideY=surfaceY-collider.thickness
        if(feetY>=surfaceY-.08||eyeY<=undersideY+.02)continue
        if(record)recordCandidates('blocked',examined)
        return collider.name
      }
      if(eyeY<collider.minY-.05||feetY>=collider.maxY-.02)continue
      // 可行走台阶先按顶面高度尝试抬步；普通实体仍按墙体处理。
      if(collider.walkable&&collider.maxY-feetY<=player.maxStep+.001)continue
      if(collider.oriented) {
        if(distanceToSegment(x,z,collider.ax,collider.az,collider.bx,collider.bz)<r+collider.thickness/2) {
          if(record)recordCandidates('blocked',examined)
          return collider.name
        }
      } else if(x+r>collider.minX&&x-r<collider.maxX&&z+r>collider.minZ&&z-r<collider.maxZ) {
        if(record)recordCandidates('blocked',examined)
        return collider.name
      }
    }
    if(record)recordCandidates('blocked',nearbyColliders.length)
    return null
  }

  const candidateStats=()=>Object.fromEntries(Object.entries(queryStats).map(([kind,stats])=>[kind,{
    ...stats,
    averageCandidates:stats.calls?stats.totalCandidates/stats.calls:0,
  }]))

  const resetCandidateStats=()=>{
    for(const stats of Object.values(queryStats))Object.assign(stats,{calls:0,totalCandidates:0,maxCandidates:0,lastCandidates:0})
  }

  const moveInternal=(position,dx,dz,record=true)=>{
    const substeps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/maxSubstep))
    const stepX=dx/substeps,stepZ=dz/substeps
    let currentGround=position.y-player.eyeHeight,moved=false
    const tryAxis=(nextX,nextZ)=>{
      const nextGround=groundHeightAt(nextX,nextZ,currentGround,record)
      const nextEye=nextGround+player.eyeHeight
      if(blocked(nextX,nextZ,nextEye,record))return
      position.x=nextX;position.z=nextZ;currentGround=nextGround;moved=true
    }
    for(let i=0;i<substeps;i++) {
      if(stepX)tryAxis(position.x+stepX,position.z)
      if(stepZ)tryAxis(position.x,position.z+stepZ)
    }
    position.y=currentGround+player.eyeHeight
    return moved
  }

  const move=(position,dx,dz)=>moveInternal(position,dx,dz,true)

  const targetClear=(x,z,ground,record=false,spatialContext=null)=>!blocked(x,z,ground+player.eyeHeight,record,spatialContext)

  const traceDirectPath=(start,target,{step=maxSubstep,tolerance=.25,maxDistance=20}={})=>{
    const position=start.clone(),dx=target.x-position.x,dz=target.z-position.z,distance=Math.hypot(dx,dz)
    if(distance>maxDistance+.001)return {reachable:false,reason:'distance',distance,position}
    if(distance<=tolerance)return {reachable:true,reason:'already-there',distance,remaining:distance,position}
    const steps=Math.max(1,Math.ceil(distance/Math.max(.02,step))),stepX=dx/steps,stepZ=dz/steps
    let stalled=0
    for(let index=0;index<steps;index++) {
      const beforeX=position.x,beforeZ=position.z
      moveInternal(position,stepX,stepZ,false)
      if(Math.hypot(position.x-beforeX,position.z-beforeZ)<.0001)stalled++
      else stalled=0
      if(stalled>=3)break
    }
    const remaining=Math.hypot(target.x-position.x,target.z-position.z)
    const heightError=Math.abs((position.y-player.eyeHeight)-target.y)
    return {reachable:remaining<=tolerance&&heightError<=player.maxStep+.08,reason:remaining<=tolerance?'reached':'blocked',distance,remaining,heightError,position}
  }

  const intersectWalkSurface=(ray,surface)=>{
    let slopeX=0,slopeZ=0,offset=0
    if(surface.type==='slopeX'){
      slopeX=(surface.yEnd-surface.yStart)/(surface.xEnd-surface.xStart)
      offset=surface.yStart-slopeX*surface.xStart
    }else if(surface.type==='slopeZ'){
      slopeZ=(surface.yEnd-surface.yStart)/(surface.zEnd-surface.zStart)
      offset=surface.yStart-slopeZ*surface.zStart
    }else if(surface.type==='ramp'){
      const vx=surface.bx-surface.ax,vz=surface.bz-surface.az,lengthSquared=vx*vx+vz*vz
      const rise=surface.yEnd-surface.yStart
      slopeX=rise*vx/lengthSquared;slopeZ=rise*vz/lengthSquared
      offset=surface.yStart-slopeX*surface.ax-slopeZ*surface.az
    }else offset=surface.height
    const denominator=ray.direction.y-slopeX*ray.direction.x-slopeZ*ray.direction.z
    if(Math.abs(denominator)<1e-6)return null
    const t=(slopeX*ray.origin.x+slopeZ*ray.origin.z+offset-ray.origin.y)/denominator
    if(t<=0)return null
    const x=ray.origin.x+ray.direction.x*t,z=ray.origin.z+ray.direction.z*t
    if(!surfaceContains(surface,x,z))return null
    return {t,point:new THREE.Vector3(x,surfaceHeightAt(surface,x,z),z),surface:surface.name}
  }

  const surfaceNameAt=(x,z,height,surfaces=nearbySpatialItems(walkSurfaceGrid,x,z))=>{
    let best=null,bestError=Infinity
    for(const surface of surfaces) {
      if(!surfaceContains(surface,x,z))continue
      const error=Math.abs(surfaceHeightAt(surface,x,z)-height)
      if(error<bestError){best=surface.name;bestError=error}
    }
    return bestError<=player.maxStep+.08?best:'terrain'
  }

  const walkSurfacesAlongRay=(ray,maxHorizontalDistance)=>{
    const horizontalLength=Math.hypot(ray.direction.x,ray.direction.z)
    if(horizontalLength<1e-6)return []
    const step=.75,seen=new Set(),surfaces=[]
    for(let distance=0;distance<=maxHorizontalDistance+localQueryRadius;distance+=step) {
      const x=ray.origin.x+ray.direction.x/horizontalLength*distance,z=ray.origin.z+ray.direction.z/horizontalLength*distance
      for(const surface of nearbySpatialItems(walkSurfaceGrid,x,z))if(!seen.has(surface)) {seen.add(surface);surfaces.push(surface)}
    }
    return surfaces
  }

  const validateRayTarget=(point,start,{surface,minHorizontalDistance,maxHorizontalDistance,rawPoint=null,spatialContext=null})=>{
    const horizontalDistance=Math.hypot(point.x-start.x,point.z-start.z)
    if(horizontalDistance<minHorizontalDistance||horizontalDistance>maxHorizontalDistance)return null
    if(!targetClear(point.x,point.z,point.y,false,spatialContext))return null
    const trace=traceDirectPath(start,point,{tolerance:.28,maxDistance:maxHorizontalDistance})
    if(!trace.reachable)return null
    const snapDistance=rawPoint?Math.hypot(point.x-rawPoint.x,point.z-rawPoint.z):0
    return {point,horizontalDistance,trace,surface,snapped:Boolean(rawPoint),snapDistance,rawPoint:rawPoint?.clone()??null}
  }

  // 原始落点不安全时，仅在其附近做小范围数值搜索。优先尝试视线两侧的
  // 通道，再尝试玩家一侧与远侧；每个候选仍执行同层、占位和直达验证。
  const resolveNearbyTarget=(rawPoint,start,options)=>{
    const towardPlayer=Math.atan2(start.z-rawPoint.z,start.x-rawPoint.x)
    const spatialContext={
      colliders:nearbySpatialItems(colliderGrid,rawPoint.x,rawPoint.z,localQueryRadius),
      walkSurfaces:nearbySpatialItems(walkSurfaceGrid,rawPoint.x,rawPoint.z,localQueryRadius),
    }
    for(const radius of snapRadii) {
      for(const angleOffset of snapAngleOffsets) {
        const angle=towardPlayer+angleOffset,x=rawPoint.x+Math.cos(angle)*radius,z=rawPoint.z+Math.sin(angle)*radius
        const ground=groundHeightAt(x,z,rawPoint.y+player.maxStep,false,spatialContext)
        if(Math.abs(ground-rawPoint.y)>player.maxStep+.08)continue
        const point=new THREE.Vector3(x,ground,z)
        const resolved=validateRayTarget(point,start,{
          ...options,surface:surfaceNameAt(x,z,ground,spatialContext.walkSurfaces),rawPoint,spatialContext,
        })
        if(resolved)return resolved
      }
    }
    return null
  }

  // 中央准星只求二十米内最近的导航表面。楼梯、坡道和平台直接与它们的
  // 数值平面求交，普通地形则迭代收敛；不构建渲染网格，也不扫描场景树。
  const resolveRayTarget=(ray,{reference=0,minHorizontalDistance=.45,maxHorizontalDistance=20,iterations=6}={})=>{
    if(ray.direction.y>=-.001)return null
    const intersections=[]
    let targetGround=reference,t=(ray.origin.y-targetGround)/-ray.direction.y
    for(let index=0;index<iterations;index++) {
      if(t<=0)return null
      const x=ray.origin.x+ray.direction.x*t,z=ray.origin.z+ray.direction.z*t
      targetGround=baseHeightAt(x,z)
      t=(ray.origin.y-targetGround)/-ray.direction.y
    }
    if(t<=0)return null
    intersections.push({t,point:new THREE.Vector3(ray.origin.x+ray.direction.x*t,targetGround,ray.origin.z+ray.direction.z*t),surface:'terrain'})
    for(const surface of walkSurfacesAlongRay(ray,maxHorizontalDistance)){const hit=intersectWalkSurface(ray,surface);if(hit)intersections.push(hit)}
    intersections.sort((a,b)=>a.t-b.t)
    const nearest=intersections[0]
    if(!nearest)return null
    const {point}=nearest
    const start=ray.origin.clone()
    const rawHorizontalDistance=Math.hypot(point.x-start.x,point.z-start.z)
    if(rawHorizontalDistance<minHorizontalDistance||rawHorizontalDistance>maxHorizontalDistance)return null
    const options={surface:nearest.surface,minHorizontalDistance,maxHorizontalDistance}
    return validateRayTarget(point,start,options)??resolveNearbyTarget(point,start,options)
  }

  return {
    colliders,walkSurfaces,maxSubstep,
    addAabb,addAabbBounds,addSegment,addSlopeColliderX,
    addWalkRect,addWalkPolygon,addWalkSlopeX,addWalkSlopeZ,addWalkRamp,
    surfaceContains,surfaceHeightAt,groundHeightAt,blocked,move,
    targetClear,traceDirectPath,resolveRayTarget,intersectWalkSurface,
    snapPolicy:{maxDistance:snapRadii.at(-1),radii:[...snapRadii],directions:snapAngleOffsets.length},
    spatialPolicy:{cellSize:spatialCellSize,queryRadius:localQueryRadius,colliderCells:colliderGrid.size,walkSurfaceCells:walkSurfaceGrid.size},
    candidateStats,resetCandidateStats,
  }
}

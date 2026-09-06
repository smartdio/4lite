import * as THREE from 'three'
import {createBirdFlight} from './bird-motion.js'
import {BIRD_CONFIG} from './bird-config.js'

export function birdPointInPolygon(x,z,polygon) {
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [a,b]=polygon[i],[c,d]=polygon[j]
    if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)inside=!inside
  }
  return inside
}
// Swept box against cached conservative proxies, including zero-length LOS probes.
export function birdSegmentHitsBox(a,b,box,radius=0,height=radius,offset=0) {
  let lo=0,hi=1
  for(const [axis,pad,shift] of [['x',radius,0],['y',height,offset],['z',radius,0]]) {
    const min=box[`min${axis.toUpperCase()}`]-pad,max=box[`max${axis.toUpperCase()}`]+pad
    const start=a[axis]+shift,delta=b[axis]-a[axis]
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;continue}
    const t1=(min-start)/delta,t2=(max-start)/delta
    lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2))
    if(lo>hi)return false
  }
  return true
}

const collisionTriangle=new THREE.Triangle(),collisionRay=new THREE.Ray()
const ca=new THREE.Vector3(),cb=new THREE.Vector3(),closest=new THREE.Vector3(),direction=new THREE.Vector3()
const d1=new THREE.Vector3(),d2=new THREE.Vector3(),relative=new THREE.Vector3(),edgePoint=new THREE.Vector3(),pathPoint=new THREE.Vector3()
function segmentDistanceSquared(p1,q1,p2,q2) {
  d1.subVectors(q1,p1);d2.subVectors(q2,p2);relative.subVectors(p1,p2)
  const a=d1.lengthSq(),e=d2.lengthSq(),f=d2.dot(relative)
  let s=0,t=0
  if(a<1e-12&&e<1e-12)return p1.distanceToSquared(p2)
  if(a<1e-12)t=THREE.MathUtils.clamp(f/e,0,1)
  else {
    const c=d1.dot(relative)
    if(e<1e-12)s=THREE.MathUtils.clamp(-c/a,0,1)
    else {
      const b=d1.dot(d2),denom=a*e-b*b
      s=denom!==0?THREE.MathUtils.clamp((b*f-c*e)/denom,0,1):0
      t=(b*s+f)/e
      if(t<0){t=0;s=THREE.MathUtils.clamp(-c/a,0,1)}
      else if(t>1){t=1;s=THREE.MathUtils.clamp((b-c)/a,0,1)}
    }
  }
  pathPoint.copy(p1).addScaledVector(d1,s);edgePoint.copy(p2).addScaledVector(d2,t)
  return pathPoint.distanceToSquared(edgePoint)
}
// A swept ellipsoid, reduced to sphere/triangle distance by scaling Y. Triangle
// bounds are broad phase only: a branch's long slanted AABB is not solid wood.
export function birdSegmentHitsTriangle(a,b,triangle,radius,height,offset=0) {
  const scale=radius/height
  ca.set(a.x,(a.y+offset)*scale,a.z);cb.set(b.x,(b.y+offset)*scale,b.z)
  for(const key of ['a','b','c'])collisionTriangle[key].set(triangle[key].x,triangle[key].y*scale,triangle[key].z)
  direction.subVectors(cb,ca);const length=direction.length()
  if(length>1e-9) {
    collisionRay.set(ca,direction.multiplyScalar(1/length))
    if(collisionRay.intersectTriangle(collisionTriangle.a,collisionTriangle.b,collisionTriangle.c,false,closest)&&closest.distanceToSquared(ca)<=length*length)return true
  }
  const r2=radius*radius
  if(collisionTriangle.closestPointToPoint(ca,closest).distanceToSquared(ca)<=r2||collisionTriangle.closestPointToPoint(cb,closest).distanceToSquared(cb)<=r2)return true
  return segmentDistanceSquared(ca,cb,collisionTriangle.a,collisionTriangle.b)<=r2||segmentDistanceSquared(ca,cb,collisionTriangle.b,collisionTriangle.c)<=r2||segmentDistanceSquared(ca,cb,collisionTriangle.c,collisionTriangle.a)<=r2
}

export function createBirdProxyIndex(boxes,cellSize=4) {
  const grid=new Map(),seen=new Uint32Array(boxes.length)
  let stamp=0,checks=0,queries=0,maxCandidates=0,lastHit=null
  for(const [id,b] of boxes.entries())for(let x=Math.floor(b.minX/cellSize);x<=Math.floor(b.maxX/cellSize);x++)for(let z=Math.floor(b.minZ/cellSize);z<=Math.floor(b.maxZ/cellSize);z++) {
    const key=`${x},${z}`
    if(!grid.has(key))grid.set(key,[])
    grid.get(key).push(id)
  }
  return {
    clear(a,b,radius=0,height=radius,offset=0,filter=null) {
      if(++stamp===0xffffffff){seen.fill(0);stamp=1}
      queries++;let candidates=0,clear=true
      for(let x=Math.floor((Math.min(a.x,b.x)-radius)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+radius)/cellSize)&&clear;x++)for(let z=Math.floor((Math.min(a.z,b.z)-radius)/cellSize);z<=Math.floor((Math.max(a.z,b.z)+radius)/cellSize)&&clear;z++) {
        const bucket=grid.get(`${x},${z}`)
        if(!bucket)continue
        for(const id of bucket) {
          if(seen[id]===stamp)continue
          seen[id]=stamp;const box=boxes[id]
          if(filter&&!filter(box))continue
          candidates++;checks++
          if(birdSegmentHitsBox(a,b,box,radius,height,offset)&&(!box.triangle||birdSegmentHitsTriangle(a,b,box.triangle,radius,height,offset))){lastHit=box;clear=false;break}
        }
      }
      maxCandidates=Math.max(maxCandidates,candidates);return clear
    },
    lastHit:()=>lastHit,
    snapshot:()=>({boxes:boxes.length,cells:grid.size,queries,checks,maxCandidates}),
  }
}
const vector=p=>new THREE.Vector3(...p)
const boxFromBounds=(bounds,name,kind='solid')=>({name,kind,minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y,minZ:bounds.min.z,maxZ:bounds.max.z})

// Called while the existing tree placement matrix is available. No retained clone,
// extra scene mesh or runtime recursive raycast is needed after binding.
export function captureBirdTree(model,{id,species,center,ground=0}) {
  model.updateMatrixWorld(true)
  const boxes=[],candidates=[],tri=new THREE.Triangle(),normal=new THREE.Vector3()
  const bounds=new THREE.Box3().setFromObject(model)
  model.traverse(mesh=>{
    if(!mesh.isMesh||/soil|root_soil/i.test(mesh.name))return
    const leaves=/foliage|leaf|flower|crown|clump/i.test(mesh.name)
    const g=mesh.geometry,p=g.attributes.position,index=g.index
    for(let i=0,n=index?.count??p.count;i<n;i+=3) {
      tri.a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld)
      tri.b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld)
      tri.c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld)
      boxes.push({...boxFromBounds(new THREE.Box3().setFromPoints([tri.a,tri.b,tri.c]),`${id}:${i}`,leaves?'foliage':'branch'),triangle:tri.clone()})
      if(leaves)continue
      tri.getNormal(normal)
      const pnt=tri.getMidpoint(new THREE.Vector3())
      if(normal.y<.55||pnt.y<ground+1.25||pnt.y>ground+(bounds.max.y-ground)*.83||Math.hypot(pnt.x-center[0],pnt.z-center[1])<.8)continue
      // Stand on the upper edge of a shallow branch face, allowing the feet to settle.
      pnt.y+=.006
      if(candidates.some(c=>c.position.distanceTo(pnt)<.32))continue
      candidates.push({id:`${id}:branch-${i}`,tree:id,species,position:pnt,center,ground})
    }
  })
  return {id,species,boxes,candidates,bounds}
}

export function createBirdSpace({config=BIRD_CONFIG,boundary,colliders,trees=[],architecture=[],groundHeightAt,groundSurfaceAt,activeArea=()=>false}) {
  const boxes=colliders.map(c=>({
    name:c.name,kind:'solid',minX:c.minX??Math.min(c.ax,c.bx)-c.thickness/2,maxX:c.maxX??Math.max(c.ax,c.bx)+c.thickness/2,
    minZ:c.minZ??Math.min(c.az,c.bz)-c.thickness/2,maxZ:c.maxZ??Math.max(c.az,c.bz)+c.thickness/2,
    minY:c.minY??Math.min(c.yStart,c.yEnd)-c.thickness,maxY:c.maxY??Math.max(c.yStart,c.yEnd),
  })).concat(architecture,...trees.map(t=>t.boxes)).filter(b=>Object.values(b).filter(v=>typeof v==='number').every(Number.isFinite))
  const index=createBirdProxyIndex(boxes),solid=b=>b.kind==='solid',probe=new THREE.Vector3(),other=new THREE.Vector3()
  const obstacleTop=Math.max(8,...boxes.map(b=>b.maxY))
  const height=obstacleTop+config.airClearance
  const circuit=config.airCircuit.map(([x,z])=>new THREE.Vector3(x,height,z))
  const zones=config.groundZones.map(z=>({...z,cells:[]})),perches=[]
  let candidateChecks=0,maxCandidateChecks=0,rejectedPaths=0,lastFailure=null
  const safeGround=(p,margin=.48)=>{
    if(!birdPointInPolygon(p.x,p.z,boundary)||activeArea(p))return false
    const y=groundHeightAt(p.x,p.z)
    if(Math.abs(p.y-y)>.04||!/concrete|dirt|earth|mud/.test(groundSurfaceAt(p.x,p.z)))return false
    probe.set(p.x,y+.20,p.z)
    if(!index.clear(probe,probe,margin,.18,0,solid))return false
    for(let i=0;i<8;i++) {
      const x=p.x+Math.cos(i*Math.PI/4)*margin,z=p.z+Math.sin(i*Math.PI/4)*margin
      if(!birdPointInPolygon(x,z,boundary)||Math.abs(groundHeightAt(x,z)-y)>.045)return false
    }
    return true
  }
  const clearFlight=(flight,species)=>{
    const c=config.clearance[species],a=new THREE.Vector3(),b=new THREE.Vector3()
    const steps=Math.ceil(flight.length/.18)
    flight.curve.getPointAt(0,a)
    for(let i=1;i<=steps;i++) {
      flight.curve.getPointAt(i/steps,b)
      // The prevalidated circuit lies above every proxy. Only its descending /
      // ascending endpoint connections need spatial queries at runtime.
      if(Math.min(a.y,b.y)+c.offset-c.height>obstacleTop+.03){a.copy(b);continue}
      const endpointDistance=Math.min(i/steps,1-i/steps)*flight.length
      // Pigeons lift their wings before leaving the ground: validate the full
      // spread at departure, including the stationary preparation footprint.
      const open=species==='pigeon'?1:THREE.MathUtils.clamp((endpointDistance-.35)/.75,0,1)
      const sweepRadius=THREE.MathUtils.lerp(c.foldedRadius,c.radius,open)+.015
      const sweepHeight=THREE.MathUtils.lerp(c.foldedHeight,c.height,open)
      const sweepOffset=THREE.MathUtils.lerp(c.foldedOffset,c.offset,open)
      if(!index.clear(a,b,sweepRadius,sweepHeight,sweepOffset)){lastFailure={a:a.toArray(),b:b.toArray(),hit:index.lastHit()};return false}
      a.copy(b)
    }
    return true
  }
  const flightThrough=(points,species,{minimumDuration=config.minimumFlight}={})=>{
    // Removing coincident points avoids Catmull-Rom cusps at a shared lane node.
    const pts=points.filter((p,i)=>i===0||p.distanceToSquared(points[i-1])>.0025)
    if(pts.length<2)return null
    const flight=createBirdFlight(pts.map(p=>p.toArray()),{speed:species==='sparrow'?4.5:5.5,minimumDuration,rampSeconds:.65,initialSpeed:species==='pigeon'?2.2:0})
    if(clearFlight(flight,species))return flight
    rejectedPaths++;return null
  }
  // Validate the whole circuit, including rounded corners, once for both species.
  const loopPoints=[...circuit,circuit[0],circuit[1]]
  if(!flightThrough(loopPoints,'pigeon'))throw new Error('Bird aerial circuit has insufficient clearance')
  for(const zone of zones) {
    const [x0,x1,z0,z1]=zone.bounds
    for(let x=x0+config.cellSize/2;x<x1;x+=config.cellSize)for(let z=z0+config.cellSize/2;z<z1;z+=config.cellSize) {
      const p=new THREE.Vector3(x,groundHeightAt(x,z),z)
      if(safeGround(p))zone.cells.push(p)
    }
    zone.area=zone.cells.length*config.cellSize**2
  }
  // Portals are attached to the exact transformed branch surfaces. Conservative
  // leaf-card bounds deliberately discard crowded twigs, rather than clip wings.
  for(const tree of trees) {
    let accepted=0
    const ordered=tree.candidates.sort((a,b)=>a.position.y-b.position.y)
    for(const candidate of ordered) {
      if(accepted>=4)break
      const p=candidate.position
      const away=new THREE.Vector3(p.x-candidate.center[0],0,p.z-candidate.center[1]).normalize()
      let portal=null
      for(const [turn,lift] of [[Math.PI/2,.1],[-Math.PI/2,.1],[Math.PI/2,.6],[-Math.PI/2,.6],[0,.6],[Math.PI/4,1.3],[-Math.PI/4,1.3],[Math.PI,1.3]]) {
        const direction=away.clone().applyAxisAngle(new THREE.Vector3(0,1,0),turn)
        const exit=p.clone().addScaledVector(direction,2.8);exit.y+=lift
        const upper=exit.clone();upper.y=height
        const outside=exit.clone().addScaledVector(direction,.8);outside.y+=.6
        const path=[p,p.clone().add(new THREE.Vector3(direction.x*.55,.36,direction.z*.55)),exit,outside,upper]
        if(flightThrough(path,'sparrow')){portal=path;break}
      }
      if(!portal)continue
      const zone=p.z>-24?'front-courtyard':p.z<-48?'old-classroom-yard':'main-playground'
      perches.push({...candidate,kind:'perch',zone,portal});accepted++
    }
  }
  const nearest=p=>circuit.reduce((best,node,i)=>node.distanceToSquared(p)<circuit[best].distanceToSquared(p)?i:best,0)
  const portalFor=(site,species)=>{
    if(site.portal)return site.portal
    const p=site.position,top=new THREE.Vector3(p.x,height,p.z)
    if(site.kind==='ground'||species==='pigeon'){
      const direction=Number.isFinite(site.heading)?new THREE.Vector3(Math.sin(site.heading),0,Math.cos(site.heading)):circuit[nearest(p)].clone().sub(p);direction.y=0
      if(direction.lengthSq()<.01)direction.set(0,0,1);direction.normalize()
      // A pigeon near a wall must push off into the available space first,
      // rather than aim its low takeoff segment through the eventual destination.
      for(const reach of [6,3])for(const turn of [0,Math.PI/2,-Math.PI/2,Math.PI]){
        const outward=direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),turn)
        const path=[p,p.clone().addScaledVector(outward,.55).add(new THREE.Vector3(0,.50,0)),p.clone().addScaledVector(outward,reach*.4).add(new THREE.Vector3(0,reach*.32,0)),p.clone().addScaledVector(outward,reach*.8).add(new THREE.Vector3(0,4.6,0)),top.clone().addScaledVector(outward,reach)]
        if(flightThrough(path,species)){site.portal=path;return path}
      }
      // The same full-wing clearance applies to a constrained vertical fallback.
      return [p,p.clone().add(new THREE.Vector3(0,.8,0)),top]
    }
    return [p,p.clone().add(new THREE.Vector3(0,.8,0)),top]
  }
  const route=(from,to,species)=>{
    const departure=portalFor(from,species),arrival=portalFor(to,species)
    if(from.zone===to.zone&&from.position.distanceTo(to.position)<10) {
      const direction=to.position.clone().sub(from.position);direction.y=0;direction.normalize()
      const points=species==='pigeon'?[from.position,from.position.clone().addScaledVector(direction,.55).add(new THREE.Vector3(0,.55,0)),from.position.clone().lerp(to.position,.5).add(new THREE.Vector3(0,1.8,0)),to.position.clone().addScaledVector(direction,-.55).add(new THREE.Vector3(0,.55,0)),to.position]:[from.position,from.position.clone().add(new THREE.Vector3(0,2,0)),to.position.clone().add(new THREE.Vector3(0,2,0)),to.position]
      const direct=flightThrough(points,species)
      if(direct)return direct
    }
    const a=nearest(departure.at(-1)),b=nearest(arrival.at(-1))
    for(const direction of [1,-1]) {
      const lane=[]
      for(let i=a;;i=(i+direction+circuit.length)%circuit.length){lane.push(circuit[i]);if(i===b)break}
      const flight=flightThrough([...departure,...lane,...arrival.toReversed()],species)
      if(flight)return flight
    }
    return null
  }
  const viewPoint=new THREE.Vector3()
  const visibleScore=(position,species,view)=>{
    const score=view?.score(position,species)??0
    if(!score)return 0
    viewPoint.copy(position);viewPoint.y+=species==='pigeon'?.14:.08
    return index.clear(view.position,viewPoint,.015,.015)?score:0
  }
  const destination=(species,rng,recent=[],player=null,occupied=()=>false,from=null,zoneId=null,{view=null,requireVisible=false,habitat=null}={})=>{
    let checked=0
    // Birds already on the ground at entry can rest just outside the escape
    // radius. Every actual landing keeps the wider buffer, even out of roaming.
    const playerClearance=config.proximity[species][from?'landing':'initial']
    const pools=zones.filter(z=>!zoneId||z.id===zoneId).flatMap(zone=>{
      // Weight habitats separately: thousands of ground cells must not crowd
      // the small, carefully checked branch pool out of a sparrow's choices.
      const habitats=[{kind:'ground',all:zone.cells,weight:species==='sparrow'?config.sparrowGroundWeight:1}]
      if(species==='sparrow')habitats.push({kind:'perch',all:perches.filter(p=>p.zone===zone.id),weight:1-config.sparrowGroundWeight})
      const available=habitats.filter(h=>h.all.length&&(!habitat||h.kind===habitat))
      const total=available.reduce((sum,h)=>sum+h.weight,0)
      return available.map(({kind,all,weight})=>{
        const items=player?all.filter(item=>(item.position??item).distanceToSquared(player)>=playerClearance**2):all
        return {zone,kind,items,availableFraction:items.length/all.length,habitatWeight:weight/total}
      })
    }).filter(p=>p.items.length)
    const weights=pools.map(p=>p.zone.area*p.availableFraction*p.habitatWeight*(recent.includes(p.zone.id)?.2:1))
    // Scan cached points only when choosing a destination. Keep area weighting,
    // but give nearby, in-frame points the first twelve of sixteen safety checks.
    const preferred=view?.ready?pools.map((pool,i)=>{
      const items=pool.items.map(item=>({item,score:view.score(item.position??item,species)}))
        .filter(({item,score})=>score>0&&(!player||(item.position??item).distanceTo(player)>=playerClearance))
      return {...pool,items,weight:weights[i]*items.length/pool.items.length}
    }).filter(pool=>pool.items.length):[]
    const pick=(items,weights)=>{
      let ticket=rng()*weights.reduce((a,b)=>a+b,0),i=0
      for(;i<weights.length-1&&ticket>=weights[i];i++)ticket-=weights[i]
      return items[i]
    }
    for(;checked<config.candidateLimit&&pools.length;checked++) {
      const prefer=preferred.length&&(requireVisible||checked<config.visibility.preferredCandidates)
      if(requireVisible&&!prefer)break
      const pool=prefer?pick(preferred,preferred.map(p=>p.weight)):pick(pools,weights)
      const item=prefer?pick(pool.items,pool.items.map(p=>p.score)).item:pool.items[Math.floor(rng()*pool.items.length)]
      const site=pool.kind==='perch'?item:{kind:'ground',zone:pool.zone.id,position:item.clone().add(new THREE.Vector3((rng()-.5)*.45,0,(rng()-.5)*.45)),radius:config.patchRadius[0]+rng()*(config.patchRadius[1]-config.patchRadius[0])}
      if(prefer&&!visibleScore(site.position,species,view))continue
      if(site.kind==='ground'){site.position.y=groundHeightAt(site.position.x,site.position.z);if(!safeGround(site.position)||(!from&&!flightThrough(portalFor(site,species),species)))continue}
      if(from&&site.position.distanceTo(from.position)<2||player&&site.position.distanceTo(player)<playerClearance||occupied(site))continue
      const flight=from?route(from,site,species):null
      if(from&&!flight)continue
      checked++;candidateChecks+=checked;maxCandidateChecks=Math.max(maxCandidateChecks,checked)
      return {site,flight}
    }
    candidateChecks+=checked;maxCandidateChecks=Math.max(maxCandidateChecks,checked);return null
  }
  return {config,zones,perches,circuit,height,index,debug:()=>({lastFailure}),safeGround,clearFlight,flightThrough,route,destination,visibleScore,
    available:(site,species,player)=>!(player&&site.position.distanceTo(player)<config.proximity[species].landing)&&!activeArea(site.position)&&(!(site.kind==='ground'||species==='pigeon')||safeGround(site.position)),
    lineOfSight:(a,b)=>index.clear(a,b,.03,.03,0,solid),
    snapshot:()=>({height,regions:zones.map(z=>({id:z.id,area:z.area,cells:z.cells.length})),perches:perches.map(p=>({id:p.id,tree:p.tree,species:p.species,zone:p.zone,position:p.position.toArray()})),circuit:circuit.map(p=>p.toArray()),proxy:index.snapshot(),candidateChecks,maxCandidateChecks,rejectedPaths}),
    groundHeightAt,
  }
}

import * as THREE from 'three'
import {translateRuntimeText} from '../i18n/index.js'
import {getUserDataStore} from '../state/user-data-store.js'

const COLORS={white:0xe2dfd3,pink:0xc7777d,yellow:0xd5bc67,blue:0x6fa8b7,green:0x86a77b}
const NAMESPACE='chalkProjectiles'
const PICK_RADIUS=.065
const SOURCE_PICK_FALLBACK_RADIUS=.025
const COLLISION_RADIUS=.008
const THROW_SPEED=7.5
const GRAVITY=9.81

const roundedArray=(values,digits=4)=>values.map(value=>+value.toFixed(digits))

export function createChalkThrowing({root,camera,renderer,schoolChalk,maxDistance,collisionWorlds,onEvent}) {
  const group=new THREE.Group();group.name='thrown-school-chalk';root.add(group)
  const indicator=document.createElement('div')
  indicator.className='chalk-held-indicator';indicator.textContent=translateRuntimeText('手持粉笔 · 点击抛出')
  document.querySelector('.hud')?.append(indicator)
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2()
  const projectiles=[]
  const materials=new Map(),geometries=new Map()
  const worlds=new Map(collisionWorlds.map(world=>[world.id,{
    ...world,
    boxes:world.boxes.map(box=>({...box,bounds:new THREE.Box3(
      new THREE.Vector3(box.minX,box.minY,box.minZ),new THREE.Vector3(box.maxX,box.maxY,box.maxZ),
    )})),
  }]))
  let held=null,collisions=0,throws=0,collisionChecks=0,currentRoom=null
  // 粉笔只保留当前页面会话状态；清理旧版本曾写入的持久化命名空间。
  getUserDataStore().clearNamespace(NAMESPACE)

  const materialFor=color=>{
    if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({
      name:`thrown-chalk-${color}`,color:COLORS[color]??COLORS.white,roughness:1,metalness:0,
    }))
    return materials.get(color)
  }
  const geometryFor=length=>{
    const key=length<.06?'half':'full'
    if(!geometries.has(key))geometries.set(key,new THREE.CylinderGeometry(.0055,.0055,length,8,1,false))
    return geometries.get(key)
  }
  const createProjectile=({sourceId,classroom,color,length,position,quaternion,status='held'})=>{
    const mesh=new THREE.Mesh(geometryFor(length),materialFor(color))
    mesh.name=`thrown-${sourceId}`;mesh.userData.chalkProjectile=true
    mesh.position.fromArray(position);if(quaternion)mesh.quaternion.fromArray(quaternion)
    mesh.visible=true;mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh)
    const item={sourceId,classroom,color,length,mesh,status,velocity:new THREE.Vector3(),angularVelocity:new THREE.Vector3(),age:0,bounces:0}
    projectiles.push(item);return item
  }
  const setPointer=(clientX,clientY,useCenter)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
    raycaster.near=0;raycaster.far=Infinity
    raycaster.setFromCamera(pointer,camera)
  }
  const hitPickable=(clientX,clientY,useCenter=false)=>{
    if(held)return null
    setPointer(clientX,clientY,useCenter)
    const sourceHit=schoolChalk.raycastPickable(raycaster,maxDistance)
    let closest=sourceHit?{...sourceHit,projectile:null,missDistance:0}:null
    const point=new THREE.Vector3(),delta=new THREE.Vector3(),nearest=new THREE.Vector3()
    const considerItem=(item,projectile=null)=>{
      point.fromArray(item.position);delta.copy(point).sub(raycaster.ray.origin)
      const distanceAlong=delta.dot(raycaster.ray.direction)
      if(distanceAlong<=0||distanceAlong>maxDistance)return
      nearest.copy(raycaster.ray.direction).multiplyScalar(distanceAlong).add(raycaster.ray.origin)
      const missDistance=nearest.distanceTo(point)
      if(missDistance>PICK_RADIUS||closest&&distanceAlong>=closest.distance)return
      closest={item,projectile,distance:distanceAlong,missDistance}
    }
    if(!sourceHit)for(const item of schoolChalk.pickables()) {
      point.fromArray(item.position);delta.copy(point).sub(raycaster.ray.origin)
      const distanceAlong=delta.dot(raycaster.ray.direction)
      if(distanceAlong<=0||distanceAlong>maxDistance)continue
      nearest.copy(raycaster.ray.direction).multiplyScalar(distanceAlong).add(raycaster.ray.origin)
      const missDistance=nearest.distanceTo(point)
      if(missDistance>SOURCE_PICK_FALLBACK_RADIUS||closest&&distanceAlong>=closest.distance)continue
      closest={item,projectile:null,distance:distanceAlong,missDistance}
    }
    for(const projectile of projectiles)if(projectile.status==='settled')considerItem({
      id:projectile.sourceId,classroom:projectile.classroom,color:projectile.color,length:projectile.length,
      position:projectile.mesh.position.toArray(),
    },projectile)
    if(!closest)return null
    return closest
  }
  const pickup=hit=>{
    if(hit.projectile) {
      held=hit.projectile;held.status='held';held.mesh.visible=true
      held.velocity.set(0,0,0);held.angularVelocity.set(0,0,0);held.bounces=0
    } else {
      const source=schoolChalk.take(hit.item.id)
      if(!source)return null
      held=createProjectile({...source,sourceId:source.id,position:source.position,status:'held'})
    }
    placeHeld()
    indicator.classList.add('active')
    onEvent?.({type:'pickup',sourceId:held.sourceId,color:held.color,from:hit.projectile?'settled':'teacher-desk'})
    return {type:'pickup',sourceId:held.sourceId,color:held.color,from:hit.projectile?'settled':'teacher-desk'}
  }
  const throwHeld=()=>{
    if(!held)return null
    const direction=new THREE.Vector3();camera.getWorldDirection(direction).normalize()
    held.mesh.position.copy(camera.position).addScaledVector(direction,.38).addScaledVector(camera.up,-.06)
    held.mesh.visible=true
    held.velocity.copy(direction).multiplyScalar(THROW_SPEED).addScaledVector(camera.up,.35)
    const sign=(throws++%2)*2-1
    held.angularVelocity.set(10*sign,16,-7*sign);held.status='flying';held.age=0
    const result={type:'throw',sourceId:held.sourceId,speed:+held.velocity.length().toFixed(2)}
    held=null;indicator.classList.remove('active');onEvent?.(result);return result
  }
  const recallClassroom=classroom=>{
    if(!classroom||classroom!==currentRoom)return null
    const recalled=projectiles.filter(item=>item.classroom===classroom).length
    for(let index=projectiles.length-1;index>=0;index--)if(projectiles[index].classroom===classroom) {
      group.remove(projectiles[index].mesh);projectiles.splice(index,1)
    }
    held=null;indicator.classList.remove('active')
    schoolChalk.resetClassroom(classroom)
    const result={type:'recall',classroom,recalled}
    onEvent?.(result);return result
  }
  const hitRecallBox=(clientX,clientY,useCenter=false)=>{
    setPointer(clientX,clientY,useCenter)
    const hit=schoolChalk.raycastBox(raycaster,maxDistance)
    return hit?.box.classroom===currentRoom?hit:null
  }
  const interact=(clientX,clientY,useCenter=false)=>{
    const boxHit=hitRecallBox(clientX,clientY,useCenter)
    if(boxHit)return recallClassroom(boxHit.box.classroom)
    if(held)return throwHeld()
    const hit=hitPickable(clientX,clientY,useCenter)
    return hit?pickup(hit):null
  }

  const placeHeld=()=>{
    if(!held)return
    const direction=new THREE.Vector3(),right=new THREE.Vector3()
    camera.getWorldDirection(direction);right.crossVectors(direction,camera.up).normalize()
    held.mesh.position.copy(camera.position).addScaledVector(direction,.32).addScaledVector(right,.16).addScaledVector(camera.up,-.12)
    held.mesh.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2))
  }

  const boxNormal=(point,box)=>{
    const faces=[
      [Math.abs(point.x-box.minX),-1,0,0],[Math.abs(point.x-box.maxX),1,0,0],
      [Math.abs(point.y-box.minY),0,-1,0],[Math.abs(point.y-box.maxY),0,1,0],
      [Math.abs(point.z-box.minZ),0,0,-1],[Math.abs(point.z-box.maxZ),0,0,1],
    ].sort((a,b)=>a[0]-b[0])
    return new THREE.Vector3(faces[0][1],faces[0][2],faces[0][3])
  }
  const hitWorld=(classroom,origin,direction,maxTravel)=>{
    const world=worlds.get(classroom)
    if(!world)return null
    const ray=raycaster.ray
    ray.set(origin,direction);let closest=null
    const consider=(distance,point,normal,name)=>{
      if(distance<0||distance>maxTravel||closest&&distance>=closest.distance)return
      closest={distance,point,normal,name}
    }
    const plane=(axis,value,normal,name)=>{
      const component=direction[axis]
      if(Math.abs(component)<1e-8)return
      const distance=(value-origin[axis])/component
      if(distance<0||distance>maxTravel)return
      const point=origin.clone().addScaledVector(direction,distance)
      consider(distance,point,normal,name)
    }
    const [minX,maxX,minZ,maxZ]=world.bounds
    plane('x',minX,new THREE.Vector3(1,0,0),'classroom-west-wall')
    plane('x',maxX,new THREE.Vector3(-1,0,0),'classroom-east-wall')
    plane('z',minZ,new THREE.Vector3(0,0,1),'classroom-north-wall')
    plane('z',maxZ,new THREE.Vector3(0,0,-1),'classroom-south-wall')
    plane('y',world.floorY,new THREE.Vector3(0,1,0),'classroom-floor')
    plane('y',world.ceilingY,new THREE.Vector3(0,-1,0),'classroom-ceiling')
    const point=new THREE.Vector3()
    for(const box of world.boxes) {
      collisionChecks++
      const hit=ray.intersectBox(box.bounds,point)
      if(!hit)continue
      const distance=origin.distanceTo(hit)
      if(distance<=maxTravel)consider(distance,hit.clone(),boxNormal(hit,box),box.name)
    }
    return closest
  }
  const hitClassroom=(item,direction,maxTravel)=>hitWorld(item.classroom,item.mesh.position,direction,maxTravel)
  const settle=(item,normal)=>{
    item.status='settled';item.velocity.set(0,0,0);item.angularVelocity.set(0,0,0)
    const tangent=new THREE.Vector3(1,0,0).projectOnPlane(normal)
    if(tangent.lengthSq()<.1)tangent.set(0,0,1).projectOnPlane(normal)
    tangent.normalize()
    item.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent)
    onEvent?.({type:'settled',sourceId:item.sourceId,bounces:item.bounces})
  }
  const stepProjectile=(item,dt)=>{
    const steps=Math.min(8,Math.max(1,Math.ceil(dt/(1/120)))),step=dt/steps
    for(let index=0;index<steps&&item.status==='flying';index++) {
      item.age+=step;item.velocity.y-=GRAVITY*step
      const displacement=item.velocity.clone().multiplyScalar(step),distance=displacement.length()
      if(distance<1e-6)continue
      const hit=hitClassroom(item,displacement.clone().normalize(),distance+COLLISION_RADIUS)
      if(!hit) {
        item.mesh.position.add(displacement)
      } else {
        const normal=hit.normal,incoming=item.velocity.dot(normal)
        const impactSpeed=Math.abs(incoming)
        item.mesh.position.copy(hit.point).addScaledVector(normal,COLLISION_RADIUS+.001)
        if(incoming<0) {
          const tangent=item.velocity.clone().addScaledVector(normal,-incoming).multiplyScalar(.52)
          item.velocity.copy(tangent).addScaledVector(normal,-incoming*.18)
          item.angularVelocity.multiplyScalar(.72).add(new THREE.Vector3(normal.z*5,2,-normal.x*5))
        }
        item.bounces++;collisions++
        if(impactSpeed>.16)onEvent?.({type:'collision',sourceId:item.sourceId,bounces:item.bounces,speed:impactSpeed,surface:hit.name})
        if(normal.y>.55&&item.age>.12&&item.velocity.length()<.42)settle(item,normal)
      }
      if(item.mesh.position.y<-3) {
        item.mesh.position.y=-2.9;settle(item,new THREE.Vector3(0,1,0))
      }
    }
    if(item.status==='flying') {
      const angularSpeed=item.angularVelocity.length()
      if(angularSpeed>1e-4) {
        const rotation=new THREE.Quaternion().setFromAxisAngle(item.angularVelocity.clone().normalize(),angularSpeed*dt)
        item.mesh.quaternion.premultiply(rotation)
      }
    }
  }
  const update=dt=>{
    const nextRoom=[...worlds.values()].find(world=>{
      const [minX,maxX,minZ,maxZ]=world.bounds
      return camera.position.x>=minX&&camera.position.x<=maxX&&camera.position.z>=minZ&&camera.position.z<=maxZ&&
        camera.position.y>=world.floorY&&camera.position.y<=world.ceilingY
    })?.id??null
    if(nextRoom!==currentRoom) {
      if(currentRoom) {
        if(held?.classroom===currentRoom){group.remove(held.mesh);projectiles.splice(projectiles.indexOf(held),1);held=null;indicator.classList.remove('active')}
        for(let index=projectiles.length-1;index>=0;index--)if(projectiles[index].classroom===currentRoom) {
          group.remove(projectiles[index].mesh);projectiles.splice(index,1)
        }
        schoolChalk.resetClassroom(currentRoom)
      }
      currentRoom=nextRoom;schoolChalk.activateClassroom(currentRoom)
    }
    placeHeld()
    for(const item of projectiles)if(item.status==='flying')stepProjectile(item,dt)
  }

  return {
    interact,hitPickable,hitRecallBox,recallClassroom,throwHeld,update,hasHeld:()=>Boolean(held),
    snapshot:()=>({
      policy:{maxDistance,requiresClearLineOfSight:true,roomLocked:true},pickable:'teacher-desk-and-settled-chalk',
      sourcePickables:schoolChalk.pickables().length,settledPickables:projectiles.filter(item=>item.status==='settled').length,
      pickables:schoolChalk.pickables().length+projectiles.filter(item=>item.status==='settled').length,
      held:held?{sourceId:held.sourceId,color:held.color}:null,throws,collisions,
      persistence:'until-classroom-exit',currentRoom,collisionEngine:'classroom-analytic-aabb',collisionChecks,
      projectiles:projectiles.map(item=>({
        sourceId:item.sourceId,classroom:item.classroom,color:item.color,status:item.status,bounces:item.bounces,
        visible:item.mesh.visible,
        roomBounds:[...worlds.get(item.classroom).bounds],
        position:roundedArray(item.mesh.position.toArray()),velocity:roundedArray(item.velocity.toArray()),
      })),
    }),
  }
}

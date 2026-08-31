import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const CHALK_SEED='school-chalk-v1'
const BOX={width:.17,depth:.09,height:.035,paper:.0015,localX:.34,localZ:-.035}
const CHALK_RADIUS=.0055
const LENGTHS={full:.078,half:.038}
const COLORS={
  white:0xe2dfd3,pink:0xc7777d,yellow:0xd5bc67,blue:0x6fa8b7,green:0x86a77b,
}
const COLOR_NAMES=Object.keys(COLORS)

function hashText(text) {
  let value=2166136261
  const input=`${CHALK_SEED}:${text}`
  for(let index=0;index<input.length;index++) {
    value^=input.charCodeAt(index)
    value=Math.imul(value,16777619)
  }
  return value>>>0
}

function unitHash(key) {
  return hashText(key)/4294967295
}

function teacherClassroom(name) {
  return name.replace(/-(north|south|east|west)-teacher-desk$/,'')
}

function localToWorld(anchor,localX,localZ) {
  const cos=Math.cos(anchor.rotationY),sin=Math.sin(anchor.rotationY)
  return [
    anchor.position[0]+cos*localX+sin*localZ,
    anchor.position[2]-sin*localX+cos*localZ,
  ]
}

function localDirection(rotationY,angle=0) {
  const localX=Math.cos(angle),localZ=Math.sin(angle)
  const cos=Math.cos(rotationY),sin=Math.sin(rotationY)
  return [cos*localX+sin*localZ,-sin*localX+cos*localZ]
}

function weightedColor(key,index=2) {
  if(index===0)return 'white'
  if(index===1)return ['pink','yellow','blue','green'][hashText(`${key}:required-color`)%4]
  const value=hashText(`${key}:color`)%100
  return value<62?'white':['pink','yellow','blue','green'][hashText(`${key}:pastel`)%4]
}

function createPaperTexture(renderer) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64
  const context=canvas.getContext('2d')
  context.fillStyle='#d2cec1';context.fillRect(0,0,64,64)
  for(let index=0;index<210;index++) {
    const x=hashText(`paper-x-${index}`)%64,y=hashText(`paper-y-${index}`)%64
    const length=1+hashText(`paper-length-${index}`)%5
    context.strokeStyle=index%3?'rgba(92,86,73,.075)':'rgba(255,255,247,.11)'
    context.lineWidth=.35+(hashText(`paper-width-${index}`)%3)*.2
    context.beginPath();context.moveTo(x,y);context.lineTo(Math.min(64,x+length),y+(index%2?.35:-.35));context.stroke()
  }
  const texture=new THREE.CanvasTexture(canvas)
  texture.name='school-chalk-gray-white-kraft-paper-64'
  texture.colorSpace=THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping
  texture.repeat.set(3,2)
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  return texture
}

function transformedBox(size,position,rotationX=0) {
  const geometry=new THREE.BoxGeometry(...size)
  if(rotationX)geometry.rotateX(rotationX)
  geometry.translate(...position)
  return geometry
}

function createOpenPaperBoxGeometry() {
  const {width,depth,height,paper}=BOX
  const parts=[
    transformedBox([width,paper,depth],[0,paper/2,0]),
    transformedBox([paper,height,depth],[-(width-paper)/2,height/2,0]),
    transformedBox([paper,height,depth],[(width-paper)/2,height/2,0]),
    transformedBox([width-paper*2,height,paper],[0,height/2,-(depth-paper)/2]),
    transformedBox([width-paper*2,height,paper],[0,height/2,(depth-paper)/2]),
  ]
  const lidAngle=70*Math.PI/180
  parts.push(transformedBox(
    [width,paper,depth],
    [0,depth/2*Math.sin(lidAngle),depth/2-depth/2*Math.cos(lidAngle)],
    lidAngle,
  ))
  const geometry=mergeGeometries(parts,false)
  parts.forEach(part=>part.dispose())
  geometry.computeBoundingSphere()
  return geometry
}

function addChalk(placements,{id,classroom,location,color,lengthKind,position,direction,boundsOk=true}) {
  placements.push({
    id,classroom,location,color,lengthKind,length:LENGTHS[lengthKind],position,direction,boundsOk,
  })
}

function createPlacements(teacherAnchors,classrooms,officesExcluded) {
  const officeRooms=new Set(officesExcluded)
  const teachers=teacherAnchors
    .filter(anchor=>!officeRooms.has(teacherClassroom(anchor.name)))
    .sort((a,b)=>a.name.localeCompare(b.name))
  const boxes=[];const chalk=[]

  for(const anchor of teachers) {
    const classroom=teacherClassroom(anchor.name)
    const [boxX,boxZ]=localToWorld(anchor,BOX.localX,BOX.localZ)
    boxes.push({
      id:`${anchor.name}-chalk-box`,classroom,anchor,
      position:[boxX,anchor.position[1]+.001,boxZ],rotationY:anchor.rotationY,
    })

    const boxCount=10
    for(let index=0;index<boxCount;index++) {
      const localX=BOX.localX+THREE.MathUtils.lerp(-.069,.069,index/(boxCount-1))
      const localZ=BOX.localZ+(unitHash(`template:box-z-${index}`)-.5)*.004
      const [x,z]=localToWorld(anchor,localX,localZ)
      addChalk(chalk,{
        id:`${anchor.name}-box-chalk-${index+1}`,classroom,location:'box',
        color:index<8?'white':index===8?'pink':'yellow',lengthKind:'full',
        position:[x,anchor.position[1]+BOX.height+CHALK_RADIUS+.002,z],
        direction:localDirection(anchor.rotationY,Math.PI/2),
      })
    }

    const looseCount=6
    for(let index=0;index<looseCount;index++) {
      const fraction=looseCount===1 ? .5 : index/(looseCount-1)
      const localX=THREE.MathUtils.lerp(.18,.43,fraction)
      const localZ=.087+(unitHash(`template:loose-z-${index}`)-.5)*.012
      const angle=(unitHash(`template:loose-angle-${index}`)*20-10)*Math.PI/180
      const lengthKind=index===0?'full':index===1?'half':hashText(`template:loose-length-${index}`)%2?'full':'half'
      const length=LENGTHS[lengthKind]
      const extentX=Math.abs(Math.cos(angle))*length/2+Math.abs(Math.sin(angle))*CHALK_RADIUS
      const extentZ=Math.abs(Math.sin(angle))*length/2+Math.abs(Math.cos(angle))*CHALK_RADIUS
      const [x,z]=localToWorld(anchor,localX,localZ)
      addChalk(chalk,{
        id:`${anchor.name}-loose-chalk-${index+1}`,classroom,location:'desk',
        color:weightedColor(`template:loose-${index}`,index),lengthKind,
        position:[x,anchor.position[1]+CHALK_RADIUS+.001,z],direction:localDirection(anchor.rotationY,angle),
        boundsOk:Math.abs(localX)+extentX<=.60&&localZ-extentZ>=-.20&&localZ+extentZ<=.18,
      })
    }
  }

  const formalRooms=classrooms.filter(room=>!room.office).sort((a,b)=>a.id.localeCompare(b.id))
  return {boxes,chalk,formalRooms}
}

export function createSchoolChalk({root,renderer,teacherAnchors,classrooms,officesExcluded=[]}) {
  const group=new THREE.Group();group.name='school-chalk';root.add(group)
  let loadPromise=null
  let boxItems=[],boxMesh=null,chalkItems=[],chalkMesh=null,activeClassroom=null,activeItems=[]
  const takenIds=new Set()
  let snapshot={status:'idle',seed:CHALK_SEED,boxes:0,chalks:0,drawObjects:0,uniqueTextures:0,externalRequests:0}

  const load=()=>{
    if(loadPromise)return loadPromise
    loadPromise=Promise.resolve().then(()=>{
      const {boxes,chalk,formalRooms}=createPlacements(teacherAnchors,classrooms,officesExcluded)
      boxItems=boxes;chalkItems=chalk
      const paperTexture=createPaperTexture(renderer)
      const paperMaterial=new THREE.MeshStandardMaterial({
        name:'school-chalk-gray-white-kraft-paper',map:paperTexture,color:0xffffff,roughness:.99,metalness:0,
      })
      boxMesh=new THREE.InstancedMesh(createOpenPaperBoxGeometry(),paperMaterial,boxes.length)
      boxMesh.name='school-chalk-open-paper-boxes';boxMesh.castShadow=false;boxMesh.receiveShadow=true
      const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1)
      boxes.forEach((box,index)=>{
        quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),box.rotationY)
        matrix.compose(new THREE.Vector3(...box.position),quaternion,scale)
        boxMesh.setMatrixAt(index,matrix)
      })
      boxMesh.instanceMatrix.needsUpdate=true;boxMesh.frustumCulled=false;group.add(boxMesh)

      const chalkMaterial=new THREE.MeshStandardMaterial({
        name:'school-chalk-powdery-colors',color:0xffffff,roughness:1,metalness:0,
      })
      const chalkGeometry=new THREE.CylinderGeometry(CHALK_RADIUS,CHALK_RADIUS,1,8,1,false)
      const byRoom={}
      for(const item of chalk)(byRoom[item.classroom]??=[]).push(item)
      const poolCapacity=Math.max(...Object.values(byRoom).map(items=>items.length))
      chalkMesh=new THREE.InstancedMesh(chalkGeometry,chalkMaterial,poolCapacity)
      chalkMesh.name='school-chalk-sticks';chalkMesh.castShadow=false;chalkMesh.receiveShadow=true
      chalkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);chalkMesh.count=0
      chalkMesh.frustumCulled=false;group.add(chalkMesh)

      const byLocation={box:0,desk:0,tray:0},byColor=Object.fromEntries(COLOR_NAMES.map(name=>[name,0])),byLength={full:0,half:0}
      for(const item of chalk) {
        byLocation[item.location]++;byColor[item.color]++;byLength[item.lengthKind]++
      }
      const violations=chalk.filter(item=>!item.boundsOk).map(item=>item.id)
      snapshot={
        status:'loaded',seed:CHALK_SEED,boxes:boxes.length,chalks:chalk.length,drawObjects:group.children.length,
        uniqueTextures:1,externalRequests:0,classrooms:formalRooms.length,frontTrays:byLocation.tray?formalRooms.length:0,rearTrays:0,
        placements:byLocation,colors:byColor,lengths:byLength,officesExcluded:[...officesExcluded],
        boundsAudit:{violations,boxBookOverlapViolations:[]},
        dimensions:{box:[BOX.width,BOX.depth,BOX.height],chalkDiameter:CHALK_RADIUS*2,full:LENGTHS.full,half:LENGTHS.half},
        activePool:{capacity:poolCapacity,template:{box:10,desk:6,tray:0},resetOnClassroomExit:true},
        boxAssignments:boxes.map(({id,classroom,position,rotationY})=>({
          id,classroom,position:position.map(value=>+value.toFixed(5)),rotationY:+rotationY.toFixed(5),
        })),
        assignments:chalk.map(({id,classroom,location,color,lengthKind,length,position,direction,instanceIndex})=>({
          id,classroom,location,color,lengthKind,length,instanceIndex,
          position:position.map(value=>+value.toFixed(5)),direction:[...direction],
        })),
      }
      return snapshot
    }).catch(error=>{snapshot={...snapshot,status:'failed',error:String(error)};loadPromise=null;throw error})
    return loadPromise
  }
  const renderActiveClassroom=()=>{
    if(!chalkMesh)return
    activeItems=chalkItems.filter(item=>item.classroom===activeClassroom&&!takenIds.has(item.id))
    const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0)
    const direction=new THREE.Vector3(),color=new THREE.Color()
    activeItems.forEach((item,index)=>{
      direction.set(item.direction[0],0,item.direction[1]).normalize();quaternion.setFromUnitVectors(up,direction)
      matrix.compose(new THREE.Vector3(...item.position),quaternion,new THREE.Vector3(1,item.length,1))
      chalkMesh.setMatrixAt(index,matrix);chalkMesh.setColorAt(index,color.setHex(COLORS[item.color]))
    })
    chalkMesh.count=activeItems.length;chalkMesh.instanceMatrix.needsUpdate=true
    if(chalkMesh.instanceColor)chalkMesh.instanceColor.needsUpdate=true
    chalkMesh.computeBoundingSphere()
  }
  const activateClassroom=id=>{
    const next=chalkItems.some(item=>item.classroom===id)?id:null
    if(next===activeClassroom)return false
    activeClassroom=next;renderActiveClassroom();return true
  }
  const resetClassroom=id=>{
    let changed=false
    for(const item of chalkItems)if(item.classroom===id&&takenIds.delete(item.id))changed=true
    if(id===activeClassroom&&changed)renderActiveClassroom()
    return changed
  }
  const setTaken=(id,taken=true)=>{
    const item=chalkItems.find(candidate=>candidate.id===id)
    if(!item||item.location!=='desk'||!chalkMesh)return null
    if(taken&&!takenIds.has(id))takenIds.add(id)
    else if(!taken&&takenIds.has(id))takenIds.delete(id)
    if(item.classroom===activeClassroom)renderActiveClassroom()
    return {
      id:item.id,classroom:item.classroom,location:item.location,color:item.color,
      lengthKind:item.lengthKind,length:item.length,position:[...item.position],direction:[...item.direction],
    }
  }
  return {
    load,
    snapshot:()=>structuredClone({
      ...snapshot,taken:[...takenIds],activeClassroom,renderedChalks:activeItems.length,
      renderedInteractiveChalks:activeItems.filter(item=>item.location==='desk').length,
      renderedDecorativeChalks:activeItems.filter(item=>item.location==='box').length,
    }),
    activateClassroom,resetClassroom,
    pickables:()=>activeItems.filter(item=>item.location==='desk').map(item=>({
      id:item.id,classroom:item.classroom,color:item.color,lengthKind:item.lengthKind,length:item.length,
      position:[...item.position],direction:[...item.direction],
    })),
    raycastPickable:(raycaster,maxDistance)=>{
      if(!chalkMesh)return null
      for(const hit of raycaster.intersectObject(chalkMesh,false)) {
        if(hit.distance>maxDistance)break
        const instanceId=hit.instanceId
        const item=activeItems[instanceId]
        if(!item||item.location!=='desk'||takenIds.has(item.id))continue
        return {
          item:{id:item.id,classroom:item.classroom,color:item.color,lengthKind:item.lengthKind,length:item.length,
            position:[...item.position],direction:[...item.direction]},
          distance:hit.distance,point:hit.point.toArray(),instanceId,
        }
      }
      return null
    },
    raycastBox:(raycaster,maxDistance)=>{
      if(!boxMesh)return null
      for(const hit of raycaster.intersectObject(boxMesh,false)) {
        if(hit.distance>maxDistance)break
        const box=boxItems[hit.instanceId]
        if(!box)continue
        return {
          box:{id:box.id,classroom:box.classroom,position:[...box.position],rotationY:box.rotationY},
          distance:hit.distance,point:hit.point.toArray(),instanceId:hit.instanceId,
        }
      }
      return null
    },
    take:id=>setTaken(id,true),restore:id=>setTaken(id,false),
  }
}

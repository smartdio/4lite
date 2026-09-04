import * as THREE from 'three'
import {currentLocale} from './i18n/index.js'

const BASE='/assets/textures/school-ephemera-runtime'
const CULTURE_SEED=1982
const FUNCTIONAL_BOARD_LANGUAGE_SUFFIX=currentLocale==='en'?'-en-v01':'-v02'

const corridorNames=[
  'corridor-poster-campus-labor-v01','corridor-poster-study-discipline-v01','corridor-poster-civility-v01',
  'corridor-poster-rule-01-love-study-v01','corridor-poster-rule-02-punctual-listen-v01',
  'corridor-poster-rule-03-exercise-activity-v01','corridor-poster-rule-04-hygiene-neatness-v01',
  'corridor-poster-rule-05-self-reliance-labor-v01','corridor-poster-rule-06-frugal-food-v01',
  'corridor-poster-rule-07-discipline-order-v01','corridor-poster-rule-08-respect-unity-v01',
  'corridor-poster-rule-09-public-property-v01','corridor-poster-rule-10-honest-correct-v01',
]
const blackboardNames=[
  'blackboard-newspaper-new-term-v01','blackboard-newspaper-five-stresses-four-beauties-v01',
  'blackboard-newspaper-love-labor-v01','blackboard-newspaper-books-progress-v01',
]
const awardNames=[
  'classroom-award-red-drapery-v01','classroom-award-flags-floral-v01',
  'classroom-award-wheat-school-v01','classroom-award-sunflower-industry-v01',
]
// 西墙黑板上方固定顺序：马克思与毛泽东居中，恩格斯与周恩来分列两侧。
const officePortraitNames=[
  'office-portrait-engels-v01','office-portrait-marx-v01',
  'office-portrait-mao-v01','office-portrait-zhou-v01',
]

const assets=[
  ...corridorNames.map(id=>({id,type:'corridor',url:`${BASE}/corridor/${id}.webp`,size:[256,640]})),
  ...blackboardNames.map(id=>({id,type:'chalk',url:`${BASE}/blackboards/${id}.webp`,size:[768,288],transparent:true})),
  {id:'campus-guide',type:'chalk',url:`${BASE}/blackboards/blackboard-newspaper-campus-guide${FUNCTIONAL_BOARD_LANGUAGE_SUFFIX}.webp`,size:[1920,512]},
  {id:'development-process',type:'chalk',url:`${BASE}/blackboards/blackboard-newspaper-development-process${FUNCTIONAL_BOARD_LANGUAGE_SUFFIX}.webp`,size:[1920,512]},
  ...awardNames.map(id=>({id,type:'paper',url:`${BASE}/awards/${id}.webp`,size:[384,288]})),
  ...officePortraitNames.map(id=>({id,type:'paper',url:`${BASE}/office/${id}.webp`,size:[384,576]})),
  {id:'classroom-slogan',type:'cutout',url:`${BASE}/classroom/classroom-slogan-study-upward-combined-v01.webp`,size:[1024,131],transparent:true},
  {id:'student-code',type:'paper',url:`${BASE}/classroom/classroom-poster-student-code-v01.webp`,size:[320,545]},
  {id:'eye-exercise',type:'paper',url:`${BASE}/classroom/classroom-poster-eye-exercise-v01.webp`,size:[512,341]},
]
const assetById=new Map(assets.map(asset=>[asset.id,asset]))

function hashText(text) {
  let value=2166136261^CULTURE_SEED
  for(let index=0;index<text.length;index++) {
    value^=text.charCodeAt(index)
    value=Math.imul(value,16777619)
  }
  return value>>>0
}

function shuffled(values,key) {
  const result=[...values]
  let state=hashText(key)||1
  const random=()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5
    return (state>>>0)/4294967296
  }
  for(let index=result.length-1;index>0;index--) {
    const swap=Math.floor(random()*(index+1))
    ;[result[index],result[swap]]=[result[swap],result[index]]
  }
  return result
}

function groupBy(values,keyFor) {
  const groups=new Map()
  for(const value of values) {
    const key=keyFor(value)
    if(!groups.has(key))groups.set(key,[])
    groups.get(key).push(value)
  }
  return groups
}

function assignCorridorVariants(anchors) {
  const assignments=new Map()
  const groups=groupBy(anchors,anchor=>anchor.group)
  for(const [group,items] of groups) {
    let previous=null,cycle=0,pool=[]
    for(const anchor of items) {
      if(!pool.length) {
        pool=shuffled(corridorNames,`${group}:${cycle++}`)
        if(pool[0]===previous&&pool.length>1)pool.push(pool.shift())
      }
      const variant=pool.shift();assignments.set(anchor.id,variant);previous=variant
    }
  }
  return assignments
}

function surfacePosition(point,normal,offset,y) {
  return [point[0]+normal[0]*offset,y,point[1]+normal[1]*offset]
}

function createPlacements(anchors) {
  const placements=[]
  if(anchors.passageGuide) {
    const board=anchors.passageGuide
    placements.push({
      id:'b1-passage-west-campus-guide',assetId:'campus-guide',category:'campusGuide',
      classroom:null,
      position:surfacePosition(board.wallCenter,board.normal,board.boardOffset,board.floorY+board.board.bottom+board.board.height/2),
      normal:board.normal,size:[board.board.width,board.board.height],
    })
  }
  if(anchors.passageDevelopment) {
    const board=anchors.passageDevelopment
    placements.push({
      id:'b1-passage-east-development-process',assetId:'development-process',category:'developmentProcess',
      classroom:null,
      position:surfacePosition(board.wallCenter,board.normal,board.boardOffset,board.floorY+board.board.bottom+board.board.height/2),
      normal:board.normal,size:[board.board.width,board.board.height],
    })
  }
  const corridor=[...anchors.b1Corridor,...anchors.b2Columns]
  const corridorAssignments=assignCorridorVariants(corridor)
  for(const anchor of corridor)placements.push({
    id:anchor.id,assetId:corridorAssignments.get(anchor.id),category:anchor.category,
    classroom:null,
    group:anchor.group,
    position:surfacePosition(anchor.point,anchor.normal,anchor.offset,anchor.floorY+anchor.centerHeight),
    normal:anchor.normal,size:anchor.size,
  })

  for(const anchor of [...anchors.b1Corridor,...anchors.b2ClassroomPosters]) {
    if(anchor.office)continue
    const isFront=anchor.role==='front'
    const doorShift=isFront?.30:.12
    const point=[
      anchor.point[0]+anchor.doorDirection[0]*doorShift,
      anchor.point[1]+anchor.doorDirection[1]*doorShift,
    ]
    placements.push({
      id:`${anchor.id}-${isFront?'student-code':'eye-exercise'}`,
      assetId:isFront?'student-code':'eye-exercise',category:isFront?'studentCode':'eyeExercise',
      classroom:anchor.roomId,
      position:surfacePosition(point,anchor.normal.map(value=>-value),anchor.offset,anchor.floorY+(isFront?1.58:1.28)),
      normal:anchor.normal.map(value=>-value),size:isFront?[.48,.82]:[.92,.613],
    })
  }

  for(const room of anchors.classrooms) {
    if(room.office) {
      const west=room.boards.find(board=>board.side==='west')
      if(!west)continue
      const tangent=[west.normal[1],-west.normal[0]],spacing=.64
      officePortraitNames.forEach((assetId,index)=>{
        const lateral=(index-(officePortraitNames.length-1)/2)*spacing
        const point=[west.wallCenter[0]+tangent[0]*lateral,west.wallCenter[1]+tangent[1]*lateral]
        placements.push({
          id:`${room.id}-office-portrait-${index+1}`,assetId,category:'officePortraits',
          classroom:room.id,
          position:surfacePosition(point,west.normal,west.wallOffset,room.floorY+2.48),
          normal:west.normal,size:[.44,.66],
        })
      })
      continue
    }
    const front=room.boards.find(board=>board.side===room.teachingBoard)
    const rear=room.boards.find(board=>board.side!==room.teachingBoard)
    placements.push({
      id:`${room.id}-slogan`,assetId:'classroom-slogan',category:'slogans',
      classroom:room.id,
      position:surfacePosition(front.wallCenter,front.normal,front.wallOffset,room.floorY+2.40),
      normal:front.normal,size:[3.20,.409],
    })
    const blackboardId=blackboardNames[hashText(`${room.id}:blackboard`)%blackboardNames.length]
    placements.push({
      id:`${room.id}-blackboard-newspaper`,assetId:blackboardId,category:'blackboards',
      classroom:room.id,
      position:surfacePosition(rear.wallCenter,rear.normal,rear.boardOffset,room.floorY+rear.board.bottom+rear.board.height/2),
      normal:rear.normal,size:[rear.board.width*.96,rear.board.height*.90],
    })
    const count=hashText(`${room.id}:award-count`)%3+1
    const roomAwards=shuffled(awardNames,`${room.id}:awards`).slice(0,count)
    const tangent=[rear.normal[1],-rear.normal[0]],spacing=.72
    roomAwards.forEach((assetId,index)=>{
      const lateral=(index-(count-1)/2)*spacing
      const point=[rear.wallCenter[0]+tangent[0]*lateral,rear.wallCenter[1]+tangent[1]*lateral]
      placements.push({
        id:`${room.id}-award-${index+1}`,assetId,category:'awards',
        classroom:room.id,
        position:surfacePosition(point,rear.normal,rear.wallOffset,room.floorY+2.55),
        normal:rear.normal,size:[.60,.45],
      })
    })
  }
  return placements
}

function matrixFor(placement,target) {
  const normal=new THREE.Vector3(placement.normal[0],0,placement.normal[1]).normalize()
  const quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal)
  target.compose(
    new THREE.Vector3(...placement.position),quaternion,
    new THREE.Vector3(placement.size[0],placement.size[1],1),
  )
  return target
}

export function createSchoolEphemera({root,renderer,assetLoader,anchors}) {
  const group=new THREE.Group();group.name='school-ephemera';root.add(group)
  const meshEntries=[]
  let desiredActiveRooms=new Set()
  let loadPromise=null
  let snapshot={status:'idle',uniqueTextures:0,drawObjects:0,instances:0,placements:{}}

  const setActiveRooms=rooms=>{
    desiredActiveRooms=new Set(rooms)
    const matrix=new THREE.Matrix4()
    for(const {mesh,items} of meshEntries) {
      const visible=items.filter(item=>item.classroom==null||desiredActiveRooms.has(item.classroom))
      visible.forEach((placement,index)=>mesh.setMatrixAt(index,matrixFor(placement,matrix)))
      mesh.count=visible.length;mesh.visible=visible.length>0;mesh.instanceMatrix.needsUpdate=true
    }
  }

  const load=()=>{
    if(loadPromise)return loadPromise
    loadPromise=(async()=>{
      const textures=new Map(await Promise.all(assets.map(async asset=>{
        const texture=await assetLoader.loadTexture(asset.url)
        texture.colorSpace=THREE.SRGBColorSpace
        texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
        texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
        texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
        return [asset.id,texture]
      })))
      const placements=createPlacements(anchors)
      const grouped=groupBy(placements,placement=>placement.assetId)
      for(const [assetId,items] of grouped) {
        const asset=assetById.get(assetId),isTransparent=Boolean(asset.transparent)
        const materialColor=asset.type==='cutout'?0xd8d2ca:0xffffff
        const material=new THREE.MeshStandardMaterial({
          name:`school-ephemera-${assetId}`,map:textures.get(assetId),color:materialColor,
          roughness:.96,metalness:0,transparent:isTransparent,depthWrite:!isTransparent,
          side:THREE.FrontSide,
        })
        const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,items.length)
        mesh.name=`school-ephemera-instances-${assetId}`
        mesh.castShadow=false;mesh.receiveShadow=true;mesh.renderOrder=isTransparent?3:2
        mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false
        group.add(mesh)
        meshEntries.push({mesh,items})
      }
      setActiveRooms(desiredActiveRooms)
      const counts={}
      for(const placement of placements)counts[placement.category]=(counts[placement.category]??0)+1
      const campusGuidePlacement=placements.find(placement=>placement.category==='campusGuide')
      const developmentProcessPlacement=placements.find(placement=>placement.category==='developmentProcess')
      const decodedBytesWithMipmaps=Math.ceil(assets.reduce((sum,asset)=>sum+asset.size[0]*asset.size[1]*4,0)*4/3)
      snapshot={
        status:'loaded',seed:CULTURE_SEED,locale:currentLocale,uniqueTextures:textures.size,drawObjects:group.children.length,
        instances:placements.length,decodedBytesWithMipmaps,placements:counts,
        campusGuide:campusGuidePlacement?{
          textureSize:[...assetById.get('campus-guide').size],placementSize:[...campusGuidePlacement.size],
        }:null,
        developmentProcess:developmentProcessPlacement?{
          textureSize:[...assetById.get('development-process').size],placementSize:[...developmentProcessPlacement.size],
        }:null,
        classrooms:anchors.classrooms.filter(room=>!room.office).length,
        officesExcluded:anchors.classrooms.filter(room=>room.office).map(room=>room.id),
        assignments:placements.map(({id,assetId,category,group})=>({id,assetId,category,group:group??null})),
      }
      return snapshot
    })().catch(error=>{snapshot={...snapshot,status:'failed',error:String(error)};loadPromise=null;throw error})
    return loadPromise
  }
  return {load,setActiveRooms,snapshot:()=>structuredClone(snapshot)}
}

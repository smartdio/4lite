import * as THREE from 'three'

const BASE='/assets/textures/composition-pages-runtime'
const SEED='composition-pages-b2-v1'
const PAGE_DEPTH=.26
const PAGE_WIDTH=.185
const DEG=Math.PI/180

const assets=[
  'composition-century-clean-city-v01',
  'composition-century-home-v01',
  'composition-century-moon-sea-v01',
  'composition-future-school-v01',
  'composition-future-world-v01',
  'composition-meaningful-bus-seat-v01',
  'composition-meaningful-wallet-v01',
  'composition-my-ideal-immortal-v01',
  'composition-my-ideal-postman-v01',
  'composition-my-ideal-projectionist-v01',
  'composition-my-ideal-strongman-v01',
  'composition-my-ideal-zoo-director-v01',
  'composition-small-ink-spill-v01',
].map(id=>({id,url:`${BASE}/${id}.webp`}))

function hashText(text) {
  let value=2166136261
  const input=`${SEED}:${text}`
  for(let index=0;index<input.length;index++) {
    value^=input.charCodeAt(index)
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

function classroomName(anchorName) {
  return anchorName
    .replace(/-row-\d+-column-\d+-student-desk$/,'')
    .replace(/-office-.*-desk$/,'')
    .replace(/-(north|south|east|west)-teacher-desk$/,'')
}

function selectAnchors(studentAnchors,teacherAnchors,occupiedAnchorNames,officesExcluded) {
  const offices=new Set(officesExcluded)
  const eligibleRoom=anchor=>anchor.name.startsWith('b2-')&&!offices.has(classroomName(anchor.name))
  // 讲台桌固定把作文放在右侧；课本模块固定先占左侧，因此可共用同一张桌而不重叠。
  const teachers=shuffled(teacherAnchors.filter(eligibleRoom),'teacher-anchors').slice(0,3)
  const studentsByRoom=new Map()
  for(const anchor of studentAnchors.filter(anchor=>eligibleRoom(anchor)&&!occupiedAnchorNames.has(anchor.name))) {
    const room=classroomName(anchor.name)
    if(!studentsByRoom.has(room))studentsByRoom.set(room,[])
    studentsByRoom.get(room).push(anchor)
  }
  const roomOrder=shuffled([...studentsByRoom.keys()],'student-room-order')
  const students=[]
  let pass=0
  while(students.length<assets.length-teachers.length) {
    let added=false
    for(const room of roomOrder) {
      if(students.length>=assets.length-teachers.length)break
      const pool=shuffled(studentsByRoom.get(room),`${room}:student-anchors`)
      const anchor=pool[pass]
      if(anchor){students.push(anchor);added=true}
    }
    if(!added)break
    pass++
  }
  if(students.length+teachers.length<assets.length)throw new Error('二号教学楼没有足够的空桌面摆放作文')
  return shuffled([
    ...students.map(anchor=>({anchor,surface:'student'})),
    ...teachers.map(anchor=>({anchor,surface:'teacher'})),
  ],'mixed-surfaces').map((item,index)=>({...item,asset:assets[index],classroom:classroomName(item.anchor.name)}))
}

export function createCompositionPages({
  root,renderer,assetLoader,studentAnchors,teacherAnchors,
  occupiedAnchorNames=new Set(),officesExcluded=[],
}) {
  const group=new THREE.Group();group.name='b2-composition-pages';root.add(group)
  const documentMeshes=[]
  let loadPromise=null
  let snapshot={status:'idle',seed:SEED,pages:0,uniqueTextures:0,drawObjects:0}
  const load=()=>{
    if(loadPromise)return loadPromise
    loadPromise=(async()=>{
      const placements=selectAnchors(studentAnchors,teacherAnchors,occupiedAnchorNames,officesExcluded)
      const textures=new Map(await Promise.all(assets.map(async asset=>{
        const texture=await assetLoader.loadTexture(asset.url)
        texture.colorSpace=THREE.SRGBColorSpace
        texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
        texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
        texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
        return [asset.id,texture]
      })))
      const geometry=new THREE.PlaneGeometry(PAGE_WIDTH,PAGE_DEPTH);geometry.rotateX(-Math.PI/2)
      for(const placement of placements) {
        const angleUnit=hashText(`${placement.asset.id}:angle`)/4294967295
        const localX=placement.surface==='teacher'?.34:(hashText(`${placement.asset.id}:x`)/4294967295*2-1)*.34
        const localZ=placement.surface==='teacher'?.02:.015
        const baseRotation=placement.anchor.rotationY+(placement.surface==='teacher'?Math.PI:0)
        const rotationY=baseRotation+(angleUnit*2-1)*7*DEG
        const cos=Math.cos(placement.anchor.rotationY),sin=Math.sin(placement.anchor.rotationY)
        const material=new THREE.MeshStandardMaterial({
          name:`composition-page-${placement.asset.id}`,map:textures.get(placement.asset.id),
          color:0xffffff,roughness:.98,metalness:0,side:THREE.FrontSide,
        })
        const mesh=new THREE.Mesh(geometry,material)
        mesh.name=`${placement.anchor.name}-${placement.asset.id}`
        mesh.userData.documentItem={
          id:placement.asset.id,kind:'composition',classroom:placement.classroom,
          surface:placement.surface,sourceId:mesh.name,
        }
        mesh.position.set(
          placement.anchor.position[0]+cos*localX+sin*localZ,
          placement.anchor.position[1]+.002,
          placement.anchor.position[2]-sin*localX+cos*localZ,
        )
        mesh.rotation.y=rotationY;mesh.castShadow=false;mesh.receiveShadow=true
        group.add(mesh);documentMeshes.push(mesh)
        placement.position=mesh.position.toArray();placement.rotationY=rotationY
      }
      const imageSize=texture=>[
        texture.image.naturalWidth??texture.image.width,
        texture.image.naturalHeight??texture.image.height,
      ]
      const decodedBytesWithMipmaps=Math.ceil([...textures.values()].reduce((sum,texture)=>{
        const [width,height]=imageSize(texture);return sum+width*height*4
      },0)*4/3)
      const roomStats={}
      for(const placement of placements) {
        roomStats[placement.classroom]??={student:0,teacher:0}
        roomStats[placement.classroom][placement.surface]++
      }
      snapshot={
        status:'loaded',seed:SEED,pages:placements.length,uniqueTextures:textures.size,
        drawObjects:group.children.length,decodedBytesWithMipmaps,
        surfaces:{
          student:placements.filter(item=>item.surface==='student').length,
          teacher:placements.filter(item=>item.surface==='teacher').length,
        },
        classrooms:Object.keys(roomStats).length,roomStats,
        assignments:placements.map(item=>({
          id:item.asset.id,anchor:item.anchor.name,classroom:item.classroom,surface:item.surface,
          position:item.position.map(value=>+value.toFixed(5)),rotationY:+item.rotationY.toFixed(5),
        })),
      }
      return snapshot
    })().catch(error=>{snapshot={...snapshot,status:'failed',error:String(error)};loadPromise=null;throw error})
    return loadPromise
  }
  return {
    load,snapshot:()=>structuredClone(snapshot),
    pickables:()=>documentMeshes,
    documentIds:()=>assets.map(asset=>asset.id),
  }
}

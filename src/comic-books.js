import * as THREE from 'three'

const BASE='/assets/textures/comic-books-runtime'
const MANIFEST_URL=`${BASE}/manifest.json`
const ATLAS_URL=`${BASE}/comic-covers-atlas.webp`
const SEED='comic-books-b2-cubbies-v1'
const BOOK_WIDTH=.14
const BOOK_THICKNESS=.004
const CUBBY_FLOOR_OFFSET=.418
const CUBBY_FRONT_EDGE_Z=.154
const CUBBY_CENTERS={left:-.265,right:.265}
const DEG=Math.PI/180

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
}

function groupBy(values,keyFor) {
  const result=new Map()
  for(const value of values) {
    const key=keyFor(value)
    if(!result.has(key))result.set(key,[])
    result.get(key).push(value)
  }
  return result
}

function chooseCubbies(studentAnchors,assetCount,officesExcluded,excludedAnchorNames) {
  const offices=new Set(officesExcluded),excluded=new Set(excludedAnchorNames)
  const eligible=studentAnchors.filter(anchor=>
    anchor.name.startsWith('b2-')&&!offices.has(classroomName(anchor.name))&&!excluded.has(anchor.name),
  )
  const byRoom=groupBy(eligible,anchor=>classroomName(anchor.name))
  const rooms=shuffled([...byRoom.keys()].sort(),'room-order')
  const minimumCubbies=Math.ceil(assetCount/3)
  const maximumCubbies=Math.floor(assetCount/2)
  if(rooms.length<minimumCubbies)throw new Error('二号教学楼没有足够的教室格子摆放连环画')
  const selectedRooms=rooms.slice(0,Math.min(maximumCubbies,rooms.length))
  return selectedRooms.map(room=>{
    const anchors=shuffled(byRoom.get(room),`${room}:desk-order`)
    const anchor=anchors[0]
    const cubby=hashText(`${anchor.name}:cubby`)%2?'right':'left'
    return {room,anchor,cubby}
  })
}

function createPlacements(studentAnchors,assets,officesExcluded,excludedAnchorNames) {
  const cubbies=chooseCubbies(studentAnchors,assets.length,officesExcluded,excludedAnchorNames)
  const orderedAssets=shuffled(assets,'asset-order')
  const placements=[]
  let assetIndex=0
  for(const [cubbyIndex,item] of cubbies.entries()) {
    const remaining=assets.length-assetIndex
    const remainingCubbies=cubbies.length-cubbyIndex
    const count=remaining-2*(remainingCubbies-1)>=3?3:2
    const offsets=count===3?[-.145,0,.145]:[-.09,.09]
    const floorY=item.anchor.position[1]-.602
    const cos=Math.cos(item.anchor.rotationY),sin=Math.sin(item.anchor.rotationY)
    for(let slotIndex=0;slotIndex<count;slotIndex++) {
      const asset=orderedAssets[assetIndex++]
      const height=BOOK_WIDTH/asset.aspect
      const localX=CUBBY_CENTERS[item.cubby]+offsets[slotIndex]
      const rotationOffset=(slotIndex-(count-1)/2)*2.2*DEG
      const pageLocalZ=CUBBY_FRONT_EDGE_Z-height/2
      const shelfY=floorY+CUBBY_FLOOR_OFFSET+.001
      const position=[
        item.anchor.position[0]+cos*localX+sin*pageLocalZ,
        shelfY+BOOK_THICKNESS/2,
        item.anchor.position[2]-sin*localX+cos*pageLocalZ,
      ]
      const coverPosition=[
        position[0],
        shelfY+BOOK_THICKNESS+.00025,
        position[2],
      ]
      placements.push({
        asset,anchor:item.anchor,classroom:item.room,cubby:item.cubby,
        cubbyIndex,slotIndex,count,position,coverPosition,
        width:BOOK_WIDTH,height,thickness:BOOK_THICKNESS,
        rotationY:item.anchor.rotationY+rotationOffset,rotationOffset,
      })
    }
  }
  if(assetIndex!==assets.length)throw new Error(`连环画摆放数量不完整：${assetIndex}/${assets.length}`)
  return placements
}

function setMatrix(mesh,index,placement,cover=false) {
  const quaternion=new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0,placement.rotationY,0,'YXZ'),
  )
  const matrix=new THREE.Matrix4().compose(
    new THREE.Vector3(...(cover?placement.coverPosition:placement.position)),
    quaternion,
    new THREE.Vector3(
      placement.width,
      cover?1:placement.thickness,
      placement.height,
    ),
  )
  mesh.setMatrixAt(index,matrix)
}

function makeAtlasMaterial(texture) {
  const material=new THREE.MeshStandardMaterial({
    name:'comic-book-cover-atlas',map:texture,color:0xffffff,roughness:.92,metalness:0,
    side:THREE.FrontSide,
  })
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <uv_pars_vertex>','#include <uv_pars_vertex>\nattribute vec4 instanceUvRect;')
      .replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = instanceUvRect.xy + vMapUv * instanceUvRect.zw;
#endif`)
  }
  material.customProgramCacheKey=()=> 'comic-book-atlas-instance-uv-v1'
  return material
}

async function loadManifest() {
  const response=await fetch(MANIFEST_URL)
  if(!response.ok)throw new Error('连环画运行清单加载失败')
  return response.json()
}

export function createComicBooks({
  root,renderer,assetLoader,studentAnchors,officesExcluded=[],excludedAnchorNames=[],
}) {
  const group=new THREE.Group();group.name='b2-comic-books';root.add(group)
  let pageBlocks=null,covers=null,placements=[],manifest=null,loadPromise=null
  let desiredActiveRooms=new Set()
  let activationState={activeRooms:[],visibleBooks:0,activeDrawObjects:0}
  let snapshot={status:'idle',seed:SEED,books:0,cubbies:0,classrooms:0,uniqueTextures:0,drawObjects:0}

  const setActiveRooms=rooms=>{
    desiredActiveRooms=new Set(rooms)
    if(!pageBlocks||!covers) {
      activationState={activeRooms:[...desiredActiveRooms].sort(),visibleBooks:0,activeDrawObjects:0}
      return
    }
    const active=placements.filter(placement=>desiredActiveRooms.has(placement.classroom))
    const uvAttribute=covers.geometry.getAttribute('instanceUvRect')
    for(const [index,placement] of active.entries()) {
      setMatrix(pageBlocks,index,placement,false)
      setMatrix(covers,index,placement,true)
      uvAttribute.setXYZW(index,...placement.asset.uv)
    }
    pageBlocks.count=covers.count=active.length
    pageBlocks.visible=covers.visible=active.length>0
    pageBlocks.instanceMatrix.needsUpdate=true
    covers.instanceMatrix.needsUpdate=true
    uvAttribute.needsUpdate=true
    covers.userData.documentItems=active.map(placement=>({
      id:placement.asset.id,kind:'comic',classroom:placement.classroom,
      surface:'student-cubby',sourceId:`${placement.anchor.name}-${placement.asset.id}`,
    }))
    for(const mesh of [pageBlocks,covers]) {
      mesh.boundingBox=null;mesh.boundingSphere=null
      if(active.length)mesh.computeBoundingSphere()
    }
    activationState={
      activeRooms:[...desiredActiveRooms].sort(),visibleBooks:active.length,
      activeDrawObjects:active.length?2:0,
    }
  }

  const load=()=>{
    if(loadPromise)return loadPromise
    loadPromise=(async()=>{
      const [loadedManifest,atlasTexture]=await Promise.all([
        loadManifest(),assetLoader.loadTexture(ATLAS_URL),
      ])
      manifest=loadedManifest
      if(manifest.assets?.length!==22)throw new Error(`连环画运行清单数量错误：${manifest.assets?.length??0}`)
      atlasTexture.colorSpace=THREE.SRGBColorSpace
      atlasTexture.wrapS=atlasTexture.wrapT=THREE.ClampToEdgeWrapping
      atlasTexture.minFilter=THREE.LinearMipmapLinearFilter;atlasTexture.magFilter=THREE.LinearFilter
      atlasTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
      placements=createPlacements(studentAnchors,manifest.assets,officesExcluded,excludedAnchorNames)

      const pageGeometry=new THREE.BoxGeometry(1,1,1)
      const pageMaterial=new THREE.MeshStandardMaterial({
        name:'comic-book-page-edges',color:0xd5c7a6,roughness:.98,metalness:0,
      })
      pageBlocks=new THREE.InstancedMesh(pageGeometry,pageMaterial,placements.length)
      pageBlocks.name='comic-book-page-blocks';pageBlocks.castShadow=false;pageBlocks.receiveShadow=true

      const coverGeometry=new THREE.PlaneGeometry(1,1)
      coverGeometry.rotateX(-Math.PI/2)
      coverGeometry.setAttribute('instanceUvRect',new THREE.InstancedBufferAttribute(new Float32Array(placements.length*4),4))
      covers=new THREE.InstancedMesh(coverGeometry,makeAtlasMaterial(atlasTexture),placements.length)
      covers.name='comic-book-cover-atlas-instances';covers.castShadow=false;covers.receiveShadow=true
      covers.userData.documentItems=[]
      pageBlocks.frustumCulled=false;covers.frustumCulled=false
      group.add(pageBlocks,covers)
      setActiveRooms(desiredActiveRooms)

      const roomStats={}
      for(const placement of placements) {
        roomStats[placement.classroom]??={cubbies:0,books:0}
        roomStats[placement.classroom].books++
      }
      for(const placement of placements)if(placement.slotIndex===0)roomStats[placement.classroom].cubbies++
      const cubbyKeys=new Set(placements.map(item=>`${item.anchor.name}:${item.cubby}`))
      const decodedBytesWithMipmaps=Math.ceil(manifest.atlas.size[0]*manifest.atlas.size[1]*4*4/3)
      snapshot={
        status:'loaded',seed:SEED,books:placements.length,cubbies:cubbyKeys.size,
        classrooms:Object.keys(roomStats).length,uniqueTextures:1,drawObjects:group.children.length,
        decodedBytesWithMipmaps,roomStats,officesExcluded:[...officesExcluded],
        excludedAnchorNames:[...excludedAnchorNames],
        dimensions:{
          width:BOOK_WIDTH,thickness:BOOK_THICKNESS,cubbyFloorOffset:CUBBY_FLOOR_OFFSET,
          cubbyFrontEdge:CUBBY_FRONT_EDGE_Z,orientation:'flat-cover-up',
        },
        viewerPack:{url:manifest.viewerPack.url,ids:[...manifest.viewerPack.ids],bytes:manifest.viewerPack.bytes},
        assignments:placements.map(item=>({
          id:item.asset.id,kind:'comic',title:item.asset.title,group:item.asset.group,
          anchor:item.anchor.name,classroom:item.classroom,cubby:item.cubby,
          slotIndex:item.slotIndex,booksInCubby:item.count,
          position:item.position.map(value=>+value.toFixed(5)),
          coverPosition:item.coverPosition.map(value=>+value.toFixed(5)),
          rotationY:+item.rotationY.toFixed(5),rotationOffset:+item.rotationOffset.toFixed(5),
          size:[item.width,item.height,item.thickness].map(value=>+value.toFixed(5)),
        })),
      }
      return snapshot
    })().catch(error=>{snapshot={...snapshot,status:'failed',error:String(error)};loadPromise=null;throw error})
    return loadPromise
  }

  return {
    load,setActiveRooms,snapshot:()=>structuredClone({...snapshot,...activationState}),
    pickables:()=>covers?.visible?[covers]:[],
    documentIds:()=>manifest?.assets.map(asset=>asset.id)??[],
    viewerPack:()=>manifest?{url:manifest.viewerPack.url,ids:[...manifest.viewerPack.ids]}:null,
  }
}

import * as THREE from 'three'

const BASE='/assets/textures/school-books-runtime'
const BOOK_SEED='school-books-v1'
const SPINE_COLOR=0xd8d5c9
// Keep the books visibly below modern A4 / large-magazine scale. The scene uses
// compact 16-kai proportions: textbooks are slightly larger than workbooks.
const BOOK_DEPTH={textbook:.22,workbook:.21}
const ATLAS_COLUMNS=5
const ATLAS_GUTTER=3
const DEG=Math.PI/180

const textbookAssets=[
  ...Array.from({length:8},(_,index)=>({
    id:`textbook-chinese-${index+3 < 10?'0':''}${index+3}-restored-v01`,
    subject:'chinese',shellColor:0xa76445,
  })),
  {id:'textbook-history-upper-restored-v01',subject:'history',shellColor:0x89775e},
  {id:'textbook-history-lower-restored-v01',subject:'history',shellColor:0x89775e},
  ...[1,2,3,4,5,6,8,9,10].map(index=>({
    id:`textbook-math-${index < 10?'0':''}${index}-restored-v01`,subject:'math',shellColor:0x637f70,
  })),
].map(asset=>({...asset,kind:'textbook',url:`${BASE}/textbooks/${asset.subject}/${asset.id}.webp`}))

const workbookAssets=[
  {id:'workbook-cover-arithmetic-v01',shellColor:0xa99468},
  {id:'workbook-cover-homework-green-v01',shellColor:0x66856c},
  {id:'workbook-cover-homework-red-v01',shellColor:0xa95f54},
  {id:'workbook-cover-language-v01',shellColor:0xb58d5c},
  {id:'workbook-cover-math-v01',shellColor:0x6f8290},
  {id:'workbook-cover-square-grid-v01',shellColor:0x88947c},
].map(asset=>({...asset,kind:'workbook',url:`${BASE}/workbooks/${asset.id}.webp`}))

const assets=[...textbookAssets,...workbookAssets]
const assetById=new Map(assets.map(asset=>[asset.id,asset]))

function hashText(text) {
  let value=2166136261
  const input=`${BOOK_SEED}:${text}`
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

function groupBy(values,keyFor) {
  const groups=new Map()
  for(const value of values) {
    const key=keyFor(value)
    if(!groups.has(key))groups.set(key,[])
    groups.get(key).push(value)
  }
  return groups
}

function studentClassroom(name) {
  return name
    .replace(/-row-\d+-column-\d+-student-desk$/,'')
    .replace(/-office-.*-desk$/,'')
}

function teacherClassroom(name) {
  return name.replace(/-(north|south|east|west)-teacher-desk$/,'')
}

function createBookRequests(studentAnchors,teacherAnchors) {
  const requests=[]
  const roomStats={}
  const studentGroups=groupBy([...studentAnchors].sort((a,b)=>a.name.localeCompare(b.name)),anchor=>studentClassroom(anchor.name))

  for(const [classroom,desks] of [...studentGroups].sort(([a],[b])=>a.localeCompare(b))) {
    const selectedCount=8+hashText(`${classroom}:student-desk-count`)%3
    const selected=shuffled(desks,`${classroom}:student-desk-selection`).slice(0,selectedCount)
    roomStats[classroom]={studentDesks:selectedCount,studentBooks:0,teacherBooks:0}
    for(const anchor of selected) {
      const bookCount=hashText(`${anchor.name}:book-count`)%100<70?1:2
      const slots=shuffled(anchor.itemSlots.map((slot,index)=>({slot,index})),`${anchor.name}:slots`)
      const stacked=bookCount===2&&hashText(`${anchor.name}:stacked`)%2===0
      let kinds=bookCount===2
        ?['textbook','workbook']
        :[hashText(`${anchor.name}:kind`)%100<60?'textbook':'workbook']
      if(bookCount===2&&hashText(`${anchor.name}:kind-order`)%2)kinds=kinds.reverse()
      kinds.forEach((kind,index)=>{
        const target=stacked?slots[0]:slots[index]
        requests.push({
          id:`${anchor.name}-book-${index+1}`,classroom,surface:'student',anchor,kind,
          stackId:stacked?`${anchor.name}:stack`:`${anchor.name}:slot-${target.index}`,
          stackIndex:stacked?index:0,slot:target.slot,
          offsetX:stacked&&index ? .018 : 0,offsetZ:stacked&&index ? .012 : 0,
        })
      })
      roomStats[classroom].studentBooks+=bookCount
    }
  }

  for(const anchor of [...teacherAnchors].sort((a,b)=>a.name.localeCompare(b.name))) {
    const classroom=teacherClassroom(anchor.name)
    const count=1+hashText(`${anchor.name}:book-count`)%2
    const slots=[
      {slot:anchor.itemSlots[0],index:0},
      {slot:anchor.itemSlots[2],index:2},
    ]
    let kinds=count===2
      ?['textbook','workbook']
      :[hashText(`${anchor.name}:single-kind`)%100<60?'textbook':'workbook']
    if(count===2&&hashText(`${anchor.name}:kind-order`)%2)kinds=kinds.reverse()
    if(!roomStats[classroom])roomStats[classroom]={studentDesks:0,studentBooks:0,teacherBooks:0}
    roomStats[classroom].teacherBooks=count
    kinds.forEach((kind,index)=>{
      const target=slots[index]
      requests.push({
        id:`${anchor.name}-book-${index+1}`,classroom,surface:'teacher',anchor,kind,
        stackId:`${anchor.name}:slot-${target.index}`,
        stackIndex:0,slot:target.slot,offsetX:0,offsetZ:0,
      })
    })
  }
  return {requests,roomStats}
}

function assignVariants(requests) {
  const pools={
    textbook:shuffled(textbookAssets.map(asset=>asset.id),'textbook-variants'),
    workbook:shuffled(workbookAssets.map(asset=>asset.id),'workbook-variants'),
  }
  const indices={textbook:0,workbook:0}
  return requests.map(request=>{
    const pool=pools[request.kind]
    const assetId=pool[indices[request.kind]++%pool.length]
    return {...request,assetId}
  })
}

function createPlacements(studentAnchors,teacherAnchors,textures) {
  const {requests,roomStats}=createBookRequests(studentAnchors,teacherAnchors)
  const assigned=assignVariants(requests)
  const stackHeights=new Map()
  const placements=[]
  for(const request of assigned) {
    const asset=assetById.get(request.assetId)
    const texture=textures.get(asset.id)
    const image=texture.image
    const imageWidth=image.naturalWidth??image.width
    const imageHeight=image.naturalHeight??image.height
    const depth=BOOK_DEPTH[asset.kind]
    const width=depth*imageWidth/imageHeight
    const unit=hashText(`${request.id}:thickness`)/4294967295
    const thickness=asset.kind==='textbook' ? .009+unit*.004 : .0035+unit*.0025
    const stackHeight=stackHeights.get(request.stackId)??0
    stackHeights.set(request.stackId,stackHeight+thickness+.0007)

    const [slotX,,rawSlotZ]=request.slot
    const slotZ=request.surface==='teacher'?Math.min(rawSlotZ,.035):rawSlotZ
    const localX=slotX+request.offsetX
    const localZ=slotZ+request.offsetZ
    const baseRotation=request.anchor.rotationY
    const cos=Math.cos(baseRotation),sin=Math.sin(baseRotation)
    const position=[
      request.anchor.position[0]+cos*localX+sin*localZ,
      request.anchor.position[1]+.001+stackHeight,
      request.anchor.position[2]-sin*localX+cos*localZ,
    ]
    const angleRange=request.surface==='teacher'?8:6
    const angleUnit=hashText(`${request.id}:angle`)/4294967295
    const stackAngle=request.stackIndex?(request.surface==='teacher'?2:4)*DEG:0
    const directionCorrection=request.surface==='teacher'?Math.PI:0
    placements.push({
      ...request,position,width,depth,thickness,
      rotationY:baseRotation+directionCorrection+(angleUnit*2-1)*angleRange*DEG+stackAngle,
      shellColor:asset.shellColor,
    })
  }
  return {placements,roomStats}
}

function setBoxMatrix(mesh,index,placement,centerY,size,localX=0,localZ=0) {
  const cos=Math.cos(placement.rotationY),sin=Math.sin(placement.rotationY)
  const matrix=new THREE.Matrix4().compose(
    new THREE.Vector3(
      placement.position[0]+cos*localX+sin*localZ,
      centerY,
      placement.position[2]-sin*localX+cos*localZ,
    ),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),placement.rotationY),
    new THREE.Vector3(...size),
  )
  mesh.setMatrixAt(index,matrix)
}

function setCoverMatrix(mesh,index,placement) {
  const matrix=new THREE.Matrix4().compose(
    new THREE.Vector3(placement.position[0],placement.position[1]+placement.thickness+.00025,placement.position[2]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),placement.rotationY),
    new THREE.Vector3(placement.width,1,placement.depth),
  )
  mesh.setMatrixAt(index,matrix)
}

function createCoverAtlas(renderer,textures) {
  const rows=[]
  for(let index=0;index<assets.length;index+=ATLAS_COLUMNS)rows.push(assets.slice(index,index+ATLAS_COLUMNS))
  const imageSize=asset=>{
    const image=textures.get(asset.id).image
    return [image.naturalWidth??image.width,image.naturalHeight??image.height]
  }
  const rowWidths=rows.map(row=>row.reduce((sum,asset)=>sum+imageSize(asset)[0]+ATLAS_GUTTER*2,0))
  const rowHeights=rows.map(row=>Math.max(...row.map(asset=>imageSize(asset)[1]+ATLAS_GUTTER*2)))
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(...rowWidths);canvas.height=rowHeights.reduce((sum,height)=>sum+height,0)
  const context=canvas.getContext('2d'),rects=new Map()
  let y=0
  rows.forEach((row,rowIndex)=>{
    let x=0
    for(const asset of row) {
      const image=textures.get(asset.id).image,[width,height]=imageSize(asset)
      context.drawImage(image,x,y,width+ATLAS_GUTTER*2,height+ATLAS_GUTTER*2)
      rects.set(asset.id,[
        (x+ATLAS_GUTTER)/canvas.width,
        1-(y+ATLAS_GUTTER+height)/canvas.height,
        width/canvas.width,
        height/canvas.height,
      ])
      x+=width+ATLAS_GUTTER*2
    }
    y+=rowHeights[rowIndex]
  })
  const texture=new THREE.CanvasTexture(canvas)
  texture.name='school-book-cover-atlas'
  texture.colorSpace=THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  return {texture,rects,size:[canvas.width,canvas.height]}
}

function createCoverAtlasMaterial(texture) {
  const material=new THREE.MeshStandardMaterial({
    name:'school-book-cover-atlas-material',map:texture,color:0xffffff,
    roughness:.90,metalness:0,side:THREE.FrontSide,
  })
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <uv_pars_vertex>','#include <uv_pars_vertex>\nattribute vec4 instanceUvRect;')
      .replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = instanceUvRect.xy + vMapUv * instanceUvRect.zw;
#endif`)
  }
  material.customProgramCacheKey=()=> 'school-book-cover-atlas-instance-uv-v1'
  return material
}

export function createSchoolBooks({root,renderer,assetLoader,studentAnchors,teacherAnchors,officesExcluded=[]}) {
  const group=new THREE.Group();group.name='school-books';root.add(group)
  const documentMeshes=[]
  const officeRooms=new Set(officesExcluded)
  const classroomStudentAnchors=studentAnchors.filter(anchor=>!officeRooms.has(studentClassroom(anchor.name)))
  const classroomTeacherAnchors=teacherAnchors.filter(anchor=>!officeRooms.has(teacherClassroom(anchor.name)))
  let allPlacements=[],pageBlocks=null,shells=null
  let coverEntry=null
  let desiredActiveRooms=new Set()
  let loadPromise=null
  let snapshot={status:'idle',seed:BOOK_SEED,uniqueTextures:0,drawObjects:0,books:0,instances:0}

  const setActiveRooms=rooms=>{
    desiredActiveRooms=new Set(rooms)
    if(!pageBlocks||!shells)return
    const visible=allPlacements.filter(placement=>desiredActiveRooms.has(placement.classroom))
    const color=new THREE.Color()
    visible.forEach((placement,index)=>{
      const gauge=placement.kind==='textbook'?.001:.00045
      const pageThickness=Math.max(.002,placement.thickness-gauge*2)
      const baseY=placement.position[1]
      setBoxMatrix(pageBlocks,index,placement,baseY+gauge+pageThickness/2,[placement.width-.006,pageThickness,placement.depth-.004])
      const shellIndex=index*3
      setBoxMatrix(shells,shellIndex,placement,baseY+gauge/2,[placement.width,gauge,placement.depth])
      setBoxMatrix(shells,shellIndex+1,placement,baseY+placement.thickness-gauge/2,[placement.width,gauge,placement.depth])
      setBoxMatrix(shells,shellIndex+2,placement,baseY+placement.thickness/2,[gauge*1.6,placement.thickness,placement.depth-.002],-placement.width/2+gauge*.8)
      color.setHex(placement.shellColor)
      shells.setColorAt(shellIndex,color);shells.setColorAt(shellIndex+1,color)
      color.setHex(SPINE_COLOR);shells.setColorAt(shellIndex+2,color)
    })
    pageBlocks.count=visible.length;shells.count=visible.length*3
    pageBlocks.visible=shells.visible=visible.length>0
    pageBlocks.instanceMatrix.needsUpdate=true;shells.instanceMatrix.needsUpdate=true
    if(shells.instanceColor)shells.instanceColor.needsUpdate=true
    if(coverEntry) {
      const {mesh,items,rects}=coverEntry
      const active=items.filter(item=>desiredActiveRooms.has(item.classroom))
      const uvAttribute=mesh.geometry.getAttribute('instanceUvRect')
      active.forEach((placement,index)=>{
        setCoverMatrix(mesh,index,placement)
        uvAttribute.setXYZW(index,...rects.get(placement.assetId))
      })
      mesh.count=active.length;mesh.visible=active.length>0;mesh.instanceMatrix.needsUpdate=true
      uvAttribute.needsUpdate=true
      mesh.boundingBox=null;mesh.boundingSphere=null
      if(active.length)mesh.computeBoundingSphere()
      mesh.userData.documentItems=active.map(item=>({
        id:item.assetId,kind:item.kind,classroom:item.classroom,surface:item.surface,sourceId:item.id,
      }))
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
        texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
        return [asset.id,texture]
      })))
      const {placements,roomStats}=createPlacements(classroomStudentAnchors,classroomTeacherAnchors,textures)
      allPlacements=placements
      const coverAtlas=createCoverAtlas(renderer,textures)

      const unitBox=new THREE.BoxGeometry(1,1,1)
      const pageMaterial=new THREE.MeshStandardMaterial({
        name:'school-book-page-edges',color:0xd4c9a6,roughness:.98,metalness:0,
      })
      pageBlocks=new THREE.InstancedMesh(unitBox,pageMaterial,placements.length)
      pageBlocks.name='school-book-page-blocks';pageBlocks.castShadow=false;pageBlocks.receiveShadow=true

      const shellMaterial=new THREE.MeshStandardMaterial({
        name:'school-book-cover-shells',color:0xffffff,roughness:.92,metalness:0,vertexColors:true,
      })
      shells=new THREE.InstancedMesh(unitBox,shellMaterial,placements.length*3)
      shells.name='school-book-cover-shells';shells.castShadow=false;shells.receiveShadow=true
      pageBlocks.frustumCulled=false;shells.frustumCulled=false
      group.add(pageBlocks,shells)

      const coverGeometry=new THREE.PlaneGeometry(1,1);coverGeometry.rotateX(-Math.PI/2)
      coverGeometry.setAttribute('instanceUvRect',new THREE.InstancedBufferAttribute(new Float32Array(placements.length*4),4))
      const byAsset=groupBy(placements,placement=>placement.assetId)
      const coverMesh=new THREE.InstancedMesh(coverGeometry,createCoverAtlasMaterial(coverAtlas.texture),placements.length)
      coverMesh.name='school-book-cover-atlas-instances';coverMesh.castShadow=false;coverMesh.receiveShadow=true
      coverMesh.userData.documentItems=[]
      coverMesh.instanceMatrix.needsUpdate=true;coverMesh.frustumCulled=false;group.add(coverMesh);documentMeshes.push(coverMesh)
      coverEntry={mesh:coverMesh,items:placements,rects:coverAtlas.rects}
      setActiveRooms(desiredActiveRooms)

      const counts=placements.reduce((result,placement)=>{
        result[placement.kind]++
        result[placement.surface]++
        return result
      },{textbook:0,workbook:0,student:0,teacher:0})
      const imageSize=texture=>[
        texture.image.naturalWidth??texture.image.width,
        texture.image.naturalHeight??texture.image.height,
      ]
      const sourceDecodedBytesWithMipmaps=Math.ceil([...textures.values()].reduce((sum,texture)=>{
        const [width,height]=imageSize(texture)
        return sum+width*height*4
      },0)*4/3)
      const decodedBytesWithMipmaps=Math.ceil(coverAtlas.size[0]*coverAtlas.size[1]*4*4/3)
      const occupiedStudentDesks=new Set(placements.filter(item=>item.surface==='student').map(item=>item.anchor.name)).size
      const occupiedTeacherDesks=new Set(placements.filter(item=>item.surface==='teacher').map(item=>item.anchor.name)).size
      const boundsViolations=placements.filter(placement=>{
        const localX=placement.slot[0]+placement.offsetX
        const localZ=Math.min(placement.slot[2],placement.surface==='teacher' ? .035 : placement.slot[2])+placement.offsetZ
        const relative=placement.rotationY-placement.anchor.rotationY
        const extentX=Math.abs(Math.cos(relative))*placement.width/2+Math.abs(Math.sin(relative))*placement.depth/2
        const extentZ=Math.abs(Math.sin(relative))*placement.width/2+Math.abs(Math.cos(relative))*placement.depth/2
        const minimumZ=-.20,maximumZ=placement.surface==='teacher' ? .18 : .20
        return Math.abs(localX)+extentX>.60||localZ-extentZ<minimumZ||localZ+extentZ>maximumZ
      }).map(placement=>placement.id)
      snapshot={
        status:'loaded',seed:BOOK_SEED,sourceTextures:textures.size,uniqueTextures:1,drawObjects:group.children.length,
        books:placements.length,instances:placements.length*5,decodedBytesWithMipmaps,
        sourceDecodedBytesWithMipmaps,atlasSize:coverAtlas.size,
        placements:{textbooks:counts.textbook,workbooks:counts.workbook,studentBooks:counts.student,teacherBooks:counts.teacher},
        occupiedStudentDesks,occupiedTeacherDesks,classrooms:Object.keys(roomStats).length,
        officesExcluded:[...officesExcluded],roomStats,spineColor:`#${SPINE_COLOR.toString(16).padStart(6,'0')}`,
        dimensions:{textbookDepth:BOOK_DEPTH.textbook,workbookDepth:BOOK_DEPTH.workbook},
        boundsAudit:{violations:boundsViolations},
        variants:Object.fromEntries(assets.map(asset=>[asset.id,byAsset.get(asset.id)?.length??0])),
        assignments:placements.map(placement=>({
          id:placement.id,classroom:placement.classroom,surface:placement.surface,stackId:placement.stackId,
          stackIndex:placement.stackIndex,kind:placement.kind,assetId:placement.assetId,
          size:[placement.width,placement.thickness,placement.depth].map(value=>+value.toFixed(5)),
          position:placement.position.map(value=>+value.toFixed(5)),rotationY:+placement.rotationY.toFixed(5),
          anchorRotationY:+placement.anchor.rotationY.toFixed(5),
        })),
      }
      return snapshot
    })().catch(error=>{snapshot={...snapshot,status:'failed',error:String(error)};loadPromise=null;throw error})
    return loadPromise
  }
  return {
    load,snapshot:()=>structuredClone(snapshot),
    setActiveRooms,
    pickables:()=>documentMeshes.filter(mesh=>mesh.visible),
    documentIds:()=>assets.map(asset=>asset.id),
  }
}

import * as THREE from 'three'

const MODEL_URL='/assets/models/pencil-box/flower-angel-pencil-box-game-v01.glb'
const STATIONERY_MODEL_URL='/assets/models/student-stationery/student-stationery-library-v01.glb'
const MODEL_SIZE={width:.210,depth:.075,height:.022}
const OPEN_ANGLE_DEGREES=110
const INSTANCES_PER_CLASSROOM=2
const DEG=Math.PI/180
const SEED='period-pencil-boxes-v2'
const VARIANTS={
  'flower-angel':{label:'花仙子铁皮铅笔盒',textureUrl:null},
  'sun-wukong':{label:'孙悟空铁皮铅笔盒',textureUrl:'/assets/textures/pencil-box/sun-wukong-cover-runtime-v01.png'},
  'black-cat-sheriff':{label:'黑猫警长铁皮铅笔盒',textureUrl:'/assets/textures/pencil-box/black-cat-sheriff-cover-runtime-v01.png'},
  ikkyu:{label:'聪明的一休铁皮铅笔盒',textureUrl:'/assets/textures/pencil-box/ikkyu-cover-runtime-v01.png'},
}
const VARIANT_IDS=Object.keys(VARIANTS)
const CONTENT_COMBINATIONS=[
  ['Pencil-Zhonghua101','Pencil-RedBlack','Pencil-YellowStudent'],
  ['Pencil-Zhonghua101','Pencil-MetalFerruleEraser','Eraser-PlainCream'],
  ['Pencil-RedBlack','Pencil-YellowStudent','Eraser-Character-StudentTree'],
  ['Pencil-Zhonghua101','Pencil-RedBlack','Pencil-YellowStudent','Pencil-MetalFerruleEraser'],
  ['Pencil-Zhonghua101','Pencil-PlasticSleeveEraser','Eraser-TwoToneCreamGrey','Eraser-Character-RunningDog'],
  ['Pencil-YellowStudent','Pencil-MetalFerruleEraser','Eraser-ColoredStripes'],
]
const ITEM_INFO={
  'Pencil-Zhonghua101':{kind:'pencil'},'Pencil-RedBlack':{kind:'pencil'},'Pencil-YellowStudent':{kind:'pencil'},
  'Pencil-MetalFerruleEraser':{kind:'pencil'},'Pencil-PlasticSleeveEraser':{kind:'pencil'},
  'Eraser-PlainCream':{kind:'eraser',width:.018},'Eraser-TwoToneCreamGrey':{kind:'eraser',width:.018},
  'Eraser-ColoredStripes':{kind:'eraser',width:.020},'Eraser-Character-StudentTree':{kind:'eraser',width:.028},
  'Eraser-Character-RunningDog':{kind:'eraser',width:.028},
}

function classroomName(anchor) {
  return (anchor.classroom??anchor.name).replace(/-row-\d+-column-\d+-student-desk$/,'')
}

function seededNumber(value) {
  let hash=2166136261
  for(const character of `${SEED}:${value}`)hash=Math.imul(hash^character.charCodeAt(0),16777619)
  return hash>>>0
}

function chooseAnchors(studentAnchors,occupiedAnchorNames,officesExcluded) {
  const occupied=new Set(occupiedAnchorNames)
  const excluded=new Set(officesExcluded)
  const byClassroom=new Map()
  for(const anchor of studentAnchors) {
    const classroom=classroomName(anchor)
    if(excluded.has(classroom))continue
    if(!byClassroom.has(classroom))byClassroom.set(classroom,[])
    if(occupied.has(anchor.name))continue
    byClassroom.get(classroom).push(anchor)
  }
  return [...byClassroom].sort(([a],[b])=>a.localeCompare(b)).flatMap(([classroom,available])=>{
    available.sort((a,b)=>a.name.localeCompare(b.name))
    if(available.length<INSTANCES_PER_CLASSROOM)throw new Error(`${classroom} 没有两张空课桌摆放铅笔盒`)
    const variantStart=seededNumber(`${classroom}:variant`)%VARIANT_IDS.length
    const variantStep=1+seededNumber(`${classroom}:variant-step`)%(VARIANT_IDS.length-1)
    const variants=[VARIANT_IDS[variantStart],VARIANT_IDS[(variantStart+variantStep)%VARIANT_IDS.length]]
    return variants.map((variant,slot)=>{
      const deskIndex=seededNumber(`${classroom}:desk:${slot}`)%available.length
      const [anchor]=available.splice(deskIndex,1)
      occupied.add(anchor.name)
      const state=seededNumber(`${classroom}:state:${slot}`)%2?'open':'closed'
      const side=seededNumber(`${classroom}:side:${slot}`)%2?-1:1
      const rotationDegrees=(seededNumber(`${classroom}:rotation:${slot}`)%11)-5
      const combinationIndex=(seededNumber(`${classroom}:contents`)+slot)%CONTENT_COMBINATIONS.length
      return {
        id:`${classroom}-${variant}-pencil-box-${slot+1}`,classroom,variant,state,anchor,
        localX:side*(.20+(seededNumber(`${classroom}:offset:${slot}`)%7)*.01),localZ:.012,
        rotationOffset:rotationDegrees*DEG,combinationIndex,
      }
    })
  })
}

function prepareTemplate(template,renderer) {
  const geometries=new Set(),materials=new Set(),textures=new Set()
  let meshes=0,primitiveDraws=0,triangles=0
  template.traverse(object=>{
    if(!object.isMesh)return
    meshes++;geometries.add(object.geometry)
    object.castShadow=false;object.receiveShadow=true
    const count=object.geometry.index?.count??object.geometry.attributes.position?.count??0
    triangles+=count/3
    const objectMaterials=Array.isArray(object.material)?object.material:[object.material]
    primitiveDraws+=object.geometry.groups.length||1
    for(const material of objectMaterials)if(material) {
      materials.add(material)
      if(material.map) {
        textures.add(material.map)
        material.map.colorSpace=THREE.SRGBColorSpace
        material.map.minFilter=THREE.LinearMipmapLinearFilter
        material.map.magFilter=THREE.LinearFilter
        material.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
        material.map.needsUpdate=true
      }
    }
  })
  return {geometries,materials,textures,meshes,primitiveDraws,triangles:Math.round(triangles)}
}

function placementFor(plan) {
  const {anchor}=plan,cos=Math.cos(anchor.rotationY),sin=Math.sin(anchor.rotationY)
  const tableY=anchor.position[1]
  return {
    ...plan,tableY,
    position:[
      anchor.position[0]+cos*plan.localX+sin*plan.localZ,
      tableY+.001,
      anchor.position[2]-sin*plan.localX+cos*plan.localZ,
    ],
    rotationY:anchor.rotationY+plan.rotationOffset,
    lidAngleDegrees:plan.state==='open'?OPEN_ANGLE_DEGREES:0,
  }
}

function contentLayout(itemNames) {
  const pencils=itemNames.filter(name=>ITEM_INFO[name]?.kind==='pencil')
  const erasers=itemNames.filter(name=>ITEM_INFO[name]?.kind==='eraser')
  const placements=[]
  if(erasers.length) {
    const widest=Math.max(...erasers.map(name=>ITEM_INFO[name].width))
    const lane=Math.min(.026,.014+widest/2)
    const pencilLanes=pencils.length===1?[lane]:pencils.length===2?[-lane,lane]:[-.027,0,.027]
    pencils.forEach((name,index)=>placements.push({name,x:0,y:.0052,z:pencilLanes[index],rotationY:0}))
    const eraserXs=erasers.length===1?[-.066]:[-.068,.055]
    erasers.forEach((name,index)=>placements.push({name,x:eraserXs[index],y:.0052,z:0,rotationY:(index?2:-2)*DEG}))
  } else {
    const lanes=pencils.length===4?[-.027,-.009,.009,.027]:[-.018,0,.018]
    pencils.forEach((name,index)=>placements.push({name,x:0,y:.0052,z:lanes[index],rotationY:(index%2?1:-1)*DEG}))
  }
  return placements
}

function addContents(instance,stationeryTemplate,placement) {
  const base=instance.getObjectByName('PencilBoxBase')
  if(!base)throw new Error('铅笔盒 GLB 缺少 PencilBoxBase 节点')
  const root=new THREE.Group();root.name=`${placement.id}-stationery-contents`
  const names=CONTENT_COMBINATIONS[placement.combinationIndex]
  for(const layout of contentLayout(names)) {
    const source=stationeryTemplate.getObjectByName(layout.name)
    if(!source)throw new Error(`文具 GLB 缺少 ${layout.name} 节点`)
    const item=source.clone(true)
    item.name=`${placement.id}-${layout.name}`
    item.position.set(layout.x,layout.y,layout.z)
    item.rotation.set(0,layout.rotationY,0)
    root.add(item)
  }
  base.add(root)
  return {root,names}
}

export function createPencilBoxes({renderer,assetLoader,studentAnchors,occupiedAnchorNames=[],officesExcluded=[],roomRootFor}) {
  let loadPromise=null,instances=[],proxies=[]
  let snapshot={status:'idle',modelUrl:MODEL_URL,instances:0,classrooms:0,workingModelSize:{...MODEL_SIZE}}
  const load=()=>{
    if(loadPromise)return loadPromise
    loadPromise=(async()=>{
      const [gltf,stationeryGltf,...variantTextures]=await Promise.all([
        assetLoader.loadGltf(MODEL_URL),
        assetLoader.loadGltf(STATIONERY_MODEL_URL),
        ...Object.values(VARIANTS).filter(variant=>variant.textureUrl).map(variant=>assetLoader.loadTexture(variant.textureUrl)),
      ])
      const template=gltf.scene
      const stationeryTemplate=stationeryGltf.scene
      template.updateMatrixWorld(true)
      stationeryTemplate.updateMatrixWorld(true)
      const resources=prepareTemplate(template,renderer)
      const stationeryResources=prepareTemplate(stationeryTemplate,renderer)
      const sourceSize=new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3())
      const placements=chooseAnchors(studentAnchors,occupiedAnchorNames,officesExcluded).map(placementFor)
      const externalTextures=new Map()
      Object.values(VARIANTS).filter(variant=>variant.textureUrl).forEach((variant,index)=>{
        const texture=variantTextures[index]
        texture.colorSpace=THREE.SRGBColorSpace
        texture.minFilter=THREE.LinearMipmapLinearFilter
        texture.magFilter=THREE.LinearFilter
        texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
        // GLTFLoader uploads embedded images without the WebGL Y flip. These
        // replacement covers use the same UVs, so TextureLoader's default
        // flip would turn their image top away from the rear hinge.
        texture.flipY=false
        texture.needsUpdate=true
        externalTextures.set(variant.textureUrl,texture)
      })
      const contentAssignments=[]
      instances=placements.map(placement=>{
        const instance=template.clone(true)
        instance.name=placement.id
        instance.position.fromArray(placement.position)
        instance.rotation.y=placement.rotationY
        const lid=instance.getObjectByName('PencilBoxLidPivot')
        if(!lid)throw new Error('铅笔盒 GLB 缺少 PencilBoxLidPivot 节点')
        const variant=VARIANTS[placement.variant]
        const cover=instance.getObjectByName('FlowerAngelPrintedCover')
        if(!cover)throw new Error('铅笔盒 GLB 缺少盒盖印花节点')
        if(variant.textureUrl) {
          cover.material=cover.material.clone()
          cover.material.name=`${placement.variant} printed lacquer`
          cover.material.map=externalTextures.get(variant.textureUrl)
          cover.material.needsUpdate=true
        }
        lid.rotation.x=placement.state==='open'?-OPEN_ANGLE_DEGREES*DEG:0
        const contents=addContents(instance,stationeryTemplate,placement)
        contentAssignments.push({id:placement.id,combinationIndex:placement.combinationIndex,items:[...contents.names]})
        instance.userData.pencilBox={
          id:placement.id,variant:placement.variant,kind:'pencil-box',label:variant.label,classroom:placement.classroom,
          deskId:placement.anchor.name,state:placement.state,lidAngleDegrees:placement.lidAngleDegrees,
          combinationIndex:placement.combinationIndex,contentItems:[...contents.names],
        }
        roomRootFor(placement.classroom).add(instance)
        instance.updateWorldMatrix(true,true)
        return instance
      })
      const proxyMaterial=new THREE.MeshBasicMaterial({name:'pencil-box-interaction-proxy',visible:false})
      proxies=instances.map(instance=>{
        const roomRoot=roomRootFor(instance.userData.pencilBox.classroom)
        const bounds=new THREE.Box3().setFromObject(instance)
        const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3())
        const proxy=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),proxyMaterial)
        proxy.name=`${instance.name}-interaction-proxy`
        proxy.position.copy(roomRoot.worldToLocal(center.clone()))
        proxy.userData.pencilBox={...instance.userData.pencilBox}
        roomRoot.add(proxy)
        return proxy
      })
      const assignments=placements.map((placement,index)=>{
        const bounds=new THREE.Box3().setFromObject(instances[index]),size=bounds.getSize(new THREE.Vector3())
        return {
          id:placement.id,variant:placement.variant,label:VARIANTS[placement.variant].label,classroom:placement.classroom,anchor:placement.anchor.name,state:placement.state,
          position:placement.position.map(value=>+value.toFixed(5)),rotationY:+placement.rotationY.toFixed(5),
          rotationOffset:+placement.rotationOffset.toFixed(5),lidAngleDegrees:placement.lidAngleDegrees,
          tableY:+placement.tableY.toFixed(5),local:[placement.localX,placement.localZ],
          combinationIndex:placement.combinationIndex,contentItems:[...contentAssignments[index].items],
          worldBounds:{min:bounds.min.toArray().map(value=>+value.toFixed(5)),max:bounds.max.toArray().map(value=>+value.toFixed(5))},
          worldSize:size.toArray().map(value=>+value.toFixed(5)),
        }
      })
      const pencilBoxTextures=new Set([...resources.textures,...externalTextures.values()])
      const stationeryTextures=new Set(stationeryResources.textures)
      const allTextures=new Set([...pencilBoxTextures,...stationeryTextures])
      const sizesFor=textures=>[...textures].map(texture=>[
        texture.image?.width??texture.source?.data?.width??0,
        texture.image?.height??texture.source?.data?.height??0,
      ])
      const decodedBytesFor=textures=>Math.ceil(sizesFor(textures).reduce((sum,[width,height])=>sum+width*height*4,0)*4/3)
      const textureSizes=sizesFor(allTextures)
      const decodedBytesWithMipmaps=decodedBytesFor(allTextures)
      snapshot={
        status:'loaded',modelUrl:MODEL_URL,stationeryModelUrl:STATIONERY_MODEL_URL,seed:SEED,instances:instances.length,
        classrooms:new Set(placements.map(placement=>placement.classroom)).size,
        variants:Object.keys(VARIANTS).length,instancesPerClassroom:INSTANCES_PER_CLASSROOM,
        workingModelSize:{...MODEL_SIZE},openAngleDegrees:OPEN_ANGLE_DEGREES,
        sourceBounds:sourceSize.toArray().map(value=>+value.toFixed(5)),
        sharedResources:{
          glbRequests:2,pencilBoxGlbRequests:1,stationeryGlbRequests:1,textureRequests:externalTextures.size,requests:2+externalTextures.size,
          coverOrientation:'image-top-toward-rear-hinge',externalCoverFlipY:false,
          geometries:resources.geometries.size+stationeryResources.geometries.size,
          materials:resources.materials.size+stationeryResources.materials.size+externalTextures.size,
          textures:allTextures.size,
          textureSizes,decodedBytesWithMipmaps,
          pencilBoxDecodedBytesWithMipmaps:decodedBytesFor(pencilBoxTextures),
          stationeryDecodedBytesWithMipmaps:decodedBytesFor(stationeryTextures),
          meshObjects:resources.meshes,triangles:resources.triangles,
          stationeryGeometries:stationeryResources.geometries.size,stationeryMaterials:stationeryResources.materials.size,
          stationeryTextures:stationeryResources.textures.size,stationeryTriangles:stationeryResources.triangles,
          drawCallsPerInstance:resources.primitiveDraws,drawCallsPerClassroom:resources.primitiveDraws*INSTANCES_PER_CLASSROOM,
        },
        contents:{combinations:CONTENT_COMBINATIONS.length,assignments:contentAssignments},
        boundsAudit:{
          violations:assignments.filter(item=>item.worldBounds.min[1]<item.tableY-.0005).map(item=>item.id),
        },
        assignments,
      }
      return snapshot
    })().catch(error=>{snapshot={...snapshot,status:'failed',error:String(error)};loadPromise=null;throw error})
    return loadPromise
  }
  const itemForObject=object=>{
    for(let node=object;node;node=node.parent)if(node.userData.pencilBox)return node.userData.pencilBox
    return null
  }
  const isWorldVisible=object=>{
    for(let node=object;node;node=node.parent)if(node.visible===false)return false
    return true
  }
  return {
    load,snapshot:()=>structuredClone(snapshot),instances:()=>[...instances],
    pickables:()=>proxies.filter(isWorldVisible),itemForObject,
    instanceForId:id=>instances.find(instance=>instance.userData.pencilBox?.id===id)??null,
    viewerOptionsFor:item=>({
      kind:'pencil-box',title:item?.label??'铁皮铅笔盒',targetSize:1.48,initialRotationY:.08,
      pitch:item?.state==='open'?.42:1.02,spinSpeed:.25,action:'toggle-lid',actionLabel:'点击开合',
    }),
  }
}

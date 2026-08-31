import * as THREE from 'three'

const MODEL_URL='/assets/models/snacks/bubuxing-seafood-snack-bag-game-v02.glb'
const MODEL_SIZE={width:.1595,depth:.1496,thickness:.0698}
const CUBBY_FLOOR_OFFSET=.418
const CUBBY_FRONT_EDGE_Z=.160
const CUBBY_FRONT_INSET=.008
const CUBBY_CENTERS={left:-.265,right:.265}
const DEG=Math.PI/180
const RUNTIME_TEXTURE_SIZE=[512,491]
const ROOM_PLANS=[
  {classroom:'b2-room-2-floor-1',preferred:'b2-room-2-floor-1-row-3-column-1-student-desk',cubby:'right',rotationOffset:-4*DEG},
  {classroom:'b2-room-3-floor-2',preferred:'b2-room-3-floor-2-row-4-column-4-student-desk',cubby:'left',rotationOffset:3*DEG},
  {classroom:'b2-room-4-floor-3',preferred:'b2-room-4-floor-3-row-2-column-2-student-desk',cubby:'right',rotationOffset:-2*DEG},
]

function classroomName(anchorName) {
  return anchorName.replace(/-row-\d+-column-\d+-student-desk$/,'')
}

function chooseAnchors(studentAnchors,occupiedAnchorNames) {
  const occupied=new Set(occupiedAnchorNames)
  return ROOM_PLANS.map(plan=>{
    const roomAnchors=studentAnchors
      .filter(anchor=>classroomName(anchor.name)===plan.classroom&&!occupied.has(anchor.name))
      .sort((a,b)=>a.name.localeCompare(b.name))
    const anchor=roomAnchors.find(item=>item.name===plan.preferred)??roomAnchors[0]
    if(!anchor)throw new Error(`二号楼教室没有可用课桌格子：${plan.classroom}`)
    occupied.add(anchor.name)
    return {...plan,anchor}
  })
}

function placementFor(plan) {
  const {anchor}=plan
  const localX=CUBBY_CENTERS[plan.cubby]
  // +Z 是学生坐席／书仓开口方向。袋子平放，前缘留 8 mm，不穿出底板。
  const localZ=CUBBY_FRONT_EDGE_Z-MODEL_SIZE.depth/2-CUBBY_FRONT_INSET
  const floorY=anchor.position[1]-.602
  const shelfY=floorY+CUBBY_FLOOR_OFFSET
  const cos=Math.cos(anchor.rotationY),sin=Math.sin(anchor.rotationY)
  return {
    ...plan,
    local:[localX,localZ],
    shelfY,
    position:[
      anchor.position[0]+cos*localX+sin*localZ,
      shelfY+MODEL_SIZE.thickness/2+.002,
      anchor.position[2]-sin*localX+cos*localZ,
    ],
    rotationY:anchor.rotationY+plan.rotationOffset,
    frontClearance:CUBBY_FRONT_EDGE_Z-(localZ+MODEL_SIZE.depth/2),
  }
}

function prepareTemplate(template,renderer) {
  const geometries=new Set(),materials=new Set(),textures=new Set()
  let meshes=0,primitiveDraws=0
  template.traverse(object=>{
    if(!object.isMesh)return
    meshes++;geometries.add(object.geometry)
    object.castShadow=false
    object.receiveShadow=true
    const objectMaterials=Array.isArray(object.material)?object.material:[object.material]
    primitiveDraws+=object.geometry.groups.length||1
    for(const material of objectMaterials)if(material) {
      materials.add(material)
      if(material.map) {
        textures.add(material.map)
        material.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
        material.map.minFilter=THREE.LinearMipmapLinearFilter
        material.map.magFilter=THREE.LinearFilter
      }
    }
  })
  return {meshes,primitiveDraws,geometries,materials,textures}
}

export function createSnackBags({renderer,assetLoader,studentAnchors,occupiedAnchorNames=[],roomRootFor}) {
  let loadPromise=null,instances=[]
  let snapshot={
    status:'idle',modelUrl:MODEL_URL,instances:0,classrooms:0,orientation:'flat-front-up',
  }

  const load=()=>{
    if(loadPromise)return loadPromise
    loadPromise=(async()=>{
      const gltf=await assetLoader.loadGltf(MODEL_URL)
      const template=gltf.scene
      template.updateMatrixWorld(true)
      const sourceBounds=new THREE.Box3().setFromObject(template)
      const sourceSize=sourceBounds.getSize(new THREE.Vector3())
      const resources=prepareTemplate(template,renderer)
      const placements=chooseAnchors(studentAnchors,occupiedAnchorNames).map(placementFor)
      const layFlat=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2)
      const upAxis=new THREE.Vector3(0,1,0)

      instances=placements.map((placement,index)=>{
        const instance=template.clone(true)
        instance.name=`b2-bubuxing-snack-bag-${index+1}`
        instance.position.fromArray(placement.position)
        instance.quaternion
          .setFromAxisAngle(upAxis,placement.rotationY)
          .multiply(layFlat)
        instance.userData.snackBag={
          id:`bubuxing-snack-${index+1}`,classroom:placement.classroom,
          deskId:placement.anchor.name,cubby:placement.cubby,orientation:'flat-front-up',
        }
        roomRootFor(placement.classroom).add(instance)
        return instance
      })
      const worldSizes=instances.map(instance=>{
        instance.updateWorldMatrix(true,true)
        return new THREE.Box3().setFromObject(instance).getSize(new THREE.Vector3())
      })

      const decodedBytesWithMipmaps=Math.ceil(
        RUNTIME_TEXTURE_SIZE[0]*RUNTIME_TEXTURE_SIZE[1]*4*4/3*resources.textures.size,
      )
      snapshot={
        status:'loaded',modelUrl:MODEL_URL,instances:instances.length,
        classrooms:new Set(placements.map(item=>item.classroom)).size,
        orientation:'flat-front-up',modelSize:{...MODEL_SIZE},
        sourceBounds:[sourceSize.x,sourceSize.y,sourceSize.z].map(value=>+value.toFixed(5)),
        sharedResources:{
          requests:1,geometries:resources.geometries.size,materials:resources.materials.size,
          textures:resources.textures.size,textureSize:[...RUNTIME_TEXTURE_SIZE],decodedBytesWithMipmaps,
          meshObjects:resources.meshes,drawCallsPerVisibleRoom:resources.primitiveDraws,
        },
        cubby:{floorOffset:CUBBY_FLOOR_OFFSET,frontEdge:CUBBY_FRONT_EDGE_Z,frontInset:CUBBY_FRONT_INSET},
        boundsAudit:{
          violations:placements.filter(item=>item.frontClearance<CUBBY_FRONT_INSET-.0001).map(item=>item.anchor.name),
        },
        assignments:placements.map((item,index)=>({
          id:`bubuxing-snack-${index+1}`,classroom:item.classroom,anchor:item.anchor.name,
          cubby:item.cubby,position:item.position.map(value=>+value.toFixed(5)),
          rotationY:+item.rotationY.toFixed(5),rotationOffset:+item.rotationOffset.toFixed(5),
          local:item.local.map(value=>+value.toFixed(5)),shelfY:+item.shelfY.toFixed(5),
          frontClearance:+item.frontClearance.toFixed(5),orientation:'flat-front-up',
          worldSize:worldSizes[index].toArray().map(value=>+value.toFixed(5)),
        })),
      }
      return snapshot
    })().catch(error=>{snapshot={...snapshot,status:'failed',error:String(error)};loadPromise=null;throw error})
    return loadPromise
  }

  const itemForObject=object=>{
    for(let node=object;node;node=node.parent)if(node.userData.snackBag)return node.userData.snackBag
    return null
  }

  return {
    load,snapshot:()=>structuredClone(snapshot),instances:()=>[...instances],itemForObject,
    instanceForId:id=>instances.find(instance=>instance.userData.snackBag?.id===id)??null,
  }
}

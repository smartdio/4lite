import * as THREE from 'three'

// Static one-off memory object. Source GLB is Y-up, with the orbiter facing +Z.
export function createWoodenSpaceShuttle({root,assetLoader,teacherAnchors,config}) {
  let pending=null,model=null
  let state={status:'idle',instances:0,classroom:config.classroom,url:config.url}
  const snapshot=()=>structuredClone(state)
  const load=()=>{
    if(pending)return pending
    pending=(async()=>{
      state={...state,status:'loading'}
      const anchor=teacherAnchors.find(item=>item.name===`${config.classroom}-east-teacher-desk`)
      if(!anchor)throw new Error(`Missing shuttle teacher desk: ${config.classroom}`)
      const gltf=await assetLoader.loadGltf(config.url)
      const object=gltf.scene.clone(true)
      object.name='wooden-space-shuttle'
      const bounds=new THREE.Box3().setFromObject(object)
      const size=bounds.getSize(new THREE.Vector3())
      if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Invalid shuttle model bounds')
      const scale=config.height/size.y
      object.scale.setScalar(scale)
      const [localX,localZ]=config.deskOffset
      // Desk guard rails occupy x=±.58 and z=.18; preserve a small clearance.
      const footprint={minX:localX+bounds.min.x*scale,maxX:localX+bounds.max.x*scale,minZ:localZ+bounds.min.z*scale,maxZ:localZ+bounds.max.z*scale}
      if(footprint.minX<-.575||footprint.maxX>.575||footprint.minZ<-.195||footprint.maxZ>.175)throw new Error('Shuttle base exceeds clear desk surface')
      const cos=Math.cos(anchor.rotationY),sin=Math.sin(anchor.rotationY)
      object.position.set(anchor.position[0]+cos*localX+sin*localZ,anchor.position[1]-bounds.min.y*scale,anchor.position[2]-sin*localX+cos*localZ)
      object.rotation.y=anchor.rotationY
      let meshes=0,triangles=0
      object.traverse(node=>{
        if(!node.isMesh)return
        meshes++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3
        node.castShadow=true;node.receiveShadow=true
      })
      root.add(object);model=object;object.updateMatrixWorld(true)
      const worldBounds=new THREE.Box3().setFromObject(object)
      state={...state,status:'loaded',instances:1,anchor:anchor.name,position:object.position.toArray(),rotationY:object.rotation.y,height:config.height,footprint,worldBounds:{min:worldBounds.min.toArray(),max:worldBounds.max.toArray()},meshes,triangles}
      return snapshot()
    })().catch(error=>{
      if(model){root.remove(model);model=null}
      state={...state,status:'failed',instances:0,error:String(error)};pending=null
      throw error
    })
    return pending
  }
  return {load,snapshot}
}

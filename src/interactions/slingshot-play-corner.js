import * as THREE from 'three'

const rounded=value=>+value.toFixed(3)

function pipeBetween(name,start,end,radius,material,parent,segments=10) {
  const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),direction=new THREE.Vector3().subVectors(b,a)
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,direction.length(),segments),material)
  mesh.name=name;mesh.position.copy(a).add(b).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize())
  mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh
}

function addBox(name,size,center,material,parent) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material)
  mesh.name=name;mesh.position.set(center[0],center[1],center[2]);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh
}

function addChalkNumber({renderer,line,surfaceY,parent}) {
  if(!line.chalkLabel)return null
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128
  const context=canvas.getContext('2d'),label=String(line.chalkLabel)
  context.textAlign='center';context.textBaseline='middle';context.lineCap='round';context.lineJoin='round'
  context.font='700 92px "KaiTi","STKaiti","PingFang SC",sans-serif'
  // 三层轻微错位的线条模拟旧地面上反复描过、边缘掉粉的粉笔字。
  const strokes=[[-1.5,.7,.48],[1.2,-.8,.32],[0,0,.74]]
  for(const [x,y,alpha] of strokes) {
    context.lineWidth=3.5;context.strokeStyle=`rgba(224,216,194,${alpha})`
    context.strokeText(label,128+x,67+y)
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name=`slingshot-firing-line-${line.id}-chalk-number-texture`
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true
  const material=new THREE.MeshBasicMaterial({
    name:`slingshot-firing-line-${line.id}-chalk-number-material`,map:texture,transparent:true,
    depthWrite:false,alphaTest:.025,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5,
  })
  const yaw=line.rotationY??0,offset=new THREE.Vector3(0,0,-.23).applyAxisAngle(new THREE.Vector3(0,1,0),yaw)
  const group=new THREE.Group();group.name=`slingshot-firing-line-${line.id}-chalk-number-anchor`
  group.position.set(line.center[0]+offset.x,surfaceY+.008,line.center[1]+offset.z)
  // 从南侧起射区走近时正向阅读；位置仍保持在线的南侧。
  group.rotation.y=yaw+Math.PI;parent.add(group)
  const width=label.length>1?.52:.34
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,.26),material)
  mesh.name=`slingshot-firing-line-${line.id}-chalk-number`;mesh.rotation.x=-Math.PI/2
  mesh.castShadow=mesh.receiveShadow=false;mesh.userData.slingshotChalkLabel={id:line.id,label};group.add(mesh)
  return mesh
}

export function createSlingshotPlayCorner({scene,renderer,assetLoader,navigation,config}) {
  const root=new THREE.Group();root.name='slingshot-natural-play-corner';scene.add(root)
  const assetRoot=new THREE.Group();assetRoot.name='slingshot-play-corner-glb-assets';root.add(assetRoot)
  const materials={
    stone:new THREE.MeshStandardMaterial({name:'slingshot-corner-old-stone',color:0x777268,roughness:.96,metalness:0}),
    rope:new THREE.MeshStandardMaterial({name:'slingshot-corner-hemp-rope',color:0x806849,roughness:1,metalness:0}),
    branch:new THREE.MeshStandardMaterial({name:'slingshot-corner-branch',color:0x5b4734,roughness:.98,metalness:0}),
    chalk:new THREE.MeshBasicMaterial({
      name:'slingshot-corner-worn-chalk-line',color:0xcfc6ac,
      polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,
    }),
  }
  const colorMaterials=new Map()
  const colorMaterial=color=>{
    if(!colorMaterials.has(color))colorMaterials.set(color,new THREE.MeshStandardMaterial({color,roughness:.92,metalness:0}))
    return colorMaterials.get(color)
  }
  const platform=config.stonePlatform,topCenter=[platform.center[0],platform.topY-platform.topSize[1]/2,platform.center[1]]
  addBox('slingshot-corner-stone-top',platform.topSize,topCenter,materials.stone,root)
  for(const [index,support] of platform.supports.entries()) {
    const center=[support.center[0],config.surfaceY+support.size[1]/2,support.center[1]]
    addBox(`slingshot-corner-stone-support-${index+1}`,support.size,center,materials.stone,root)
    navigation.addAabb(`slingshot-corner-stone-support-${index+1}`,center,support.size)
  }
  navigation.addAabb('slingshot-corner-stone-top',topCenter,platform.topSize)
  const chalkLabels=[]
  const firingLines=(config.firingLines??[]).map(line=>{
    const mesh=addBox(`slingshot-firing-line-${line.id}`,[line.width,.006,line.depth],[line.center[0],config.surfaceY+.004,line.center[1]],materials.chalk,root)
    mesh.rotation.y=line.rotationY??0
    mesh.castShadow=false
    mesh.userData.slingshotFiringLine={id:line.id,distance:line.distance,workingValue:true}
    const label=addChalkNumber({renderer,line,surfaceY:config.surfaceY,parent:root});if(label)chalkLabels.push(label)
    return mesh
  })
  pipeBetween('slingshot-corner-tree-branch',config.branch.start,config.branch.end,config.branch.radius,materials.branch,root,12)

  const hangingTargets=[]
  for(const target of config.hangingTargets) {
    const pivot=new THREE.Group();pivot.name=`slingshot-target-${target.id}-pivot`;pivot.position.set(...target.anchor);root.add(pivot)
    const localCenter=[target.center[0]-target.anchor[0],target.center[1]-target.anchor[1],target.center[2]-target.anchor[2]]
    const ropeEnd=[localCenter[0],localCenter[1]+target.size[1]/2,localCenter[2]]
    const rope=pipeBetween(`slingshot-target-${target.id}-rope`,[0,0,0],ropeEnd,.012,materials.rope,pivot,8)
    let mesh
    if(target.shape==='cylinder') {
      mesh=new THREE.Mesh(new THREE.CylinderGeometry(target.size[0],target.size[0],target.size[1],12),colorMaterial(target.color))
      mesh.position.set(...localCenter);mesh.name=`slingshot-target-${target.id}`;mesh.castShadow=mesh.receiveShadow=true;pivot.add(mesh)
    } else mesh=addBox(`slingshot-target-${target.id}`,target.size,localCenter,colorMaterial(target.color),pivot)
    mesh.rotation.z=target.rotationZ??0
    mesh.userData.slingshotTarget={id:target.id,type:'hanging',workingValue:true}
    hangingTargets.push({id:target.id,type:'hanging',mesh,rope,pivot,length:new THREE.Vector3(...ropeEnd).length(),restRotationZ:mesh.rotation.z})
  }
  const looseBlocks=config.looseBlocks.map((block,index)=>{
    const mesh=addBox(`slingshot-loose-block-${index+1}`,block.size,block.center,colorMaterial(block.color),root)
    mesh.rotation.y=block.rotationY??(index-1)*.16;mesh.userData.slingshotTarget={id:`loose-${index+1}`,type:'static',workingValue:true}
    return {id:`loose-${index+1}`,type:'static',mesh,size:[...block.size],restPosition:mesh.position.clone(),restQuaternion:mesh.quaternion.clone()}
  })

  const heldTemplates=new Map(),worldModels=new Map()
  const state={status:'pending',models:[],targets:hangingTargets.length+looseBlocks.length,drawObjects:0}
  const load=async()=>{
    try {
      await assetLoader.enableMeshoptForGltf()
      const loaded=await Promise.all(config.slingshots.map(async item=>({item,gltf:await assetLoader.loadGltf(item.url)})))
      for(const {item,gltf} of loaded) {
        const heldTemplate=gltf.scene.clone(true);heldTemplate.updateMatrixWorld(true)
        const heldInitialBounds=new THREE.Box3().setFromObject(heldTemplate),heldInitialSize=heldInitialBounds.getSize(new THREE.Vector3())
        const heldScale=item.targetLength/Math.max(heldInitialSize.x,heldInitialSize.y,heldInitialSize.z)
        heldTemplate.scale.setScalar(heldScale);heldTemplate.updateMatrixWorld(true)
        const heldBounds=new THREE.Box3().setFromObject(heldTemplate),heldCenter=heldBounds.getCenter(new THREE.Vector3())
        heldTemplate.position.add(new THREE.Vector3(-heldCenter.x,-heldBounds.min.y,-heldCenter.z));heldTemplate.updateMatrixWorld(true)
        heldTemplates.set(item.id,{template:heldTemplate,targetLength:item.targetLength})
        const model=gltf.scene.clone(true);model.name=`slingshot-${item.id}-game-optimized-v01`
        model.rotation.set(...item.rotation);model.updateMatrixWorld(true)
        const initialBounds=new THREE.Box3().setFromObject(model),initialSize=initialBounds.getSize(new THREE.Vector3())
        const scale=item.targetLength/Math.max(initialSize.x,initialSize.y,initialSize.z);model.scale.setScalar(scale);model.updateMatrixWorld(true)
        const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3())
        model.position.add(new THREE.Vector3(item.center[0]-center.x,item.center[1]-bounds.min.y,item.center[2]-center.z))
        let meshes=0,triangles=0
        model.traverse(node=>{
          if(!node.isMesh)return
          meshes++;triangles+=node.geometry.index?node.geometry.index.count/3:node.geometry.attributes.position.count/3
          node.castShadow=node.receiveShadow=true
          for(const material of Array.isArray(node.material)?node.material:[node.material])for(const texture of [material?.map,material?.normalMap,material?.roughnessMap,material?.metalnessMap]) {
            if(!texture)continue
            texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
            if(texture===material.map)texture.colorSpace=THREE.SRGBColorSpace
          }
        })
        assetRoot.add(model);model.updateMatrixWorld(true);worldModels.set(item.id,model)
        const finalBounds=new THREE.Box3().setFromObject(model)
        state.models.push({
          id:item.id,url:item.url,meshes,triangles:Math.round(triangles),scale:rounded(scale),
          bounds:{min:finalBounds.min.toArray().map(rounded),max:finalBounds.max.toArray().map(rounded)},
        })
      }
      state.status='loaded';state.drawObjects=0;root.traverse(node=>{if(node.isMesh)state.drawObjects++})
      renderer.shadowMap.needsUpdate=true;return snapshot()
    } catch(error) {
      state.status='failed';state.message=error?.message||'unknown error';throw error
    }
  }
  const snapshot=()=>({
    ...state,shootingOrigin:[...config.shootingOrigin],shootingTarget:[...config.shootingTarget],
    firingLines:firingLines.map(line=>({...line.userData.slingshotFiringLine,center:[rounded(line.position.x),rounded(line.position.z)]})),
    chalkLabels:chalkLabels.map(label=>({...label.userData.slingshotChalkLabel,center:[rounded(label.parent.position.x),rounded(label.parent.position.z)]})),
    treePlacementId:config.treePlacementId,textureFloor:1024,gate:'B-graybox',
  })
  const createHeldModel=id=>{
    const entry=heldTemplates.get(id),heldConfig=config.game?.held?.[id]
    if(!entry||!heldConfig)return null
    const model=entry.template.clone(true);model.name=`slingshot-${id}-held-game-model`
    model.rotation.set(...heldConfig.modelRotation);model.updateMatrixWorld(true)
    const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3())
    model.position.add(new THREE.Vector3(-center.x,-bounds.min.y,-center.z));model.updateMatrixWorld(true)
    model.traverse(node=>{if(node.isMesh){node.castShadow=false;node.receiveShadow=true}})
    return model
  }
  const gameParts=()=>({hangingTargets,looseBlocks,worldModels,firingLines,createHeldModel,stonePlatform:config.stonePlatform})
  return {root,load,snapshot,gameParts,createHeldModel}
}

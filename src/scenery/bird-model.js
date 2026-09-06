import * as THREE from 'three'
import {samplePigeonStep,pigeonHeadOffset,pigeonLook,pigeonWingCycles} from './pigeon-motion.js'

export const BIRD_MODEL_SPECS = Object.freeze({
  sparrow: {length: .15, wingHz: 8.5, maxTriangles: 600},
  pigeon: {length: .30, wingHz: 5.6, maxTriangles: 900},
})
const clamp = THREE.MathUtils.clamp
const lerp = THREE.MathUtils.lerp
const smooth = x => {x=clamp(x,0,1);return x*x*(3-2*x)}
const joints=['body','head','tail','left_wing','right_wing','left_tip','right_tip','left_foot','right_foot']
const sides=[['left',-1],['right',1]]

// A fast power stroke and slower recovery. Absolute time makes pose sampling
// independent of frame rate, pausing, and the preview's scrubber.
function wingCycle(phase) {
  const cycle=((phase/(Math.PI*2))%1+1)%1
  return cycle<.34?1-2*smooth(cycle/.34):-1+2*smooth((cycle-.34)/.66)
}

export function createBirdLibrary(gltf) {
  const templates=new Map(),geometries=new Set(),materials=new Set()
  let disposed=false
  for(const [species,spec] of Object.entries(BIRD_MODEL_SPECS)) {
    const template=gltf.scene.getObjectByName(species)
    if(!template)throw new Error(`Missing bird template: ${species}`)
    let triangles=0,meshes=0
    template.traverse(node=>{
      if(!node.isMesh)return
      if(!node.geometry.attributes.color)throw new Error(`Missing bird vertex colors: ${node.name}`)
      meshes++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3
      node.castShadow=false;node.receiveShadow=true
      geometries.add(node.geometry)
      for(const material of Array.isArray(node.material)?node.material:[node.material]) {
        material.roughness=.94;material.metalness=0;materials.add(material)
      }
    })
    if(triangles>spec.maxTriangles||meshes>9)throw new Error(`Bird budget exceeded: ${species}`)
    for(const joint of joints)if(!template.getObjectByName(`${species}_${joint}`))throw new Error(`Missing ${species} joint: ${joint}`)
    templates.set(species,{template,triangles,meshes})
  }
  return {
    create(species) {
      if(disposed)throw new Error('Bird library is disposed')
      const source=templates.get(species)
      if(!source)throw new Error(`Unknown bird species: ${species}`)
      const model=source.template.clone(true),root=new THREE.Group()
      root.name=`bird-${species}`;root.add(model)
      const rig=Object.fromEntries(joints.map(joint=>[joint,model.getObjectByName(`${species}_${joint}`)]))
      const rest=Object.fromEntries(joints.map(name=>[name,rig[name].position.clone()]))
      const poseScratch={inverse:new THREE.Quaternion(),footRotation:new THREE.Quaternion(),axis:new THREE.Vector3(1,0,0),step:{}}
      const bird={root,model,rig,rest,poseScratch,species,spec:BIRD_MODEL_SPECS[species],meshes:source.meshes,triangles:source.triangles}
      updateBirdPose(bird,{time:0})
      root.updateMatrixWorld(true)
      model.position.y-=new THREE.Box3().setFromObject(root).min.y
      return bird
    },
    snapshot:()=>({species:Object.fromEntries([...templates].map(([name,{triangles,meshes}])=>[name,{triangles,meshes}])),geometries:geometries.size,materials:materials.size,textures:0,disposed}),
    dispose() {
      if(disposed)return
      disposed=true
      for(const geometry of geometries)geometry.dispose()
      for(const material of materials)material.dispose()
    },
  }
}

export function updateBirdPose(bird,{time,flight=0,wingSpread=flight,push=0,landing=0,walking=0,alert=0,peck=0,launch=0,phase=0,walkDistance=0,flightTime=time,flightRemaining=Infinity,contact=0}) {
  if(bird.species==='pigeon')return updatePigeonPose(bird,{time,flight,wingSpread,push,landing,walking,alert,peck,launch,phase,walkDistance,flightTime,flightRemaining,contact})
  const {rig,spec}=bird,f=smooth(flight),land=smooth(landing),walk=walking*(1-f)
  const cycle=time*spec.wingHz*Math.PI*2+phase
  const stroke=wingCycle(cycle),tipStroke=wingCycle(cycle-.48)
  const gait=time*(bird.species==='pigeon'?10:16)+phase
  const breath=Math.sin(time*3.4+phase)
  rig.body.position.y=spec.length*((1-f)*.007*breath + walk*.025*Math.abs(Math.sin(gait)) - launch*.08)
  rig.body.rotation.x=(1-f)*peck*.28+f*(.025*stroke)-land*.16
  rig.head.rotation.set((1-f)*(peck*1.15-alert*.16)-rig.body.rotation.x*.7,
    (1-f)*(Math.sin(time*.8+phase)*.22+Math.sin(time*1.73+phase)*.09),0)
  rig.head.position.z=spec.length*(.23+walk*.05*Math.sin(gait))
  rig.tail.rotation.x=f*.12+land*.30
  rig.tail.scale.x=1+land*.65
  for(const [side,sign] of sides) {
    rig[`${side}_wing`].rotation.set(0,sign*lerp(1.40,-.06,f),sign*lerp(-.16,stroke*.96+.13,f))
    rig[`${side}_tip`].rotation.set(0,sign*lerp(.12,.06,f),sign*f*(tipStroke*.45-.10))
    // The tapered primaries fan out as the elbow opens; no skinning texture.
    rig[`${side}_tip`].scale.x=lerp(.28,1,f)
    const step=Math.sin(gait+(sign<0?Math.PI:0))
    rig[`${side}_foot`].rotation.x=lerp(walk*step*.45,f*1.22,1-land)-land*.24
    rig[`${side}_foot`].position.y=spec.length*(.18+walk*.05*Math.max(0,step))
  }
}

function updatePigeonPose(bird,{time,flight,wingSpread,push,landing,walking,alert,peck,launch,phase,walkDistance,flightTime,flightRemaining,contact}) {
  const {rig,rest,poseScratch:s}=bird,f=smooth(flight),wing=smooth(wingSpread),land=smooth(landing),walk=walking*(1-f),ground=1-f
  const cycles=pigeonWingCycles(flightTime,flightRemaining),cycle=cycles*Math.PI*2
  const stroke=Math.max(wingCycle(cycle),-.55-.45*smooth(flightTime/.16)),tipStroke=wingCycle(cycle-.45),recovery=smooth((cycles%1-.34)/.66)
  const strength=1+.10*Math.exp(-Math.max(0,flightTime)/.55)+land*.06
  rig.body.position.copy(rest.body)
  rig.body.position.y+=ground*(.001*Math.sin(time*2.6+phase)+walk*.003*Math.cos(walkDistance/.055*Math.PI*2)-peck*.020-launch*.028+push*.014-contact*.010)+f*.002*stroke
  rig.body.rotation.set(ground*peck*.60+f*.022*stroke-land*.48,0,walk*.018*Math.sin(walkDistance/.11*Math.PI*2))
  rig.head.position.copy(rest.head)
  rig.head.position.z+=ground*pigeonHeadOffset(walkDistance)*(1-peck)
  rig.head.position.y+=ground*(alert*.014-peck*.006)-walk*(rig.body.position.y-rest.body.y)
  rig.head.rotation.set(ground*(peck*.70-alert*.16)-rig.body.rotation.x*.25,
    ground*(1-walk)*(1-peck)*pigeonLook(time,phase)*(1-alert*.7),0)
  rig.tail.rotation.x=f*.10+land*.36-ground*peck*.12
  rig.tail.scale.x=1+land*.65
  s.inverse.copy(rig.body.quaternion).invert()
  for(const [side,sign] of sides){
    rig[`${side}_wing`].rotation.set(0,sign*lerp(1.40,-.06-.15*recovery,wing),sign*lerp(-.16,stroke*.96*strength+.13,wing))
    rig[`${side}_tip`].rotation.set(0,sign*lerp(.12,.06+.18*recovery,wing),sign*wing*(tipStroke*.45-.10))
    rig[`${side}_tip`].scale.x=lerp(.28,1-.12*recovery,wing)
    const foot=rig[`${side}_foot`],step=samplePigeonStep(walkDistance,side,s.step)
    foot.position.copy(rest[`${side}_foot`]);foot.position.z+=ground*step.z
    foot.position.y+=walk*step.lift
    // Feet stay in the ground frame while the body dips, pecks and bears weight.
    // This also fixes the old foot rotation blend, which erased every walking step.
    foot.position.sub(rig.body.position).applyQuaternion(s.inverse)
    s.footRotation.setFromAxisAngle(s.axis,lerp(step.pitch*walk,1.22,f)*(1-land)-land*.26*f)
    foot.quaternion.copy(s.inverse).multiply(s.footRotation)
  }
}

export function createBirdContactShadows(maximum=5) {
  const geometry=new THREE.PlaneGeometry(1,1)
  const opacity=new THREE.InstancedBufferAttribute(new Float32Array(maximum),1).setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('shadowOpacity',opacity)
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,
    vertexShader:'attribute float shadowOpacity; varying float vOpacity; varying vec2 vUv; void main(){vUv=uv;vOpacity=shadowOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
    fragmentShader:'varying float vOpacity; varying vec2 vUv; void main(){float r=length((vUv-.5)*2.);float a=(1.-smoothstep(.15,1.,r))*.60*vOpacity;gl_FragColor=vec4(.22,.20,.17,a);}',
  })
  const mesh=new THREE.InstancedMesh(geometry,material,maximum)
  mesh.name='bird-contact-shadows';mesh.frustumCulled=false
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const transform=new THREE.Object3D()
  return {mesh,
    set(index,position,groundY,bodyLength,heading=0) {
      opacity.setX(index,1-smooth((position.y-groundY)/.65));opacity.needsUpdate=true
      // Visible paving / wear layers sit up to 18 mm above the terrain base.
      // Keep the projection above those layers, with normal depth occlusion.
      transform.position.set(position.x,groundY+.022,position.z)
      transform.rotation.set(-Math.PI/2,heading,0,'YXZ')
      // A soft ellipse aligned with the body. Height fades its opacity instead
      // of shrinking the footprint into a dot; no image texture is needed.
      transform.scale.set(bodyLength*.8,bodyLength*1.45,1)
      transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);mesh.instanceMatrix.needsUpdate=true
    },
    dispose(){mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose()},
  }
}

// Corresponding rig parts share one instanced draw per species. This also keeps
// the campus's existing glass transmission pass inside the flock's draw budget.
export function createBirdInstanceBatch(birds) {
  const group=new THREE.Group(),parts=new Map(),matrix=new THREE.Matrix4(),inverse=new THREE.Matrix4()
  group.name='bird-instanced-parts'
  for(const bird of birds) {
    bird.root.visible=false // Joint hierarchy remains editable and animates offscreen.
    bird.model.traverse(mesh=>{
      if(!mesh.isMesh)return
      const key=`${bird.species}:${mesh.name}`
      if(!parts.has(key))parts.set(key,{geometry:mesh.geometry,material:mesh.material,meshes:[]})
      parts.get(key).meshes.push(mesh)
    })
  }
  for(const [name,part] of parts) {
    const mesh=new THREE.InstancedMesh(part.geometry,part.material,part.meshes.length)
    mesh.name=name;mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);part.instances=mesh
  }
  return {group,drawObjects:parts.size,
    update() {
      group.updateWorldMatrix(true,false);inverse.copy(group.matrixWorld).invert()
      for(const bird of birds)bird.root.updateMatrixWorld(true)
      for(const part of parts.values()) {
        for(let i=0;i<part.meshes.length;i++){matrix.multiplyMatrices(inverse,part.meshes[i].matrixWorld);part.instances.setMatrixAt(i,matrix)}
        part.instances.instanceMatrix.needsUpdate=true
      }
    },
    dispose(){group.removeFromParent();for(const part of parts.values())part.instances.dispose();parts.clear()},
  }
}

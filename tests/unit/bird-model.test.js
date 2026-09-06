import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createBirdLibrary,createBirdInstanceBatch,createBirdContactShadows,updateBirdPose} from '../../src/scenery/bird-model.js'

function fixture(){
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial({vertexColors:true})
  for(const species of ['sparrow','pigeon']){
    const root=new THREE.Group();root.name=species;scene.add(root)
    const body=new THREE.Group();body.name=`${species}_body`;root.add(body)
    for(const joint of ['head','tail','left_wing','right_wing','left_tip','right_tip','left_foot','right_foot']){
      const group=new THREE.Group();group.name=`${species}_${joint}`;body.add(group)
    }
    const geometry=new THREE.BoxGeometry(.1,.1,.1)
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3).fill(.5),3))
    const mesh=new THREE.Mesh(geometry,material);body.add(mesh)
  }
  return {scene}
}

test('instances share resources while poses remain independent',()=>{
  const library=createBirdLibrary(fixture()),a=library.create('sparrow'),b=library.create('sparrow')
  assert.notEqual(a.rig.left_wing,b.rig.left_wing)
  assert.equal(a.rig.body.children.at(-1).geometry,b.rig.body.children.at(-1).geometry)
  const before=b.rig.left_wing.rotation.toArray()
  updateBirdPose(a,{time:.1,flight:1})
  assert.deepEqual(b.rig.left_wing.rotation.toArray(),before)
  assert.notDeepEqual(a.rig.left_wing.rotation.toArray(),before)
  library.dispose()
})

test('sampling any pose twice restores all transforms without resource allocation',()=>{
  const library=createBirdLibrary(fixture()),bird=library.create('pigeon')
  const state=()=>Object.values(bird.rig).map(n=>[...n.position.toArray(),...n.rotation.toArray(),...n.scale.toArray()])
  updateBirdPose(bird,{time:4,walking:.8,peck:.3});const first=state(),resources=library.snapshot()
  for(let i=0;i<100;i++)updateBirdPose(bird,{time:i/60,flight:1,landing:.5})
  updateBirdPose(bird,{time:4,walking:.8,peck:.3})
  assert.deepEqual(state(),first);assert.deepEqual(library.snapshot(),resources)
  library.dispose()
})

test('disposing a shared library releases each resource once and prevents reuse',()=>{
  const gltf=fixture();let geometryDisposals=0,materialDisposals=0
  const materials=new Set()
  gltf.scene.traverse(n=>{if(n.isMesh){n.geometry.addEventListener('dispose',()=>geometryDisposals++);materials.add(n.material)}})
  for(const m of materials)m.addEventListener('dispose',()=>materialDisposals++)
  const library=createBirdLibrary(gltf);library.create('sparrow');library.create('sparrow')
  library.dispose();library.dispose()
  assert.equal(geometryDisposals,2);assert.equal(materialDisposals,1)
  assert.throws(()=>library.create('pigeon'),/disposed/)
})

test('a missing joint is rejected instead of producing a broken bird',()=>{
  const gltf=fixture();gltf.scene.getObjectByName('pigeon_left_tip').removeFromParent()
  assert.throws(()=>createBirdLibrary(gltf),/Missing pigeon joint/)
})


test('flock batching keeps independent rig matrices while sharing species geometry',()=>{
 const library=createBirdLibrary(fixture()),a=library.create('sparrow'),b=library.create('sparrow'),parent=new THREE.Group()
 a.root.position.x=2;b.root.position.x=-3;parent.add(a.root,b.root)
 const before=library.snapshot(),batch=createBirdInstanceBatch([a,b]);parent.add(batch.group);batch.update()
 assert.equal(batch.drawObjects,1);assert.equal(batch.group.children[0].count,2)
 const first=new THREE.Matrix4(),second=new THREE.Matrix4();batch.group.children[0].getMatrixAt(0,first);batch.group.children[0].getMatrixAt(1,second)
 assert.equal(first.elements[12],2);assert.equal(second.elements[12],-3)
 updateBirdPose(a,{time:.1,flight:1});batch.update();batch.group.children[0].getMatrixAt(1,second);assert.equal(second.elements[12],-3)
 assert.deepEqual(library.snapshot(),before);batch.dispose();library.dispose()
})

test('five projected ellipses follow heading and fade independently without shrinking or floating',()=>{
 const shadows=createBirdContactShadows(5),mesh=shadows.mesh,matrix=new THREE.Matrix4(),major=new THREE.Vector3()
 const ground=1.2,position=new THREE.Vector3(3,ground,4),opacity=mesh.geometry.getAttribute('shadowOpacity')
 shadows.set(0,position,ground,.15,0);mesh.getMatrixAt(0,matrix)
 const width=new THREE.Vector3().setFromMatrixColumn(matrix,0).length(),length=major.setFromMatrixColumn(matrix,1).length()
 assert.ok(length>width*1.7);assert.ok(Math.abs(major.z)>.2);assert.equal(opacity.getX(0),1)
 assert.ok(matrix.elements[13]>ground+.018&&matrix.elements[13]<ground+.03)
 shadows.set(1,position,ground,.30,Math.PI/2);mesh.getMatrixAt(1,matrix)
 major.setFromMatrixColumn(matrix,1);assert.ok(Math.abs(major.x)>.4);assert.ok(Math.abs(major.z)<1e-6)
 shadows.set(2,position.clone().add(new THREE.Vector3(0,.325,0)),ground,.15)
 assert.ok(Math.abs(opacity.getX(2)-.5)<1e-6)
 mesh.getMatrixAt(2,matrix);assert.ok(Math.abs(new THREE.Vector3().setFromMatrixColumn(matrix,1).length()-length)<1e-6)
 shadows.set(3,position.clone().add(new THREE.Vector3(0,3,0)),ground,.15)
 assert.equal(opacity.getX(3),0);assert.equal(opacity.getX(0),1)
 mesh.getMatrixAt(3,matrix);assert.ok(matrix.elements[13]>ground+.018&&matrix.elements[13]<ground+.03)
 assert.equal(mesh.count,5);assert.equal(mesh.material.map,undefined);assert.equal(mesh.castShadow,false)
 shadows.dispose()
})

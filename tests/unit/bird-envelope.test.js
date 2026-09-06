import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createBirdLibrary,updateBirdPose} from '../../src/scenery/bird-model.js'
import {BIRD_CONFIG} from '../../src/scenery/bird-config.js'
const path=new URL('../../public/assets/models/campus-birds/campus-birds-v03.glb',import.meta.url)
for(const species of ['sparrow','pigeon'])test(`${species} complete wing cycle plus pitch and banking fits the swept flight envelope`,{skip:!existsSync(path)},async()=>{
 const bytes=readFileSync(path),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
 const library=createBirdLibrary(gltf),bird=library.create(species),c=BIRD_CONFIG.clearance[species],v=new THREE.Vector3()
 let maximum=0
 for(const landing of [0,1])for(const pitch of [-.25,0,.25])for(const roll of [-.32,0,.32])for(let i=0;i<32;i++){
  updateBirdPose(bird,{time:i/32,flight:1,landing});bird.root.rotation.set(pitch,0,roll);bird.root.updateMatrixWorld(true)
  bird.root.traverse(mesh=>{if(!mesh.isMesh)return;const a=mesh.geometry.attributes.position;for(let j=0;j<a.count;j++){
   v.fromBufferAttribute(a,j).applyMatrix4(mesh.matrixWorld)
   maximum=Math.max(maximum,(v.x*v.x+v.z*v.z)/c.radius**2+(v.y-c.offset)**2/c.height**2)
  }})
 }
 assert.ok(maximum<1,`wing envelope overflow: ${maximum}`);library.dispose()
})

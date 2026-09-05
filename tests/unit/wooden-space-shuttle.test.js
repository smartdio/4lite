import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createWoodenSpaceShuttle} from '../../src/wooden-space-shuttle.js'

const config={url:'/shuttle.glb',classroom:'b2-room-2-floor-1',height:.4,deskOffset:[0,0]}
const anchor={name:'b2-room-2-floor-1-east-teacher-desk',position:[3,1.46,-5],rotationY:-Math.PI/2}
function asset(){const scene=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(.22,.4,.18),new THREE.MeshStandardMaterial());mesh.position.y=.2;scene.add(mesh);return {scene}}

test('loads one full model, rotates to student side, and sits exactly on desktop',async()=>{
  const root=new THREE.Group();let calls=0
  const prop=createWoodenSpaceShuttle({root,config,teacherAnchors:[anchor],assetLoader:{loadGltf:async()=>{calls++;return asset()}}})
  await Promise.all([prop.load(),prop.load()]);await prop.load()
  const state=prop.snapshot()
  assert.equal(calls,1);assert.equal(root.children.length,1);assert.equal(state.instances,1)
  assert.ok(Math.abs(state.worldBounds.min[1]-anchor.position[1])<1e-7)
  assert.ok(Math.abs(state.worldBounds.max[1]-state.worldBounds.min[1]-.4)<1e-7)
  const facing=new THREE.Vector3(0,0,1).applyQuaternion(root.children[0].quaternion)
  assert.ok(facing.distanceTo(new THREE.Vector3(-1,0,0))<1e-7)
})

test('failed load stays empty and retry creates only one instance',async()=>{
  const root=new THREE.Group();let calls=0
  const prop=createWoodenSpaceShuttle({root,config,teacherAnchors:[anchor],assetLoader:{loadGltf:async()=>{if(++calls===1)throw new Error('network');return asset()}}})
  await assert.rejects(prop.load(),/network/)
  assert.equal(prop.snapshot().status,'failed');assert.equal(root.children.length,0)
  await prop.load();assert.equal(root.children.length,1);assert.equal(prop.snapshot().status,'loaded')
})

test('missing room or placement outside clear tabletop fails rather than guessing',async()=>{
  for(const settings of [{teacherAnchors:[],config},{teacherAnchors:[anchor],config:{...config,deskOffset:[.55,0]}}]){
    const root=new THREE.Group()
    const prop=createWoodenSpaceShuttle({root,...settings,assetLoader:{loadGltf:async()=>asset()}})
    await assert.rejects(prop.load());assert.equal(root.children.length,0)
  }
})

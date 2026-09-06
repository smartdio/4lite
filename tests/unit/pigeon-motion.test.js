import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createBirdLibrary,updateBirdPose} from '../../src/scenery/bird-model.js'
import {PIGEON_STRIDE,samplePigeonWalk,pigeonHeadOffset,pigeonPeck,pigeonWingCycles,samplePigeonLaunch,pigeonFlightWeights} from '../../src/scenery/pigeon-motion.js'
import {createBirdFlight,smoothBirdStep} from '../../src/scenery/bird-motion.js'
import {BIRD_CONFIG} from '../../src/scenery/bird-config.js'
const path=new URL('../../public/assets/models/campus-birds/campus-birds-v03.glb',import.meta.url)
const model=async()=>{const bytes=readFileSync(path),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');return createBirdLibrary(gltf)}

test('head hold cancels translation and thrust catches up quickly; cadence follows distance',()=>{
 const before=.002+pigeonHeadOffset(.002),after=.018+pigeonHeadOffset(.018)
 assert.ok(Math.abs(before-after)<1e-9)
 assert.ok(.031+pigeonHeadOffset(.031)-after>.02)
 const sample=samplePigeonWalk(0,2,PIGEON_STRIDE*4)
 assert.equal(sample.distance,0);assert.equal(sample.strength,0)
 assert.equal(samplePigeonWalk(2,2,PIGEON_STRIDE*4).distance,PIGEON_STRIDE*4)
 assert.equal(samplePigeonWalk(2,2,PIGEON_STRIDE*4).strength,0)
 assert.equal(pigeonPeck(-.1),0);assert.equal(pigeonPeck(1.1),0);assert.equal(pigeonPeck(.46),1)
 const launchRate=(pigeonWingCycles(.11)-pigeonWingCycles(.1))/.01
 const cruiseRate=(pigeonWingCycles(2.01)-pigeonWingCycles(2))/.01
 assert.ok(launchRate>cruiseRate+.8)
})
test('real pigeon rig keeps the support foot and head steady in world space during a step',{skip:!existsSync(path)},async()=>{
 const library=await model(),bird=library.create('pigeon'),head=new THREE.Vector3(),foot=new THREE.Vector3(),samples=[]
 for(const distance of [.002,.010,.018]){
  bird.root.position.z=distance
  updateBirdPose(bird,{time:distance/.2,walking:1,walkDistance:distance})
  bird.root.updateMatrixWorld(true)
  bird.rig.left_foot.getWorldPosition(foot);bird.rig.head.getWorldPosition(head)
  samples.push({foot:foot.clone(),head:head.clone()})
 }
 for(const row of samples.slice(1)){
  assert.ok(row.foot.distanceTo(samples[0].foot)<1e-6,'support foot must not slide with the root')
  assert.ok(Math.abs(row.head.z-samples[0].head.z)<1e-6,'head hold must cancel forward travel')
 }
 library.dispose()
})
test('peck reaches the ground and body compression leaves planted feet in place',{skip:!existsSync(path)},async()=>{
 const library=await model(),bird=library.create('pigeon'),head=bird.model.getObjectByName('pigeon_head_mesh'),a=head.geometry.attributes.position
 let tip=0;for(let i=1;i<a.count;i++)if(a.getZ(i)>a.getZ(tip))tip=i
 const feet=[]
 for(const options of [{peck:0},{peck:1},{launch:1},{contact:1,landing:1}]){
  updateBirdPose(bird,{time:0,...options});bird.root.updateMatrixWorld(true)
  feet.push(bird.rig.left_foot.getWorldPosition(new THREE.Vector3()))
  if(options.peck===1){const beak=new THREE.Vector3().fromBufferAttribute(a,tip).applyMatrix4(head.matrixWorld);assert.ok(beak.y>=0&&beak.y<.015,`beak contact height ${beak.y}`)}
 }
 for(const point of feet)assert.ok(point.distanceTo(feet[0])<1e-6)
 library.dispose()
})
test('wings prepare on planted feet and the first downstroke clears the ground',{skip:!existsSync(path)},async()=>{
 const library=await model(),bird=library.create('pigeon'),v=new THREE.Vector3(),orientation=new THREE.Euler()
 const flight=createBirdFlight([[0,0,0],[.55,.5,0],[2.4,1.92,0],[4.8,4.6,0],[6,12,0]],{speed:5.5,minimumDuration:3,rampSeconds:.65,initialSpeed:2.2})
 const restFoot=bird.rig.left_foot.getWorldPosition(new THREE.Vector3()),c=BIRD_CONFIG.clearance.pigeon
 for(let i=-20;i<=50;i++){
  const time=i/100,prep=samplePigeonLaunch(time+.2),weights=pigeonFlightWeights(time,flight.duration-time,flight.length*(1-flight.parameterAt(time)))
  bird.root.position.set(0,0,0);bird.root.rotation.set(0,0,0)
  if(time>=0){flight.sample(time,bird.root.position,orientation);bird.root.rotation.x=orientation.x*smoothBirdStep(time/.38)}
  updateBirdPose(bird,{time:Math.max(0,time),flight:time<0?0:weights.airborne,wingSpread:time<0?prep.wings:weights.wings,launch:time<0?prep.crouch:0,push:time<0?prep.push:1-smoothBirdStep(time/.12),flightTime:Math.max(0,time)})
  bird.root.updateMatrixWorld(true)
  if(time<0)assert.ok(bird.rig.left_foot.getWorldPosition(v).distanceTo(restFoot)<1e-6,'preparing wings must not lift the feet')
  if(i===-1)assert.ok(Math.abs(bird.rig.left_wing.rotation.z)>1,'wings must be raised before lift-off')
  bird.root.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let j=0;j<p.count;j++){
   v.fromBufferAttribute(p,j).applyMatrix4(mesh.matrixWorld);assert.ok(v.y>=-.001,`${mesh.name} touches ground at ${time}: ${v.y}`)
   v.sub(bird.root.position)
   assert.ok((v.x*v.x+v.z*v.z)/c.radius**2+(v.y-c.offset)**2/c.height**2<1,'the preparation and first stroke must fit the validated footprint')
  }})
 }
 library.dispose()
})

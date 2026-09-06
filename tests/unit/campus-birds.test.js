import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createCampusBirds} from '../../src/scenery/campus-birds.js'
import {BIRD_CONFIG} from '../../src/scenery/bird-config.js'
import {createBirdFlight} from '../../src/scenery/bird-motion.js'
const p=(x,y,z)=>new THREE.Vector3(x,y,z)
function fixture(){
 const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial({vertexColors:true})
 for(const species of ['sparrow','pigeon']){
  const root=new THREE.Group();root.name=species;scene.add(root)
  for(const joint of ['body','head','tail','left_wing','right_wing','left_tip','right_tip','left_foot','right_foot']){const n=new THREE.Group();n.name=`${species}_${joint}`;root.add(n)}
  const g=new THREE.BoxGeometry(.1,.1,.1);g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3),3));root.add(new THREE.Mesh(g,material))
 }
 return {scene}
}
async function setup(counts={sparrow:0,pigeon:2}){
 let blocked=false,exhausted=false;const sounds=[]
 const controller=createCampusBirds({root:new THREE.Group(),assetLoader:{loadGltf:async()=>fixture()},audio:{playReady:(...args)=>sounds.push(args),stopGroup:()=>{}},config:{...BIRD_CONFIG,counts},seed:'unit-birds'})
 const circuit=[p(-10,12,-10),p(10,12,-10),p(10,12,10),p(-10,12,10)]
 const space={circuit,groundHeightAt:()=>0,safeGround:()=>true,index:{clear:()=>true},lineOfSight:()=>!blocked,
  available:(site,species,player)=>!exhausted&&(!player||site.position.distanceTo(player)>=BIRD_CONFIG.proximity[species].landing),
  flightThrough:points=>createBirdFlight(points.map(v=>v.toArray())),
  visibleScore:(position,species,view)=>blocked?0:view.score(position,species),
  destination:(species,rng,recent,player,occupied,from,zone,{view=null,requireVisible=false}={})=>{
   if(exhausted)return null
   const site={position:p(12+rng()*15,0,-20+rng()*15),zone:recent?.at(-1)==='main'?'front':'main',radius:2}
   if(requireVisible){site.position.copy(view.position).addScaledVector(view.forward,16);site.position.y=0}
   return {site,flight:from?createBirdFlight([from.position.toArray(),[from.position.x,12,from.position.z],[site.position.x,12,site.position.z],site.position.toArray()]):null}
  },snapshot:()=>({}),
 }
 await controller.load();controller.bindWorld(space)
 let now=0
 const step=(seconds,context={})=>{for(let i=0;i<seconds*20;i++){now+=50;controller.update(now,{soundsAllowed:false,...context})}}
 return {controller,step,sounds,setBlocked:value=>blocked=value,setExhausted:value=>exhausted=value}
}
test('pause freezes time, phase and decisions; cameras never overwrite the last walking body',async()=>{
 const {controller:c,step}=await setup();step(1,{roaming:true,playerPosition:p(0,1,0)})
 const before=c.snapshot();step(40,{paused:true,roaming:false,playerPosition:p(100,20,100)});const paused=c.snapshot()
 assert.equal(paused.time,before.time);assert.deepEqual(paused.birds,before.birds);assert.deepEqual(paused.player,[0,1,0])
 step(.1,{roaming:false,playerPosition:p(200,50,200)});assert.ok(c.snapshot().time-before.time<.1);assert.deepEqual(c.snapshot().player,[0,1,0]);c.dispose()
})
test('wall occlusion prevents panic; alert uses hysteresis and nearby pigeons take off in a stagger',async()=>{
 const {controller:c,step,setBlocked}=await setup(),members=c.inspect().members
 members[1].root.position.copy(members[0].root.position).add(p(.5,0,0))
 const body=members[0].root.position.clone().add(p(2,0,0))
 setBlocked(true);step(.5,{roaming:true,playerPosition:body});assert.equal(c.snapshot().takeoffs,0)
 setBlocked(false);step(.1,{roaming:true,playerPosition:body.clone().add(p(9.5,0,0))});assert.ok(c.snapshot().birds[0].alert)
 step(.1,{roaming:true,playerPosition:body.clone().add(p(11,0,0))});assert.ok(c.snapshot().birds[0].alert)
 step(.1,{roaming:true,playerPosition:body.clone().add(p(13,0,0))});assert.ok(!c.snapshot().birds[0].alert)
 step(.5,{roaming:true,playerPosition:body});const takeoffs=c.snapshot().events.filter(e=>e.type==='takeoff');assert.equal(takeoffs.length,2)
 assert.ok(takeoffs[1].time-takeoffs[0].time>=.1-1e-8);assert.ok(takeoffs[1].time-takeoffs[0].time<=.4);c.dispose()
})
test('no target defers ground departure; an occupied airborne target triggers a moving safe circuit',async()=>{
 const {controller:c,step,setExhausted}=await setup();setExhausted(true)
 assert.equal(c.requestRelocation('pigeon-1'),false);assert.equal(c.snapshot().takeoffs,0)
 setExhausted(false);assert.equal(c.requestRelocation('pigeon-1'),true);step(3)
 setExhausted(true);step(20);const b=c.inspect().members[0],first=b.root.position.clone();step(1)
 assert.notEqual(b.state,'rest');assert.ok(b.root.position.distanceTo(first)>.01);assert.ok(c.snapshot().diversions>0);c.dispose()
})
test('reset retains shared assets and reproduces a seed; disposal is idempotent',async()=>{
 const {controller:c,step}=await setup();c.reset('repeat');const first=c.snapshot().birds;step(10);c.reset('repeat');assert.deepEqual(c.snapshot().birds,first)
 const {group}=c.inspect();c.dispose();c.dispose();assert.equal(group.parent,null);assert.equal(c.snapshot().status,'disposed')
})

test('landing cooldown delays voluntary travel but never blocks a close escape',async()=>{
 const first=await setup(),a=first.controller.inspect().members[0];a.landedAt=0;a.due=0
 first.step(7.8);assert.equal(first.controller.snapshot().takeoffs,0)
 first.step(.5);assert.ok(first.controller.snapshot().takeoffs>0);first.controller.dispose()
 const second=await setup(),b=second.controller.inspect().members[0];b.landedAt=0;b.due=100
 second.step(.3,{roaming:true,playerPosition:b.root.position.clone().add(p(1,0,0))})
 assert.ok(second.controller.snapshot().takeoffs>0);assert.ok(second.controller.snapshot().time<8);second.controller.dispose()
})
test('disposing during a pending load releases the arriving shared geometry instead of resurrecting the flock',async()=>{
 let resolve;const gltf=fixture();let disposals=0;gltf.scene.traverse(n=>{if(n.isMesh)n.geometry.addEventListener('dispose',()=>disposals++)})
 const controller=createCampusBirds({root:new THREE.Group(),assetLoader:{loadGltf:()=>new Promise(r=>resolve=r)}})
 const pending=controller.load();controller.dispose();resolve(gltf);await pending
 assert.equal(controller.snapshot().status,'disposed');assert.equal(disposals,2)
})

test('an absent flock sends one existing bird into view after a delay, then still flees on approach',async()=>{
 const {controller:c,step}=await setup(),members=c.inspect().members
 for(const b of members){b.due=500;b.actionAt=500}
 const ctx={roaming:true,playerPosition:p(0,.9,0),listenerPosition:p(0,1.6,0),viewDirection:p(0,0,-1)}
 step(4.5,ctx);assert.equal(c.snapshot().takeoffs,0)
 const positions=c.snapshot().birds.map(b=>b.position)
 ctx.viewDirection=p(0,0,1);step(.1,ctx)
 assert.deepEqual(c.snapshot().birds.map(b=>b.position),positions)
 step(1,ctx);assert.equal(c.snapshot().takeoffs,1);assert.equal(c.snapshot().events[0].reason,'encounter')
 step(40,ctx);assert.equal(c.snapshot().takeoffs,1);assert.ok(c.snapshot().visibility.visibleBirds>=1)
 const landed=members.find(b=>b.recent.length>1);assert.ok(landed)
 const near=landed.root.position.clone().add(p(1,.9,0));step(.3,{...ctx,playerPosition:near})
 assert.equal(c.snapshot().events.filter(e=>e.type==='takeoff').at(-1).reason,'player')
 assert.equal(members.length,2);c.dispose()
})
test('aerial and paused cameras never trigger view encounters or change the saved walking view',async()=>{
 const {controller:c,step}=await setup();for(const b of c.inspect().members){b.due=500;b.actionAt=500}
 const ctx={roaming:true,playerPosition:p(0,.9,0),listenerPosition:p(0,1.6,0),viewDirection:p(0,0,-1)}
 step(.5,ctx);const before=c.snapshot().visibility
 step(20,{...ctx,roaming:false,listenerPosition:p(20,30,20),viewDirection:p(-1,-1,0)})
 assert.deepEqual(c.snapshot().visibility.eye,before.eye);assert.equal(c.snapshot().takeoffs,0)
 step(20,{...ctx,paused:true,viewDirection:p(0,0,1)})
 assert.deepEqual(c.snapshot().visibility.direction,before.direction);assert.equal(c.snapshot().takeoffs,0);c.dispose()
})
test('no visible destination leaves resting birds and their original dwell times alone',async()=>{
 const {controller:c,step}=await setup();const {members,space}=c.inspect()
 for(const b of members){b.due=500;b.actionAt=500}
 space.destination=()=>null
 const before=c.snapshot().birds.map(b=>b.position)
 step(16,{roaming:true,playerPosition:p(0,.9,0),listenerPosition:p(0,1.6,0),viewDirection:p(0,0,-1)})
 assert.equal(c.snapshot().takeoffs,0);assert.ok(c.snapshot().deferred>0)
 assert.deepEqual(c.snapshot().birds.map(b=>b.position),before)
 assert.ok(c.snapshot().birds.every(b=>b.due===500));c.dispose()
})
for(const [species,habitat] of [['pigeon','ground'],['sparrow','ground'],['sparrow','perch']])test(`${species} on ${habitat} flees at ten metres, respects walls, and requires a twelve-metre landing buffer`,async()=>{
 const {controller:c,step,setBlocked}=await setup({sparrow:0,pigeon:0,[species]:2}),{members,space}=c.inspect(),bird=members[0]
 bird.site.kind=habitat
 if(habitat==='perch'){bird.root.position.y=2.5;bird.site.position.y=2.5}
 for(const b of members){b.due=500;b.actionAt=500}
 members[1].root.position.copy(bird.root.position).add(p(25,0,0))
 step(.2,{roaming:true,playerPosition:bird.root.position.clone().add(p(10.3,.9,0))})
 assert.equal(c.snapshot().takeoffs,0)
 if(species==='pigeon')assert.equal(c.snapshot().birds[0].alert,true)
 const close=bird.root.position.clone().add(p(9.8,.9,0))
 setBlocked(true);step(.3,{roaming:true,playerPosition:close});assert.equal(c.snapshot().takeoffs,0)
 setBlocked(false);step(.2,{roaming:true,playerPosition:close});assert.equal(c.snapshot().takeoffs,1)
 assert.equal(c.snapshot().events.at(-1).reason,'player')
 assert.equal(space.available({position:close.clone().add(p(11.9,0,0))},species,close),false)
 assert.equal(space.available({position:close.clone().add(p(12.1,0,0))},species,close),true)
 c.dispose()
})
test('pigeon touchdown keeps the folded wings instead of reopening on the next frame',async()=>{
 const {controller:c,step}=await setup(),bird=c.inspect().members[0]
 assert.equal(c.requestRelocation(bird.id),true)
 for(let n=0;n<1000&&bird.state!=='rest';n++)step(.05)
 assert.equal(bird.state,'rest')
 const atContact=bird.rig.left_wing.quaternion.clone()
 step(.05)
 assert.ok(atContact.angleTo(bird.rig.left_wing.quaternion)<.02)
 c.dispose()
})

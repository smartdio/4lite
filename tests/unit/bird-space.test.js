import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createBirdProxyIndex,birdSegmentHitsBox,birdSegmentHitsTriangle,createBirdSpace} from '../../src/scenery/bird-space.js'
import {BIRD_CONFIG} from '../../src/scenery/bird-config.js'
import {createBirdRandom} from '../../src/scenery/campus-birds.js'
import {createBirdView} from '../../src/scenery/bird-view.js'
const p=(x,y,z)=>new THREE.Vector3(x,y,z)

test('swept volume catches a wall and a floor without confusing another storey',()=>{
 const box={minX:0,maxX:.1,minY:0,maxY:3,minZ:-2,maxZ:2}
 assert.ok(birdSegmentHitsBox(p(-1,1,0),p(1,1,0),box,.3,.1))
 assert.ok(!birdSegmentHitsBox(p(-1,4,0),p(1,4,0),box,.3,.1))
 assert.ok(birdSegmentHitsBox(p(-.2,1,-1),p(-.2,1,1),box,.3,.1))
 const index=createBirdProxyIndex([box]);assert.ok(!index.clear(p(-1,1,0),p(1,1,0)))
 assert.ok(index.clear(p(-1,4,0),p(1,4,0)))
})
test('a slanted branch AABB does not fill the empty space beside its triangle',()=>{
 const tri=new THREE.Triangle(p(0,0,0),p(4,4,0),p(4,4,.1))
 assert.ok(!birdSegmentHitsTriangle(p(.2,3,0),p(.3,3,0),tri,.1,.1))
 assert.ok(birdSegmentHitsTriangle(p(2,2,-1),p(2,2,1),tri,.1,.1))
 assert.ok(!birdSegmentHitsTriangle(p(2,2.3,0),p(3,3.3,0),tri,.2,.03))
})
function world(){return createBirdSpace({config:{...BIRD_CONFIG,groundZones:[{id:'front-courtyard',bounds:[-22,22,-22,22]}],airCircuit:[[-8,-8],[8,-8],[8,8],[-8,8]]},boundary:[[-25,-25],[25,-25],[25,25],[-25,25]],colliders:[],trees:[],groundHeightAt:()=>0,groundSurfaceAt:()=> 'compacted-dirt'})}
test('seeded, area based candidates remain bounded when every target is occupied',()=>{
 const space=world(),rng=createBirdRandom('exhaust')
 assert.equal(space.destination('pigeon',rng,[],null,()=>true),null)
 assert.equal(space.snapshot().maxCandidateChecks,16)
 const first=space.destination('pigeon',createBirdRandom('repeat'))
 const second=space.destination('pigeon',createBirdRandom('repeat'))
 assert.deepEqual(first.site.position,second.site.position)
 assert.ok(first.site.radius>=1.5&&first.site.radius<=3)
})
test('ground validation rejects slopes, sand and outside campus',()=>{
 const space=createBirdSpace({config:{...BIRD_CONFIG,groundZones:[],airCircuit:[[-8,-8],[8,-8],[8,8],[-8,8]]},boundary:[[-10,-10],[10,-10],[10,10],[-10,10]],colliders:[],groundHeightAt:x=>x>0?x*.5:0,groundSurfaceAt:(x,z)=>z>0?'activity-sand':'compacted-dirt'})
 assert.ok(!space.safeGround(p(1,.5,-2)))
 assert.ok(!space.safeGround(p(-2,0,2)))
 assert.ok(!space.safeGround(p(-20,0,-2)))
 assert.ok(space.safeGround(p(-2,0,-2)))
})

test('view preference puts resting birds outside the escape radius across seeds, with bounded fallback',()=>{
 const space=world(),view=createBirdView(),player=p(0,.9,0)
 view.set(p(0,1.6,0),p(0,0,-1),50,16/9)
 for(let i=0;i<40;i++){
  const result=space.destination('pigeon',createBirdRandom(`view-${i}`),[],player,()=>false,null,null,{view,requireVisible:true})
  assert.ok(result);assert.ok(result.site.position.z<0);assert.ok(result.site.position.distanceTo(player)>=10.5)
  assert.ok(space.visibleScore(result.site.position,'pigeon',view)>0)
 }
 assert.ok(space.snapshot().maxCandidateChecks<=16)
 assert.equal(space.destination('pigeon',createBirdRandom('occupied'),[],player,()=>true,null,null,{view,requireVisible:true}),null)
 view.set(p(0,1.6,0),p(0,1,0),50,16/9)
 assert.equal(space.destination('pigeon',createBirdRandom('sky'),[],player,()=>false,null,null,{view,requireVisible:true}),null)
 assert.ok(space.destination('pigeon',createBirdRandom('sky-fallback'),[],player,()=>false,null,null,{view}))
})
test('visibility uses the actual desktop or portrait frustum and rejects walls',()=>{
 const view=createBirdView();view.set(p(0,1.6,0),p(0,0,-1),50,16/9)
 assert.ok(view.score(p(3,0,-8),'pigeon')>0)
 assert.equal(view.score(p(0,0,8),'pigeon'),0)
 view.set(p(0,1.6,0),p(0,0,-1),50,390/844)
 assert.equal(view.score(p(3,0,-8),'pigeon'),0)
 const space=createBirdSpace({config:{...BIRD_CONFIG,groundZones:[],airCircuit:[[-8,-8],[8,-8],[8,8],[-8,8]]},boundary:[[-25,-25],[25,-25],[25,25],[-25,25]],
  colliders:[{name:'wall',minX:-10,maxX:10,minY:0,maxY:3,minZ:-4,maxZ:-3.8}],groundHeightAt:()=>0,groundSurfaceAt:()=> 'dirt'})
 assert.equal(space.visibleScore(p(0,0,-8),'pigeon',view),0)
 view.set(p(0,4,0),p(0,0,-1),70,16/9)
 assert.ok(space.visibleScore(p(0,4,-8),'pigeon',view)>0)
})
test('an airborne pigeon chooses outside the twelve metre buffer even in a mostly occupied region',()=>{
 const space=world(),player=p(0,.9,-12),from={position:p(0,0,17),zone:'air'}
 for(let n=0;n<20;n++){
  const result=space.destination('pigeon',createBirdRandom(`landing-${n}`),[],player,()=>false,from)
  assert.ok(result?.flight);assert.ok(result.site.position.distanceTo(player)>=12)
  assert.ok(space.available(result.site,'pigeon',player))
 }
 assert.ok(space.snapshot().maxCandidateChecks<=16)
})

test('sparrows share safe ground but retain a fair branch choice despite many more ground cells',()=>{
 const space=world(),rng=createBirdRandom('mixed-habitats')
 const onlyGround=space.destination('sparrow',rng)
 assert.equal(onlyGround.site.kind,'ground');assert.ok(space.safeGround(onlyGround.site.position))
 space.perches.push({kind:'perch',id:'test-branch',zone:'front-courtyard',position:p(5,2,-5),ground:0,portal:[p(5,2,-5),p(5,space.height,-5)]})
 const counts={ground:0,perch:0}
 for(let n=0;n<120;n++)counts[space.destination('sparrow',rng).site.kind]++
 assert.ok(counts.ground>35&&counts.ground<85,JSON.stringify(counts))
 const branch=space.destination('sparrow',rng,[],null,()=>false,null,null,{habitat:'perch'})
 const ground=space.destination('sparrow',rng,[],p(0,.9,0),()=>false,branch.site,null,{habitat:'ground'})
 assert.equal(ground.site.kind,'ground');assert.ok(ground.site.position.distanceTo(p(0,.9,0))>=12)
 assert.ok(space.clearFlight(ground.flight,'sparrow'))
 assert.equal(space.destination('sparrow',rng,[],null,()=>true,branch.site,null,{habitat:'ground'}),null)
 assert.ok(space.snapshot().maxCandidateChecks<=16)
})

test('a sparrow ground target is rechecked for changing terrain and active games',()=>{
 let active=false,slope=false
 const space=createBirdSpace({config:{...BIRD_CONFIG,groundZones:[],airCircuit:[[-8,-8],[8,-8],[8,8],[-8,8]]},boundary:[[-10,-10],[10,-10],[10,10],[-10,10]],colliders:[],groundHeightAt:x=>slope?x*.5:0,groundSurfaceAt:()=> 'dirt',activeArea:()=>active})
 const site={kind:'ground',position:p(0,0,0)}
 assert.ok(space.available(site,'sparrow',null))
 active=true;assert.ok(!space.available(site,'sparrow',null))
 active=false;slope=true;assert.ok(!space.available(site,'sparrow',null))
})

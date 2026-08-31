import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createSlingshotElasticRig} from '../../src/interactions/slingshot-elastic-rig.js'

test('programmatic slingshot bands share one pouch and stretch without replacing geometry',()=>{
  const parent=new THREE.Group(),events=[]
  const rig=createSlingshotElasticRig({parent,onEvent:event=>events.push(event)})
  const leftGeometry=rig.leftBand.geometry,rightGeometry=rig.rightBand.geometry,pouchGeometry=rig.pouch.geometry
  assert.equal(parent.children[0],rig.root)
  assert.equal(rig.leftBandGroup.children.length,9)
  assert.equal(rig.rightBandGroup.children.length,9)
  assert.equal(rig.bindings.length,8)
  assert.equal(rig.pouch.children.length,2)
  const pouchDepths=pouchGeometry.attributes.position.array.filter((_,index)=>index%3===2)
  assert.ok(Math.min(...pouchDepths)<-.004,'pouch should be cupped instead of a flat rectangle')
  rig.beginPull();rig.setPullRatio(.75)
  const pulled=rig.snapshot()
  assert.equal(pulled.phase,'pulling')
  assert.equal(pulled.pullDistance,.0975)
  assert.deepEqual(pulled.pouchCenter.map(value=>+value.toFixed(4)),[0,.07,.0814])
  assert.equal(pulled.visualPullDistance,.06338)
  assert.equal(rig.leftBand.geometry,leftGeometry)
  assert.equal(rig.rightBand.geometry,rightGeometry)
  assert.equal(rig.pouch.geometry,pouchGeometry)
  assert.ok(rig.leftBand.scale.y>0)
  assert.ok(rig.rightBand.scale.y>0)
  assert.ok(rig.snapshot().restBandSag>0)
  assert.ok(rig.snapshot().drawBandWidthScale<1)
  const release=rig.release()
  assert.ok(release.launchSpeed>6.5&&release.launchSpeed<20)
  let furthestForward=0,maxForkDip=0,maxForkPitch=0,peakDipAt=Infinity,maxPouchHeight=-Infinity,maxForwardHold=0
  for(let index=0;index<80;index++){
    rig.update(1/120);const state=rig.snapshot()
    furthestForward=Math.min(furthestForward,state.pullDistance)
    maxPouchHeight=Math.max(maxPouchHeight,state.pouchCenter[1])
    maxForwardHold=Math.max(maxForwardHold,state.forwardHoldRemaining)
    if(state.forkDip>maxForkDip){maxForkDip=state.forkDip;peakDipAt=state.releaseElapsed}
    maxForkPitch=Math.max(maxForkPitch,state.forkPitch)
  }
  assert.ok(furthestForward<-.04,'pouch should visibly continue forward beyond its hanging rest position')
  assert.ok(maxPouchHeight>.118,'pouch should pass forward through the center height between the fork tips')
  assert.ok(maxForwardHold>=.06,'pouch and bands should pause briefly together at maximum forward travel')
  assert.ok(maxForkDip>.02&&maxForkPitch>THREE.MathUtils.degToRad(6),'fork should dip and pitch forward after release')
  assert.ok(peakDipAt<=.075,'forward dip should reach its peak almost immediately')
  for(let index=0;index<240&&rig.snapshot().phase!=='rest';index++)rig.update(1/120)
  assert.equal(rig.snapshot().phase,'rest')
  assert.equal(rig.snapshot().pullDistance,0)
  assert.equal(rig.snapshot().pouchCenter[1],.07)
  assert.deepEqual(events.map(event=>event.type),['slingshot-pull-start','slingshot-release','slingshot-forward-snap','slingshot-forward-hold','slingshot-return-rest'])
  rig.dispose();assert.equal(parent.children.length,0)
})

test('timed charge stays steady for 0.7 seconds at maximum then develops visible deterministic tremor',()=>{
  const events=[],rig=createSlingshotElasticRig({parent:new THREE.Group(),onEvent:event=>events.push(event)})
  rig.beginCharge()
  for(let index=0;index<12;index++)rig.update(.1)
  let state=rig.snapshot()
  assert.equal(state.phase,'charging');assert.equal(state.pullRatio,1);assert.equal(state.tremorIntensity,0)
  assert.notEqual(state.aimOffset.yaw,0);assert.notEqual(state.aimOffset.pitch,0)
  for(let index=0;index<7;index++)rig.update(.1)
  state=rig.snapshot()
  assert.equal(state.maxHoldElapsed,.7);assert.equal(state.tremorIntensity,0)
  rig.update(.3);state=rig.snapshot()
  assert.ok(state.tremorIntensity>0);assert.notEqual(state.aimOffset.yaw,0);assert.notEqual(state.aimOffset.pitch,0)
  const release=rig.release()
  assert.equal(release.pullRatio,1);assert.ok(release.tremorIntensity>0)
  assert.deepEqual(events.map(event=>event.type),['slingshot-charge-start','slingshot-tremor-start','slingshot-release'])
  rig.dispose()
})

test('charging introduces a slow mild irregular aim sway before overhold tremor',()=>{
  const rig=createSlingshotElasticRig({parent:new THREE.Group()})
  rig.beginCharge();rig.update(.25);const first=rig.snapshot();rig.update(.25);const second=rig.snapshot()
  assert.equal(first.tremorIntensity,0);assert.equal(second.tremorIntensity,0)
  assert.notDeepEqual(first.aimOffset,second.aimOffset)
  assert.ok(Math.abs(second.aimOffset.yaw)<THREE.MathUtils.degToRad(.33))
  assert.ok(Math.abs(second.aimOffset.pitch)<THREE.MathUtils.degToRad(.33))
  rig.dispose()
})

test('pull distance is clamped and reset is deterministic',()=>{
  const rig=createSlingshotElasticRig({parent:new THREE.Group(),config:{maxPull:.2}})
  rig.beginPull();assert.equal(rig.setPullDistance(9),.2)
  assert.equal(rig.snapshot().pullRatio,1)
  rig.reset();assert.equal(rig.snapshot().phase,'rest');assert.equal(rig.snapshot().pullDistance,0)
  rig.dispose()
})

test('drawn pouch rises from its relaxed hang to the fork-crotch height',()=>{
  const rig=createSlingshotElasticRig({parent:new THREE.Group(),config:{restPouchCenter:[0,.082,.02],drawPouchY:.12,maxPull:.13}})
  rig.beginCharge()
  assert.equal(rig.snapshot().pouchCenter[1],.12)
  assert.equal(rig.snapshot().activeBandSag,0)
  rig.setPullRatio(1)
  assert.equal(rig.snapshot().pouchCenter[1],.12)
  const release=rig.release();assert.ok(release)
  rig.update(1/120)
  assert.ok(rig.snapshot().pouchCenter[1]>=.12,'release should continue from the raised draw height without dropping')
  rig.dispose()
})

test('bands straighten immediately, then the pouch only advances in perspective during charge',()=>{
  const rig=createSlingshotElasticRig({parent:new THREE.Group(),config:{restPouchCenter:[0,.08,.02],drawPouchY:.12,maxPull:.13,visualPullScale:.62}})
  const resting=rig.snapshot();assert.ok(resting.activeBandSag>0)
  rig.beginCharge();const started=rig.snapshot()
  assert.equal(started.activeBandSag,0);assert.equal(started.pouchCenter[2],.02);assert.equal(started.pouchCenter[1],.12)
  rig.update(.6);const charging=rig.snapshot()
  assert.equal(charging.activeBandSag,0);assert.equal(charging.pouchCenter[1],.12);assert.ok(charging.pouchCenter[2]>.02)
  rig.dispose()
})

test('perspective compensation keeps a backward draw from sinking on screen',()=>{
  const rig=createSlingshotElasticRig({parent:new THREE.Group(),config:{
    restPouchCenter:[0,.082,.02],drawPouchY:.12,maxPull:.13,visualPullScale:.62,
    perspectiveOriginY:.205,perspectiveOriginZ:.43,
  }})
  rig.beginCharge();rig.setPullRatio(1)
  const state=rig.snapshot()
  assert.ok(state.pouchCenter[1]>.135,'closer pouch should rise locally to preserve its projected height')
  const referenceRatio=(.12-.205)/(.02-.43)
  const drawnRatio=(state.pouchCenter[1]-.205)/(state.pouchCenter[2]-.43)
  assert.ok(Math.abs(referenceRatio-drawnRatio)<1e-4)
  rig.dispose()
})

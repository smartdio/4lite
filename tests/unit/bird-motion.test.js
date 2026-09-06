import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createBirdFlight,createBirdSceneClock} from '../../src/scenery/bird-motion.js'

test('bird clock freezes across pause, hidden tab, resume and backward timestamps',()=>{
  const clock=createBirdSceneClock()
  clock.tick(1000);clock.tick(1016);assert.equal(clock.time,.016)
  clock.tick(1020,true);clock.tick(120000,true);clock.tick(140000)
  assert.equal(clock.time,.016)
  clock.tick(140016);assert.equal(clock.time,.032)
  clock.tick(140010);assert.equal(clock.time,.032)
  clock.seek(3);clock.tick(150000);assert.equal(clock.time,3)
})

test('flight follows exact endpoints with continuous finite positions and bank angles',()=>{
  const points=[[-1,0,0],[-.7,.8,.2],[0,1.3,.8],[1,.4,.1],[1.2,0,0]]
  const flight=createBirdFlight(points),p=new THREE.Vector3(),r=new THREE.Euler(),previous=new THREE.Vector3(...points[0])
  assert.ok(flight.duration>=3)
  flight.sample(0,p,r);assert.ok(p.distanceTo(new THREE.Vector3(...points[0]))<1e-8)
  for(let i=1;i<=1000;i++){
    flight.sample(flight.duration*i/1000,p,r)
    assert.ok([...p.toArray(),r.x,r.y,r.z].every(Number.isFinite))
    assert.ok(p.distanceTo(previous)<.02,'no jumps along the flight')
    assert.ok(Math.abs(r.z)<=.32)
    previous.copy(p)
  }
  assert.ok(p.distanceTo(new THREE.Vector3(...points.at(-1)))<1e-8)
})

test('flight sampling is deterministic and eases speed at both ends',()=>{
  const flight=createBirdFlight([[0,0,0],[1,.6,.2],[2,0,0]])
  const p=new THREE.Vector3(),r=new THREE.Euler(),middle=new THREE.Vector3()
  flight.sample(flight.duration*.4,p,r);const expected=p.toArray()
  flight.sample(flight.duration*.8,p,r);flight.sample(flight.duration*.4,p,r)
  assert.deepEqual(p.toArray(),expected)
  flight.sample(flight.duration*.5,middle,r);flight.sample(flight.duration*.51,p,r)
  const fast=p.distanceTo(middle)
  flight.sample(0,middle,r);flight.sample(flight.duration*.01,p,r)
  assert.ok(p.distanceTo(middle)<fast/10)
})

test('invalid paths fail before any animation starts',()=>{
  assert.throws(()=>createBirdFlight([[0,0,0]]))
  assert.throws(()=>createBirdFlight([[0,0,0],[NaN,0,0]]))
  assert.throws(()=>createBirdFlight([[0,0,0],[0,0,0]]))
  assert.throws(()=>createBirdFlight([[0,0,0],[1,1,1]],{speed:0}))
})
test('pigeon leg impulse produces immediate travel, smooth cruise and a stopped landing',()=>{
  const flight=createBirdFlight([[0,0,0],[.55,.5,0],[3,2.4,0],[6,5,0],[12,0,0]],{speed:5.5,minimumDuration:3,rampSeconds:.65,initialSpeed:2.2})
  const distance=t=>flight.parameterAt(t)*flight.length
  assert.ok(distance(.05)>.105,'the feet must push the bird off immediately')
  const speed=t=>(distance(t+.0001)-distance(t-.0001))/.0002
  assert.ok(Math.abs(speed(.6499)-speed(.6501))<.01)
  assert.ok(distance(flight.duration)-distance(flight.duration-.01)<.0001)
  assert.equal(distance(flight.duration),flight.length)
})

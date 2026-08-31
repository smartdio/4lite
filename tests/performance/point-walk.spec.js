import {expect,test} from '@playwright/test'
import * as THREE from 'three'
import {createPlayerNavigation} from '../../src/navigation/player-navigation.js'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('navigation tolerance snaps blocked targets to nearby walkable space without crossing walls',()=>{
  const player={eyeHeight:1.48,radius:.2,maxStep:.35}
  const navigation=createPlayerNavigation({player,baseHeightAt:()=>0})
  navigation.addAabb('narrow-obstacle',[0,1,-3],[.65,2,.65])
  const origin=new THREE.Vector3(0,player.eyeHeight,0),rawPoint=new THREE.Vector3(0,0,-3)
  const ray=new THREE.Ray(origin,rawPoint.clone().sub(origin).normalize())
  const snapped=navigation.resolveRayTarget(ray,{maxHorizontalDistance:20})
  expect(snapped).toMatchObject({snapped:true,surface:'terrain'})
  expect(snapped.rawPoint.toArray()).toEqual(rawPoint.toArray())
  expect(snapped.snapDistance).toBeGreaterThan(0)
  expect(snapped.snapDistance).toBeLessThanOrEqual(.8)
  expect(navigation.targetClear(snapped.point.x,snapped.point.z,snapped.point.y)).toBe(true)
  expect(snapped.trace.reachable).toBe(true)

  const walled=createPlayerNavigation({player,baseHeightAt:()=>0})
  walled.addSegment('solid-wall',[-5,-2],[5,-2],0,2,.14)
  expect(walled.resolveRayTarget(ray,{maxHorizontalDistance:20})).toBeNull()
})

test('navigation hot queries inspect only the one-metre spatial neighbourhood',()=>{
  const player={eyeHeight:1.48,radius:.2,maxStep:.35}
  const navigation=createPlayerNavigation({player,baseHeightAt:()=>0})
  for(let index=0;index<300;index++) {
    const x=20+index%30*2,z=20+Math.floor(index/30)*2
    navigation.addAabb(`far-${index}`,[x,1,z],[.6,2,.6])
    navigation.addWalkRect(`far-walk-${index}`,[x,z],[1,1],.2)
  }
  navigation.addAabb('nearby',[.7,1,0],[.2,2,.2])
  navigation.addWalkRect('nearby-walk',[0,0],[1,1],.1)
  navigation.resetCandidateStats()
  navigation.blocked(0,0,player.eyeHeight)
  navigation.groundHeightAt(0,0,0)
  const stats=navigation.candidateStats()
  expect(navigation.spatialPolicy).toMatchObject({cellSize:2,queryRadius:1})
  expect(stats.blocked.lastCandidates).toBeLessThanOrEqual(1)
  expect(stats.ground.lastCandidates).toBeLessThanOrEqual(1)
})

test('navigation tolerance pulls a doorway-jamb target into the clear opening',()=>{
  const player={eyeHeight:1.48,radius:.2,maxStep:.35}
  const navigation=createPlayerNavigation({player,baseHeightAt:()=>0})
  navigation.addSegment('door-wall-left',[-2,-2],[-.45,-2],0,2,.12)
  navigation.addSegment('door-wall-right',[.45,-2],[2,-2],0,2,.12)
  const origin=new THREE.Vector3(0,player.eyeHeight,0),rawPoint=new THREE.Vector3(.5,0,-2.6)
  const result=navigation.resolveRayTarget(new THREE.Ray(origin,rawPoint.clone().sub(origin).normalize()),{maxHorizontalDistance:20})
  expect(result).toMatchObject({snapped:true,surface:'terrain'})
  expect(result.snapDistance).toBeLessThanOrEqual(.8)
  expect(Math.abs(result.point.x)).toBeLessThan(.45-player.radius)
  expect(result.trace.reachable).toBe(true)
})

test('manual movement and point walking are available together',async({page})=>{
  await ready(page)
  const initial=await page.evaluate(()=>({hud:window.__CAMPUS_TEST__.hud(),locomotion:window.__CAMPUS_TEST__.locomotion()}))
  expect(initial.hud.locomotion).toBeUndefined()
  expect(initial.hud.pointWalking).toBe(false)
  expect(initial.locomotion.pointWalk).toMatchObject({enabled:true,state:'idle',limits:{minDistance:.45,maxDistance:20,pitchDegrees:4,arrivalRadius:.25,probeHz:20}})

  const target=await page.evaluate(()=>{
    window.__CAMPUS_TEST__.teleport(-7,-34,-7,-38,0,0)
    return window.__CAMPUS_TEST__.probePointTarget().pointWalk
  })
  expect(target.candidate).toEqual([-7,0,-38])
  expect(target.candidateSurface).toBe('terrain')
  expect(target.markerVisible).toBe(true)
  expect(Math.abs(target.candidate[2]-target.markerPosition[2])).toBeCloseTo(1.15,1)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pointTargetVisible)).toBe(true)

  await page.keyboard.down('a')
  await page.waitForTimeout(80)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.markerVisible)).toBe(false)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().pointTargetVisible)).toBe(false)
  await page.keyboard.up('a')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().keyboardMovementActive)).toBe(false)
  const recovery=await page.evaluate(()=>window.__CAMPUS_TEST__.probePointTarget().pointWalk)
  expect(recovery.markerVisible).toBe(true)

  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.confirmPointWalk())).toBe(true)
  const moved=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePointWalk(1,60))
  expect(moved.player.z).toBeLessThan(-34.5)
  expect(moved.locomotion.pointWalk.moving).toBe(true)

  await page.keyboard.down('w')
  await page.keyboard.up('w')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.moving)).toBe(false)
})

test('flat-ground targeting reaches beyond fifteen metres and stops at twenty metres',async({page})=>{
  await ready(page)
  const within=await page.evaluate(()=>{
    const origin=[-7,-34],angle=-Math.PI/8,radius=18
    window.__CAMPUS_TEST__.teleport(origin[0],origin[1],origin[0]+Math.cos(angle)*radius,origin[1]+Math.sin(angle)*radius,0,0)
    return window.__CAMPUS_TEST__.probePointTarget().pointWalk
  })
  expect(within.candidate).not.toBeNull()
  const candidate=within.candidate
  expect(Math.hypot(candidate[0]+7,candidate[2]+34)).toBeGreaterThan(15)
  expect(Math.hypot(candidate[0]+7,candidate[2]+34)).toBeCloseTo(18,1)
  await page.waitForTimeout(60)
  const beyond=await page.evaluate(()=>{
    const origin=[-7,-34],angle=-Math.PI/8,radius=20.5
    window.__CAMPUS_TEST__.teleport(origin[0],origin[1],origin[0]+Math.cos(angle)*radius,origin[1]+Math.sin(angle)*radius,0,0)
    return window.__CAMPUS_TEST__.probePointTarget().pointWalk
  })
  expect(beyond.candidate).toBeNull()
})

test('held basketball gives a visible ground target priority over charging a shot',async({page})=>{
  await ready(page)
  const ball=await page.evaluate(()=>{
    const game=window.__CAMPUS_TEST__.basketballGame(),id=game.items[0].id
    window.__CAMPUS_TEST__.pickupBasketball(id)
    window.__CAMPUS_TEST__.teleport(-7,-34,-7,-38,0,0)
    const target=window.__CAMPUS_TEST__.probePointTarget().pointWalk
    return {id,target}
  })
  expect(ball.target.candidate).toEqual([-7,0,-38])
  await page.mouse.move(640,360)
  await page.mouse.down()
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame().ui.charging)).toBe(false)
  await page.mouse.up()
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.moving)).toBe(true)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())).toMatchObject({held:ball.id,attempts:0})
})

test('point target intersects and climbs the existing stair navigation surfaces',async({page})=>{
  await ready(page)
  const result=await page.evaluate(()=>{
    window.__CAMPUS_TEST__.teleport(-18.6,-13.46,-21.5,-13.46,.4,1)
    const before=window.__CAMPUS_TEST__.player()
    const target=window.__CAMPUS_TEST__.probePointTarget().pointWalk
    const confirmed=window.__CAMPUS_TEST__.confirmPointWalk()
    const advanced=confirmed?window.__CAMPUS_TEST__.advancePointWalk(2.2,132):null
    return {before,target,confirmed,advanced}
  })
  expect(result.target.candidateSurface).toContain('b1-west-stair-lower')
  expect(result.target.candidate[1]).toBeGreaterThan(.4)
  expect(result.confirmed).toBe(true)
  expect(result.advanced.player.ground).toBeGreaterThan(.75)
  expect(result.advanced.player.x).toBeLessThan(result.before.x-1.5)
})

test.describe('touch point walking',()=>{
  test.use({viewport:{width:375,height:667},deviceScaleFactor:2,isMobile:true,hasTouch:true})

  test('confirms on pointerup, keeps drag for looking, and uses a tap to stop',async({page})=>{
    await ready(page)
    await page.evaluate(()=>{
      window.__CAMPUS_TEST__.teleport(-7,-34,-7,-38,0,0)
      window.__CAMPUS_TEST__.probePointTarget()
    })
    const client=await page.context().newCDPSession(page)
    const touch=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points})
    const point={x:188,y:330,id:41,radiusX:8,radiusY:8,force:1}

    await touch('touchStart',[point])
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.moving)).toBe(false)
    await touch('touchEnd',[])
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.moving)).toBe(true)

    const rotationBefore=await page.evaluate(()=>window.__CAMPUS_TEST__.controls().rotation)
    await touch('touchStart',[{...point,id:42}])
    await touch('touchMove',[{...point,id:42,x:point.x+36,y:point.y-24}])
    await touch('touchEnd',[])
    const afterDrag=await page.evaluate(()=>({rotation:window.__CAMPUS_TEST__.controls().rotation,moving:window.__CAMPUS_TEST__.locomotion().pointWalk.moving}))
    expect(afterDrag.rotation).not.toEqual(rotationBefore)
    expect(afterDrag.moving).toBe(true)

    await touch('touchStart',[{...point,id:43}])
    await touch('touchEnd',[])
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.moving)).toBe(false)
  })
})

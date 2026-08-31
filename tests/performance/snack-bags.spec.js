import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('three shared snack-bag instances lie flat near the openings of separate B2 desk cubbies',async({page},testInfo)=>{
  await boot(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.snackBags())
  await testInfo.attach('snack-bags',{body:Buffer.from(JSON.stringify(state,null,2)),contentType:'application/json'})

  expect(state).toMatchObject({
    status:'loaded',instances:3,classrooms:3,orientation:'flat-front-up',
    modelSize:{width:.1595,depth:.1496,thickness:.0698},
    sharedResources:{
      requests:1,geometries:5,materials:4,textures:2,textureSize:[512,491],
      meshObjects:5,drawCallsPerVisibleRoom:5,
    },
    cubby:{floorOffset:.418,frontEdge:.16,frontInset:.008},
    boundsAudit:{violations:[]},
  })
  expect(state.sharedResources.decodedBytesWithMipmaps).toBeLessThanOrEqual(2.7*1024*1024)
  expect(new Set(state.assignments.map(item=>item.classroom))).toEqual(new Set([
    'b2-room-2-floor-1','b2-room-3-floor-2','b2-room-4-floor-3',
  ]))
  expect(new Set(state.assignments.map(item=>item.anchor)).size).toBe(3)
  for(const assignment of state.assignments) {
    expect(assignment.orientation).toBe('flat-front-up')
    expect(assignment.frontClearance).toBeCloseTo(.008,5)
    // Upright model height becomes the cubby-plane depth; package thickness becomes world Y.
    expect(assignment.worldSize[1]).toBeGreaterThan(.068)
    expect(assignment.worldSize[1]).toBeLessThan(.072)
    expect(Math.max(assignment.worldSize[0],assignment.worldSize[2])).toBeLessThan(.18)
  }
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name))
  expect(resources.filter(url=>url.includes('bubuxing-seafood-snack-bag-game-v02.glb'))).toHaveLength(1)

  for(const assignment of state.assignments) {
    const focused=await page.evaluate(id=>window.__CAMPUS_TEST__.focusSnackBag(id),assignment.id)
    expect(focused.assignment).toMatchObject({id:assignment.id,classroom:assignment.classroom,orientation:'flat-front-up'})
  }

  const first=state.assignments[0]
  await page.evaluate(id=>window.__CAMPUS_TEST__.focusSnackBag(id),first.id)
  const hit=await page.evaluate(()=>window.__CAMPUS_TEST__.hitSnackBag())
  expect(hit).toMatchObject({item:{id:first.id,classroom:first.classroom},diagnostics:{result:'hit'}})
  const opened=await page.evaluate(id=>window.__CAMPUS_TEST__.openSnackModelViewer(id),first.id)
  expect(opened).toMatchObject({
    active:first.id,classroom:first.classroom,sharedModel:true,extraModelRequests:0,
  })
  expect(opened.closeBounds).not.toBeNull()
  expect(opened.displayScale).toBeGreaterThan(8)
  const initialRotation=opened.rotationY
  await page.waitForTimeout(180)
  const rotating=await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())
  expect(rotating.rotationY).toBeGreaterThan(initialRotation)
  expect(resources.filter(url=>url.includes('bubuxing-seafood-snack-bag-game-v02.glb'))).toHaveLength(1)

  await page.mouse.click(640,360)
  const flipped=await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())
  expect(flipped).toMatchObject({active:first.id,action:'flip',sharedModel:true})
  expect(Math.abs(flipped.rotationY-rotating.rotationY)).toBeGreaterThan(2.5)

  await page.mouse.click(12,12)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())).toMatchObject({active:first.id,sharedModel:true})
  const closeBounds=await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer().closeBounds)
  await page.mouse.click((closeBounds.left+closeBounds.right)/2,(closeBounds.top+closeBounds.bottom)/2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())).toMatchObject({active:null,sharedModel:false})
})

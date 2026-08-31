import {expect,test} from '@playwright/test'
import path from 'node:path'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('each classroom gets two distinct seeded period-print tin pencil boxes while instances share one box GLB and one stationery GLB',async({page},testInfo)=>{
  await boot(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.pencilBoxes())
  await testInfo.attach('pencil-boxes',{body:Buffer.from(JSON.stringify(state,null,2)),contentType:'application/json'})

  expect(state).toMatchObject({
    status:'loaded',seed:'period-pencil-boxes-v2',variants:4,instancesPerClassroom:2,openAngleDegrees:110,
    workingModelSize:{width:.210,depth:.075,height:.022},
    sharedResources:{
      glbRequests:2,pencilBoxGlbRequests:1,stationeryGlbRequests:1,textureRequests:3,requests:5,
      coverOrientation:'image-top-toward-rear-hinge',externalCoverFlipY:false,
    },
    boundsAudit:{violations:[]},
  })
  expect(state.instances).toBe(state.classrooms*2)
  expect(state.contents.combinations).toBe(6)
  expect(state.contents.assignments).toHaveLength(state.instances)
  expect(state.contents.assignments.every(item=>item.items.length>=2&&item.items.length<=4)).toBe(true)
  expect(state.classrooms).toBeGreaterThan(4)
  expect(state.sharedResources.geometries).toBeGreaterThanOrEqual(5)
  expect(state.sharedResources.materials).toBeGreaterThanOrEqual(4)
  expect(state.sharedResources.pencilBoxDecodedBytesWithMipmaps).toBeLessThanOrEqual(12*1024*1024)
  expect(state.sharedResources.stationeryDecodedBytesWithMipmaps).toBeLessThanOrEqual(6*1024*1024)
  expect(state.sharedResources.decodedBytesWithMipmaps).toBeLessThanOrEqual(18*1024*1024)
  // The user-approved continuous Boolean shell, thin rolled rims and two
  // rounded hinges total 4,862 triangles; keep a tight guard without shaving
  // the approved corner/rim silhouette merely to hit the earlier work value.
  expect(state.sharedResources.triangles).toBeLessThanOrEqual(5000)
  expect(new Set(state.assignments.map(item=>item.anchor)).size).toBe(state.instances)
  expect(new Set(state.assignments.map(item=>item.classroom)).size).toBe(state.classrooms)
  for(const classroom of new Set(state.assignments.map(item=>item.classroom))) {
    const roomAssignments=state.assignments.filter(item=>item.classroom===classroom)
    expect(roomAssignments).toHaveLength(2)
    expect(new Set(roomAssignments.map(item=>item.variant)).size).toBe(2)
    expect(new Set(roomAssignments.map(item=>item.anchor)).size).toBe(2)
    expect(new Set(roomAssignments.map(item=>item.combinationIndex)).size).toBe(2)
  }
  expect(new Set(state.assignments.map(item=>item.variant))).toEqual(new Set(['flower-angel','sun-wukong','black-cat-sheriff','ikkyu']))
  expect(state.assignments.some(item=>item.state==='closed')).toBe(true)
  expect(state.assignments.some(item=>item.state==='open')).toBe(true)
  expect(state.assignments.filter(item=>item.state==='closed').every(item=>item.lidAngleDegrees===0)).toBe(true)
  expect(state.assignments.filter(item=>item.state==='open').every(item=>item.lidAngleDegrees===110)).toBe(true)
  for(const assignment of state.assignments) {
    expect(assignment.worldBounds.min[1]).toBeGreaterThanOrEqual(assignment.tableY-.0005)
  }

  const occupied=await page.evaluate(()=>({
    books:window.__CAMPUS_TEST__.schoolBooks().assignments.map(item=>item.id.replace(/-book-\d+$/,'')),
    pages:window.__CAMPUS_TEST__.compositionPages().assignments.filter(item=>item.surface==='student').map(item=>item.anchor),
    comics:window.__CAMPUS_TEST__.comicBooks().assignments.map(item=>item.anchor),
    snacks:window.__CAMPUS_TEST__.snackBags().assignments.map(item=>item.anchor),
  }))
  const otherOccupied=new Set(Object.values(occupied).flat())
  expect(state.assignments.every(item=>!otherOccupied.has(item.anchor))).toBe(true)

  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name))
  expect(resources.filter(url=>url.includes('flower-angel-pencil-box-game-v01.glb'))).toHaveLength(1)
  expect(resources.filter(url=>url.includes('student-stationery-library-v01.glb'))).toHaveLength(1)

  for(const assignment of state.assignments) {
    const focused=await page.evaluate(id=>window.__CAMPUS_TEST__.focusPencilBox(id),assignment.id)
    expect(focused.assignment).toMatchObject({id:assignment.id,classroom:assignment.classroom,state:assignment.state})
    await page.waitForTimeout(100)
    await page.screenshot({
      path:path.resolve(`docs/reports/pencil-box/${assignment.variant}-pencil-box-classroom-${assignment.state}-v01.png`),
    })
    const hit=await page.evaluate(()=>window.__CAMPUS_TEST__.hitPencilBox())
    expect(hit).toMatchObject({
      item:{id:assignment.id,classroom:assignment.classroom,state:assignment.state},
      diagnostics:{result:'hit',recursiveSceneScan:false},
    })
    expect(hit.diagnostics.candidateProxyCount).toBeLessThanOrEqual(6)
  }

  const openSample=state.assignments.find(item=>item.state==='open')
  const opened=await page.evaluate(id=>window.__CAMPUS_TEST__.openPencilBoxModelViewer(id),openSample.id)
  expect(opened).toMatchObject({
    active:openSample.id,kind:'pencil-box',title:openSample.label,
    classroom:openSample.classroom,sharedModel:true,extraModelRequests:0,
  })
  await page.waitForTimeout(100)
  await page.screenshot({path:path.resolve(`docs/reports/pencil-box/${openSample.variant}-pencil-box-viewer-v01.png`)})
  const initialRotation=opened.rotationY
  await page.waitForTimeout(180)
  const rotating=await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())
  expect(rotating.rotationY).toBeGreaterThan(initialRotation)
  expect(rotating).toMatchObject({action:'toggle-lid',lidAngleDegrees:110,zoom:1})

  await page.mouse.move(600,340)
  await page.mouse.down()
  await page.mouse.move(720,390,{steps:4})
  await page.mouse.up()
  const dragged=await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())
  expect(dragged.active).toBe(openSample.id)
  expect(Math.abs(dragged.rotationY-rotating.rotationY)).toBeGreaterThan(.5)

  await page.mouse.wheel(0,-220)
  const zoomed=await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())
  expect(zoomed.zoom).toBeGreaterThan(1)

  await page.mouse.click(640,360)
  await page.waitForTimeout(450)
  const toggled=await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())
  expect(toggled).toMatchObject({active:openSample.id,action:'toggle-lid'})
  expect(toggled.lidAngleDegrees).toBeLessThan(2)
  const resourcesAfterViewer=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name))
  expect(resourcesAfterViewer.filter(url=>url.includes('flower-angel-pencil-box-game-v01.glb'))).toHaveLength(1)
  expect(resourcesAfterViewer.filter(url=>url.includes('student-stationery-library-v01.glb'))).toHaveLength(1)

  await page.keyboard.press('Escape')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())).toMatchObject({active:openSample.id,sharedModel:true})
  await page.keyboard.press('KeyX')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.snackModelViewer())).toMatchObject({active:null,sharedModel:false})
})

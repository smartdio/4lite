import {expect,test} from '@playwright/test'

test('teaching blackboard enters a front-facing chalk drawing mode',async({page})=>{
  const consoleErrors=[]
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())

  const initial=await page.evaluate(()=>window.__CAMPUS_TEST__.blackboardDrawing())
  expect(initial).toMatchObject({
    policy:{maxDistance:2.5,requiresClearLineOfSight:true},targets:22,blockedTargets:2,active:null,
    textureSize:[1050,360],drawings:[],persistence:{
      storage:'localStorage',storageKey:'4lite:user-data:v1',rootSchemaVersion:1,
      namespace:'blackboardDrawings',namespaceVersion:1,status:'empty',bytes:0,restoredBoards:0,error:null,
    },
  })
  for(const id of initial.ids) {
    const orientationHit=await page.evaluate(boardId=>window.__CAMPUS_TEST__.focusTeachingBlackboard(boardId),id)
    expect(orientationHit.hit).toMatchObject({id})
    expect(orientationHit.hit.distance).toBeLessThanOrEqual(2.5)
  }
  const focused=await page.evaluate(()=>window.__CAMPUS_TEST__.focusTeachingBlackboard())
  expect(focused.hit).toMatchObject({id:focused.id})
  expect(focused.hit.distance).toBeLessThanOrEqual(2.5)

  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  await page.locator('canvas').first().click({position:{x:640,y:360}})
  await expect(page.locator('.blackboard-drawing-ui')).toHaveAttribute('aria-hidden','false')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'blackboard',blackboard:focused.id})
  const drawingCanvas=page.locator('.blackboard-drawing-canvas')
  await expect(drawingCanvas).toBeVisible()
  const bounds=await drawingCanvas.boundingBox()
  await page.mouse.move(bounds.x+bounds.width*.25,bounds.y+bounds.height*.45)
  await page.mouse.down()
  await page.mouse.move(bounds.x+bounds.width*.72,bounds.y+bounds.height*.58,{steps:16})
  await page.mouse.up()
  const drawn=await page.evaluate(()=>window.__CAMPUS_TEST__.blackboardDrawing())
  expect(drawn.active).toBe(focused.id)
  expect(drawn.drawings).toEqual([{id:focused.id,strokes:1,visible:true}])
  expect(drawn.persistence).toMatchObject({status:'saved',persistedNamespaces:['blackboardDrawings'],restoredBoards:0,error:null})
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('4lite:user-data:v1')))
  expect(stored.schemaVersion).toBe(1)
  expect(stored.namespaces.blackboardDrawings.version).toBe(1)
  expect(stored.namespaces.blackboardDrawings.data.boards[focused.id]).toHaveLength(1)
  expect(stored.namespaces.blackboardDrawings.data.boards[focused.id][0].points.length).toBeGreaterThan(2)

  await page.locator('[data-action="done"]').click()
  await expect(page.locator('.blackboard-drawing-ui')).toHaveAttribute('aria-hidden','true')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(before)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.blackboardDrawing())).toMatchObject({active:null,drawings:[{id:focused.id,strokes:1,visible:true}]})

  await page.reload({waitUntil:'networkidle'})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__)
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  const restored=await page.evaluate(()=>window.__CAMPUS_TEST__.blackboardDrawing())
  expect(restored).toMatchObject({
    active:null,persistence:{status:'loaded',persistedNamespaces:['blackboardDrawings'],restoredBoards:1,error:null},
    drawings:[{id:focused.id,strokes:1,visible:true}],
  })

  await page.evaluate(id=>window.__CAMPUS_TEST__.focusTeachingBlackboard(id),focused.id)
  await page.locator('canvas').first().click({position:{x:640,y:360}})
  await page.locator('[data-action="clear"]').click()
  await page.locator('[data-action="done"]').click()
  expect(await page.evaluate(()=>({saved:localStorage.getItem('4lite:user-data:v1'),state:window.__CAMPUS_TEST__.blackboardDrawing()}))).toMatchObject({
    saved:null,state:{persistence:{status:'empty',bytes:0},drawings:[{id:focused.id,strokes:0,visible:false}]},
  })

  await page.evaluate(id=>localStorage.setItem('4lite:blackboard-drawings:v1',JSON.stringify({
    version:1,boards:{[id]:[{tool:'chalk',color:'yellow',points:[[.2,.3],[.5,.5],[.8,.4]]}]},
  })),focused.id)
  await page.reload({waitUntil:'networkidle'})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__)
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  expect(await page.evaluate(()=>({
    state:window.__CAMPUS_TEST__.blackboardDrawing(),legacy:localStorage.getItem('4lite:blackboard-drawings:v1'),
  }))).toMatchObject({
    legacy:null,
    state:{persistence:{status:'saved',migratedLegacy:true,restoredBoards:1},drawings:[{id:focused.id,strokes:1,visible:true}]},
  })
  expect(consoleErrors).toEqual([])
})

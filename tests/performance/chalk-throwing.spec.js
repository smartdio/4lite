import {expect,test} from '@playwright/test'

test('chalk stays in its classroom, remains reusable after landing, and resets on reload',async({page})=>{
  const consoleErrors=[]
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})

  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())

  const initial=await page.evaluate(()=>window.__CAMPUS_TEST__.chalkThrowing())
  expect(initial).toMatchObject({
    policy:{maxDistance:2.5,requiresClearLineOfSight:true,roomLocked:true},pickable:'teacher-desk-and-settled-chalk',
    sourcePickables:0,settledPickables:0,pickables:0,held:null,throws:0,collisions:0,persistence:'until-classroom-exit',currentRoom:null,
    collisionEngine:'classroom-analytic-aabb',projectiles:[],
  })
  const boxChalkId=await page.evaluate(()=>window.__CAMPUS_TEST__.schoolChalk().assignments.find(item=>item.location==='box').id)
  expect(await page.evaluate(id=>window.__CAMPUS_TEST__.focusPickableChalk(id),boxChalkId)).toBeNull()

  const focused=await page.evaluate(()=>window.__CAMPUS_TEST__.focusPickableChalk())
  expect(focused.hit).toMatchObject({id:focused.id})
  expect(focused.hit.distance).toBeLessThanOrEqual(2.5)

  const canvas=page.locator('canvas').first()
  const bounds=await canvas.boundingBox()
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
  await expect(page.locator('.chalk-held-indicator')).toHaveClass(/active/)
  const picked=await page.evaluate(()=>({throwing:window.__CAMPUS_TEST__.chalkThrowing(),chalk:window.__CAMPUS_TEST__.schoolChalk()}))
  expect(picked.throwing).toMatchObject({sourcePickables:5,pickables:5,held:{sourceId:focused.id,color:focused.color}})
  expect(picked.throwing.projectiles).toEqual([expect.objectContaining({sourceId:focused.id,status:'held',visible:true})])
  expect(picked.chalk.taken).toContain(focused.id)
  expect(picked.chalk).toMatchObject({renderedChalks:15,renderedInteractiveChalks:5,renderedDecorativeChalks:10})

  await page.evaluate(position=>window.__CAMPUS_TEST__.aimChalkThrow([100,position[1]+1.5,-100]),focused.position)
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
  await expect(page.locator('.chalk-held-indicator')).not.toHaveClass(/active/)
  const simulation=await page.evaluate(()=>{
    const started=performance.now(),state=window.__CAMPUS_TEST__.advanceChalkPhysics(5)
    return {elapsedMs:performance.now()-started,state}
  })
  const settled=simulation.state
  expect(simulation.elapsedMs).toBeLessThan(250)
  expect(settled.held).toBeNull()
  expect(settled.throws).toBe(1)
  expect(settled.collisions).toBeGreaterThan(0)
  expect(settled.projectiles).toHaveLength(1)
  expect(settled.projectiles[0]).toMatchObject({sourceId:focused.id,status:'settled',visible:true,velocity:[0,0,0]})
  expect(settled.projectiles[0].bounces).toBeGreaterThan(0)
  const [minX,maxX,minZ,maxZ]=settled.projectiles[0].roomBounds
  expect(settled.projectiles[0].position[0]).toBeGreaterThanOrEqual(minX)
  expect(settled.projectiles[0].position[0]).toBeLessThanOrEqual(maxX)
  expect(settled.projectiles[0].position[2]).toBeGreaterThanOrEqual(minZ)
  expect(settled.projectiles[0].position[2]).toBeLessThanOrEqual(maxZ)
  expect(settled).toMatchObject({sourcePickables:5,settledPickables:1,pickables:6})

  const landed=await page.evaluate(id=>window.__CAMPUS_TEST__.focusSettledChalk(id),focused.id)
  expect(landed.hit).toMatchObject({id:focused.id})
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
  await expect(page.locator('.chalk-held-indicator')).toHaveClass(/active/)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.chalkThrowing())).toMatchObject({
    sourcePickables:5,settledPickables:0,pickables:5,held:{sourceId:focused.id},
    projectiles:[{sourceId:focused.id,status:'held',visible:true}],
  })

  await page.evaluate(position=>window.__CAMPUS_TEST__.aimChalkThrow([position[0],position[1]-.2,position[2]-.4]),landed.position)
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
  const resettled=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceChalkPhysics(5))
  expect(resettled).toMatchObject({sourcePickables:5,settledPickables:1,pickables:6,held:null,throws:2})

  const focusedBox=await page.evaluate(()=>window.__CAMPUS_TEST__.focusChalkBox())
  expect(focusedBox.hit).toMatchObject({id:focusedBox.id})
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
  await expect(page.locator('#toast')).toHaveText('粉笔已全部收回')
  expect(await page.evaluate(()=>({throwing:window.__CAMPUS_TEST__.chalkThrowing(),chalk:window.__CAMPUS_TEST__.schoolChalk()}))).toMatchObject({
    throwing:{sourcePickables:6,settledPickables:0,pickables:6,held:null,projectiles:[]},
    chalk:{renderedChalks:16,renderedInteractiveChalks:6,renderedDecorativeChalks:10,taken:[]},
  })

  const repick=await page.evaluate(id=>window.__CAMPUS_TEST__.focusPickableChalk(id),focused.id)
  expect(repick.hit).toMatchObject({id:focused.id})
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
  await expect(page.locator('.chalk-held-indicator')).toHaveClass(/active/)
  const heldBox=await page.evaluate(()=>window.__CAMPUS_TEST__.focusChalkBox())
  expect(heldBox.hit).toMatchObject({id:heldBox.id})
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
  await expect(page.locator('.chalk-held-indicator')).not.toHaveClass(/active/)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.chalkThrowing())).toMatchObject({sourcePickables:6,held:null,projectiles:[]})

  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-2.5,-2.6,-2.5,-3.6))
  await page.waitForTimeout(100)
  const exited=await page.evaluate(()=>({throwing:window.__CAMPUS_TEST__.chalkThrowing(),chalk:window.__CAMPUS_TEST__.schoolChalk()}))
  expect(exited.throwing).toMatchObject({currentRoom:null,sourcePickables:0,settledPickables:0,pickables:0,held:null,projectiles:[]})
  expect(exited.chalk).toMatchObject({activeClassroom:null,renderedChalks:0,renderedInteractiveChalks:0,renderedDecorativeChalks:0,taken:[]})

  const reentered=await page.evaluate(id=>window.__CAMPUS_TEST__.focusPickableChalk(id),focused.id)
  expect(reentered.hit).toMatchObject({id:focused.id})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.schoolChalk())).toMatchObject({renderedChalks:16,renderedInteractiveChalks:6,renderedDecorativeChalks:10,taken:[]})

  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('4lite:user-data:v1')))
  expect(saved?.namespaces?.chalkProjectiles).toBeUndefined()

  await page.reload({waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  const restored=await page.evaluate(()=>({throwing:window.__CAMPUS_TEST__.chalkThrowing(),chalk:window.__CAMPUS_TEST__.schoolChalk()}))
  expect(restored.throwing).toMatchObject({sourcePickables:0,settledPickables:0,pickables:0,held:null,persistence:'until-classroom-exit',projectiles:[]})
  expect(restored.chalk.taken).toEqual([])
  expect(restored.chalk.renderedChalks).toBe(0)
  expect(consoleErrors).toEqual([])
})

import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

const playSuccessfulTurn=async page=>{
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  const indices=before.available.slice(0,before.required)
  await page.evaluate(()=>window.__CAMPUS_TEST__.beginJacksTurn())
  const gathered=await page.evaluate(indices=>window.__CAMPUS_TEST__.gatherJacks(indices),indices)
  expect(gathered).toMatchObject({ok:true,count:before.required,indices})
  const caught=await page.evaluate(()=>window.__CAMPUS_TEST__.catchJacks())
  expect(['success','roundComplete']).toContain(caught.phase)
  return page.evaluate(()=>window.__CAMPUS_TEST__.settleJacks())
}

test('jacks progresses through grab one, two and three, persists its record and restores the player',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(5.3,-4.65,5.3,-6.0,0,-.32))
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().interaction==='start-jacks')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.probeJacksInteraction())).toMatchObject({target:'jacks'})
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.player())

  await page.evaluate(()=>window.__CAMPUS_TEST__.enterJacks())
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.settleJacks())
  expect(state).toMatchObject({status:'active',phase:'ready',stage:1,required:1,remaining:6,stoneCount:6,center:[5.3,0,-6],recursiveSceneQueries:0})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'jacks',pointerLookEnabled:false})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().jacks.visible)
  const jacksHud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().jacks)
  expect(jacksHud).toMatchObject({stage:1,required:1,remaining:6,loaded:true})
  expect(jacksHud.exitBounds).not.toBeNull()

  for(let turn=0;turn<6;turn++)state=await playSuccessfulTurn(page)
  expect(state).toMatchObject({phase:'ready',stage:2,required:2,remaining:6})
  for(let turn=0;turn<3;turn++)state=await playSuccessfulTurn(page)
  expect(state).toMatchObject({phase:'ready',stage:3,required:3,remaining:6})
  for(let turn=0;turn<2;turn++)state=await playSuccessfulTurn(page)
  expect(state).toMatchObject({phase:'gameComplete',stage:3,remaining:0,streak:11,failures:0,progress:{highestStage:3,completions:1,bestStreak:11}})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().jacks.complete)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().jacks.complete)).toBe(true)

  const canvas=page.locator('canvas').first(),box=await canvas.boundingBox()
  await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())).toMatchObject({status:'idle',phase:'idle'})
  const restored=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  expect(restored).toMatchObject({mode:'walk',x:before.x,y:before.y,z:before.z})
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterJacks())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.settleJacks())).toMatchObject({status:'active',phase:'ready',stage:1,remaining:6})
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitJacks())
  await page.reload({waitUntil:'networkidle'})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__)
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame().progress)).toEqual({highestStage:3,completions:1,bestStreak:11})
})

test('jacks rejects disturbed stones, gathering timeout and missed catch without losing pieces',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterJacks())
  await page.evaluate(()=>window.__CAMPUS_TEST__.settleJacks())

  await page.evaluate(()=>window.__CAMPUS_TEST__.beginJacksTurn())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.gatherJacks())).toMatchObject({ok:false,reason:'not-aimed'})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())).toMatchObject({phase:'tossing',aimMoved:false,remaining:6,failures:0})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.gatherJacks([0,0]))).toMatchObject({ok:false,reason:'disturbed'})
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state).toMatchObject({phase:'failure',failureReason:'disturbed',remaining:6,available:[0,1,2,3,4,5]})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.jacksGame().phase==='ready')

  await page.evaluate(()=>window.__CAMPUS_TEST__.beginJacksTurn())
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.jacksGame().failureReason==='timeout')
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state).toMatchObject({phase:'failure',failureReason:'timeout',remaining:6,available:[0,1,2,3,4,5]})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.jacksGame().phase==='ready')

  await page.evaluate(()=>window.__CAMPUS_TEST__.beginJacksTurn())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.gatherJacks([0]))).toMatchObject({ok:true,count:1})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.jacksGame().failureReason==='missed-catch')
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state).toMatchObject({phase:'failure',failureReason:'missed-catch',remaining:6,available:[0,1,2,3,4,5],failures:3})
})

test('jacks touch taps toss, gather and catch while owning close-up input',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
  const page=await context.newPage();await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterJacks())
  await page.evaluate(()=>window.__CAMPUS_TEST__.settleJacks())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'jacks',touchModePreferred:true,touchControlsVisible:true,pointerLookEnabled:false})
  expect(await page.evaluate(()=>getComputedStyle(document.querySelector('#touch-joystick')).pointerEvents)).toBe('none')

  const client=await page.context().newCDPSession(page)
  const toss={x:195,y:430,id:61,radiusX:8,radiusY:8,force:1}
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[toss]})
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await page.waitForTimeout(400)
  const tossed=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(tossed.phase).toBe('tossing');expect(tossed.kingY).toBeGreaterThan(.25)
  const stone={x:72,y:329,id:62,radiusX:8,radiusY:8,force:1}
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stone]})
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.jacksGame().phase==='catching')
  const prematureCatch={...stone,id:63}
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[prematureCatch]})
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())).toMatchObject({phase:'catching',catchMoved:false,catchOnTarget:false,remaining:6})
  const catchPoint={x:67,y:544,id:64,radiusX:8,radiusY:8,force:1}
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[catchPoint]})
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state).toMatchObject({phase:'success',stage:1,remaining:5,turn:1,streak:1})
  await context.close()
})

test('desktop toss releases the pointer so the hand cursor can move before gathering',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterJacks())
  await page.evaluate(()=>window.__CAMPUS_TEST__.settleJacks())
  const canvas=page.locator('canvas').first(),box=await canvas.boundingBox()
  const tossPoint={x:box.x+box.width*.5,y:box.y+box.height*.5}
  await page.mouse.click(tossPoint.x,tossPoint.y)
  await page.waitForTimeout(400)
  await page.mouse.click(tossPoint.x,tossPoint.y)
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state).toMatchObject({phase:'tossing',aimMoved:false,selected:[]})
  await page.mouse.move(box.x+box.width*.72,box.y+box.height*.54,{steps:5})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state.phase).toBe('tossing');expect(state.kingY).toBeGreaterThan(.25)
  expect(state.aimMoved).toBe(true);expect(Math.abs(state.hand[0])).toBeGreaterThan(.1)
  const stonePoint={x:box.x+box.width*.184,y:box.y+box.height*.39}
  await page.mouse.click(stonePoint.x,stonePoint.y)
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.jacksGame().phase==='catching')
  await page.mouse.click(stonePoint.x,stonePoint.y)
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state).toMatchObject({phase:'catching',catchMoved:false,catchOnTarget:false,remaining:6})
  const catchPoint={x:box.x+box.width*.171,y:box.y+box.height*.645}
  await page.mouse.move(catchPoint.x,catchPoint.y,{steps:5})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state).toMatchObject({phase:'catching',catchMoved:true,catchOnTarget:true})
  await page.mouse.click(catchPoint.x,catchPoint.y)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())).toMatchObject({phase:'success',remaining:5,turn:1})
})

test('jacks keeps a single lightweight proxy and bounded procedural scene cost',async({page})=>{
  await boot(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.jacksGame())
  expect(state).toMatchObject({status:'idle',stoneCount:6,drawObjects:11,proxyLayer:10,recursiveSceneQueries:0,available:[0,1,2,3,4,5]})
  expect(state.kingY).toBeGreaterThan(0)
  const performance=await page.evaluate(()=>window.__CAMPUS_TEST__.performanceSnapshot())
  expect(performance.quality).toMatchObject({modelLodEnabled:false,automaticDowngrade:false})
  expect(performance.resources.requests).toBeGreaterThan(0)
})

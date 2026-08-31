import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('long jump entry, grading, marker and exit restoration are deterministic',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(6.5,-47.4,6.5,-49.0,0,-.08))
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().interaction==='start-long-jump')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().interactionHint)).toBe('start-long-jump')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.probeLongJumpInteraction())).toMatchObject({target:'sand'})
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.player())

  await page.evaluate(()=>window.__CAMPUS_TEST__.enterLongJump())
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.settleLongJump())
  expect(state).toMatchObject({status:'active',phase:'aiming',board:[5.18,.025,-48.49],takeoffLineZ:-48.63})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('longJump')
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.controls().rotation))[0]).toBeLessThan(-.18)
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().longJump.visible)

  await page.evaluate(()=>window.__CAMPUS_TEST__.beginLongJumpCharge(0))
  await page.evaluate(()=>window.__CAMPUS_TEST__.releaseLongJumpCharge(1))
  let settled=await page.evaluate(()=>{
    const state=window.__CAMPUS_TEST__.settleLongJump()
    return {state,arcadeComic:window.__CAMPUS_TEST__.hud().arcadeComic}
  })
  state=settled.state
  expect(state).toMatchObject({phase:'result',distance:2.2,evaluation:'跳得真远！',overrun:false,markerVisible:true,markerZ:-50.83})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().longJump.phase==='result')
  const bestHud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().longJump)
  expect(bestHud).toMatchObject({visible:true,phase:'result',distance:2.2,evaluation:'跳得真远！',result:true,arcadeScore:{distance:'2.20',visible:true},loaded:true})
  expect(settled.arcadeComic).toMatchObject({active:true,game:'longJump',phrase:'far',kind:'major',ready:{longJump:true}})
  expect(bestHud.exitBounds).not.toBeNull();expect(bestHud.restartBounds).toBeNull()
  const resultCamera=await page.evaluate(()=>window.__CAMPUS_TEST__.longJumpGame().camera)
  expect(resultCamera[2]).toBeLessThan(state.markerZ)
  expect(resultCamera[1]).toBeLessThan(1)
  expect(state.markerZ-resultCamera[2]).toBeGreaterThanOrEqual(1.3)

  await page.waitForFunction(()=>window.__CAMPUS_TEST__.controls().mode==='walk',null,{timeout:5000})
  const autoRestored=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  expect(autoRestored).toMatchObject({mode:'walk',x:before.x,y:before.y,z:before.z})

  await page.evaluate(()=>window.__CAMPUS_TEST__.enterLongJump())
  await page.evaluate(()=>window.__CAMPUS_TEST__.settleLongJump())
  await page.evaluate(()=>window.__CAMPUS_TEST__.beginLongJumpCharge(18))
  await page.evaluate(()=>window.__CAMPUS_TEST__.releaseLongJumpCharge(.85))
  settled=await page.evaluate(()=>{
    const state=window.__CAMPUS_TEST__.settleLongJump()
    return {state,arcadeComic:window.__CAMPUS_TEST__.hud().arcadeComic}
  })
  state=settled.state
  expect(state.distance).toBeGreaterThanOrEqual(1.6);expect(state.distance).toBeLessThan(2)
  expect(state.evaluation).toBe('不错！')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().longJump)).toMatchObject({resultText:'',resultVisible:false})
  expect(settled.arcadeComic).toMatchObject({active:true,game:'longJump',phrase:'good',kind:'plain',burstVisible:false,rootVisible:true})

  await page.evaluate(()=>window.__CAMPUS_TEST__.restartLongJump())
  await page.evaluate(()=>window.__CAMPUS_TEST__.settleLongJump())
  await page.evaluate(()=>window.__CAMPUS_TEST__.beginLongJumpCharge(0))
  await page.evaluate(()=>window.__CAMPUS_TEST__.releaseLongJumpCharge(1.12))
  settled=await page.evaluate(()=>{
    const state=window.__CAMPUS_TEST__.settleLongJump()
    return {state,arcadeComic:window.__CAMPUS_TEST__.hud().arcadeComic}
  })
  state=settled.state
  expect(state).toMatchObject({phase:'result',evaluation:'用力过头啦！',overrun:true,markerVisible:true})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().longJump)).toMatchObject({resultText:'',resultVisible:false})
  expect(settled.arcadeComic).toMatchObject({active:true,game:'longJump',phrase:'overrun',kind:'plain',burstVisible:false,rootVisible:true})
  expect(state.distance).toBeGreaterThanOrEqual(.45);expect(state.distance).toBeLessThanOrEqual(.8)

  await page.evaluate(()=>window.__CAMPUS_TEST__.exitLongJump())
  const restored=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  expect(restored).toMatchObject({mode:'walk',x:before.x,y:before.y,z:before.z})
  await page.waitForFunction(()=>!window.__CAMPUS_TEST__.hud().longJump.visible)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().longJump.visible)).toBe(false)
})

test('touch press and release start a jump without exposing walking controls',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
  const page=await context.newPage();await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterLongJump())
  await page.evaluate(()=>window.__CAMPUS_TEST__.settleLongJump())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'longJump',touchModePreferred:true,touchControlsVisible:true})
  expect(await page.evaluate(()=>document.elementFromPoint(195,430)?.id)).toBe('touch-look-zone')
  const client=await page.context().newCDPSession(page)
  const point={x:195,y:430,id:41,radiusX:8,radiusY:8,force:1}
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]})
  await page.waitForTimeout(180)
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await page.waitForFunction(()=>['flight','landing','result'].includes(window.__CAMPUS_TEST__.longJumpGame().phase))
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.settleLongJump())
  expect(state).toMatchObject({phase:'result',overrun:false,markerVisible:true})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().longJump.phase==='result')
  const exitBounds=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().longJump.exitBounds)
  const exitPoint={x:(exitBounds.left+exitBounds.right)/2,y:(exitBounds.top+exitBounds.bottom)/2,id:42,radiusX:8,radiusY:8,force:1}
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[exitPoint]})
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.controls().mode==='walk')
  await context.close()
})

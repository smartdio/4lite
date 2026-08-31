import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('flag platform enters a dedicated pull interaction and restores walk mode',async({page})=>{
  await boot(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising().flagVisible)).toBe(false)
  const near=await page.evaluate(()=>window.__CAMPUS_TEST__.focusFlagPlatform(2,'lower'))
  expect(near.hit).toMatchObject({target:'flag-platform'})
  expect(near.hit.distance).toBeLessThanOrEqual(2.5)
  const upper=await page.evaluate(()=>window.__CAMPUS_TEST__.focusFlagPlatform(2,'upper'))
  expect(upper.hit).toMatchObject({target:'flag-platform'})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().interaction)).toBe('start-flag-raising')
  const far=await page.evaluate(()=>window.__CAMPUS_TEST__.focusFlagPlatform(3.5))
  expect(far.hit).toBeNull()

  const entered=await page.evaluate(()=>{window.__CAMPUS_TEST__.focusFlagPlatform(2);return window.__CAMPUS_TEST__.enterFlagRaising()})
  expect(entered.mode).toBe('flagRaising')
  expect(entered.flag).toMatchObject({phase:'ready',completed:false,progress:0,flagTopY:2.15,flagVisible:true,vertices:247,flagTexture:[768,512],drawObjects:7})
  expect(entered.hud.instruction).toContain('向下拉')
  expect(entered.hud.instructionPixelSize[0]/entered.hud.instructionPixelSize[1]).toBeCloseTo(8,5)
  expect(await page.locator('canvas').evaluate(node=>getComputedStyle(node).cursor)).toBe('default')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toMatchObject({x:-5.3,y:2.18,z:-46.13})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().projection.verticalFov)).toBe(68)

  const exited=await page.evaluate(()=>window.__CAMPUS_TEST__.exitFlagRaising())
  expect(exited.mode).toBe('walk')
  expect(exited.flag).toMatchObject({status:'idle',flagVisible:false})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().projection.verticalFov)).toBe(50)
})

test('held equipment refuses the flag interaction without changing the walking mode',async({page})=>{
  await boot(page)
  const ball=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame().items[0].id)
  await page.evaluate(id=>{window.__CAMPUS_TEST__.focusBasketball(id);window.__CAMPUS_TEST__.pickupBasketball(id);window.__CAMPUS_TEST__.focusFlagPlatform(2)},ball)
  const rejected=await page.evaluate(()=>window.__CAMPUS_TEST__.enterFlagRaising())
  expect(rejected).toMatchObject({mode:'walk',flag:{status:'idle',phase:'idle'}})
  await page.evaluate(()=>window.__CAMPUS_TEST__.resetBasketballs())
})

test('downward strokes raise the flag in seven pulls and completed state remains raised',async({page})=>{
  await boot(page)
  await page.evaluate(()=>{window.__CAMPUS_TEST__.focusFlagPlatform(2);window.__CAMPUS_TEST__.enterFlagRaising()})
  const memoryBefore=await page.evaluate(()=>window.__CAMPUS_TEST__.performanceSnapshot().renderer.memory)
  const ignored=await page.evaluate(()=>window.__CAMPUS_TEST__.pullFlagRope(-140))
  expect(ignored.progress).toBe(0)
  for(let index=0;index<6;index++)await page.evaluate(()=>window.__CAMPUS_TEST__.pullFlagRope())
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())
  expect(state.completed).toBe(false);expect(state.progress).toBeCloseTo(.9,2)
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.pullFlagRope())
  expect(state).toMatchObject({phase:'complete',completed:true,progress:1,flagTopY:7.52})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().flagRaising.instruction)).toContain('升旗完成')
  const completedHud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().flagRaising)
  expect(completedHud.instruction).toContain('X退出')
  expect(completedHud.instruction).toContain('Esc暂停')
  expect(completedHud.instructionPixelSize[0]/completedHud.instructionPixelSize[1]).toBeCloseTo(8,5)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().projection.verticalFov)).toBeCloseTo(32,0)
  const memoryAfter=await page.evaluate(()=>window.__CAMPUS_TEST__.performanceSnapshot().renderer.memory)
  expect(memoryAfter).toEqual(memoryBefore)

  await page.keyboard.press('KeyX')
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player().mode)).toBe('walk')
  expect(state).toMatchObject({status:'idle',completed:true,progress:1,flagVisible:true})
})

test('desktop mouse can regrip immediately and reuse the previous rope position',async({page})=>{
  await boot(page)
  await page.evaluate(()=>{window.__CAMPUS_TEST__.focusFlagPlatform(2);window.__CAMPUS_TEST__.enterFlagRaising()})
  const viewport=page.viewportSize(),startY=viewport.height*.48
  const xAtY=(points,y)=>{
    const [[ax,ay],[bx,by]]=points
    return ax+(bx-ax)*(y-ay)/(by-ay)
  }
  const first=await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())
  const firstX=xAtY(first.ropePoints,startY)
  await page.mouse.move(firstX,startY);await page.mouse.down();await page.mouse.move(firstX,startY+180);await page.mouse.up()
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())).progress).toBeCloseTo(.15,2)

  await page.waitForTimeout(260)
  const shifted=await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())
  const shiftedX=xAtY(shifted.ropePoints,startY)
  expect(Math.abs(shiftedX-firstX)).toBeGreaterThan(28)
  expect(Math.abs(shiftedX-firstX)).toBeLessThan(64)
  await page.mouse.move(firstX,startY);await page.mouse.down();await page.mouse.move(firstX,startY+180);await page.mouse.up()
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())).progress).toBeCloseTo(.3,2)

  const current=await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())
  expect(current.phase).toBe('regrip')
  const currentX=xAtY(current.ropePoints,startY)
  await page.mouse.move(currentX,startY);await page.mouse.down();await page.mouse.move(currentX,startY+180);await page.mouse.up()
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())).progress).toBeCloseTo(.45,2)
})

test('the lower rope remains draggable after the flag has risen',async({page})=>{
  await boot(page)
  await page.evaluate(()=>{
    window.__CAMPUS_TEST__.focusFlagPlatform(2);window.__CAMPUS_TEST__.enterFlagRaising()
    for(let index=0;index<4;index++)window.__CAMPUS_TEST__.pullFlagRope()
  })
  await page.waitForTimeout(300)
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())
  expect(before.progress).toBeCloseTo(.6,2)
  const startY=page.viewportSize().height*.72
  const [[ax,ay],[bx,by]]=before.ropeSegments[1]
  const startX=ax+(bx-ax)*(startY-ay)/(by-ay)
  await page.mouse.move(startX,startY);await page.mouse.down();await page.mouse.move(startX,startY+170);await page.mouse.up()
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())).progress).toBeCloseTo(.75,2)
})

test('partial progress drops after exit and pause freezes the controller',async({page})=>{
  await boot(page)
  await page.evaluate(()=>{window.__CAMPUS_TEST__.focusFlagPlatform(2);window.__CAMPUS_TEST__.enterFlagRaising();window.__CAMPUS_TEST__.pullFlagRope()})
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())).progress).toBeCloseTo(.15,2)
  const paused=await page.evaluate(()=>window.__CAMPUS_TEST__.pauseMinigame())
  expect(paused.pause).toMatchObject({active:true,mode:'flagRaising'})
  const frozen=await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())
  await page.waitForTimeout(250)
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.flagRaising())).displayProgress).toBe(frozen.displayProgress)
  await page.evaluate(()=>window.__CAMPUS_TEST__.resumeMinigame())
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitFlagRaising())
  const dropped=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceFlagRaising(700))
  expect(dropped).toMatchObject({status:'idle',completed:false,progress:0,displayProgress:0,flagTopY:2.15})
})

test('touch layout exposes a 48px exit target and closes without pointer lock',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
  const page=await context.newPage();await boot(page)
  await page.evaluate(()=>{window.__CAMPUS_TEST__.focusFlagPlatform(2);window.__CAMPUS_TEST__.enterFlagRaising()})
  const state=await page.evaluate(()=>({hud:window.__CAMPUS_TEST__.hud().flagRaising,controls:window.__CAMPUS_TEST__.controls()}))
  expect(state.controls).toMatchObject({mode:'flagRaising',pointerLocked:false})
  expect(state.controls.projection.verticalFov).toBe(110)
  expect(state.hud.exitBounds.right-state.hud.exitBounds.left).toBeGreaterThanOrEqual(48)
  expect(state.hud.exitBounds.bottom-state.hud.exitBounds.top).toBeGreaterThanOrEqual(48)
  await page.touchscreen.tap((state.hud.exitBounds.left+state.hud.exitBounds.right)/2,(state.hud.exitBounds.top+state.hud.exitBounds.bottom)/2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player().mode)).toBe('walk')
  await context.close()
})

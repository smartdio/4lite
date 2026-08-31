import {expect,test} from '@playwright/test'

test('mobile slingshot separates full-screen aiming from pouch-only charging',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
  const page=await context.newPage()
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterSlingshot('wood',10))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.slingshotGame().input.pouchBounds)).not.toBeNull()
  const mobileHud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().slingshot)
  expect(mobileHud).toMatchObject({
    visible:true,helpLabel:'玩法',exitLabel:'退出',instruction:'拖动瞄准 · 按住弹兜发射',
    mobileInstructions:['弹弓玩法','1. 在画面任意位置拖动瞄准','2. 只有按住弹兜才会蓄力，松开发射','3. 点击“距离”按钮切换5米／10米'],
  })
  for(const bounds of [mobileHud.helpBounds,mobileHud.exitBounds]){
    expect(bounds.right-bounds.left).toBeGreaterThanOrEqual(48)
    expect(bounds.bottom-bounds.top).toBeGreaterThanOrEqual(48)
  }
  const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top
  expect(overlaps(mobileHud.helpBounds,mobileHud.exitBounds)).toBe(false)
  expect(overlaps(mobileHud.exitBounds,mobileHud.distanceButtonBounds)).toBe(false)

  const aimResult=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas')
    const fire=(type,x,y,buttons)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:71,pointerType:'touch',isPrimary:true,button:0,buttons,clientX:x,clientY:y}))
    const before=window.__CAMPUS_TEST__.controls().rotation
    fire('pointerdown',34,180,1)
    const down=window.__CAMPUS_TEST__.slingshotGame()
    fire('pointermove',94,220,1)
    const moved=window.__CAMPUS_TEST__.controls().rotation
    const during=window.__CAMPUS_TEST__.slingshotGame()
    fire('pointerup',94,220,0)
    return {before,moved,down,during,after:window.__CAMPUS_TEST__.slingshotGame()}
  })
  expect(aimResult.down).toMatchObject({phase:'ready',shots:0,input:{gesture:'aim'}})
  expect(aimResult.during).toMatchObject({phase:'ready',shots:0,input:{gesture:'aim'}})
  expect(Math.abs(aimResult.moved[1]-aimResult.before[1])).toBeGreaterThan(.15)
  expect(Math.abs(aimResult.moved[0]-aimResult.before[0])).toBeGreaterThan(.10)
  expect(aimResult.after).toMatchObject({phase:'ready',shots:0,input:{gesture:null}})

  const pouch=await page.evaluate(()=>window.__CAMPUS_TEST__.slingshotGame().input.pouchBounds)
  const chargeStart=await page.evaluate(({x,y})=>{
    const canvas=document.querySelector('canvas')
    const fire=(type,clientX,clientY,buttons)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:72,pointerType:'touch',isPrimary:true,button:0,buttons,clientX,clientY}))
    const before=window.__CAMPUS_TEST__.controls().rotation
    fire('pointerdown',x,y,1)
    const down=window.__CAMPUS_TEST__.slingshotGame()
    fire('pointermove',x+70,y-50,1)
    const moved=window.__CAMPUS_TEST__.controls().rotation
    return {before,moved,down}
  },{x:pouch.centerX,y:pouch.centerY})
  expect(chargeStart.down).toMatchObject({phase:'charging',shots:0,input:{gesture:'charge'}})
  expect(chargeStart.moved).toEqual(chargeStart.before)
  await page.waitForTimeout(80)
  const chargeAfter=await page.evaluate(({x,y})=>{
    document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:72,pointerType:'touch',isPrimary:true,button:0,buttons:0,clientX:x+70,clientY:y-50}))
    return window.__CAMPUS_TEST__.slingshotGame()
  },{x:pouch.centerX,y:pouch.centerY})
  expect(chargeAfter).toMatchObject({phase:'ready',shots:1,input:{gesture:null}})

  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigameInstructionVisible),{timeout:10000}).toBeNull()
  await page.touchscreen.tap((mobileHud.helpBounds.left+mobileHud.helpBounds.right)/2,(mobileHud.helpBounds.top+mobileHud.helpBounds.bottom)/2)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigameInstructionVisible)).toBe('slingshot-mobile')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('slingshot')
  await page.touchscreen.tap((mobileHud.exitBounds.left+mobileHud.exitBounds.right)/2,(mobileHud.exitBounds.top+mobileHud.exitBounds.bottom)/2)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('walk')
  await context.close()
})

import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}
const exitPauseMenu=async page=>{
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigamePause.visible)).toBe(true)
  const bounds=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigamePause.exitBounds)
  await page.mouse.click((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2)
}

test('one classroom cube uses nine balanced worn stickers and restores walking',async({page})=>{
  await boot(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube())).toMatchObject({
    status:'unloaded',id:'b2-floor-1-rubiks-cube-01',classroom:'b2-room-1-floor-1',
  })
  await page.evaluate(()=>window.__CAMPUS_TEST__.focusRubiksCube())
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().status)).toBe('ready')
  const focused=await page.evaluate(()=>window.__CAMPUS_TEST__.focusRubiksCube())
  expect(focused.hit).toMatchObject({id:'b2-floor-1-rubiks-cube-01'})
  expect(focused.visibleHit).toMatchObject({id:'b2-floor-1-rubiks-cube-01'})
  expect(focused.state).toMatchObject({
    solved:false,templates:9,
    templateDistribution:{'01':6,'02':6,'03':6,'04':6,'05':6,'06':6,'07':6,'08':6,'09':6},
    transforms:{quarterTurns:[0,1,2,3],mirror:true,deterministic:true},
    rendering:{bodyDrawCalls:1,stickerDrawCalls:9,blackTexture:false,sharedStickerTexture:true},
  })
  const middleRowGesture=await page.evaluate(()=>window.__CAMPUS_TEST__.probeRubiksGesture('-1,0,1',[0,0,1],120,0))
  expect(middleRowGesture).toMatchObject({axis:'y',layer:0})
  const fixedCentreGesture=await page.evaluate(()=>window.__CAMPUS_TEST__.probeRubiksGesture('0,0,1',[0,0,1],120,0))
  expect(fixedCentreGesture.layer).not.toBe(0)
  await page.locator('canvas').click({position:{x:640,y:360}})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().status)).toBe('active')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'rubiksCube',pointerLookEnabled:false})
  await page.mouse.move(640,360);await page.mouse.down();await page.mouse.move(760,360);await page.mouse.up()
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().history)).toBe(1)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().lastMove.layer)).not.toBe(0)
  await page.keyboard.press('z')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().history)).toBe(0)
  await page.keyboard.press('Escape')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'rubiksCube',minigamePaused:true})
  await exitPauseMenu(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'walk',pointerLookEnabled:true})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().persistence)).toMatchObject({namespace:'rubiksCubes',status:'saved'})
})

test.describe('touch layout',()=>{
  test.use({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})
  test('keeps the cube and two-row controls inside the portrait viewport',async({page})=>{
    await boot(page)
    await page.evaluate(()=>window.__CAMPUS_TEST__.focusRubiksCube())
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().status)).toBe('ready')
    await page.evaluate(()=>window.__CAMPUS_TEST__.enterRubiksCube())
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube())).toMatchObject({status:'active',templates:9})
    // Touch mode exposes its own exit control and intentionally does not open the
    // desktop Escape pause menu. Use the test adapter so this case always cleans up.
    await page.evaluate(()=>window.__CAMPUS_TEST__.exitRubiksCube())
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('walk')
  })

  test('a touch beginning on a front gap cannot pick a rear sticker through the cube',async({page})=>{
    await boot(page)
    await page.evaluate(()=>window.__CAMPUS_TEST__.focusRubiksCube())
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().status)).toBe('ready')
    await page.evaluate(()=>window.__CAMPUS_TEST__.enterRubiksCube())
    const before=await page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().history)
    // The exact centre is a black inter-cubie seam in the portrait projection.
    await page.touchscreen.tap(195,422)
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().history)).toBe(before)
  })
})

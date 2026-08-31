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

test('the approved OC-22 prop lives in the selected desk cubby and restores walking after play',async({page})=>{
  await boot(page)
  const initial=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
  expect(initial).toMatchObject({status:'unloaded',id:'octopus-oc22-01',placement:{classroom:'b2-room-3-floor-1'}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.handheldLod())).toMatchObject({octopus:{instanceLoaded:false,drawEligible:false}})
  const focused=await page.evaluate(()=>window.__CAMPUS_TEST__.focusOctopusHandheld())
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld().assetStatus)).toEqual({deviceBase:'ready',lcdAtlas:'ready'})
  const loaded=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
  expect(loaded).toMatchObject({
    status:'idle',displayMode:'time',phase:'clock',highScores:{gameA:0,gameB:0},
    lcdLayoutVersion:'manual-color-v06-mode-indicators',
    helpVariant:'desktop',
    assetStatus:{deviceBase:'ready',lcdAtlas:'ready'},
    rendering:{lcdMode:'atlas-enabled-buffer',canvasTextureUploads:0},
    placement:{
      classroom:'b2-room-3-floor-1',
      deskId:'b2-room-3-floor-1-row-5-column-2-student-desk',
      cubby:'right',workingSize:[.114,.064,.01],
    },
    persistence:{namespace:'handheldOctopus',namespaceVersion:1},
  })
  expect(loaded.placement.position.every(Number.isFinite)).toBe(true)
  expect(loaded.visibleSegmentIds).toContain('segment.038')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.handheldLod())).toMatchObject({octopus:{instanceLoaded:true,drawEligible:true}})
  expect(focused.hit).toMatchObject({id:'octopus-oc22-01',classroom:'b2-room-3-floor-1',deskId:loaded.placement.deskId})
  expect(focused.visibleHit).toMatchObject({id:'octopus-oc22-01',deskId:loaded.placement.deskId})
  expect(focused.hit.distance).toBeLessThanOrEqual(2.5)
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  await page.locator('canvas').click({position:{x:640,y:360}})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld().status)).toBe('active')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'handheldOctopus',pointerLookEnabled:false})
  const active=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
  expect(Object.keys(active.buttonBounds).sort()).toEqual(['gameA','gameB','left','right','time'])
  expect(active.exitBounds).not.toBeNull()

  await page.keyboard.press('Escape')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'handheldOctopus',minigamePaused:true})
  await exitPauseMenu(page)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld().status)).toBe('idle')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(before)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.moveOutsideHandheldLod())).toMatchObject({octopus:{instanceLoaded:true,drawEligible:false}})
})

test('Octopus scoring, misses, difficulty and high scores follow the original rules',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterOctopusHandheld())
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.startOctopusGame('gameA'))
  expect(state.visibleSegmentIds).toContain('mode.gameA')
  expect(state.visibleSegmentIds).not.toContain('mode.gameB')
  const gameATick=state.tickMs

  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({score:20}))
  expect(state).toMatchObject({speedCycle:20,speedStage:1,tickMs:650})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({score:99}))
  expect(state).toMatchObject({speedCycle:99,speedStage:4,tickMs:500})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({score:100}))
  expect(state).toMatchObject({speedCycle:0,speedStage:0,tickMs:700})

  // The boat-side departure slot remains safe even when the leftmost arm's
  // upper branch is fully extended. Collision starts at the first water slot.
  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',misses:0,cargo:0,diverPosition:0,tentacles:[2,0,0,0],tentacleRoutes:['pathA','main','main','main']}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.moveOctopusDiver('left'))
  expect(state).toMatchObject({phase:'playing',misses:0,diverPosition:0})
  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',misses:0,cargo:0,diverPosition:0,tentacles:[3,0,0,0],tentacleRoutes:['pathB','main','main','main']}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.moveOctopusDiver('right'))
  expect(state).toMatchObject({phase:'caught',misses:1,diverPosition:1})

  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',score:0,misses:0,cargo:0,diverPosition:4,tentacles:[0,0,0,0]}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.moveOctopusDiver('left'))
  expect(state).toMatchObject({score:0,cargo:0,diverPosition:4})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.moveOctopusDiver('right'))
  expect(state).toMatchObject({score:1,cargo:1,diverPosition:4})
  expect(state.pickupVisible).toBe(true)
  expect(state.visibleSegmentIds.some(id=>id==='segment.072'||id==='segment.075')).toBe(true)
  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',cargo:1,diverPosition:1,tentacles:[0,0,0,0]}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.moveOctopusDiver('left'))
  expect(state).toMatchObject({score:4,cargo:0,diverPosition:0})
  expect(state).toMatchObject({boatCargoVisible:true})
  expect(state.visibleSegmentIds).toContain('segment.018')

  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',misses:0,cargo:1,diverPosition:3,tentacles:[0,0,0,2]}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.moveOctopusDiver('right'))
  expect(state).toMatchObject({phase:'caught',misses:1,diverPosition:4})
  expect(state.visibleSegmentIds).toContain('segment.004')

  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',score:199,misses:2}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.scoreOctopus(1))
  expect(state).toMatchObject({score:200,misses:0})
  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',score:499,misses:2}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.scoreOctopus(1))
  expect(state).toMatchObject({score:500,misses:0})

  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',misses:2}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.missOctopusDiver())
  expect(state).toMatchObject({misses:3,phase:'gameOver'})

  state=await page.evaluate(()=>window.__CAMPUS_TEST__.startOctopusGame('gameB'))
  expect(state).toMatchObject({tickMs:520,speedCycle:0,speedStage:0})
  expect(state.visibleSegmentIds).toContain('mode.gameB')
  expect(state.visibleSegmentIds).not.toContain('mode.gameA')
  expect(state.tickMs).toBeLessThan(gameATick)
  await page.evaluate(()=>window.__CAMPUS_TEST__.startOctopusGame('gameA'))
  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',score:320,misses:0}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.scoreOctopus(1))
  expect(state.highScores.gameA).toBe(500)
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitOctopusHandheld())

  await page.reload({waitUntil:'networkidle'})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__)
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())).toMatchObject({status:'unloaded'})
  await page.evaluate(()=>window.__CAMPUS_TEST__.focusOctopusHandheld())
  const restored=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
  expect(restored).toMatchObject({
    status:'idle',displayMode:'time',highScores:{gameA:500,gameB:0},
    persistence:{persistedNamespaces:expect.arrayContaining(['handheldOctopus','personalRecords'])},
  })
})

test('keyboard and projected pointer bounds operate the physical controls',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterOctopusHandheld())
  await page.keyboard.press('1')
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
  expect(state).toMatchObject({displayMode:'gameA',phase:'playing',diverPosition:0})
  await page.keyboard.press('ArrowRight')
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
  expect(state.diverPosition).toBe(1)

  await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'playing',diverPosition:0,tentacles:[0,0,0,0]}))
  const right=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld().buttonBounds.right)
  await page.mouse.click((right.left+right.right)/2,(right.top+right.bottom)/2)
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
  expect(state.diverPosition).toBe(1)
  expect(state.pressed).toEqual([])

  const time=state.buttonBounds.time
  await page.mouse.click((time.left+time.right)/2,(time.top+time.bottom)/2)
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
  expect(state).toMatchObject({displayMode:'time',phase:'clock'})
  expect(state.visibleSegmentIds).not.toEqual(expect.arrayContaining(['mode.gameA','mode.gameB']))
  const exit=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld().exitBounds)
  await page.mouse.click((exit.left+exit.right)/2,(exit.top+exit.bottom)/2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())).toMatchObject({status:'idle'})
})

test('the pause return control and the direct exit control both leave a clean state for bamboo climb',async({page})=>{
  await boot(page)

  await page.evaluate(()=>window.__CAMPUS_TEST__.enterOctopusHandheld())
  await page.keyboard.press('Escape')
  await exitPauseMenu(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'walk',pointerLookEnabled:true})
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterBambooClimb(0))
  await page.evaluate(()=>window.__CAMPUS_TEST__.setBambooClimbCursor(-.36,-.04))
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.beginBambooClimbCharge())).toBe(true)
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitBambooClimb())

  await page.evaluate(()=>window.__CAMPUS_TEST__.enterOctopusHandheld())
  const exit=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld().exitBounds)
  await page.mouse.click((exit.left+exit.right)/2,(exit.top+exit.bottom)/2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'walk',pointerLookEnabled:true})
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterBambooClimb(1))
  await page.evaluate(()=>window.__CAMPUS_TEST__.setBambooClimbCursor(-.36,-.04))
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.beginBambooClimbCharge())).toBe(true)
})

test('LCD states are exact atlas segment sets and caught legs alternate in pairs',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterOctopusHandheld())
  await page.evaluate(()=>window.__CAMPUS_TEST__.startOctopusGame('gameA'))
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({phase:'caught',diverPosition:2,caughtFrame:0,tentacles:[0,0,0,0]}))
  expect(state.visibleSegmentIds).toEqual(expect.arrayContaining(['segment.046','segment.049','segment.054','segment.050','segment.058']))
  expect(state.visibleSegmentIds).not.toEqual(expect.arrayContaining(['segment.056','segment.060']))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setOctopusState({caughtFrame:1}))
  expect(state.visibleSegmentIds).toEqual(expect.arrayContaining(['segment.046','segment.049','segment.054','segment.056','segment.060']))
  expect(state.visibleSegmentIds).not.toEqual(expect.arrayContaining(['segment.050','segment.058']))
  expect(state.rendering).toEqual({lcdMode:'atlas-enabled-buffer',canvasTextureUploads:0})
  expect(state.pressedOverlays).toEqual([])
})

test('multi-touch ownership, cancellation and focus loss cannot leave a button stuck',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterOctopusHandheld())
  const bounds=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld().buttonBounds)
  const point=box=>({clientX:(box.left+box.right)/2,clientY:(box.top+box.bottom)/2})
  let state=await page.evaluate(({left,right})=>{
    window.__CAMPUS_TEST__.handleOctopusPointer('pointerdown',{pointerId:11,...left})
    return window.__CAMPUS_TEST__.handleOctopusPointer('pointerdown',{pointerId:12,...right})
  },{left:point(bounds.left),right:point(bounds.right)})
  expect(state.pressed.sort()).toEqual(['left','right'])
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.handleOctopusPointer('pointerup',{pointerId:11,clientX:0,clientY:0}))
  expect(state.pressed).toEqual(['right'])
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.handleOctopusPointer('pointercancel',{pointerId:12,clientX:0,clientY:0}))
  expect(state.pressed).toEqual([])
  await page.evaluate(({left})=>window.__CAMPUS_TEST__.handleOctopusPointer('pointerdown',{pointerId:13,...left}),{left:point(bounds.left)})
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')))
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld().pressed)).toEqual([])
})

test.describe('touch HUD',()=>{
  test.use({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})

  test('shows only the touch layout and keeps the exit target inside the safe area',async({page})=>{
    await boot(page)
    await page.evaluate(()=>window.__CAMPUS_TEST__.enterOctopusHandheld())
    const state=await page.evaluate(()=>window.__CAMPUS_TEST__.octopusHandheld())
    expect(state.helpVariant).toBe('touch')
    expect(state.exitBounds).toMatchObject({left:expect.any(Number),right:expect.any(Number),top:expect.any(Number),bottom:expect.any(Number)})
    expect(state.exitBounds.left).toBeGreaterThanOrEqual(0)
    expect(state.exitBounds.top).toBeGreaterThanOrEqual(0)
    expect(state.exitBounds.right).toBeLessThanOrEqual(390)
    expect(state.exitBounds.bottom).toBeLessThanOrEqual(844)
  })
})

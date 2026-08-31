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

test('Fire FR-27 is in the requested second-floor western classroom desk cubby',async({page})=>{
  await boot(page)
  const initial=await page.evaluate(()=>window.__CAMPUS_TEST__.fireHandheld())
  expect(initial).toMatchObject({status:'unloaded',id:'fire-fr27-01',placement:{classroom:'b2-room-1-floor-2'}})
  const outdoorLod=await page.evaluate(()=>window.__CAMPUS_TEST__.handheldLod())
  expect(outdoorLod.fire).toMatchObject({instanceLoaded:false,drawEligible:false})
  const focused=await page.evaluate(()=>window.__CAMPUS_TEST__.focusFireHandheld())
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.fireHandheld().assetStatus)).toEqual({deviceBase:'ready',lcdAtlas:'ready'})
  const loaded=await page.evaluate(()=>window.__CAMPUS_TEST__.fireHandheld())
  expect(loaded).toMatchObject({
    status:'idle',displayMode:'time',phase:'clock',id:'fire-fr27-01',
    lcdLayoutVersion:'fire-manual-ownership-v06',
    assetStatus:{deviceBase:'ready',lcdAtlas:'ready'},
    rendering:{lcdMode:'atlas-enabled-buffer',canvasTextureUploads:0},
    placement:{
      classroom:'b2-room-1-floor-2',
      deskId:'b2-room-1-floor-2-row-5-column-2-student-desk',
      cubby:'left',workingSize:[.124,.07,.01],
    },
    persistence:{namespace:'handheldFire',namespaceVersion:1},
  })
  expect(loaded.placement.position.every(Number.isFinite)).toBe(true)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.handheldLod())).toMatchObject({fire:{instanceLoaded:true,drawEligible:true}})
  expect(focused.hit).toMatchObject({id:'fire-fr27-01',classroom:'b2-room-1-floor-2',deskId:loaded.placement.deskId})
  expect(focused.visibleHit).toMatchObject({id:'fire-fr27-01',deskId:loaded.placement.deskId})
  await page.locator('canvas').click({position:{x:640,y:360}})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.fireHandheld().status)).toBe('active')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'handheldFire',pointerLookEnabled:false})
  await page.keyboard.press('Escape')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'handheldFire',minigamePaused:true})
  await exitPauseMenu(page)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.fireHandheld().status)).toBe('idle')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'walk',pointerLookEnabled:true})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.moveOutsideHandheldLod())).toMatchObject({fire:{instanceLoaded:true,drawEligible:false}})
})

test('Fire gameplay animates smoke, catches, misses, modes and controls',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterFireHandheld())
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.startFireGame('gameA'))
  expect(state).toMatchObject({displayMode:'gameA',phase:'playing',score:0,misses:0,stretcherPosition:1,tickMs:720})
  expect(state.visibleSegmentIds).toContain('segment.077')

  const smoke=[]
  for(let frame=0;frame<8;frame++){
    state=await page.evaluate(value=>window.__CAMPUS_TEST__.setFireState({smokeFrame:value}),frame)
    smoke.push(state.visibleSegmentIds.filter(id=>['segment.001','segment.002','segment.018','segment.034'].includes(id)))
  }
  expect(smoke.map(frame=>frame.length)).toEqual([1,2,2,3,4,2,1,2])
  expect(new Set(smoke.flat()).size).toBe(4)

  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setFireState({phase:'playing',stretcherPosition:0,people:[{stage:0,step:4,bounceLane:null}],spawnIn:99,score:0,misses:0}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceFireTicks(1))
  expect(state).toMatchObject({score:1,misses:0,bounce:{lane:0}})
  expect(state.visibleSegmentIds).toContain('segment.068')
  expect(state.visibleSegmentIds).not.toContain('segment.073')

  await page.evaluate(()=>window.__CAMPUS_TEST__.advanceFireTicks(1))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setFireState({phase:'playing',stretcherPosition:1,people:[{stage:1,step:6,bounceLane:null}],spawnIn:99,score:1,misses:0}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceFireTicks(1))
  expect(state).toMatchObject({score:2,misses:0,bounce:{lane:1}})
  expect(state.visibleSegmentIds).toContain('segment.071')
  expect(state.visibleSegmentIds).not.toContain('segment.074')

  await page.evaluate(()=>window.__CAMPUS_TEST__.setFireState({phase:'playing',stretcherPosition:0,people:[{stage:2,step:4,bounceLane:null}],spawnIn:99,misses:0}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceFireTicks(1))
  expect(state).toMatchObject({phase:'miss',misses:1,fall:null,crash:{lane:2}})
  expect(state.visibleSegmentIds).toEqual(expect.arrayContaining(['segment.007','segment.031','segment.075']))
  await page.evaluate(()=>window.__CAMPUS_TEST__.setFireState({phase:'playing',misses:2}))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.missFire())
  expect(state).toMatchObject({phase:'gameOver',misses:3})

  state=await page.evaluate(()=>window.__CAMPUS_TEST__.startFireGame('gameB'))
  expect(state).toMatchObject({displayMode:'gameB',phase:'playing',tickMs:540})
  expect(state.visibleSegmentIds).toContain('segment.076')
  await page.keyboard.press('ArrowLeft')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.fireHandheld().stretcherPosition)).toBe(0)
  const right=await page.evaluate(()=>window.__CAMPUS_TEST__.fireHandheld().buttonBounds.right)
  await page.mouse.click((right.left+right.right)/2,(right.top+right.bottom)/2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.fireHandheld().stretcherPosition)).toBe(1)

  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setFireState({phase:'playing',people:[{stage:3,step:6,bounceLane:null}],spawnIn:99}))
  expect(state.visibleSegmentIds).toEqual(expect.arrayContaining(['segment.043','segment.050']))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setFireState({people:[{stage:3,step:8,bounceLane:null}]}))
  expect(state.visibleSegmentIds).toEqual(expect.arrayContaining(['segment.043','segment.058']))
})

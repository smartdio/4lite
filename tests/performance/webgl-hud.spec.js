import {expect,test} from '@playwright/test'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('WebGL HUD preloads the confirmed smooth atlas and switches pickup/held states',async({page})=>{
  await ready(page)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud())).toMatchObject({loaded:true,warmed:true,enabled:true})
  const game=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())
  const id=game.items[0].id
  await page.evaluate(id=>window.__CAMPUS_TEST__.focusBasketball(id),id)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().interaction)).toBe('pick-up-basketball')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().interactionHint)).toBe('pick-up-basketball')
  await page.evaluate(id=>window.__CAMPUS_TEST__.pickupBasketball(id),id)
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(15.1,-38.5,15.1,-42,0,3))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().interaction)).toBe('shoot-basketball')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().basketball)).toMatchObject({loaded:true,visible:true,charging:false,points:0,hits:0,attempts:0,decisionRatio:.62})
  expect(await page.locator('.crosshair').evaluate(node=>getComputedStyle(node).display)).toBe('none')
})

test('entry movement help stays below the reticle without a blocking panel',async({browser})=>{
  const cases=[
    {viewport:{width:1440,height:900},mobile:false,variant:'desktop',primary:'WASD／方向键移动 · 鼠标观察'},
    {viewport:{width:390,height:844},mobile:true,variant:'mobile',primary:'看向地面，出现绿色标记后轻触前往'},
  ]
  for(const item of cases){
    const context=await browser.newContext({viewport:item.viewport,isMobile:item.mobile,hasTouch:item.mobile,deviceScaleFactor:item.mobile?2:1})
    const page=await context.newPage()
    await page.goto('/',{waitUntil:'networkidle',timeout:120000})
    await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
    await page.locator('#enter-campus').click()
    await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
    const tutorial=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().movementTutorial)
    expect(tutorial).toMatchObject({variant:item.variant,panel:false})
    expect(tutorial.lines[0]).toBe(item.primary)
    expect(tutorial.bounds.top).toBeGreaterThan(item.viewport.height/2)
    expect(tutorial.bounds.left).toBeGreaterThanOrEqual(12)
    expect(tutorial.bounds.right).toBeLessThanOrEqual(item.viewport.width-12)
    expect(tutorial.bounds.height).toBeLessThan(item.viewport.height*.2)
    await context.close()
  }
})

test('basketball score uses the layered arcade-comic celebration',async({page})=>{
  await ready(page)
  const game=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())
  const id=game.items[0].id,[x,y,z]=game.rimWorld
  await page.evaluate(({id,x,y,z})=>window.__CAMPUS_TEST__.setBasketballState(id,{position:[x,y+.03,z],velocity:[0,-6,0],shot:{id:901},countAttempt:true,wasAboveRim:true}),{id,x,y,z})
  await page.evaluate(()=>window.__CAMPUS_TEST__.advanceBasketball(.03))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().basketball)).toMatchObject({points:2,hits:1,attempts:1,arcadeScore:{score:'002',hits:'01',shots:'01'},feedbackVisible:false})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:true,game:'basketball',phrase:'two',secondaryPhrase:null,kind:'major',rootVisible:true,ready:{basketball:true}})
  await page.waitForTimeout(1150)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic.active)).toBe(false)
})

test('arcade-comic foreground and burst use independent elastic scales',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.prepareArcadeComicHud('basketball'))
  await page.evaluate(()=>window.__CAMPUS_TEST__.playArcadeComicCelebration('basketball','two','major',1050))
  await page.waitForTimeout(115)
  const first=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)
  expect(first).toMatchObject({active:true,game:'basketball',phrase:'two',secondaryPhrase:null,kind:'major',rootVisible:true})
  expect(first.textScale[0]).not.toBeCloseTo(first.burstScale[0],2)
  await page.waitForTimeout(160)
  const rebound=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)
  expect(rebound.textScale[0]).not.toBeCloseTo(first.textScale[0],2)
  expect(rebound.burstScale[0]).not.toBeCloseTo(first.burstScale[0],2)
})

test('ping-pong good shot and smash are mutually exclusive over the centred score',async({page})=>{
  await ready(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic.ready.pingPong)).toBe(false)
  await page.evaluate(()=>window.__CAMPUS_TEST__.prepareArcadeComicHud('pingPong'))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic.ready.pingPong)).toBe(true)
  await page.evaluate(()=>{
    window.__CAMPUS_TEST__.setArcadeHudSample('pingPong',{playerScore:3,aiScore:2})
    return window.__CAMPUS_TEST__.flashPingPongFeedback('good-shot',900)
  })
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({
    active:true,game:'pingPong',phrase:'good',secondaryPhrase:null,kind:'hit',rootVisible:true,
    rootPosition:[0,.7],
  })
  const presentation=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)
  expect(presentation.baseTextScale[0]*1280/(presentation.baseTextScale[1]*720)).toBeCloseTo(2,5)
  expect(presentation.baseBurstScale[0]*1280/(presentation.baseBurstScale[1]*720)).toBeCloseTo(1,5)
  expect(await page.evaluate(()=>{
    window.__CAMPUS_TEST__.setArcadeHudSample('pingPong',{playerScore:3,aiScore:2})
    return window.__CAMPUS_TEST__.flashPingPongFeedback('smash',900)
  })).toMatchObject({active:true,game:'pingPong',phrase:'smash',secondaryPhrase:null,kind:'hit',rootVisible:true})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.playArcadeComicCelebration('pingPong','good','hit',900,'smash'))).toMatchObject({phrase:'smash',secondaryPhrase:null})
})

test('shared arcade digits compose every current score format without creating per-value textures',async({page})=>{
  await ready(page)
  const values=[0,1,9,10,99,100,999]
  for(const points of values){
    const hud=await page.evaluate(points=>window.__CAMPUS_TEST__.setArcadeHudSample('basketball',{points,hits:Math.min(points,99),attempts:Math.min(points,99)}),points)
    expect(hud.arcadeScore.score).toBe(String(points).padStart(3,'0'))
    expect(hud).toMatchObject({arcadeScore:{scorePixelHeight:156,statsPixelHeight:96},panelVisible:false,scoreBounds:{left:300,right:980,top:4,bottom:204}})
  }
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setArcadeHudSample('pingPong',{playerScore:7,aiScore:6}))).toMatchObject({
    arcadeScore:{player:'7',ai:'6',scorePixelHeight:156},panelVisible:false,promptVisible:false,serveMarkerVisible:true,
    scoreBounds:{left:250,right:1030,top:4,bottom:196},
  })
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setArcadeHudSample('longJump',{distance:2.2}))).toMatchObject({arcadeScore:{distance:'2.20',visible:true,distancePixelHeight:280}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setArcadeHudSample('bambooClimb',{progress:1,rise:99}))).toMatchObject({arcadeScore:{progress:'100',rise:'+99',riseVisible:true,progressPixelHeight:140,risePixelHeight:120}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setArcadeHudSample('hopscotch',{target:1,bestProgress:8}))).toMatchObject({arcadeScore:{target:'01',best:'08'}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setArcadeHudSample('shuttlecock',{streak:10,best:99}))).toMatchObject({arcadeScore:{streak:'10',best:'99'}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setArcadeHudSample('jacks',{stage:3,remaining:6,streak:10,failures:9}))).toMatchObject({arcadeScore:{stage:'3',remaining:'06',streak:'10',failures:'09'}})
})

test('new minigames use dedicated cursor cells and L2/L3 feedback layers',async({page})=>{
  await ready(page)
  const rects=await page.evaluate(async()=>{
    const values={}
    for(const name of ['start-hopscotch','start-shuttlecock','start-jacks']){
      window.__CAMPUS_TEST__.setHudInteraction?.(name)
      values[name]=window.__CAMPUS_TEST__.hud().interactionRect
    }
    return values
  })
  expect(new Set(Object.values(rects).map(value=>JSON.stringify(value))).size).toBe(3)
  for(const game of ['hopscotch','shuttlecock','jacks']){
    await page.evaluate(game=>window.__CAMPUS_TEST__.prepareArcadeComicHud(game),game)
    await expect.poll(()=>page.evaluate(game=>window.__CAMPUS_TEST__.hud().arcadeComic.ready[game],game)).toBe(true)
  }
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic.atlasSizes)).toMatchObject({
    hopscotch:[1024,1024],shuttlecock:[1024,768],jacks:[1024,1024],
  })
  await page.evaluate(()=>window.__CAMPUS_TEST__.playArcadeComicCelebration('hopscotch','line','plain',900))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({game:'hopscotch',phrase:'line',kind:'plain',burstVisible:false})
  await page.evaluate(()=>window.__CAMPUS_TEST__.playArcadeComicCelebration('jacks','stage-one','hit',900))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({game:'jacks',phrase:'stage-one',kind:'hit',burstVisible:true})
})

test('slingshot HUD exposes selection, station, tutorial and hit/miss feedback hierarchy',async({page})=>{
  await ready(page)
  const hintKeys=['select-slingshot-wood','select-slingshot-wire','select-slingshot-5m','select-slingshot-10m']
  const hintStates=await page.evaluate(keys=>keys.map(key=>window.__CAMPUS_TEST__.setHudInteraction(key)),hintKeys)
  expect(hintStates.map(state=>state.interactionHint)).toEqual(hintKeys)

  await page.evaluate(()=>window.__CAMPUS_TEST__.enterSlingshot('wire',10))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud())).toMatchObject({
    minigameInstructionVisible:'slingshot-desktop',
    slingshot:{visible:true,selectedId:'wire',selectedLabel:'wire',distance:10,arcadeScore:{hits:'00',shots:'00',distance:'10'}},
  })
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic.ready.slingshot)).toBe(true)

  await page.evaluate(()=>window.__CAMPUS_TEST__.selectSlingshot('wood'))
  await page.evaluate(()=>window.__CAMPUS_TEST__.setSlingshotDistance(5))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().slingshot)).toMatchObject({
    selectedId:'wood',selectedLabel:'wood',distance:5,arcadeScore:{distance:'5'},instruction:'W／↑ 5米　S／↓ 10米',
  })

  await page.evaluate(()=>window.__CAMPUS_TEST__.playArcadeComicCelebration('slingshot','hit','hit',900))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({
    game:'slingshot',phrase:'hit',kind:'hit',rootVisible:true,burstVisible:true,rootPosition:[0,.28],
  })
  await page.evaluate(()=>window.__CAMPUS_TEST__.playArcadeComicCelebration('slingshot','miss','plain',900))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({
    game:'slingshot',phrase:'miss',kind:'plain',rootVisible:true,burstVisible:false,
  })
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitSlingshot())
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:false,rootVisible:false,burstVisible:false})
})

test('desktop minigames share one Escape pause menu and resume without changing mode',async({page})=>{
  await ready(page)
  const cases=[
    {mode:'slingshot',enter:'enterSlingshot',exit:'exitSlingshot'},
    {mode:'bambooClimb',enter:'enterBambooClimb',exit:'exitBambooClimb'},
    {mode:'longJump',enter:'enterLongJump',exit:'exitLongJump'},
    {mode:'shuttlecock',enter:'enterShuttlecock',exit:'exitShuttlecock'},
    {mode:'jacks',enter:'enterJacks',exit:'exitJacks'},
  ]
  for(const item of cases){
    await page.evaluate(item=>window.__CAMPUS_TEST__[item.enter](),item)
    await page.keyboard.press('Escape')
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({
      mode:item.mode,minigamePaused:true,minigamePauseMode:item.mode,
    })
    const pauseHud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigamePause)
    expect(pauseHud).toMatchObject({visible:true})
    expect(pauseHud.resumeBounds).not.toBeNull()
    const bounds=pauseHud.resumeBounds
    await page.mouse.click((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2)
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:item.mode,minigamePaused:false})
    await page.evaluate(item=>window.__CAMPUS_TEST__[item.exit](),item)
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('walk')
  }
})

test('X directly exits every desktop minigame and also works from pause',async({page})=>{
  await ready(page)
  const cases=[
    {mode:'slingshot',enter:'enterSlingshot'},
    {mode:'pingPong',enter:'enterPingPongTable'},
    {mode:'bambooClimb',enter:'enterBambooClimb'},
    {mode:'longJump',enter:'enterLongJump'},
    {mode:'hopscotch',enter:'enterHopscotch'},
    {mode:'shuttlecock',enter:'enterShuttlecock'},
    {mode:'jacks',enter:'enterJacks'},
    {mode:'handheldOctopus',enter:'enterOctopusHandheld'},
    {mode:'handheldFire',enter:'enterFireHandheld'},
    {mode:'rubiksCube',prepare:'focusRubiksCube',enter:'enterRubiksCube'},
  ]
  for(const item of cases){
    if(item.prepare){
      await page.evaluate(item=>window.__CAMPUS_TEST__[item.prepare](),item)
      await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.rubiksCube().status)).toBe('ready')
    }
    await page.evaluate(item=>window.__CAMPUS_TEST__[item.enter](),item)
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe(item.mode)
    await page.keyboard.press('KeyX')
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'walk',minigamePaused:false})
  }

  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable())
  await page.keyboard.press('Escape')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'pingPong',minigamePaused:true})
  await page.keyboard.press('KeyX')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'walk',minigamePaused:false})
})

test('new minigame HUD safe areas stay separate on desktop, phone landscape and phone portrait',async({browser})=>{
  const viewports=[{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true},{width:390,height:844,mobile:true}]
  const overlaps=(left,right)=>left.left<right.right&&left.right>right.left&&left.top<right.bottom&&left.bottom>right.top
  for(const viewport of viewports){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.mobile,hasTouch:viewport.mobile,deviceScaleFactor:viewport.mobile?2:1})
    const page=await context.newPage();await ready(page)
    const hud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud())
    for(const game of ['hopscotch','shuttlecock','jacks']){
      const state=hud[game]
      for(const bounds of [state.scoreBounds,state.exitBounds]){
        expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.top).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(viewport.width);expect(bounds.bottom).toBeLessThanOrEqual(viewport.height)
      }
      expect(overlaps(state.scoreBounds,state.exitBounds)).toBe(false)
    }
    const shuttle=hud.shuttlecock
    expect(overlaps(shuttle.leftBounds,shuttle.rightBounds)).toBe(false)
    expect(overlaps(shuttle.leftBounds,shuttle.scoreBounds)).toBe(false)
    expect(overlaps(shuttle.rightBounds,shuttle.scoreBounds)).toBe(false)
    expect(overlaps(shuttle.leftBounds,shuttle.exitBounds)).toBe(false)
    expect(overlaps(shuttle.rightBounds,shuttle.exitBounds)).toBe(false)
    await context.close()
  }
})

test('new minigame feedback is cleared on exit and does not leak into the next game',async({page})=>{
  await ready(page)
  const cases=[
    {game:'hopscotch',enter:'enterHopscotch',exit:'exitHopscotch',phrase:'line'},
    {game:'shuttlecock',enter:'enterShuttlecock',exit:'exitShuttlecock',phrase:'switch-foot'},
    {game:'jacks',enter:'enterJacks',exit:'exitJacks',phrase:'disturbed'},
  ]
  for(const item of cases){
    await page.evaluate(item=>window.__CAMPUS_TEST__[item.enter](),item)
    await page.evaluate(item=>window.__CAMPUS_TEST__.prepareArcadeComicHud(item.game),item)
    await expect.poll(()=>page.evaluate(item=>window.__CAMPUS_TEST__.hud().arcadeComic.ready[item.game],item)).toBe(true)
    const feedback=await page.evaluate(item=>window.__CAMPUS_TEST__.playArcadeComicCelebration(item.game,item.phrase,'plain',5000),item)
    expect(feedback).toMatchObject({active:true,rootVisible:true,burstVisible:false})
    await page.evaluate(item=>window.__CAMPUS_TEST__[item.exit](),item)
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:false,rootVisible:false,burstVisible:false})
  }
})

test('basketball ambient HUD stops at the painted half-court boundary',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(15.1,-38.5,15.1,-42))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame().ui)).toMatchObject({visible:true,insideCourt:true})
  // 这个位置仍在旧14米圆形范围内，但已经越过半场东侧边线。
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(20.5,-38.5,20.5,-40))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame().ui)).toMatchObject({visible:false,insideCourt:false,canReset:false})
})

test('approaching each minigame shows its platform-specific tutorial once',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(15.1,-38.5,15.1,-42))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigameTutorialVisible)).toBe('basketball-desktop')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigameInstructionVisible)).toBe('basketball-desktop')
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-40.5,-35.8,-40.5,-36))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigameTutorialVisible)).toBe('ping-pong-desktop')
})

test('HUD prewarms the smooth image atlas and shared glyph atlas once',async({page})=>{
  await ready(page)
  const snapshot=await page.evaluate(()=>window.__CAMPUS_TEST__.performanceSnapshot())
  const frames=await page.evaluate(()=>window.__CAMPUS_TEST__.sampleFrameTimings(180,30))
  const hudRequests=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/assets/ui/hud-v02/')&&entry.name.includes('atlas')).map(entry=>entry.name))
  const fontRequests=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/assets/fonts/pixel/4lite-fusion-pixel-12px-ui-v02.woff2')).map(entry=>entry.name))
  expect(hudRequests).toHaveLength(2)
  expect(fontRequests).toHaveLength(1)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud())).toMatchObject({atlases:6,pixelText:{loaded:true,sizes:{small:16,large:32}}})
  // Generated hints, movement help and minigame instructions share one atlas;
  // the renderer budget remains a hard ceiling, not a proportional allowance.
  expect(snapshot.renderer.memory.textures,JSON.stringify(snapshot.textures)).toBeLessThanOrEqual(174)
  expect(snapshot.renderer.render.calls).toBeLessThanOrEqual(1150)
  expect(frames.p95Ms).toBeLessThanOrEqual(50)
})

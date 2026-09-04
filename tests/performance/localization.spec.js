import {expect,test} from '@playwright/test'

const enterCampus=async(page,path='/en/')=>{
  await page.goto(path,{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('English URL localises loading, interaction HUD and semantic minigame feedback',async({page})=>{
  await page.goto('/en/',{waitUntil:'domcontentloaded'})
  await expect(page.locator('#loading-message')).toHaveText('Preparing old desks and corridors…')
  await expect(page.locator('#loading-tip-title')).toHaveText('Take Your Time')
  await expect(page.locator('#loading-retry')).toHaveText('Try Again')
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())

  let hud=await page.evaluate(()=>window.__CAMPUS_TEST__.setHudInteraction('open-xiaohongshu'))
  expect(hud).toMatchObject({interactionHintText:'Open Xiaohongshu',personalRecordLabel:'My Record'})
  const shuttlecockHud=await page.evaluate(()=>window.__CAMPUS_TEST__.setArcadeHudSample('shuttlecock',{streak:0,best:0}))
  expect(shuttlecockHud.footButtons).toEqual({left:{label:'LEFT',key:'Q'},right:{label:'RIGHT',key:'E'}})

  await page.evaluate(()=>{
    window.__CAMPUS_TEST__.enterPingPongTable(0)
    return window.__CAMPUS_TEST__.startPingPongMatch()
  })
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong)).toMatchObject({visible:true,mode:'match'})
  const ping=await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('player','test-award'))
  expect(ping).toMatchObject({mode:'match',feedbackCode:'point-player',reasonCode:'test-award',feedback:'Point over',ui:{prompt:'Point over'}})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong)).toMatchObject({feedbackTitle:'POINT',feedbackDetail:'PLAYER +1'})
  const pause=await page.evaluate(()=>window.__CAMPUS_TEST__.pauseMinigame())
  expect(pause.hud).toMatchObject({visible:true,prompt:'Resume or exit',resumeLabel:'Resume',exitLabel:'Exit'})
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitPausedMinigame())

  const hopscotch=await page.evaluate(()=>{
    window.__CAMPUS_TEST__.enterHopscotch()
    return window.__CAMPUS_TEST__.throwHopscotchTile(1,0,-1)
  })
  expect(hopscotch).toMatchObject({phase:'fault',faultReason:'Too short',reasonCode:'throw-short',feedbackCode:'throw-short'})
})

test('English view reads the same persistent record IDs and numeric values as Chinese',async({page})=>{
  await enterCampus(page,'/')
  const chinese=await page.evaluate(()=>{
    window.__CAMPUS_TEST__.clearPersonalRecords()
    window.__CAMPUS_TEST__.recordPersonalGame('basketball',{max:{bestPoints:4}})
    window.__CAMPUS_TEST__.recordPersonalObject({id:'legacy-pencil-box',kind:'pencilBox',typeId:'pencilBox:flower',label:'花仙子铁皮铅笔盒'})
    return window.__CAMPUS_TEST__.personalRecords()
  })
  expect(chinese.view.games.find(game=>game.id==='basketball')).toMatchObject({label:'篮球',record:'4 分'})

  await enterCampus(page,'/en/')
  const english=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords())
  expect(english.raw).toEqual(chinese.raw)
  expect(english.view.games.find(game=>game.id==='basketball')).toMatchObject({label:'Basketball',record:'4 points'})
  expect(english.view.counts.objectTypes).toBe(1)
})

test('each locale loads only its own HUD text and functional blackboards',async({page})=>{
  await page.addInitScript(()=>performance.setResourceTimingBufferSize(2000))
  await enterCampus(page,'/en/')
  const englishGames=[
    ['basketball','two'],['pingPong','smash'],['longJump','far'],['bambooClimb','top'],
    ['hopscotch','complete'],['shuttlecock','record'],['jacks','complete'],['slingshot','hit'],
  ]
  for(const [game,phrase] of englishGames){
    await page.evaluate(nextGame=>window.__CAMPUS_TEST__.prepareArcadeComicHud(nextGame),game)
    await page.evaluate(([nextGame,nextPhrase])=>window.__CAMPUS_TEST__.playArcadeComicCelebration(nextGame,nextPhrase,'plain',900),[game,phrase])
    await expect.poll(()=>page.evaluate(nextGame=>window.__CAMPUS_TEST__.hud().arcadeComic.ready[nextGame],game)).toBe(true)
  }
  const english=await page.evaluate(()=>({
    ephemera:window.__CAMPUS_TEST__.schoolEphemera(),
    resources:performance.getEntriesByType('resource').map(entry=>new URL(entry.name).pathname),
  }))
  expect(english.ephemera).toMatchObject({locale:'en',uniqueTextures:30})
  expect(english.resources).toContain('/assets/ui/arcade-comic-v01/en/arcade-comic-score-v01.png')
  expect(english.resources).toContain('/assets/ui/arcade-comic-v01/en/arcade-comic-ping-pong-v01.png')
  expect(english.resources).toContain('/assets/textures/school-ephemera-runtime/blackboards/blackboard-newspaper-campus-guide-en-v01.webp')
  expect(english.resources).toContain('/assets/textures/school-ephemera-runtime/blackboards/blackboard-newspaper-development-process-en-v01.webp')
  expect(english.resources.some(path=>path==='/assets/ui/arcade-comic-v01/arcade-comic-score-v01.png')).toBe(false)
  expect(english.resources.some(path=>path.startsWith('/assets/ui/arcade-comic-v01/')&&!path.includes('/en/')&&!path.endsWith('/arcade-comic-bursts-v01.png'))).toBe(false)
  expect(english.resources.some(path=>path.endsWith('/blackboard-newspaper-campus-guide-v02.webp'))).toBe(false)
  expect(english.resources.filter(path=>path.startsWith('/assets/ui/arcade-comic-v01/en/')).sort()).toEqual([
    'bamboo-climb','basketball','hopscotch','jacks','long-jump','ping-pong','score','shuttlecock','slingshot',
  ].map(name=>`/assets/ui/arcade-comic-v01/en/arcade-comic-${name}-v01.png`).sort())

  await enterCampus(page,'/')
  const chineseButtons=await page.evaluate(()=>window.__CAMPUS_TEST__.setArcadeHudSample('shuttlecock',{streak:0,best:0}))
  expect(chineseButtons.footButtons).toEqual({left:{label:'左',key:'Q'},right:{label:'右',key:'E'}})
  await page.evaluate(()=>window.__CAMPUS_TEST__.playArcadeComicCelebration('pingPong','smash','hit',900))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic.ready.pingPong)).toBe(true)
  const chinese=await page.evaluate(()=>({
    ephemera:window.__CAMPUS_TEST__.schoolEphemera(),
    resources:performance.getEntriesByType('resource').map(entry=>new URL(entry.name).pathname),
  }))
  expect(chinese.ephemera).toMatchObject({locale:'zh-CN',uniqueTextures:30})
  expect(chinese.resources).toContain('/assets/ui/arcade-comic-v01/arcade-comic-score-v01.png')
  expect(chinese.resources).toContain('/assets/ui/arcade-comic-v01/arcade-comic-ping-pong-v01.png')
  expect(chinese.resources).toContain('/assets/textures/school-ephemera-runtime/blackboards/blackboard-newspaper-campus-guide-v02.webp')
  expect(chinese.resources).toContain('/assets/textures/school-ephemera-runtime/blackboards/blackboard-newspaper-development-process-v02.webp')
  expect(chinese.resources.some(path=>path.includes('/arcade-comic-v01/en/'))).toBe(false)
  expect(chinese.resources.some(path=>path.endsWith('-en-v01.webp'))).toBe(false)
})

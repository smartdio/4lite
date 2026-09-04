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

  await page.evaluate(()=>{
    window.__CAMPUS_TEST__.enterPingPongTable(0)
    return window.__CAMPUS_TEST__.startPingPongMatch()
  })
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong)).toMatchObject({visible:true,mode:'match'})
  const ping=await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('player','test-award'))
  expect(ping).toMatchObject({mode:'match',feedbackCode:'point-player',reasonCode:'test-award',feedback:'Point over',ui:{prompt:'Point over'}})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong)).toMatchObject({feedbackTitle:'POINT',feedbackDetail:'PLAYER +1'})
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitPingPong())

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

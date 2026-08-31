import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('bamboo climb alternates hands, grades charge and restores the player',async({page})=>{
  await boot(page)
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  const facility=await page.evaluate(()=>window.__CAMPUS_TEST__.b1NorthBambooClimb())
  expect(facility.bambooCenters).toEqual([[-12.278,-26.222],[-11.23,-26.278]])

  const entered=await page.evaluate(()=>window.__CAMPUS_TEST__.enterBambooClimb(0))
  expect(entered).toMatchObject({status:'active',phase:'aiming',side:'left',activePole:0,climbHeight:0,cameraHeight:1.45,cursorOnArrow:false})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'bambooClimb'})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().bambooClimb.visible)
  const hud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud())
  expect(hud.bambooClimb).toMatchObject({visible:true,side:'left',phase:'aiming',aim:[0,-.04],arrowCenter:[-.36,-.04],loaded:true})
  expect(hud.bambooClimb.exitBounds).not.toBeNull()

  const graded=[]
  for(const ratio of [.5,.75,.9,.96]){
    await page.evaluate(()=>window.__CAMPUS_TEST__.exitBambooClimb())
    await page.evaluate(()=>window.__CAMPUS_TEST__.enterBambooClimb(0))
    await page.evaluate(()=>window.__CAMPUS_TEST__.setBambooClimbCursor(-.36,-.04))
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.beginBambooClimbCharge())).toBe(true)
    graded.push(await page.evaluate(value=>window.__CAMPUS_TEST__.releaseBambooClimbCharge(value),ratio))
    if(ratio<.96)expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:true,game:'bambooClimb',phrase:'steady',kind:'plain',burstVisible:false,rootVisible:true})
  }
  expect(graded.map(result=>result.rise)).toEqual([.1563,.2344,.2813,.3])
  expect(graded.at(-1)).toMatchObject({perfect:true,side:'left'})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().bambooClimb.arcadeScore)).toMatchObject({rise:'+30',riseVisible:true})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:true,game:'bambooClimb',phrase:'power',kind:'hit',ready:{bambooClimb:true}})

  await page.evaluate(()=>window.__CAMPUS_TEST__.exitBambooClimb())
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterBambooClimb(1))
  await page.evaluate(()=>window.__CAMPUS_TEST__.setBambooClimbCursor(-.36,-.04))
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.beginBambooClimbCharge())).toBe(true)
  const failed=await page.evaluate(()=>window.__CAMPUS_TEST__.releaseBambooClimbCharge(1.01))
  expect(failed).toMatchObject({type:'bamboo-climb-failure',rise:0,side:'left'})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:true,game:'bambooClimb',phrase:'slip',secondaryPhrase:'again',kind:'plain',burstVisible:false,rootVisible:true})
  const retried=await page.evaluate(()=>window.__CAMPUS_TEST__.settleBambooClimb())
  expect(retried).toMatchObject({phase:'aiming',side:'left',failures:1,climbHeight:0})

  for(let index=0;index<11;index++){
    const side=await page.evaluate(()=>window.__CAMPUS_TEST__.bambooClimbGame().side)
    await page.evaluate(x=>window.__CAMPUS_TEST__.setBambooClimbCursor(x,-.04),side==='left'?-.36:.36)
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.beginBambooClimbCharge())).toBe(true)
    await page.evaluate(()=>window.__CAMPUS_TEST__.releaseBambooClimbCharge(.96))
    await page.evaluate(()=>window.__CAMPUS_TEST__.settleBambooClimb())
  }
  const complete=await page.evaluate(()=>window.__CAMPUS_TEST__.bambooClimbGame())
  expect(complete).toMatchObject({status:'active',phase:'complete',activePole:1,climbHeight:3.2,cameraHeight:4.65,lookTargetHeight:4.65,complete:true,failures:1,cursor:[0,-.04]})
  expect(complete.side).toBe('left')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:true,game:'bambooClimb',phrase:'top',kind:'major'})

  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.startBambooClimbSlide())).toBe(true)
  const sliding=await page.evaluate(()=>window.__CAMPUS_TEST__.stepBambooClimbSlide(.5))
  expect(sliding).toMatchObject({status:'active',phase:'sliding',cameraHeight:3.05,lookTargetHeight:3.7,complete:true,sliding:true})
  await page.evaluate(()=>window.__CAMPUS_TEST__.stepBambooClimbSlide(1))
  await page.waitForFunction(()=>!window.__CAMPUS_TEST__.hud().bambooClimb.visible)
  const restored=await page.evaluate(()=>({player:window.__CAMPUS_TEST__.player(),hud:window.__CAMPUS_TEST__.hud().bambooClimb}))
  expect(restored.player).toMatchObject({mode:'walk',x:before.x,y:before.y,z:before.z})
  expect(restored.hud.visible).toBe(false)
})

test('bamboo climb central reticle follows head aim and only charges on the active arrow',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterBambooClimb(0))
  const neutralRotation=await page.evaluate(()=>window.__CAMPUS_TEST__.controls().rotation)
  await page.evaluate(()=>window.__CAMPUS_TEST__.setBambooClimbCursor(.9,.8))
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.beginBambooClimbCharge())).toBe(false)
  const outside=await page.evaluate(()=>window.__CAMPUS_TEST__.bambooClimbGame())
  expect(outside.cursorOnArrow).toBe(false)
  await page.evaluate(()=>window.__CAMPUS_TEST__.setBambooClimbCursor(-.36,-.04))
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().bambooClimb.aim[0]===-.36)
  const aimed=await page.evaluate(()=>({rotation:window.__CAMPUS_TEST__.controls().rotation,hud:window.__CAMPUS_TEST__.hud().bambooClimb}))
  expect(Math.abs(aimed.rotation[1]-neutralRotation[1])).toBeGreaterThan(.05)
  expect(Math.abs(aimed.rotation[2]-neutralRotation[2])).toBeGreaterThan(.02)
  expect(aimed.hud.aim).toEqual([-.36,-.04])
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.beginBambooClimbCharge())).toBe(true)
})

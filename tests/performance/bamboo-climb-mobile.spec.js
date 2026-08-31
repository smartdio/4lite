import {expect,test} from '@playwright/test'

test.use({viewport:{width:375,height:667},deviceScaleFactor:2,isMobile:true,hasTouch:true})

test('touching the active bamboo arrow charges and climbs without walking controls',async({page})=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterBambooClimb(0))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().bambooClimb.visible)).toBe(true)
  await expect(page.locator('#touch-controls')).toBeVisible()
  await expect(page.locator('#touch-joystick')).toHaveCSS('pointer-events','none')

  const arrow={x:375*.32,y:667*.5}
  await page.locator('#touch-look-zone').dispatchEvent('pointerdown',{...arrow,clientX:arrow.x,clientY:arrow.y,pointerId:41,pointerType:'touch',button:0,isPrimary:true})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.bambooClimbGame().phase)).toBe('charging')
  await page.waitForTimeout(360)
  await page.locator('#touch-look-zone').dispatchEvent('pointerup',{...arrow,clientX:arrow.x,clientY:arrow.y,pointerId:41,pointerType:'touch',button:0,isPrimary:true})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.bambooClimbGame().phase)).toBe('rising')
  const result=await page.evaluate(()=>window.__CAMPUS_TEST__.bambooClimbGame())
  expect(result.climbHeight).toBeGreaterThan(.1)
  expect(result.climbHeight).toBeLessThan(.5)
})

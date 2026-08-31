import {expect,test} from '@playwright/test'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('classroom ambient light rises and returns smoothly without affecting outdoor seats',async({page})=>{
  await ready(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.lighting())).toMatchObject({
    hemisphere:1.3,hemisphereTarget:1.3,hemisphereOutdoor:1.3,hemisphereIndoor:1.68,indoorBoostActive:false,
  })

  const seating=await page.evaluate(()=>window.__CAMPUS_TEST__.classroomSeating())
  expect(await page.evaluate(id=>window.__CAMPUS_TEST__.sitClassroomSeat(id),seating.sampleBench.id)).toBe(true)
  await page.waitForTimeout(900)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.lighting())).toMatchObject({
    hemisphereTarget:1.3,indoorBoostActive:false,
  })

  await page.evaluate(()=>window.__CAMPUS_TEST__.leaveClassroomSeat())
  expect(await page.evaluate(id=>window.__CAMPUS_TEST__.sitClassroomSeat(id),seating.sampleStool.id)).toBe(true)
  await page.waitForTimeout(120)
  const transitioning=await page.evaluate(()=>window.__CAMPUS_TEST__.lighting())
  expect(transitioning.indoorBoostActive).toBe(true)
  expect(transitioning.hemisphere).toBeGreaterThan(1.3)
  expect(transitioning.hemisphere).toBeLessThan(1.68)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.lighting().hemisphere)).toBeCloseTo(1.68,2)

  await page.evaluate(()=>window.__CAMPUS_TEST__.leaveClassroomSeat())
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.lighting())).toMatchObject({
    hemisphere:1.3,hemisphereTarget:1.3,indoorBoostActive:false,
  })
})

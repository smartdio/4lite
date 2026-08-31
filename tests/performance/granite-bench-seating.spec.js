import {expect,test} from '@playwright/test'

test('b1 north granite benches reuse the classroom seating interaction',async({page})=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())

  const seating=await page.evaluate(()=>window.__CAMPUS_TEST__.classroomSeating())
  expect(seating).toMatchObject({benches:3,seated:null})
  expect(seating.ids.filter(id=>id.startsWith('b1-north-east-granite-bench-'))).toHaveLength(3)
  expect(seating.sampleBench).toMatchObject({
    id:'b1-north-east-granite-bench-1-seat',
    center:[-18.25,.34,-26.15],
    facing:[0,-1],
  })

  expect(await page.evaluate(id=>window.__CAMPUS_TEST__.sitClassroomSeat(id),seating.sampleBench.id)).toBe(true)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().seated)).toMatchObject({
    seatId:seating.sampleBench.id,
    classroom:null,
  })
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.player())).mode).toBe('seated')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.leaveClassroomSeat())).toBe(true)
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.player())).mode).toBe('walk')
})

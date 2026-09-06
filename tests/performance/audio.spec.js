import {expect,test} from '@playwright/test'
import {EXPECTED_DECODED_AUDIO_URLS} from './expected-runtime-resources.js'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  await page.evaluate(()=>window.__CAMPUS_TEST__.birdPause(true))
  await page.waitForTimeout(1000)
}

test('shared audio lifecycle cleans every interaction group after playback',async({page})=>{
  await ready(page)
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.audio())
  expect(before).toMatchObject({decoded:EXPECTED_DECODED_AUDIO_URLS,loading:0,failures:0,activeVoices:0})
  expect(before.groups).toEqual(expect.arrayContaining(['longJumpTakeoff','longJumpAir','longJumpLand']))

  await page.evaluate(async groups=>{
    for(const group of groups) {
      window.__CAMPUS_TEST__.playAudio(group,{volume:.01})
      await new Promise(resolve=>setTimeout(resolve,80))
    }
  },before.groups)
  await page.waitForTimeout(1200)

  const after=await page.evaluate(()=>window.__CAMPUS_TEST__.audio())
  const started=after.plays-before.plays
  expect(started).toBe(before.groups.length)
  expect(after.completed-before.completed).toBe(started)
  expect(after.cleaned-before.cleaned).toBe(started)
  expect(after).toMatchObject({activeVoices:0,activeByGroup:{},failures:0})
  expect(after.peakVoices).toBeLessThanOrEqual(after.limits.global)
})

test('shared voice limits contain bursty basketball, chalk, and ping-pong sounds',async({page})=>{
  await ready(page)
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.audio())
  const groups=['basketballBounce','chalkImpact','pingPongTable']

  const accepted=await page.evaluate(groups=>{
    const results=[]
    for(const group of groups)for(let index=0;index<30;index++)results.push(window.__CAMPUS_TEST__.playAudio(group,{volume:.01}))
    return results.filter(Boolean).length
  },groups)
  const burst=await page.evaluate(()=>window.__CAMPUS_TEST__.audio())
  expect(accepted).toBe(groups.length*burst.limits.perGroup)
  expect(burst.activeVoices).toBe(accepted)
  expect(burst.activeVoices).toBeLessThanOrEqual(burst.limits.global)
  expect(burst.dropped-before.dropped).toBe(groups.length*(30-burst.limits.perGroup))

  await page.waitForTimeout(1200)
  const settled=await page.evaluate(()=>window.__CAMPUS_TEST__.audio())
  expect(settled.activeVoices).toBe(0)
  expect(settled.cleaned-before.cleaned).toBe(settled.plays-before.plays)
})

test('north pond frogs stay near building 2 and pan toward the north-side windows',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-36,-54.3,-35,-54.3,.3))
  await page.waitForTimeout(1400)
  const facingEast=await page.evaluate(()=>window.__CAMPUS_TEST__.audio().ambient.frogs)
  expect(facingEast.volume).toBeGreaterThan(.7)
  expect(facingEast.pan).toBeLessThan(-.35)

  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-36,-54.3,-37,-54.3,.3))
  await page.waitForTimeout(1400)
  const facingWest=await page.evaluate(()=>window.__CAMPUS_TEST__.audio().ambient.frogs)
  expect(facingWest.pan).toBeGreaterThan(.35)

  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-36,-54.3,-37,-54.3,3.4))
  await page.waitForTimeout(1400)
  const secondFloor=await page.evaluate(()=>window.__CAMPUS_TEST__.audio().ambient.frogs)
  expect(secondFloor.volume).toBeLessThan(facingWest.volume*.65)

  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-36,-54.3,-37,-54.3,6.5))
  await page.waitForTimeout(1400)
  const thirdFloor=await page.evaluate(()=>window.__CAMPUS_TEST__.audio().ambient.frogs)
  expect(thirdFloor.volume).toBeLessThan(secondFloor.volume*.65)

  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-36,-45,-36,-46,.3))
  await page.waitForTimeout(1200)
  const outsideBuilding2=await page.evaluate(()=>window.__CAMPUS_TEST__.audio().ambient.frogs)
  expect(outsideBuilding2.volume).toBeLessThan(.01)

  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-2.5,-2.6,-2.5,-3.6,0))
  await page.waitForTimeout(1800)
  const farAway=await page.evaluate(()=>window.__CAMPUS_TEST__.audio().ambient.frogs)
  expect(farAway.volume).toBeLessThan(.01)
})

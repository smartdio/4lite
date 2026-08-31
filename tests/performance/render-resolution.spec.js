import {expect,test} from '@playwright/test'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('SMAA uses the raised desktop resolution and every WebGL buffer stays within the 2K cap',async({page})=>{
  await ready(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.postProcessing())).toMatchObject({
    gtaoEnabled:true,smaaEnabled:true,
  })
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.lighting().shadowBounds)).toEqual([-60,60,-60,60])

  const initial=await page.evaluate(()=>window.__CAMPUS_TEST__.performanceSnapshot())
  expect(initial.buffers).toMatchObject({
    css:[1280,720],drawing:[1280,720],composer:[1120,630],
    rendererDpr:1,composerDpr:.875,maxDrawingBuffer:{longEdge:2560,shortEdge:1440},
  })

  await page.setViewportSize({width:3840,height:2160})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.performanceSnapshot().buffers)).toMatchObject({
    css:[3840,2160],drawing:[2560,1440],composer:[2560,1440],
    rendererDpr:2/3,composerDpr:2/3,maxDrawingBuffer:{longEdge:2560,shortEdge:1440},
  })

  const portrait=await page.evaluate(()=>window.__CAMPUS_TEST__.renderResolutionPolicy(2160,3840,2))
  expect(portrait).toMatchObject({
    drawing:[1440,2560],composer:[1440,2560],rendererDpr:2/3,composerDpr:2/3,
  })
})

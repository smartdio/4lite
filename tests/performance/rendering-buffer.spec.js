import {expect,test} from '@playwright/test'

test('renderer releases its back buffer while explicit frame capture remains available',async({page})=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())

  const result=await page.evaluate(()=>{
    const profile=window.__CAMPUS_TEST__.performanceProfile()
    const frame=window.__CAMPUS_TEST__.captureFrame()
    return {
      preserveDrawingBuffer:profile.renderer.preserveDrawingBuffer,
      pngPrefix:frame.slice(0,22),
      pngLength:frame.length,
    }
  })

  expect(result.preserveDrawingBuffer).toBe(false)
  expect(result.pngPrefix).toBe('data:image/png;base64,')
  expect(result.pngLength).toBeGreaterThan(100_000)
})

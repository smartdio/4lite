import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('document viewer uses only the shared close control or X',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.focusViewableDocument('composition-future-world-v01'))
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.openViewableDocument())
  expect(state).toMatchObject({active:'composition-future-world-v01',activeKind:'composition',decodedTextures:1})
  expect(state.closeBounds).not.toBeNull()
  expect(await page.evaluate(()=>document.body.classList.contains('viewer-open'))).toBe(true)
  expect(await page.locator('canvas').evaluate(node=>getComputedStyle(node).cursor)).toBe('default')

  await page.mouse.click(640,360)
  await page.keyboard.press('Escape')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer().active)).toBe('composition-future-world-v01')
  await page.keyboard.press('KeyX')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer())).toMatchObject({active:null,decodedTextures:0})
  expect(await page.evaluate(()=>document.body.classList.contains('viewer-open'))).toBe(false)

  await page.evaluate(()=>window.__CAMPUS_TEST__.focusViewableDocument('workbook-cover-language-v01'))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.openViewableDocument())
  const bounds=state.closeBounds
  await page.mouse.click((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer())).toMatchObject({active:null,decodedTextures:0})
})

test('document close control remains touchable in portrait without background dismissal',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
  const page=await context.newPage();await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.focusViewableDocument('comic-dadi-enqing-01'))
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.openViewableDocument())
  const bounds=state.closeBounds
  expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(390);expect(bounds.bottom).toBeLessThanOrEqual(844)
  await page.touchscreen.tap(195,422)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer().active)).toBe('comic-dadi-enqing-01')
  await page.touchscreen.tap((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer().active)).toBeNull()
  await context.close()
})

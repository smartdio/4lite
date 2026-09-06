import {test,expect} from '@playwright/test'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle'})
  await page.locator('#enter-campus').click()
  await page.locator('body.walking').waitFor()
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}
const moveWithKeyboard=async page=>{
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-7,-34,-7,-38))
  await page.keyboard.down('w')
  try{await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.player().z)).toBeLessThan(-34.5)}
  finally{await page.keyboard.up('w')}
}

test('a rejected pointer lock restores real keyboard, drag look and click-to-walk input',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(()=>{
    Element.prototype.requestPointerLock=()=>Promise.reject(new DOMException('Embedded document cannot lock the pointer','WrongDocumentError'))
  })
  await ready(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({fallback:true,pointerLocked:false,pointerLockAvailable:false})
  await moveWithKeyboard(page)
  const rotation=await page.evaluate(()=>window.__CAMPUS_TEST__.controls().rotation)
  await page.mouse.move(620,350);await page.mouse.down();await page.mouse.move(700,380,{steps:8});await page.mouse.up()
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().rotation)).not.toEqual(rotation)
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-7,-34,-7,-38,0,0))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.markerVisible)).toBe(true)
  await page.mouse.click(640,360)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.moving)).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.player().z)).toBeLessThan(-34.5)
  await page.mouse.click(640,360)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.locomotion().pointWalk.moving)).toBe(false)
  expect(errors).toEqual([])
})

test('a browser that never completes its first lock request still allows walking',async({page})=>{
  await page.addInitScript(()=>{Element.prototype.requestPointerLock=()=>new Promise(()=>{})})
  await ready(page)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().fallback)).toBe(true)
  await moveWithKeyboard(page)
})

test('a previously successful lock can retry after a transient rejection',async({page})=>{
  await ready(page)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().pointerLocked)).toBe(true)
  await moveWithKeyboard(page)
  await page.evaluate(()=>{
    window.__originalPointerRequest=Element.prototype.requestPointerLock
    Element.prototype.requestPointerLock=()=>Promise.reject(new DOMException('Try again after Esc','NotAllowedError'))
    document.exitPointerLock()
  })
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().pointerLocked)).toBe(false)
  await page.mouse.click(640,360)
  await page.waitForTimeout(100)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({fallback:false,pointerLockAvailable:true,pointerLocked:false})
  await page.evaluate(()=>{Element.prototype.requestPointerLock=window.__originalPointerRequest})
  await page.mouse.click(640,360)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().pointerLocked)).toBe(true)
  await moveWithKeyboard(page)
})

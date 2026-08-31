import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
}

test('personal records deduplicate discoveries and keep exactly three mystery tasks',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.clearPersonalRecords())

  await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__
    api.recordPersonalRoom('b1-west-room-floor-1')
    api.recordPersonalRoom('b1-west-room-floor-1')
    api.recordPersonalRoom('b2-room-3-floor-1')
    api.recordPersonalDocument({id:'book-math-01',kind:'textbook',sourceId:'desk-a'})
    api.recordPersonalDocument({id:'book-math-01',kind:'textbook',sourceId:'desk-b'})
    api.recordPersonalDocument({id:'composition-01',kind:'composition',sourceId:'desk-c'})
    api.recordPersonalObject({id:'pencil-box-a',kind:'pencil-box',variant:'red'})
    api.recordPersonalObject({id:'pencil-box-b',kind:'pencil-box',variant:'red'})
    api.recordPersonalObject({id:'pencil-box-c',kind:'pencil-box',variant:'blue'})
    api.recordPersonalSnackBag('snack-a')
    api.recordPersonalSnackBag('snack-a')
    api.recordPersonalSnackBag('snack-b')
  })
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords())
  expect(state.view.counts).toMatchObject({rooms:2,books:1,compositions:1,objectTypes:2,objectInstances:3,mysteries:0})
  expect(state.view.mysteries).toHaveLength(3)
  expect(state.view.mysteries[0]).toMatchObject({id:'snackBags',found:false,progress:2,total:3})
  expect(state.view.games.filter(game=>game.hidden).map(game=>game.label)).toEqual(['神秘掌机','神秘掌机'])

  await page.evaluate(()=>window.__CAMPUS_TEST__.recordPersonalSnackBag('snack-c'))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.recordPersonalMysteryDevice('handheldOctopus'))
  expect(state.view.counts.mysteries).toBe(2)
  expect(state.view.mysteries[0]).toMatchObject({found:true,progress:3,total:3})
  expect(state.view.games.find(game=>game.id==='handheldOctopus')).toMatchObject({label:'Octopus 掌机',hidden:false})
  expect(state.view.games.find(game=>game.id==='handheldFire')).toMatchObject({label:'神秘掌机',hidden:true})
})

test('personal game records retain best max and min values across reloads',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.clearPersonalRecords())
  await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__
    api.recordPersonalGame('longJump',{max:{maxDistance:1.82}})
    api.recordPersonalGame('longJump',{max:{maxDistance:1.57}})
    api.recordPersonalGame('rubiksCube',{min:{fewestMoves:48},increment:{completions:1}})
    api.recordPersonalGame('rubiksCube',{min:{fewestMoves:63},increment:{completions:1}})
    api.recordPersonalGame('basketball',{max:{bestPoints:6}})
    api.recordPersonalGame('basketball',{max:{bestPoints:3}})
  })
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords())
  expect(state.view.counts.games).toBe(3)
  expect(state.view.games.find(game=>game.id==='longJump')).toMatchObject({record:'1.82 米',metrics:{maxDistance:1.82}})
  expect(state.view.games.find(game=>game.id==='rubiksCube')).toMatchObject({record:'最少 48 步完成',metrics:{fewestMoves:48,completions:2}})
  expect(state.view.games.find(game=>game.id==='basketball')).toMatchObject({record:'6 分',metrics:{bestPoints:6}})

  await page.reload({waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords())
  expect(state.view.counts.games).toBe(3)
  expect(state.view.games.find(game=>game.id==='longJump').metrics.maxDistance).toBe(1.82)
  expect(state.view.persistence.storage).toBe('localStorage')
  expect(state.view.persistence.persistedNamespaces).toContain('personalRecords')
})

test('the WebGL record book exposes pause menu and three approved pages',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.clearPersonalRecords())
  let book=await page.evaluate(()=>window.__CAMPUS_TEST__.openPersonalRecordMenu())
  expect(book).toMatchObject({active:true,mode:'menu',drawObjects:2})
  expect(book.actions.map(item=>item.action)).toEqual(['resume','open-book'])

  book=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecordAction('open-book'))
  expect(book).toMatchObject({active:true,mode:'book',page:'overview',drawObjects:2})
  expect(book.actions.map(item=>item.action)).toEqual(expect.arrayContaining(['tab:overview','tab:games','tab:mysteries','close']))
  const uploads=book.canvasTextureUploads

  book=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecordAction('tab:games'))
  expect(book.page).toBe('games')
  expect(book.canvasTextureUploads).toBe(uploads+1)
  book=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecordAction('tab:mysteries'))
  expect(book.page).toBe('mysteries')
  expect(book.viewModel.mysteries).toHaveLength(3)

  book=await page.evaluate(()=>window.__CAMPUS_TEST__.closePersonalRecordBook())
  expect(book).toMatchObject({active:false,drawObjects:0})
})

test.describe('top-right personal record button',()=>{
  test.use({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})

  test('sits beside the view button, opens the book directly and hides movement controls',async({page})=>{
    await boot(page)
    await page.locator('#enter-campus').click()
    await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
    await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().personalRecordVisible)).toBe(true)
    const hud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud())
    expect(hud.personalRecordLabel).toBe('个人记录')
    expect(hud.personalRecordBounds.right).toBeLessThan(hud.viewToggleBounds.left)
    const entry=hud.personalRecordBounds
    await page.touchscreen.tap((entry.left+entry.right)/2,(entry.top+entry.bottom)/2)
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().book.mode)).toBe('book')
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().touchControlsVisible)).toBe(false)
    await expect.poll(()=>page.locator('#touch-controls').evaluate(node=>getComputedStyle(node).opacity)).toBe('0')

    const close=await page.evaluate(()=>{
      const book=window.__CAMPUS_TEST__.personalRecords().book,action=book.actions.find(item=>item.action==='close')
      return{x:book.displayBounds.left+(action.left+action.right)/2/book.canvas[0]*book.displayBounds.width,y:book.displayBounds.top+(action.top+action.bottom)/2/book.canvas[1]*book.displayBounds.height}
    })
    await page.touchscreen.tap(close.x,close.y)
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().book.active)).toBe(false)
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().touchControlsVisible)).toBe(true)
  })
})

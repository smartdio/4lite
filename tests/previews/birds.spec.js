import {test,expect} from '@playwright/test'

test.beforeEach(async({page})=>{
  await page.goto('/previews/birds-v01/')
  await page.waitForFunction(()=>window.__BIRD_PREVIEW__)
})

test('one complete GLB, two shared templates, independent preview and no runtime integration',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  const state=await page.evaluate(()=>window.__BIRD_PREVIEW__.snapshot())
  expect(state.library.species.sparrow.triangles).toBeLessThanOrEqual(600)
  expect(state.library.species.pigeon.triangles).toBeLessThanOrEqual(900)
  expect(state.library).toMatchObject({materials:1,textures:0,geometries:18})
  for(const name of ['pigeon','sparrow','pigeon','sparrow'])await page.locator(`[data-species="${name}"]`).click()
  const result=await page.evaluate(()=>({state:window.__BIRD_PREVIEW__.snapshot(),resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('.glb')).map(e=>e.name)}))
  expect(result.resources).toHaveLength(1)
  expect(result.state.assets.requests).toBe(1)
  expect(result.state.productionIntegrated).toBe(false)
  expect(result.state.renderer.calls).toBeLessThan(30)
  expect(errors).toEqual([])
})

test('pause, seek and replay operate on a stable scene clock',async({page})=>{
  await page.locator('#pause').click()
  const before=await page.evaluate(()=>window.__BIRD_PREVIEW__.snapshot())
  await page.waitForTimeout(250)
  expect((await page.evaluate(()=>window.__BIRD_PREVIEW__.snapshot())).time).toBe(before.time)
  await page.locator('#timeline').fill('400')
  const scrubbed=await page.evaluate(()=>window.__BIRD_PREVIEW__.snapshot())
  expect(scrubbed.paused).toBe(true)
  expect(scrubbed.state).toContain('飞行')
  await page.locator('#replay').click()
  await expect.poll(async()=>page.evaluate(()=>window.__BIRD_PREVIEW__.snapshot().time)).toBeGreaterThan(4)
  expect((await page.evaluate(()=>window.__BIRD_PREVIEW__.snapshot())).paused).toBe(false)
})

test('both species cross launch, landing and loop boundaries without jumps',async({page})=>{
  const result=await page.evaluate(()=>{
    const api=window.__BIRD_PREVIEW__,report=[]
    api.pause(true)
    for(const species of ['sparrow','pigeon']){
      api.select(species)
      for(const boundary of api.snapshot().boundaries){
        api.seek(boundary-.0001);const a=api.snapshot()
        api.seek(boundary+.0001);const b=api.snapshot()
        const position=Math.hypot(...a.position.map((v,i)=>v-b.position[i]))
        const angle=Math.max(...a.rotation.slice(0,3).map((v,i)=>Math.abs(Math.atan2(Math.sin(v-b.rotation[i]),Math.cos(v-b.rotation[i])))))
        report.push({species,boundary,position,angle})
      }
    }
    return report
  })
  for(const row of result){expect(row.position,JSON.stringify(row)).toBeLessThan(.002);expect(row.angle,JSON.stringify(row)).toBeLessThan(.02)}
})

test('desktop and portrait mobile controls fit and range switch works',async({page})=>{
  for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
    await page.setViewportSize(viewport)
    await page.locator('[data-species="pigeon"]').click()
    await page.locator('[data-view="walk"]').click()
    const layout=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
      canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),state:window.__BIRD_PREVIEW__.snapshot()}))
    expect(layout.overflow).toBe(false)
    expect(layout.canvas.width).toBeGreaterThan(300)
    expect(layout.canvas.height).toBeGreaterThan(300)
    expect(layout.state.view).toBe('walk')
    await page.locator('[data-view="detail"]').click()
    await expect(page.locator('#pause')).toBeInViewport()
    await expect(page.locator('#timeline')).toBeInViewport()
  }
})

test('touch drag rotates the model view without scrolling the mobile page',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  const page=await context.newPage()
  try{
    await page.goto('http://127.0.0.1:6184/previews/birds-v01/')
    await page.waitForFunction(()=>window.__BIRD_PREVIEW__)
    await page.locator('#pause').tap()
    const before=await page.evaluate(()=>window.__BIRD_PREVIEW__.snapshot().camera.position)
    const cdp=await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:350,id:1}]})
    for(let x=200;x<=260;x+=10)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:365,id:1}]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await expect.poll(async()=>page.evaluate(start=>Math.hypot(...window.__BIRD_PREVIEW__.snapshot().camera.position.map((n,i)=>n-start[i])),before)).toBeGreaterThan(.1)
    expect(await page.evaluate(()=>scrollY)).toBe(0)
  }finally{await context.close()}
})

test('missing review GLB leaves an explicit error instead of an empty successful preview',async({page})=>{
  await page.route('**/campus-birds-v01.glb*',route=>route.fulfill({status:404,body:'missing review asset'}))
  await page.reload()
  await expect(page.locator('#loading')).toContainText('小鸟暂时没有准备好', {timeout:10000})
  expect(await page.evaluate(()=>Boolean(window.__BIRD_PREVIEW__))).toBe(false)
})

import {expect,test} from '@playwright/test'
import {EXPECTED_SCENE_ASSET_TASK_IDS,EXPECTED_UNIQUE_GLB_URLS} from './expected-runtime-resources.js'

const isGltfRequest=url=>url.includes('.glb?')||url.endsWith('.glb')
test('the gate waits for every full-detail asset and one failed request retries',async({page})=>{
  const gltfRequests=[]
  const consoleErrors=[]
  let injectedFailure=false

  page.on('request',request=>{
    if(isGltfRequest(request.url()))gltfRequests.push(request.url())
  })
  page.on('console',message=>{
    if(message.type()==='error')consoleErrors.push(message.text())
  })
  await page.route('**/*.glb*',async route=>{
    const url=route.request().url()
    if(!injectedFailure&&url.includes('building-opening-shared-textures-v01.glb')) {
      injectedFailure=true
      await route.abort('failed')
      return
    }
    await new Promise(resolve=>setTimeout(resolve,url.includes('/teacher-dormitory/')?1200:60))
    await route.continue()
  })

  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  expect(gltfRequests).toEqual([])
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.loadingState())).toMatchObject({
    started:false,ready:false,fullReady:false,
  })

  await page.locator('#enter-campus').click()
  await page.waitForTimeout(400)
  await expect(page.locator('#experience-gate')).toBeVisible()
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.loadingState())).toMatchObject({started:true,ready:false,fullReady:false,total:EXPECTED_SCENE_ASSET_TASK_IDS.length,taskIds:EXPECTED_SCENE_ASSET_TASK_IDS})

  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  const completed=await page.evaluate(()=>({
    loading:window.__CAMPUS_TEST__.loadingState(),
    registry:window.__CAMPUS_TEST__.assetRegistry(),
    models:window.__CAMPUS_TEST__.modelDetailAudit(),
  }))
  expect(completed.loading).toMatchObject({ready:true,fullReady:true,completed:EXPECTED_SCENE_ASSET_TASK_IDS.length,total:EXPECTED_SCENE_ASSET_TASK_IDS.length,taskIds:EXPECTED_SCENE_ASSET_TASK_IDS,physical:{active:0,failures:[]}})
  expect(new Set(gltfRequests.map(url=>new URL(url).pathname)).size).toBe(EXPECTED_UNIQUE_GLB_URLS)
  expect(completed.registry.retries).toBe(1)
  expect(completed.registry.failures).toBe(1)
  expect(completed.registry.peakConcurrent).toBeLessThanOrEqual(4)
  expect(completed.registry.queue).toEqual({active:0,pending:0,maxConcurrent:4})
  expect(completed.models).toEqual({lodEnabled:false,strategy:'single-full-detail-models',lodObjects:0})
  expect(consoleErrors.filter(message=>!message.includes('net::ERR_FAILED'))).toEqual([])
  expect(consoleErrors.filter(message=>message.includes('net::ERR_FAILED'))).toHaveLength(1)
})

test('save-data and 2g still wait for the same complete scene',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{
    configurable:true,value:{saveData:true,effectiveType:'2g'},
  }))
  const gltfRequests=[]
  page.on('request',request=>{if(isGltfRequest(request.url()))gltfRequests.push(request.url())})
  await page.route('**/concrete-slide-game-optimized-v01.glb*',async route=>{
    await new Promise(resolve=>setTimeout(resolve,1000))
    await route.continue()
  })
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.waitForTimeout(350)
  await expect(page.locator('#experience-gate')).toBeVisible()
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.loadingState())).toMatchObject({ready:false,fullReady:false})
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  const loaded=await page.evaluate(()=>window.__CAMPUS_TEST__.loadingState())
  expect(loaded).toMatchObject({ready:true,fullReady:true,completed:EXPECTED_SCENE_ASSET_TASK_IDS.length,total:EXPECTED_SCENE_ASSET_TASK_IDS.length,taskIds:EXPECTED_SCENE_ASSET_TASK_IDS,physical:{active:0,failures:[]}})
  expect(new Set(gltfRequests.map(url=>new URL(url).pathname)).size).toBe(EXPECTED_UNIQUE_GLB_URLS)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.modelDetailAudit())).toEqual({
    lodEnabled:false,strategy:'single-full-detail-models',lodObjects:0,
  })
})

test('a required scene texture failure keeps the loading gate closed',async({page})=>{
  await page.route('**/blackboard-erased-chalk-a-v02.jpg',route=>route.abort('failed'))
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#loading-retry')).toBeVisible({timeout:120000})
  await expect(page.locator('#experience-gate')).toBeVisible()
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.loadingState())
  expect(state).toMatchObject({started:true,ready:false,fullReady:false,completed:EXPECTED_SCENE_ASSET_TASK_IDS.length,total:EXPECTED_SCENE_ASSET_TASK_IDS.length,taskIds:EXPECTED_SCENE_ASSET_TASK_IDS})
  expect(state.physical.active).toBe(0)
  expect(state.physical.failures.some(url=>url.includes('blackboard-erased-chalk-a-v02.jpg'))).toBe(true)
})

test('KTX2 pilot selects a compressed GPU texture and falls back after retry',async({page})=>{
  const responses=[]
  page.on('response',response=>{
    const url=response.url()
    if(url.includes('.ktx2')||url.includes('basis_transcoder'))responses.push({url,headers:response.headers()})
  })
  await page.goto('/?ktx2Pilot=1',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  const selected=await page.evaluate(()=>({texture:window.__CAMPUS_TEST__.sharedSandTexture(),registry:window.__CAMPUS_TEST__.assetRegistry()}))
  expect(selected.texture.pilot).toMatchObject({requested:true,selected:'ktx2',fallbackReason:null})
  expect(selected.texture.pilot.gpuFormat.compressed).toBe(true)
  expect(selected.texture.pilot.gpuFormat.mipmaps).toBeGreaterThan(1)
  expect(selected.texture.sourceFormats).toEqual(['ktx2'])
  expect(selected.registry.ktx2.initialized).toBe(true)
  expect(selected.registry.entries.filter(entry=>entry.kind==='ktx2')).toHaveLength(1)
  expect(responses.some(item=>item.url.includes('.ktx2')&&item.headers['content-type']==='image/ktx2')).toBe(true)
  expect(responses.some(item=>item.url.includes('.wasm')&&item.headers['content-type']==='application/wasm')).toBe(true)
  for(const cameraName of ['mainField','activity']) {
    await page.evaluate(name=>window.__CAMPUS_TEST__.applyFixedCamera(name),cameraName)
    await page.waitForTimeout(150)
    await expect(page.locator('canvas')).toHaveScreenshot(`${cameraName}.png`)
  }

  const fallbackPage=await page.context().newPage()
  let failures=0
  await fallbackPage.route('**/*.ktx2*',route=>{failures++;return route.abort('failed')})
  await fallbackPage.goto('/?ktx2Pilot=1',{waitUntil:'networkidle',timeout:120000})
  await fallbackPage.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await fallbackPage.locator('#enter-campus').click()
  await fallbackPage.evaluate(()=>window.__CAMPUS_TEST__.ready())
  const fallback=await fallbackPage.evaluate(()=>({texture:window.__CAMPUS_TEST__.sharedSandTexture(),registry:window.__CAMPUS_TEST__.assetRegistry()}))
  expect(failures).toBe(2)
  expect(fallback.texture.pilot.requested).toBe(true)
  expect(fallback.texture.pilot.selected).toBe('webp-fallback')
  expect(fallback.texture.pilot.fallbackReason).toBeTruthy()
  expect(fallback.texture.sourceFormats).toEqual(['webp-fallback'])
  expect(fallback.registry.retries).toBe(1)
  expect(fallback.registry.failures).toBe(2)
  await fallbackPage.close()
})

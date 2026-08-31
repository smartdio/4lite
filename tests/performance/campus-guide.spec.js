import {expect,test} from '@playwright/test'

test('passage blackboards carry the campus guide and interactive development story',async({page})=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())

  const ephemera=await page.evaluate(()=>window.__CAMPUS_TEST__.schoolEphemera())
  expect(ephemera).toMatchObject({
    status:'loaded',uniqueTextures:30,drawObjects:30,placements:{campusGuide:1,developmentProcess:1},
    campusGuide:{textureSize:[1920,512],placementSize:[4.5,1.2]},
    developmentProcess:{textureSize:[1920,512],placementSize:[4.5,1.2]},
  })
  expect(ephemera.decodedBytesWithMipmaps).toBeLessThanOrEqual(34.7*1024*1024)
  const campusGuideResources=await page.evaluate(()=>performance.getEntriesByType('resource')
    .map(item=>item.name).filter(url=>url.includes('blackboard-newspaper-campus-guide-v02')))
  expect(campusGuideResources).toHaveLength(1)
  expect(campusGuideResources[0]).toContain('blackboard-newspaper-campus-guide-v02.webp')
  expect(ephemera.assignments).toContainEqual({
    id:'b1-passage-west-campus-guide',assetId:'campus-guide',category:'campusGuide',group:null,
  })
  expect(ephemera.assignments).toContainEqual({
    id:'b1-passage-east-development-process',assetId:'development-process',category:'developmentProcess',group:null,
  })
  const developmentResources=await page.evaluate(()=>performance.getEntriesByType('resource')
    .map(item=>item.name).filter(url=>url.includes('blackboard-newspaper-development-process-v02')))
  expect(developmentResources).toHaveLength(1)
  expect(developmentResources[0]).toContain('blackboard-newspaper-development-process-v02.webp')
  for(const office of ['b1-main-room-2-floor-1','b2-room-4-floor-1'])expect(
    ephemera.assignments.filter(item=>item.id.startsWith(`${office}-office-portrait-`)),
  ).toEqual([
    {id:`${office}-office-portrait-1`,assetId:'office-portrait-engels-v01',category:'officePortraits',group:null},
    {id:`${office}-office-portrait-2`,assetId:'office-portrait-marx-v01',category:'officePortraits',group:null},
    {id:`${office}-office-portrait-3`,assetId:'office-portrait-mao-v01',category:'officePortraits',group:null},
    {id:`${office}-office-portrait-4`,assetId:'office-portrait-zhou-v01',category:'officePortraits',group:null},
  ])
  await expect(page.evaluate(()=>window.__CAMPUS_TEST__.focusCampusGuide())).resolves.toMatchObject({
    id:'b1-passage-west-campus-guide',distance:1.8,
  })
  await expect(page.evaluate(()=>window.__CAMPUS_TEST__.focusDevelopmentProcess())).resolves.toMatchObject({
    id:'b1-passage-east-development-process',distance:2.2,
  })

  const drawing=await page.evaluate(()=>window.__CAMPUS_TEST__.blackboardDrawing())
  expect(drawing).toMatchObject({targets:22,blockedTargets:2,active:null})
  expect(drawing.passageBoards).toEqual([
    {id:'b1-passage-west',writable:false},{id:'b1-passage-east',writable:false},
  ])
  expect(drawing.ids).not.toContain('b1-passage-west')
  expect(drawing.ids).not.toContain('b1-passage-east')
  for(const side of ['west','east']) {
    const focused=await page.evaluate(value=>window.__CAMPUS_TEST__.focusPassageBlackboard(value),side)
    expect(focused).toMatchObject({id:`b1-passage-${side}`,writable:false,drawingHit:null})
    await page.mouse.click(640,360)
    await expect(page.locator('.blackboard-drawing-ui')).toHaveAttribute('aria-hidden','true')
  }

  const mediaLinks=await page.evaluate(()=>window.__CAMPUS_TEST__.passageMediaLinks())
  expect(mediaLinks).toMatchObject({
    boardId:'b1-passage-east',proxyCount:6,strategy:'board-local-rectangles',maxDistance:2.5,
  })
  expect(mediaLinks.links.map(link=>link.label)).toEqual(['小红书','微博','X','视频号','GitHub','在线体验'])
  const expectedMediaTargets=[
    {label:'小红书',center:[.820,.260],hudInteraction:'open-xiaohongshu',hint:'点击打开小红书'},
    {label:'微博',center:[.8925,.260],hudInteraction:'open-weibo',hint:'点击打开微博'},
    {label:'X',center:[.820,.4975],hudInteraction:'open-x',hint:'点击打开 X'},
    {label:'视频号',center:[.8925,.4975],hudInteraction:'show-wechat-qr',hint:'点击查看视频号二维码'},
    {label:'GitHub',center:[.820,.735],hudInteraction:'open-github',hint:'点击打开 GitHub'},
    {label:'在线体验',center:[.8925,.735],hudInteraction:'open-vercel',hint:'点击打开在线体验'},
  ]
  for(const expectedTarget of expectedMediaTargets) {
    const link=mediaLinks.links.find(item=>item.label===expectedTarget.label)
    const [left,right,top,bottom]=link.bounds
    expect((left+right)/2).toBeCloseTo(expectedTarget.center[0],3)
    expect((top+bottom)/2).toBeCloseTo(expectedTarget.center[1],3)
    expect(link.hudInteraction).toBe(expectedTarget.hudInteraction)
    const focused=await page.evaluate(label=>window.__CAMPUS_TEST__.focusPassageMediaLink(label),link.label)
    expect(focused).toMatchObject({
      id:'b1-passage-east-development-process',distance:1.8,
      hit:{label:link.label,href:link.href},
    })
    await expect.poll(()=>page.evaluate(()=>({
      interaction:window.__CAMPUS_TEST__.hud().interaction,
      hint:window.__CAMPUS_TEST__.hud().interactionHintText,
    }))).toEqual({interaction:expectedTarget.hudInteraction,hint:expectedTarget.hint})
  }
  const videoLink=mediaLinks.links.find(link=>link.label==='视频号')
  expect(videoLink.qrImageUrl).toContain('mo-mai-ai-wechat-channels-qr')
  await page.evaluate(()=>{
    window.__PASSAGE_LINK_OPENED__=null
    window.open=(...args)=>{window.__PASSAGE_LINK_OPENED__=args;return null}
    window.__CAMPUS_TEST__.focusPassageMediaLink('视频号')
  })
  await page.waitForTimeout(180)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().interaction)).toBe('show-wechat-qr')
  await page.mouse.click(640,360)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.passageSiteQr().open)).toBe(true)
  expect(await page.evaluate(()=>window.__PASSAGE_LINK_OPENED__)).toBeNull()
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.passageSiteQr())).toMatchObject({
    open:true,loaded:true,label:'视频号 Mo麥AI',sourceSize:[722,960],
  })
  const videoQrResources=await page.evaluate(()=>performance.getEntriesByType('resource')
    .map(item=>item.name).filter(url=>url.includes('mo-mai-ai-wechat-channels-qr')))
  expect(videoQrResources).toHaveLength(1)
  await page.mouse.click(18,18)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.passageSiteQr().open)).toBe(false)
  await page.evaluate(()=>window.__CAMPUS_TEST__.focusPassageMediaLink('视频号'))
  await page.mouse.click(640,360)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.passageSiteQr().open)).toBe(true)
  await page.keyboard.press('Escape')
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.passageSiteQr().open)).toBe(false)
  await page.evaluate(()=>{
    window.__PASSAGE_LINK_OPENED__=null
    window.__PASSAGE_GAME_URL__=location.href
    document.addEventListener('click',event=>{
      const anchor=event.target?.closest?.('[data-passage-external-link]')
      if(!anchor)return
      event.preventDefault()
      window.__PASSAGE_LINK_OPENED__={href:anchor.href,target:anchor.target,rel:anchor.rel}
    },{capture:true})
    window.__CAMPUS_TEST__.focusPassageMediaLink('GitHub')
  })
  await page.waitForTimeout(180)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().interaction)).toBe('open-github')
  await page.mouse.click(640,360)
  await expect.poll(()=>page.evaluate(()=>window.__PASSAGE_LINK_OPENED__)).not.toBeNull()
  const openedLink=await page.evaluate(()=>window.__PASSAGE_LINK_OPENED__)
  expect(openedLink).toEqual({
    href:'https://github.com/smartdio/4lite',target:'_blank',rel:'noopener noreferrer',
  })
  expect(await page.evaluate(()=>location.href)).toBe(await page.evaluate(()=>window.__PASSAGE_GAME_URL__))
})

import {expect,test} from '@playwright/test'

const boot=async page=>{
  await page.addInitScript(()=>localStorage.removeItem('4lite.shuttlecock.best.v1'))
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('shuttlecock alternates feet with deterministic motion and restores the player',async({page})=>{
  await boot(page)
  const placement=await page.evaluate(()=>{
    const [x,z]=window.__CAMPUS_TEST__.config.facilities.shuttlecock.center
    const tree=window.__CAMPUS_TEST__.config.facilities.playgroundTrees.placements.find(item=>item.id==='camphor-field-03')
    return {probe:window.__CAMPUS_TEST__.probe(x,z,0),center:[x,z],tree:tree.center}
  })
  expect(placement.probe.ground).toBe(0);expect(placement.probe.blocked).toBeFalsy()
  expect(placement.center).toEqual([-8.2,-42.3]);expect(placement.tree).toEqual([-11.8,-42.3])
  expect(placement.center[0]-placement.tree[0]).toBeCloseTo(3.6,5)
  const focused=await page.evaluate(()=>window.__CAMPUS_TEST__.focusShuttlecock())
  expect(focused.hit).toMatchObject({target:'shuttlecock'})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().interaction==='start-shuttlecock')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().interactionHint)).toBe('start-shuttlecock')
  const before=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  const beforeControls=await page.evaluate(()=>window.__CAMPUS_TEST__.controls())

  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterShuttlecock())
  expect(state).toMatchObject({status:'active',phase:'ready',streak:0,best:0,expectedFoot:'left',feedback:'按 Q 用左脚开始',model:{kind:'textured-working-value',feathers:5,featherArrangement:'radial-splay',featherSize:[.135,.39],featherColors:['#ef3f32','#f2c62d','#318ed0','#35ad62','#d84f9a'],transparentFeatherTexture:true,rootStructure:'texture-stems-into-cloth-base',bundle:'compact',baseRadius:.052,modernPlastic:false},policy:{fixedStep:1/120,maxSubsteps:8,interactionProxies:1}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('shuttlecock')
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.hud().shuttlecock.visible)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().shuttlecock)).toMatchObject({visible:true,phase:'ready',streak:0,best:0,expectedFoot:'left',loaded:true})
  const readyProjection=state.projection
  expect(readyProjection).toMatchObject({visible:true})
  expect(state.safeZone).toMatchObject({visible:true,shape:'cylinder',center:[-8.36,.55,-42.3],radius:.42,height:.62,opacity:.13})

  await page.keyboard.press('KeyE')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame())).toMatchObject({phase:'ready',streak:0,expectedFoot:'left',feedback:'换另一只脚'})
  const audioBefore=await page.evaluate(()=>window.__CAMPUS_TEST__.audio().plays)
  await page.keyboard.press('KeyQ')
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.shuttlecockGame().streak===1)
  await page.waitForFunction(before=>window.__CAMPUS_TEST__.audio().plays>before,audioBefore)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.audio().groups)).toContain('shuttlecockKick')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame())).toMatchObject({phase:'playing',streak:1,expectedFoot:'right'})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame().safeZone.center)).toEqual([-8.04,.55,-42.3])
  const firstArc=await page.evaluate(()=>({state:window.__CAMPUS_TEST__.advanceShuttlecock(.45),center:window.__CAMPUS_TEST__.config.facilities.shuttlecock.center}))
  expect(firstArc.state.position[1]).toBeGreaterThan(1.45)
  expect(firstArc.state.position[0]-firstArc.center[0]).toBeGreaterThan(.07)
  expect(firstArc.state.projection.radius).toBeGreaterThan(readyProjection.radius)
  expect(firstArc.state.projection.opacity).toBeLessThan(readyProjection.opacity)
  expect(firstArc.state.heightRatio).toBeGreaterThan(.8)
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitShuttlecock())
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterShuttlecock())

  const center=await page.evaluate(()=>window.__CAMPUS_TEST__.config.facilities.shuttlecock.center)
  const kicks=[]
  for(const foot of ['left','right','left','right']){
    await page.evaluate(({center,foot})=>window.__CAMPUS_TEST__.setShuttlecockState({shuttlePosition:[center[0],.48,center[1]],shuttleVelocity:[0,-.5,0],nextFoot:foot,gamePhase:'playing'}),{center,foot})
    kicks.push(await page.evaluate(foot=>window.__CAMPUS_TEST__.kickShuttlecock(foot),foot))
  }
  expect(kicks.map(kick=>kick.streak)).toEqual([1,2,3,4])
  expect(kicks.map(kick=>kick.foot)).toEqual(['left','right','left','right'])
  expect(kicks.map(kick=>kick.velocity)).toEqual([
    [.205,4.37,0],[-.33,4.39,0],[.255,4.41,0],[-.28,4.43,0],
  ])
  expect(await page.evaluate(()=>localStorage.getItem('4lite.shuttlecock.best.v1'))).toBe('4')

  await page.evaluate(({center})=>window.__CAMPUS_TEST__.setShuttlecockState({shuttlePosition:[center[0],.48,center[1]],shuttleVelocity:[0,-.5,0],nextFoot:'right'}),{center})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.kickShuttlecock('left'))).toMatchObject({type:'shuttlecock-miss',foot:'left'})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame().streak)).toBe(4)

  await page.evaluate(()=>window.__CAMPUS_TEST__.exitShuttlecock())
  const restored=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  const restoredControls=await page.evaluate(()=>window.__CAMPUS_TEST__.controls())
  expect(restored).toMatchObject({mode:'walk',x:before.x,y:before.y,z:before.z})
  expect(restoredControls.rotation).toEqual(beforeControls.rotation)
  expect(restoredControls.projection).toEqual(beforeControls.projection)
  await page.waitForFunction(()=>!window.__CAMPUS_TEST__.hud().shuttlecock.visible)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().shuttlecock.visible)).toBe(false)
})

test('shuttlecock feedback titles are projected on the ground instead of the screen centre',async({page})=>{
  await boot(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterShuttlecock())
  await page.evaluate(()=>window.__CAMPUS_TEST__.kickShuttlecock('right'))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame().groundTitle)).toMatchObject({visible:true,phrase:'switch-foot',kind:'plain',burstVisible:false,rotationX:-1.571})
  await page.evaluate(()=>window.__CAMPUS_TEST__.playShuttlecockGroundTitle('record','major',1100))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame().groundTitle)).toMatchObject({visible:true,phrase:'record',kind:'major',burstVisible:true})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:false,rootVisible:false})
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitShuttlecock())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame().groundTitle.visible)).toBe(false)
})

test('shuttlecock handles repositioning, landing, out of bounds and mode exclusion',async({page})=>{
  await boot(page)
  const center=await page.evaluate(()=>window.__CAMPUS_TEST__.config.facilities.shuttlecock.center)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterShuttlecock())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.enterLongJump())).toBeNull()
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.enterBambooClimb(0))).toBeNull()
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))).toBeNull()

  let state=await page.evaluate(({center})=>window.__CAMPUS_TEST__.setShuttlecockState({shuttlePosition:[center[0],.58,center[1]],shuttleVelocity:[0,-1,0],nextFoot:'left',playerX:0,gamePhase:'playing'}),{center})
  expect(state).toMatchObject({kickable:true,descending:true,kickWindow:[.141,.506]})
  expect(state.safeZone).toMatchObject({visible:true,shape:'cylinder',center:[-8.36,.55,-42.3],opacity:.25})

  await page.evaluate(()=>window.__CAMPUS_TEST__.moveShuttlecockPlayer(1))
  await page.waitForTimeout(240)
  await page.evaluate(()=>window.__CAMPUS_TEST__.moveShuttlecockPlayer(0))
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame().playerOffset)).toBeGreaterThan(.25)
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame())
  expect(state.safeZone.center[0]).toBeCloseTo(center[0]+state.playerOffset-.16,2)

  state=await page.evaluate(({center})=>{
    window.__CAMPUS_TEST__.setShuttlecockState({shuttlePosition:[center[0],.04,center[1]],shuttleVelocity:[0,-1,0],gamePhase:'playing'})
    return window.__CAMPUS_TEST__.advanceShuttlecock(.05)
  },{center})
  expect(state).toMatchObject({phase:'dropped',feedback:'没接住'})
  expect(state.safeZone.visible).toBe(false)

  await page.evaluate(()=>window.__CAMPUS_TEST__.kickShuttlecock('left'))
  state=await page.evaluate(({center})=>{
    window.__CAMPUS_TEST__.setShuttlecockState({shuttlePosition:[center[0]+1.8,.5,center[1]],shuttleVelocity:[1,0,0],gamePhase:'playing'})
    return window.__CAMPUS_TEST__.advanceShuttlecock(.02)
  },{center})
  expect(state).toMatchObject({phase:'dropped',feedback:'出界了'})
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitShuttlecock())

  await page.evaluate(()=>window.__CAMPUS_TEST__.enterLongJump())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.enterShuttlecock())).toBeNull()
  await page.evaluate(()=>window.__CAMPUS_TEST__.exitLongJump())
})

test('touch tap kicks either foot and horizontal drag repositions without walking controls',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
  const page=await context.newPage();await boot(page)
  const center=await page.evaluate(()=>window.__CAMPUS_TEST__.config.facilities.shuttlecock.center)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterShuttlecock())
  await page.evaluate(center=>window.__CAMPUS_TEST__.setShuttlecockState({shuttlePosition:[center[0],.48,center[1]],shuttleVelocity:[0,-.5,0],nextFoot:'left'}),center)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'shuttlecock',touchModePreferred:true,touchControlsVisible:true})
  const client=await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:600,id:51,radiusX:8,radiusY:8,force:1}]})
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.shuttlecockGame().streak===1)

  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:560,id:52,radiusX:8,radiusY:8,force:1}]})
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:270,y:560,id:52,radiusX:8,radiusY:8,force:1}]})
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.shuttlecockGame().playerOffset)).toBeGreaterThan(.25)
  const exitBounds=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().shuttlecock.exitBounds)
  const exitCenter={x:(exitBounds.left+exitBounds.right)/2,y:(exitBounds.top+exitBounds.bottom)/2}
  expect(await page.evaluate(({x,y})=>window.__CAMPUS_TEST__.probeShuttlecockExit(x,y),exitCenter)).toBe(true)
  expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,exitCenter)).toBe('touch-look-zone')
  await page.touchscreen.tap(exitCenter.x,exitCenter.y)
  await page.waitForFunction(()=>window.__CAMPUS_TEST__.controls().mode==='walk',null,{timeout:3000})
  await context.close()
})

test('shuttlecock fixed-step loop stays lightweight and allocates one interaction proxy',async({page})=>{
  await boot(page)
  const result=await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__,center=api.config.facilities.shuttlecock.center
    api.enterShuttlecock();const started=performance.now()
    for(let index=0;index<300;index++){
      api.setShuttlecockState({shuttlePosition:[center[0],1.08,center[1]],shuttleVelocity:[0,.3,0],nextFoot:'left',gamePhase:'playing'})
      api.advanceShuttlecock(1.5)
    }
    return {elapsed:performance.now()-started,state:api.shuttlecockGame(),detail:api.modelDetailAudit()}
  })
  expect(result.elapsed).toBeLessThan(500)
  expect(result.state.policy).toMatchObject({fixedStep:1/120,maxSubsteps:8,interactionProxies:1})
  expect(result.detail).toMatchObject({lodObjects:0})
})

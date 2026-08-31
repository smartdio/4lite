import {expect,test} from '@playwright/test'

test.use({viewport:{width:375,height:667},deviceScaleFactor:2,isMobile:true,hasTouch:true})

const dispatchTouch=async(client,type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points})

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('held basketball keeps look drag separate from the WebGL shoot button',async({page})=>{
  await ready(page)
  const id=await page.evaluate(()=>{
    const game=window.__CAMPUS_TEST__.basketballGame(),id=game.items[0].id
    window.__CAMPUS_TEST__.focusBasketball(id);window.__CAMPUS_TEST__.pickupBasketball(id)
    window.__CAMPUS_TEST__.teleport(15.1,-38.5,15.1,-42,0,3)
    return id
  })
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().basketball)).toMatchObject({shootButtonVisible:true,shootPressed:false,charging:false})
  const hud=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().basketball)
  expect(hud.shootButtonBounds).toMatchObject({width:72,height:72})
  const joystick=await page.locator('#touch-joystick').boundingBox()
  expect(hud.shootButtonBounds.left).toBeGreaterThan(joystick.x+joystick.width)

  const client=await page.context().newCDPSession(page)
  const lookPoint={x:190,y:270}
  const rotationBefore=await page.evaluate(()=>window.__CAMPUS_TEST__.controls().rotation)
  await dispatchTouch(client,'touchStart',[{...lookPoint,id:31,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchMove',[{x:lookPoint.x+44,y:lookPoint.y-22,id:31,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchEnd',[])
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.controls().rotation)).not.toEqual(rotationBefore)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame().ui)).toMatchObject({charging:false})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame().held)).toBe(id)

  const button={x:(hud.shootButtonBounds.left+hud.shootButtonBounds.right)/2,y:(hud.shootButtonBounds.top+hud.shootButtonBounds.bottom)/2}
  await dispatchTouch(client,'touchStart',[{...button,id:32,radiusX:10,radiusY:10,force:1}])
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().basketball)).toMatchObject({charging:true,shootPressed:true})
  await dispatchTouch(client,'touchCancel',[])
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().basketball)).toMatchObject({charging:false,shootPressed:false})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())).toMatchObject({held:id,attempts:0})

  await dispatchTouch(client,'touchStart',[{...button,id:33,radiusX:10,radiusY:10,force:1}])
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().basketball)).toMatchObject({charging:true,shootPressed:true})
  await page.waitForTimeout(260)
  await dispatchTouch(client,'touchEnd',[])
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())).toMatchObject({held:null,attempts:1})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().basketball.shootButtonVisible)).toBe(false)
})

test('mobile and tablet touch walking controls',async({page})=>{
  const consoleErrors=[]
  const failedRequests=[]
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
  page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}))

  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await expect(page.locator('body')).toHaveClass(/touch-input/)
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())

  const initial=await page.evaluate(()=>({controls:window.__CAMPUS_TEST__.controls(),player:window.__CAMPUS_TEST__.player(),models:window.__CAMPUS_TEST__.modelDetailAudit()}))
  expect(initial.controls).toMatchObject({mode:'walk',touchModePreferred:true,touchControlsVisible:true,fallback:false,pointerLocked:false})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.arrival())).toMatchObject({status:'complete',progress:1,position:[-2.5,1.62,-2.6],spawn:[-2.5,1.62,-2.6]})
  expect(initial.controls.projection).toMatchObject({verticalFov:79.35,horizontalFov:50})
  expect(initial.models).toEqual({lodEnabled:false,strategy:'single-full-detail-models',lodObjects:0})
  const mobileBuffers=await page.evaluate(()=>window.__CAMPUS_TEST__.performanceSnapshot().buffers)
  expect(mobileBuffers.rendererDpr).toBe(1.5)
  expect(mobileBuffers.composerDpr).toBe(1.5)
  expect(mobileBuffers.drawing).toEqual([562,1000])
  expect(mobileBuffers.composer).toEqual([562.5,1000.5])
  await expect(page.locator('#touch-controls')).toBeVisible()
  await expect(page.locator('#touch-joystick')).toBeVisible()
  await expect(page.locator('#touch-interact')).toHaveCount(0)

  const client=await page.context().newCDPSession(page)
  const joystick=await page.locator('#touch-joystick').boundingBox()
  expect(joystick).not.toBeNull()
  const joystickCenter={x:joystick.x+joystick.width/2,y:joystick.y+joystick.height/2}
  await dispatchTouch(client,'touchStart',[{...joystickCenter,id:1,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchMove',[{x:joystickCenter.x,y:joystickCenter.y-42,id:1,radiusX:8,radiusY:8,force:1}])
  await page.waitForTimeout(450)
  await dispatchTouch(client,'touchEnd',[])
  await page.waitForTimeout(150)
  const moved=await page.evaluate(()=>({controls:window.__CAMPUS_TEST__.controls(),player:window.__CAMPUS_TEST__.player()}))
  expect(moved.player.z).toBeLessThan(initial.player.z-.15)
  expect(moved.controls.touchMovement).toEqual([0,0])
  expect(moved.controls.touchJoystickActive).toBe(false)

  const lookZone=await page.locator('#touch-look-zone').boundingBox()
  expect(lookZone).not.toBeNull()
  const lookStart={x:lookZone.x+lookZone.width*.55,y:lookZone.y+Math.min(120,lookZone.height*.4)}
  const rotationBefore=moved.controls.rotation
  await dispatchTouch(client,'touchStart',[{...lookStart,id:2,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchMove',[{x:lookStart.x+45,y:lookStart.y-28,id:2,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchEnd',[])
  await page.waitForTimeout(100)
  const looked=await page.evaluate(()=>window.__CAMPUS_TEST__.controls())
  expect(looked.rotation).not.toEqual(rotationBefore)
  expect(looked.touchLookActive).toBe(false)
  expect(looked.touchTapActivations).toBe(0)

  const tapPoint={x:lookStart.x,y:lookStart.y}
  const rotationBeforeTap=looked.rotation
  await dispatchTouch(client,'touchStart',[{...tapPoint,id:3,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchEnd',[])
  await page.waitForTimeout(100)
  const tapped=await page.evaluate(()=>window.__CAMPUS_TEST__.controls())
  expect(tapped.rotation).toEqual(rotationBeforeTap)
  expect(tapped.touchTapActivations).toBe(1)

  const doorAim=await page.evaluate(()=>{
    const testApi=window.__CAMPUS_TEST__
    const placement=testApi.building1Interactions().placementStates.find(item=>item.type.startsWith('door'))
    const focused=testApi.focusBuilding1Interaction(placement.name,1)
    testApi.teleport(focused.camera[0],focused.camera[2],focused.target[0],focused.target[2],0,focused.target[1],focused.camera[1])
    const part=testApi.building1Interactions().placementStates.find(item=>item.name===placement.name).parts.find(item=>item.pivot===focused.hit.pivot)
    return {placement:placement.name,pivot:focused.hit.pivot,target:part.target}
  })
  expect(doorAim.pivot).toBeTruthy()
  await dispatchTouch(client,'touchStart',[{...tapPoint,id:4,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchEnd',[])
  await page.waitForTimeout(100)
  const doorAfterTap=await page.evaluate(({placement,pivot})=>{
    const state=window.__CAMPUS_TEST__.building1Interactions().placementStates.find(item=>item.name===placement)
    return {target:state.parts.find(item=>item.pivot===pivot).target,controls:window.__CAMPUS_TEST__.controls()}
  },doorAim)
  expect(doorAfterTap.target).not.toBe(doorAim.target)
  expect(doorAfterTap.controls.touchTapActivations).toBe(2)

  const boardAim=await page.evaluate(()=>window.__CAMPUS_TEST__.focusTeachingBlackboard())
  expect(boardAim.hit).toMatchObject({id:boardAim.id})
  await dispatchTouch(client,'touchStart',[{...tapPoint,id:5,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchEnd',[])
  await expect(page.locator('.blackboard-drawing-ui')).toHaveAttribute('aria-hidden','false')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'blackboard',blackboard:boardAim.id})
  const boardCanvas=await page.locator('.blackboard-drawing-canvas').boundingBox()
  const chalkStart={x:boardCanvas.x+boardCanvas.width*.28,y:boardCanvas.y+boardCanvas.height*.42}
  const chalkEnd={x:boardCanvas.x+boardCanvas.width*.7,y:boardCanvas.y+boardCanvas.height*.6}
  await dispatchTouch(client,'touchStart',[{...chalkStart,id:6,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchMove',[{...chalkEnd,id:6,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchEnd',[])
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.blackboardDrawing())).toMatchObject({active:boardAim.id,drawings:[{id:boardAim.id,strokes:1,visible:true}]})
  await page.locator('[data-action="done"]').click()
  await expect(page.locator('.blackboard-drawing-ui')).toHaveAttribute('aria-hidden','true')
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.player())).mode).toBe('walk')

  const chalkAim=await page.evaluate(()=>window.__CAMPUS_TEST__.focusPickableChalk())
  expect(chalkAim.hit).toMatchObject({id:chalkAim.id})
  await dispatchTouch(client,'touchStart',[{...tapPoint,id:7,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchEnd',[])
  await expect(page.locator('.chalk-held-indicator')).toHaveClass(/active/)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.chalkThrowing())).toMatchObject({held:{sourceId:chalkAim.id}})
  await page.evaluate(position=>window.__CAMPUS_TEST__.aimChalkThrow([position[0],position[1]-.15,position[2]-.35]),chalkAim.position)
  await dispatchTouch(client,'touchStart',[{...tapPoint,id:8,radiusX:8,radiusY:8,force:1}])
  await dispatchTouch(client,'touchEnd',[])
  const thrownChalk=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceChalkPhysics(5))
  expect(thrownChalk).toMatchObject({held:null,throws:1,projectiles:[{sourceId:chalkAim.id,status:'settled'}]})
  expect(thrownChalk.collisions).toBeGreaterThan(0)

  const portraitLayout=await page.evaluate(()=>{
    const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
    return {viewport:[innerWidth,innerHeight],actions:[...document.querySelectorAll('.actions button')].map(button=>button.getBoundingClientRect().height),joystick:rect('#touch-joystick'),look:rect('#touch-look-zone')}
  })
  expect(portraitLayout.viewport).toEqual([375,667])
  expect(portraitLayout.actions.every(height=>height>=44)).toBe(true)
  expect(portraitLayout.joystick.bottom).toBeLessThanOrEqual(667)
  expect(portraitLayout.look.width).toBe(375)

  for(const viewport of [{width:844,height:390},{width:820,height:1180}]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(200)
    const responsive=await page.evaluate(()=>({
      viewport:[innerWidth,innerHeight],controls:window.__CAMPUS_TEST__.controls(),models:window.__CAMPUS_TEST__.modelDetailAudit(),
      scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
      joystick:document.querySelector('#touch-joystick').getBoundingClientRect().toJSON(),
      look:document.querySelector('#touch-look-zone').getBoundingClientRect().toJSON(),
    }))
    expect(responsive.viewport).toEqual([viewport.width,viewport.height])
    expect(responsive.controls.touchControlsVisible).toBe(true)
    expect(responsive.controls.projection.verticalFov).toBe(50)
    expect(responsive.models.lodObjects).toBe(0)
    expect(responsive.scroll[0]).toBe(viewport.width)
    expect(responsive.joystick.bottom).toBeLessThanOrEqual(viewport.height)
    expect(responsive.look.width).toBe(viewport.width)
  }

  expect(failedRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

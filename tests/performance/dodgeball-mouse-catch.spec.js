import {expect,test} from '@playwright/test'

// Real mouse/keyboard events enter through the campus canvas. The existing
// test-build API only fixes positions and AI noise; it never opens a catch
// window, calls an input handler, or awards a catch on behalf of the player.
const errorsByPage=new WeakMap()
test.beforeEach(({page})=>{
  const errors=[];errorsByPage.set(page,errors)
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
})
test.afterEach(({page})=>expect(errorsByPage.get(page)).toEqual([]))

const state=page=>page.evaluate(()=>window.__CAMPUS_TEST__.dodgeball())
const advance=(page,seconds=0)=>page.evaluate(seconds=>window.__CAMPUS_TEST__.advanceDodgeball(seconds),seconds)
const controlled=current=>current.players.find(player=>player.id===current.controlledId)
const designPoint=(current,x,y)=>({x:current.viewport.left+x/1920*current.viewport.width,
  y:current.viewport.top+y/1080*current.viewport.height})

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.dodgeball().loaded)).toBe(true)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterDodgeball())
  await page.keyboard.press('Enter')
}

const arrange=(page,{attack=false}={})=>page.evaluate(({attack})=>{
  const api=window.__CAMPUS_TEST__,attackTeam=attack?'blue':'red',attackId=api.dodgeball().ball.attackId
  const players=Array.from({length:4},(_,id)=>{
    const team=id<2?'blue':'red',slot=id%2,role=team===attackTeam?'attack':'defend'
    return {id,team,slot,role,alive:true,x:role==='attack'?(slot?12:-12):(slot?3.6:-3.5),
      y:0,z:role==='attack'?11:(slot?13:9.7),vx:0,vy:0,vz:0,yaw:0,
      action:'idle',actionTime:0,actionDuration:0,catchUntil:0,catchCooldownUntil:0,
      aiDecisionAt:1e9,aiReactionUntil:1e9,aiThrowAfter:1e9,
      aiMoveX:0,aiMoveZ:0,aiTryCatch:false,aiJump:false}
  })
  api.setDodgeballState({phase:attack?'held':'flight',phaseElapsed:0,ballMode:'pingpong',
    attackTeam,controlledId:0,holdElapsed:0,charge:0,charging:false,timeRemaining:180,
    winner:null,feedback:null,lastAttackResult:null,players,scores:{blue:0,red:0},
    ball:attack
      ?{x:-11.28,y:2.05,z:11,vx:0,vy:0,vz:0,radius:.21,active:false,ownerId:0,
        throwerId:null,receiverId:null,attackId,bounces:0}
      // A remote high arc stays away from all capsules while input timing is
      // inspected. Individual catch tests then place this same live projectile
      // on an approaching trajectory without changing the input-created window.
      :{x:-12,y:5,z:5.7,vx:1,vy:6,vz:0,radius:.21,active:true,ownerId:null,
        throwerId:2,receiverId:3,attackId:1,bounces:0}})
  // Let the adapter observe controlledId before a real pointer is held down.
  return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(api.advanceDodgeball(0)))))
},{attack})

const observePresses=page=>page.evaluate(()=>{
  window.__DODGEBALL_MOUSE_CATCH_PRESSES__=[]
  window.addEventListener('pointerdown',event=>{
    if(!event.isTrusted||event.pointerType!=='mouse')return
    // Snapshot just BEFORE the canvas handler. The second double-click press
    // therefore observes the first press's exact window, without a separate
    // Playwright round trip or relying on a microtask between event listeners.
    const before=window.__CAMPUS_TEST__.dodgeball()
    window.__DODGEBALL_MOUSE_CATCH_PRESSES__.push({button:event.button,
      elapsed:before.elapsed,catchUntil:before.players[0].catchUntil,
      catchCooldownUntil:before.players[0].catchCooldownUntil})
  },{capture:true})
})

test('defender primary press catches a real incoming ball without aiming at it',async({page})=>{
  await ready(page)
  const initial=await arrange(page)
  expect(controlled(initial)).toMatchObject({id:0,team:'blue',role:'defend',alive:true})
  // Far-right empty play area, deliberately nowhere near the controlled
  // defender or the projectile approaching from the left.
  const point=designPoint(initial,1650,720)
  await page.mouse.move(point.x,point.y)
  await page.mouse.down()
  const pressed=await state(page),windowEnd=controlled(pressed).catchUntil
  expect(windowEnd).toBeGreaterThan(pressed.elapsed)
  expect(pressed).toMatchObject({phase:'flight',charging:false,charge:0,input:{pointers:1}})
  expect(controlled(pressed).action).toBe('catch')
  const caught=await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__
    api.setDodgeballState({ball:{x:-5.2,y:1.7,z:9.7,vx:30,vy:0,vz:0}})
    return api.advanceDodgeball(.06)
  })
  expect(caught).toMatchObject({phase:'returning',scores:{blue:1,red:0},charging:false,
    lastAttackResult:{reason:'catch',team:'blue',playerId:0,attackId:1},ball:{active:false,attackId:1}})
  await page.mouse.up()
  const released=await state(page)
  expect(released.ball.attackId).toBe(1)
  expect(released.charging).toBe(false)
  expect(released.input.pointers).toBe(0)
})

test('holding, moving and releasing do not repeat a catch; fresh presses obey cooldown',async({page})=>{
  await ready(page)
  const initial=await arrange(page),point=designPoint(initial,1500,690)
  await observePresses(page)
  await page.mouse.move(point.x,point.y)
  await page.mouse.down()
  const opened=await state(page),windowEnd=controlled(opened).catchUntil,cooldownEnd=controlled(opened).catchCooldownUntil
  expect(windowEnd).toBeGreaterThan(opened.elapsed)
  expect(cooldownEnd-windowEnd).toBeCloseTo(.45-.24,7)
  // Continue holding beyond BOTH the window and cooldown, then drag. Neither
  // elapsed time nor pointermove is a new defensive press.
  await advance(page,.6)
  const moved=designPoint(initial,1350,760)
  await page.mouse.move(moved.x,moved.y,{steps:4})
  const held=await state(page)
  expect(held.phase).toBe('flight')
  expect(held.elapsed).toBeGreaterThan(cooldownEnd)
  expect(controlled(held)).toMatchObject({catchUntil:windowEnd,catchCooldownUntil:cooldownEnd})
  await page.mouse.up()
  const released=await state(page)
  expect(controlled(released)).toMatchObject({catchUntil:windowEnd,catchCooldownUntil:cooldownEnd})
  expect(released).toMatchObject({phase:'flight',charging:false,charge:0,ball:{attackId:1},input:{pointers:0}})

  await page.mouse.dblclick(moved.x,moved.y,{delay:0})
  const presses=await page.evaluate(()=>window.__DODGEBALL_MOUSE_CATCH_PRESSES__)
  expect(presses).toHaveLength(3)
  const [first,fresh,blocked]=presses
  expect(windowEnd).toBeCloseTo(first.elapsed+.24,7)
  expect(fresh.elapsed).toBeGreaterThanOrEqual(cooldownEnd)
  expect(blocked.catchUntil).toBeCloseTo(fresh.elapsed+.24,7)
  expect(blocked.catchUntil).toBeGreaterThan(windowEnd)
  expect(blocked.elapsed).toBeLessThan(blocked.catchCooldownUntil)
  const afterDouble=await state(page)
  expect(controlled(afterDouble)).toMatchObject({catchUntil:blocked.catchUntil,catchCooldownUntil:blocked.catchCooldownUntil})
  expect(afterDouble.ball.attackId).toBe(1)
})

test('right button and top HUD cannot catch, K remains available, and pause blocks play clicks',async({page})=>{
  await ready(page)
  const initial=await arrange(page),point=designPoint(initial,1500,690)
  await page.mouse.click(point.x,point.y,{button:'right'})
  expect(controlled(await state(page)).catchUntil).toBe(0)
  // The scoreboard is intentionally not an actionable HUD button. The whole
  // top strip still must be excluded from court primary-button input.
  const top=designPoint(initial,960,180)
  await page.mouse.click(top.x,top.y)
  let current=await state(page)
  expect(controlled(current).catchUntil).toBe(0)
  expect(current).toMatchObject({phase:'flight',charging:false,charge:0})
  await page.keyboard.press('KeyK')
  current=await state(page)
  expect(controlled(current).catchUntil).toBeGreaterThan(current.elapsed)
  expect(controlled(current).action).toBe('catch')

  await page.keyboard.press('Escape')
  const paused=await state(page)
  expect(paused.paused).toBe(true)
  expect(controlled(paused).catchUntil).toBe(0)
  // Outside the central pause dialog, but otherwise a valid play point.
  const empty=designPoint(paused,250,650)
  await page.mouse.click(empty.x,empty.y)
  await page.keyboard.press('KeyK')
  current=await advance(page,.6)
  expect(current).toMatchObject({paused:true,phase:'flight',charging:false,charge:0,
    elapsed:paused.elapsed,scores:paused.scores,ball:paused.ball,input:{pointers:0}})
  expect(controlled(current).catchUntil).toBe(0)
})

test('attacking primary button still charges on hold and throws exactly once on release',async({page})=>{
  await ready(page)
  const initial=await arrange(page,{attack:true}),point=designPoint(initial,1220,660)
  expect(controlled(initial)).toMatchObject({id:0,team:'blue',role:'attack',alive:true})
  await page.mouse.move(point.x,point.y)
  await page.mouse.down()
  const held=await advance(page,.18)
  expect(held).toMatchObject({phase:'held',charging:true,ball:{ownerId:0,active:false,attackId:0},input:{pointers:1}})
  expect(held.charge).toBeGreaterThan(0)
  expect(held.charge).toBeLessThan(1)
  expect(controlled(held).catchUntil).toBe(0)
  await page.mouse.up()
  const thrown=await state(page)
  expect(thrown).toMatchObject({phase:'flight',charging:false,controlledId:1,
    ball:{ownerId:null,active:true,throwerId:0,receiverId:1,attackId:1},input:{pointers:0}})
  expect(thrown.ball.vx).toBeGreaterThan(0);expect(thrown.ball.vz).toBe(0)
  expect(thrown.players.every(player=>player.catchUntil===0)).toBe(true)
  await page.mouse.move(point.x+12,point.y+12)
  expect((await state(page)).ball.attackId).toBe(1)
})

test('K and primary mouse share one charge owner, regardless of which input is pressed or released first',async({page})=>{
  await ready(page)
  const down=source=>source==='key'?page.keyboard.down('KeyK'):page.mouse.down()
  const up=source=>source==='key'?page.keyboard.up('KeyK'):page.mouse.up()
  for(const owner of ['key','mouse'])for(const releaseOwnerFirst of [false,true]) {
    const initial=await arrange(page,{attack:true}),attackId=initial.ball.attackId,other=owner==='key'?'mouse':'key'
    const point=designPoint(initial,1500,690)
    await page.mouse.move(point.x,point.y)
    await down(owner)
    const charging=await advance(page,.12)
    expect(charging).toMatchObject({phase:'held',charging:true,ball:{ownerId:0,attackId}})
    expect(charging.charge).toBeGreaterThan(0)
    await down(other)
    const overlapped=await advance(page,.08)
    expect(overlapped).toMatchObject({phase:'held',charging:true,ball:{ownerId:0,attackId}})
    expect(overlapped.charge).toBeGreaterThanOrEqual(charging.charge)
    if(!releaseOwnerFirst) {
      // A release from the second input must neither throw nor cancel/reset
      // the first input's in-progress charge.
      await up(other)
      const stillCharging=await state(page)
      expect(stillCharging).toMatchObject({phase:'held',charging:true,ball:{ownerId:0,attackId}})
      expect(stillCharging.charge).toBeGreaterThanOrEqual(overlapped.charge)
    }
    await up(owner)
    const thrown=await state(page)
    expect(thrown).toMatchObject({phase:'flight',charging:false,controlledId:1,
      ball:{ownerId:null,active:true,throwerId:0,receiverId:1,attackId:attackId+1}})
    expect(thrown.ball.vx).toBeGreaterThan(0);expect(thrown.ball.vz).toBe(0)
    if(releaseOwnerFirst)await up(other)
    const released=await state(page)
    expect(released.ball.attackId).toBe(attackId+1)
    expect(released).toMatchObject({charging:false,input:{pointers:0}})
    expect(released.players.every(player=>player.catchUntil===0)).toBe(true)
  }
})

test('simultaneous defensive K and mouse presses share the same catch cooldown and never become throws',async({page})=>{
  await ready(page)
  const initial=await arrange(page),point=designPoint(initial,1500,690)
  await page.mouse.move(point.x,point.y)
  await page.keyboard.down('KeyK')
  const opened=await state(page),windowEnd=controlled(opened).catchUntil,cooldownEnd=controlled(opened).catchCooldownUntil
  expect(windowEnd).toBeGreaterThan(opened.elapsed)
  await page.mouse.down()
  const combined=await state(page)
  expect(combined.elapsed).toBeLessThan(cooldownEnd)
  expect(controlled(combined)).toMatchObject({catchUntil:windowEnd,catchCooldownUntil:cooldownEnd})
  await advance(page,.55)
  await page.keyboard.up('KeyK');await page.mouse.up()
  const released=await state(page)
  expect(controlled(released)).toMatchObject({catchUntil:windowEnd,catchCooldownUntil:cooldownEnd})
  expect(released).toMatchObject({phase:'flight',charging:false,charge:0,ball:{active:true,ownerId:null,attackId:1},
    scores:{blue:0,red:0},input:{pointers:0}})
})

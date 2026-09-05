import {expect,test} from '@playwright/test'

// Exercise real campus keyboard/pointer adapters. Test-only arrangement gives
// each case room to move and quiet AI, never supplies a resulting orientation.
const errorsByPage=new WeakMap()
test.beforeEach(({page})=>{
  const errors=[];errorsByPage.set(page,errors)
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
})
test.afterEach(({page})=>expect(errorsByPage.get(page)).toEqual([]))

const state=page=>page.evaluate(()=>window.__CAMPUS_TEST__.dodgeball())
const advance=(page,seconds=0)=>page.evaluate(seconds=>window.__CAMPUS_TEST__.advanceDodgeball(seconds),seconds)
const actor=(current,id=0)=>current.players.find(player=>player.id===id)
const expectYaw=(current,yaw,id=0)=>{
  const difference=actual=>Math.atan2(Math.sin(actual-yaw),Math.cos(actual-yaw))
  expect(difference(actor(current,id).yaw)).toBeCloseTo(0,6)
  expect(difference(current.visual.players.find(player=>player.id===id).yaw)).toBeCloseTo(0,6)
}
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

const arrange=(page,{attackTeam='red',ownerId=2,flight=false}={})=>page.evaluate(options=>{
  const api=window.__CAMPUS_TEST__,{attackTeam,ownerId,flight}=options
  const players=Array.from({length:4},(_,id)=>{
    const team=id<2?'blue':'red',slot=id%2,role=team===attackTeam?'attack':'defend'
    return {id,team,slot,role,alive:true,x:role==='attack'?(slot?12:-12):(slot?3.6:-3.5),
      y:0,z:role==='attack'?11:(slot?13:9.7),vx:0,vy:0,vz:0,
      yaw:role==='attack'?(slot?-Math.PI/2:Math.PI/2):0,
      action:'idle',actionTime:0,actionDuration:0,catchUntil:0,catchCooldownUntil:0,
      aiDecisionAt:1e9,aiReactionUntil:1e9,aiThrowAfter:1e9,
      aiMoveX:0,aiMoveZ:0,aiTryCatch:false,aiJump:false}
  })
  const owner=players[ownerId],sign=owner.slot?-1:1
  api.setDodgeballState({phase:flight?'flight':'held',phaseElapsed:0,ballMode:'pingpong',attackTeam,
    controlledId:attackTeam==='blue'?(flight?ownerId^1:ownerId):0,
    catchDisplay:null,holdElapsed:0,charge:0,charging:false,timeRemaining:180,
    winner:null,feedback:null,lastAttackResult:null,players,scores:{blue:0,red:0},
    ball:flight
      ?{x:0,y:12,z:5.3,vx:1,vy:4,vz:0,radius:.21,active:true,ownerId:null,
        throwerId:ownerId,receiverId:ownerId^1,attackId:api.dodgeball().ball.attackId+1,bounces:0}
      :{x:owner.x+sign*.72,y:2.05,z:owner.z,vx:0,vy:0,vz:0,radius:.21,active:false,
        ownerId,throwerId:null,receiverId:null,attackId:api.dodgeball().ball.attackId,bounces:0}})
  // Let the adapter observe any ownership change before a real gesture starts.
  return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(api.advanceDodgeball(0)))))
},{attackTeam,ownerId,flight})

test('defenders visibly face WASD, arrow and diagonal movement in both held and live-ball phases',async({page})=>{
  await ready(page)
  for(const flight of [false,true]) {
    for(const [keys,x,z] of [
      [['KeyA'],-1,0],[['KeyD'],1,0],[['KeyW'],0,-1],[['KeyS'],0,1],
      [['ArrowLeft'],-1,0],[['ArrowRight'],1,0],[['ArrowUp'],0,-1],[['ArrowDown'],0,1],
      [['KeyA','KeyW'],-1,-1],[['KeyD','KeyS'],1,1],
    ]) {
      const before=await arrange(page,{flight})
      for(const key of keys)await page.keyboard.down(key)
      const moved=await advance(page,.12)
      expect(moved.phase).toBe(flight?'flight':'held')
      expectYaw(moved,Math.atan2(x,z))
      expect(Math.hypot(actor(moved).x-actor(before).x,actor(moved).z-actor(before).z)).toBeGreaterThan(.02)
      for(const key of keys)await page.keyboard.up(key)
      const stopped=await advance(page,.2)
      expectYaw(stopped,Math.atan2(x,z))
    }
  }
})

test('reversing a real movement key turns before momentum reverses, and idle does not track a moving ball',async({page})=>{
  await ready(page)
  await arrange(page,{flight:true})
  await page.keyboard.down('KeyA')
  const left=await advance(page,.3)
  expect(actor(left).vx).toBeCloseTo(-5.8,6)
  expectYaw(left,-Math.PI/2)
  await page.keyboard.up('KeyA');await page.keyboard.down('KeyD')
  const reversing=await advance(page,1/120)
  // Facing follows the newly requested direction, not old velocity. At the
  // first physics step acceleration has not yet cancelled leftward momentum.
  expect(actor(reversing).vx).toBeLessThan(0)
  expectYaw(reversing,Math.PI/2)
  await page.keyboard.up('KeyD')
  const stopped=await advance(page,.3)
  expectYaw(stopped,Math.PI/2)
  expect(actor(stopped).vx).toBe(0)
  const later=await advance(page,.15)
  expect(later.ball.x).toBeGreaterThan(stopped.ball.x)
  expectYaw(later,Math.PI/2)
  // Put the existing live projectile on the other side, without touching the
  // defender. Looking at ball position instead of input would now rotate it.
  await page.evaluate(()=>window.__CAMPUS_TEST__.setDodgeballState({ball:{x:-11,y:12,z:5.3,vx:1,vy:0}}))
  expectYaw(await advance(page,.12),Math.PI/2)
})

test('pause and a successful sideways catch preserve facing until the confirmation hold ends',async({page})=>{
  await ready(page)
  await arrange(page)
  await page.keyboard.down('KeyD');await advance(page,.12);await page.keyboard.up('KeyD')
  const beforePause=await advance(page,.2)
  expectYaw(beforePause,Math.PI/2)
  await page.keyboard.press('Escape');await page.keyboard.down('KeyA')
  const paused=await advance(page,2)
  expect(paused.paused).toBe(true)
  expectYaw(paused,Math.PI/2)
  expect(actor(paused).x).toBe(actor(beforePause).x)
  await page.keyboard.up('KeyA');await page.keyboard.press('Escape')

  await arrange(page,{flight:true})
  await page.keyboard.down('KeyS');await advance(page,.1);await page.keyboard.up('KeyS')
  await advance(page,.2)
  await page.keyboard.press('KeyK')
  const caught=await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__,player=api.dodgeball().players[0]
    // A real incoming horizontal ball meets a K catch opened by the user,
    // while the defender faces +Z. Rotation must not narrow catch eligibility.
    api.setDodgeballState({ball:{x:player.x-1.5,y:1.7,z:player.z,vx:30,vy:0,vz:0}})
    return api.advanceDodgeball(.06)
  })
  expect(caught).toMatchObject({phase:'returning',scores:{blue:1,red:0},
    lastAttackResult:{reason:'catch',playerId:0},catchDisplay:{playerId:0,duration:.55}})
  expectYaw(caught,0)
  await page.keyboard.down('KeyA')
  const confirming=await advance(page,.24)
  expect(actor(confirming).action).toBe('caught')
  expectYaw(confirming,0)
  expect(actor(confirming).x).toBe(actor(caught).x)
  const released=await advance(page,.35)
  expect(released.phaseElapsed).toBeGreaterThan(.55)
  expectYaw(released,-Math.PI/2)
  expect(actor(released).x).toBeLessThan(actor(caught).x)
  await page.keyboard.up('KeyA')
})

test('NPC defenders use their own movement intent while both attacking endpoints keep the fixed inward direction',async({page})=>{
  await ready(page)
  await arrange(page)
  for(const [x,z] of [[-1,0],[1,0],[0,-1],[1,1]]) {
    await page.evaluate(({x,z})=>window.__CAMPUS_TEST__.setDodgeballState({players:[{id:1,aiMoveX:x,aiMoveZ:z}]}),{x,z})
    const moving=await advance(page,.08)
    expectYaw(moving,Math.atan2(x,z),1)
    expectYaw(moving,Math.PI/2,2)
    expectYaw(moving,-Math.PI/2,3)
  }
  for(const ownerId of [0,1]) {
    await arrange(page,{attackTeam:'blue',ownerId})
    for(const keys of [['KeyW','KeyA'],['KeyS','KeyD']]) {
      for(const key of keys)await page.keyboard.down(key)
      const moved=await advance(page,.12)
      expectYaw(moved,Math.PI/2,0)
      expectYaw(moved,-Math.PI/2,1)
      for(const key of keys)await page.keyboard.up(key)
    }
  }
})

test.describe('phone defender facing',()=>{
  test.use({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true})

  test('trusted joystick contacts turn the visible defender in four directions and diagonally, then keep facing after release',async({page})=>{
    await ready(page)
    await arrange(page)
    const client=await page.context().newCDPSession(page)
    let touchActive=false
    await page.evaluate(()=>{
      const controller=new AbortController(),events=[]
      window.__DODGEBALL_FACING_POINTER_LOG__={controller,events}
      for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])window.addEventListener(type,event=>{
        if(event.pointerType==='touch')events.push({type,x:event.clientX,y:event.clientY,trusted:event.isTrusted})
      },{capture:true,signal:controller.signal})
    })
    try {
      for(const [x,z] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1]]) {
        const current=await arrange(page),bounds=current.hud.buttons.joystick
        expect(bounds).toBeTruthy()
        const center={x:current.viewport.left+(bounds.left+bounds.right)/2/1920*current.viewport.width,
          y:current.viewport.top+(bounds.top+bounds.bottom)/2/1080*current.viewport.height}
        const finger={id:11,...center,radiusX:8,radiusY:8,force:1}
        await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});touchActive=true
        await expect.poll(()=>state(page)).toMatchObject({input:{pointers:1}})
        const count=await page.evaluate(()=>window.__DODGEBALL_FACING_POINTER_LOG__.events.length)
        finger.x+=28*x;finger.y+=28*z
        await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger]})
        await expect.poll(()=>page.evaluate(({count,x,y})=>window.__DODGEBALL_FACING_POINTER_LOG__.events.slice(count).some(event=>
          event.type==='pointermove'&&event.trusted&&Math.abs(event.x-x)<.75&&Math.abs(event.y-y)<.75),
        {count,x:finger.x,y:finger.y}),{timeout:1500}).toBe(true)
        const moved=await advance(page,.14)
        expectYaw(moved,Math.atan2(x,z))
        expect(Math.hypot(actor(moved).x-actor(current).x,actor(moved).z-actor(current).z)).toBeGreaterThan(.02)
        await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touchActive=false
        await expect.poll(()=>state(page)).toMatchObject({input:{pointers:0,move:{x:0,z:0}}})
        expectYaw(await advance(page,.2),Math.atan2(x,z))
      }
    } finally {
      try {
        if(touchActive)await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
        const events=await page.evaluate(()=>{
          const log=window.__DODGEBALL_FACING_POINTER_LOG__
          log.controller.abort();delete window.__DODGEBALL_FACING_POINTER_LOG__
          return log.events
        })
        await test.info().attach('real-facing-touch-delivery',{body:JSON.stringify(events,null,2),contentType:'application/json'})
      } finally {await client.detach()}
    }
  })
})

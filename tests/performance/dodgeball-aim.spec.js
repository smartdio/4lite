import {expect,test} from '@playwright/test'
import * as THREE from 'three'

// Real campus, renderer and pointer events. Only deterministic game-state
// setup uses the existing test API; input no longer chooses a target. A held
// ball always points along its owner's current z lane toward the other end.
const errorsByPage=new WeakMap()
test.beforeEach(({page})=>{
  const errors=[];errorsByPage.set(page,errors)
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
})
test.afterEach(({page})=>expect(errorsByPage.get(page)).toEqual([]))

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.dodgeball().loaded)).toBe(true)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterDodgeball())
}
const state=page=>page.evaluate(()=>window.__CAMPUS_TEST__.dodgeball())
const advance=(page,seconds=0)=>page.evaluate(seconds=>window.__CAMPUS_TEST__.advanceDodgeball(seconds),seconds)
const designPoint=(current,x,y)=>({x:current.viewport.left+x/1920*current.viewport.width,y:current.viewport.top+y/1080*current.viewport.height})
const hudPoint=async(page,action)=>{
  const current=await state(page),bounds=current.hud.buttons[action]
  if(!bounds)throw new Error(`No active dodgeball ${action} button in ${current.phase}`)
  return designPoint(current,(bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2)
}

function facePoint(current,playerId) {
  const player=current.players.find(value=>value.id===playerId)
  const camera=new THREE.PerspectiveCamera(38,16/9,.1,180)
  camera.position.set(0,9.11,37);camera.lookAt(0,2.2,11.2);camera.updateMatrixWorld(true)
  const projected=new THREE.Vector3(player.x,player.y+2.95,player.z).project(camera)
  return designPoint(current,(projected.x+1)*960,(1-projected.y)*540)
}

const held=(page,{ownerId=0,z=11,attackTeam='blue',safeLane=false}={})=>page.evaluate(({ownerId,z,attackTeam,safeLane})=>{
  const players=Array.from({length:4},(_,id)=>{
    const team=id<2?'blue':'red',slot=id%2,role=team===attackTeam?'attack':'defend'
    return {id,team,slot,role,alive:true,x:role==='attack'?(slot?12:-12):(slot?3.6:-3.5),
      z:role==='attack'?z:safeLane?(z<9.85?14:5.7):(slot?13:9.7),y:0,vx:0,vy:0,vz:0,action:'idle',actionTime:0,actionDuration:0,
      catchUntil:0,catchCooldownUntil:0,aiDecisionAt:1e9,aiReactionUntil:1e9,aiThrowAfter:1e9,
      aiMoveX:0,aiMoveZ:0,aiTryCatch:false,aiJump:false}
  })
  const owner=players[ownerId],sign=owner.slot===0?1:-1
  window.__CAMPUS_TEST__.setDodgeballState({
    phase:'held',phaseElapsed:0,attackTeam,controlledId:attackTeam==='blue'?ownerId:0,
    holdElapsed:0,charge:0,charging:false,timeRemaining:180,winner:null,feedback:null,lastAttackResult:null,
    players,scores:{blue:0,red:0},
    ball:{x:owner.x+sign*.72,y:2.05,z,vx:0,vy:0,vz:0,active:false,ownerId,throwerId:null,receiverId:null,attackId:0,bounces:0},
  })
  // Let the real adapter observe a controlled-player change before the next
  // press; its normal ownership-transition cleanup must not cancel our touch.
  return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(window.__CAMPUS_TEST__.advanceDodgeball(0)))))
},{ownerId,z,attackTeam,safeLane})

const expectHeading=(actual,expected)=>{
  expect(actual.x).toBeCloseTo(expected.x,6)
  expect(actual.z).toBeCloseTo(expected.z,6)
}
const expectIndicator=current=>{
  const indicator=current.visual.aimIndicator,aim=current.aim
  expect(indicator).toMatchObject({visible:true,ownerId:current.controlledId,geometryShared:false,
    style:'spotlight',transparent:true,arrow:false,crosshair:false,materialBatches:1})
  expect(indicator.opacity).toBeGreaterThan(0)
  expect(indicator.opacity).toBeLessThan(1)
  expect(indicator.alphaSamples.center).toBeGreaterThan(0)
  expect(indicator.alphaSamples.center).toBeLessThan(1)
  expect(indicator.alphaSamples.edge).toBe(0)
  expect(indicator.alphaSamples.end).toBe(0)
  expect(current.visual.texturedWorldMaterials).toBe(0)
  expect(indicator.origin[0]).toBeCloseTo(aim.origin.x,6)
  expect(indicator.origin[1]).toBeCloseTo(aim.origin.y,6)
  expect(indicator.origin[2]).toBeCloseTo(aim.origin.z,6)
  expectHeading({x:indicator.direction[0],z:indicator.direction[2]},aim.direction)
  expect(indicator.target[0]).toBeCloseTo(aim.target.x,6)
  expect(indicator.target[1]).toBeCloseTo(aim.target.z,6)
  expect(Math.hypot(indicator.end[0]-indicator.origin[0],indicator.end[2]-indicator.origin[2])).toBeCloseTo(indicator.length,6)
}
const expectThrowHeading=(current,aim)=>{
  expect(current).toMatchObject({phase:'flight',ball:{active:true,ownerId:null}})
  const speed=Math.hypot(current.ball.vx,current.ball.vz)
  expect(speed).toBeGreaterThan(0)
  expectHeading({x:current.ball.vx/speed,z:current.ball.vz/speed},aim.direction)
  expect(current.visual.aimIndicator.visible).toBe(false)
}

const expectStraightHeld=current=>{
  const owner=current.players.find(player=>player.id===current.ball.ownerId),sign=owner.slot?-1:1
  expectHeading(current.aim.direction,{x:sign,z:0})
  expect(current.aim.origin.x).toBeCloseTo(owner.x+sign*.72,6)
  expect(current.aim.origin.z).toBeCloseTo(owner.z,6)
  expect(current.aim.target.z).toBeCloseTo(owner.z,6)
  expect(current.aim.target.x*sign).toBeGreaterThan(0)
  expectIndicator(current)
}

test('arbitrary mouse positions, face hover and charge drags cannot steer either end; release retains its bounce sound',async({page})=>{
  await ready(page)
  for(const [ownerId,targetId] of [[0,2],[1,3]]) {
    let current=await held(page,{ownerId})
    expectStraightHeld(current)
    const face=facePoint(current,targetId)
    // The target's z differs from the owner's: a leftover face-hit resolver
    // would turn this shot diagonally instead of preserving the current lane.
    expect(current.players[targetId].z).not.toBe(current.players[ownerId].z)
    for(const point of [face,designPoint(current,250,720),designPoint(current,1650,650)]) {
      await page.mouse.move(point.x,point.y)
      current=await advance(page)
      expectStraightHeld(current)
      expect(current.charging).toBe(false)
    }
    await page.mouse.down()
    current=await advance(page,.14)
    expect(current).toMatchObject({phase:'held',charging:true,aim:{ownerId}})
    for(const point of [face,designPoint(current,960,805),designPoint(current,350,410)]) {
      await page.mouse.move(point.x,point.y,{steps:3})
      current=await advance(page)
      expectStraightHeld(current)
      expect(current.charging).toBe(true)
    }
    const aim=current.aim
    await page.mouse.up()
    // Read the voice group immediately after the real release, while the
    // short sample is active. Do not trigger another sound through the API.
    const released=await page.evaluate(()=>({current:window.__CAMPUS_TEST__.advanceDodgeball(0),audio:window.__CAMPUS_TEST__.audio()}))
    expectThrowHeading(released.current,aim)
    expect(released.audio.activeByGroup.basketballBounce??0).toBeGreaterThan(0)
    expect(released.audio.activeByGroup.basketballThrow??0).toBe(0)
  }
})

test('W/S position both endpoints before a K straight throw, and J no longer charges',async({page})=>{
  await ready(page)
  for(const [ownerId,key,moveSign] of [[0,'KeyW',-1],[1,'KeyS',1]]) {
    let current=await held(page,{ownerId})
    await page.keyboard.down('KeyJ')
    current=await advance(page,.12)
    expect(current).toMatchObject({phase:'held',charging:false,charge:0,ball:{ownerId,active:false}})
    await page.keyboard.up('KeyJ')
    expect((await state(page)).phase).toBe('held')
    const initialZ=current.players[ownerId].z
    await page.keyboard.down(key)
    current=await advance(page,.3)
    expect((current.players[ownerId].z-initialZ)*moveSign).toBeGreaterThan(.5)
    expect(current.players[ownerId].x).toBe(ownerId?12:-12)
    expectStraightHeld(current)
    await page.keyboard.up(key)
    await advance(page,.2)
    await page.keyboard.down('KeyK')
    current=await advance(page,.14)
    expect(current.charging).toBe(true)
    expect(current.charge).toBeGreaterThan(0)
    expectStraightHeld(current)
    const aim=current.aim
    await page.keyboard.up('KeyK')
    // Key release updates the simulation before the next render. Synchronize
    // presentation without advancing physics before checking the hidden cue.
    const thrown=await advance(page,0)
    expectThrowHeading(thrown,aim)
    expect(thrown.ball.throwerId).toBe(ownerId)
    expect(thrown.ball.z).toBeCloseTo(aim.origin.z,6)
  }
})

test('D cannot slow an attacker moving with W, and both roles share the z=5.7..14 limits',async({page})=>{
  await ready(page)
  let current=await held(page)
  await page.keyboard.down('KeyW')
  current=await advance(page,.3)
  const forwardSpeed=current.players[0].vz
  expect(forwardSpeed).toBeCloseTo(-5.4,6)
  await page.keyboard.down('KeyD')
  current=await advance(page,.2)
  expect(current.players[0].vz).toBeCloseTo(forwardSpeed,6)
  expect(current.players[0].x).toBe(-12)
  expect(current.players[0].vx).toBe(0)
  expectStraightHeld(current)
  await page.keyboard.up('KeyD');await page.keyboard.up('KeyW')
  for(const [ownerId,attackTeam,role] of [[0,'blue','attack'],[2,'red','defend']]) {
    current=await held(page,{ownerId,attackTeam})
    expect(current.players[current.controlledId].role).toBe(role)
    await page.keyboard.down('KeyS')
    current=await advance(page,1)
    expect(current.players[current.controlledId].z).toBe(14)
    expect(current.players[current.controlledId].vz).toBe(0)
    await page.keyboard.up('KeyS');await page.keyboard.down('KeyW')
    current=await advance(page,1.85)
    expect(current.players[current.controlledId].z).toBe(5.7)
    expect(current.players[current.controlledId].vz).toBe(0)
    await page.keyboard.up('KeyW')
  }
})

test('W stays held across the automatic end-to-end handoff even while K is still down',async({page})=>{
  await ready(page)
  await held(page,{safeLane:true})
  // Reach the end of a real five-second hold, then keep both keys physically
  // pressed through its automatic throw. No state/ownership is patched here.
  const late=await advance(page,4.55)
  expect(late.phase).toBe('held')
  await page.keyboard.down('KeyW');await page.keyboard.down('KeyK')
  const charged=await advance(page,.12)
  expect(charged).toMatchObject({phase:'held',charging:true,controlledId:0})
  expect(charged.players[0].z).toBeLessThan(late.players[0].z)
  let thrown=await advance(page,5.08-charged.holdElapsed)
  expect(thrown).toMatchObject({phase:'flight',charging:false,controlledId:1,ball:{throwerId:0,receiverId:1,active:true}})
  expect(thrown.input.keys).toContain('KeyW')
  expect(thrown.ball.vz).toBe(0)
  const attackId=thrown.ball.attackId
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const receiverZ=(await state(page)).players[1].z
  // Do not send another W event: the adapter must reapply the existing input
  // immediately when simulation.clearInput() accompanies the handoff.
  thrown=await advance(page,.12)
  expect(thrown.players[1].z).toBeLessThan(receiverZ)
  expect(thrown.players[1].vz).toBeLessThan(0)
  expect(thrown.input.keys).toContain('KeyW')
  await page.keyboard.up('KeyK')
  expect((await state(page)).ball.attackId).toBe(attackId)
  await page.keyboard.up('KeyW')
})

test('held W survives a real team clear when blue 0 changes from attacker to defender without changing controlledId',async({page})=>{
  await ready(page)
  await held(page,{ownerId:1,safeLane:true})
  // Start an actual right-to-left throw so blue 0 is already the controlled
  // receiving attacker before the last opponent is eliminated.
  await page.keyboard.down('KeyK');await advance(page,.1);await page.keyboard.up('KeyK')
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const initial=await advance(page,0)
  expect(initial).toMatchObject({phase:'flight',attackTeam:'blue',controlledId:0,
    scores:{blue:0,red:0},ball:{active:true,throwerId:1,receiverId:0}})
  expect(initial.players[0]).toMatchObject({id:0,role:'attack',alive:true})
  await page.keyboard.down('KeyW')
  try {
    const moving=await advance(page,.06)
    expect(moving.players[0].z).toBeLessThan(initial.players[0].z)
    const cleared=await page.evaluate(()=>{
      const api=window.__CAMPUS_TEST__,current=api.dodgeball()
      // Only arrange the remaining defender and an approaching live ball.
      // Neither phase, score, round nor controlledId is patched: the real
      // swept hit must award the point/clear bonus and enter switching.
      api.setDodgeballState({players:current.players.map(player=>({id:player.id,
        aiDecisionAt:1e9,aiReactionUntil:1e9,aiMoveX:0,aiMoveZ:0,aiTryCatch:false,aiJump:false,
        catchUntil:0,catchCooldownUntil:0,
        ...(player.id===2?{alive:false,action:'out'}:{}),
        ...(player.id===3?{alive:true,x:3.6,y:0,z:11,vx:0,vy:0,vz:0}:{}),
      })),ball:{x:4.8,y:1.7,z:11,vx:-30,vy:0,vz:0}})
      return api.advanceDodgeball(.06)
    })
    expect(cleared).toMatchObject({phase:'switching',attackTeam:'blue',controlledId:0,
      round:initial.round,scores:{blue:3,red:0},ball:{active:false,attackId:initial.ball.attackId},
      lastAttackResult:{reason:'hit',playerId:3,attackId:initial.ball.attackId}})
    expect(cleared.players.filter(player=>player.team==='red').every(player=>!player.alive)).toBe(true)
    expect(cleared.input.keys).toContain('KeyW')
    const switched=await advance(page,.95)
    expect(switched).toMatchObject({phase:'held',attackTeam:'red',controlledId:0,
      round:initial.round+1,scores:{blue:3,red:0},ball:{ownerId:2,active:false}})
    expect(switched.players[0]).toMatchObject({id:0,team:'blue',role:'defend',alive:true})
    expect(switched.input.keys).toContain('KeyW')
    // The simulation resets its move vector on the role switch. Give the real
    // adapter two frames to restore the still-pressed key, without another W
    // event (and without an ID change to accidentally cover the regression).
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    const beforeMove=await state(page),continued=await advance(page,.1)
    expect(continued).toMatchObject({controlledId:0,attackTeam:'red',scores:{blue:3,red:0}})
    expect(continued.players[0].role).toBe('defend')
    expect(continued.players[0].z).toBeLessThan(beforeMove.players[0].z)
    expect(continued.players[0].vz).toBeLessThan(0)
    expect(continued.input.keys).toContain('KeyW')
  } finally {
    await page.keyboard.up('KeyW')
  }
})

test('HUD hover and empty top clicks preserve the straight cue, and pause/defence hide it',async({page})=>{
  await ready(page)
  let current=await held(page)
  const face=facePoint(current,2)
  await page.mouse.move(face.x,face.y)
  current=await advance(page)
  const aim=current.aim
  expectStraightHeld(current)
  const pause=await hudPoint(page,'pause'),timer=designPoint(current,960,199)
  for(const point of [pause,timer]) {
    await page.mouse.move(point.x,point.y)
    current=await advance(page)
    expect(current.aim.target).toEqual(aim.target)
    expectHeading(current.aim.direction,aim.direction)
    expect(current.charging).toBe(false)
    expectIndicator(current)
  }
  // This is visibly empty above the play region, outside every HUD button.
  const blank=designPoint(current,625,245)
  await page.mouse.move(blank.x,blank.y);await page.mouse.down()
  current=await advance(page,.1)
  expect(current).toMatchObject({phase:'held',charging:false,charge:0})
  expectHeading(current.aim.direction,aim.direction)
  await page.mouse.up()
  expect((await state(page)).phase).toBe('held')
  await page.mouse.click(pause.x,pause.y)
  current=await advance(page)
  expect(current.paused).toBe(true)
  expect(current.visual.aimIndicator.visible).toBe(false)
  const resume=await hudPoint(page,'resume')
  await page.mouse.click(resume.x,resume.y)
  expectIndicator(await advance(page))
  current=await held(page,{ownerId:2,attackTeam:'red'})
  expect(current.players[current.controlledId].role).toBe('defend')
  expect(current.visual.aimIndicator.visible).toBe(false)
})

test.describe('phone position-aligned straight throws',()=>{
  test.use({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true})

  test('two real touch contacts move both endpoints with the joystick while throw-button drags cannot steer',async({page})=>{
    await ready(page)
    const client=await page.context().newCDPSession(page)
    let touchActive=false
    await page.evaluate(()=>{
      const controller=new AbortController(),events=[]
      window.__DODGEBALL_AIM_POINTER_LOG__={controller,events}
      // Observe at window capture because the canvas intentionally stops
      // propagation. This does not call, replace, or simulate game handlers.
      for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,event=>{
        if(event.pointerType!=='touch')return
        events.push({type,pointerId:event.pointerId,pointerType:event.pointerType,x:event.clientX,y:event.clientY,
          trusted:event.isTrusted,target:event.target.tagName,time:performance.now()})
      },{capture:true,signal:controller.signal})
    })
    const dispatchTouch=async(type,contacts,contact=contacts.at(-1))=>{
      const count=await page.evaluate(()=>window.__DODGEBALL_AIM_POINTER_LOG__.events.length)
      await client.send('Input.dispatchTouchEvent',{type,touchPoints:contacts})
      if(type==='touchStart')touchActive=true
      const expectedType=type==='touchStart'?'pointerdown':'pointermove'
      // CDP acknowledgement is not a DOM input checkpoint. In particular,
      // advanceDodgeball() advances physics without flushing coalesced moves.
      await expect.poll(()=>page.evaluate(({count,x,y,type})=>window.__DODGEBALL_AIM_POINTER_LOG__.events.slice(count).some(event=>
        event.type===type&&event.trusted&&Math.abs(event.x-x)<.75&&Math.abs(event.y-y)<.75),
      {count,x:contact.x,y:contact.y,type:expectedType}),{timeout:1500,message:`Actual ${expectedType} must arrive at the requested touch coordinates`}).toBe(true)
    }
    try {
      for(const [ownerId,z,moveSign] of [[0,5.7,1],[1,14,-1]]) {
        let current=await held(page,{ownerId,z,safeLane:true})
        expectStraightHeld(current)
        const initialHeading={...current.aim.direction},button=await hudPoint(page,'throw'),joystick=await hudPoint(page,'joystick')
        const first={id:11,x:joystick.x,y:joystick.y,radiusX:8,radiusY:8,force:1}
        const second={id:12,x:button.x,y:button.y,radiusX:8,radiusY:8,force:1}
        await dispatchTouch('touchStart',[first])
        first.y+=28*moveSign
        await dispatchTouch('touchMove',[first])
        current=await advance(page,.16)
        expect((current.players[ownerId].z-z)*moveSign).toBeGreaterThan(.1)
        expect(current.players[ownerId].x).toBe(ownerId?12:-12)
        expectStraightHeld(current)
        await dispatchTouch('touchStart',[first,second])
        current=await advance(page,.12)
        expect(current).toMatchObject({phase:'held',charging:true,input:{pointers:2}})
        expect(current.charge).toBeGreaterThan(0)
        expectHeading(current.aim.direction,initialHeading);expectStraightHeld(current)
        // Move the throwing finger a clearly intentional distance in BOTH
        // axes. Only the separate joystick contact may change the owner lane.
        for(const [dx,dy] of [[-42,0],[-42,-6],[-70,-35]]) {
          second.x=button.x+dx;second.y=button.y+dy
          await dispatchTouch('touchMove',[first,second])
          current=await advance(page,.04)
          expectHeading(current.aim.direction,initialHeading)
          expectStraightHeld(current)
          expect(current).toMatchObject({charging:true,input:{pointers:2}})
        }
        const releaseAim=current.aim
        // Chromium's partial touchEnd supplies the ended contact. The other
        // pointer remains captured, just as in the phone gameplay regression.
        await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[second]})
        await expect.poll(()=>state(page)).toMatchObject({phase:'flight',charging:false,controlledId:ownerId?0:1,input:{pointers:1}})
        current=await advance(page)
        expectThrowHeading(current,releaseAim)
        const receiver=current.controlledId,receiverZ=current.players[receiver].z
        current=await advance(page,.1)
        expect((current.players[receiver].z-receiverZ)*moveSign).toBeGreaterThan(0)
        await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
        touchActive=false
        await expect.poll(()=>state(page)).toMatchObject({charging:false,input:{pointers:0,move:{x:0,z:0}}})
      }
    } finally {
      try {
        try {
          if(touchActive) {
            await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
            touchActive=false
          }
        } finally {
          const diagnostics=await page.evaluate(()=>{
            const log=window.__DODGEBALL_AIM_POINTER_LOG__,current=window.__CAMPUS_TEST__.dodgeball()
            log.controller.abort();delete window.__DODGEBALL_AIM_POINTER_LOG__
            return {events:log.events,phase:current.phase,charging:current.charging,aim:current.aim,input:current.input}
          })
          await test.info().attach('real-touch-pointer-delivery',{body:JSON.stringify(diagnostics,null,2),contentType:'application/json'})
        }
      } finally {
        await client.detach()
      }
    }
  })
})

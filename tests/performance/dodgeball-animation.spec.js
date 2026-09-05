import {expect,test} from '@playwright/test'

// Real keyboard events drive the existing campus adapter. Test-only state
// arrangement supplies positions and quiet AI, never animation or catch wins.
const errorsByPage=new WeakMap()
test.beforeEach(({page})=>{
  const errors=[];errorsByPage.set(page,errors)
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
})
test.afterEach(({page})=>expect(errorsByPage.get(page)).toEqual([]))

const state=page=>page.evaluate(()=>window.__CAMPUS_TEST__.dodgeball())
const advance=(page,seconds=0)=>page.evaluate(seconds=>window.__CAMPUS_TEST__.advanceDodgeball(seconds),seconds)
const actor=(current,id)=>current.players.find(player=>player.id===id)
const pose=(current,id)=>current.visual.players.find(player=>player.id===id).pose
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]))
const frozen=current=>({phase:current.phase,phaseElapsed:current.phaseElapsed,elapsed:current.elapsed,
  timeRemaining:current.timeRemaining,ball:current.ball,players:current.players,catchDisplay:current.catchDisplay,
  visual:current.visual.players,displayedBall:current.visual.ball})

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

const arrange=(page,{attackTeam='blue',ownerId=0,flight=false,ballMode='pingpong'}={})=>page.evaluate(options=>{
  const api=window.__CAMPUS_TEST__,{attackTeam,ownerId,flight,ballMode}=options
  const players=Array.from({length:4},(_,id)=>{
    const team=id<2?'blue':'red',slot=id%2,role=team===attackTeam?'attack':'defend'
    return {id,team,slot,role,alive:true,x:role==='attack'?(slot?12:-12):(slot?3.6:-3.5),
      y:0,z:role==='attack'?11:(slot?14:5.7),vx:0,vy:0,vz:0,
      yaw:role==='attack'?(slot?-Math.PI/2:Math.PI/2):0,
      action:'idle',actionTime:0,actionDuration:0,catchUntil:0,catchCooldownUntil:0,
      aiDecisionAt:1e9,aiReactionUntil:1e9,aiThrowAfter:1e9,
      aiMoveX:0,aiMoveZ:0,aiTryCatch:false,aiJump:false}
  })
  const owner=players[ownerId],sign=owner.slot?-1:1,radius=ballMode==='beanbag'?.24:.21
  api.setDodgeballState({phase:flight?'flight':'held',phaseElapsed:0,ballMode,attackTeam,
    controlledId:attackTeam==='blue'?(flight?ownerId^1:ownerId):0,
    catchDisplay:null,holdElapsed:0,charge:0,charging:false,timeRemaining:180,
    winner:null,feedback:null,lastAttackResult:null,players,scores:{blue:0,red:0},
    ball:flight
      ?{x:-12,y:5,z:11,vx:1,vy:6,vz:0,radius,active:true,ownerId:null,
        throwerId:ownerId,receiverId:ownerId^1,attackId:api.dodgeball().ball.attackId+1,bounces:0}
      :{x:owner.x+sign*.72,y:2.05,z:owner.z,vx:0,vy:0,vz:0,radius,active:false,
        ownerId,throwerId:null,receiverId:null,attackId:api.dodgeball().ball.attackId,bounces:0}})
  // Observe ownership before a real key is held; adapter handoff cleanup must
  // not mistake arrangement for a mid-gesture ownership transition.
  return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(api.advanceDodgeball(0)))))
},{attackTeam,ownerId,flight,ballMode})

const incoming=(page,{playerId=0,duration=.06}={})=>page.evaluate(({playerId,duration})=>{
  const api=window.__CAMPUS_TEST__,current=api.dodgeball(),player=current.players[playerId]
  const direction=player.role==='attack'?(player.slot?1:-1):1
  api.setDodgeballState({ball:{x:player.x-direction*1.5,y:player.y+1.7,z:player.z,
    vx:direction*30,vy:player.vy,vz:0}})
  return api.advanceDodgeball(duration)
},{playerId,duration})

const expectClasp=(current,id)=>{
  const presentation=pose(current,id),ball=current.visual.ball.position
  expect(actor(current,id)).toMatchObject({action:'caught',actionDuration:.55,vx:0,vz:0})
  expect(presentation.action).toBe('caught')
  expect(current.visual.ball.visible).toBe(true)
  expect(presentation.ballAnchor).not.toBeNull()
  // The first 60 ms deliberately gather the dead projectile into the palms.
  // Thereafter the visible ball is attached, not immediately retrieved away.
  if(current.phaseElapsed>=.06) {
    expect(distance(ball,presentation.ballAnchor)).toBeLessThan(.001)
    expect(distance(presentation.leftHand,ball)).toBeLessThan(.8)
    expect(distance(presentation.rightHand,ball)).toBeLessThan(.8)
  }
}

test('K release gives both endpoints a sustained forward throw, extended arm and trailing foot',async({page})=>{
  await ready(page)
  for(const ownerId of [0,1]) {
    const initial=await arrange(page,{ownerId}),sign=ownerId?-1:1
    await page.keyboard.down('KeyK')
    const charged=await advance(page,.3)
    expect(charged.charging).toBe(true)
    await page.keyboard.up('KeyK')
    const released=await advance(page,0)
    expect(released).toMatchObject({phase:'flight',controlledId:ownerId^1,
      ball:{active:true,throwerId:ownerId,attackId:initial.ball.attackId+1,vz:0}})
    expect(actor(released,ownerId)).toMatchObject({action:'throw',actionDuration:.55})
    const forward=await advance(page,.12),throwPose=pose(forward,ownerId)
    expect(throwPose.action).toBe('throw')
    expect(throwPose.spine[0]).toBeGreaterThan(.2)
    expect((throwPose.rightHand[0]-throwPose.leftHand[0])*sign).toBeGreaterThan(.6)
    expect(Math.abs(throwPose.leftFoot[0]-throwPose.rightFoot[0])).toBeGreaterThan(.4)
    expect(actor(await advance(page,.15),ownerId).action).toBe('throw')
    // Pausing the receiver cannot collapse the thrower's follow-through.
    await page.keyboard.press('Escape')
    const paused=await state(page)
    expect(paused.paused).toBe(true)
    expect(frozen(await advance(page,2))).toEqual(frozen(paused))
    await page.keyboard.press('Escape')
    expect(actor(await advance(page,.4),ownerId).action).not.toBe('throw')
  }
})

test('successful K catch visibly clasps the ball, stops translation, and freezes cleanly across pause',async({page})=>{
  await ready(page)
  await arrange(page,{attackTeam:'red',ownerId:2,flight:true})
  await page.keyboard.down('KeyS');await advance(page,.1)
  await page.keyboard.press('KeyK')
  const attempt=await advance(page,0)
  expect(actor(attempt,0).action).toBe('catch')
  expect(actor(attempt,0).catchUntil).toBeGreaterThan(attempt.elapsed)
  const caught=await incoming(page)
  expect(caught).toMatchObject({phase:'returning',scores:{blue:1,red:0},
    lastAttackResult:{reason:'catch',playerId:0},catchDisplay:{playerId:0,duration:.55},ball:{active:false}})
  expectClasp(caught,0)
  const settled=await advance(page,.12)
  expect(actor(settled,0).x).toBe(actor(caught,0).x)
  expect(actor(settled,0).z).toBe(actor(caught,0).z)
  expect(settled.timeRemaining).toBeLessThan(caught.timeRemaining)
  expectClasp(settled,0)
  const held=await advance(page,.12)
  expect(held.ball).toEqual(settled.ball)
  expectClasp(held,0)
  expect(pose(held,0).leftHand).toEqual(pose(settled,0).leftHand)
  expect(pose(held,0).rightHand).toEqual(pose(settled,0).rightHand)
  expect(pose(held,0).spine).toEqual(pose(settled,0).spine)
  await page.keyboard.up('KeyS')
  await page.keyboard.press('Escape')
  const paused=await state(page)
  expect(paused.paused).toBe(true)
  expect(actor(paused,0).action).toBe('caught')
  expect(frozen(await advance(page,2))).toEqual(frozen(paused))
  await page.waitForTimeout(80)
  expect(frozen(await state(page))).toEqual(frozen(paused))
  await page.keyboard.press('Escape')
  const resumed=await advance(page,.1)
  expect(resumed.paused).toBe(false)
  expect(resumed.phaseElapsed).toBeGreaterThan(paused.phaseElapsed)
  expect(resumed.scores).toEqual({blue:1,red:0})
  expectClasp(resumed,0)
  const retrieving=await advance(page,.35)
  expect(retrieving.phase).toBe('returning')
  expect(distance([retrieving.ball.x,retrieving.ball.y,retrieving.ball.z],
    [held.ball.x,held.ball.y,held.ball.z])).toBeGreaterThan(.1)
  const returned=await advance(page,.8)
  expect(returned).toMatchObject({phase:'held',ball:{ownerId:3,active:false},scores:{blue:1,red:0}})
})

test('a real jump then K catch keeps horizontal confirmation still but gravity lands the player',async({page})=>{
  await ready(page)
  await arrange(page,{attackTeam:'red',ownerId:2,flight:true,ballMode:'beanbag'})
  await page.keyboard.press('Space');await advance(page,.32)
  await page.keyboard.down('KeyD');await page.keyboard.press('KeyK')
  const jumping=await advance(page,0)
  expect(actor(jumping,0).y).toBeGreaterThan(1)
  const caught=await incoming(page)
  expectClasp(caught,0)
  const still=await advance(page,.24)
  expect(actor(still,0).x).toBe(actor(caught,0).x)
  expect(actor(still,0).z).toBe(actor(caught,0).z)
  expect(actor(still,0).vy).toBeLessThan(actor(caught,0).vy)
  expect(actor(still,0).y).not.toBe(actor(caught,0).y)
  expectClasp(still,0)
  await page.keyboard.up('KeyD')
  const landed=await advance(page,.6)
  expect(actor(landed,0)).toMatchObject({y:0,vy:0,alive:true})
  expect(landed.scores).toEqual({blue:1,red:0})
})

test('human and computer endpoint catches and a computer defensive catch share successful presentation',async({page})=>{
  await ready(page)
  for(const [attackTeam,ownerId,catcherId,defensive] of [
    ['blue',0,1,false],['red',2,3,false],['blue',0,2,true],
  ]) {
    await arrange(page,{attackTeam,ownerId,flight:true})
    if(defensive) {
      // Ordinary AI decision receives a finite predicted incoming ball; do not
      // set catchUntil or action. isAi/performCatch must open the same window.
      await page.evaluate(catcherId=>{
        const api=window.__CAMPUS_TEST__,current=api.dodgeball(),player=current.players[catcherId]
        api.setDodgeballState({players:[{id:catcherId,aiDecisionAt:0,aiReactionUntil:0,
          aiTryCatch:true,aiCatchAttempted:false,aiDodgeAttackId:null}],
          ball:{x:player.x-3.5,y:1.7,z:player.z,vx:25,vy:0,vz:0}})
      },catcherId)
    }
    const caught=defensive?await advance(page,.18):await incoming(page,{playerId:catcherId})
    expect(caught).toMatchObject({phase:'returning',lastAttackResult:{reason:'catch',playerId:catcherId},
      catchDisplay:{playerId:catcherId,duration:.55},ball:{active:false}})
    expect(caught.scores).toEqual({blue:0,red:defensive?1:0})
    expectClasp(caught,catcherId)
    const later=await advance(page,.18)
    expectClasp(later,catcherId)
    expect(actor(later,catcherId).x).toBe(actor(caught,catcherId).x)
    expect(actor(later,catcherId).z).toBe(actor(caught,catcherId).z)
  }
})

test('twenty real throw and endpoint-catch transitions reuse prewarmed scene and HUD resources',async({page})=>{
  await ready(page)
  const capture=()=>page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__,current=api.dodgeball()
    return {memory:{...api.performanceSnapshot().renderer.memory},
      scene:{materials:current.visual.sceneMaterials,geometries:current.visual.sceneGeometries,meshes:current.visual.drawableMeshes},
      hud:{materials:current.hud.scene.materials,meshes:current.hud.scene.meshes,atlasSize:current.hud.scene.atlasSize,
        textureVersion:current.hud.scene.textureVersion,burstTextureVersion:current.hud.scene.burstTextureVersion},
      requests:performance.getEntriesByType('resource').map(entry=>entry.name)}
  })
  const cycle=async index=>{
    const ownerId=index%2
    await arrange(page,{ownerId,ballMode:index%2?'beanbag':'pingpong'})
    await page.keyboard.down('KeyK');await advance(page,.08);await page.keyboard.up('KeyK')
    const thrown=await advance(page,0)
    expect(actor(thrown,ownerId).action).toBe('throw')
    const caught=await incoming(page,{playerId:ownerId^1})
    expect(caught).toMatchObject({phase:'returning',lastAttackResult:{reason:'catch',playerId:ownerId^1},ball:{active:false}})
    expectClasp(caught,ownerId^1)
    expect((await advance(page,1.3)).phase).toBe('held')
  }
  await cycle(0);await cycle(1)
  const before=await capture()
  for(let index=0;index<20;index++)await cycle(index)
  expect(await capture()).toEqual(before)
})

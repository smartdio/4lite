import {expect,test} from '@playwright/test'

// Real match/restart/input and natural flight/return transitions. The existing
// test API only shortens a completed match and fixes player positions/AI noise;
// it never patches phase, ball ownership, hold time, or the serve countdown.
const errorsByPage=new WeakMap()
test.beforeEach(({page})=>{
  const errors=[];errorsByPage.set(page,errors)
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
})
test.afterEach(({page})=>expect(errorsByPage.get(page)).toEqual([]))

const state=page=>page.evaluate(()=>window.__CAMPUS_TEST__.dodgeball())
const advance=(page,seconds=0)=>page.evaluate(seconds=>window.__CAMPUS_TEST__.advanceDodgeball(seconds),seconds)
const hudPoint=(page,action)=>page.evaluate(action=>{
  const current=window.__CAMPUS_TEST__.dodgeball(),bounds=current.hud.buttons[action],v=current.viewport
  if(!bounds)throw new Error(`No active dodgeball ${action} button in ${current.phase}`)
  return {x:v.left+(bounds.left+bounds.right)/2/1920*v.width,y:v.top+(bounds.top+bounds.bottom)/2/1080*v.height,
    width:(bounds.right-bounds.left)/1920*v.width,height:(bounds.bottom-bounds.top)/1080*v.height}
},action)
const clickHud=async(page,action,touch=false)=>{
  const point=await hudPoint(page,action)
  if(touch)await page.touchscreen.tap(point.x,point.y)
  else await page.mouse.click(point.x,point.y)
}
const attachView=async(page,testInfo,name)=>testInfo.attach(name,{body:await page.screenshot(),contentType:'image/png'})
const frozenFields=current=>({phase:current.phase,elapsed:current.elapsed,timeRemaining:current.timeRemaining,
  holdElapsed:current.holdElapsed,aiServeCountdown:current.aiServeCountdown,aiServeRemaining:current.aiServeRemaining,
  scores:current.scores,players:current.players,ball:current.ball,charge:current.charge,charging:current.charging})
const realFrames=page=>page.evaluate(()=>new Promise(resolve=>{
  let remaining=12
  const frame=()=>{if(--remaining<=0)resolve();else requestAnimationFrame(frame)}
  requestAnimationFrame(frame)
}))

function expectCountdown(current,value) {
  expect(current).toMatchObject({phase:'held',attackTeam:'red',controlledId:0,charging:false,charge:0,
    aiServeCountdown:value,ball:{active:false},hud:{serveCountdown:{visible:true,value,label:'电脑发球 · 准备躲避'}}})
  expect(current.players.find(player=>player.id===current.ball.ownerId)).toMatchObject({team:'red',role:'attack',alive:true})
  expect(current.players[current.controlledId]).toMatchObject({team:'blue',role:'defend',alive:true})
  expect(current.aiServeRemaining).toBeGreaterThan(0)
  expect(current.aiServeRemaining).toBeCloseTo(3-current.holdElapsed,7)
  expect(Math.ceil(current.aiServeRemaining-1e-9)).toBe(value)
  // A narrow banner above the playable figures, in the fixed 1920x1080 HUD.
  expect(current.hud.serveCountdown.bounds).toEqual({left:695,right:1225,top:253,bottom:315})
  expect(current.visual.aimIndicator.visible).toBe(false)
}

const beginRedServe=async(page,testInfo,{touch=false}={})=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  const before=await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__,entry=api.config.facilities.dodgeball.entry
    const [x,z]=entry.center,edge=z+entry.size[1]/2,y=entry.surfaceY??.012
    const player=api.teleport(x,edge+.55,x,edge-.5,0,y+.035)
    return {player,controls:api.controls()}
  })
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterDodgeball())
  await clickHud(page,'pingpong',touch);await clickHud(page,'start',touch)
  let current=await advance(page,.8)
  expect(current).toMatchObject({phase:'held',attackTeam:'blue',ball:{ownerId:0},aiServeCountdown:0,aiServeRemaining:0,
    hud:{serveCountdown:{visible:false}},visual:{aimIndicator:{visible:true,style:'spotlight',transparent:true}}})
  if(!touch)await attachView(page,testInfo,'blue-held-translucent-spotlight')
  current=await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__
    api.setDodgeballState({timeRemaining:.01,scores:{blue:1,red:0}})
    return api.advanceDodgeball(.02)
  })
  expect(current).toMatchObject({phase:'finished',winner:'blue',timeRemaining:0})
  await clickHud(page,'restart',touch)
  expect(await state(page)).toMatchObject({phase:'ready',attackTeam:'red',ball:{ownerId:2},
    aiServeCountdown:0,aiServeRemaining:0,hud:{serveCountdown:{visible:false}}})
  expectCountdown(await advance(page,.8),3)
  return before
}

const configureMiss=page=>page.evaluate(()=>{
  const api=window.__CAMPUS_TEST__,current=api.dodgeball()
  // Freeze movement decisions, not serve timing. Both red endpoints stand in
  // the same legal z=5.7 lane, far from the blue defenders at z=14. A straight
  // throw misses both defenders, then naturally reaches the receiving endpoint
  // or the outer boundary; either transition must start a fresh three seconds.
  return api.setDodgeballState({players:current.players.map(player=>({id:player.id,
    z:player.team==='blue'?14:5.7,y:0,vx:0,vy:0,vz:0,aiDecisionAt:1e9,aiReactionUntil:1e9,
    aiMoveX:0,aiMoveZ:0,aiTryCatch:false,aiJump:false,catchUntil:0}))})
})

const countdownSamples=(page,ages)=>page.evaluate(ages=>{
  const api=window.__CAMPUS_TEST__,samples=[]
  // Capture each timing boundary in one JS task so wall-clock RAFs cannot
  // skip a digit between the requested step and the corresponding assertion.
  for(const age of ages) {
    const current=api.dodgeball()
    if(current.phase!=='held')throw new Error(`Expected an actual held serve before age ${age}; got ${current.phase}`)
    samples.push(api.advanceDodgeball(Math.max(0,age-current.holdElapsed)))
  }
  return samples
},ages)

const nextNaturalServe=page=>page.evaluate(()=>{
  const api=window.__CAMPUS_TEST__,first=api.dodgeball(),expectedOwner=first.ball.receiverId
  // throwBall legitimately resets NPC decision deadlines. Freeze those fresh
  // movement decisions again without changing the live ball or its velocity.
  api.setDodgeballState({players:first.players.map(player=>({id:player.id,aiDecisionAt:1e9,aiReactionUntil:1e9,
    aiMoveX:0,aiMoveZ:0,aiTryCatch:false,aiJump:false,vx:0,vz:0}))})
  let current=api.dodgeball()
  const transitions=[current.phase]
  for(let index=0;index<120&&!(current.phase==='held'&&current.ball.ownerId===expectedOwner);index++) {
    current=api.advanceDodgeball(.025)
    if(transitions.at(-1)!==current.phase)transitions.push(current.phase)
  }
  return {current,expectedOwner,transitions}
})

async function expectPauseFreezes(page,{touch=false}={}) {
  await clickHud(page,'pause',touch)
  const paused=await state(page)
  expect(paused).toMatchObject({paused:true,phase:'held',hud:{serveCountdown:{visible:false}},
    visual:{aimIndicator:{visible:false}},input:{keys:[],pointers:0,move:{x:0,z:0}}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'dodgeball',minigamePaused:true})
  expect(frozenFields(await advance(page,5))).toEqual(frozenFields(paused))
  await realFrames(page)
  expect(frozenFields(await state(page))).toEqual(frozenFields(paused))
  await clickHud(page,'resume',touch)
  const resumed=await advance(page,.05)
  expect(resumed.paused).toBe(false)
  expectCountdown(resumed,paused.aiServeCountdown)
  // Only resumed simulation time passes; neither the five test seconds nor
  // the real paused frames can be accumulated and replayed after resume.
  expect(resumed.holdElapsed-paused.holdElapsed).toBeGreaterThanOrEqual(.05-1e-8)
  expect(resumed.holdElapsed-paused.holdElapsed).toBeLessThan(.2)
  expect(paused.aiServeRemaining-resumed.aiServeRemaining).toBeCloseTo(resumed.holdElapsed-paused.holdElapsed,7)
}

async function expectExitRestores(page,before,{touch=false}={}) {
  await clickHud(page,'exit',touch)
  expect(await state(page)).toMatchObject({status:'idle',phase:'selection',paused:false,aiServeCountdown:0,aiServeRemaining:0,
    input:{keys:[],pointers:0,move:{x:0,z:0}}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(before.player)
  const controls=await page.evaluate(()=>window.__CAMPUS_TEST__.controls())
  expect(controls).toMatchObject({mode:'walk',minigamePaused:false})
  expect(controls.rotation).toEqual(before.controls.rotation)
  expect(controls.projection).toEqual(before.controls.projection)
}

test('every CPU-held ball provides 3/2/1 preparation, permits movement/jump, freezes on pause, and resets at both ends',async({page},testInfo)=>{
  const before=await beginRedServe(page,testInfo)
  const initial=await state(page)
  await page.keyboard.down('KeyW');await page.keyboard.press('Space')
  let current=await advance(page,.12)
  await page.keyboard.up('KeyW')
  expect(current.players[0].z).toBeLessThan(initial.players[0].z)
  expect(current.players[0].y).toBeGreaterThan(0)
  expectCountdown(current,3)
  await configureMiss(page)
  await attachView(page,testInfo,'red-defence-serve-countdown')
  const [two]=await countdownSamples(page,[1.2])
  expectCountdown(two,2)
  await expectPauseFreezes(page)
  const [one,lastHeld,shot]=await countdownSamples(page,[2.2,2.99,3])
  expectCountdown(one,1);expectCountdown(lastHeld,1)
  expect(lastHeld.holdElapsed).toBeCloseTo(2.99,7)
  expect(shot).toMatchObject({phase:'flight',holdElapsed:expect.any(Number),ball:{active:true,ownerId:null,throwerId:2,receiverId:3},
    aiServeCountdown:0,aiServeRemaining:0,hud:{serveCountdown:{visible:false}}})
  expect(shot.holdElapsed).toBeCloseTo(3,7)
  expect(Math.hypot(shot.ball.vx,shot.ball.vz)).toBeGreaterThanOrEqual(30)
  expect(Math.hypot(shot.ball.vx,shot.ball.vz)).toBeLessThanOrEqual(36)
  expect(shot.ball.vx).toBeGreaterThan(0);expect(shot.ball.vz).toBe(0)
  expect(shot.ball.z).toBeCloseTo(5.7,7)
  // Exercise both hand-offs, not just the first opening serve. Nothing patches
  // the ball/phase; catch/out -> returning -> giveBall owns every fresh countdown.
  for(const ownerId of [3,2]) {
    const returned=await nextNaturalServe(page)
    expect(returned.expectedOwner).toBe(ownerId)
    expect(returned.transitions).toContain('returning')
    expect(returned.current).toMatchObject({phase:'held',ball:{ownerId},scores:{blue:0,red:0}})
    expect(['catch','out']).toContain(returned.current.lastAttackResult.reason)
    if(returned.current.lastAttackResult.reason==='catch')expect(returned.current.lastAttackResult).toMatchObject({team:'red',playerId:ownerId})
    expectCountdown(returned.current,3)
    expect(returned.current.aiServeRemaining).toBeGreaterThan(2.97)
    await configureMiss(page)
    const [nextTwo,nextOne,beforeThrow,nextShot]=await countdownSamples(page,[1.2,2.2,2.99,3])
    expectCountdown(nextTwo,2);expectCountdown(nextOne,1);expectCountdown(beforeThrow,1)
    expect(nextShot).toMatchObject({phase:'flight',ball:{active:true,ownerId:null,throwerId:ownerId},
      aiServeCountdown:0,aiServeRemaining:0,hud:{serveCountdown:{visible:false}}})
    expect(nextShot.ball.vx*(ownerId%2?-1:1)).toBeGreaterThan(0)
    expect(nextShot.ball.vz).toBe(0);expect(nextShot.ball.z).toBeCloseTo(5.7,7)
  }
  await expectExitRestores(page,before)
})

test.describe('phone defence preparation',()=>{
  test.use({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true})

  test('real touch pause/resume freezes the CPU countdown and touch exit restores campus controls',async({page},testInfo)=>{
    const before=await beginRedServe(page,testInfo,{touch:true})
    for(const action of ['jump','pause','exit']) {
      const bounds=await hudPoint(page,action)
      expect(bounds.width).toBeGreaterThanOrEqual(43.99)
      expect(bounds.height).toBeGreaterThanOrEqual(43.99)
    }
    await clickHud(page,'jump',true)
    let current=await advance(page,.1)
    expect(current.players[0].y).toBeGreaterThan(0)
    expect(current.input.pointers).toBe(0)
    expectCountdown(current,3)
    await configureMiss(page)
    await attachView(page,testInfo,'phone-defence-serve-countdown')
    const [two]=await countdownSamples(page,[1.2])
    expectCountdown(two,2)
    await expectPauseFreezes(page,{touch:true})
    const [one,lastHeld,shot]=await countdownSamples(page,[2.2,2.99,3])
    expectCountdown(one,1);expectCountdown(lastHeld,1)
    expect(shot).toMatchObject({phase:'flight',ball:{active:true,ownerId:null,throwerId:2},
      aiServeCountdown:0,aiServeRemaining:0,hud:{serveCountdown:{visible:false}},input:{pointers:0}})
    expect(shot.ball.vx).toBeGreaterThan(0);expect(shot.ball.vz).toBe(0)
    expect(shot.ball.z).toBeCloseTo(5.7,7)
    await expectExitRestores(page,before,{touch:true})
  })
})

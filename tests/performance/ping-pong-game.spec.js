import {expect,test} from '@playwright/test'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}
const exitPauseMenu=async page=>{
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigamePause.visible)).toBe(true)
  const bounds=await page.evaluate(()=>window.__CAMPUS_TEST__.hud().minigamePause.exitBounds)
  await page.mouse.click((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2)
}

test('all six tables share one correctly aligned game controller',async({page})=>{
  await ready(page)
  for(let index=0;index<6;index++) {
    const entered=await page.evaluate(index=>window.__CAMPUS_TEST__.enterPingPongTable(index),index)
    expect(entered).toMatchObject({status:'active',activeTable:index,simulations:1,phase:'ready',mode:'practice',server:'player'})
    expect(entered.table).toMatchObject({size:[2.077,1.35],surfaceY:.628,netTopY:.715,playerSide:'east-positive-x'})
    expect(entered.paddles.player[0]-(entered.table.center[0]+entered.table.size[0]/2)).toBeCloseTo(.20,3)
    expect(entered.props).toMatchObject({
      paddles:12,balls:6,sharedPaddleGeometry:true,sharedPaddleMaterial:true,
      rubberColours:['faded-red','worn-black','deep-blue'],staticPaddleMeshes:3,
      tableHitProxies:6,tableHitProxyGeometryShared:true,
    })
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('pingPong')
    const exited=await page.evaluate(()=>window.__CAMPUS_TEST__.exitPingPong())
    expect(exited).toMatchObject({status:'idle',activeTable:null,simulations:0})
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('walk')
  }
})

test('the live ball projects a height-sensitive shadow onto the table and ground',async({page})=>{
  await ready(page)
  const entered=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const [cx,cz]=entered.table.center,surface=entered.table.surfaceY
  const low=await page.evaluate(({cx,cz,surface})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[cx+.35,surface+.12,cz],velocity:[0,0,0],phase:'toss',active:true,
  }),{cx,cz,surface})
  expect(low.ball.shadow).toMatchObject({visible:true,receiver:'table'})
  expect(low.ball.shadow.position[1]).toBeCloseTo(surface+.003,3)

  const high=await page.evaluate(({cx,cz,surface})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[cx+.35,surface+.92,cz],velocity:[0,0,0],phase:'toss',active:true,
  }),{cx,cz,surface})
  expect(high.ball.shadow).toMatchObject({visible:true,receiver:'table'})
  expect(high.ball.shadow.scale[0]).toBeGreaterThan(low.ball.shadow.scale[0])
  expect(high.ball.shadow.opacity).toBeLessThan(low.ball.shadow.opacity)

  const outside=await page.evaluate(({cx,cz,surface})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[cx+2.2,surface+.6,cz],velocity:[0,0,0],phase:'rally',active:true,
  }),{cx,cz,surface})
  expect(outside.ball.shadow).toMatchObject({visible:true,receiver:'ground'})
  expect(outside.ball.shadow.position.every(Number.isFinite)).toBe(true)
})

test('Escape pauses ping-pong and the return control restores walking',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-39.78,-40.525,-41.04,-40.165,0,.646))
  await page.locator('canvas').click({position:{x:640,y:360}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())).toMatchObject({status:'active',activeTable:0})
  await page.keyboard.press('Escape')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())).toMatchObject({status:'active',activeTable:0})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'pingPong',minigamePaused:true})
  expect(await page.evaluate(()=>document.body.classList.contains('minigame-paused'))).toBe(true)
  expect(await page.locator('canvas').evaluate(node=>getComputedStyle(node).cursor)).toBe('default')
  await exitPauseMenu(page)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())).toMatchObject({status:'idle',activeTable:null})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('walk')
  expect(await page.evaluate(()=>document.body.classList.contains('minigame-paused'))).toBe(false)
})

test('match camera disables free look, frames the table, and remains fully fixed',async({page})=>{
  await ready(page)
  const entered=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const controls=await page.evaluate(()=>window.__CAMPUS_TEST__.controls())
  expect(controls).toMatchObject({mode:'pingPong',pointerLookEnabled:false})
  expect(controls.projection.verticalFov).toBe(50)
  expect(entered.camera.fixed).toBe(true)
  // 拉近到近侧桌边约0.95m，并提高俯视角，让桌面占据更多画面。
  expect(entered.camera.position[0]-(entered.table.center[0]+entered.table.size[0]/2)).toBeCloseTo(.95,3)
  expect(entered.camera.position[1]-entered.camera.target[1]).toBeCloseTo(.94,3)

  const beforeRotation=controls.rotation
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:500,clientY:360,movementX:0,movementY:0})
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:720,clientY:360,movementX:220,movementY:0})
  await page.waitForTimeout(250)
  const followed=await page.evaluate(()=>({game:window.__CAMPUS_TEST__.pingPongGame(),controls:window.__CAMPUS_TEST__.controls()}))
  expect(followed.controls.pointerLookEnabled).toBe(false)
  expect(followed.game.camera.position).toEqual(entered.camera.position)
  expect(followed.game.camera.target).toEqual(entered.camera.target)
  expect(followed.controls.rotation).toEqual(beforeRotation)

  await page.evaluate(()=>window.__CAMPUS_TEST__.exitPingPong())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().pointerLookEnabled)).toBe(true)
})

test('mouse horizontal movement sends the on-screen paddle in the same direction',async({page})=>{
  await ready(page)
  const entered=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:840,clientY:360,movementX:200,movementY:0})
  await page.waitForTimeout(250)
  const movedRight=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(movedRight.paddles.playerScreen[0]).toBeGreaterThan(entered.paddles.playerScreen[0])

  await page.locator('canvas').dispatchEvent('pointermove',{clientX:440,clientY:360,movementX:-400,movementY:0})
  await page.waitForTimeout(250)
  const movedLeft=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(movedLeft.paddles.playerScreen[0]).toBeLessThan(movedRight.paddles.playerScreen[0])
})

test('player paddle reaches the mouse target within one rendered frame without catch-up lag',async({page})=>{
  await ready(page)
  const entered=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:740,clientY:310,movementX:100,movementY:-50})
  await page.waitForTimeout(34)
  const moved=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(moved.paddles.player[2]).toBeCloseTo(entered.paddles.player[2]-.36,2)
  expect(moved.paddles.player[0]).toBeCloseTo(entered.paddles.player[0]-.15,2)
  expect(moved.paddles.player[1]).toBeCloseTo(entered.paddles.player[1],3)
})

test('before the toss, the serve ball follows the paddle and releases from that chosen position',async({page})=>{
  await ready(page)
  const entered=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  expect(entered.ball.position[0]).toBeCloseTo(entered.paddles.player[0]-.12,3)
  expect(entered.ball.position[1]).toBeCloseTo(entered.paddles.player[1]+.075,3)
  expect(entered.paddles.playerRotation[0]).toBeGreaterThan(0)
  expect(entered.ball.position[2]).toBeCloseTo(entered.paddles.player[2]-.09,3)

  await page.locator('canvas').dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:760,clientY:280,movementX:120,movementY:-80})
  await page.waitForTimeout(250)
  let moved=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(moved.ball.position[0]-entered.ball.position[0]).toBeCloseTo(moved.paddles.player[0]-entered.paddles.player[0],3)
  expect(moved.ball.position[1]).toBeCloseTo(entered.ball.position[1],3)
  expect(moved.paddles.player[2]).toBeLessThan(moved.table.center[1])
  expect(moved.paddles.playerRotation[0]).toBeLessThan(0)
  expect(moved.ball.position[2]).toBeCloseTo(moved.paddles.player[2]+.09,3)

  await page.evaluate(()=>window.__CAMPUS_TEST__.beginPingPongAction())
  const tossed=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(tossed).toMatchObject({phase:'toss',serve:{charging:false,lastHit:null}})
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:700,clientY:320,movementX:-60,movementY:40})
  await page.waitForTimeout(150)
  moved=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(moved.phase).toBe('toss')
  expect(moved.ball.position[2]).toBeCloseTo(tossed.ball.position[2],3)
  expect(Math.abs(moved.paddles.player[2]-tossed.paddles.player[2])).toBeGreaterThan(.05)
  await page.evaluate(()=>window.__CAMPUS_TEST__.endPingPongAction())
  await page.locator('canvas').dispatchEvent('pointermove',{clientX:500,clientY:360,movementX:-200,movementY:40})
  await page.waitForTimeout(120)
  const airborne=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(airborne.phase).toBe('toss')
  expect(airborne.ball.position[2]).toBeCloseTo(tossed.ball.position[2],3)
  expect(Math.abs(airborne.paddles.player[2]-moved.paddles.player[2])).toBeGreaterThan(.05)
})

test('one press immediately tosses with varied timing, then waits for falling-ball contact',async({page})=>{
  await ready(page)
  let state=await page.evaluate(()=>{
    window.__CAMPUS_TEST__.enterPingPongTable(0)
    window.__CAMPUS_TEST__.beginPingPongAction()
    return window.__CAMPUS_TEST__.pingPongGame()
  })
  expect(state).toMatchObject({phase:'toss',serve:{charging:false,lastHit:null},stats:{playerHits:0}})
  expect(state.serve.tossAirTime).toBeGreaterThanOrEqual(.63)
  expect(state.serve.tossAirTime).toBeLessThanOrEqual(.73)
  expect(state.ball.velocity[1]).toBeGreaterThanOrEqual(2.04)
  expect(state.ball.velocity[1]).toBeLessThanOrEqual(2.38)
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.08))
  expect(state.phase).toBe('toss')
  expect(state.stats.playerHits).toBe(0)
  const airTimes=[state.serve.tossAirTime]
  for(let attempt=0;attempt<2;attempt++) {
    await page.evaluate(()=>{window.__CAMPUS_TEST__.enterPingPongTable(0);window.__CAMPUS_TEST__.beginPingPongAction()})
    const varied=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
    expect(varied.serve.tossAirTime).toBeGreaterThanOrEqual(.63)
    expect(varied.serve.tossAirTime).toBeLessThanOrEqual(.73)
    airTimes.push(varied.serve.tossAirTime)
  }
  expect(new Set(airTimes).size).toBeGreaterThan(1)

  const performServeContact=async dx=>{
    return page.evaluate(dx=>{
      const readyState=window.__CAMPUS_TEST__.enterPingPongTable(0)
      const [px,py,pz]=readyState.paddles.player,direction=Math.sign(dx)||1
      window.__CAMPUS_TEST__.setPingPongBall({
        position:[px-.04,py+.01,pz-direction*.002],velocity:[0,-.35,0],phase:'toss',lastHit:null,active:true,
      })
      const canvas=document.querySelector('canvas')
      canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:640,clientY:360,movementX:0,bubbles:true}))
      canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:640+dx,clientY:360,movementX:dx,bubbles:true}))
      return window.__CAMPUS_TEST__.advancePingPong(.03)
    },dx)
  }

  const weakRight=await performServeContact(2)
  expect(weakRight).toMatchObject({phase:'serve',serve:{lastHit:'player'},stats:{playerHits:1}})
  expect(weakRight.ball.velocity[0]).toBeLessThan(0)
  expect(weakRight.ball.velocity[2]).toBeLessThan(0)
  expect(Math.abs(weakRight.ball.velocity[0])).toBeGreaterThanOrEqual(2.65)
  expect(Math.abs(weakRight.ball.velocity[0])).toBeLessThan(2.9)
  const strongRight=await performServeContact(100)
  expect(strongRight).toMatchObject({phase:'serve',serve:{lastHit:'player'},stats:{playerHits:1}})
  expect(strongRight.ball.velocity[2]).toBeLessThan(weakRight.ball.velocity[2])
  expect(Math.abs(strongRight.ball.velocity[0])).toBeGreaterThan(Math.abs(weakRight.ball.velocity[0]))
  expect(Math.abs(strongRight.ball.velocity[2]/strongRight.ball.velocity[0])).toBeGreaterThan(.55)
})

test('forward paddle input during the toss waits behind the ball and strikes on descent',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  await page.evaluate(()=>window.__CAMPUS_TEST__.beginPingPongAction())
  const canvas=page.locator('canvas')
  await canvas.dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
  await canvas.dispatchEvent('pointermove',{clientX:640,clientY:250,movementX:0,movementY:-110})
  await page.waitForTimeout(80)
  const rising=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(rising.phase).toBe('toss')
  expect(rising.paddles.player[0]-rising.ball.position[0]).toBeGreaterThanOrEqual(.099)
  const struck=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.72))
  expect(struck.stats.playerHits).toBe(1)
  expect(struck.serve.lastHit).toBe('player')
  expect(['serve','rally','point']).toContain(struck.phase)
})

test('a ball tossed from the left can be served diagonally right by a rightward swing',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const canvas=page.locator('canvas')
  await canvas.dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
  await canvas.dispatchEvent('pointermove',{clientX:500,clientY:360,movementX:-140,movementY:0})
  await page.waitForTimeout(250)
  const left=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(left.ball.position[2]).toBeGreaterThan(left.table.center[1])

  const [px,py,pz]=left.paddles.player
  await page.evaluate(({px,py,pz})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[px-.04,py+.01,pz-.012],velocity:[0,-.35,0],phase:'toss',lastHit:null,active:true,
  }),{px,py,pz})
  await canvas.dispatchEvent('pointermove',{clientX:620,clientY:360,movementX:120,movementY:0})
  const served=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.03))
  expect(served).toMatchObject({phase:'serve',serve:{lastHit:'player'}})
  expect(served.ball.position[2]).toBeGreaterThan(served.table.center[1])
  expect(served.ball.velocity[2]).toBeLessThan(0)
  expect(Math.abs(served.ball.velocity[2]/served.ball.velocity[0])).toBeGreaterThan(.55)
})

test('practice serve uses local table physics and produces legal bounces',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.servePingPong('player'))
  expect(state).toMatchObject({phase:'serve',server:'player'})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(1.2))
  expect(state.stats.tableBounces).toBeGreaterThanOrEqual(2)
  expect(['rally','point','ready']).toContain(state.phase)
  expect(state.ball.position.every(Number.isFinite)).toBe(true)
  expect(state.ball.velocity.every(Number.isFinite)).toBe(true)
})

test('AI serve reaches the player paddle before a third table bounce',async({page})=>{
  await ready(page)
  const entered=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const served=await page.evaluate(()=>window.__CAMPUS_TEST__.servePingPong('ai'))
  expect(served).toMatchObject({phase:'serve',server:'ai',serve:{lastHit:'ai'}})

  const returned=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(1.1))
  expect(returned.stats.tableBounces).toBe(2)
  expect(returned.stats.playerHits).toBe(1)
  expect(returned.serve.lastHit).toBe('player')
  expect(returned.paddles.player[0]).toBeCloseTo(entered.paddles.player[0],3)
})

test('an incoming rally ball returns on paddle contact without any click',async({page})=>{
  await ready(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const [,cz]=state.table.center,playerPlane=state.paddles.player[0]
  await page.evaluate(({playerPlane,cz,paddleY})=>window.__CAMPUS_TEST__.setPingPongBall({
    // 0.133m偏心落在扩大的0.140m虚拟接球半径内，但在旧0.125m范围外。
    position:[playerPlane-.28,paddleY,cz+.133],velocity:[4.2,0,0],phase:'rally',lastHit:'ai',active:true,
  }),{playerPlane,cz,paddleY:state.paddles.player[1]})
  const returned=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.12))
  expect(returned.stats.playerHits).toBe(1)
  expect(returned.serve.lastHit).toBe('player')
  expect(returned.ball.velocity[0]).toBeLessThan(0)
})

test('player rally contact ignores ball height when depth and lateral position are reachable',async({page})=>{
  await ready(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  await page.evaluate(({position})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[position[0]-.08,position[1]+.65,position[2]],velocity:[4.2,0,0],phase:'rally',lastHit:'ai',active:true,
  }),{position:state.paddles.player})
  const returned=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.035))
  expect(returned.stats.playerHits).toBe(1)
  expect(returned.serve.lastHit).toBe('player')
})

test('automatic rally returns follow horizontal paddle motion',async({page})=>{
  await ready(page)
  const canvas=page.locator('canvas')
  const returnWithMove=async(dx,dy)=>{
    await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
    await canvas.dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
    await canvas.dispatchEvent('pointermove',{clientX:640-dx*.5,clientY:360,movementX:-dx*.5,movementY:0})
    await page.waitForTimeout(12)
    await canvas.dispatchEvent('pointermove',{clientX:640+dx,clientY:360+dy,movementX:dx*1.5,movementY:dy})
    await page.waitForTimeout(20)
    const moved=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
    await page.evaluate(({position})=>window.__CAMPUS_TEST__.setPingPongBall({
      position:[position[0]-.08,position[1],position[2]],velocity:[4.2,0,0],phase:'rally',lastHit:'ai',active:true,
    }),{position:moved.paddles.player})
    const result=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.035))
    return {moved,result}
  }

  const rightRun=await returnWithMove(90,0),right=rightRun.result
  const leftRun=await returnWithMove(-90,0),left=leftRun.result
  expect(rightRun.moved.paddles.player[2]-rightRun.moved.table.center[1]).toBeLessThan(-.2)
  expect(leftRun.moved.paddles.player[2]-leftRun.moved.table.center[1]).toBeGreaterThan(.2)
  expect(right.paddles.playerRotation[0]).toBeLessThan(0)
  expect(left.paddles.playerRotation[0]).toBeGreaterThan(0)
  expect(right.stats.playerHits).toBe(1)
  expect(left.stats.playerHits).toBe(1)
  expect(right.ball.velocity[2]).toBeLessThan(-.5)
  expect(left.ball.velocity[2]).toBeGreaterThan(.5)

})

test('table bounces stay within the assisted playable height range',async({page})=>{
  await ready(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const [cx,cz]=state.table.center
  await page.evaluate(({cx,cz,surface})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[cx+.45,surface+.08,cz],velocity:[1,-9,0],phase:'rally',lastHit:'ai',active:true,
  }),{cx,cz,surface:state.table.surfaceY})
  const bounced=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.02))
  expect(bounced.stats.tableBounces).toBe(1)
  expect(bounced.ball.velocity[1]).toBeLessThanOrEqual(2.8)
})

test('clicking as the ball reaches the paddle produces a low forceful return',async({page})=>{
  await ready(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const smashed=await page.evaluate(({position})=>{
    window.__CAMPUS_TEST__.setPingPongBall({
      position:[position[0]-.32,position[1],position[2]],velocity:[4.2,0,0],phase:'rally',lastHit:'ai',active:true,
    })
    window.__CAMPUS_TEST__.beginPingPongAction()
    return window.__CAMPUS_TEST__.advancePingPong(.08)
  },{position:state.paddles.player})
  await page.evaluate(()=>window.__CAMPUS_TEST__.endPingPongAction())
  expect(smashed.stats.playerHits).toBe(1)
  expect(smashed.stats.playerSmashes).toBe(1)
  expect(smashed.ball.velocity[0]).toBeLessThan(0)
  expect(smashed.ball.velocity[1]).toBeLessThanOrEqual(.9)
})

test('AI moves forward to return a slow short ball',async({page})=>{
  await ready(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const [cx,cz]=state.table.center
  const startingAiX=state.paddles.ai[0]
  await page.evaluate(({cx,cz,surface})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[cx-.35,surface+.13,cz],velocity:[-1.2,1.25,0],phase:'rally',lastHit:'player',lastBounceSide:'ai',active:true,
  }),{cx,cz,surface:state.table.surfaceY})
  const approaching=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.1))
  expect(approaching.paddles.ai[0]).toBeGreaterThan(startingAiX+.08)
  const returned=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.55))
  expect(returned.stats.aiHits).toBe(1)
  expect(returned.serve.lastHit).toBe('ai')
})

test('AI receiving ignores ball height when fore-aft and lateral positions are reachable',async({page})=>{
  await ready(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const [cx,cz]=state.table.center
  await page.evaluate(({cx,cz})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[cx-.72,1.42,cz],velocity:[-1,0,0],phase:'rally',lastHit:'player',lastBounceSide:'ai',active:true,
  }),{cx,cz})
  const returned=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.02))
  expect(returned.stats.aiHits).toBe(1)
  expect(returned.serve.lastHit).toBe('ai')
})

test('moderate desktop swings keep their direction when returning from table edges',async({page})=>{
  await ready(page)
  const canvas=page.locator('canvas')
  const returnFromEdge=async(initialDx,swingDx)=>{
    await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
    await canvas.dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
    await canvas.dispatchEvent('pointermove',{clientX:640+initialDx,clientY:360,movementX:initialDx,movementY:0})
    await page.waitForTimeout(180)
    await canvas.dispatchEvent('pointermove',{
      clientX:640+initialDx+swingDx,clientY:360,movementX:swingDx,movementY:0,
    })
    await page.waitForTimeout(20)
    const moved=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
    await page.evaluate(({position})=>window.__CAMPUS_TEST__.setPingPongBall({
      position:[position[0]-.08,position[1],position[2]],velocity:[4.2,0,0],phase:'rally',lastHit:'ai',active:true,
    }),{position:moved.paddles.player})
    return page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.035))
  }

  const right=await returnFromEdge(-100,4)
  const left=await returnFromEdge(100,-4)
  expect(right.stats.playerHits).toBe(1)
  expect(left.stats.playerHits).toBe(1)
  expect(right.ball.velocity[2]).toBeLessThan(0)
  expect(left.ball.velocity[2]).toBeGreaterThan(0)
})

test('a single-direction chase path produces a straight return',async({page})=>{
  await ready(page)
  const canvas=page.locator('canvas')
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  await canvas.dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
  await canvas.dispatchEvent('pointermove',{clientX:730,clientY:360,movementX:90,movementY:0})
  await page.waitForTimeout(150)
  const moved=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  await page.evaluate(({position})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[position[0]-.08,position[1],position[2]],velocity:[4.2,0,0],phase:'rally',lastHit:'ai',active:true,
  }),{position:moved.paddles.player})
  const returned=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.035))
  expect(returned.stats.playerHits).toBe(1)
  expect(Math.abs(returned.ball.velocity[2])).toBeLessThan(.05)
})

test('the final swing direction overrides an earlier opposite chase movement',async({page})=>{
  await ready(page)
  const canvas=page.locator('canvas')
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  await canvas.dispatchEvent('pointermove',{clientX:640,clientY:360,movementX:0,movementY:0})
  // 先大幅向左追球，再在接触前明确向右挥拍；最终出球必须向右。
  await canvas.dispatchEvent('pointermove',{clientX:520,clientY:360,movementX:-120,movementY:0})
  await page.waitForTimeout(45)
  await canvas.dispatchEvent('pointermove',{clientX:590,clientY:360,movementX:70,movementY:0})
  await page.waitForTimeout(20)
  const moved=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  await page.evaluate(({position})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[position[0]-.08,position[1],position[2]],velocity:[4.2,0,0],phase:'rally',lastHit:'ai',active:true,
  }),{position:moved.paddles.player})
  const returned=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.035))
  expect(returned.stats.playerHits).toBe(1)
  expect(returned.ball.velocity[2]).toBeLessThan(-.5)
})

test('player swing and reachable AI return create a real rally',async({page})=>{
  await ready(page)
  const state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  const [,cz]=state.table.center,playerPlane=state.paddles.player[0]
  await page.evaluate(({playerPlane,cz,surface})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[playerPlane-.35,surface+.34,cz],velocity:[4,0,0],phase:'rally',lastHit:'ai',active:true,
  }),{playerPlane,cz,surface:state.table.surfaceY})
  await page.evaluate(()=>window.__CAMPUS_TEST__.beginPingPongAction())
  let rally=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.16))
  await page.evaluate(()=>window.__CAMPUS_TEST__.endPingPongAction())
  expect(rally.stats.playerHits).toBeGreaterThanOrEqual(1)
  rally=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.8))
  expect(rally.stats.aiHits).toBeGreaterThanOrEqual(1)
})

test('seven-point scoring alternates serve and requires a two-point lead',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(2))
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.startPingPongMatch())
  expect(state).toMatchObject({mode:'match',scores:{player:0,ai:0},server:'player',targetScore:7})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('player','测试'))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(1))
  expect(state).toMatchObject({scores:{player:1,ai:0},server:'player'})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('ai','测试'))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(1))
  expect(state).toMatchObject({scores:{player:1,ai:1},server:'ai'})

  state=await page.evaluate(()=>window.__CAMPUS_TEST__.setPingPongScore(6,6))
  expect(state.server).toBe('player')
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('player','测试'))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(1))
  expect(state).toMatchObject({phase:'ready',scores:{player:7,ai:6},server:'ai'})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('player','测试'))
  expect(state).toMatchObject({phase:'matchEnd',scores:{player:8,ai:6}})
})

test('practice starts with the player and the point winner serves next',async({page})=>{
  await ready(page)
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  expect(state).toMatchObject({mode:'practice',server:'player',scores:{player:0,ai:0}})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('ai','测试'))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(1))
  expect(state).toMatchObject({mode:'practice',server:'ai',scores:{player:0,ai:0}})
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('player','测试'))
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(1))
  expect(state).toMatchObject({mode:'practice',server:'player',scores:{player:0,ai:0}})
})

test('ping-pong score and point feedback use the shared arcade-comic WebGL HUD',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong.visible)).toBe(true)
  await page.evaluate(()=>window.__CAMPUS_TEST__.servePingPong('player'))
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong.feedbackVisible)).toBe(false)
  await page.evaluate(()=>window.__CAMPUS_TEST__.startPingPongMatch())
  await expect(page.locator('.ping-pong-game-hud')).toHaveCount(0)
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong)).toMatchObject({
    loaded:true,visible:true,mode:'7分比赛',playerScore:0,aiScore:0,server:'玩家',prompt:'点击抛球',
    arcadeScore:{player:'0',ai:'0',scorePixelHeight:156},panelVisible:false,promptVisible:false,
    scoreBounds:{left:250,right:1030,top:4,bottom:196},
  })
  await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('player','测试'))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong)).toMatchObject({playerScore:1,aiScore:0,arcadeScore:{player:'1',ai:'0'},feedbackVisible:false,feedbackTitle:'得分',feedbackDetail:'玩家 +1'})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:true,game:'pingPong',phrase:'point',kind:'hit'})
  await page.evaluate(()=>window.__CAMPUS_TEST__.setPingPongScore(1,0))
  await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('ai','测试'))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong)).toMatchObject({playerScore:1,aiScore:1,arcadeScore:{player:'1',ai:'1'},feedbackVisible:false,feedbackTitle:'得分',feedbackDetail:'电脑 +1'})
  await page.evaluate(()=>window.__CAMPUS_TEST__.setPingPongScore(0,6))
  await page.evaluate(()=>window.__CAMPUS_TEST__.awardPingPongPoint('ai','测试'))
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().pingPong)).toMatchObject({feedbackVisible:false,feedbackTitle:'比赛结束',feedbackDetail:'电脑胜'})
  await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().arcadeComic)).toMatchObject({active:true,game:'pingPong',phrase:'again',kind:'plain',burstVisible:false,rootVisible:true})
})

test('ordinary good-shot feedback is sampled and rate-limited',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.resetPingPongGoodFeedback())
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.probePingPongGoodFeedback(1000,.29))).toBe(true)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.probePingPongGoodFeedback(2000,.01))).toBe(false)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.probePingPongGoodFeedback(3500,.30))).toBe(false)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.probePingPongGoodFeedback(3500,.29))).toBe(true)
})

test('touch mode uses one canvas gesture surface and camera-space top buttons',async({browser})=>{
  const context=await browser.newContext({viewport:{width:800,height:700},hasTouch:true,isMobile:true,reducedMotion:'reduce'})
  const page=await context.newPage();await ready(page)
  const entered=await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(1))
  expect(entered.controls).toMatchObject({touchSurface:true,htmlButtons:0})
  expect(entered.controls.cameraButtons.exit.visible).toBe(true)
  expect(entered.controls.cameraButtons.exit.screen[1]).toBeGreaterThan(.5)
  await expect(page.locator('.ping-pong-game-hud button')).toHaveCount(0)
  await expect(page.locator('#touch-controls')).toHaveAttribute('aria-hidden','true')

  await page.mouse.move(180,540)
  await page.mouse.down()
  let held=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(held).toMatchObject({phase:'ready',controls:{touchActive:true}})
  expect(held.paddles.playerRotation[0]).toBeGreaterThan(0)
  expect(held.ball.position[2]).toBeCloseTo(held.paddles.player[2]-.09,3)
  await page.mouse.move(650,360)
  held=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(held.phase).toBe('ready')
  expect(held.paddles.playerScreen[0]).toBeGreaterThan(entered.paddles.playerScreen[0])
  expect(held.paddles.playerRotation[0]).toBeLessThan(0)
  expect(held.ball.position[2]).toBeCloseTo(held.paddles.player[2]+.09,3)
  await page.mouse.up()
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(state).toMatchObject({phase:'toss',serve:{charging:false}})
  expect(state.serve.tossAirTime).toBeGreaterThanOrEqual(.76)
  expect(state.serve.tossAirTime).toBeLessThanOrEqual(.88)

  const releasedBallZ=state.ball.position[2]
  // 旧拍在右侧；重新落指到左侧只应定位，随后向屏幕右侧滑才是实际挥拍方向。
  await page.mouse.move(180,520);await page.mouse.down()
  const repositioned=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(repositioned.phase).toBe('toss')
  expect(repositioned.ball.position[2]).toBeCloseTo(releasedBallZ,3)
  await page.evaluate(({position})=>window.__CAMPUS_TEST__.setPingPongBall({
    position:[position[0]-.08,position[1],position[2]],velocity:[4.2,0,0],phase:'rally',lastHit:'ai',active:true,
  }),{position:repositioned.paddles.player})
  await page.mouse.move(240,520)
  const retouched=await page.evaluate(()=>window.__CAMPUS_TEST__.advancePingPong(.035))
  expect(retouched.stats.playerHits).toBe(1)
  expect(retouched.ball.velocity[2]).toBeLessThan(0)
  await page.mouse.up()

  const match=state.controls.cameraButtons.match.screen
  await page.mouse.click((match[0]+1)*400,(1-match[1])*350)
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())
  expect(state).toMatchObject({mode:'match',phase:'ready',scores:{player:0,ai:0}})

  const button=state.controls.cameraButtons.exit.screen
  const exitX=(button[0]+1)*400,exitY=(1-button[1])*350
  await page.mouse.click(exitX,exitY)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.pingPongGame())).toMatchObject({status:'idle'})
  await context.close()
})

test('ping-pong match HUD visual baseline',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterPingPongTable(0))
  await page.evaluate(()=>window.__CAMPUS_TEST__.startPingPongMatch())
  await page.waitForTimeout(150)
  await expect(page.locator('canvas')).toHaveScreenshot('pingPongMatch.png')
})

import {expect,test} from '@playwright/test'

// No visual baselines: these regressions exercise the actual campus adapter,
// WebGL controls, shared renderer and persistence around the pure simulation.
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
}
const state=page=>page.evaluate(()=>window.__CAMPUS_TEST__.dodgeball())
const advance=(page,seconds)=>page.evaluate(seconds=>window.__CAMPUS_TEST__.advanceDodgeball(seconds),seconds)
const focusEntry=(page,{distance=.55,height=0}={})=>page.evaluate(({distance,height})=>{
  const api=window.__CAMPUS_TEST__,entry=api.config.facilities.dodgeball.entry
  const [x,z]=entry.center,edge=z+entry.size[1]/2,y=entry.surfaceY??.012
  let player=api.teleport(x,edge+distance,x,edge-.5,0,y+.035)
  if(height)player=api.teleport(x,edge+distance,x,edge-.5,0,y+.035,player.y+height)
  return {player,controls:api.controls(),hit:api.probeDodgeballInteraction()}
},{distance,height})
const hudPoint=(page,action)=>page.evaluate(action=>{
  const current=window.__CAMPUS_TEST__.dodgeball(),bounds=current.hud.buttons[action]
  if(!bounds)throw new Error(`Dodgeball HUD has no active ${action} button in ${current.phase}`)
  const viewport=current.viewport
  return {x:viewport.left+(bounds.left+bounds.right)/2/1920*viewport.width,
    y:viewport.top+(bounds.top+bounds.bottom)/2/1080*viewport.height,
    width:(bounds.right-bounds.left)/1920*viewport.width,height:(bounds.bottom-bounds.top)/1080*viewport.height}
},action)
const clickHud=async(page,action,touch=false)=>{
  const point=await hudPoint(page,action)
  if(touch)await page.touchscreen.tap(point.x,point.y)
  else await page.mouse.click(point.x,point.y)
}
const finishMatch=(page,scores)=>page.evaluate(scores=>{
  const api=window.__CAMPUS_TEST__
  // Shorten the clock without changing the live phase/ball ownership contract.
  api.setDodgeballState({timeRemaining:.01,scores})
  return api.advanceDodgeball(.02)
},scores)
const frozenFields=current=>({phase:current.phase,elapsed:current.elapsed,timeRemaining:current.timeRemaining,
  scores:current.scores,players:current.players,ball:current.ball,charge:current.charge,holdElapsed:current.holdElapsed})

test('whole marked court accepts nearby real clicks on empty centre/far corner, rejects outside/distant/upstairs rays, and restores the camera',async({page})=>{
  await ready(page)
  expect((await focusEntry(page,{distance:10})).hit).toBeNull()
  expect((await focusEntry(page,{height:3.1})).hit).toBeNull()
  const before=await focusEntry(page)
  expect(before.hit).toMatchObject({id:'dodgeball'})
  expect(before.hit.distance).toBeLessThanOrEqual(2.5)
  const viewport=page.viewportSize()
  await page.mouse.click(viewport.width/2,viewport.height/2)
  await expect.poll(()=>state(page)).toMatchObject({status:'active',phase:'selection',players:expect.any(Array),entry:{proxies:1,collision:false}})
  expect((await state(page)).players).toHaveLength(4)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'dodgeball',pointerLookEnabled:false})
  await page.keyboard.press('KeyX')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(before.player)
  const controls=await page.evaluate(()=>window.__CAMPUS_TEST__.controls())
  expect(controls.rotation).toEqual(before.controls.rotation)
  expect(controls.projection).toEqual(before.controls.projection)
  expect(controls.mode).toBe('walk')
  expect(await state(page)).toMatchObject({status:'idle',phase:'selection',input:{keys:[],pointers:0,move:{x:0,z:0}}})
  for(const target of ['centre','far-corner']) {
    const aimed=await page.evaluate(target=>{
      const api=window.__CAMPUS_TEST__,entry=api.config.facilities.dodgeball.entry
      const [cx,cz]=entry.center,[width,depth]=entry.size,y=entry.surfaceY??.012
      const lookX=target==='far-corner'?cx+width/2-.2:cx
      const lookZ=target==='far-corner'?cz-depth/2+.2:cz
      const player=api.teleport(cx,cz+depth/2+.55,lookX,lookZ,0,y+.035)
      return {player,controls:api.controls(),hit:api.probeDodgeballInteraction(),
        entry,lookX,lookZ,nearbyDistance:.55}
    },target)
    expect(aimed.nearbyDistance).toBeLessThan(aimed.entry.interactionDistance)
    expect(aimed.hit).toMatchObject({id:'dodgeball'})
    // The player is nearby, but the ray into the rectangle legitimately
    // travels farther than 2.5 m. Neither target is a chalk line or title.
    expect(aimed.hit.distance).toBeGreaterThan(aimed.entry.interactionDistance)
    expect(aimed.hit.point[0]).toBeGreaterThan(aimed.entry.center[0]-aimed.entry.size[0]/2)
    expect(aimed.hit.point[0]).toBeLessThan(aimed.entry.center[0]+aimed.entry.size[0]/2)
    expect(aimed.hit.point[2]).toBeGreaterThan(aimed.entry.center[1]-aimed.entry.size[1]/2)
    expect(aimed.hit.point[2]).toBeLessThan(aimed.entry.center[1]+aimed.entry.size[1]/2)
    await page.mouse.click(viewport.width/2,viewport.height/2)
    expect(await state(page)).toMatchObject({status:'active',phase:'selection'})
    await page.keyboard.press('KeyX')
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(aimed.player)
    const restored=await page.evaluate(()=>window.__CAMPUS_TEST__.controls())
    expect(restored.mode).toBe('walk')
    expect(restored.rotation).toEqual(aimed.controls.rotation)
    expect(restored.projection).toEqual(aimed.controls.projection)
  }
  const outside=await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__,entry=api.config.facilities.dodgeball.entry
    const [cx,cz]=entry.center,[width,depth]=entry.size
    api.teleport(cx,cz+depth/2+.55,cx+width/2+1,cz,0,(entry.surfaceY??.012)+.035)
    return api.probeDodgeballInteraction()
  })
  expect(outside).toBeNull()
  await page.mouse.click(viewport.width/2,viewport.height/2)
  expect(await state(page)).toMatchObject({status:'idle',phase:'selection'})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('walk')
})

test('desktop movement, jump and charged throw work while pause freezes every simulation field',async({page})=>{
  await ready(page)
  await focusEntry(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterDodgeball())
  await page.keyboard.press('Digit1');await page.keyboard.press('Enter')
  let current=await advance(page,.8)
  expect(current).toMatchObject({phase:'held',ballMode:'pingpong',controlledId:0,attackTeam:'blue'})
  const initialZ=current.players[0].z
  await page.keyboard.down('KeyW');await page.keyboard.press('Space')
  current=await advance(page,.12)
  await page.keyboard.up('KeyW')
  expect(current.players[0].z).toBeLessThan(initialZ)
  expect(current.players[0].y).toBeGreaterThan(0)
  expect(current.players[0].x).toBe(-12)
  await page.keyboard.down('KeyK')
  current=await advance(page,.25)
  expect(current.charging).toBe(true);expect(current.charge).toBeGreaterThan(0)
  await page.keyboard.up('KeyK')
  current=await state(page)
  expect(current).toMatchObject({phase:'flight',controlledId:1,ball:{active:true,ownerId:null,throwerId:0,receiverId:1}})
  expect(current.ball.vx).toBeGreaterThan(0)
  expect(current.ball.vz).toBe(0)
  await page.keyboard.press('Escape')
  const paused=await state(page)
  expect(paused.paused).toBe(true)
  expect(paused.input).toEqual({keys:[],pointers:0,move:{x:0,z:0}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'dodgeball',minigamePaused:true})
  expect(frozenFields(await advance(page,2))).toEqual(frozenFields(paused))
  // Advancing the real animation loop must be as harmless as the test clock.
  await page.waitForTimeout(100)
  expect(frozenFields(await state(page))).toEqual(frozenFields(paused))
  await clickHud(page,'resume')
  expect((await state(page)).paused).toBe(false)
  expect((await advance(page,.05)).elapsed).toBeGreaterThan(paused.elapsed)
  await page.keyboard.press('KeyX')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'walk',minigamePaused:false})
})

test('only completed matches save mode-specific scores, and a rematch alternates the opening team',async({page})=>{
  await ready(page)
  await page.evaluate(()=>{window.__CAMPUS_TEST__.clearPersonalRecords();window.__CAMPUS_TEST__.enterDodgeball()})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().raw.games.dodgeball)).toBeUndefined()
  await clickHud(page,'beanbag');await clickHud(page,'start')
  expect((await state(page)).ballMode).toBe('beanbag')
  await advance(page,.8)
  await page.keyboard.press('KeyX')
  let record=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().raw.games.dodgeball)
  expect(record.metrics).toEqual({played:1})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().view.games.find(game=>game.id==='dodgeball').record)).toBe('尚未完成比赛')
  await page.evaluate(()=>window.__CAMPUS_TEST__.enterDodgeball())
  await clickHud(page,'pingpong');await clickHud(page,'start');await advance(page,.8)
  expect(await finishMatch(page,{blue:7,red:3})).toMatchObject({phase:'finished',winner:'blue',timeRemaining:0})
  record=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().raw.games.dodgeball)
  expect(record.metrics).toEqual({played:2,completed:1,wins:1,pingpongBest:7})
  // A finished render/clock cannot submit the same match twice.
  await advance(page,2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().raw.games.dodgeball)).toEqual(record)
  await clickHud(page,'restart')
  expect(await state(page)).toMatchObject({phase:'ready',attackTeam:'red',scores:{blue:0,red:0},ball:{ownerId:2}})
  await advance(page,.8);await finishMatch(page,{blue:1,red:2})
  await clickHud(page,'select');await clickHud(page,'beanbag');await clickHud(page,'start');await advance(page,.8)
  expect(await state(page)).toMatchObject({ballMode:'beanbag',attackTeam:'blue',ball:{radius:.24}})
  await finishMatch(page,{blue:4,red:5})
  record=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().raw.games.dodgeball)
  expect(record.metrics).toEqual({played:4,completed:3,wins:1,pingpongBest:7,beanbagBest:4})
  const view=await page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().view)
  expect(view.games.find(game=>game.id==='dodgeball').record).toBe('乒乓球 7 分 · 沙包 4 分 · 1 胜')
  expect(view.counts.games).toBe(1);expect(view.totals.games).toBe(13);expect(view.totals.mysteries).toBe(3)
})

test('twenty mixed-mode enter/play/finish/exit cycles reuse prewarmed GPU and scene resources',async({page})=>{
  await ready(page);await focusEntry(page)
  const result=await page.evaluate(()=>{
    const api=window.__CAMPUS_TEST__
    const key=code=>{
      window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}))
      window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}))
    }
    const cycle=index=>{
      api.enterDodgeball();key(index%2?'Digit2':'Digit1');key('Enter');api.advanceDodgeball(.8)
      key('Space');key('KeyK');api.advanceDodgeball(.05)
      // The throw above is still in flight: expire that valid attack, do not
      // turn it into a held ball whose ownerId is necessarily still null.
      api.setDodgeballState({timeRemaining:.01,scores:{blue:index%5,red:0}});api.advanceDodgeball(.02)
      const game=api.dodgeball();api.exitDodgeball()
      return {phase:game.phase,mode:game.ballMode,players:game.players.length,input:api.dodgeball().input,status:api.dodgeball().status}
    }
    // Warm both modes and the final-result HUD before measuring. No page reloads.
    cycle(0);cycle(1)
    const capture=()=>{
      const game=api.dodgeball()
      return {memory:{...api.performanceSnapshot().renderer.memory},
        scene:{materials:game.visual.sceneMaterials,geometries:game.visual.sceneGeometries,meshes:game.visual.drawableMeshes},
        hud:{materials:game.hud.scene.materials,meshes:game.hud.scene.meshes,atlasSize:game.hud.scene.atlasSize,textureVersion:game.hud.scene.textureVersion},
        requests:performance.getEntriesByType('resource').map(resource=>resource.name)}
    }
    const before=capture(),cycles=Array.from({length:20},(_,index)=>cycle(index)),after=capture()
    return {before,after,cycles,mode:api.controls().mode}
  })
  expect(result.cycles).toHaveLength(20)
  for(let index=0;index<result.cycles.length;index++)expect(result.cycles[index]).toEqual({phase:'finished',mode:index%2?'beanbag':'pingpong',players:4,
    input:{keys:[],pointers:0,move:{x:0,z:0}},status:'idle'})
  expect(result.after.memory).toEqual(result.before.memory)
  expect(result.after.scene).toEqual(result.before.scene)
  expect(result.after.hud).toEqual(result.before.hud)
  expect(result.after.requests).toEqual(result.before.requests)
  expect(result.mode).toBe('walk')
})

test.describe('campus and gameplay input boundaries',()=>{
  test('a held basketball blocks the chalk entry before mouse charging or an accidental shot',async({page})=>{
    await ready(page)
    const basketball=await page.evaluate(()=>{
      const api=window.__CAMPUS_TEST__,id=api.basketballGame().items[0].id
      api.pickupBasketball(id)
      return api.basketballGame()
    })
    expect(basketball.held).toBeTruthy()
    expect((await focusEntry(page)).hit).toMatchObject({id:'dodgeball'})
    await expect.poll(()=>page.evaluate(()=>window.__CAMPUS_TEST__.hud().interaction)).toBe('dodgeball-hands-full')
    const viewport=page.viewportSize()
    await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.down()
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())).toMatchObject({held:basketball.held,charging:false,attempts:basketball.attempts})
    await page.mouse.up()
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())).toMatchObject({held:basketball.held,charging:false,attempts:basketball.attempts})
    expect(await state(page)).toMatchObject({status:'idle',phase:'selection'})
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('walk')
    await page.evaluate(()=>window.__CAMPUS_TEST__.resetBasketballs())
    await page.mouse.click(viewport.width/2,viewport.height/2)
    expect(await state(page)).toMatchObject({status:'active',phase:'selection'})
  })

  test('X during a held mouse charge consumes its later release click without re-entering',async({page})=>{
    await ready(page)
    const before=await focusEntry(page),viewport=page.viewportSize()
    await page.mouse.click(viewport.width/2,viewport.height/2)
    await page.keyboard.press('Digit1');await page.keyboard.press('Enter');await advance(page,.8)
    await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.down()
    const charging=await advance(page,.2)
    expect(charging).toMatchObject({phase:'held',charging:true,input:{pointers:1}})
    expect(charging.charge).toBeGreaterThan(0)
    await page.keyboard.press('KeyX')
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(before.player)
    // The restored centre ray hits the entry: without release-click isolation,
    // this mouseup's synthesized click would immediately reopen the game.
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.probeDodgeballInteraction())).toMatchObject({id:'dodgeball'})
    await page.mouse.up()
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().mode)).toBe('walk')
    expect(await state(page)).toMatchObject({status:'idle',phase:'selection',charging:false,input:{keys:[],pointers:0,move:{x:0,z:0}}})
    // Only the stale release click is swallowed; a fresh intentional click works.
    await page.mouse.click(viewport.width/2,viewport.height/2)
    expect(await state(page)).toMatchObject({status:'active',phase:'selection'})
  })

  test('a real K key catches a live opponent throw, awards one point and rescues one teammate',async({page})=>{
    await ready(page)
    await page.evaluate(()=>window.__CAMPUS_TEST__.enterDodgeball())
    await page.keyboard.press('Digit1');await page.keyboard.press('Enter');await advance(page,.8)
    await finishMatch(page,{blue:0,red:0});await clickHud(page,'restart');await advance(page,.8)
    expect(await state(page)).toMatchObject({attackTeam:'red',controlledId:0,ball:{ownerId:2}})
    await page.evaluate(()=>window.__CAMPUS_TEST__.setDodgeballState({
      phase:'flight',phaseElapsed:0,charge:0,charging:false,scores:{blue:0,red:0},
      players:[{id:0,x:-3.5,y:0,z:9.7,vx:0,vy:0,vz:0,catchUntil:0,catchCooldownUntil:0},{id:1,alive:false},
        {id:2,x:-12,z:9.7},{id:3,x:12,z:9.7}],
      // A physically valid airborne attack from the red left end, with enough
      // approach time to press K before the defender's short catch window.
      ball:{x:-8,y:1.7,z:9.7,vx:24,vy:0,vz:0,active:true,ownerId:null,throwerId:2,receiverId:3,attackId:1,bounces:0},
    }))
    await page.keyboard.press('KeyK')
    let current=await advance(page,.22)
    expect(current).toMatchObject({phase:'returning',attackTeam:'red',scores:{blue:1,red:0},ball:{active:false},
      lastAttackResult:{reason:'catch',team:'blue',playerId:0,attackId:1}})
    expect(current.players.filter(player=>player.team==='blue').every(player=>player.alive)).toBe(true)
    await page.keyboard.press('KeyK')
    current=await advance(page,.55+.7)
    expect(current).toMatchObject({phase:'held',attackTeam:'red',scores:{blue:1,red:0},ball:{ownerId:3}})
  })
})

test.describe('phone landscape controls',()=>{
  test.use({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true})

  test('two real touch contacts move/charge independently, portrait pauses, and touch exit restores walking',async({page})=>{
    await ready(page)
    const before=await focusEntry(page),viewport=page.viewportSize()
    await page.touchscreen.tap(viewport.width/2,viewport.height/2)
    await expect.poll(()=>state(page)).toMatchObject({status:'active',phase:'selection',portrait:false})
    await clickHud(page,'pingpong',true);await clickHud(page,'start',true);await advance(page,.8)
    const joystick=await hudPoint(page,'joystick'),throwButton=await hudPoint(page,'throw')
    for(const action of ['jump','throw','pause','exit']){
      const bounds=await hudPoint(page,action)
      // Design-space conversion may differ from exactly 44 by floating-point epsilon.
      expect(bounds.width).toBeGreaterThanOrEqual(43.99);expect(bounds.height).toBeGreaterThanOrEqual(43.99)
    }
    const client=await page.context().newCDPSession(page)
    const point=(id,x,y)=>({id,x,y,radiusX:8,radiusY:8,force:1})
    const first=point(11,joystick.x,joystick.y),second=point(12,throwButton.x,throwButton.y)
    const initial=(await state(page)).players[0].z
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first]})
    first.y-=28
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[first]})
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first,second]})
    let current=await advance(page,.18)
    expect(current.input.pointers).toBe(2);expect(current.charging).toBe(true)
    expect(current.players[0].z).toBeLessThan(initial)
    // Chromium's WebTouch path releases the IDs supplied to a partial touchEnd;
    // these are changed/ended contacts, not the remaining DOM `touches` list.
    // End the throwing finger while the joystick finger stays captured.
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[second]})
    current=await state(page)
    expect(current).toMatchObject({phase:'flight',controlledId:1,charging:false})
    expect(current.ball.vx).toBeGreaterThan(0);expect(current.ball.vz).toBe(0)
    expect(current.input.pointers).toBe(1)
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await clickHud(page,'jump',true)
    current=await advance(page,.1)
    expect(current.players[current.controlledId].y).toBeGreaterThan(0)
    expect(current.input.pointers).toBe(0)
    await clickHud(page,'pause',true)
    const paused=await state(page)
    expect(paused.paused).toBe(true)
    expect(frozenFields(await advance(page,1))).toEqual(frozenFields(paused))
    await clickHud(page,'resume',true)
    expect((await state(page)).paused).toBe(false)
    await page.setViewportSize({width:390,height:844})
    await expect.poll(()=>state(page)).toMatchObject({portrait:true,paused:true,input:{pointers:0,keys:[]}})
    const portrait=await state(page)
    expect(frozenFields(await advance(page,1))).toEqual(frozenFields(portrait))
    await page.setViewportSize({width:844,height:390})
    await expect.poll(()=>state(page)).toMatchObject({portrait:false,paused:true})
    await clickHud(page,'resume',true)
    expect((await advance(page,.03)).elapsed).toBeGreaterThan(portrait.elapsed)
    await clickHud(page,'exit',true)
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(before.player)
    expect(await state(page)).toMatchObject({status:'idle',input:{pointers:0,keys:[],move:{x:0,z:0}}})
    expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls())).toMatchObject({mode:'walk',minigamePaused:false})
    await client.detach()
  })
})

import {expect,test} from '@playwright/test'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('basketball pickup, charge, shot, sleep and reset lifecycle',async({page})=>{
  await ready(page)
  const initial=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())
  expect(initial).toMatchObject({status:'ready',held:null,attempts:0,hits:0,points:0,policy:{fixedStep:1/120,maxSubsteps:8,scoring:{twoPointMax:6.25,threePointMax:9,fourPointMin:9}}})
  expect(initial.items).toHaveLength(3)
  expect(initial.items.every(item=>item.status==='resting'&&item.sleeping)).toBe(true)

  const id=initial.items[0].id
  await page.evaluate(id=>window.__CAMPUS_TEST__.focusBasketball(id),id)
  await page.locator('canvas').click({position:{x:640,y:360}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())).toMatchObject({held:id})
  await expect(page.locator('.basketball-game-hud')).toHaveCount(0)
  await expect(page.locator('[data-basketball-action]')).toHaveCount(0)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame().ui.mode)).toBe('webgl-button')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setBasketballCharge(.72))).toBe(true)
  const shot=await page.evaluate(()=>window.__CAMPUS_TEST__.releaseBasketballShot(.72))
  expect(shot).toMatchObject({type:'basketball-shot',id})
  expect(shot.speed).toBeGreaterThan(5.5)
  let state=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())
  expect(state).toMatchObject({held:null,attempts:1,hits:0})
  expect(state.items.find(item=>item.id===id)).toMatchObject({status:'airborne',sleeping:false})

  state=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceBasketball(8))
  expect(state.items.find(item=>item.id===id)).toMatchObject({status:'resting',sleeping:true})
  const attempts=state.attempts
  state=await page.evaluate(()=>window.__CAMPUS_TEST__.resetBasketballs()&&window.__CAMPUS_TEST__.basketballGame())
  expect(state.attempts).toBe(attempts)
  expect(state.items.every(item=>item.status==='resting'&&item.sleeping)).toBe(true)
  expect(await page.evaluate(id=>window.__CAMPUS_TEST__.kickBasketball(id),id)).toMatchObject({type:'basketball-kick',id})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())).toMatchObject({kicks:1})
})

test('basketball scoring rejects lower and duplicate crossings',async({page})=>{
  await ready(page)
  const game=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())
  const id=game.items[0].id,[x,y,z]=game.rimWorld
  await page.evaluate(({id,x,y,z})=>window.__CAMPUS_TEST__.setBasketballState(id,{position:[x,y+.03,z],velocity:[0,-6,0],shot:{id:501},countAttempt:true,wasAboveRim:true}),{id,x,y,z})
  let scored=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceBasketball(.03))
  expect(scored.hits).toBe(1)
  expect(scored.points).toBe(2)
  expect(scored.items.find(item=>item.id===id).scoredShotId).toBe(501)
  scored=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceBasketball(.2))
  expect(scored.hits).toBe(1)

  await page.evaluate(()=>window.__CAMPUS_TEST__.resetBasketballs())
  await page.evaluate(({id,x,y,z})=>window.__CAMPUS_TEST__.setBasketballState(id,{position:[x,y-.04,z],velocity:[0,5,0],shot:{id:502},wasAboveRim:false}),{id,x,y,z})
  const lower=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceBasketball(.04))
  expect(lower.hits).toBe(1)

  await page.evaluate(()=>window.__CAMPUS_TEST__.resetBasketballs())
  await page.evaluate(({id,x,y,z})=>window.__CAMPUS_TEST__.setBasketballState(id,{position:[x,y+.03,z],velocity:[0,-6,0],shot:{id:503,age:8},countAttempt:true,wasAboveRim:true}),{id,x,y,z})
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.advanceBasketball(.03))).hits).toBe(1)

  await page.evaluate(()=>window.__CAMPUS_TEST__.resetBasketballs())
  await page.evaluate(({id})=>window.__CAMPUS_TEST__.setBasketballState(id,{position:[15.1,3.13,-43.52],velocity:[0,0,-6]}),{id})
  const boardBounce=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceBasketball(.04))
  expect(boardBounce.items.find(item=>item.id===id).velocity[2]).toBeGreaterThan(0)

  await page.evaluate(({id})=>window.__CAMPUS_TEST__.setBasketballState(id,{position:[100,1,0],velocity:[1,0,0]}),{id})
  const recovered=await page.evaluate(()=>window.__CAMPUS_TEST__.advanceBasketball(.02))
  expect(recovered.items.find(item=>item.id===id)).toMatchObject({status:'resting',sleeping:true})
})

test('basketball awards two, three and four points by release distance',async({page})=>{
  await ready(page)
  const values=await page.evaluate(()=>[5.9,6.25,8.99,9,12].map(distance=>window.__CAMPUS_TEST__.basketballScoreValue(distance)))
  expect(values).toEqual([2,3,3,4,4])
})

test('holding a basketball blocks aerial and classroom seating',async({page})=>{
  await ready(page)
  const game=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballGame())
  await page.evaluate(id=>window.__CAMPUS_TEST__.pickupBasketball(id),game.items[0].id)
  await page.keyboard.press('KeyV')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toMatchObject({mode:'walk'})
  const stool=await page.evaluate(()=>window.__CAMPUS_TEST__.classroomSeating().sampleStool)
  expect(await page.evaluate(id=>window.__CAMPUS_TEST__.sitClassroomSeat(id),stool.id)).toBe(false)
  await page.evaluate(()=>window.__CAMPUS_TEST__.focusTeachingBlackboard())
  await page.locator('canvas').click({position:{x:640,y:360}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().blackboard)).toBeFalsy()
})

test('activity basketball visual baseline',async({page})=>{
  await ready(page)
  await page.evaluate(()=>window.__CAMPUS_TEST__.applyFixedCamera('activityBasketball'))
  await page.waitForTimeout(150)
  await expect(page.locator('canvas')).toHaveScreenshot('activityBasketball.png')
})

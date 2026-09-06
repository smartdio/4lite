import {expect,test} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const save=async(name,data)=>{await mkdir('docs/reports/campus-birds',{recursive:true});await writeFile(`docs/reports/campus-birds/${name}.json`,JSON.stringify(data,null,2))}

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle'})
  await page.locator('#enter-campus').click()
  await page.waitForFunction(()=>window.__CAMPUS_TEST__?.birds().status==='ready')
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}
test('pigeon escape starts at ten metres and selects a landing beyond twelve metres',async({page},testInfo)=>{
  await ready(page)
  const result=await page.evaluate(()=>{
    const a=window.__CAMPUS_TEST__;a.birdPause(true);a.birdReset('pigeon-ten-metres')
    const {members,view,space}=a.birdInspect(),bird=members.find(b=>b.id==='pigeon-1')
    for(const member of members){member.due=500;member.actionAt=500}
    const direction=view.position.clone().sub(bird.root.position);direction.y=0;direction.normalize()
    const body=bird.root.position.clone().addScaledVector(direction,10.3);body.y+=.9
    let now=performance.now();a.birdStep(now,{paused:true})
    for(let i=0;i<6;i++){now+=50;a.birdStep(now,{roaming:true,playerPosition:body,soundsAllowed:false})}
    const outside={state:bird.state,alert:bird.alert,distance:bird.root.position.distanceTo(body)}
    body.copy(bird.root.position).addScaledVector(direction,9.8);body.y+=.9
    const clear=space.lineOfSight(body,bird.root.position)
    for(let i=0;i<6;i++){now+=50;a.birdStep(now,{roaming:true,playerPosition:body,soundsAllowed:false})}
    return {outside,clear,state:bird.state,targetDistance:bird.target?.position.distanceTo(body),event:a.birds().events.find(e=>e.id===bird.id&&e.type==='takeoff')}
  })
  expect(result.outside.state).toBe('rest');expect(result.outside.alert).toBe(true)
  expect(result.clear).toBe(true);expect(result.state).not.toBe('rest')
  expect(result.targetDistance).toBeGreaterThanOrEqual(12)
  expect(result.event).toMatchObject({reason:'player'})
  expect(result.event.playerDistance).toBeLessThanOrEqual(10)
  await save('pigeon-ten-metre-escape',result)
  await testInfo.attach('pigeon-ten-metre-escape.json',{body:JSON.stringify(result),contentType:'application/json'})
})
for(const habitat of ['ground','perch'])test(`sparrow on ${habitat} stays outside ten metres and escapes inside, landing beyond twelve`,async({page})=>{
  await ready(page)
  const result=await page.evaluate(habitat=>{
    const a=window.__CAMPUS_TEST__;a.birdPause(true);a.birdReset('sparrow-ground-ellipse')
    const {members,space,view}=a.birdInspect(),bird=members.find(b=>b.species==='sparrow'&&b.site.kind===habitat)
    if(!bird)throw new Error(`Missing ${habitat} sparrow fixture`)
    for(const member of members){member.due=500;member.actionAt=500}
    // Place the player's body on safe ground, including below an elevated perch.
    let outsideBody,insideBody
    for(let n=0;n<16;n++){
      const angle=n*Math.PI/8,bodyAt=distance=>{
        const body=bird.root.position.clone(),dy=bird.root.position.y-(space.groundHeightAt(body.x,body.z)+.9)
        const horizontal=Math.sqrt(distance*distance-dy*dy)
        body.x+=Math.sin(angle)*horizontal;body.z+=Math.cos(angle)*horizontal
        body.y=space.groundHeightAt(body.x,body.z)+.9;return body
      }
      const outside=bodyAt(10.3),inside=bodyAt(9.8),foot=inside.clone();foot.y-=.9
      if(space.safeGround(foot)&&space.lineOfSight(outside,bird.root.position)&&space.lineOfSight(inside,bird.root.position)){
        outsideBody=outside;insideBody=inside;break
      }
    }
    if(!insideBody)throw new Error('No unobstructed approach fixture')
    let now=performance.now();a.birdStep(now,{paused:true})
    for(let n=0;n<6;n++){now+=50;a.birdStep(now,{roaming:true,playerPosition:outsideBody,soundsAllowed:false})}
    const outside={state:bird.state,distance:bird.root.position.distanceTo(outsideBody)}
    for(let n=0;n<6;n++){now+=50;a.birdStep(now,{roaming:true,playerPosition:insideBody,soundsAllowed:false})}
    return {habitat,outside,state:bird.state,targetDistance:bird.target?.position.distanceTo(insideBody),event:a.birds().events.find(e=>e.id===bird.id&&e.type==='takeoff'),visibility:space.config.visibility}
  },habitat)
  expect(result.outside.state).toBe('rest');expect(result.outside.distance).toBeGreaterThan(10)
  expect(result.state).not.toBe('rest');expect(result.event).toMatchObject({reason:'player'})
  expect(result.event.playerDistance).toBeGreaterThan(9.5);expect(result.event.playerDistance).toBeLessThanOrEqual(10)
  expect(result.targetDistance).toBeGreaterThanOrEqual(12)
  expect(result.visibility.preferredDistance.sparrow).toBeGreaterThan(12)
  await save(`sparrow-${habitat}-ten-metre-escape`,result)
})
for(const mobile of [false,true])test.describe(mobile?'portrait bird view':'desktop bird view',()=>{
  test.use(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{viewport:{width:1280,height:720}})
  test('arrival shows an unobstructed pigeon across twenty seeds',async({page},testInfo)=>{
    await ready(page)
    await page.evaluate(()=>window.__CAMPUS_TEST__.teleport(-2.5,-2.6,-2.5,-3.6,0,1.62,1.62))
    await page.waitForTimeout(200)
    const result=await page.evaluate(()=>{
      const a=window.__CAMPUS_TEST__;a.birdPause(true)
      const samples=[]
      for(let n=0;n<20;n++){
        a.birdReset(`visible-seed-${n}`)
        const {members,space,view}=a.birdInspect(),pigeon=members.find(b=>b.id==='pigeon-1')
        samples.push({visible:space.visibleScore(pigeon.root.position,'pigeon',view)>0,distance:pigeon.root.position.distanceTo(view.position),position:pigeon.root.position.toArray()})
      }
      return {samples,controls:a.controls(),birds:a.birds()}
    })
    expect(result.samples.every(s=>s.visible)).toBe(true)
    expect(result.samples.every(s=>s.distance>=10.5&&s.distance<=22)).toBe(true)
    expect(result.birds.counts).toEqual({sparrow:3,pigeon:2})
    expect(result.birds.space.maxCandidateChecks).toBeLessThanOrEqual(16)
    await save(mobile?'visibility-seeds-mobile':'visibility-seeds-desktop',result)
    await testInfo.attach('view-seeds.json',{body:JSON.stringify(result),contentType:'application/json'})
    await page.screenshot({path:testInfo.outputPath('arrival-bird.png')})
  })
})

test('an empty walking view brings one existing bird back through a real flight',async({page},testInfo)=>{
  await ready(page)
  const result=await page.evaluate(()=>{
    const a=window.__CAMPUS_TEST__;a.birdPause(true)
    const {members,space,view}=a.birdInspect(),player=view.position.clone().set(15,.9,-39),eye=player.clone().setY(1.6),direction=view.forward.clone().set(-1,0,0)
    const entryEye=view.position.clone(),entryDirection=view.forward.clone()
    let seed=null
    // Ground-capable sparrows can occupy the old empty-view fixture. Find a
    // reproducible empty, unthreatened layout before testing the absence timer.
    for(let n=0;n<30;n++){
      view.set(entryEye,entryDirection,50,16/9);a.birdReset(`forced-view-encounter-ground-${n}`);view.set(eye,direction,50,16/9)
      if(members.every(b=>!space.visibleScore(b.root.position,b.species,view)&&b.root.position.distanceTo(player)>14)){seed=a.birds().seed;break}
    }
    if(!seed)throw new Error('No empty-view fixture found')
    const ids=members.map(b=>b.id),last=members.map(b=>b.root.position.clone());let now=performance.now(),maxStep=0
    for(const bird of members){bird.due=500;bird.actionAt=500}
    view.set(eye,direction,50,16/9)
    const initiallyVisible=members.some(b=>space.visibleScore(b.root.position,b.species,view)>0)
    a.birdStep(now,{paused:true})
    const advance=seconds=>{for(let n=0;n<seconds*20;n++){
      now+=50;a.birdStep(now,{roaming:true,playerPosition:player,listenerPosition:eye,viewDirection:direction,soundsAllowed:false})
      for(let j=0;j<members.length;j++){maxStep=Math.max(maxStep,members[j].root.position.distanceTo(last[j]));last[j].copy(members[j].root.position)}
    }}
    advance(4.5);const before=a.birds().takeoffs
    // A rejected sixteen-candidate batch is allowed to retry after four seconds.
    for(let n=0;n<20&&a.birds().visibility.encounters===0;n++)advance(1)
    const after=a.birds(),arriving=members.find(b=>b.flight&&b.target)
    const targetVisible=!!arriving&&space.visibleScore(arriving.target.position,arriving.species,view)>0
    advance(30)
    return {seed,initiallyVisible,before,after,targetVisible,maxStep,ids,finalIds:members.map(b=>b.id),final:a.birds()}
  })
  await save('forced-view-encounter',result)
  expect(result.initiallyVisible).toBe(false);expect(result.before).toBe(0)
  expect(result.after.visibility.encounters).toBe(1);expect(result.after.takeoffs).toBe(1)
  expect(result.targetVisible).toBe(true);expect(result.maxStep).toBeLessThan(.55)
  expect(result.finalIds).toEqual(result.ids);expect(result.final.visibility.visibleBirds).toBeGreaterThan(0)
  await testInfo.attach('forced-view-encounter.json',{body:JSON.stringify(result),contentType:'application/json'})
})

test('view-aware roaming keeps flights continuous, avoids occupied landings and stays within the CPU budget',async({page},testInfo)=>{
  await ready(page)
  const result=await page.evaluate(()=>{
    const a=window.__CAMPUS_TEST__;a.birdPause(true);a.birdReset('view-aware-roaming')
    const {members,view}=a.birdInspect(),player=view.position.clone(),eye=player.clone(),direction=view.forward.clone()
    const stops=[[-2.5,-2.6,0,0,-1],[-7,-34,-1,0,0],[-20,-34,0,0,-1],[15,-39,0,0,-1],[-7,-34,1,0,0]]
    let now=performance.now(),maxStep=0,invalid=0,visibleTicks=0;const times=[],last=members.map(b=>b.root.position.clone())
    a.birdStep(now,{paused:true})
    for(let n=0;n<6000;n++){
      const stop=stops[Math.floor(n/1200)];player.set(stop[0],.9,stop[1]);eye.set(stop[0],1.6,stop[1]);direction.set(stop[2],stop[3],stop[4]);now+=50
      const started=performance.now();a.birdStep(now,{roaming:true,playerPosition:player,listenerPosition:eye,viewDirection:direction,soundsAllowed:false});times.push(performance.now()-started)
      for(let j=0;j<members.length;j++){const p=members[j].root.position;maxStep=Math.max(maxStep,p.distanceTo(last[j]));last[j].copy(p);if(!Number.isFinite(p.x+p.y+p.z))invalid++}
      if(n%20===0&&a.birds().visibility.visibleBirds>0)visibleTicks++
    }
    times.sort((a,b)=>a-b)
    return {maxStep,invalid,visibleSeconds:visibleTicks,cpuP95:times[Math.floor(times.length*.95)],cpuP99:times[Math.floor(times.length*.99)],birds:a.birds()}
  })
  await testInfo.attach('view-roaming.json',{body:JSON.stringify(result,null,2),contentType:'application/json'})
  await save('visibility-roaming-300s',result)
  expect(result.invalid).toBe(0);expect(result.maxStep).toBeLessThan(.55)
  expect(result.birds.events.filter(e=>e.type==='land').every(e=>e.playerDistance>=12)).toBe(true)
  // Ordinary relocations may keep this route continuously served. The separate
  // empty-view test deliberately exercises encounter scheduling without depending
  // on incidental gaps in an otherwise healthy random flight sequence.
  expect(result.birds.space.maxCandidateChecks).toBeLessThanOrEqual(16)
  expect(result.cpuP95).toBeLessThan(1)
  expect(result.visibleSeconds).toBeGreaterThan(60)
})

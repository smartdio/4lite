import {expect,test} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const saveReport=async(name,data)=>{await mkdir('docs/reports/campus-birds',{recursive:true});await writeFile(`docs/reports/campus-birds/${name}.json`,JSON.stringify(data,null,2))}
import {EXPECTED_SCENE_ASSET_TASK_IDS,EXPECTED_DECODED_AUDIO_URLS} from './expected-runtime-resources.js'
const ready=async page=>{
 await page.addInitScript(()=>performance.setResourceTimingBufferSize(2000))
 await page.goto('/?birdSeed=campus-birds-acceptance',{waitUntil:'networkidle'})
 await page.locator('#enter-campus').click()
 await page.waitForFunction(()=>window.__CAMPUS_TEST__?.birds().status==='ready')
 await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}
const advance=(page,seconds,context={})=>page.evaluate(({seconds,context})=>{
 const a=window.__CAMPUS_TEST__;a.birdPause(true)
 let now=performance.now();a.birdStep(now,{paused:true})
 for(let n=0;n<seconds*20+1;n++){now+=50;a.birdStep(now,{roaming:false,soundsAllowed:false,...context})}
 return a.birds()
},{seconds,context})
test('approved models preload once and expose full campus ranges without textures or static shadow casters',async({page})=>{
 const requests=[];page.on('request',r=>{if(/campus-birds.*glb|audio\/birds\//.test(r.url()))requests.push(r.url())})
 await ready(page)
 const result=await page.evaluate(()=>{const a=window.__CAMPUS_TEST__,i=a.birdInspect(),b=a.birds();let casters=0;i.group.traverse(n=>{if(n.castShadow)casters++});return {b,casters,loading:a.loadingState(),audio:a.audio()}})
 expect(result.b.birds).toHaveLength(5);expect(result.b.drawObjects).toBe(19)
 expect(result.b.library).toMatchObject({materials:1,textures:0,species:{sparrow:{triangles:364},pigeon:{triangles:428}}})
 expect(result.casters).toBe(0);expect(requests).toHaveLength(4)
 expect(result.loading.taskIds).toEqual(EXPECTED_SCENE_ASSET_TASK_IDS);expect(result.audio.decoded).toBe(EXPECTED_DECODED_AUDIO_URLS)
 expect(result.b.space.regions.every(z=>z.cells>0)).toBe(true)
 expect(new Set(result.b.space.perches.map(p=>p.tree)).size).toBeGreaterThan(3)
 expect(result.b.space.height).toBeGreaterThan(10)
})
test('seeds distribute across the campus, and a pigeon crosses building one continuously into the front yard',async({page})=>{
 await ready(page)
 const seeded=await page.evaluate(()=>{const a=window.__CAMPUS_TEST__;a.birdPause(true);const zones=new Set(),layouts=[];for(let i=0;i<35;i++){a.birdReset(`distribution-${i}`);const b=a.birds().birds;for(const v of b)zones.add(v.zone);layouts.push(b.map(v=>v.position))}a.birdReset('repeat');const first=a.birds().birds;a.birdReset('repeat');return {zones:[...zones],layouts,deterministic:JSON.stringify(first)===JSON.stringify(a.birds().birds)}})
 expect(seeded.deterministic).toBe(true);expect(seeded.zones).toEqual(expect.arrayContaining(['front-courtyard','main-playground','old-classroom-yard']))
 // Arrival now intentionally starts one pigeon in the front yard. Establish
 // a main-field departure through a real flight before testing the roof crossing.
 expect(await page.evaluate(()=>{const a=window.__CAMPUS_TEST__;a.birdReset('cross-building');return a.birdRelocate('pigeon-1','main-playground')})).toBe(true)
 const departure=await page.evaluate(()=>{
   const a=window.__CAMPUS_TEST__,b=a.birdInspect().members.find(v=>v.id==='pigeon-1');let now=performance.now();a.birdStep(now,{paused:true})
   for(let n=0;n<1600&&b.state!=='rest';n++){now+=50;a.birdStep(now,{roaming:false,soundsAllowed:false})}
   return {state:b.state,zone:b.site.zone}
 });expect(departure).toEqual({state:'rest',zone:'main-playground'})
 const cross=await page.evaluate(()=>window.__CAMPUS_TEST__.birdRelocate('pigeon-1','front-courtyard'));expect(cross).toBe(true)
 const checked=await page.evaluate(()=>{
 const a=window.__CAMPUS_TEST__,{members}=a.birdInspect(),b=members.find(v=>v.id==='pigeon-1');let now=performance.now(),maxStep=0,maxY=0,aboveRoof=false;const last=b.root.position.clone();a.birdStep(now,{paused:true})
 for(let n=0;n<1600&&b.state!=='rest';n++){now+=50;a.birdStep(now,{roaming:false,soundsAllowed:false});maxStep=Math.max(maxStep,last.distanceTo(b.root.position));last.copy(b.root.position);maxY=Math.max(maxY,last.y);if(last.z>-23.8&&last.z<-13.5&&last.y>8)aboveRoof=true}
 return {maxStep,maxY,aboveRoof,state:b.state,zone:b.site.zone,snapshot:a.birds()}
 })
 expect(checked.zone).toBe('front-courtyard');expect(checked.state).toBe('rest');expect(checked.aboveRoof).toBe(true);expect(checked.maxStep).toBeLessThan(.5)
 expect(checked.snapshot.events.find(e=>e.type==='land'&&e.id==='pigeon-1').playerDistance).toBeGreaterThanOrEqual(12)
})
test('aerial camera, walk movement and pause preserve the actual body and bird clock',async({page})=>{
 await ready(page)
 await page.evaluate(()=>{const a=window.__CAMPUS_TEST__;a.birdPause(false);a.teleport(-10,-32,-10,-33)})
 await page.waitForTimeout(150)
 const original=await page.evaluate(()=>window.__CAMPUS_TEST__.birds())
 await page.evaluate(()=>{const a=window.__CAMPUS_TEST__;a.view([20,30,-10],[0,0,-30])})
 await page.waitForTimeout(150)
 expect((await page.evaluate(()=>window.__CAMPUS_TEST__.birds())).player).toEqual(original.player)
 await page.evaluate(()=>window.__CAMPUS_TEST__.birdPause(true))
 await page.waitForTimeout(100);const paused=await page.evaluate(()=>window.__CAMPUS_TEST__.birds());await page.waitForTimeout(500)
 expect((await page.evaluate(()=>window.__CAMPUS_TEST__.birds())).time).toBe(paused.time)
 await page.evaluate(()=>{const a=window.__CAMPUS_TEST__;a.teleport(-10,-32);a.walkStep(.5,0);a.birdPause(false)})
 await page.waitForTimeout(150);expect((await page.evaluate(()=>window.__CAMPUS_TEST__.birds())).player[0]).toBeCloseTo(-9.5)
})
test('sparrows fly between real branches and safe ground, with one shared ellipse batch and close escape',async({page})=>{
 await ready(page)
 const result=await page.evaluate(()=>{
   const a=window.__CAMPUS_TEST__;a.birdPause(true);a.birdReset('sparrow-ground-ellipse')
   const {members,space,shadows}=a.birdInspect(),bird=members.find(b=>b.id==='sparrow-1')
   for(const b of members){b.due=Infinity;b.actionAt=Infinity}
   let now=performance.now(),maxStep=0,valid=true;const last=bird.root.position.clone(),legs=[]
   a.birdStep(now,{paused:true})
   for(const habitat of ['ground','perch','ground']){
     const started=a.birdRelocate(bird.id,'main-playground',habitat)
     if(!started){legs.push({started,habitat});break}
     valid&&=space.clearFlight(bird.flight,'sparrow')
     for(let n=0;n<1600&&bird.state!=='rest';n++){
       now+=50;a.birdStep(now,{roaming:false,soundsAllowed:false})
       maxStep=Math.max(maxStep,last.distanceTo(bird.root.position));last.copy(bird.root.position)
     }
     bird.due=Infinity;bird.actionAt=Infinity
     now+=50;a.birdStep(now,{roaming:false,soundsAllowed:false})
     legs.push({started,habitat:bird.site.kind,state:bird.state,ground:space.safeGround(bird.root.position),opacity:shadows.mesh.geometry.getAttribute('shadowOpacity').getX(bird.shadowIndex)})
   }
   const position=bird.root.position.clone();position.x+=2;position.y+=.9
   for(let n=0;n<10;n++){now+=50;a.birdStep(now,{roaming:true,playerPosition:position,soundsAllowed:false})}
   return {legs,maxStep,valid,shadowCount:shadows.mesh.count,indices:members.map(b=>b.shadowIndex),drawObjects:a.birds().drawObjects,escape:a.birds().events.find(e=>e.id===bird.id&&e.type==='takeoff'&&e.reason==='player')}
 })
 expect(result.legs).toHaveLength(3)
 expect(result.legs.map(l=>l.habitat)).toEqual(['ground','perch','ground'])
 expect(result.legs.every(l=>l.started&&l.state==='rest')).toBe(true)
 expect(result.legs.map(l=>l.opacity)).toEqual([1,0,1]);expect(result.legs[0].ground&&result.legs[2].ground).toBe(true)
 expect(result.valid).toBe(true);expect(result.maxStep).toBeLessThan(.55)
 expect(result.indices).toEqual([0,1,2,3,4]);expect(result.shadowCount).toBe(5);expect(result.drawObjects).toBe(19)
 expect(result.escape?.playerDistance).toBeLessThan(10)
 await saveReport('sparrow-ground-ellipse',result)
})
test('fixed seed runs ten simulated minutes with continuous positions, bounded decisions and varied landing zones',async({page},testInfo)=>{
 await ready(page)
 const result=await page.evaluate(()=>{
 const a=window.__CAMPUS_TEST__;a.birdPause(true);a.birdReset('ten-minute-soak');let now=performance.now(),maxStep=0,invalid=0;const {members}=a.birdInspect(),last=members.map(b=>b.root.position.clone()),times=[];a.birdStep(now,{paused:true})
 for(let n=0;n<12001;n++){now+=50;const t=performance.now();a.birdStep(now,{roaming:false,soundsAllowed:false});times.push(performance.now()-t);for(let j=0;j<members.length;j++){const p=members[j].root.position;maxStep=Math.max(maxStep,last[j].distanceTo(p));if(!Number.isFinite(p.x+p.y+p.z))invalid++;last[j].copy(p)}}
 times.sort((a,b)=>a-b);const b=a.birds();return {b,maxStep,invalid,cpuP95:times[Math.floor(times.length*.95)],cpuP99:times[Math.floor(times.length*.99)]}
 })
 await saveReport('campus-final-600s',result)
 await testInfo.attach('bird-600s.json',{body:JSON.stringify(result,null,2),contentType:'application/json'})
 expect(result.invalid).toBe(0);expect(result.maxStep).toBeLessThan(.55);expect(result.b.time).toBeCloseTo(600,1)
 expect(result.b.takeoffs).toBeGreaterThan(40);expect(result.b.landings).toBeGreaterThan(35);expect(result.b.space.maxCandidateChecks).toBeLessThanOrEqual(16)
 expect(new Set(result.b.events.filter(e=>e.type==='land').map(e=>e.zone)).size).toBeGreaterThanOrEqual(2)
 expect(result.b.events.filter(e=>e.type==='land').every(e=>e.playerDistance>=12)).toBe(true)
})
test('both species have a visible ground shadow in the actual campus render',async({page})=>{
 await ready(page)
 const pixels=await page.evaluate(()=>{
   const a=window.__CAMPUS_TEST__;a.birdPause(true);a.birdReset('sparrow-ground-ellipse')
   const {members,shadows}=a.birdInspect(),canvas=document.querySelector('canvas'),copy=document.createElement('canvas')
   copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d',{willReadFrequently:true})
   const read=()=>{a.performanceSnapshot();ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,copy.width,copy.height).data}
   return ['sparrow-1','pigeon-2'].map(id=>{
     const bird=members.find(b=>b.id===id),p=bird.root.position,c=a.applyFixedCamera('mainField'),original={...c}
     c.position=[p.x-.6,p.y+.6,p.z+.8];c.target=[p.x,p.y+.06,p.z];a.applyFixedCamera('mainField');Object.assign(c,original)
     shadows.mesh.visible=true;const on=read();shadows.mesh.visible=false;const off=read();shadows.mesh.visible=true
     let darker=0
     for(let y=Math.floor(copy.height*.3);y<copy.height*.7;y++)for(let x=Math.floor(copy.width*.3);x<copy.width*.7;x++){
       const i=(y*copy.width+x)*4
       if(off[i]+off[i+1]+off[i+2]-on[i]-on[i+1]-on[i+2]>15)darker++
     }
     return {id,darker}
   })
 })
 for(const result of pixels)expect(result.darker,JSON.stringify(pixels)).toBeGreaterThan(25)
 await saveReport('ground-shadow-pixels',pixels)
})
test('a bird model failure keeps the full preload gate closed',async({page})=>{
 await page.route('**/campus-birds-v03.glb',route=>route.abort())
 await page.goto('/',{waitUntil:'networkidle'});await page.locator('#enter-campus').click()
 await expect(page.locator('#loading-retry')).toBeVisible({timeout:30000})
 expect(await page.evaluate(()=>window.__CAMPUS_TEST__.loadingState().fullReady)).toBe(false)
})
test('visible minigames silence birds, unified pause and a separate game scene freeze their time',async({page})=>{
 await ready(page)
 await page.evaluate(()=>{const a=window.__CAMPUS_TEST__;a.teleport(-10,-32);a.birdPause(false)})
 await page.waitForTimeout(150);const body=await page.evaluate(()=>window.__CAMPUS_TEST__.birds().player)
 await page.evaluate(()=>window.__CAMPUS_TEST__.enterFlagRaising());await page.waitForTimeout(150)
 const flag=await page.evaluate(()=>window.__CAMPUS_TEST__.birds());expect(flag.player).toEqual(body);expect(flag.proximity).toBe(false);expect(flag.sound).toBe(false)
 await page.evaluate(()=>window.__CAMPUS_TEST__.pauseMinigame());await page.waitForTimeout(100);const paused=await page.evaluate(()=>window.__CAMPUS_TEST__.birds());await page.waitForTimeout(300)
 expect((await page.evaluate(()=>window.__CAMPUS_TEST__.birds())).time).toBe(paused.time)
 await page.evaluate(()=>window.__CAMPUS_TEST__.exitPausedMinigame());await page.waitForTimeout(100)
 await page.evaluate(()=>window.__CAMPUS_TEST__.enterDodgeball());await page.waitForTimeout(100);const dodge=await page.evaluate(()=>window.__CAMPUS_TEST__.birds());await page.waitForTimeout(300)
 expect((await page.evaluate(()=>window.__CAMPUS_TEST__.birds())).time).toBe(dodge.time)
 await page.evaluate(()=>window.__CAMPUS_TEST__.exitDodgeball());await page.waitForTimeout(100);expect((await page.evaluate(()=>window.__CAMPUS_TEST__.birds())).time-dodge.time).toBeLessThan(.2)
})
test('desktop and touch viewport A/B keep draw calls and frame-time increments within bird budgets',async({page,browser},testInfo)=>{
 const results=[]
 for(const [name,width,height,budget] of [['desktop',1280,720,1],['touch-emulation',390,844,2]]) {
   const context=await browser.newContext({viewport:{width,height},isMobile:name==='touch-emulation',hasTouch:name==='touch-emulation',deviceScaleFactor:name==='touch-emulation'?2:1,reducedMotion:'reduce'})
   const page=await context.newPage();await ready(page)
   await page.evaluate(()=>{const a=window.__CAMPUS_TEST__;a.birdPause(false);a.applyFixedCamera('mainField')})
   const trials=[]
   // Paired on/off runs in both orders reduce warm-up / scheduling bias.
   for(const enabled of [false,true,true,false]) {
     await page.evaluate(value=>window.__CAMPUS_TEST__.birdEnabled(value),enabled)
     const timing=await page.evaluate(()=>window.__CAMPUS_TEST__.sampleFrameTimings(180,30))
     const stats=await page.evaluate(()=>window.__CAMPUS_TEST__.performanceSnapshot())
     trials.push({enabled,timing,renderer:stats.renderer,buffers:stats.buffers,resources:stats.resources,textures:stats.textures})
   }
   results.push({name,budget,trials});await context.close()
 }
 await saveReport('performance-ab',results)
 await testInfo.attach('bird-performance-ab.json',{body:JSON.stringify(results,null,2),contentType:'application/json'})
 for(const result of results) {
   const p95=t=>t.timing.p95??t.timing.p95Ms
   const on=result.trials.filter(t=>t.enabled),off=result.trials.filter(t=>!t.enabled)
   const delta=on.reduce((n,t)=>n+p95(t),0)/2-off.reduce((n,t)=>n+p95(t),0)/2
   expect(delta,JSON.stringify(result)).toBeLessThanOrEqual(result.budget)
   expect(Math.max(...on.map(t=>t.renderer.render.calls))-Math.min(...off.map(t=>t.renderer.render.calls))).toBeLessThanOrEqual(46)
   expect(on[0].renderer.memory.textures).toBe(off[0].renderer.memory.textures)
 }
})

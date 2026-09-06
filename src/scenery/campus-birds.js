import * as THREE from 'three'
import {BIRD_CONFIG} from './bird-config.js'
import {createBirdLibrary,createBirdContactShadows,createBirdInstanceBatch,updateBirdPose} from './bird-model.js'
import {createBirdSceneClock,smoothBirdStep} from './bird-motion.js'
import {createBirdView} from './bird-view.js'
import {PIGEON_STRIDE,PIGEON_LAUNCH_DURATION,samplePigeonWalk,pigeonPeck,samplePigeonLaunch,pigeonFlightWeights} from './pigeon-motion.js'

export function createBirdRandom(seed) {
  let value=2166136261
  for(const character of String(seed)){value^=character.charCodeAt(0);value=Math.imul(value,16777619)}
  return ()=>{value+=0x6D2B79F5;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}
}
export function createCampusBirds({root,assetLoader,audio,config=BIRD_CONFIG,seed=globalThis.crypto?.randomUUID?.()??String(Math.random())}) {
  const group=new THREE.Group();group.name='campus-birds';root.add(group)
  const clock=createBirdSceneClock(),player=new THREE.Vector3(-2.5,.9,-1),listener=new THREE.Vector3(),look=new THREE.Vector3()
  const view=createBirdView(config.visibility)
  const members=[],events=[],pose={time:0,flight:0,landing:0,walking:0,alert:0,peck:0,launch:0,phase:0}
  const orient=new THREE.Euler(0,0,0,'YXZ'),scratch=new THREE.Vector3(),previous=new THREE.Vector3()
  const launchSample={},flightSample={}
  let library=null,shadows=null,instances=null,space=null,rng=createBirdRandom(seed),status='unloaded',loadPromise=null,disposed=false
  let lastTime=0,nextQuery=0,nextChirp=9,proximity=false,sound=false,queryTicks=0,takeoffs=0,landings=0,diversions=0,deferred=0,maxUpdateMs=0
  let visibleBirds=0,lastSeenAt=0,nextEncounter=0,encounterCursor=0,encounters=0
  const between=range=>range[0]+rng()*(range[1]-range[0])
  const event=(type,bird,extra={})=>{events.push({type,id:bird.id,time:clock.time,zone:bird.site?.zone,...extra});if(events.length>256)events.shift()}
  const occupied=(site,self)=>members.some(b=>b!==self&&(b.target??b.site)?.position.distanceTo(site.position)<.7)
  const soundAt=(groupName,bird,volume)=>{
    if(!sound)return
    const distance=bird.root.position.distanceTo(listener)
    if(distance>22)return
    audio?.playReady(groupName,{volume:volume/(1+(distance/4)**2),pan:THREE.MathUtils.clamp((bird.root.position.x-listener.x)/Math.max(5,distance),-.8,.8),rate:bird.species==='sparrow'&&groupName==='birdFlutter'?1.25:1})
  }
  const settle=(bird,site,initial=false)=>{
    bird.site=site;bird.target=null;bird.flight=null;bird.state='rest';bird.alert=false;bird.fleeAt=Infinity
    bird.landedAt=clock.time;bird.due=clock.time+between(config.dwell[bird.species]);bird.actionAt=clock.time+1+rng()*4
    bird.recent.push(site.zone);if(bird.recent.length>2)bird.recent.shift()
    bird.root.position.copy(site.position);bird.settleRotation=bird.root.rotation.clone();bird.gait=null;bird.action=null;bird.walkDistance=0
    if(!initial){landings++;event('land',bird,{habitat:site.kind,position:site.position.toArray(),playerDistance:site.position.distanceTo(player)})}
  }
  const beginFlight=(bird,result,reason)=>{
    bird.target=result.site;bird.flight=result.flight;bird.state='launch';bird.launchDuration=bird.species==='pigeon'?PIGEON_LAUNCH_DURATION:.22;bird.flightAt=clock.time+bird.launchDuration
    bird.wingAt=bird.flightAt;bird.groundLaunch=true
    bird.startRotation=bird.root.rotation.clone();bird.flight.sample(0,scratch,orient);bird.launchYaw=orient.y
    bird.gait=null;bird.action=null;bird.fleeAt=Infinity
    takeoffs++;event('takeoff',bird,{reason,target:result.site.zone,duration:result.flight.duration,playerDistance:bird.root.position.distanceTo(player)});soundAt('birdFlutter',bird,.48)
    if(reason==='player')for(const neighbour of members) {
      if(neighbour===bird||neighbour.species!==bird.species||neighbour.state!=='rest')continue
      if(neighbour.root.position.distanceTo(bird.root.position)<config.neighbourDistance&&space.lineOfSight(bird.root.position,neighbour.root.position))neighbour.fleeAt=Math.min(neighbour.fleeAt,clock.time+between(config.neighbourDelay))
    }
  }
  const chooseFlight=(bird,reason,zoneId=null,habitat=null)=>{
    // A walking pigeon departs from its actual foot position, not its patch centre.
    const from={...bird.site,position:bird.root.position.clone(),heading:bird.root.rotation.y}
    if(bird.site.kind==='ground'||bird.species==='pigeon')from.portal=null
    const prefer=proximity&&view.ready&&!zoneId&&(reason==='encounter'||visibleBirds<2&&rng()<config.visibility.preference)
    const result=space.destination(bird.species,rng,bird.recent,player,s=>occupied(s,bird),from,zoneId,{view:prefer?view:null,requireVisible:reason==='encounter',habitat})
    if(!result){deferred++;if(reason!=='encounter'){bird.due=clock.time+2+rng()*3;bird.fleeAt=reason==='player'?clock.time+.5:Infinity}return false}
    beginFlight(bird,result,reason);return true
  }
  const loopFrom=(bird)=>{
    const p=bird.root.position.clone(),circuit=space.circuit
    const closest=circuit.reduce((best,v,i)=>v.distanceToSquared(p)<circuit[best].distanceToSquared(p)?i:best,0)
    const points=[p]
    for(let i=0;i<=circuit.length;i++)points.push(circuit[(closest+i)%circuit.length])
    return space.flightThrough(points,bird.species)
  }
  const divert=(bird)=>{
    bird.groundLaunch=false
    const from={zone:'air',position:bird.root.position.clone(),portal:[bird.root.position.clone()]}
    const result=space.destination(bird.species,rng,bird.recent,player,s=>occupied(s,bird),from,null,{view:proximity&&view.ready?view:null})
    const flight=result?.flight??loopFrom(bird)
    if(flight){bird.flight=flight;bird.target=result?.site??null;bird.state=result?'flight':'holding';bird.flightAt=clock.time;bird.startRotation=bird.root.rotation.clone();diversions++;event('divert',bird,{holding:!result});return true}
    // Retrace a verified curve prefix up to its highest point. This fallback uses
    // the exact same curve, so candidate exhaustion cannot introduce a new obstacle.
    const original=bird.flight,at=bird.progress??0,u=original.parameterAt?original.parameterAt(clock.time-bird.flightAt):smoothBirdStep(at)
    let safeU=0,highest=-Infinity
    for(let i=0;i<=40;i++){const t=u*i/40;original.curve.getPointAt(t,scratch);if(scratch.y>highest){highest=scratch.y;safeU=t}}
    if(Math.abs(u-safeU)<.002)return false
    const duration=Math.max(1,original.length*Math.abs(u-safeU)/4)
    const curve={getPointAt(t,out){return original.curve.getPointAt(THREE.MathUtils.lerp(u,safeU,t),out)}}
    bird.flight={curve,duration,length:original.length*Math.abs(u-safeU),sample(elapsed,p,rotation){const t=Math.min(1,elapsed/duration);curve.getPointAt(t,p);curve.getPointAt(Math.min(1,t+.005),scratch);look.subVectors(scratch,p);rotation.set(0,Math.atan2(look.x,look.z),.12,'YXZ');return t}}
    bird.state='holding';bird.target=null;bird.flightAt=clock.time;bird.startRotation=bird.root.rotation.clone();diversions++;event('retrace',bird);return true
  }
  const groundAction=bird=>{
    bird.actionAt=clock.time+2+rng()*4
    if(bird.species!=='pigeon'||bird.alert||bird.gait||bird.action)return
    if(rng()<.45){bird.action={at:clock.time,period:.85+rng()*.25,count:rng()<.3?2:1};return}
    const angle=bird.root.rotation.y+(rng()-.5)*1.5,distance=(2+Math.floor(rng()*4))*PIGEON_STRIDE,end=bird.root.position.clone()
    end.x+=Math.sin(angle)*distance;end.z+=Math.cos(angle)*distance;end.y=space.groundHeightAt(end.x,end.z)
    const origin=bird.site.position
    if(end.distanceTo(origin)>bird.site.radius||!space.safeGround(end)||!space.safeGround(bird.root.position))return
    if(!space.index.clear(bird.root.position,end,.32,.15,.20,b=>b.kind==='solid'))return
    bird.walkDistance=0
    bird.gait={start:bird.root.position.clone(),end,at:clock.time,distance,duration:distance/(.20+rng()*.07)+.18,turnDuration:.24,startYaw:bird.root.rotation.y,yaw:angle,sample:{}}
  }
  const tickDecisions=()=>{
    queryTicks++
    visibleBirds=proximity&&view.ready?members.filter(b=>space.visibleScore(b.root.position,b.species,view)>0).length:0
    if(visibleBirds||!proximity)lastSeenAt=clock.time
    for(const bird of members) {
      if(bird.state!=='rest'){
        if(bird.target&&(bird.progress??0)>.48&&!space.available(bird.target,bird.species,player))divert(bird)
        continue
      }
      const thresholds=config.proximity[bird.species]
      const distance=bird.root.position.distanceTo(player),visible=proximity&&distance<thresholds.relax&&space.lineOfSight(player,bird.root.position)
      if(bird.species==='pigeon'){
        if(visible&&distance<thresholds.alert)bird.alert=true
        else if(!visible||distance>thresholds.relax)bird.alert=false
      }
      if(visible&&distance<=thresholds.flee&&!Number.isFinite(bird.fleeAt))bird.fleeAt=Math.min(bird.fleeAt,clock.time)
      if(bird.fleeAt<=clock.time){chooseFlight(bird,'player');continue}
      if(!space.available(bird.site,bird.species,null)){chooseFlight(bird,'occupied-area');continue}
      if(clock.time>=bird.due&&clock.time-bird.landedAt>=config.cooldown){chooseFlight(bird,'relocate');continue}
      if(clock.time>=bird.actionAt)groundAction(bird)
    }
    // Only one existing bird makes an encounter flight. A turn of the camera
    // never respawns birds or invalidates a safe flight already in progress.
    if(proximity&&view.ready&&clock.time-lastSeenAt>=config.visibility.absenceSeconds&&clock.time>=nextEncounter) {
      const arriving=members.some(b=>b.flight&&b.target&&space.visibleScore(b.target.position,b.species,view)>0)
      if(!arriving){
        const eligible=members.filter(b=>b.state==='rest'&&!b.alert&&clock.time-b.landedAt>=config.cooldown)
          .sort((a,b)=>(a.species==='pigeon'?0:1)-(b.species==='pigeon'?0:1))
        const bird=eligible[encounterCursor++%eligible.length]
        const started=bird&&chooseFlight(bird,'encounter')
        if(started)encounters++
        nextEncounter=clock.time+(started?between(config.visibility.interval):config.visibility.retrySeconds)
      }
    }
    if(clock.time>=nextChirp) {
      nextChirp=clock.time+between(config.chirpInterval)
      const candidates=members.filter(b=>b.species==='sparrow'&&b.state==='rest'&&!b.alert)
      if(candidates.length)soundAt('birdChirp',candidates[Math.floor(rng()*candidates.length)],.38)
    }
  }
  const animateBird=bird=>{
    const elapsed=clock.time-bird.flightAt
    let flightWeight=0,wingSpread=0,push=0,landingWeight=0,launchWeight=0,walking=0,peck=0
    if(bird.state==='launch'&&elapsed<0){
      const progress=(elapsed+bird.launchDuration)/bird.launchDuration
      launchWeight=Math.sin(progress*Math.PI)
      if(bird.species==='pigeon'){
        const preparation=samplePigeonLaunch(elapsed+bird.launchDuration,launchSample)
        launchWeight=preparation.crouch;wingSpread=preparation.wings;push=preparation.push
        const turn=Math.atan2(Math.sin(bird.launchYaw-bird.startRotation.y),Math.cos(bird.launchYaw-bird.startRotation.y))
        bird.root.rotation.y=bird.startRotation.y+THREE.MathUtils.clamp(turn,-.25,.25)*smoothBirdStep(progress)
      }
    }
    else if(bird.flight) {
      if(bird.state==='launch'){
        bird.state='flight'
        if(bird.species==='pigeon')bird.startRotation.copy(bird.root.rotation)
      }
      bird.progress=bird.flight.sample(Math.max(0,elapsed),bird.root.position,orient)
      const blend=smoothBirdStep(elapsed/.38)
      bird.root.rotation.x=THREE.MathUtils.lerp(bird.startRotation.x,orient.x,blend)
      bird.root.rotation.y=bird.startRotation.y+Math.atan2(Math.sin(orient.y-bird.startRotation.y),Math.cos(orient.y-bird.startRotation.y))*blend
      bird.root.rotation.z=THREE.MathUtils.lerp(bird.startRotation.z,orient.z,blend)
      const travel=(bird.flight.parameterAt?bird.flight.parameterAt(elapsed):smoothBirdStep(bird.progress))*bird.flight.length
      flightWeight=smoothBirdStep((Math.min(travel,bird.flight.length-travel)-.35)/.75)
      const remaining=bird.flight.duration-elapsed
      landingWeight=bird.target?smoothBirdStep(1-remaining/.75):0
      if(bird.species==='pigeon'&&bird.target){
        const weight=pigeonFlightWeights(bird.groundLaunch?elapsed:1,remaining,bird.flight.length-travel,flightSample)
        flightWeight=weight.airborne;wingSpread=weight.wings
        push=bird.groundLaunch?1-smoothBirdStep(elapsed/.12):0
        const upright=smoothBirdStep(1-remaining/.20)
        bird.root.rotation.x*=1-upright;bird.root.rotation.z*=1-upright
      }
      if(bird.progress>=1) {
        if(bird.target&&space.available(bird.target,bird.species,player))settle(bird,bird.target)
        else divert(bird)
      }
    } else if(bird.state==='rest') {
      const age=clock.time-bird.landedAt,settleWeight=smoothBirdStep(age/.35)
      bird.root.rotation.x=bird.settleRotation.x*(1-settleWeight);bird.root.rotation.z=bird.settleRotation.z*(1-settleWeight)
      // The approach has already folded the wings before contact. Reopening
      // them in the first resting frame creates a visible landing pop.
      flightWeight=0
      landingWeight=1-smoothBirdStep(age/.32)
      if(bird.gait) {
        const gait=bird.gait,age=clock.time-gait.at
        if(bird.alert){bird.gait=null}
        else {
          const step=samplePigeonWalk(age-gait.turnDuration,gait.duration,gait.distance,gait.sample)
          bird.root.position.lerpVectors(gait.start,gait.end,step.distance/gait.distance)
          bird.root.rotation.y=THREE.MathUtils.lerp(gait.startYaw,gait.yaw,smoothBirdStep(age/gait.turnDuration))
          walking=step.strength;bird.walkDistance=step.distance
          if(step.progress===1)bird.gait=null
        }
      } else if(bird.action){
        const action=bird.action,t=(clock.time-action.at)/action.period
        if(bird.alert||t>=action.count)bird.action=null
        else peck=pigeonPeck(t%1)
      }
    }
    const dt=Math.max(0,clock.time-(bird.poseAt??clock.time));bird.poseAt=clock.time
    bird.peck=THREE.MathUtils.lerp(bird.peck??0,peck,1-Math.exp(-dt*35))
    bird.alertLevel=THREE.MathUtils.lerp(bird.alertLevel??0,bird.alert?1:0,1-Math.exp(-dt*15))
    pose.time=clock.time;pose.phase=bird.phase;pose.flight=flightWeight;pose.landing=landingWeight;pose.launch=launchWeight;pose.walking=walking;pose.alert=bird.alertLevel;pose.peck=bird.peck
    pose.wingSpread=bird.species==='pigeon'?(bird.state==='holding'?1:wingSpread):flightWeight;pose.push=push
    pose.walkDistance=bird.walkDistance??0;pose.flightTime=Math.max(0,clock.time-(bird.wingAt??bird.flightAt));pose.flightRemaining=bird.flight?bird.flight.duration-elapsed:Infinity
    pose.contact=bird.state==='rest'?Math.sin(Math.PI*smoothBirdStep((clock.time-bird.landedAt)/.28)):0
    updateBirdPose(bird,pose)
  }
  const initialize=()=>{
    for(const [species,count] of Object.entries(config.counts))for(let i=0;i<count;i++) {
      // One pigeon is easy to discover on arrival; the remaining birds retain
      // the full-campus random distribution and all five keep their identity.
      const result=space.destination(species,rng,[],player,s=>occupied(s),null,null,{view:species==='pigeon'&&i===0&&view.ready?view:null})
      if(!result)throw new Error(`No safe initial ${species} destination`)
      const model=library.create(species),bird=Object.assign(model,{id:`${species}-${i+1}`,phase:rng()*Math.PI*2,recent:[],flightAt:Infinity,shadowIndex:members.length})
      bird.root.rotation.y=rng()*Math.PI*2;group.add(bird.root);members.push(bird);settle(bird,result.site,true)
      shadows.set(bird.shadowIndex,bird.root.position,space.groundHeightAt(bird.root.position.x,bird.root.position.z),bird.spec.length,bird.root.rotation.y)
      bird.landedAt=-10 // Initial birds are already resting; do not play a landing pose.
    }
    instances=createBirdInstanceBatch(members);group.add(instances.group);instances.update()
  }
  return {
    load(){
      if(disposed)return Promise.reject(new Error('Bird controller disposed'))
      return loadPromise??=(async()=>{status='loading';try{const gltf=await assetLoader.loadGltf(config.url);library=createBirdLibrary(gltf);if(disposed){library.dispose();return false}shadows=createBirdContactShadows(Object.values(config.counts).reduce((sum,n)=>sum+n,0));group.add(shadows.mesh);status='loaded';return true}catch(e){if(!disposed)status='failed';throw e}})()
    },
    bindWorld(world,{playerPosition=null,viewPosition=playerPosition,viewDirection=null,verticalFov=50,aspect=16/9}={}){
      if(status!=='loaded'||space)throw new Error('Bird bind requires loaded, unbound resources')
      if(playerPosition)player.copy(playerPosition)
      view.set(viewPosition,viewDirection,verticalFov,aspect)
      space=world;initialize();status='ready'
    },
    update(now,{paused=false,visible=true,roaming=false,playerPosition=null,listenerPosition=playerPosition,viewDirection=null,verticalFov=50,aspect=16/9,soundsAllowed=true}={}) {
      if(status!=='ready'||disposed)return
      const started=performance.now(),frozen=paused||!visible
      if(roaming&&playerPosition)player.copy(playerPosition)
      if(listenerPosition)listener.copy(listenerPosition)
      if(roaming&&!frozen)view.set(listenerPosition,viewDirection,verticalFov,aspect)
      proximity=roaming&&!frozen;sound=soundsAllowed&&!frozen
      clock.tick(now,frozen)
      if(frozen){audio?.stopGroup('birdChirp');audio?.stopGroup('birdFlutter');lastTime=clock.time;return}
      if(clock.time===lastTime)return
      lastTime=clock.time
      if(clock.time>=nextQuery){nextQuery=clock.time+config.queryInterval;tickDecisions()}
      for(const bird of members){animateBird(bird);shadows.set(bird.shadowIndex,bird.root.position,space.groundHeightAt(bird.root.position.x,bird.root.position.z),bird.spec.length,bird.root.rotation.y)}
      instances.update()
      maxUpdateMs=Math.max(maxUpdateMs,performance.now()-started)
    },
    snapshot:()=>({status,seed,time:clock.time,player:player.toArray(),proximity,sound,visibility:{visibleBirds,encounters,lastSeenAt,nextEncounter,eye:view.position.toArray(),direction:view.forward.toArray()},counts:config.counts,library:library?.snapshot(),drawObjects:(instances?.drawObjects??0)+(shadows?1:0),space:space?.snapshot(),queryTicks,takeoffs,landings,diversions,deferred,maxUpdateMs,events:[...events],birds:members.map(b=>({id:b.id,species:b.species,state:b.state,alert:b.alert,position:b.root.position.toArray(),rotation:b.root.rotation.toArray().slice(0,3),site:b.site.id??b.site.zone,habitat:b.site.kind,zone:b.site.zone,target:b.target?.zone??null,targetHabitat:b.target?.kind??null,due:b.due,landedAt:b.landedAt,recent:[...b.recent],progress:b.progress??0}))}),
    // Exposed only through the campus DEV / test-build API.
    inspect:()=>({members,space,group,clock,view,shadows}),
    requestRelocation:(id,zone,habitat)=>{const bird=members.find(b=>b.id===id);return bird?.state==='rest'?chooseFlight(bird,'test',zone,habitat):false},
    reset(nextSeed){instances?.dispose();seed=nextSeed;rng=createBirdRandom(seed);for(const b of members)b.root.removeFromParent();members.length=0;events.length=0;clock.seek(0);lastTime=nextQuery=queryTicks=takeoffs=landings=diversions=deferred=visibleBirds=lastSeenAt=nextEncounter=encounterCursor=encounters=0;nextChirp=9;initialize()},
    dispose(){if(disposed)return;disposed=true;status='disposed';audio?.stopGroup('birdChirp');audio?.stopGroup('birdFlutter');instances?.dispose();shadows?.dispose();group.removeFromParent();library?.dispose();members.length=0;space=null},
  }
}

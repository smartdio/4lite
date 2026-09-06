import * as THREE from 'three'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import {createAssetLoader} from '../../src/assets/asset-loader.js'
import {createBirdLibrary,createBirdContactShadows,updateBirdPose} from '../../src/scenery/bird-model.js'
import {createBirdFlight,createBirdSceneClock,smoothBirdStep as smooth} from '../../src/scenery/bird-motion.js'
import {PIGEON_LAUNCH_DURATION,samplePigeonWalk,pigeonPeck,samplePigeonLaunch,pigeonFlightWeights} from '../../src/scenery/pigeon-motion.js'

const stage=document.querySelector('#stage'),canvas=document.querySelector('canvas')
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false})
renderer.setPixelRatio(Math.min(devicePixelRatio,2))
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false
const scene=new THREE.Scene();scene.background=new THREE.Color('#e1e3d5');scene.fog=new THREE.Fog('#e1e3d5',9,24)
const camera=new THREE.PerspectiveCamera(38,1,.01,60)
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.minDistance=.6;controls.maxDistance=9;controls.maxPolarAngle=Math.PI*.48;controls.enablePan=false
scene.add(new THREE.HemisphereLight('#fff4d8','#7d8873',2.1))
const sun=new THREE.DirectionalLight('#fff4db',2.4);sun.position.set(-3,6,4);sun.castShadow=true
sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.5,far:15});sun.shadow.bias=-.0003;scene.add(sun)
const floorMat=new THREE.MeshStandardMaterial({color:'#aeb59c',roughness:1})
const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,60),floorMat);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor)
const branches=new THREE.Group();scene.add(branches)
const branchMat=new THREE.MeshStandardMaterial({color:'#756e55',roughness:1})
const branchResources=[]
function branch(a,b,radius){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start)
  const geometry=new THREE.CylinderGeometry(radius*.65,radius,delta.length(),6)
  branchResources.push(geometry)
  const mesh=new THREE.Mesh(geometry,branchMat)
  mesh.position.copy(start).addScaledVector(delta,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.castShadow=true;mesh.receiveShadow=true;branches.add(mesh)
}
branch([-1.9,.31,-.12],[-.10,.655,.10],.036)
branch([.05,.75,-.21],[1.9,.83,-.37],.028)
branch([-.8,.521,.014],[-1,.80,-.25],.012)
branch([1.05,.794,-.297],[1.3,1.1,-.2],.012)

const assetLoader=createAssetLoader(renderer)
const shadow=createBirdContactShadows(1);scene.add(shadow.mesh)
const clock=createBirdSceneClock(),offset=new THREE.Vector3(),followTarget=new THREE.Vector3()
let library,birds,species='sparrow',view='detail',paused=false,lastState='',animationFrame=0
const idleDuration=4.2
const launchDuration=()=>species==='pigeon'?PIGEON_LAUNCH_DURATION:.2
const walks={sparrow:.052,pigeon:.22}
const routes={}
branches.updateMatrixWorld(true)
const probe=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0)
function perchAt(x,leg){
  const a=leg===0?[-1.9,.31,-.12]:[.05,.75,-.21],b=leg===0?[-.1,.655,.1]:[1.9,.83,-.37]
  const t=(x-a[0])/(b[0]-a[0]),z=THREE.MathUtils.lerp(a[2],b[2],t)
  probe.set(new THREE.Vector3(x,2,z),down)
  const hit=probe.intersectObjects(branches.children,false)[0]
  if(!hit)throw new Error('Preview perch is outside its branch')
  return [x,hit.point.y,z-.008]
}
for(const kind of ['sparrow','pigeon']){
  const anchors=kind==='sparrow'?[perchAt(-.65,0),perchAt(.65,1)]:[[-.65,0,.10],[.65,0,-.25]]
  const resting=anchors.map((anchor,i)=>kind==='sparrow'?perchAt(anchor[0]-walks[kind],i):[anchor[0],anchor[1],anchor[2]-walks[kind]])
  routes[kind]=anchors.map((from,i)=>{
    const to=resting[1-i]
    return {anchor:from,resting:resting[i],flight:createBirdFlight([from,[from[0]*.85,from[1]+.45,from[2]+.27],
      [0,Math.max(from[1],to[1])+.64,.45],[to[0]*.82,to[1]+.33,to[2]+.23],to],{minimumDuration:3.5,speed:2.2,...(kind==='pigeon'?{rampSeconds:.65,initialSpeed:2.2}:{})})}
  })
}
function duration(){return routes[species].reduce((sum,r)=>sum+idleDuration+launchDuration()+r.flight.duration,0)}
function resize(){const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(stage)

function sample(time){
  let t=time%duration(),leg=0
  const parts=routes[species]
  const first=idleDuration+launchDuration()+parts[0].flight.duration
  if(t>=first){t-=first;leg=1}
  const bird=birds[species],{anchor,resting,flight}=parts[leg]
  let state,flightWeight=0,wingSpread=0,push=0,landing=0,walking=0,peck=0,launch=0,walkDistance=0,flightTime=0,flightRemaining=Infinity,contact=0
  const restYaw=species==='pigeon'?0:.25
  bird.root.position.fromArray(anchor);bird.root.rotation.set(0,restYaw,0)
  if(t<idleDuration){
    state=species==='sparrow'?'停歇 · 转头与短跳':'地面停留 · 走动与啄地'
    const travel=smooth((t-1.1)/1.6)
    bird.root.position.set(THREE.MathUtils.lerp(resting[0],anchor[0],travel),THREE.MathUtils.lerp(resting[1],anchor[1],travel),THREE.MathUtils.lerp(resting[2],anchor[2],travel))
    const moving=t>1.1&&t<2.7
    if(species==='pigeon'){
      const step=samplePigeonWalk(t-1.1,1.6,walks.pigeon,walkSample)
      walking=step.strength;walkDistance=step.distance
      bird.root.position.z=resting[2]+step.distance
      peck=pigeonPeck((t-3.0)/1.05)
      if(time>0&&(leg===1||time>=duration())){
        landing=1-smooth(t/.32);contact=Math.sin(Math.PI*smooth(t/.28))
      }
    }else if(moving){
      const hop=(t-1.1)/.8%1
      bird.root.position.y+=Math.sin(hop*Math.PI)*.012
    }
  }else if(t<idleDuration+launchDuration()){
    state='起飞 · 蹬地与展翅';const p=(t-idleDuration)/launchDuration()
    launch=Math.sin(p*Math.PI);flightWeight=species==='pigeon'?0:smooth(p)*.25
    flight.sample(0,launchPosition,launchRotation)
    bird.root.rotation.y=restYaw+Math.atan2(Math.sin(launchRotation.y-restYaw),Math.cos(launchRotation.y-restYaw))*smooth(p)
    bird.root.rotation.x=launchRotation.x*smooth(p)
    bird.root.rotation.z=launchRotation.z*smooth(p)
    if(species==='pigeon'){
      const prep=samplePigeonLaunch(t-idleDuration,launchSample)
      launch=prep.crouch;wingSpread=prep.wings;push=prep.push
      const turn=Math.atan2(Math.sin(launchRotation.y-restYaw),Math.cos(launchRotation.y-restYaw))
      bird.root.rotation.set(0,restYaw+THREE.MathUtils.clamp(turn,-.25,.25)*smooth(p),0)
    }
  }else{
    const elapsed=t-idleDuration-launchDuration(),p=flight.sample(elapsed,bird.root.position,bird.root.rotation)
    landing=smooth((p-.76)/.14)*(1-smooth((p-.95)/.05))
    const turn=Math.atan2(Math.sin(restYaw-bird.root.rotation.y),Math.cos(restYaw-bird.root.rotation.y))
    bird.root.rotation.y+=turn*smooth((p-.88)/.12)
    bird.root.rotation.x*=1-smooth((p-.88)/.12)
    bird.root.rotation.z*=1-smooth((p-.88)/.12)
    flightWeight=(.25+.75*smooth(elapsed/.23))*(1-smooth((p-.9)/.1))
    if(species==='pigeon'){
      const travel=flight.parameterAt(elapsed)*flight.length
      const weights=pigeonFlightWeights(elapsed,flight.duration-elapsed,flight.length-travel,flightSample)
      flightWeight=weights.airborne;wingSpread=weights.wings;push=1-smooth(elapsed/.12)
      flightTime=elapsed;flightRemaining=flight.duration-elapsed;landing=smooth(1-flightRemaining/.75)
      flight.sample(0,launchPosition,launchRotation)
      const startYaw=restYaw+THREE.MathUtils.clamp(Math.atan2(Math.sin(launchRotation.y-restYaw),Math.cos(launchRotation.y-restYaw)),-.25,.25)
      const blend=smooth(elapsed/.38)
      bird.root.rotation.y=startYaw+Math.atan2(Math.sin(bird.root.rotation.y-startYaw),Math.cos(bird.root.rotation.y-startYaw))*blend
      bird.root.rotation.x*=blend;bird.root.rotation.z*=blend
    }
    state=p<.17?'起飞 · 向前爬升':p>.76?'降落 · 展尾、伸脚、收翅':'飞行 · 扑翼与转弯'
  }
  pose.time=time;pose.flight=flightWeight;pose.landing=landing;pose.walking=walking;pose.peck=peck;pose.launch=launch
  pose.wingSpread=species==='pigeon'?wingSpread:flightWeight;pose.push=push
  pose.walkDistance=walkDistance;pose.flightTime=flightTime;pose.flightRemaining=flightRemaining;pose.contact=contact
  updateBirdPose(bird,pose)
  shadow.set(0,bird.root.position,0,bird.spec.length,bird.root.rotation.y)
  if(state!==lastState){document.querySelector('#status').textContent=state;lastState=state}
  document.querySelector('#time').textContent=`${(time%duration()).toFixed(1)} 秒`
  document.querySelector('#timeline').value=Math.round((time%duration())/duration()*1000)
}
const pose={},walkSample={},launchSample={},flightSample={},launchPosition=new THREE.Vector3(),launchRotation=new THREE.Euler()
function focus(snap=false){
  const bird=birds[species]
  followTarget.copy(bird.root.position);followTarget.y+=bird.spec.length*.35
  if(view==='detail'){
    offset.copy(followTarget).sub(controls.target);camera.position.add(offset);controls.target.copy(followTarget)
  }
  if(snap){
    if(view==='walk'){
      controls.target.set(0,species==='sparrow'?.72:.3,.02);camera.position.set(2.1,1.65,3.0)
    }else{
      controls.target.copy(followTarget)
      const distance=species==='sparrow'?.95:1.45
      camera.position.copy(followTarget).add(new THREE.Vector3(distance*.75,distance*.37,distance))
    }
    controls.update()
  }
}
function selectSpecies(value){
  if(!birds?.[value])return
  species=value;clock.seek(0);lastState=''
  for(const [name,bird] of Object.entries(birds))bird.root.visible=name===species
  branches.visible=species==='sparrow';shadow.mesh.visible=true
  for(const button of document.querySelectorAll('[data-species]'))button.setAttribute('aria-pressed',String(button.dataset.species===species))
  const bird=birds[species]
  document.querySelector('#metrics').textContent=`${bird.spec.length*100} cm · ${bird.triangles} 三角面 · 无贴图`
  sample(0);focus(true);renderer.shadowMap.needsUpdate=true
}
function pause(value){paused=value;clock.tick(performance.now(),true);document.querySelector('#pause').textContent=paused?'继续':'暂停'}
function seek(value){clock.seek(value);if(birds){sample(clock.time);focus()}}
for(const button of document.querySelectorAll('[data-species]'))button.addEventListener('click',()=>selectSpecies(button.dataset.species))
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{
  view=button.dataset.view
  for(const item of document.querySelectorAll('[data-view]'))item.setAttribute('aria-pressed',String(item===button))
  if(birds)focus(true)
})
document.querySelector('#pause').addEventListener('click',()=>pause(!paused))
document.querySelector('#replay').addEventListener('click',()=>{seek(idleDuration-.35);pause(false)})
document.querySelector('#timeline').addEventListener('input',event=>{pause(true);seek(Number(event.target.value)/1000*duration())})
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!['INPUT','BUTTON'].includes(event.target.tagName)){event.preventDefault();pause(!paused)}})
document.addEventListener('visibilitychange',()=>clock.tick(performance.now(),true))

try{
  library=createBirdLibrary(await assetLoader.loadGltf(new URL('./assets/campus-birds-v01.glb?v=3',import.meta.url).href))
  birds={sparrow:library.create('sparrow'),pigeon:library.create('pigeon')}
  scene.add(birds.sparrow.root,birds.pigeon.root);resize();selectSpecies('sparrow')
  document.querySelector('#loading').hidden=true
  window.__BIRD_PREVIEW__={
    select:selectSpecies,pause,seek,
    inspect:()=>({bird:birds[species],routes:routes[species]}),
    snapshot:()=>({species,view,paused,time:clock.time,duration:duration(),state:lastState,
      position:birds[species].root.position.toArray(),rotation:birds[species].root.rotation.toArray(),pose:{...pose},
      boundaries:routes[species].flatMap((route,i)=>{const start=i*(idleDuration+launchDuration()+routes[species][0].flight.duration);return [start+idleDuration,start+idleDuration+launchDuration(),start+idleDuration+launchDuration()+route.flight.duration]}),
      camera:{position:camera.position.toArray(),target:controls.target.toArray()},
      library:library.snapshot(),renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures},
      assets:assetLoader.snapshot(),productionIntegrated:false}),
  }
  function animate(now){animationFrame=requestAnimationFrame(animate);sample(clock.tick(now,paused||document.hidden));focus();controls.update();renderer.render(scene,camera)}
  animationFrame=requestAnimationFrame(animate)
}catch(error){document.querySelector('#loading').textContent=`小鸟暂时没有准备好：${error.message}`;console.error(error)}

window.addEventListener('pagehide',event=>{
  if(event.persisted){clock.tick(performance.now(),true);return}
  cancelAnimationFrame(animationFrame);controls.dispose();shadow.dispose();library?.dispose();assetLoader.dispose()
  floor.geometry.dispose();floorMat.dispose();branchMat.dispose();for(const geometry of branchResources)geometry.dispose();renderer.dispose()
})

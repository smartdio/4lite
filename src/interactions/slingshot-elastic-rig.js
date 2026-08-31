import * as THREE from 'three'

const DEFAULTS={
  leftAnchor:[-0.055,0.12,0],rightAnchor:[0.055,0.12,0],
  restPouchCenter:[0,0.07,0.018],pullAxis:[0,0,1],maxPull:0.13,
  bandWidth:0.0095,bandThickness:0.0018,pouchSize:[0.052,0.022,0.004],
  bandSegments:9,restBandSag:.016,anchorEmbed:.007,bindingTurns:4,bindingRadius:.0085,
  pouchCupDepth:.0045,pouchAttachInset:.004,drawPouchY:null,
  visualPullScale:.65,drawBandWidthScale:.78,
  perspectiveOriginY:null,perspectiveOriginZ:null,
  leftBindingCenter:null,rightBindingCenter:null,bindingTiltRadians:THREE.MathUtils.degToRad(18),
  spring:360,damping:6,settleDamping:20,settleAfterSeconds:.27,forwardHoldSeconds:.075,
  forkDipAttack:.06,forkDipDuration:.34,maxForkDip:.024,maxForkPitchRadians:THREE.MathUtils.degToRad(7),
  pouchCenterAttack:.085,pouchCenterHold:.19,pouchDropDuration:.42,
  minLaunchSpeed:6.5,maxLaunchSpeed:20,
  chargeSeconds:1.2,maxHoldSteadySeconds:.7,tremorRampSeconds:1.5,maxTremorRadians:THREE.MathUtils.degToRad(1.35),
  chargeSwayRadians:THREE.MathUtils.degToRad(.32),chargeSwayRampSeconds:.45,
}

export function createSlingshotElasticRig({
  parent,config={},onEvent=()=>{},bandMaterial=null,pouchMaterial=null,
}={}) {
  if(!parent)throw new Error('Slingshot elastic rig requires a parent Object3D')
  const options={...DEFAULTS,...config}
  const root=new THREE.Group();root.name='slingshot-programmatic-elastic-rig';parent.add(root)
  const rubber=bandMaterial??new THREE.MeshStandardMaterial({name:'slingshot-inner-tube-rubber',color:0x171513,roughness:.93,metalness:0})
  const leather=pouchMaterial??new THREE.MeshStandardMaterial({name:'slingshot-old-leather-pouch',color:0x4d3022,roughness:.96,metalness:0,side:THREE.DoubleSide})
  const bindingMaterial=new THREE.MeshStandardMaterial({name:'slingshot-fork-binding',color:0x403326,roughness:1,metalness:0})
  const unitBandGeometry=new THREE.BoxGeometry(1,1,1)
  const createPouchGeometry=()=>{
    const [width,height]=options.pouchSize,columns=10,rows=4,positions=[],uvs=[],indices=[]
    for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
      const u=column/columns,v=row/rows
      const edgeTaper=.80+.20*Math.sin(Math.PI*v)
      const x=(u-.5)*width*edgeTaper,y=(v-.5)*height
      const nx=Math.abs(x)/(width*.5),ny=Math.abs(y)/(height*.5)
      const z=-options.pouchCupDepth*(1-nx*nx)*(1-.3*ny*ny)
      positions.push(x,y,z);uvs.push(u,v)
    }
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1
      indices.push(a,c,b,b,c,d)
    }
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals()
    return geometry
  }
  const pouchGeometry=createPouchGeometry()
  const makeBand=(name)=>{
    const group=new THREE.Group();group.name=name
    for(let index=0;index<options.bandSegments;index++){
      const segment=new THREE.Mesh(unitBandGeometry,rubber);segment.name=`${name}-segment-${index+1}`;segment.castShadow=segment.receiveShadow=true;group.add(segment)
    }
    root.add(group);return group
  }
  const leftBandGroup=makeBand('slingshot-left-programmatic-band'),rightBandGroup=makeBand('slingshot-right-programmatic-band')
  const leftBand=leftBandGroup.children[0],rightBand=rightBandGroup.children[0]
  const pouch=new THREE.Mesh(pouchGeometry,leather);pouch.name='slingshot-programmatic-leather-pouch'
  pouch.castShadow=pouch.receiveShadow=true;root.add(pouch)

  const eyeletGeometry=new THREE.TorusGeometry(.0022,.00065,5,10)
  for(const side of [-1,1]){
    const eyelet=new THREE.Mesh(eyeletGeometry,rubber);eyelet.name=`slingshot-pouch-thread-hole-${side<0?'left':'right'}`
    eyelet.position.set(side*(options.pouchSize[0]/2-options.pouchAttachInset),0,.0005);pouch.add(eyelet)
  }

  const leftAnchor=new THREE.Vector3(...options.leftAnchor),rightAnchor=new THREE.Vector3(...options.rightAnchor)
  const leftBindingCenter=new THREE.Vector3(...(options.leftBindingCenter??options.leftAnchor))
  const rightBindingCenter=new THREE.Vector3(...(options.rightBindingCenter??options.rightAnchor))
  const restPouchCenter=new THREE.Vector3(...options.restPouchCenter)
  const pullAxis=new THREE.Vector3(...options.pullAxis).normalize()
  const pouchCenter=restPouchCenter.clone(),leftPouchEdge=new THREE.Vector3(),rightPouchEdge=new THREE.Vector3()
  const pouchAcross=new THREE.Vector3().subVectors(rightAnchor,leftAnchor).normalize()
  const leftEmbeddedAnchor=leftAnchor.clone().addScaledVector(new THREE.Vector3(0,-1,0),options.anchorEmbed*.55)
  const rightEmbeddedAnchor=rightAnchor.clone().addScaledVector(new THREE.Vector3(0,-1,0),options.anchorEmbed*.55)
  const midpoint=new THREE.Vector3(),direction=new THREE.Vector3(),pouchForward=new THREE.Vector3(),curvePointA=new THREE.Vector3(),curvePointB=new THREE.Vector3()
  const unitY=new THREE.Vector3(0,1,0),unitZ=new THREE.Vector3(0,0,1),pouchQuaternion=new THREE.Quaternion()
  const bindingGeometry=new THREE.TorusGeometry(options.bindingRadius,.0009,5,12)
  const bindings=[]
  for(const [side,anchor] of [['left',leftBindingCenter],['right',rightBindingCenter]])for(let turn=0;turn<options.bindingTurns;turn++){
    const binding=new THREE.Mesh(bindingGeometry,bindingMaterial);binding.name=`slingshot-${side}-fork-binding-${turn+1}`
    const armDirection=new THREE.Vector3(side==='left'?-Math.sin(options.bindingTiltRadians):Math.sin(options.bindingTiltRadians),Math.cos(options.bindingTiltRadians),0)
    binding.quaternion.setFromUnitVectors(unitZ,armDirection);binding.position.copy(anchor).addScaledVector(armDirection,-turn*.0024);binding.position.z-=.001
    binding.scale.set(1,1,.72);binding.castShadow=true;root.add(binding);bindings.push(binding)
  }
  let phase='rest',pullDistance=0,velocity=0,disposed=false,forwardSnapStarted=false,releaseElapsed=0
  let forwardHoldStarted=false,forwardHoldRemaining=0
  let chargeElapsed=0,maxHoldElapsed=0,tremorElapsed=0,tremorYaw=0,tremorPitch=0,tremorStarted=false
  let activeBandSag=options.restBandSag

  const setSegment=(mesh,start,end,width=options.bandWidth)=>{
    direction.subVectors(end,start)
    const length=Math.max(direction.length(),.0001)
    mesh.position.copy(midpoint.addVectors(start,end).multiplyScalar(.5))
    mesh.quaternion.setFromUnitVectors(unitY,direction.multiplyScalar(1/length))
    mesh.scale.set(width,length+.0012,options.bandThickness)
    mesh.updateMatrix()
  }
  const setBandCurve=(group,start,end,side)=>{
    const drawing=phase==='pulling'||phase==='charging'
    const tension=drawing?1:THREE.MathUtils.clamp(Math.abs(pullDistance)/Math.max(options.maxPull,.001),0,1)
    const sag=options.restBandSag*(1-tension)
    activeBandSag=sag
    const width=options.bandWidth*THREE.MathUtils.lerp(1,options.drawBandWidthScale,tension)
    const count=group.children.length
    const pointAt=(t,target)=>{
      target.lerpVectors(start,end,t)
      target.y-=Math.sin(Math.PI*t)*sag
      target.z+=Math.sin(Math.PI*t)*sag*.16*side
      return target
    }
    pointAt(0,curvePointA)
    for(let index=0;index<count;index++){
      pointAt((index+1)/count,curvePointB);setSegment(group.children[index],curvePointA,curvePointB,width);curvePointA.copy(curvePointB)
    }
  }
  const syncVisuals=()=>{
    const visualPullDistance=pullDistance>0?pullDistance*options.visualPullScale:pullDistance
    pouchCenter.copy(restPouchCenter).addScaledVector(pullAxis,visualPullDistance)
    const drawPouchY=Number.isFinite(options.drawPouchY)?options.drawPouchY:restPouchCenter.y
    const perspectiveDrawY=perspectiveCompensatedY(drawPouchY,pouchCenter.z)
    if(phase==='pulling'||phase==='charging'){
      // 按下后胶带立即绷直并抬到叉窝底部；后续蓄力只沿视线纵深向玩家靠近。
      pouchCenter.y=perspectiveDrawY
    } else if(phase==='released'){
      const lift=pouchCenterlineLift(),anchorY=(leftAnchor.y+rightAnchor.y)*.5
      pouchCenter.y=releaseElapsed<=options.pouchCenterHold
        ?THREE.MathUtils.lerp(perspectiveDrawY,anchorY,lift)
        :THREE.MathUtils.lerp(restPouchCenter.y,anchorY,lift)
    }
    const attachHalf=options.pouchSize[0]/2-options.pouchAttachInset
    leftPouchEdge.copy(pouchCenter).addScaledVector(pouchAcross,-attachHalf)
    rightPouchEdge.copy(pouchCenter).addScaledVector(pouchAcross,attachHalf)
    setBandCurve(leftBandGroup,leftEmbeddedAnchor,leftPouchEdge,-1);setBandCurve(rightBandGroup,rightEmbeddedAnchor,rightPouchEdge,1)
    pouch.position.copy(pouchCenter)
    pouchForward.copy(pullAxis).multiplyScalar(-1)
    pouchQuaternion.setFromUnitVectors(unitZ,pouchForward)
    pouch.quaternion.copy(pouchQuaternion);pouch.updateMatrix()
  }
  const setPullDistance=value=>{
    if(disposed)return 0
    pullDistance=THREE.MathUtils.clamp(Number(value)||0,0,options.maxPull)
    if(phase==='rest'&&pullDistance>0)phase='pulling'
    syncVisuals();return pullDistance
  }
  const beginPull=()=>{
    if(disposed)return false
    phase='pulling';velocity=0;forwardSnapStarted=false;forwardHoldStarted=false;forwardHoldRemaining=0;releaseElapsed=0;chargeElapsed=0;maxHoldElapsed=0;tremorElapsed=0;tremorYaw=0;tremorPitch=0;tremorStarted=false
    onEvent({type:'slingshot-pull-start'});return true
  }
  const beginCharge=()=>{
    if(disposed)return false
    phase='charging';pullDistance=0;velocity=0;forwardSnapStarted=false;forwardHoldStarted=false;forwardHoldRemaining=0;releaseElapsed=0;chargeElapsed=0;maxHoldElapsed=0;tremorElapsed=0;tremorYaw=0;tremorPitch=0;tremorStarted=false
    syncVisuals();onEvent({type:'slingshot-charge-start'});return true
  }
  const setPullRatio=ratio=>setPullDistance(THREE.MathUtils.clamp(Number(ratio)||0,0,1)*options.maxPull)
  const release=()=>{
    if(disposed||pullDistance<=0)return null
    const releasedDistance=pullDistance,ratio=releasedDistance/options.maxPull
    phase='released';velocity=0;releaseElapsed=0;forwardSnapStarted=false;forwardHoldStarted=false;forwardHoldRemaining=0
    const result={
      pullDistance:releasedDistance,pullRatio:ratio,launchSpeed:THREE.MathUtils.lerp(options.minLaunchSpeed,options.maxLaunchSpeed,ratio),
      chargeElapsed,maxHoldElapsed,tremorYaw,tremorPitch,tremorIntensity:tremorIntensity(),
    }
    onEvent({type:'slingshot-release',...result});return result
  }
  function tremorIntensity() {
    const ratio=THREE.MathUtils.clamp((maxHoldElapsed-options.maxHoldSteadySeconds)/Math.max(options.tremorRampSeconds,.001),0,1)
    return ratio*ratio*(3-2*ratio)
  }
  const updateCharge=deltaSeconds=>{
    const delta=THREE.MathUtils.clamp(Number(deltaSeconds)||0,0,.1)
    chargeElapsed+=delta
    pullDistance=options.maxPull*Math.min(chargeElapsed/Math.max(options.chargeSeconds,.001),1)
    maxHoldElapsed=Math.max(0,chargeElapsed-options.chargeSeconds)
    const intensity=tremorIntensity()
    const swayRamp=THREE.MathUtils.clamp(chargeElapsed/Math.max(options.chargeSwayRampSeconds,.001),0,1)
    const swayEase=swayRamp*swayRamp*(3-2*swayRamp),sway=options.chargeSwayRadians*swayEase
    const slowYaw=sway*(.64*Math.sin(chargeElapsed*Math.PI*2*.37+.4)+.36*Math.sin(chargeElapsed*Math.PI*2*.61+2.1))
    const slowPitch=sway*(.67*Math.sin(chargeElapsed*Math.PI*2*.31+1.3)+.33*Math.sin(chargeElapsed*Math.PI*2*.53+.1))
    if(intensity>0) {
      if(!tremorStarted){tremorStarted=true;onEvent({type:'slingshot-tremor-start'})}
      tremorElapsed+=delta
      const amplitude=options.maxTremorRadians*intensity
      tremorYaw=slowYaw+amplitude*(.62*Math.sin(tremorElapsed*Math.PI*2*7.3)+.38*Math.sin(tremorElapsed*Math.PI*2*11.1+.8))
      tremorPitch=slowPitch+amplitude*(.68*Math.sin(tremorElapsed*Math.PI*2*8.4+1.7)+.32*Math.sin(tremorElapsed*Math.PI*2*13.2+.2))
    } else {
      tremorElapsed=0;tremorYaw=slowYaw;tremorPitch=slowPitch
    }
    syncVisuals()
  }
  const update=deltaSeconds=>{
    if(disposed)return phase
    if(phase==='charging'){updateCharge(deltaSeconds);return phase}
    if(phase!=='released')return phase
    let remaining=THREE.MathUtils.clamp(Number(deltaSeconds)||0,0,.1)
    while(remaining>0&&phase==='released') {
      const step=Math.min(remaining,1/120)
      releaseElapsed+=step
      if(forwardHoldRemaining>0){forwardHoldRemaining=Math.max(0,forwardHoldRemaining-step);remaining-=step;continue}
      const activeDamping=releaseElapsed<options.settleAfterSeconds?options.damping:options.settleDamping
      const previousVelocity=velocity
      velocity+=(-options.spring*pullDistance-activeDamping*velocity)*step
      if(!forwardHoldStarted&&previousVelocity<0&&velocity>=0&&pullDistance<0){
        forwardHoldStarted=true;forwardHoldRemaining=options.forwardHoldSeconds;velocity=0
        onEvent({type:'slingshot-forward-hold',duration:options.forwardHoldSeconds})
        remaining-=step;continue
      }
      pullDistance+=velocity*step
      if(pullDistance<0&&!forwardSnapStarted){forwardSnapStarted=true;onEvent({type:'slingshot-forward-snap'})}
      if(Math.abs(pullDistance)<=.00035&&Math.abs(velocity)<=.009) {
        pullDistance=0;velocity=0;phase='rest';tremorYaw=0;tremorPitch=0;onEvent({type:'slingshot-return-rest'})
      }
      remaining-=step
    }
    syncVisuals();return phase
  }
  const reset=()=>{
    phase='rest';pullDistance=0;velocity=0;forwardSnapStarted=false;forwardHoldStarted=false;forwardHoldRemaining=0;releaseElapsed=0;chargeElapsed=0;maxHoldElapsed=0;tremorElapsed=0;tremorYaw=0;tremorPitch=0;tremorStarted=false;syncVisuals()
  }
  const snapshot=()=>({
    phase,pullDistance:+pullDistance.toFixed(5),pullRatio:+(pullDistance/options.maxPull).toFixed(5),velocity:+velocity.toFixed(5),
    chargeElapsed:+chargeElapsed.toFixed(5),maxHoldElapsed:+maxHoldElapsed.toFixed(5),tremorIntensity:+tremorIntensity().toFixed(5),
    aimOffset:{yaw:+tremorYaw.toFixed(6),pitch:+tremorPitch.toFixed(6)},
    maxPull:options.maxPull,bandWidth:options.bandWidth,bandThickness:options.bandThickness,pouchSize:[...options.pouchSize],
    bandSegments:options.bandSegments,restBandSag:options.restBandSag,pouchCupDepth:options.pouchCupDepth,bindingTurns:options.bindingTurns,drawPouchY:options.drawPouchY,
    activeBandSag:+activeBandSag.toFixed(5),
    visualPullScale:options.visualPullScale,drawBandWidthScale:options.drawBandWidthScale,visualPullDistance:+visualPullDistanceForSnapshot().toFixed(5),
    chargeSeconds:options.chargeSeconds,maxHoldSteadySeconds:options.maxHoldSteadySeconds,maxTremorRadians:options.maxTremorRadians,
    chargeSwayRadians:options.chargeSwayRadians,chargeSwayRampSeconds:options.chargeSwayRampSeconds,
    spring:options.spring,damping:options.damping,minLaunchSpeed:options.minLaunchSpeed,maxLaunchSpeed:options.maxLaunchSpeed,forwardSnapStarted,
    forwardHoldStarted,forwardHoldRemaining:+forwardHoldRemaining.toFixed(5),forwardHoldSeconds:options.forwardHoldSeconds,
    releaseElapsed:+releaseElapsed.toFixed(5),...releasePose(),
    leftAnchor:leftAnchor.toArray(),rightAnchor:rightAnchor.toArray(),pouchCenter:pouchCenter.toArray(),
  })
  function releasePose() {
    if(phase!=='released'||releaseElapsed>=options.forkDipDuration)return {forkDip:0,forkPitch:0}
    const attack=Math.max(options.forkDipAttack,.001),duration=Math.max(options.forkDipDuration,attack+.001)
    let pulse
    if(releaseElapsed<attack){const t=releaseElapsed/attack;pulse=t*t*(3-2*t)}
    else {const t=(releaseElapsed-attack)/(duration-attack);pulse=1-t*t*(3-2*t)}
    return {forkDip:+(pulse*options.maxForkDip).toFixed(5),forkPitch:+(pulse*options.maxForkPitchRadians).toFixed(6)}
  }
  function visualPullDistanceForSnapshot() {
    return pullDistance>0?pullDistance*options.visualPullScale:pullDistance
  }
  function perspectiveCompensatedY(baseY,localZ) {
    if(!Number.isFinite(options.perspectiveOriginY)||!Number.isFinite(options.perspectiveOriginZ))return baseY
    const referenceDepth=options.perspectiveOriginZ-restPouchCenter.z
    const currentDepth=options.perspectiveOriginZ-localZ
    if(referenceDepth<=.001||currentDepth<=.001)return baseY
    return options.perspectiveOriginY+(baseY-options.perspectiveOriginY)*(currentDepth/referenceDepth)
  }
  function pouchCenterlineLift() {
    if(phase!=='released')return 0
    const attack=Math.max(options.pouchCenterAttack,.001),hold=Math.max(options.pouchCenterHold,attack)
    const end=hold+Math.max(options.pouchDropDuration,.001)
    if(releaseElapsed<attack){const t=releaseElapsed/attack;return t*t*(3-2*t)}
    if(releaseElapsed<=hold)return 1
    if(releaseElapsed>=end)return 0
    const t=(releaseElapsed-hold)/(end-hold);return 1-t*t*(3-2*t)
  }
  const dispose=()=>{
    if(disposed)return
    disposed=true;parent.remove(root)
    unitBandGeometry.dispose();pouchGeometry.dispose();eyeletGeometry.dispose();bindingGeometry.dispose();bindingMaterial.dispose()
    if(!bandMaterial)rubber.dispose();if(!pouchMaterial)leather.dispose()
  }
  syncVisuals()
  return {root,leftBand,rightBand,leftBandGroup,rightBandGroup,pouch,bindings,beginPull,beginCharge,setPullDistance,setPullRatio,release,update,reset,snapshot,dispose}
}

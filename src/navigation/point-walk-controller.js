import * as THREE from 'three'

const TARGET_MIN_DISTANCE=.45
const TARGET_MAX_DISTANCE=20
const TARGET_PITCH_DEGREES=4
const TARGET_PITCH_SIN=Math.sin(THREE.MathUtils.degToRad(TARGET_PITCH_DEGREES))
const ARRIVAL_RADIUS=.25
const BLOCKED_AFTER_MS=450
const PROBE_INTERVAL_MS=50

const createMarker=({scene})=>{
  const root=new THREE.Group();root.name='point-walk-target-marker';root.visible=false
  const ring=new THREE.Mesh(
    new THREE.RingGeometry(.245,.325,48),
    new THREE.MeshBasicMaterial({color:0x48f579,transparent:true,opacity:.58,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,toneMapped:false}),
  )
  ring.rotation.x=-Math.PI/2;ring.renderOrder=4;ring.raycast=()=>{};root.add(ring)
  const pinShape=new THREE.Shape()
  pinShape.moveTo(0,-.34);pinShape.bezierCurveTo(-.07,-.25,-.24,-.10,-.24,.10);pinShape.bezierCurveTo(-.24,.30,-.14,.42,0,.42)
  pinShape.bezierCurveTo(.14,.42,.24,.30,.24,.10);pinShape.bezierCurveTo(.24,-.10,.07,-.25,0,-.34);pinShape.closePath()
  const pinHole=new THREE.Path();pinHole.absarc(0,.12,.075,0,Math.PI*2);pinShape.holes.push(pinHole)
  const pinGeometry=new THREE.ShapeGeometry(pinShape,24)
  const pinMaterial=new THREE.MeshBasicMaterial({color:0x43f874,transparent:true,opacity:.72,depthTest:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide})
  const marker=new THREE.Group();marker.name='point-walk-target-pin'
  const pin=new THREE.Mesh(pinGeometry,pinMaterial);pin.position.z=.006
  pin.renderOrder=5;pin.raycast=()=>{};marker.add(pin)
  root.add(marker)
  scene.add(root)
  return {root,marker,pin,ring}
}

export function createPointWalkController({scene,camera,renderer,navigation,player,speed,onEvent=()=>{}}) {
  const marker=createMarker({scene,renderer})
  const ray=new THREE.Ray(),direction=new THREE.Vector3(),lastPosition=new THREE.Vector3(),lastQuaternion=new THREE.Quaternion(),visualPoint=new THREE.Vector3()
  let enabled=false,state='idle',candidate=null,target=null,lastProbeAt=-Infinity,blockedMs=0,lastTravelled=0

  const hideMarker=()=>{marker.root.visible=false}
  const showMarker=(point,moving=false)=>{
    const towardX=camera.position.x-point.x,towardZ=camera.position.z-point.z,horizontalDistance=Math.hypot(towardX,towardZ)
    const visualOffset=Math.min(1.15,horizontalDistance*.38)
    visualPoint.set(
      point.x+(horizontalDistance?towardX/horizontalDistance*visualOffset:0),
      point.y,
      point.z+(horizontalDistance?towardZ/horizontalDistance*visualOffset:0),
    )
    visualPoint.y=navigation.groundHeightAt(visualPoint.x,visualPoint.z,point.y,false)
    marker.root.position.set(visualPoint.x,visualPoint.y+.018,visualPoint.z);marker.root.visible=true
    const distance=camera.position.distanceTo(visualPoint)
    const perspectiveScale=THREE.MathUtils.clamp(distance*.12,.42,1.5)*(moving?.78:1)
    marker.marker.scale.setScalar(perspectiveScale);marker.marker.position.y=.34*perspectiveScale;marker.marker.quaternion.copy(camera.quaternion)
    marker.pin.material.opacity=moving?.40:.54;marker.ring.material.opacity=moving?.40:.58
  }
  const invalidateCandidate=()=>{candidate=null;if(state!=='moving')hideMarker()}

  const probe=(now,{allowTarget=true}={})=>{
    if(!enabled||state==='moving'||!allowTarget){invalidateCandidate();return null}
    const cameraChanged=lastPosition.distanceToSquared(camera.position)>.000001||1-Math.abs(lastQuaternion.dot(camera.quaternion))>.000001
    if(!cameraChanged&&now-lastProbeAt<PROBE_INTERVAL_MS)return candidate
    if(now-lastProbeAt<PROBE_INTERVAL_MS)return candidate
    lastProbeAt=now;lastPosition.copy(camera.position);lastQuaternion.copy(camera.quaternion)
    camera.getWorldDirection(direction)
    if(direction.y>-TARGET_PITCH_SIN){invalidateCandidate();return null}
    ray.set(camera.position,direction)
    candidate=navigation.resolveRayTarget(ray,{
      reference:camera.position.y-player.eyeHeight,
      minHorizontalDistance:TARGET_MIN_DISTANCE,maxHorizontalDistance:TARGET_MAX_DISTANCE,
    })
    if(candidate)showMarker(candidate.point,false);else hideMarker()
    return candidate
  }

  const confirm=()=>{
    if(!enabled||state==='moving'||!candidate)return false
    target=candidate.point.clone();candidate=null;state='moving';blockedMs=0;showMarker(target,true)
    onEvent({type:'start',target:target.toArray()});return true
  }

  const cancel=(reason='cancelled')=>{
    const wasMoving=state==='moving'
    state='idle';target=null;candidate=null;blockedMs=0;lastTravelled=0;hideMarker()
    if(wasMoving)onEvent({type:'cancel',reason})
    return wasMoving
  }

  const update=(dt,now,{allowTarget=true}={})=>{
    lastTravelled=0
    if(marker.root.visible)marker.marker.quaternion.copy(camera.quaternion)
    if(!enabled){cancel('disabled');return {moving:false,moved:false,travelled:0,state}}
    if(state!=='moving'){probe(now,{allowTarget});return {moving:false,moved:false,travelled:0,state}}
    const dx=target.x-camera.position.x,dz=target.z-camera.position.z,distance=Math.hypot(dx,dz)
    if(distance<=ARRIVAL_RADIUS){state='idle';target=null;hideMarker();onEvent({type:'arrive'});return {moving:false,moved:false,travelled:0,state}}
    const amount=Math.min(distance,speed*dt),beforeX=camera.position.x,beforeZ=camera.position.z
    navigation.move(camera.position,dx/distance*amount,dz/distance*amount)
    lastTravelled=Math.hypot(camera.position.x-beforeX,camera.position.z-beforeZ)
    blockedMs=lastTravelled<.0005?blockedMs+dt*1000:0
    if(blockedMs>=BLOCKED_AFTER_MS){state='blocked';target=null;hideMarker();onEvent({type:'blocked'});queueMicrotask(()=>{if(state==='blocked')state='idle'})}
    return {moving:state==='moving',moved:lastTravelled>.0005,travelled:lastTravelled,state}
  }

  const setEnabled=value=>{
    const next=Boolean(value)
    if(next===enabled)return
    enabled=next;if(!enabled)cancel('mode-change');else {lastProbeAt=-Infinity;lastPosition.set(Infinity,Infinity,Infinity)}
  }

  const snapshot=()=>({
    enabled,state,moving:state==='moving',candidate:candidate?candidate.point.toArray():null,target:target?.toArray()??null,
    candidateSurface:candidate?.surface??null,candidateSnapped:candidate?.snapped??false,
    candidateRawPoint:candidate?.rawPoint?.toArray()??null,candidateSnapDistance:candidate?.snapDistance??0,
    lastTravelled,markerVisible:marker.root.visible,markerPosition:marker.root.visible?marker.root.position.toArray():null,
    limits:{minDistance:TARGET_MIN_DISTANCE,maxDistance:TARGET_MAX_DISTANCE,pitchDegrees:TARGET_PITCH_DEGREES,arrivalRadius:ARRIVAL_RADIUS,probeHz:1000/PROBE_INTERVAL_MS,snapDistance:navigation.snapPolicy.maxDistance},
  })

  return {setEnabled,probe,confirm,cancel,update,isMoving:()=>state==='moving',hasCandidate:()=>Boolean(candidate),snapshot}
}

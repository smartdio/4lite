import * as THREE from 'three'

export const smoothBirdStep=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t)}

// The preview and the future campus controller consume the same arc-length
// path and body orientation. Paths allocate once, never on the frame path.
export function createBirdFlight(points,{speed=3,minimumDuration=3,rampSeconds=null,initialSpeed=0}={}) {
  if(points.length<2||points.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))throw new Error('Invalid bird flight points')
  if(!(speed>0)||!(minimumDuration>0))throw new Error('Invalid bird flight timing')
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal')
  curve.arcLengthDivisions=256;curve.updateArcLengths()
  const length=curve.getLength()
  if(length<.01)throw new Error('Bird flight is too short')
  const duration=Math.max(minimumDuration,rampSeconds?(length-initialSpeed*rampSeconds/2)/speed+rampSeconds:length/speed*1.4)
  const ramp=rampSeconds?Math.min(rampSeconds,duration/3):0
  const startSpeed=ramp?Math.min(initialSpeed,length/ramp):0
  const cruise=ramp?(length-startSpeed*ramp/2)/(duration-ramp):0
  const parameterAt=elapsed=>{
    const t=THREE.MathUtils.clamp(elapsed,0,duration)
    if(!ramp)return smoothBirdStep(t/duration)
    const integral=s=>s*s*s-.5*s*s*s*s
    if(t<ramp)return (startSpeed*t+(cruise-startSpeed)*ramp*integral(t/ramp))/length
    if(t>duration-ramp)return 1-cruise*ramp*integral((duration-t)/ramp)/length
    return (startSpeed*ramp/2+cruise*(t-ramp/2))/length
  }
  const tangent=new THREE.Vector3(),nextTangent=new THREE.Vector3()
  return {curve,length,duration,parameterAt,
    sample(elapsed,position,orientation) {
      const t=THREE.MathUtils.clamp(elapsed/duration,0,1),u=parameterAt(elapsed)
      curve.getPointAt(u,position)
      curve.getTangentAt(Math.max(.001,Math.min(.999,u)),tangent)
      curve.getTangentAt(Math.min(.999,u+.015),nextTangent)
      const yaw=Math.atan2(tangent.x,tangent.z)
      const yawNext=Math.atan2(nextTangent.x,nextTangent.z)
      const delta=Math.atan2(Math.sin(yawNext-yaw),Math.cos(yawNext-yaw))
      orientation.set(-Math.atan2(tangent.y,Math.hypot(tangent.x,tangent.z))*.32,yaw,THREE.MathUtils.clamp(-delta*5,-.32,.32),'YXZ')
      return t
    },
  }
}

export function createBirdSceneClock() {
  let time=0,previous=null
  return {
    tick(now,paused=false) {
      if(!Number.isFinite(now))return time
      if(paused){previous=null;return time}
      if(previous!==null)time+=Math.max(0,Math.min(.05,(now-previous)/1000))
      previous=now;return time
    },
    seek(value){time=Math.max(0,value);previous=null;return time},
    get time(){return time},
  }
}

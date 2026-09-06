import {smoothBirdStep as smooth} from './bird-motion.js'

// Motion working values for the approved 30cm rig, not measured anatomy.
export const PIGEON_STRIDE=.11
export const PIGEON_LAUNCH_DURATION=.20
const fract=x=>((x%1)+1)%1

// Wings rise while the feet still bear weight. Lift-off starts the first
// downstroke, with leg impulse already present in the flight's initial speed.
export function samplePigeonLaunch(elapsed,out={}){
  const t=Math.max(0,elapsed),p=t/PIGEON_LAUNCH_DURATION
  out.crouch=smooth(p/.45)*(1-smooth((p-.45)/.55))
  out.wings=smooth((p-.25)/.75)
  out.push=smooth((p-.65)/.35)
  return out
}
export function pigeonFlightWeights(elapsed,remaining,distanceToLanding,out={}){
  out.airborne=smooth(elapsed/.18)*smooth((distanceToLanding-.35)/.75)
  out.wings=smooth((distanceToLanding-.35)/.75)
  out.landing=smooth(1-remaining/.75)
  return out
}

export function samplePigeonWalk(elapsed,duration,distance,out={}) {
  const t=Math.max(0,Math.min(duration,elapsed)),ramp=Math.min(.18,duration/3)
  const integral=x=>x*x*x-.5*x*x*x*x
  const speed=distance/(duration-ramp)
  out.distance=t<ramp?speed*ramp*integral(t/ramp):t>duration-ramp?distance-speed*ramp*integral((duration-t)/ramp):speed*(t-ramp/2)
  out.strength=smooth(t/ramp)*smooth((duration-t)/ramp)
  out.progress=t/duration
  return out
}

export function samplePigeonStep(distance,side,out={}) {
  const phase=fract(distance/PIGEON_STRIDE+.25+(side==='right'?.5:0))
  out.planted=phase<.5
  out.z=out.planted?PIGEON_STRIDE*(.25-phase):PIGEON_STRIDE*(-.25+.5*smooth((phase-.5)*2))
  out.lift=out.planted?0:.016*Math.sin((phase-.5)*Math.PI*2)
  out.pitch=out.planted?0:-.28*Math.sin((phase-.5)*Math.PI*2)
  return out
}

// During the hold, relative head travel exactly cancels body travel. The
// following short thrust catches up; standing birds do not keep bobbing.
export function pigeonHeadOffset(distance) {
  const step=PIGEON_STRIDE/2,phase=fract(distance/step+.35)
  return phase<.7?step*(.35-phase):step*(-.35+.7*smooth((phase-.7)/.3))
}
export function pigeonLook(time,phase=0) {
  const t=(time+phase)*.46,index=Math.floor(t),part=fract(t)
  const angle=n=>Math.sin(n*2.37+phase)*.45
  return angle(index-1)+(angle(index)-angle(index-1))*smooth(part/.10)
}
export function pigeonPeck(time) {
  if(time<0||time>=1)return 0
  if(time<.15)return .10*smooth(time/.15)
  if(time<.42)return .10+.90*smooth((time-.15)/.27)
  if(time<.51)return 1
  return 1-smooth((time-.51)/.43)
}
export function pigeonWingCycles(elapsed,remaining=Infinity) {
  const t=Math.max(0,elapsed),brake=Math.max(0,.9-remaining)
  return t*5.6+1.6*.32*(1-Math.exp(-t/.32))+.6*brake*brake/.9
}

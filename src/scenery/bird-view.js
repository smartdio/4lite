import * as THREE from 'three'
import {BIRD_CONFIG} from './bird-config.js'

// A copied walking view, independent of aerial / minigame cameras. Projection
// is arithmetic only; expensive occlusion checks are limited to shortlisted sites.
export function createBirdView(config=BIRD_CONFIG.visibility) {
  const position=new THREE.Vector3(),forward=new THREE.Vector3(0,0,-1)
  const right=new THREE.Vector3(1,0,0),up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3()
  let ready=false,tanV=1,tanH=1
  return {
    position,forward,get ready(){return ready},
    set(eye,direction,verticalFov=50,aspect=16/9){
      if(!eye||!direction||direction.lengthSq()<1e-8)return
      position.copy(eye);forward.copy(direction).normalize()
      right.set(-forward.z,0,forward.x).normalize()
      if(right.lengthSq()<1e-8)right.set(1,0,0)
      up.crossVectors(right,forward).normalize()
      tanV=Math.tan(THREE.MathUtils.degToRad(verticalFov/2));tanH=tanV*aspect;ready=true
    },
    score(point,species){
      if(!ready)return 0
      delta.subVectors(point,position);delta.y+=species==='pigeon'?.14:.08
      const distance=delta.length(),depth=delta.dot(forward)
      if(depth<=.2||distance>config.distance[species])return 0
      const x=Math.abs(delta.dot(right)/(depth*tanH)),y=Math.abs(delta.dot(up)/(depth*tanV))
      if(x>config.frameMargin||y>config.frameMargin)return 0
      return 1+(1-x)*2+Math.max(0,1-Math.abs(distance-config.preferredDistance[species])/6)*3
    },
  }
}

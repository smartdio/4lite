import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {aimAnglesToward,applyGroundBounce,bounceVariation,pointInEllipse,segmentIntersectsBox,shotDirectionFromAim} from '../../src/interactions/slingshot-game.js'
import {CAMPUS} from '../../src/campus-config.js'

test('continuous slingshot collision catches a thin block crossed between fixed steps',()=>{
  const target=new THREE.Box3(new THREE.Vector3(-.02,-.05,.04),new THREE.Vector3(.02,.05,.075))
  assert.equal(segmentIntersectsBox(new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,.12),target),true)
  assert.equal(segmentIntersectsBox(new THREE.Vector3(.04,0,0),new THREE.Vector3(.04,0,.12),target),false)
})

test('slingshot touch target follows the projected pouch ellipse',()=>{
  const bounds={left:100,right:180,top:220,bottom:260}
  assert.equal(pointInEllipse(140,240,bounds),true)
  assert.equal(pointInEllipse(178,240,bounds),true)
  assert.equal(pointInEllipse(178,258,bounds),false)
  assert.equal(pointInEllipse(90,240,bounds),false)
})

test('continuous slingshot collision rejects an intersection beyond the current step',()=>{
  const target=new THREE.Box3(new THREE.Vector3(-.02,-.05,.14),new THREE.Vector3(.02,.05,.18))
  assert.equal(segmentIntersectsBox(new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,.12),target),false)
})

test('initial slingshot view faces from the firing line toward the blocks',()=>{
  const from=new THREE.Vector3(23.006,1.95,-23.14)
  const target=new THREE.Vector3(23.45,1.68,-13.15)
  const {yaw,pitch}=aimAnglesToward(from,target)
  const cameraForward=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(pitch,yaw,0,'YXZ')).normalize()
  const targetDirection=target.clone().sub(from).normalize()
  assert.ok(cameraForward.dot(targetDirection)>0.999999)
})

test('held slingshot and projectile origin stay on the sight centerline',()=>{
  assert.equal(CAMPUS.facilities.slingshotCorner.game.held.position[0],0)
  for(const id of ['wood','wire']){
    const held=CAMPUS.facilities.slingshotCorner.game.held[id]
    assert.equal(held.restPouchCenter[0],0)
    assert.equal(held.leftAnchor[0],-held.rightAnchor[0])
    assert.equal(held.leftBindingCenter[0],-held.rightBindingCenter[0])
    assert.ok(held.bindingTiltDegrees>0)
    assert.ok(held.drawPouchY>held.restPouchCenter[1])
  }
  const {wood,wire}=CAMPUS.facilities.slingshotCorner.game.held
  assert.ok(Math.abs(wood.leftAnchor[0])>Math.abs(wood.leftBindingCenter[0]),'wood bands stay on the fork-tip outer edge')
  assert.ok(Math.abs(wire.leftAnchor[0]-wire.leftBindingCenter[0])<1e-9,'wire bindings stay aligned with the corrected band contacts')
  assert.ok(wood.bindingRadius<=.007&&wire.bindingRadius<=.004,'wire binding loop diameter is reduced by another third')
  assert.ok(wire.drawPouchY<wood.drawPouchY-.01,'wire pouch leaves extra sight clearance for its higher aiming angle')
})

test('aim sway is an angular launch error whose endpoint deviation grows with distance',()=>{
  const yawError=THREE.MathUtils.degToRad(1)
  const direction=shotDirectionFromAim(0,0,yawError,0)
  const lateralAt5=Math.abs(direction.x/direction.z)*5
  const lateralAt10=Math.abs(direction.x/direction.z)*10
  assert.ok(Math.abs(lateralAt5-Math.tan(yawError)*5)<1e-9)
  assert.ok(Math.abs(lateralAt10-lateralAt5*2)<1e-9)
})

test('vertical aim sway changes the launch angle too',()=>{
  const pitchError=THREE.MathUtils.degToRad(.8)
  const direction=shotDirectionFromAim(0,0,0,pitchError)
  assert.ok(direction.y>0)
  assert.ok(Math.abs(direction.y/Math.abs(direction.z)-Math.tan(pitchError))<1e-9)
})

test('slingshot horizontal look range spans 120 degrees',()=>{
  assert.equal(CAMPUS.facilities.slingshotCorner.game.aimYawDegrees*2,120)
})

test('slingshot aiming narrows the field of view for distant targets',()=>{
  const fov=CAMPUS.facilities.slingshotCorner.game.aimingFov
  assert.ok(fov>=35&&fov<50)
})

test('slingshot can aim steeply enough at low blocks',()=>{
  const game=CAMPUS.facilities.slingshotCorner.game
  assert.ok(game.aimPitchMinDegrees<=-35)
  assert.ok(game.aimPitchMaxDegrees>=28)
})

test('slingshot uses five and ten metre firing lines',()=>{
  const corner=CAMPUS.facilities.slingshotCorner
  assert.deepEqual(corner.firingLines.map(line=>line.distance),[5,10])
  assert.deepEqual(corner.firingLines.map(line=>line.chalkLabel),['5','10'])
  assert.equal(corner.game.defaultDistance,10)
})

test('hanging blocks use low damping for several visible swings',()=>{
  const game=CAMPUS.facilities.slingshotCorner.game
  assert.ok(game.hangingDampingX<0.7)
  assert.ok(game.hangingDampingZ<0.7)
})

test('wood slingshot is stronger while wire slingshot is steadier',()=>{
  const {wood,wire}=CAMPUS.facilities.slingshotCorner.game.profiles
  assert.ok(wood.maxLaunchSpeed>wire.maxLaunchSpeed)
  assert.ok(wood.minLaunchSpeed>wire.minLaunchSpeed)
  assert.ok(wood.chargeSwayDegrees>wire.chargeSwayDegrees)
  assert.ok(wood.maxTremorDegrees>wire.maxTremorDegrees)
})

test('clay projectile loses height and horizontal speed on each ground bounce',()=>{
  const velocity=new THREE.Vector3(4,-6,3)
  const impact=applyGroundBounce(velocity,.42,.72)
  assert.equal(impact,6)
  assert.ok(Math.abs(velocity.x-2.88)<1e-9)
  assert.ok(Math.abs(velocity.y-2.52)<1e-9)
  assert.ok(Math.abs(velocity.z-2.16)<1e-9)
})

test('successive pellet bounces vary horizontal direction and rebound angle within safe limits',()=>{
  const first=bounceVariation(3,1),second=bounceVariation(3,2)
  assert.notEqual(first.directionRadians,second.directionRadians)
  assert.notEqual(first.verticalScale,second.verticalScale)
  assert.ok(Math.abs(first.directionRadians)<=THREE.MathUtils.degToRad(14))
  assert.ok(first.verticalScale>=.84&&first.verticalScale<=1.16)
  const velocity=new THREE.Vector3(1,-5,4)
  const originalHeading=Math.atan2(velocity.x,velocity.z)
  applyGroundBounce(velocity,.42,.72,first.directionRadians,first.verticalScale)
  assert.ok(Math.abs(Math.atan2(velocity.x,velocity.z)-originalHeading)>1e-5)
  assert.ok(velocity.y>0)
})

test('stored slingshots sit on the west edge of the stone bench',()=>{
  const corner=CAMPUS.facilities.slingshotCorner
  const platformLeft=corner.stonePlatform.center[0]-corner.stonePlatform.topSize[0]/2
  for(const item of corner.slingshots){
    assert.ok(item.center[0]>=platformLeft&&item.center[0]<platformLeft+.2)
    assert.ok(Math.abs(item.center[1]-corner.stonePlatform.topY)<.02)
  }
})

test('bench slingshot interaction proxies are tight and do not overlap',()=>{
  const [wood,wire]=CAMPUS.facilities.slingshotCorner.slingshots
  const separation=Math.abs(wood.center[2]-wire.center[2])
  assert.ok(separation>(wood.interactionProxySize[2]+wire.interactionProxySize[2])/2)
  assert.ok(Math.max(...wood.interactionProxySize)<.3&&Math.max(...wire.interactionProxySize)<.3)
})

test('wood slingshot lies flat on the bench without residual pitch or roll',()=>{
  const wood=CAMPUS.facilities.slingshotCorner.slingshots.find(item=>item.id==='wood')
  assert.deepEqual(wood.rotation,[0,0,1.5708])
})

test('stone bench is extended west without moving its east target edge',()=>{
  const platform=CAMPUS.facilities.slingshotCorner.stonePlatform
  assert.equal(platform.topSize[0],2.22)
  assert.ok(Math.abs(platform.center[0]+platform.topSize[0]/2-24.23)<1e-9)
})

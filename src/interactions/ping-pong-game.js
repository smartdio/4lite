import * as THREE from 'three'
import {translateRuntimeText} from '../i18n/index.js'

const SIDE_PLAYER='player'
const SIDE_AI='ai'
const otherSide=side=>side===SIDE_PLAYER?SIDE_AI:SIDE_PLAYER
const POINT_REASON_TEXT=Object.freeze({
  'serve-wrong-first-bounce':'发球未先落本方台面','serve-double-own-bounce':'发球连续落在本方',
  'missed-before-second-bounce':'对方未在第二跳前回球','return-did-not-cross-net':'回球未越过球网',
  'net-fault':'触网未过','serve-incomplete':'未完成发球','return-missed':'未能回球','return-out':'回球出界',
  'toss-missed':'抛球后未击中','test-award':'测试判定',
})

export function createPingPongGame({
  root,camera,renderer,paddleMesh,config,tables,
  onEnter=()=>true,onExit=()=>{},onEvent=()=>{},
  isTouchMode=()=>false,isActiveMode=()=>false,groundHeightAt=()=>0,shadowDirection,
}) {
  const game=config.game
  const halfLength=game.tableSize[0]/2,halfWidth=game.tableSize[1]/2
  const group=new THREE.Group();group.name='ping-pong-game-runtime';root.add(group)
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2()
  const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),scaleOne=new THREE.Vector3(1,1,1)
  const zeroScale=new THREE.Vector3(0,0,0)
  const ballGeometry=new THREE.SphereGeometry(game.ballRadius,20,14)
  const ballMaterial=new THREE.MeshStandardMaterial({color:0xf3eee0,roughness:.82,metalness:0})
  const sourceGeometry=paddleMesh.geometry
  const rubberMaskName=Object.keys(sourceGeometry.attributes).find(name=>name.toLowerCase()==='_rubber_mask')
  const rubberMask=rubberMaskName?sourceGeometry.getAttribute(rubberMaskName):null
  const sourceColours=sourceGeometry.getAttribute('color')
  if(!rubberMask||!sourceColours)throw new Error('Ping-pong paddle colour variants require rubber mask and vertex colours')
  const rubberColours=game.rubberColours
  const createVariantGeometry=variant=>{
    const geometry=sourceGeometry.clone()
    for(const [name,attribute] of Object.entries(sourceGeometry.attributes))geometry.setAttribute(name,name==='color'?attribute.clone():attribute)
    geometry.setIndex(sourceGeometry.index)
    const colours=geometry.getAttribute('color')
    const base=new THREE.Color().fromArray(variant.baseLinear)
    const worn=new THREE.Color().fromArray(variant.wornLinear)
    const mixed=new THREE.Color()
    for(let index=0;index<colours.count;index++) {
      if(rubberMask.getX(index)<.5)continue
      const wear=THREE.MathUtils.clamp((sourceColours.getX(index)-.13)/.24,0,1)
      mixed.copy(base).lerp(worn,wear)
      colours.setXYZ(index,mixed.r,mixed.g,mixed.b)
    }
    colours.needsUpdate=true
    geometry.userData.rubberColour=variant.id
    return geometry
  }
  const paddleVariants=rubberColours.map(variant=>({
    ...variant,geometry:createVariantGeometry(variant),material:paddleMesh.material,
  }))
  const variantFor=(tableIndex,sideIndex)=>(tableIndex*2+sideIndex)%paddleVariants.length
  const variantCounts=paddleVariants.map((_,variantIndex)=>tables.reduce((count,__,tableIndex)=>
    count+(variantFor(tableIndex,0)===variantIndex?1:0)+(variantFor(tableIndex,1)===variantIndex?1:0),0))
  const staticPaddles=paddleVariants.map((variant,index)=>{
    const mesh=new THREE.InstancedMesh(variant.geometry,variant.material,variantCounts[index])
    mesh.name=`ping-pong-static-paddles-${variant.id}`
    mesh.castShadow=false;mesh.receiveShadow=true;mesh.userData.instances=[]
    return mesh
  })
  const staticBalls=new THREE.InstancedMesh(ballGeometry,ballMaterial,tables.length)
  staticBalls.name='ping-pong-static-balls';staticBalls.castShadow=false;staticBalls.receiveShadow=true
  // 每张球台使用一个不可见轻量代理接收点击，避免对完整GLB递归射线检测。
  const tableHitGeometry=new THREE.BoxGeometry(game.tableSize[0],game.surfaceY,game.tableSize[1])
  const tableHitMaterial=new THREE.MeshBasicMaterial()
  const tableHitProxies=tables.map((table,index)=>{
    const mesh=new THREE.Mesh(tableHitGeometry,tableHitMaterial)
    mesh.name=`ping-pong-table-${index+1}-interaction-proxy`
    mesh.position.set(table.center[0],game.surfaceY*.5,table.center[1])
    mesh.visible=false;mesh.userData.table=index
    group.add(mesh);return mesh
  })
  const playerPaddle=new THREE.Mesh(paddleVariants[0].geometry,paddleMesh.material)
  const aiPaddle=new THREE.Mesh(paddleVariants[1%paddleVariants.length].geometry,paddleMesh.material)
  const liveBall=new THREE.Mesh(ballGeometry,ballMaterial)
  playerPaddle.name='ping-pong-live-player-paddle';aiPaddle.name='ping-pong-live-ai-paddle';liveBall.name='ping-pong-live-ball'
  for(const mesh of [playerPaddle,aiPaddle,liveBall]){mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh)}
  const shadowRay=(shadowDirection?.clone()??new THREE.Vector3(.24,-.94,.18)).normalize()
  if(shadowRay.y>-.15)shadowRay.set(.24,-.94,.18).normalize()
  const shadowGeometry=new THREE.CircleGeometry(1,24);shadowGeometry.rotateX(-Math.PI/2)
  const shadowMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,
    uniforms:{opacity:{value:.3}},
    vertexShader:`varying vec2 shadowUv;void main(){shadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 shadowUv;uniform float opacity;void main(){float radius=length(shadowUv-vec2(.5))*2.0;float alpha=(1.0-smoothstep(.68,1.0,radius))*opacity;if(alpha<.003)discard;gl_FragColor=vec4(.045,.05,.055,alpha);}`,
  })
  const liveBallShadow=new THREE.Mesh(shadowGeometry,shadowMaterial)
  liveBallShadow.name='ping-pong-live-ball-projected-shadow'
  liveBallShadow.rotation.y=Math.atan2(shadowRay.z,shadowRay.x);liveBallShadow.renderOrder=4;liveBallShadow.visible=false
  group.add(liveBallShadow)
  group.add(...staticPaddles,staticBalls)

  const cameraUiGroup=new THREE.Group();cameraUiGroup.name='ping-pong-camera-ui';cameraUiGroup.visible=false
  const makeCameraButton=(id,label)=>{
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=144
    const context=canvas.getContext('2d')
    context.lineJoin='round';context.textAlign='center';context.textBaseline='middle'
    // 与比赛 HUD 共用黄／红／蓝的街机漫画配色。阴影留在按钮内部，
    // 这样点击平面仍保持规则矩形，不需要额外的命中代理。
    context.fillStyle='#073da5';context.beginPath();context.roundRect(14,17,356,118,25);context.fill()
    context.fillStyle='#b51f16';context.beginPath();context.roundRect(10,11,364,116,25);context.fill()
    context.lineWidth=7;context.strokeStyle='#7e160f';context.stroke()
    context.fillStyle='#ffd43b';context.beginPath();context.roundRect(10,5,364,112,25);context.fill()
    context.lineWidth=6;context.strokeStyle='#fff0a2';context.stroke()
    context.lineWidth=9;context.strokeStyle='#8b1b11'
    const displayLabel=translateRuntimeText(label)
    context.font='900 55px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';context.strokeText(displayLabel,192,62)
    context.fillStyle='#fff0a2';context.fillText(displayLabel,192,62)
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace
    texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material)
    mesh.name=`ping-pong-camera-${id}`;mesh.renderOrder=1000;mesh.userData.cameraAction=id
    cameraUiGroup.add(mesh);return mesh
  }
  const cameraMatchButton=makeCameraButton('match','比赛')
  const cameraExitButton=makeCameraButton('exit','退出')
  camera.add(cameraUiGroup);if(!camera.parent)root.add(camera)
  const updateCameraUiLayout=()=>{
    const halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))
    const halfWidth=halfHeight*camera.aspect
    const buttonHeight=Math.min(.09,halfHeight*.145)
    const matchWidth=Math.min(.21,halfWidth*.34),exitWidth=Math.min(.18,halfWidth*.30)
    cameraUiGroup.position.set(0,halfHeight*.83,-1)
    cameraMatchButton.position.set(-halfWidth+matchWidth*.62,0,0);cameraMatchButton.scale.set(matchWidth,buttonHeight,1)
    cameraExitButton.position.set(halfWidth-exitWidth*.62,0,0);cameraExitButton.scale.set(exitWidth,buttonHeight,1)
    camera.updateMatrixWorld(true)
  }

  // Runtime instances reuse the mesh geometry without its GLB node transform.
  // The rebuilt asset deliberately keeps +X as the striking-face normal and
  // +Y from blade to handle after Blender's Y-up glTF export.
  const paddleFaceAxis=new THREE.Vector3(1,0,0)
  const tableUpAxis=new THREE.Vector3(0,1,0)
  const flatPaddleQuaternion=new THREE.Quaternion().setFromUnitVectors(paddleFaceAxis,tableUpAxis)
  const makeStaticPaddleQuaternion=yaw=>new THREE.Quaternion()
    .setFromAxisAngle(tableUpAxis,yaw)
    .multiply(flatPaddleQuaternion)
  const variantCursors=paddleVariants.map(()=>0)
  const staticTransforms=tables.map((table,index)=>{
    const [x,z]=table.center,surface=table.surfaceY
    const variation=(index%3-1)*THREE.MathUtils.degToRad(4)
    const playerPosition=new THREE.Vector3(x+.47,surface+.012,z+.36)
    const aiPosition=new THREE.Vector3(x-.47,surface+.012,z-.36)
    const playerQuaternion=makeStaticPaddleQuaternion(THREE.MathUtils.degToRad(-34)+variation)
    const aiQuaternion=makeStaticPaddleQuaternion(THREE.MathUtils.degToRad(32)-variation)
    // The single faded-red rubber face stays upward. The ball rests over the
    // lower half of the blade while leaving enough rubber visible from walking view.
    const ballOffset=new THREE.Vector3(0,-.025,-.026).applyQuaternion(playerQuaternion)
    const ballPosition=playerPosition.clone().add(ballOffset)
    ballPosition.y=surface+.012+.01+game.ballRadius
    const playerVariant=variantFor(index,0),aiVariant=variantFor(index,1)
    const playerInstance=variantCursors[playerVariant]++,aiInstance=variantCursors[aiVariant]++
    const playerRef={variant:playerVariant,instance:playerInstance,side:SIDE_PLAYER,table:index}
    const aiRef={variant:aiVariant,instance:aiInstance,side:SIDE_AI,table:index}
    staticPaddles[playerVariant].setMatrixAt(playerInstance,matrix.compose(playerPosition,playerQuaternion,scaleOne))
    staticPaddles[aiVariant].setMatrixAt(aiInstance,matrix.compose(aiPosition,aiQuaternion,scaleOne))
    staticPaddles[playerVariant].userData.instances[playerInstance]=playerRef
    staticPaddles[aiVariant].userData.instances[aiInstance]=aiRef
    staticBalls.setMatrixAt(index,matrix.compose(ballPosition,quaternion.identity(),scaleOne))
    return {playerPosition,aiPosition,ballPosition,playerQuaternion,aiQuaternion,playerRef,aiRef}
  })
  for(const mesh of staticPaddles){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere()}
  staticBalls.instanceMatrix.needsUpdate=true;staticBalls.computeBoundingSphere()

  let activeTableIndex=null,phase='idle',playMode='practice',server=SIDE_PLAYER
  let scores={player:0,ai:0},pointTimer=0,serveTimer=0,accumulator=0
  const hudState={visible:false,mode:'practice',playerScore:0,aiScore:0,server:SIDE_PLAYER,phase:'idle',prompt:'',feedbackCode:null,reasonCode:null}
  const message={textContent:''}
  let lastHit=null,lastBounceSide=null,serveBounces=[],bounceCounts={player:0,ai:0}
  let playerSwing=0,aiSwing=0,aiReaction=0,aiWillMiss=false
  let inputDown=false,lastPointerX=null,lastPointerY=null,lastTossAirTime=0
  let paddleTargetZ=0,paddleTargetForward=0,aiTargetX=0,aiTargetZ=0,aiTargetY=.91
  let aiPaddleBaseX=0,aiShortBallTracking=false
  const playerPaddleVelocity=new THREE.Vector3()
  const recentPlayerPaddleVelocity=new THREE.Vector3()
  const playerPaddleMotionHistory=[]
  const playerPaddlePreviousPosition=new THREE.Vector3()
  const touchPaddleSweepStart=new THREE.Vector3()
  let touchPaddlePending=false
  const paddleSweepDelta=new THREE.Vector3(),paddleSweepClosest=new THREE.Vector3()
  let cameraRigReady=false
  const cameraRigPosition=new THREE.Vector3(),cameraRigTarget=new THREE.Vector3()
  const desiredCameraPosition=new THREE.Vector3(),desiredCameraTarget=new THREE.Vector3()
  let rally=0,pointsPlayed=0,playerHits=0,playerSmashes=0,aiHits=0,tableBounces=0,netHits=0
  let rngState=0x4f4c4954
  const ball={position:new THREE.Vector3(),previous:new THREE.Vector3(),velocity:new THREE.Vector3(),active:false}
  let shadowReceiver='none'

  const random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296}
  const table=()=>activeTableIndex==null?null:tables[activeTableIndex]
  const localX=()=>ball.position.x-table().center[0]
  const localZ=()=>ball.position.z-table().center[1]
  const playerPlane=()=>table().center[0]+halfLength+game.playerPaddlePlaneOffset
  const aiPlane=()=>table().center[0]-halfLength-game.aiPaddlePlaneOffset
  // 玩家从东侧面向球桌，画面左侧对应世界 +Z。
  const playerReadySide=()=>paddleTargetZ>=0?1:-1
  const playerReadyTilt=()=>THREE.MathUtils.degToRad(game.serve.readyPaddleTiltDeg)*playerReadySide()
  const recentLateralSwing=(forceIntent=false)=>{
    let direction=0,displacement=0,hasTurn=false
    // 从接触时刻倒查最近一段连续同向移动。遇到反向样本立即截断，
    // 避免早先为了追球的位移覆盖最后真正的挥拍方向。
    for(let index=playerPaddleMotionHistory.length-1;index>=0;index--) {
      const delta=playerPaddleMotionHistory[index].z
      if(Math.abs(delta)<1e-5)continue
      const sampleDirection=Math.sign(delta)
      if(direction===0)direction=sampleDirection
      else if(sampleDirection!==direction){hasTurn=true;break}
      displacement+=Math.abs(delta)
    }
    if(direction===0)return 0
    // 普通回球必须先出现方向转折；单向移动只视为追球定位。
    if(!forceIntent&&!hasTurn)return 0
    return direction*THREE.MathUtils.clamp(
      displacement/game.rallySwing.lateralDisplacementForFull,0,1,
    )
  }

  const setInstanceVisible=(tableIndex,visible)=>{
    const transform=staticTransforms[tableIndex],usedScale=visible?scaleOne:zeroScale
    const playerMesh=staticPaddles[transform.playerRef.variant],aiMesh=staticPaddles[transform.aiRef.variant]
    playerMesh.setMatrixAt(transform.playerRef.instance,matrix.compose(transform.playerPosition,transform.playerQuaternion,usedScale))
    aiMesh.setMatrixAt(transform.aiRef.instance,matrix.compose(transform.aiPosition,transform.aiQuaternion,usedScale))
    staticBalls.setMatrixAt(tableIndex,matrix.compose(transform.ballPosition,quaternion.identity(),usedScale))
    playerMesh.instanceMatrix.needsUpdate=true;aiMesh.instanceMatrix.needsUpdate=true;staticBalls.instanceMatrix.needsUpdate=true
  }

  const updatePaddleMeshes=dt=>{
    const current=table();if(!current)return
    playerPaddlePreviousPosition.copy(touchPaddlePending?touchPaddleSweepStart:playerPaddle.position)
    // 玩家球拍逐帧直接到达鼠标／触摸目标，不再用低速上限追赶输入。
    // 挥拍碰撞使用下方的扫掠线段，因此快速移动也不会越过球而漏判。
    playerPaddle.position.z=current.center[1]+paddleTargetZ
    playerPaddle.position.y=current.surfaceY+game.playerPaddleHeight
    const playerStroke=playerSwing>0?Math.sin((1-playerSwing/.24)*Math.PI)*.115:0
    let playerX=playerPlane()+paddleTargetForward-playerStroke
    const intendedPlayerX=playerX
    // 球仍在上升或下降后尚未回到拍面高度时，球拍不能提前越过球；
    // 球进入纵向接触范围后才解除限制，由连续扫掠碰撞捕获向前击球。
    const tossContactRadius=game.serve.contactRadius+game.ballRadius-game.serve.tossReleaseSafetyMargin
    const tossLateralOffset=Math.abs(ball.position.z-playerPaddle.position.z)
    const tossVerticalReach=Math.sqrt(Math.max(0,tossContactRadius*tossContactRadius-tossLateralOffset*tossLateralOffset))
    const tossBallAboveReach=ball.position.y>playerPaddle.position.y+tossVerticalReach
    if(phase==='toss'&&(ball.velocity.y>=0||tossBallAboveReach)) {
      playerX=Math.max(playerX,ball.position.x+game.serve.tossPaddleRunupGap)
    }
    playerPaddle.position.x=playerX
    // 准备、接球和回球都保持同一套左右倾斜；挥拍只叠加前后击球转动。
    playerPaddle.rotation.set(playerReadyTilt(),Math.PI,playerSwing>0?-.12:0)
    if(dt>1e-5) {
      for(const sample of playerPaddleMotionHistory)sample.age+=dt
      while(playerPaddleMotionHistory[0]?.age>game.rallySwing.directionMemorySeconds)playerPaddleMotionHistory.shift()
      playerPaddleVelocity.subVectors(playerPaddle.position,playerPaddlePreviousPosition)
        .divideScalar(dt).clampLength(0,game.serve.maxSwingSpeed/game.serve.swingSpeedScale)
      const deltaY=playerPaddle.position.y-playerPaddlePreviousPosition.y
      const deltaZ=playerPaddle.position.z-playerPaddlePreviousPosition.z
      if(deltaY*deltaY+deltaZ*deltaZ>1e-8) {
        playerPaddleMotionHistory.push({age:0,y:deltaY,z:deltaZ})
      }
      // 暴露给测试和调试的速度同样来自完整时间窗口，而非碰撞前最后一帧。
      const displacement=playerPaddleMotionHistory.reduce((sum,sample)=>{
        sum.y+=sample.y;sum.z+=sample.z;return sum
      },{y:0,z:0})
      recentPlayerPaddleVelocity.set(
        0,
        displacement.y/game.rallySwing.directionMemorySeconds,
        displacement.z/game.rallySwing.directionMemorySeconds,
      )
      const tossBladeDistance=Math.hypot(
        ball.position.z-playerPaddle.position.z,
        ball.position.y-playerPaddle.position.y,
      )
      const crossedTossBallForward=phase==='toss'&&ball.velocity.y<0
        &&intendedPlayerX<=ball.position.x
        &&tossBladeDistance<=game.serve.contactRadius+game.ballRadius
      if(crossedTossBallForward) {
        // 纵向输入已明确指向球桌前方时，把被等待约束保留的位移视为一次有效前挥。
        playerPaddleVelocity.x=Math.min(
          playerPaddleVelocity.x,
          -game.serve.minSwingSpeed/game.serve.swingSpeedScale*1.05,
        )
        strikeTossedServe()
      }
    }
    touchPaddlePending=false
    const maxAiForward=game.ai.forwardSpeed*dt
    aiPaddleBaseX+=THREE.MathUtils.clamp(aiTargetX-aiPaddleBaseX,-maxAiForward,maxAiForward)
    const maxAiLateral=game.ai.lateralSpeed*dt,maxAiVertical=game.ai.verticalSpeed*dt
    aiPaddle.position.z+=THREE.MathUtils.clamp(current.center[1]+aiTargetZ-aiPaddle.position.z,-maxAiLateral,maxAiLateral)
    aiPaddle.position.y+=THREE.MathUtils.clamp(aiTargetY-aiPaddle.position.y,-maxAiVertical,maxAiVertical)
    const aiStroke=aiSwing>0?Math.sin((1-aiSwing/.18)*Math.PI)*.10:0
    aiPaddle.position.x=aiPaddleBaseX+aiStroke
    aiPaddle.rotation.set(0,0,aiSwing>0?.11:0)
    playerSwing=Math.max(0,playerSwing-dt);aiSwing=Math.max(0,aiSwing-dt)
  }

  const updateCameraRig=dt=>{
    const current=table();if(!current)return
    const follow=game.cameraFollow
    const localPaddleZ=THREE.MathUtils.clamp(
      playerPaddle.position.z-current.center[1],-game.paddleRange.lateral,game.paddleRange.lateral,
    )
    const normalizedLateral=game.paddleRange.lateral>0?localPaddleZ/game.paddleRange.lateral:0
    desiredCameraPosition.fromArray(current.playerStation)
    desiredCameraTarget.fromArray(current.cameraTarget)
    desiredCameraPosition.z+=normalizedLateral*follow.positionLateral
    desiredCameraTarget.z+=normalizedLateral*follow.targetLateral
    if(!cameraRigReady) {
      cameraRigPosition.copy(desiredCameraPosition);cameraRigTarget.copy(desiredCameraTarget);cameraRigReady=true
    } else {
      const blend=1-Math.exp(-follow.smoothing*Math.max(0,dt))
      cameraRigPosition.lerp(desiredCameraPosition,blend);cameraRigTarget.lerp(desiredCameraTarget,blend)
    }
    camera.position.copy(cameraRigPosition);camera.lookAt(cameraRigTarget)
  }

  const updateBallShadow=()=>{
    const current=table()
    if(!current||!liveBall.visible) {
      liveBallShadow.visible=false;shadowReceiver='none';return
    }
    const projectTo=height=>{
      const distance=(height-ball.position.y)/shadowRay.y
      return {x:ball.position.x+shadowRay.x*distance,z:ball.position.z+shadowRay.z*distance}
    }
    let receiverY=current.surfaceY,projected=projectTo(receiverY)
    const overTable=ball.position.y>=current.surfaceY-game.ballRadius
      &&Math.abs(projected.x-current.center[0])<=halfLength+game.ballRadius
      &&Math.abs(projected.z-current.center[1])<=halfWidth+game.ballRadius
    if(overTable)shadowReceiver='table'
    else {
      receiverY=groundHeightAt(ball.position.x,ball.position.z,ball.position.y)
      projected=projectTo(receiverY)
      // 与篮球阴影一致，对斜坡或高低地面再校正一次投影落点。
      receiverY=groundHeightAt(projected.x,projected.z,ball.position.y)
      projected=projectTo(receiverY);shadowReceiver='ground'
    }
    const height=Math.max(0,ball.position.y-game.ballRadius-receiverY)
    const spread=Math.min(height,2.5)
    const minor=game.ballRadius*(.9+spread*.3)
    const incidence=1+Math.hypot(shadowRay.x,shadowRay.z)/Math.max(.2,-shadowRay.y)*.24
    const major=minor*(incidence+spread*.07)
    const opacity=.36*Math.exp(-height*.72)
    liveBallShadow.position.set(projected.x,receiverY+.003,projected.z)
    liveBallShadow.scale.set(major,1,minor)
    shadowMaterial.uniforms.opacity.value=opacity
    liveBallShadow.visible=height<5&&opacity>.018&&Number.isFinite(projected.x+receiverY+projected.z)
  }

  const syncLiveBall=()=>{
    liveBall.position.copy(ball.position)
    liveBall.rotation.x+=ball.velocity.z*.006
    liveBall.rotation.z-=ball.velocity.x*.006
    updateBallShadow()
  }

  const resetPaddles=()=>{
    const current=table();if(!current)return
    paddleTargetZ=0;paddleTargetForward=0;aiTargetX=aiPlane();aiTargetZ=0;aiTargetY=current.surfaceY+.29
    aiPaddleBaseX=aiTargetX;aiShortBallTracking=false
    playerPaddle.position.set(playerPlane(),current.surfaceY+game.playerPaddleHeight,current.center[1])
    aiPaddle.position.set(aiPlane(),aiTargetY,current.center[1])
    playerPaddle.rotation.set(0,Math.PI,0);aiPaddle.rotation.set(0,0,0)
  }

  const syncPlayerReadyBall=()=>{
    const current=table();if(!current||server!==SIDE_PLAYER)return
    const side=playerReadySide()
    playerPaddle.rotation.set(playerReadyTilt(),Math.PI,0)
    ball.position.set(
      playerPaddle.position.x-game.serve.readyBallOffset.forward,
      playerPaddle.position.y+game.serve.readyBallOffset.vertical,
      playerPaddle.position.z-side*game.serve.readyBallOffset.lateral,
    )
    ball.previous.copy(ball.position);liveBall.position.copy(ball.position)
  }

  const serveForTotal=total=>total<game.rules.deuceAt*2
    ?(Math.floor(total/game.rules.serveInterval)%2===0?SIDE_PLAYER:SIDE_AI)
    :(total%2===0?SIDE_PLAYER:SIDE_AI)

  const setReadyBall=()=>{
    const current=table();if(!current)return
    lastTossAirTime=0
    const sign=server===SIDE_PLAYER?1:-1
    if(server===SIDE_PLAYER)syncPlayerReadyBall()
    else ball.position.set(current.center[0]+sign*halfLength*.76,current.surfaceY+.22,current.center[1])
    ball.previous.copy(ball.position);ball.velocity.set(0,0,0);ball.active=false
    liveBall.position.copy(ball.position);liveBall.visible=true
    updateBallShadow()
    serveBounces=[];bounceCounts={player:0,ai:0};lastBounceSide=null;lastHit=null
    serveTimer=server===SIDE_AI?.8:0
    phase='ready';updateUi()
  }

  const isMatchWon=winner=>scores[winner]>=game.rules.targetScore&&scores[winner]-scores[otherSide(winner)]>=game.rules.winBy
  const finishPoint=(winner,reasonCode)=>{
    if(phase==='point'||phase==='matchEnd'||phase==='idle')return false
    ball.active=false;ball.velocity.set(0,0,0);pointsPlayed++
    if(playMode==='match')scores[winner]++
    else server=winner
    const matchWon=playMode==='match'&&isMatchWon(winner)
    phase=matchWon?'matchEnd':'point';pointTimer=matchWon?0:.82
    const reason=POINT_REASON_TEXT[reasonCode]??String(reasonCode??'')
    const label=winner===SIDE_PLAYER?'玩家':'对手'
    message.textContent=translateRuntimeText(matchWon?`${label}赢得本局`:`${label}得分 · ${reason}`)
    hudState.feedbackCode=matchWon?(winner===SIDE_PLAYER?'match-won':'match-lost'):(winner===SIDE_PLAYER?'point-player':'point-computer')
    hudState.reasonCode=reasonCode
    onEvent({type:matchWon?'ping-pong-match-end':'ping-pong-point',winner,reasonCode,reason:translateRuntimeText(reason),scores:{...scores}})
    updateUi();return true
  }

  const handleBounce=side=>{
    tableBounces++;lastBounceSide=side;bounceCounts[side]++
    onEvent({type:'ping-pong-table-bounce',side,speed:ball.velocity.length()})
    if(phase==='serve') {
      serveBounces.push(side)
      if(serveBounces.length===1&&side!==server)return finishPoint(otherSide(server),'serve-wrong-first-bounce')
      if(serveBounces.length===2) {
        if(side===server)return finishPoint(otherSide(server),'serve-double-own-bounce')
        phase='rally';message.textContent=translateRuntimeText('回合进行中');updateUi()
      }
      if(serveBounces.length>2)return finishPoint(server,'missed-before-second-bounce')
      return false
    }
    if(phase==='rally') {
      if(side===lastHit)return finishPoint(otherSide(lastHit),'return-did-not-cross-net')
      if(bounceCounts[side]>1)return finishPoint(lastHit,'missed-before-second-bounce')
    }
    return false
  }

  const ballisticVelocity=(targetX,targetZ,time)=>{
    const current=table(),targetY=current.surfaceY+game.ballRadius
    return new THREE.Vector3(
      (targetX-ball.position.x)/time,
      (targetY-ball.position.y+.5*game.physics.gravity*time*time)/time,
      (targetZ-ball.position.z)/time,
    )
  }

  const prepareAiReturn=()=>{
    const missRate=playMode==='practice'?game.ai.practiceMissRate:game.ai.matchMissRate
    aiWillMiss=random()<missRate
    aiReaction=THREE.MathUtils.lerp(game.ai.reactionMin,game.ai.reactionMax,random())
    aiTargetZ=THREE.MathUtils.clamp(localZ()+(aiWillMiss?(random()<.5?-1:1)*.30:THREE.MathUtils.lerp(-.025,.025,random())),-game.paddleRange.lateral,game.paddleRange.lateral)
    aiTargetY=THREE.MathUtils.clamp(ball.position.y,game.paddleRange.minY,game.paddleRange.maxY)
  }

  const strikeBall=(side,isServe=false)=>{
    const current=table();if(!current)return false
    if(isServe) {
      const aiServe=side===SIDE_AI
      const targetX=current.center[0]+(aiServe?-game.serve.aiFirstBounceDepth:.27)
      const targetZ=current.center[1]+THREE.MathUtils.clamp((side===SIDE_PLAYER?paddleTargetZ:aiTargetZ)*.22,-.16,.16)
      ball.velocity.copy(ballisticVelocity(
        targetX,targetZ,aiServe?game.serve.aiFlightTime:game.physics.serveFlightTime,
      ))
      phase='serve';serveBounces=[]
    } else {
      const isSmash=side===SIDE_PLAYER&&inputDown
      const targetDepth=isSmash?game.rallySwing.smashTargetDepth:.60
      const targetX=current.center[0]+(side===SIDE_PLAYER?-1:1)*halfLength*targetDepth
      if(side===SIDE_PLAYER) {
        const lateral=recentLateralSwing(inputDown)
        let flightTime=game.physics.rallyFlightTime
        if(isSmash)flightTime*=game.rallySwing.smashFlightTimeScale
        // 横向分量直接采用挥拍方向。若先计算桌面中心附近的绝对落点，边缘触球时
        // “目标减当前位置”可能反向，造成球与实际挥拍方向相反。
        ball.velocity.copy(ballisticVelocity(targetX,ball.position.z,flightTime))
        ball.velocity.z=lateral*game.rallySwing.lateralTargetOffset/flightTime
        if(isSmash) {
          ball.velocity.y=Math.min(ball.velocity.y,game.rallySwing.smashMaxUpwardSpeed)
          playerSmashes++
        }
      } else {
        const gesture=THREE.MathUtils.lerp(-.32,.32,random())
        const targetZ=current.center[1]+THREE.MathUtils.clamp(gesture*.40+aiTargetZ*-.20,-halfWidth*.72,halfWidth*.72)
        ball.velocity.copy(ballisticVelocity(targetX,targetZ,game.physics.rallyFlightTime))
      }
      phase='rally';rally++
    }
    if(ball.velocity.length()>game.physics.maxBallSpeed)ball.velocity.setLength(game.physics.maxBallSpeed)
    ball.active=true;lastHit=side;lastBounceSide=null;bounceCounts={player:0,ai:0}
    if(side===SIDE_PLAYER){playerHits++;prepareAiReturn()}else aiHits++
    const smash=!isServe&&side===SIDE_PLAYER&&inputDown
    onEvent({type:'ping-pong-paddle-hit',side,serve:isServe,smash,speed:ball.velocity.length()})
    message.textContent=isServe?'合法发球需先落本方台面':smash?'用力压低回球':'回合进行中'
    updateUi();return true
  }

  const strikeTossedServe=()=>{
    const current=table();if(!current||phase!=='toss')return false
    const measuredSwingSpeed=Math.hypot(playerPaddleVelocity.x,playerPaddleVelocity.z)
    const swingSpeed=measuredSwingSpeed*game.serve.swingSpeedScale
    if(swingSpeed<game.serve.minSwingSpeed)return false
    const strength=THREE.MathUtils.clamp(
      (swingSpeed-game.serve.minSwingSpeed)/(game.serve.maxSwingSpeed-game.serve.minSwingSpeed),0,1,
    )
    const forwardSpeed=THREE.MathUtils.lerp(game.serve.forwardSpeedMin,game.serve.forwardSpeedMax,strength)
    const targetX=current.center[0]+THREE.MathUtils.lerp(halfLength*.58,halfLength*.12,strength)
    const travelTime=Math.max(.12,(ball.position.x-targetX)/forwardSpeed)
    // 发球方向取挥拍速度向量，而不是取球原本位于桌面的哪一侧。
    // 纯横向挥拍可形成明确斜线；斜上／斜下挥拍按横向分量平滑减小角度。
    const lateralRatio=THREE.MathUtils.clamp(playerPaddleVelocity.z/Math.max(measuredSwingSpeed,1e-5),-1,1)
    const lateralAngle=THREE.MathUtils.degToRad(game.serve.maxLateralAngleDeg)*lateralRatio
    const lateralSpeed=Math.tan(lateralAngle)*forwardSpeed
    ball.velocity.set(
      -forwardSpeed,
      (current.surfaceY+game.ballRadius-ball.position.y+.5*game.physics.gravity*travelTime*travelTime)/travelTime,
      lateralSpeed,
    )
    if(ball.velocity.length()>game.physics.maxBallSpeed)ball.velocity.setLength(game.physics.maxBallSpeed)
    phase='serve';serveBounces=[];lastHit=SIDE_PLAYER;lastBounceSide=null;bounceCounts={player:0,ai:0}
    playerHits++;playerSwing=.24;prepareAiReturn()
    onEvent({type:'ping-pong-paddle-hit',side:SIDE_PLAYER,serve:true,speed:ball.velocity.length(),swingSpeed})
    message.textContent='发球已击出 · 需先落本方台面';updateUi();return true
  }

  const tossPlayerBall=()=>{
    if(activeTableIndex==null||phase!=='ready'||server!==SIDE_PLAYER)return false
    // 触控松手可能带来最后一个坐标；先应用拍面与持球位置，再从该位置释放。
    updatePaddleMeshes(0);syncPlayerReadyBall()
    const base=isTouchMode()?game.serve.touchTossAirTimeBase:game.serve.tossAirTimeBase
    const variation=isTouchMode()?game.serve.touchTossAirTimeVariation:game.serve.tossAirTimeVariation
    lastTossAirTime=base+(random()*2-1)*variation
    const tossVelocity=game.physics.tossGravity*lastTossAirTime*.5
    phase='toss';ball.active=true;ball.velocity.set(0,tossVelocity,0);lastHit=null;serveBounces=[]
    message.textContent='球下落时移动球拍击球'
    onEvent({type:'ping-pong-toss',side:SIDE_PLAYER,tossVelocity,airTime:lastTossAirTime});updateUi()
    return true
  }

  const beginPlayerAction=(deferTouchToss=false)=>{
    if(activeTableIndex==null||!isActiveMode())return false
    inputDown=true
    if(phase==='ready'&&server===SIDE_PLAYER) {
      if(deferTouchToss&&isTouchMode()) {
        message.textContent='移动球和球拍 · 松手抛球';updateUi();return true
      }
      return tossPlayerBall()
    }
    if(phase==='rally'){playerSwing=.24;return true}
    return false
  }

  const endPlayerAction=(releaseTouchToss=false)=>{
    if(!inputDown)return false
    inputDown=false
    if(releaseTouchToss&&isTouchMode()&&phase==='ready'&&server===SIDE_PLAYER)return tossPlayerBall()
    return phase==='toss'||phase==='rally'
  }

  const resolvePaddleCrossings=()=>{
    const current=table();if(!current)return
    const playerX=playerPaddle.position.x,aiX=aiPaddle.position.x
    const playerLateralReach=game.paddleContactRadius.player+game.ballRadius
    const aiLateralReach=game.paddleContactRadius.ai+game.ballRadius
    if(phase==='toss'&&ball.velocity.y<0) {
      paddleSweepDelta.subVectors(playerPaddle.position,playerPaddlePreviousPosition)
      const sweepLengthSq=paddleSweepDelta.lengthSq()
      const sweepT=sweepLengthSq>1e-8?THREE.MathUtils.clamp(
        paddleSweepDelta.dot(paddleSweepClosest.subVectors(ball.position,playerPaddlePreviousPosition))/sweepLengthSq,0,1,
      ):0
      paddleSweepClosest.copy(playerPaddlePreviousPosition).addScaledVector(paddleSweepDelta,sweepT)
      const withinFace=Math.abs(ball.position.x-paddleSweepClosest.x)<=game.serve.contactDepth+game.ballRadius
      const withinBlade=Math.hypot(
        ball.position.z-paddleSweepClosest.z,ball.position.y-paddleSweepClosest.y,
      )<=game.serve.contactRadius+game.ballRadius
      if(withinFace&&withinBlade&&strikeTossedServe())return
    }
    if(ball.velocity.x>0&&(
      (ball.previous.x<playerX&&ball.position.x>=playerX)
      ||Math.abs(ball.position.x-playerX)<=game.playerContactDepth
    )) {
      // 玩家球拍高度固定；接球只检查前后与左右，不因球高而漏接。
      const close=Math.abs(ball.position.z-playerPaddle.position.z)<=playerLateralReach
      if(close) {
        playerSwing=.24
        strikeBall(SIDE_PLAYER,false)
      }
    } else if(ball.velocity.x<0&&(
      (ball.previous.x>aiX&&ball.position.x<=aiX)
      ||(aiShortBallTracking&&Math.abs(ball.position.x-aiX)<=game.ai.shortBallContactDepth)
      ||(aiShortBallTracking
        &&ball.position.x<=aiPlane()+game.ai.shortBallForwardReach
        &&ball.position.x>=aiPlane()-game.ai.shortBallContactDepth)
    )) {
      // AI 的高度移动只服务于视觉跟随；接发球是否成功只看前后可达范围和左右位置。
      const close=Math.abs(ball.position.z-aiPaddle.position.z)<=aiLateralReach
      if(close&&!aiWillMiss){aiSwing=.18;strikeBall(SIDE_AI,false)}
    }
  }

  const resolveTableAndNet=()=>{
    const current=table();if(!current)return
    const bottomBefore=ball.previous.y-game.ballRadius,bottomNow=ball.position.y-game.ballRadius
    if(bottomBefore>current.surfaceY&&bottomNow<=current.surfaceY&&Math.abs(localX())<=halfLength&&Math.abs(localZ())<=halfWidth) {
      ball.position.y=current.surfaceY+game.ballRadius
      ball.velocity.y=Math.min(
        Math.abs(ball.velocity.y)*game.physics.tableRestitution,
        game.physics.maxBounceUpwardSpeed,
      )
      ball.velocity.x*=.992;ball.velocity.z*=.992
      handleBounce(localX()>=0?SIDE_PLAYER:SIDE_AI)
    }
    const crossedNet=(ball.previous.x-current.center[0])*(ball.position.x-current.center[0])<=0&&Math.sign(ball.previous.x-current.center[0])!==Math.sign(ball.position.x-current.center[0])
    if(crossedNet&&Math.abs(localZ())<=halfWidth+game.ballRadius&&ball.position.y-game.ballRadius<current.netTopY) {
      ball.position.x=current.center[0]+Math.sign(ball.previous.x-current.center[0])*(game.ballRadius+.012)
      ball.velocity.x*=-.28;ball.velocity.y*=.58;netHits++
      onEvent({type:'ping-pong-net',side:lastHit,speed:ball.velocity.length()})
      finishPoint(otherSide(lastHit??server),'net-fault')
    }
  }

  const resolveOut=()=>{
    const current=table();if(!current||!ball.active)return
    const outX=Math.abs(localX())>halfLength+game.physics.outMarginX
    const outZ=Math.abs(localZ())>halfWidth+game.physics.outMarginZ
    const fell=ball.position.y<current.surfaceY-.55
    if(!outX&&!outZ&&!fell)return
    if(!lastHit)return finishPoint(otherSide(server),'serve-incomplete')
    const winner=lastBounceSide&&lastBounceSide!==lastHit?lastHit:otherSide(lastHit)
    finishPoint(winner,lastBounceSide?'return-missed':'return-out')
  }

  const stepBall=dt=>{
    if(!ball.active)return
    ball.previous.copy(ball.position)
    const gravity=phase==='toss'?game.physics.tossGravity:game.physics.gravity
    ball.velocity.y-=gravity*dt
    ball.velocity.multiplyScalar(Math.exp(-game.physics.airDrag*dt))
    ball.position.addScaledVector(ball.velocity,dt)
    resolvePaddleCrossings();resolveTableAndNet()
    if(phase==='toss'&&ball.position.y<table().surfaceY-.08)finishPoint(SIDE_AI,'toss-missed')
    resolveOut();syncLiveBall()
  }

  const resetRally=()=>{
    if(playMode==='match')server=serveForTotal(scores.player+scores.ai)
    setReadyBall()
  }

  const updateAi=dt=>{
    if(activeTableIndex==null)return
    if(phase==='ready'&&server===SIDE_AI) {
      serveTimer-=dt
      if(serveTimer<=0) {
        ball.active=true;ball.velocity.set(0,1.32,0);phase='serve';lastHit=null
        onEvent({type:'ping-pong-toss',side:SIDE_AI})
        serveTimer=-.24
      }
    } else if(phase==='serve'&&server===SIDE_AI&&lastHit==null) {
      serveTimer-=dt
      if(serveTimer<=-.48){aiSwing=.18;strikeBall(SIDE_AI,true)}
    }
    if((phase==='serve'||phase==='rally')&&ball.velocity.x<0) {
      // 对方台面已落过一次的慢短球，需要从底线向网前移动后再接；
      // 预测少量前行距离，让球拍落在球的下游而不是追着球当前位置跑。
      if(lastBounceSide===SIDE_AI&&!aiShortBallTracking) {
        aiTargetX=THREE.MathUtils.clamp(
          ball.position.x+ball.velocity.x*game.ai.shortBallInterceptLead,
          aiPlane(),aiPlane()+game.ai.shortBallForwardReach,
        )
        aiShortBallTracking=true
      } else if(lastBounceSide!==SIDE_AI) {
        aiTargetX=aiPlane();aiShortBallTracking=false
      }
      aiReaction=Math.max(0,aiReaction-dt)
      if(aiReaction===0) {
        aiTargetZ=THREE.MathUtils.clamp(localZ()+(aiWillMiss?.30:0),-game.paddleRange.lateral,game.paddleRange.lateral)
        aiTargetY=THREE.MathUtils.clamp(ball.position.y,game.paddleRange.minY,game.paddleRange.maxY)
      }
    } else {aiTargetX=aiPlane();aiShortBallTracking=false}
  }

  const updateUi=()=>{
    const active=activeTableIndex!=null
    hudState.visible=active
    hudState.mode=playMode
    hudState.playerScore=scores.player;hudState.aiScore=scores.ai
    hudState.server=server;hudState.phase=phase
    hudState.prompt=translateRuntimeText(phase==='matchEnd'?'比赛结束':phase==='ready'
      ?isTouchMode()?'按住移动 松手抛球':'点击抛球'
      :phase==='toss'?'移动球拍击球':phase==='serve'||phase==='rally'?'回合进行中':phase==='point'?'本回合结束':message.textContent)
    cameraUiGroup.visible=active
    cameraMatchButton.visible=active&&!(playMode==='match'&&phase!=='matchEnd')
    if(active)updateCameraUiLayout()
  }

  const enterTable=index=>{
    if(index<0||index>=tables.length)return null
    if(activeTableIndex!=null)exit()
    if(onEnter(tables[index],index)===false)return null
    activeTableIndex=index;playMode='practice';scores={player:0,ai:0};server=SIDE_PLAYER
    rally=0;pointsPlayed=0;playerHits=0;playerSmashes=0;aiHits=0;tableBounces=0;netHits=0
    lastPointerX=null;lastPointerY=null;inputDown=false;playerSwing=0;aiSwing=0;touchPaddlePending=false
    playerPaddleVelocity.set(0,0,0);recentPlayerPaddleVelocity.set(0,0,0);playerPaddleMotionHistory.length=0
    const transform=staticTransforms[index]
    playerPaddle.geometry=paddleVariants[transform.playerRef.variant].geometry
    aiPaddle.geometry=paddleVariants[transform.aiRef.variant].geometry
    playerPaddle.userData.rubberColour=paddleVariants[transform.playerRef.variant].id
    aiPaddle.userData.rubberColour=paddleVariants[transform.aiRef.variant].id
    setInstanceVisible(index,false)
    for(const mesh of [playerPaddle,aiPaddle,liveBall])mesh.visible=true
    cameraRigReady=false;resetPaddles();updateCameraRig(0);setReadyBall();document.body.classList.add('ping-pong-mode')
    message.textContent=isTouchMode()?'按住移动球和球拍，松手抛球':'点击抛球；下落时移动球拍击球'
    onEvent({type:'ping-pong-enter',table:index});updateUi();return snapshot()
  }

  const startMatch=()=>{
    if(activeTableIndex==null)return null
    playMode='match';scores={player:0,ai:0};server=SIDE_PLAYER;phase='ready';pointsPlayed=0
    message.textContent=isTouchMode()?'7分制 · 按住移动，松手抛球':'7分制 · 点击抛球';resetPaddles();setReadyBall()
    onEvent({type:'ping-pong-match-start',table:activeTableIndex});updateUi();return snapshot()
  }

  const exit=()=>{
    if(activeTableIndex==null)return null
    const previous=activeTableIndex
    setInstanceVisible(previous,true);activeTableIndex=null;phase='idle';ball.active=false
    lastPointerX=null;lastPointerY=null;inputDown=false;playerSwing=0;aiSwing=0;touchPaddlePending=false
    playerPaddleVelocity.set(0,0,0);recentPlayerPaddleVelocity.set(0,0,0);playerPaddleMotionHistory.length=0
    for(const mesh of [playerPaddle,aiPaddle,liveBall])mesh.visible=false
    liveBallShadow.visible=false;shadowReceiver='none'
    cameraUiGroup.visible=false
    document.body.classList.remove('ping-pong-mode');updateUi();onExit(tables[previous],previous)
    onEvent({type:'ping-pong-exit',table:previous});return snapshot()
  }

  const reset=()=>{
    if(activeTableIndex==null)return snapshot()
    playMode='practice';scores={player:0,ai:0};server=SIDE_PLAYER;resetPaddles();setReadyBall();return snapshot()
  }

  const serve=(side=server)=>{
    if(activeTableIndex==null||phase!=='ready')return null
    if(side!==server){server=side;setReadyBall()}
    ball.active=true;lastHit=null;phase='serve'
    return strikeBall(side,true)?snapshot():null
  }

  const awardPoint=(winner,reasonCode='test-award')=>{finishPoint(winner,reasonCode);return snapshot()}
  const setScore=(player,ai)=>{scores={player,ai};server=serveForTotal(player+ai);phase='ready';setReadyBall();return snapshot()}
  const setBallState=state=>{
    if(activeTableIndex==null)return null
    if(state.position)ball.position.fromArray(state.position)
    if(state.velocity)ball.velocity.fromArray(state.velocity)
    if(state.phase)phase=state.phase
    if(state.lastHit!==undefined)lastHit=state.lastHit
    if(state.lastBounceSide!==undefined)lastBounceSide=state.lastBounceSide
    ball.previous.copy(ball.position);ball.active=state.active??true;syncLiveBall();updateUi();return snapshot()
  }

  const update=dt=>{
    if(activeTableIndex==null)return
    const limited=Math.min(.05,Math.max(0,dt));updateAi(limited);updatePaddleMeshes(limited)
    if(server===SIDE_PLAYER&&phase==='ready')syncPlayerReadyBall()
    updateCameraRig(limited)
    if(phase==='point') {
      pointTimer-=limited
      if(pointTimer<=0){
        resetRally()
        message.textContent=server===SIDE_PLAYER
          ?isTouchMode()?'按住移动球和球拍，松手抛球':'点击抛球；下落时移动球拍击球'
          :'等待对手发球'
      }
    }
    accumulator=Math.min(accumulator+limited,game.physics.fixedStep*game.physics.maxSubsteps)
    let steps=0
    while(accumulator>=game.physics.fixedStep&&steps<game.physics.maxSubsteps) {
      stepBall(game.physics.fixedStep);accumulator-=game.physics.fixedStep;steps++
    }
    updateBallShadow()
    updateUi()
  }
  const pauseInput=()=>{
    inputDown=false;touchPaddlePending=false;playerSwing=0
    playerPaddleVelocity.set(0,0,0);recentPlayerPaddleVelocity.set(0,0,0);playerPaddleMotionHistory.length=0
    return true
  }
  const resumeAfterPause=()=>true

  const advance=seconds=>{
    const frames=Math.ceil(Math.max(0,seconds)/game.physics.fixedStep)
    for(let frame=0;frame<frames;frame++)update(game.physics.fixedStep)
    return snapshot()
  }

  const hit=(clientX,clientY,useCenter=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(useCenter?0:(clientX-rect.left)/rect.width*2-1,useCenter?0:-((clientY-rect.top)/rect.height)*2+1)
    raycaster.setFromCamera(pointer,camera);raycaster.far=2.5
    return raycaster.intersectObjects([...staticPaddles,...tableHitProxies],false)
      .find(candidate=>candidate.object.userData.table!=null
        ||candidate.object.userData.instances[candidate.instanceId]?.side===SIDE_PLAYER)??null
  }
  const interact=(clientX,clientY,useCenter=false)=>{
    if(activeTableIndex!=null)return {type:'ping-pong-active',table:activeTableIndex}
    const candidate=hit(clientX,clientY,useCenter)
    if(!candidate)return null
    const index=candidate.object.userData.table
      ??candidate.object.userData.instances[candidate.instanceId].table
    return enterTable(index)?{type:'ping-pong-enter',table:index}:null
  }

  const updatePointer=(event,absolute=false)=>{
    if(activeTableIndex==null||!isActiveMode())return
    let dx=event.movementX??0,dy=event.movementY??0
    if(absolute&&lastPointerX!=null){dx=event.clientX-lastPointerX;dy=event.clientY-lastPointerY}
    lastPointerX=event.clientX;lastPointerY=event.clientY
    // 玩家从球桌东侧朝-X观察；此时屏幕向右对应世界-Z。横向输入必须
    // 翻转世界Z增量，才能保持鼠标／手指与画面中的球拍同向移动。
    paddleTargetZ=THREE.MathUtils.clamp(
      paddleTargetZ-dx*game.paddleInputSensitivity.horizontal,-game.paddleRange.lateral,game.paddleRange.lateral,
    )
    paddleTargetForward=THREE.MathUtils.clamp(
      paddleTargetForward+dy*game.paddleInputSensitivity.depth,game.paddleRange.forwardMin,game.paddleRange.forwardMax,
    )
  }

  const hitCameraButton=(clientX,clientY)=>{
    if(activeTableIndex==null||!cameraUiGroup.visible)return null
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set((clientX-rect.left)/rect.width*2-1,-((clientY-rect.top)/rect.height)*2+1)
    camera.updateMatrixWorld(true);raycaster.near=0;raycaster.far=2;raycaster.setFromCamera(pointer,camera)
    return raycaster.intersectObjects([cameraMatchButton,cameraExitButton],false)[0]?.object??null
  }

  const updateTouchSurface=event=>{
    const rect=renderer.domElement.getBoundingClientRect()
    const x=THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width,0,1)
    // 顶部22%保留给信息和3D按钮；其余整块画布都是球拍活动区域。
    const y=THREE.MathUtils.clamp((event.clientY-(rect.top+rect.height*.22))/(rect.height*.78),0,1)
    paddleTargetZ=THREE.MathUtils.lerp(game.paddleRange.lateral,-game.paddleRange.lateral,x)
    paddleTargetForward=THREE.MathUtils.lerp(game.paddleRange.forwardMin,game.paddleRange.forwardMax,y)
  }

  const applyTouchSurface=(event,countAsSwing=true)=>{
    updateTouchSurface(event)
    const current=table();if(!current)return
    if(countAsSwing) {
      if(!touchPaddlePending)touchPaddleSweepStart.copy(playerPaddle.position)
      touchPaddlePending=true
    }
    // 直接更新可见拍面，避免先写目标再等待下一帧造成触控拖尾感。
    playerPaddle.position.z=current.center[1]+paddleTargetZ
    playerPaddle.position.x=playerPlane()+paddleTargetForward
    playerPaddle.position.y=current.surfaceY+game.playerPaddleHeight
    if(!countAsSwing) {
      // 落指只负责重新定位；从第一条真实移动开始才计算挥拍速度。
      touchPaddleSweepStart.copy(playerPaddle.position)
      touchPaddlePending=false
      playerPaddleVelocity.y=0;playerPaddleVelocity.z=0
      recentPlayerPaddleVelocity.y=0;recentPlayerPaddleVelocity.z=0
      playerPaddleMotionHistory.length=0
    }
    if(server===SIDE_PLAYER&&phase==='ready')syncPlayerReadyBall()
  }

  renderer.domElement.addEventListener('pointermove',event=>{if(!isTouchMode())updatePointer(event,!document.pointerLockElement)})
  renderer.domElement.addEventListener('pointerdown',event=>{if(event.button===0&&!isTouchMode()&&isActiveMode()){beginPlayerAction();event.preventDefault()}})
  addEventListener('pointerup',event=>{if(event.button===0&&!isTouchMode()&&isActiveMode())endPlayerAction()})
  let touchPointerId=null,touchCameraButton=null
  renderer.domElement.addEventListener('pointerdown',event=>{
    if(!isTouchMode()||!isActiveMode()||touchPointerId!=null)return
    touchPointerId=event.pointerId;renderer.domElement.setPointerCapture?.(event.pointerId)
    touchCameraButton=hitCameraButton(event.clientX,event.clientY)
    if(!touchCameraButton){applyTouchSurface(event,false);beginPlayerAction(true)}
    event.preventDefault();event.stopPropagation()
  })
  renderer.domElement.addEventListener('pointermove',event=>{
    if(event.pointerId!==touchPointerId||touchCameraButton)return
    const samples=event.getCoalescedEvents?.()??[event]
    for(const sample of samples)applyTouchSurface(sample)
    event.preventDefault();event.stopPropagation()
  })
  const finishTouch=event=>{
    if(event.pointerId!==touchPointerId)return
    const pressedButton=touchCameraButton
    if(pressedButton) {
      const releasedButton=hitCameraButton(event.clientX,event.clientY)
      if(releasedButton===pressedButton) {
        if(pressedButton.userData.cameraAction==='exit')exit()
        else if(pressedButton.userData.cameraAction==='match')startMatch()
      }
    } else {
      applyTouchSurface(event);endPlayerAction(true)
    }
    touchPointerId=null;touchCameraButton=null;event.preventDefault();event.stopPropagation()
  }
  const cancelTouch=event=>{
    if(event.pointerId!==touchPointerId)return
    if(!touchCameraButton)inputDown=false
    touchPointerId=null;touchCameraButton=null;event.preventDefault();event.stopPropagation()
  }
  renderer.domElement.addEventListener('pointerup',finishTouch);renderer.domElement.addEventListener('pointercancel',cancelTouch)

  const snapshot=()=>({
    status:activeTableIndex==null?'idle':'active',activeTable:activeTableIndex,simulations:activeTableIndex==null?0:1,
    phase,mode:playMode,server,scores:{...scores},targetScore:game.rules.targetScore,
    feedback:hudState.prompt,feedbackCode:hudState.feedbackCode,reasonCode:hudState.reasonCode,
    table:table()?{center:[...table().center],size:[...game.tableSize],surfaceY:table().surfaceY,netTopY:table().netTopY,playerSide:game.playerSide}:null,
    ball:{
      active:ball.active,position:ball.position.toArray().map(value=>+value.toFixed(4)),velocity:ball.velocity.toArray().map(value=>+value.toFixed(4)),radius:game.ballRadius,
      shadow:{visible:liveBallShadow.visible,receiver:shadowReceiver,position:liveBallShadow.position.toArray().map(value=>+value.toFixed(4)),scale:[liveBallShadow.scale.x,liveBallShadow.scale.z].map(value=>+value.toFixed(4)),opacity:+shadowMaterial.uniforms.opacity.value.toFixed(4)},
    },
    serve:{charging:false,charge:0,lastHit,tossAirTime:+lastTossAirTime.toFixed(4)},
    paddles:{
      player:playerPaddle.position.toArray().map(value=>+value.toFixed(4)),
      playerRotation:playerPaddle.rotation.toArray().slice(0,3).map(value=>+value.toFixed(4)),
      ai:aiPaddle.position.toArray().map(value=>+value.toFixed(4)),
      playerVelocity:playerPaddleVelocity.toArray().map(value=>+value.toFixed(4)),
      recentPlayerVelocity:recentPlayerPaddleVelocity.toArray().map(value=>+value.toFixed(4)),
      playerScreen:playerPaddle.position.clone().project(camera).toArray().slice(0,2).map(value=>+value.toFixed(4)),
      colours:{player:playerPaddle.userData.rubberColour??null,ai:aiPaddle.userData.rubberColour??null},
    },
    camera:{
      position:camera.position.toArray().map(value=>+value.toFixed(4)),
      target:cameraRigTarget.toArray().map(value=>+value.toFixed(4)),
      fixed:true,follow:{...game.cameraFollow},
    },
    controls:{
      touchSurface:isTouchMode(),touchActive:touchPointerId!=null&&!touchCameraButton,htmlButtons:0,
      cameraButtons:Object.fromEntries([cameraMatchButton,cameraExitButton].map(mesh=>{
        const screen=mesh.getWorldPosition(new THREE.Vector3()).project(camera)
        return [mesh.userData.cameraAction,{visible:cameraUiGroup.visible&&mesh.visible,screen:[+screen.x.toFixed(4),+screen.y.toFixed(4)]}]
      })),
    },
    stats:{rally,pointsPlayed,playerHits,playerSmashes,aiHits,tableBounces,netHits},
    ui:{...hudState},
    props:{
      paddles:tables.length*2,balls:tables.length,sharedPaddleGeometry:true,sharedPaddleMaterial:true,
      rubberColours:rubberColours.map(variant=>variant.id),staticPaddleMeshes:staticPaddles.length,
      tableHitProxies:tableHitProxies.length,tableHitProxyGeometryShared:true,
    },
  })

  updateUi()
  return {interact,hit,enterTable,startMatch,serve,exit,update,reset,snapshot,advance,setBallState,awardPoint,setScore,beginPlayerAction,endPlayerAction,pauseInput,resumeAfterPause,hudState:()=>hudState}
}

import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {getUserDataStore} from '../state/user-data-store.js'
import {
  applyCubeMove,applyCubeMoves,createSolvedCubeState,generateCubeScramble,inverseCubeMove,
  isCubeSolved,serializeCubeState,validateCubeState,
} from './rubiks-cube-state.js'

const STORAGE_NAMESPACE='rubiksCubes'
const TURN_MS=220
const CONFIRM_MS=2500
const HISTORY_LIMIT=200
const CUBIE_SIZE=.92
const STICKER_EXTENT=.84
const STICKER_OFFSET=.468
const STICKER_UV_SCALE=.90
const AXIS_INDEX={x:0,y:1,z:2}
const INDEX_AXIS=['x','y','z']
const COLORS={
  'x+':0xa13b2b,'x-':0xbb5b26,
  'y+':0xe2d8be,'y-':0xd3a630,
  'z+':0x3b6543,'z-':0x305670,
}
const SHAPES=[
  [[-.35,-.42],[.35,-.42],[.41,-.35],[.41,.35],[.35,.41],[-.35,.41],[-.41,.35],[-.41,-.35]],
  [[-.35,-.41],[.35,-.41],[.41,-.35],[.41,.35],[.35,.41],[-.35,.41],[-.41,.35],[-.41,.22],[-.37,.18],[-.41,.12],[-.41,-.04],[-.37,-.08],[-.41,-.14],[-.41,-.35]],
  [[-.33,-.41],[-.28,-.37],[.35,-.41],[.41,-.35],[.41,.35],[.35,.41],[-.35,.41],[-.41,.35],[-.41,-.31]],
  [[-.35,-.41],[.35,-.41],[.41,-.35],[.41,.08],[.36,.13],[.41,.19],[.41,.35],[.35,.41],[-.35,.41],[-.41,.35],[-.41,-.35]],
  [[-.35,-.41],[.35,-.41],[.41,-.35],[.41,.35],[.30,.41],[.27,.37],[.21,.41],[-.02,.41],[-.06,.37],[-.10,.41],[-.35,.41],[-.41,.35],[-.41,-.35]],
  [[-.35,-.41],[-.10,-.41],[-.03,-.33],[.04,-.41],[.35,-.41],[.41,-.35],[.41,.35],[.35,.41],[-.35,.41],[-.41,.35],[-.41,-.35]],
  [[-.35,-.41],[.35,-.41],[.41,-.35],[.41,.35],[.35,.41],[-.31,.41],[-.41,.31],[-.41,-.35]],
  [[-.25,-.41],[.35,-.41],[.41,-.35],[.41,.35],[.35,.41],[-.35,.41],[-.41,.35],[-.41,-.25],[-.36,-.18]],
  [[-.35,-.41],[-.04,-.41],[.02,-.36],[.08,-.41],[.35,-.41],[.41,-.35],[.41,.07],[.37,.12],[.41,.18],[.41,.35],[.35,.41],[-.29,.41],[-.41,.30],[-.41,-.35]],
]

let storageHandle=null
const storage=()=>storageHandle??=getUserDataStore().registerNamespace(STORAGE_NAMESPACE,{
  version:1,defaultValue:{cubes:{}},validate:value=>{
    const cubes={}
    if(value?.cubes&&typeof value.cubes==='object')for(const [id,state] of Object.entries(value.cubes)) {
      const valid=validateCubeState(state);if(valid)cubes[id]=valid
    }
    return {cubes}
  },
})

function hashText(text) {
  let value=2166136261
  for(let index=0;index<text.length;index++){value^=text.charCodeAt(index);value=Math.imul(value,16777619)}
  return value>>>0
}

const parseHome=id=>id.split(',').map(Number)
const vectorFor=(index,sign)=>{const vector=[0,0,0];vector[index]=sign;return vector}
const isCenterPosition=position=>position.filter(value=>value===0).length===2

function matrixForCubie(cubie,target=new THREE.Matrix4()) {
  const o=cubie.o,p=cubie.p
  return target.set(o[0],o[1],o[2],p[0],o[3],o[4],o[5],p[1],o[6],o[7],o[8],p[2],0,0,0,1)
}

function makeStickerGeometry(points,tileIndex) {
  const shape=new THREE.Shape()
  shape.moveTo(...points[0]);for(const point of points.slice(1))shape.lineTo(...point);shape.closePath()
  const geometry=new THREE.ShapeGeometry(shape)
  const position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv')
  const column=tileIndex%3,row=Math.floor(tileIndex/3)
  for(let index=0;index<position.count;index++) {
    const x=position.getX(index),y=position.getY(index)
    // Crop each atlas cell slightly so the photographed paper edge reaches
    // the procedural sticker silhouette instead of sitting visibly inside it.
    const localU=THREE.MathUtils.clamp(.5+(x/STICKER_EXTENT)*STICKER_UV_SCALE,0,1)
    const localV=THREE.MathUtils.clamp(.5-(y/STICKER_EXTENT)*STICKER_UV_SCALE,0,1)
    uv.setXY(index,(column+localU)/3,1-(row+localV)/3)
  }
  uv.needsUpdate=true;geometry.computeVertexNormals();return geometry
}

function createResources(texture,renderer) {
  texture.colorSpace=THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  const bodyGeometry=new RoundedBoxGeometry(CUBIE_SIZE,CUBIE_SIZE,CUBIE_SIZE,2,.07)
  const bodyMaterial=new THREE.MeshStandardMaterial({name:'rubiks-cube-black-plastic',color:0x171513,roughness:.74,metalness:0})
  const stickerMaterial=new THREE.MeshBasicMaterial({
    name:'rubiks-cube-shared-worn-stickers',map:texture,color:0xffffff,
    vertexColors:false,side:THREE.DoubleSide,toneMapped:false,
  })
  const stickerGeometries=SHAPES.map((points,index)=>makeStickerGeometry(points,index))
  return {texture,bodyGeometry,bodyMaterial,stickerMaterial,stickerGeometries}
}

function createCubeVisual(resources,cubeId) {
  const group=new THREE.Group();group.name=`rubiks-cube-visual-${cubeId}`
  const body=new THREE.InstancedMesh(resources.bodyGeometry,resources.bodyMaterial,26)
  body.name=`rubiks-cube-bodies-${cubeId}`;body.castShadow=false;body.receiveShadow=true;body.frustumCulled=false
  const stickers=resources.stickerGeometries.map((geometry,index)=>{
    const mesh=new THREE.InstancedMesh(geometry,resources.stickerMaterial,6)
    mesh.name=`rubiks-cube-stickers-${index+1}-${cubeId}`;mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false
    mesh.userData.records=[];group.add(mesh);return mesh
  })
  group.add(body)
  const solved=createSolvedCubeState(),records=[]
  for(const cubie of solved.cubies) {
    const home=parseHome(cubie.id)
    for(let axis=0;axis<3;axis++)if(home[axis]!==0)records.push({
      key:`${cubie.id}:${axis}`,cubieId:cubie.id,normal:vectorFor(axis,Math.sign(home[axis])),
      color:COLORS[`${INDEX_AXIS[axis]}${home[axis]>0?'+':'-'}`],
    })
  }
  records.sort((a,b)=>(hashText(`${cubeId}:${a.key}`)-hashText(`${cubeId}:${b.key}`))||a.key.localeCompare(b.key))
  records.forEach((record,index)=>{
    record.variant=index%9
    const hash=hashText(`${cubeId}:${record.key}:transform`)
    record.quarterTurns=hash%4;record.mirror=Boolean((hash>>>3)&1)
    const mesh=stickers[record.variant],instanceId=mesh.userData.records.length
    record.instanceId=instanceId;mesh.userData.records.push(record)
    mesh.setColorAt(instanceId,new THREE.Color(record.color))
  })
  for(const mesh of stickers)if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
  const bodyRecords=[...solved.cubies].sort((a,b)=>a.id.localeCompare(b.id)).map(cubie=>cubie.id)
  body.userData.records=bodyRecords
  const cubieMap=new Map(),matrix=new THREE.Matrix4(),localMatrix=new THREE.Matrix4(),animationMatrix=new THREE.Matrix4()
  const normalVector=new THREE.Vector3(),normalQuaternion=new THREE.Quaternion(),twistQuaternion=new THREE.Quaternion()
  const zAxis=new THREE.Vector3(0,0,1),scale=new THREE.Vector3(),position=new THREE.Vector3()
  const selected=(cubie,move)=>cubie.p[AXIS_INDEX[move.axis]]===move.layer
  const update=(state,animation=null)=>{
    cubieMap.clear();for(const cubie of state.cubies)cubieMap.set(cubie.id,cubie)
    if(animation)animationMatrix.makeRotationAxis(vectorForAxis(animation.move.axis),animation.angle)
    for(const [index,id] of bodyRecords.entries()) {
      const cubie=cubieMap.get(id);matrixForCubie(cubie,matrix)
      if(animation&&selected(cubie,animation.move))matrix.premultiply(animationMatrix)
      body.setMatrixAt(index,matrix)
    }
    body.instanceMatrix.needsUpdate=true
    for(const record of records) {
      const cubie=cubieMap.get(record.cubieId);matrixForCubie(cubie,matrix)
      if(animation&&selected(cubie,animation.move))matrix.premultiply(animationMatrix)
      normalVector.fromArray(record.normal)
      normalQuaternion.setFromUnitVectors(zAxis,normalVector)
      twistQuaternion.setFromAxisAngle(zAxis,record.quarterTurns*Math.PI/2)
      normalQuaternion.multiply(twistQuaternion)
      position.copy(normalVector).multiplyScalar(STICKER_OFFSET)
      scale.set(record.mirror?-1:1,1,1)
      localMatrix.compose(position,normalQuaternion,scale)
      localMatrix.premultiply(matrix)
      stickers[record.variant].setMatrixAt(record.instanceId,localMatrix)
    }
    for(const mesh of stickers)mesh.instanceMatrix.needsUpdate=true
    group.updateMatrixWorld(true)
  }
  const pickables=()=>[...stickers,body]
  const stickerForHit=hit=>hit?.object?.userData?.records?.[hit.instanceId]??null
  const dispose=()=>group.remove(body,...stickers)
  update(solved)
  return {group,body,stickers,records,update,pickables,stickerForHit,dispose}
}

function vectorForAxis(axis) {
  if(axis==='x')return new THREE.Vector3(1,0,0)
  if(axis==='y')return new THREE.Vector3(0,1,0)
  return new THREE.Vector3(0,0,1)
}

function makeTextPlane(renderer,{name,width=1024,height=160,fontSize=52,kind='instruction'}) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const context=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas)
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.name=name;mesh.renderOrder=10
  let current=''
  const setText=text=>{
    const next=String(text??'');if(next===current)return;current=next
    context.clearRect(0,0,width,height)
    if(kind==='arcadeButton'){
      context.fillStyle='#173f67';context.strokeStyle='#17191b';context.lineWidth=10
      context.beginPath();context.roundRect(19,20,width-31,height-31,25);context.fill();context.stroke()
      context.fillStyle='#ad3e2c';context.beginPath();context.roundRect(12,14,width-31,height-31,25);context.fill()
      context.fillStyle='#e7bd36';context.strokeStyle='#211d18';context.lineWidth=8
      context.beginPath();context.roundRect(8,8,width-31,height-31,25);context.fill();context.stroke()
    }
    context.textAlign='center';context.textBaseline='middle';context.lineJoin='round'
    if(kind==='arcadeTitle'){
      context.font=`900 italic ${fontSize}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`
      context.lineWidth=14;context.strokeStyle='#17191b';context.fillStyle='#173f67'
      context.strokeText(next,width/2+13,height/2+12);context.fillText(next,width/2+13,height/2+12)
      context.lineWidth=10;context.strokeStyle='#211d18';context.fillStyle='#b33e2c'
      context.strokeText(next,width/2+7,height/2+6);context.fillText(next,width/2+7,height/2+6)
      context.lineWidth=7;context.strokeStyle='#211d18';context.fillStyle='#f0c63f'
      context.strokeText(next,width/2,height/2);context.fillText(next,width/2,height/2)
    }else{
      context.font=`${kind==='arcadeButton'?600:500} ${fontSize}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`
      context.lineWidth=kind==='arcadeButton'?0:5;context.strokeStyle='rgba(28,24,20,.88)';context.fillStyle=kind==='arcadeButton'?'#251f18':'#f0eadb'
      const lines=next.split('\n'),lineHeight=fontSize*1.25,startY=height/2-(lines.length-1)*lineHeight/2
      lines.forEach((line,index)=>{
        const y=startY+index*lineHeight
        if(kind!=='arcadeButton')context.strokeText(line,width/2,y)
        context.fillText(line,width/2,y)
      })
    }
    texture.needsUpdate=true
  }
  const dispose=()=>{mesh.geometry.dispose();material.dispose();texture.dispose()}
  return {mesh,setText,dispose,get text(){return current}}
}

function screenPoint(vector,camera,width,height) {
  const projected=vector.clone().project(camera)
  return new THREE.Vector2((projected.x+1)*width/2,(1-projected.y)*height/2)
}

export function createRubiksCubeGame({
  renderer,camera,scene,worldParent,deskAnchor,config,assetLoader,
  isTouchMode=()=>false,isActiveMode=()=>false,isOccluder=()=>false,
  onEnter=()=>true,onExit=()=>{},onEvent=()=>{},playTurn=()=>{},
}) {
  const cubeConfig=config.cubes[0],cubeId=cubeConfig.id
  let loadPromise=null,resources=null,worldVisual=null,displayVisual=null,active=false
  let state=null,history=[],turn=null,pointerState=null,confirmAction=null,confirmUntil=0,statusUntil=0
  let postExitClick=null,lastHitDiagnostics=null
  const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2(),clock=new THREE.Clock(false)
  const saved=storage().get()
  const defaultState=applyCubeMoves(createSolvedCubeState(),generateCubeScramble(cubeConfig.scrambleMoves,{seed:`${config.seed}:${cubeId}`}))
  state=validateCubeState(saved.cubes[cubeId])??defaultState

  const overlayScene=new THREE.Scene(),overlayCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,10);overlayCamera.position.z=1
  const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:0x17130f,transparent:true,opacity:.88,depthTest:false,depthWrite:false}))
  backdrop.name='rubiks-cube-backdrop';overlayScene.add(backdrop)
  const modelScene=new THREE.Scene(),modelCamera=new THREE.PerspectiveCamera(31,1,.01,30)
  modelCamera.position.set(0,0,8.2);modelCamera.lookAt(0,0,0)
  modelScene.add(new THREE.HemisphereLight(0xffefd2,0x35251b,2.5))
  const key=new THREE.DirectionalLight(0xffe8c7,3.6);key.position.set(-3.5,5,5);modelScene.add(key)
  const fill=new THREE.DirectionalLight(0x9fc4de,1.15);fill.position.set(4,-1,4);modelScene.add(fill)
  const displayRoot=new THREE.Group();displayRoot.name='rubiks-cube-display-root';displayRoot.rotation.set(-.34,.55,0);modelScene.add(displayRoot)

  const uiScene=new THREE.Scene(),uiCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,10);uiCamera.position.z=1
  const title=makeTextPlane(renderer,{name:'rubiks-cube-title',width:440,height:150,fontSize:72,kind:'arcadeTitle'})
  const instruction=makeTextPlane(renderer,{name:'rubiks-cube-instruction',width:900,height:180,fontSize:54})
  const status=makeTextPlane(renderer,{name:'rubiks-cube-status',width:900,height:140,fontSize:42})
  title.setText('魔方');instruction.setText('拖动贴纸转动\n空白处旋转观察')
  status.setText('')
  uiScene.add(title.mesh,instruction.mesh,status.mesh)
  const buttonLabels={undo:'撤销',shuffle:'打乱',restore:'复原',exit:'退出'}
  const buttons=Object.fromEntries(Object.entries(buttonLabels).map(([id,label])=>{
    const entry=makeTextPlane(renderer,{name:`rubiks-cube-${id}`,width:360,height:128,fontSize:50,kind:'arcadeButton'})
    entry.setText(label);entry.id=id;entry.bounds=null;uiScene.add(entry.mesh);return [id,entry]
  }))

  const persist=()=>storage().update(value=>({cubes:{...value.cubes,[cubeId]:serializeCubeState(state)}}))
  const setStatus=(text,duration=1800)=>{status.setText(text);statusUntil=performance.now()+duration}
  const clearPointer=()=>{pointerState=null}
  const finishTurn=()=>{
    if(!turn)return false
    const finished=turn;state=applyCubeMove(state,finished.move);turn=null
    if(finished.recordHistory){history.push(finished.move);if(history.length>HISTORY_LIMIT)history.shift();onEvent({type:'rubiks-cube-move',id:cubeId,moves:history.length})}
    worldVisual?.update(state);displayVisual?.update(state);persist();playTurn()
    if(finished.celebrate&&isCubeSolved(state)){setStatus('拼好了！',2600);onEvent({type:'rubiks-cube-complete',id:cubeId,moves:history.length})}
    return true
  }
  const startTurn=(move,{recordHistory=true,celebrate=true}={})=>{
    if(turn)return false
    turn={move:{...move},startedAt:performance.now(),recordHistory,celebrate,angle:0}
    clearPointer();return true
  }
  const undo=()=>{
    if(turn||!history.length){if(!history.length)setStatus('暂时没有可以撤销的转动');return false}
    return startTurn(inverseCubeMove(history.pop()),{recordHistory:false,celebrate:false})
  }
  const requireConfirmation=(action,label,callback)=>{
    const now=performance.now()
    if(confirmAction===action&&now<confirmUntil){confirmAction=null;confirmUntil=0;callback();return true}
    confirmAction=action;confirmUntil=now+CONFIRM_MS;setStatus(`再按一次“${label}”确认`,CONFIRM_MS);return false
  }
  const shuffle=()=>requireConfirmation('shuffle','打乱',()=>{
    state=applyCubeMoves(createSolvedCubeState(),generateCubeScramble(24,{seed:`${cubeId}:${Date.now()}:${Math.random()}`}))
    history=[];worldVisual?.update(state);displayVisual?.update(state);persist();setStatus('已经重新打乱')
  })
  const restore=()=>requireConfirmation('restore','复原',()=>{
    state=createSolvedCubeState();history=[];worldVisual?.update(state);displayVisual?.update(state);persist();setStatus('已经复原')
  })

  const load=()=>{
    if(loadPromise)return loadPromise
    loadPromise=(async()=>{
      const texture=await assetLoader.loadTexture(config.textureUrl)
      resources=createResources(texture,renderer)
      worldVisual=createCubeVisual(resources,cubeId);worldVisual.group.name=`rubiks-cube-world-${cubeId}`
      const [localX,localZ]=cubeConfig.local
      const cos=Math.cos(deskAnchor.rotationY),sin=Math.sin(deskAnchor.rotationY)
      worldVisual.group.position.set(
        deskAnchor.position[0]+cos*localX+sin*localZ,
        deskAnchor.position[1]+config.workingSize/2+.0015,
        deskAnchor.position[2]-sin*localX+cos*localZ,
      )
      worldVisual.group.rotation.y=deskAnchor.rotationY+THREE.MathUtils.degToRad(cubeConfig.rotationDegrees)
      worldVisual.group.scale.setScalar(config.workingSize/2.92)
      worldVisual.group.userData.rubiksCube={id:cubeId,classroom:cubeConfig.classroom,deskId:cubeConfig.deskId}
      worldParent.add(worldVisual.group);worldVisual.update(state)
      displayVisual=createCubeVisual(resources,`${cubeId}-display`);displayVisual.group.scale.setScalar(1.04);displayRoot.add(displayVisual.group);displayVisual.update(state)
      resize();return snapshot()
    })().catch(error=>{loadPromise=null;throw error})
    return loadPromise
  }

  const setRay=(clientX,clientY,useCenter=false,targetCamera=camera)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    const x=useCenter?rect.left+rect.width/2:clientX,y=useCenter?rect.top+rect.height/2:clientY
    pointerNdc.set((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1)
    raycaster.layers.enableAll();raycaster.setFromCamera(pointerNdc,targetCamera);return {x,y,rect}
  }
  const hit=(clientX,clientY,useCenter=false,skipOcclusion=false)=>{
    if(!worldVisual)return null
    const {x,y}=setRay(clientX,clientY,useCenter,camera)
    const hits=raycaster.intersectObjects(worldVisual.pickables(),false),first=hits[0]
    if(!first||first.distance>config.interactionDistance){lastHitDiagnostics={result:'miss'};return null}
    if(!skipOcclusion) {
      const belongsToCube=object=>{
        for(let current=object;current;current=current.parent)if(current===worldVisual.group)return true
        return false
      }
      // The scene-wide occlusion ray also sees the cube's own bodies and stickers.
      // They are the interaction target, not blockers in front of themselves.
      const blockers=raycaster.intersectObjects(scene.children,true).filter(candidate=>
        candidate.distance<first.distance-.003&&!belongsToCube(candidate.object)&&isOccluder(candidate),
      )
      if(blockers.length){lastHitDiagnostics={result:'occluded',blocker:blockers[0].object.name};return null}
    }
    lastHitDiagnostics={result:'hit',distance:+first.distance.toFixed(4),x:+x.toFixed(1),y:+y.toFixed(1)}
    return {id:cubeId,item:worldVisual.group.userData.rubiksCube,distance:first.distance,point:first.point.toArray()}
  }
  const enter=()=>{
    if(active||!worldVisual||!onEnter({id:cubeId,classroom:cubeConfig.classroom}))return false
    active=true;worldVisual.group.visible=false;displayVisual.update(state);displayRoot.rotation.set(-.34,.55,0)
    instruction.setText(isTouchMode()?'拖动贴纸转动 · 空白处旋转观察':'拖动贴纸转动\n空白处旋转观察')
    setStatus('',0);clock.start();onEvent({type:'rubiks-cube-enter',id:cubeId});return true
  }
  const interact=(clientX,clientY,useCenter=false)=>{
    const target=hit(clientX,clientY,useCenter,false);return target&&enter()?{type:'rubiks-cube',...target}:null
  }
  const exit=(event=null)=>{
    if(!active)return false
    if(turn)finishTurn();active=false;clearPointer();confirmAction=null;worldVisual.group.visible=true;worldVisual.update(state);persist();clock.stop()
    if(event)postExitClick={x:event.clientX,y:event.clientY,until:performance.now()+420}
    onEvent({type:'rubiks-cube-exit',id:cubeId});onExit();return true
  }
  const consumePostExitClick=event=>{
    if(!postExitClick||performance.now()>postExitClick.until){postExitClick=null;return false}
    const match=Math.hypot(event.clientX-postExitClick.x,event.clientY-postExitClick.y)<=18
    if(match)postExitClick=null;return match
  }

  const buttonAt=(x,y)=>Object.values(buttons).find(button=>{
    const bounds=button.bounds;return bounds&&x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom
  })?.id??null
  const activateButton=(id,event)=>{
    if(id==='undo')undo()
    else if(id==='shuffle')shuffle()
    else if(id==='restore')restore()
    else if(id==='exit')exit(event)
  }
  const displayStickerHit=(x,y)=>{
    setRay(x,y,false,modelCamera)
    // Include the black cubies in the depth query. If a pointer begins over a
    // gap or a damaged sticker corner, the body must stop the ray instead of
    // allowing it to pass through and select a sticker on the rear face.
    const first=raycaster.intersectObjects(displayVisual.pickables(),false)[0]
    const record=displayVisual.stickerForHit(first)
    return first&&record?{hit:first,record}:null
  }
  const moveFromDrag=(record,dx,dy)=>{
    const cubie=state.cubies.find(item=>item.id===record.cubieId);if(!cubie)return null
    const localNormal=new THREE.Vector3(...record.normal).applyMatrix3(new THREE.Matrix3().set(...cubie.o))
    localNormal.set(Math.round(localNormal.x),Math.round(localNormal.y),Math.round(localNormal.z))
    const faceAxis=[Math.abs(localNormal.x),Math.abs(localNormal.y),Math.abs(localNormal.z)].indexOf(1)
    const pointLocal=new THREE.Vector3(...cubie.p).addScaledVector(localNormal,.48)
    displayRoot.updateMatrixWorld(true)
    const pointWorld=displayRoot.localToWorld(pointLocal.clone()),drag=new THREE.Vector2(dx,dy).normalize()
    let best=null
    for(let axisIndex=0;axisIndex<3;axisIndex++) {
      if(axisIndex===faceAxis)continue
      const axisLocal=new THREE.Vector3().fromArray(vectorFor(axisIndex,1)),motionLocal=new THREE.Vector3().crossVectors(axisLocal,pointLocal).normalize().multiplyScalar(.55)
      const axisWorld=axisLocal.clone().transformDirection(displayRoot.matrixWorld)
      const motionWorld=motionLocal.clone().transformDirection(displayRoot.matrixWorld)
      const screenA=screenPoint(pointWorld,modelCamera,innerWidth,innerHeight)
      const screenB=screenPoint(pointWorld.clone().add(motionWorld),modelCamera,innerWidth,innerHeight)
      const screenMotion=screenB.sub(screenA);if(screenMotion.lengthSq()<1e-4)continue;screenMotion.normalize()
      const score=drag.dot(screenMotion),absolute=Math.abs(score)
      if(!best||absolute>best.absolute)best={absolute,axis:INDEX_AXIS[axisIndex],layer:cubie.p[axisIndex],direction:score>=0?1:-1,axisWorld}
    }
    if(!best)return null
    if(best.layer===0&&isCenterPosition(cubie.p)) {
      // The exact fixed centre cannot identify an M/E/S slice unambiguously.
      // Resolve only that single sticker to the touched face. Stickers in the
      // middle row or column still keep layer 0 and turn the genuine slice.
      const faceSign=Math.sign(localNormal.getComponent(faceAxis))||1
      const screenSign=Math.abs(dx)>=Math.abs(dy)?Math.sign(dx):-Math.sign(dy)
      return {axis:INDEX_AXIS[faceAxis],layer:faceSign,direction:(screenSign||1)*faceSign}
    }
    return {axis:best.axis,layer:best.layer,direction:best.direction}
  }
  const probeGesture=(cubieId,normal,dx,dy)=>{
    const record=displayVisual?.records.find(candidate=>candidate.cubieId===cubieId&&candidate.normal.join(',')===normal.join(','))
    return record?moveFromDrag(record,dx,dy):null
  }

  const pointerDown=event=>{
    if(!active||event.button!==0&&event.pointerType!=='touch')return false
    const button=buttonAt(event.clientX,event.clientY)
    if(button){activateButton(button,event);event.preventDefault();event.stopPropagation();return true}
    if(turn)return true
    const sticker=displayStickerHit(event.clientX,event.clientY)
    pointerState={id:event.pointerId,kind:sticker?'sticker':'orbit',startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,record:sticker?.record??null,moved:false}
    renderer.domElement.setPointerCapture?.(event.pointerId);event.preventDefault();event.stopPropagation();return true
  }
  const pointerMove=event=>{
    if(!active||pointerState?.id!==event.pointerId)return false
    const dx=event.clientX-pointerState.lastX,dy=event.clientY-pointerState.lastY
    const totalX=event.clientX-pointerState.startX,totalY=event.clientY-pointerState.startY
    pointerState.lastX=event.clientX;pointerState.lastY=event.clientY
    if(pointerState.kind==='orbit') {
      if(Math.hypot(totalX,totalY)>3)pointerState.moved=true
      displayRoot.rotation.y+=dx*.006
      displayRoot.rotation.x=THREE.MathUtils.clamp(displayRoot.rotation.x+dy*.005,-1.05,.72)
    } else if(Math.hypot(totalX,totalY)>8) {
      const move=moveFromDrag(pointerState.record,totalX,totalY);if(move)startTurn(move)
    }
    event.preventDefault();event.stopPropagation();return true
  }
  const endPointer=event=>{
    if(pointerState?.id!==event.pointerId)return false
    if(renderer.domElement.hasPointerCapture?.(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId)
    clearPointer();event.preventDefault();event.stopPropagation();return true
  }
  const handleKey=(code,event=null)=>{
    if(!active)return false
    if(code==='KeyX')return exit()
    if(code==='KeyZ'||((event?.metaKey||event?.ctrlKey)&&code==='KeyZ'))return undo()
    if(code==='KeyR')return restore()
    return false
  }
  const suspend=()=>{
    clearPointer()
    if(turn)finishTurn()
    return active
  }
  const pauseInput=()=>{clearPointer();return true}
  const resumeAfterPause=durationMs=>{
    const delta=Math.max(0,durationMs||0)
    if(turn)turn.startedAt+=delta
    if(confirmUntil)confirmUntil+=delta
    if(statusUntil)statusUntil+=delta
    return true
  }

  const update=now=>{
    if(!active)return
    if(turn) {
      const progress=THREE.MathUtils.clamp((now-turn.startedAt)/TURN_MS,0,1)
      const eased=1-Math.pow(1-progress,3),direction=turn.move.direction<0?-1:1
      turn.angle=direction*Math.PI/2*eased
      displayVisual.update(state,{move:turn.move,angle:turn.angle})
      if(progress>=1)finishTurn()
    }
    if(confirmAction&&now>=confirmUntil){confirmAction=null;confirmUntil=0}
    if(status.text&&statusUntil&&now>=statusUntil){status.setText('');statusUntil=0}
  }
  const render=()=>{
    if(!active)return
    const previousAutoClear=renderer.autoClear;renderer.autoClear=false
    renderer.clearDepth();renderer.render(overlayScene,overlayCamera)
    renderer.clearDepth();renderer.render(modelScene,modelCamera)
    renderer.clearDepth();renderer.render(uiScene,uiCamera)
    renderer.autoClear=previousAutoClear
  }
  const resize=()=>{
    const width=Math.max(1,renderer.domElement.clientWidth),height=Math.max(1,renderer.domElement.clientHeight),aspect=width/height
    for(const target of [overlayCamera,uiCamera]){target.left=-aspect;target.right=aspect;target.top=1;target.bottom=-1;target.updateProjectionMatrix()}
    backdrop.scale.set(aspect,1,1);modelCamera.aspect=aspect
    modelCamera.position.z=height>width?15.2:9.8
    modelCamera.updateProjectionMatrix()
    const place=(entry,bounds,{preserveAspect=true}={})=>{
      entry.bounds=bounds
      let drawWidth=bounds.right-bounds.left,drawHeight=bounds.bottom-bounds.top
      if(preserveAspect){
        const sourceAspect=entry.mesh.material.map.image.width/entry.mesh.material.map.image.height,targetAspect=drawWidth/drawHeight
        if(targetAspect>sourceAspect)drawWidth=drawHeight*sourceAspect
        else drawHeight=drawWidth/sourceAspect
      }
      const cx=(bounds.left+bounds.right)/2,cy=(bounds.top+bounds.bottom)/2
      entry.mesh.position.set((cx/width*2-1)*aspect,1-cy/height*2,0)
      entry.mesh.scale.set(drawWidth/width*2*aspect,drawHeight/height*2,1)
    }
    const portrait=height>width,margin=14,gap=10
    title.mesh.visible=!portrait
    if(!portrait)place(title,{left:22,right:190,top:16,bottom:74})
    place(instruction,portrait
      ?{left:12,right:width-116,top:18,bottom:74}
      :{left:Math.max(210,width/2-245),right:Math.min(width-210,width/2+245),top:14,bottom:80})
    place(buttons.exit,portrait
      ?{left:width-108,right:width-12,top:18,bottom:66}
      :{left:width-150,right:width-22,top:18,bottom:70})
    place(status,{left:Math.max(12,(width-Math.min(width-24,700))/2),right:Math.min(width-12,(width+Math.min(width-24,700))/2),top:portrait?82:84,bottom:portrait?126:128})
    const actionButtons=[buttons.undo,buttons.shuffle,buttons.restore]
    if(portrait) {
      const bw=(width-margin*2-gap*2)/3,bh=50,top=height-margin-bh
      actionButtons.forEach((button,index)=>place(button,{left:margin+index*(bw+gap),right:margin+index*(bw+gap)+bw,top,bottom:top+bh}))
    } else {
      const total=Math.min(width-40,540),bw=(total-gap*2)/3,bh=54,left=(width-total)/2,top=height-72
      actionButtons.forEach((button,index)=>place(button,{left:left+index*(bw+gap),right:left+index*(bw+gap)+bw,top,bottom:top+bh}))
    }
  }
  const snapshot=()=>({
    status:active?'active':worldVisual?'ready':'loading',id:cubeId,classroom:cubeConfig.classroom,deskId:cubeConfig.deskId,
    placement:worldVisual?{position:worldVisual.group.position.toArray(),rotationY:worldVisual.group.rotation.y}:null,
    solved:isCubeSolved(state),history:history.length,lastMove:history.length?{...history.at(-1)}:null,
    turn:turn?{move:{...turn.move},angle:+turn.angle.toFixed(4)}:null,
    templates:9,templateDistribution:Object.fromEntries(Array.from({length:9},(_,index)=>[String(index+1).padStart(2,'0'),displayVisual?.records.filter(record=>record.variant===index).length??0])),
    transforms:{quarterTurns:[0,1,2,3],mirror:true,deterministic:true},textureUrl:config.textureUrl,
    rendering:{bodyDrawCalls:1,stickerDrawCalls:9,blackTexture:false,sharedStickerTexture:true},
    persistence:{namespace:STORAGE_NAMESPACE,...getUserDataStore().snapshot()},lastHitDiagnostics,
  })
  const dispose=()=>{
    exit();worldVisual?.dispose();displayVisual?.dispose()
    resources?.bodyGeometry.dispose();resources?.bodyMaterial.dispose();resources?.stickerMaterial.dispose()
    resources?.stickerGeometries.forEach(geometry=>geometry.dispose())
    for(const entry of [title,instruction,status,...Object.values(buttons)])entry.dispose()
    backdrop.geometry.dispose();backdrop.material.dispose()
  }
  resize()
  return {load,hit,interact,enter,exit,consumePostExitClick,pointerDown,pointerMove,pointerUp:endPointer,pointerCancel:endPointer,handleKey,probeGesture,suspend,pauseInput,resumeAfterPause,update,render,resize,snapshot,dispose,isActive:()=>active}
}

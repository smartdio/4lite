import * as THREE from 'three'
import {getUserDataStore} from '../state/user-data-store.js'

const TEXTURE_WIDTH=1050
const TEXTURE_HEIGHT=360
const LEGACY_STORAGE_KEY='4lite:blackboard-drawings:v1'
const DRAWING_NAMESPACE='blackboardDrawings'
const DRAWING_SCHEMA_VERSION=1
const CHALK_COLORS={
  white:'#e4e0d3',
  pink:'#d58b90',
  yellow:'#d7c071',
  blue:'#83b4c1',
  green:'#93b18a',
}

function pointFromEvent(event,canvas) {
  const rect=canvas.getBoundingClientRect()
  return [
    THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width,0,1),
    THREE.MathUtils.clamp((event.clientY-rect.top)/rect.height,0,1),
  ]
}

function drawStroke(context,stroke) {
  if(stroke.points.length<1)return
  const points=stroke.points.map(([x,y])=>[x*TEXTURE_WIDTH,y*TEXTURE_HEIGHT])
  context.save()
  if(stroke.tool==='eraser') {
    context.globalCompositeOperation='destination-out'
    context.strokeStyle='rgba(0,0,0,.92)'
    context.lineWidth=38
  } else {
    context.globalCompositeOperation='source-over'
    context.strokeStyle=CHALK_COLORS[stroke.color]??CHALK_COLORS.white
    context.globalAlpha=.58
    // 1050px 对应3.5m板宽；1.8px约为6mm粉笔线，避免回到三维场景后像粗油漆笔。
    context.lineWidth=1.8
    context.setLineDash([5.5,1.1,1.2,.8])
  }
  context.lineCap='round';context.lineJoin='round'
  context.beginPath();context.moveTo(...points[0])
  if(points.length===1)context.lineTo(points[0][0]+.01,points[0][1]+.01)
  else for(const point of points.slice(1))context.lineTo(...point)
  context.stroke()
  if(stroke.tool!=='eraser') {
    // 两条稀薄的错位边缘让线条保留粉末断续感，不做发光或纯白数字笔刷。
    context.setLineDash([])
    for(const [dx,dy,alpha,width] of [[.7,-.45,.18,.7],[-.6,.5,.12,.5]]) {
      context.globalAlpha=alpha;context.lineWidth=width
      context.beginPath();context.moveTo(points[0][0]+dx,points[0][1]+dy)
      for(const point of points.slice(1))context.lineTo(point[0]+dx,point[1]+dy)
      context.stroke()
    }
    // 沿笔划稳定散布少量粉末点；坐标本身作为种子，撤销后重绘不会闪烁。
    context.fillStyle=CHALK_COLORS[stroke.color]??CHALK_COLORS.white
    for(let index=1;index<points.length;index++) {
      const [ax,ay]=points[index-1],[bx,by]=points[index]
      const length=Math.hypot(bx-ax,by-ay),steps=Math.max(1,Math.floor(length/5))
      for(let step=0;step<steps;step++) {
        const seed=Math.sin((ax+bx)*12.9898+(ay+by)*78.233+index*37.719+step*11.13)*43758.5453
        const unit=seed-Math.floor(seed)
        if(unit<.28)continue
        const t=(step+unit)/steps
        const jitter=(unit-.5)*4.6
        context.globalAlpha=.10+unit*.13
        context.beginPath()
        context.arc(ax+(bx-ax)*t+jitter,ay+(by-ay)*t-jitter*.45,.35+unit*.65,0,Math.PI*2)
        context.fill()
      }
    }
  }
  context.restore()
}

function createDrawingState(board,root) {
  const canvas=document.createElement('canvas')
  canvas.width=TEXTURE_WIDTH;canvas.height=TEXTURE_HEIGHT
  canvas.className='blackboard-drawing-canvas'
  canvas.setAttribute('aria-label',`${board.classroom}教学黑板绘画区域`)
  const context=canvas.getContext('2d',{alpha:true})
  const texture=new THREE.CanvasTexture(canvas)
  texture.name=`${board.id}-player-chalk-layer`
  texture.colorSpace=THREE.SRGBColorSpace
  texture.generateMipmaps=false
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter
  const material=new THREE.MeshStandardMaterial({
    name:`${board.id}-player-chalk-material`,map:texture,transparent:true,
    alphaTest:.015,depthWrite:false,roughness:1,metalness:0,
  })
  const geometry=new THREE.PlaneGeometry(board.board.width,board.board.height)
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=`${board.id}-player-chalk-layer`
  mesh.position.fromArray(board.center)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(board.normal[0],0,board.normal[1]))
  mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false
  root.add(mesh)
  return {board,canvas,context,texture,mesh,strokes:[],clearedStrokes:null,currentStroke:null}
}

function sanitizeStroke(value) {
  if(!value||!Array.isArray(value.points))return null
  const tool=value.tool==='eraser'?'eraser':'chalk'
  const color=Object.hasOwn(CHALK_COLORS,value.color)?value.color:'white'
  const points=[]
  for(const point of value.points.slice(0,4000)) {
    if(!Array.isArray(point)||point.length<2||!Number.isFinite(point[0])||!Number.isFinite(point[1]))continue
    points.push([THREE.MathUtils.clamp(point[0],0,1),THREE.MathUtils.clamp(point[1],0,1)])
  }
  return points.length?{tool,color,points}:null
}

export function createBlackboardDrawing({root,camera,renderer,scene,boards,blockedSurfaces=[],maxDistance,isOccluder,onEnter,onExit,onEvent}) {
  const shell=document.createElement('section')
  shell.className='blackboard-drawing-ui'
  shell.setAttribute('aria-hidden','true')
  shell.innerHTML=`
    <div class="blackboard-drawing-heading">
      <strong>黑板绘画</strong><span>按住并拖动，在黑板上留下粉笔痕迹</span>
    </div>
    <div class="blackboard-drawing-surface"></div>
    <div class="blackboard-drawing-toolbar" role="toolbar" aria-label="黑板绘画工具">
      <div class="blackboard-drawing-colors" aria-label="粉笔颜色">
        ${Object.entries(CHALK_COLORS).map(([name,color],index)=>`<button type="button" class="chalk-color${index===0?' active':''}" data-color="${name}" aria-label="${name}粉笔" style="--chalk-color:${color}"></button>`).join('')}
      </div>
      <button type="button" data-tool="eraser">板擦</button>
      <button type="button" data-action="undo">撤销</button>
      <button type="button" data-action="clear">清空</button>
      <button type="button" class="blackboard-drawing-done" data-action="done">完成</button>
    </div>`
  document.body.append(shell)
  const surface=shell.querySelector('.blackboard-drawing-surface')
  const states=new Map()
  const boardsById=new Map(boards.map(board=>[board.id,board]))
  const drawingBlockers=blockedSurfaces.map(surface=>({
    ...surface,
    centerVector:new THREE.Vector3(...surface.center),
    normalVector:new THREE.Vector3(surface.normal[0],0,surface.normal[1]),
    tangentVector:new THREE.Vector3(surface.tangent[0],0,surface.tangent[1]),
  }))
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(),hitPoint=new THREE.Vector3()
  let active=null,tool='chalk',color='white',drawingPointerId=null
  let restoredBoards=0,migratedLegacy=false

  const rerender=state=>{
    state.context.clearRect(0,0,TEXTURE_WIDTH,TEXTURE_HEIGHT)
    for(const stroke of state.strokes)drawStroke(state.context,stroke)
    state.mesh.visible=state.strokes.length>0
    state.texture.needsUpdate=true
  }
  const stateFor=board=>{
    if(!states.has(board.id))states.set(board.id,createDrawingState(board,root))
    return states.get(board.id)
  }
  const sanitizeDrawingData=value=>{
    if(!value?.boards||typeof value.boards!=='object')return {boards:{}}
    const safeBoards={};let totalPoints=0
    for(const [id,strokes] of Object.entries(value.boards)) {
      if(!boardsById.has(id)||!Array.isArray(strokes))continue
      const safe=[]
      for(const candidate of strokes.slice(0,1000)) {
        const stroke=sanitizeStroke(candidate)
        if(!stroke)continue
        if(totalPoints+stroke.points.length>150000)break
        totalPoints+=stroke.points.length;safe.push(stroke)
      }
      if(safe.length)safeBoards[id]=safe
    }
    return {boards:safeBoards}
  }
  const userDataStore=getUserDataStore()
  const drawingStore=userDataStore.registerNamespace(DRAWING_NAMESPACE,{
    version:DRAWING_SCHEMA_VERSION,defaultValue:{boards:{}},validate:sanitizeDrawingData,
  })
  // 迁移功能上线前短暂使用过的黑板专用key；成功写入统一用户数据后才删除旧值。
  if(!userDataStore.snapshot().persistedNamespaces.includes(DRAWING_NAMESPACE))try {
    const legacy=localStorage.getItem(LEGACY_STORAGE_KEY)
    if(legacy) {
      const parsed=JSON.parse(legacy)
      if(parsed?.version===1&&drawingStore.set({boards:parsed.boards??{}})) {
        localStorage.removeItem(LEGACY_STORAGE_KEY);migratedLegacy=true
      }
    }
  } catch {}
  const persist=()=>{
    const savedBoards={}
    for(const state of states.values())if(state.strokes.length)savedBoards[state.board.id]=state.strokes.map(stroke=>({
      tool:stroke.tool,color:stroke.color,
      points:stroke.points.map(([x,y])=>[+x.toFixed(4),+y.toFixed(4)]),
    }))
    return Object.keys(savedBoards).length?drawingStore.set({boards:savedBoards}):drawingStore.clear()
  }
  const restore=()=>{
    const saved=drawingStore.get()
    for(const [id,strokes] of Object.entries(saved.boards)) {
      const board=boardsById.get(id)
      if(!board||!strokes.length)continue
      const state=stateFor(board);state.strokes=strokes;rerender(state);restoredBoards++
    }
  }
  const selectTool=(nextTool,nextColor=color)=>{
    tool=nextTool;color=nextColor
    shell.classList.toggle('using-eraser',tool==='eraser')
    for(const button of shell.querySelectorAll('.chalk-color'))button.classList.toggle('active',tool==='chalk'&&button.dataset.color===color)
    shell.querySelector('[data-tool="eraser"]').classList.toggle('active',tool==='eraser')
  }

  const hit=(clientX,clientY,useCenter=false,skipOcclusion=false)=>{
    const rect=renderer.domElement.getBoundingClientRect()
    const x=useCenter?rect.left+rect.width/2:clientX,y=useCenter?rect.top+rect.height/2:clientY
    pointer.set((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1)
    raycaster.setFromCamera(pointer,camera)
    // 门洞墙报是固定展示面。先用两个轻量矩形做整面拦截，避免斜角射线
    // 穿过墙报后误命中其后方或相邻教室的可写教学黑板。
    for(const blocker of drawingBlockers) {
      plane.setFromNormalAndCoplanarPoint(blocker.normalVector,blocker.centerVector)
      const frontDistance=plane.distanceToPoint(camera.position)
      if(frontDistance<=0||frontDistance>maxDistance)continue
      const point=raycaster.ray.intersectPlane(plane,hitPoint)
      if(!point)continue
      const delta=point.clone().sub(blocker.centerVector)
      if(Math.abs(delta.dot(blocker.tangentVector))>blocker.width/2||Math.abs(delta.y)>blocker.height/2)continue
      if(raycaster.ray.origin.distanceTo(point)<=maxDistance)return null
    }
    let closest=null
    for(const board of boards) {
      const normal=new THREE.Vector3(board.normal[0],0,board.normal[1])
      plane.setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(...board.center))
      const point=raycaster.ray.intersectPlane(plane,hitPoint)
      if(!point)continue
      const delta=point.clone().sub(new THREE.Vector3(...board.center))
      const tangent=new THREE.Vector3(board.tangent[0],0,board.tangent[1])
      const horizontal=delta.dot(tangent),vertical=delta.y
      if(Math.abs(horizontal)>board.board.width/2||Math.abs(vertical)>board.board.height/2)continue
      const distance=raycaster.ray.origin.distanceTo(point)
      if(distance>maxDistance||closest&&distance>=closest.distance)continue
      closest={board,distance,point:point.clone(),uv:[horizontal/board.board.width+.5,.5-vertical/board.board.height]}
    }
    if(!closest)return null
    if(skipOcclusion)return closest
    const blocker=raycaster.intersectObjects(scene.children,true).find(isOccluder)
    if(blocker&&blocker.distance+.025<closest.distance)return null
    return closest
  }

  const enter=board=>{
    if(active)return false
    if(onEnter?.(board)===false)return false
    active=stateFor(board);surface.append(active.canvas)
    shell.setAttribute('aria-hidden','false');document.body.classList.add('blackboard-drawing-mode')
    selectTool('chalk',color)
    return true
  }
  const exit=()=>{
    if(!active)return false
    if(drawingPointerId!=null&&active.canvas.hasPointerCapture?.(drawingPointerId))active.canvas.releasePointerCapture(drawingPointerId)
    drawingPointerId=null;active.currentStroke=null;persist()
    const board=active.board
    active.canvas.remove();active=null
    shell.setAttribute('aria-hidden','true');document.body.classList.remove('blackboard-drawing-mode')
    onExit?.(board)
    return true
  }

  surface.addEventListener('pointerdown',event=>{
    if(!active||drawingPointerId!=null)return
    drawingPointerId=event.pointerId;active.canvas.setPointerCapture?.(event.pointerId)
    active.clearedStrokes=null
    active.currentStroke={tool,color,points:[pointFromEvent(event,active.canvas)]}
    active.strokes.push(active.currentStroke);rerender(active)
    onEvent?.({type:'stroke-start',tool,color})
    event.preventDefault()
  })
  surface.addEventListener('pointermove',event=>{
    if(!active||event.pointerId!==drawingPointerId||!active.currentStroke)return
    const events=event.getCoalescedEvents?.()??[event]
    for(const sample of events) {
      const point=pointFromEvent(sample,active.canvas)
      const previous=active.currentStroke.points.at(-1)
      if(Math.hypot((point[0]-previous[0])*TEXTURE_WIDTH,(point[1]-previous[1])*TEXTURE_HEIGHT)>=.8)active.currentStroke.points.push(point)
    }
    rerender(active);onEvent?.({type:'stroke-move',tool:active.currentStroke.tool,color:active.currentStroke.color});event.preventDefault()
  })
  const finishStroke=event=>{
    if(!active||event.pointerId!==drawingPointerId)return
    if(active.canvas.hasPointerCapture?.(event.pointerId))active.canvas.releasePointerCapture(event.pointerId)
    drawingPointerId=null;active.currentStroke=null;persist();event.preventDefault()
  }
  surface.addEventListener('pointerup',finishStroke)
  surface.addEventListener('pointercancel',finishStroke)
  shell.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return
    if(button.dataset.color){selectTool('chalk',button.dataset.color);onEvent?.({type:'tool',tool:'chalk',color:button.dataset.color})}
    else if(button.dataset.tool==='eraser'){selectTool('eraser');onEvent?.({type:'tool',tool:'eraser'})}
    else if(button.dataset.action==='undo'&&active) {
      if(active.strokes.length)active.strokes.pop()
      else if(active.clearedStrokes){active.strokes=active.clearedStrokes;active.clearedStrokes=null}
      rerender(active);persist();onEvent?.({type:'undo'})
    } else if(button.dataset.action==='clear'&&active) {
      active.clearedStrokes=active.strokes;active.strokes=[];rerender(active);persist();onEvent?.({type:'clear'})
    } else if(button.dataset.action==='done'){onEvent?.({type:'done'});exit()}
    event.preventDefault();event.stopPropagation()
  })
  restore()

  return {
    hit,enter,exit,
    isActive:()=>Boolean(active),
    snapshot:()=>({
      policy:{maxDistance,requiresClearLineOfSight:true},targets:boards.length,blockedTargets:drawingBlockers.length,active:active?.board.id??null,
      textureSize:[TEXTURE_WIDTH,TEXTURE_HEIGHT],tool,color,
      persistence:{
        ...userDataStore.snapshot(),namespace:DRAWING_NAMESPACE,namespaceVersion:DRAWING_SCHEMA_VERSION,
        restoredBoards,migratedLegacy,
      },
      drawings:[...states.values()].map(state=>({id:state.board.id,strokes:state.strokes.length,visible:state.mesh.visible})),
    }),
  }
}

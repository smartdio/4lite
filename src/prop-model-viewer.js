import * as THREE from 'three'
import {createViewerCloseControl} from './ui/viewer-close-control.js'
import {isEnglish,translateRuntimeText} from './i18n/index.js'

function createHint(renderer) {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128
  const context=canvas.getContext('2d')
  const texture=new THREE.CanvasTexture(canvas)
  texture.colorSpace=THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  const draw=(title,actionLabel='点击互动')=>{
    context.clearRect(0,0,canvas.width,canvas.height)
    context.textAlign='center';context.textBaseline='middle'
    context.lineJoin='round';context.lineWidth=10;context.strokeStyle='rgba(28,23,18,.92)'
    context.fillStyle='#f3ead2'
    const text=isEnglish
      ?`${translateRuntimeText(title)} · Drag to rotate / Scroll to zoom / ${translateRuntimeText(actionLabel)} / X to close`
      :`${title}　·　拖动旋转 / 滚轮缩放 / ${actionLabel} / X 关闭`
    let fontSize=48
    do {
      context.font=`700 ${fontSize}px system-ui, "PingFang SC", sans-serif`
      fontSize-=2
    } while(fontSize>=30&&context.measureText(text).width>canvas.width-44)
    context.strokeText(text,canvas.width/2,canvas.height/2)
    context.fillText(text,canvas.width/2,canvas.height/2)
    texture.needsUpdate=true
  }
  draw('校园小物')
  return {texture,draw}
}

export function createPropModelViewer({renderer}) {
  const overlayScene=new THREE.Scene();overlayScene.name='prop-model-viewer-overlay'
  const overlayCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,10);overlayCamera.position.z=1
  const backdrop=new THREE.Mesh(
    new THREE.PlaneGeometry(2,2),
    new THREE.MeshBasicMaterial({name:'prop-viewer-backdrop',color:0x15130f,transparent:true,opacity:.84,depthTest:false,depthWrite:false}),
  )
  backdrop.name='prop-viewer-backdrop';backdrop.renderOrder=0;overlayScene.add(backdrop)
  const hintState=createHint(renderer)
  const hint=new THREE.Mesh(
    new THREE.PlaneGeometry(1,1),
    new THREE.MeshBasicMaterial({name:'prop-viewer-hint',map:hintState.texture,transparent:true,depthTest:false,depthWrite:false}),
  )
  hint.name='prop-viewer-hint';hint.position.z=.1;hint.renderOrder=1;overlayScene.add(hint)
  const closeControl=createViewerCloseControl({renderer,scene:overlayScene,name:'prop-viewer-close',renderOrder:3})

  const modelScene=new THREE.Scene();modelScene.name='prop-model-viewer-scene'
  const camera=new THREE.PerspectiveCamera(32,1,.01,20);camera.position.set(0,.02,3.2);camera.lookAt(0,0,0)
  // The main renderer already uses a bright outdoor exposure. Keep the
  // isolated prop rig restrained so coated tin retains moving highlights
  // without turning pale paint into an emissive-looking neon surface.
  modelScene.add(new THREE.HemisphereLight(0xfff2d6,0x372317,.72))
  const key=new THREE.DirectionalLight(0xfff0dc,1.28);key.position.set(-2.2,3.2,4);modelScene.add(key)
  const fill=new THREE.DirectionalLight(0xb9d9ff,.38);fill.position.set(3,-.5,2);modelScene.add(fill)
  const displayRoot=new THREE.Group();displayRoot.name='prop-viewer-display-root';modelScene.add(displayRoot)

  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster()
  let active=null,model=null,rotationY=0,spinSpeed=.34,baseScale=1,zoom=1
  let drag=null,clickCandidate=false,suppressCloseClick=false,manualUntil=0,lidTween=null
  const resize=()=>{
    const width=Math.max(1,renderer.domElement.clientWidth),height=Math.max(1,renderer.domElement.clientHeight),aspect=width/height
    overlayCamera.left=-aspect;overlayCamera.right=aspect;overlayCamera.top=1;overlayCamera.bottom=-1;overlayCamera.updateProjectionMatrix()
    backdrop.scale.set(aspect,1,1)
    const hintWidth=Math.min(1.82,aspect*1.86)
    hint.scale.set(hintWidth,hintWidth/8,1);hint.position.set(0,-.82,.1)
    closeControl.layout(overlayCamera)
    camera.aspect=aspect;camera.updateProjectionMatrix()
  }
  const close=()=>{
    if(model)displayRoot.remove(model)
    model=null;active=null;drag=null;clickCandidate=false;suppressCloseClick=false;lidTween=null
    closeControl.setVisible(false)
  }
  const open=(source,item,options={})=>{
    if(!source||!item)return false
    close()
    model=source.clone(true)
    model.name=`prop-viewer-${item.id}`
    model.position.set(0,0,0);model.quaternion.identity();model.scale.set(1,1,1)
    model.updateMatrixWorld(true)
    const bounds=new THREE.Box3().setFromObject(model)
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3())
    model.position.sub(center)
    const targetSize=options.targetSize??1.36,scale=targetSize/Math.max(size.x,size.y,size.z)
    baseScale=scale;zoom=1;displayRoot.scale.setScalar(baseScale)
    rotationY=options.initialRotationY??Math.PI-.10
    spinSpeed=options.spinSpeed??.34
    displayRoot.rotation.set(options.pitch??-.08,rotationY,options.roll??0)
    displayRoot.add(model)
    const title=options.title??item.label??'校园小物'
    const action=options.action??null
    const actionLabel=options.actionLabel??(action==='toggle-lid'?'点击开合':action==='flip'?'点击翻面':'点击互动')
    hintState.draw(title,actionLabel)
    active={
      id:item.id,kind:options.kind??item.kind??'prop',title,classroom:item.classroom,
      sourceSize:size.toArray(),displayScale:scale,pitch:displayRoot.rotation.x,action,
    }
    closeControl.setVisible(true)
    resize();return true
  }
  const normalizedPointer=event=>{
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1)
    return pointer
  }
  const hitModel=event=>{
    if(!active||!model)return false
    raycaster.setFromCamera(normalizedPointer(event),camera)
    return raycaster.intersectObject(model,true).length>0
  }
  const pointerDown=event=>{
    if(!active||event.button!==0)return false
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false}
    clickCandidate=false;suppressCloseClick=false;event.currentTarget?.setPointerCapture?.(event.pointerId)
    manualUntil=performance.now()+1800
    return true
  }
  const pointerMove=event=>{
    if(!active||!drag||drag.id!==event.pointerId)return false
    const clientDx=event.clientX-drag.x,clientDy=event.clientY-drag.y
    const dx=clientDx||event.movementX||0,dy=clientDy||event.movementY||0
    if(Math.abs(dx)+Math.abs(dy)>1)drag.moved=true
    rotationY=(rotationY+dx*.008)%(Math.PI*2)
    displayRoot.rotation.y=rotationY
    displayRoot.rotation.x=THREE.MathUtils.clamp(displayRoot.rotation.x+dy*.006,-1.15,1.15)
    active.pitch=displayRoot.rotation.x
    drag.x=event.clientX;drag.y=event.clientY
    manualUntil=performance.now()+1800
    return true
  }
  const pointerUp=event=>{
    if(!active||!drag||drag.id!==event.pointerId)return false
    clickCandidate=!drag.moved;suppressCloseClick=drag.moved
    event.currentTarget?.releasePointerCapture?.(event.pointerId)
    drag=null;manualUntil=performance.now()+1800
    return true
  }
  const wheel=event=>{
    if(!active)return false
    zoom=THREE.MathUtils.clamp(zoom*Math.exp(-event.deltaY*.001),.68,1.75)
    displayRoot.scale.setScalar(baseScale*zoom)
    active.displayScale=baseScale*zoom
    manualUntil=performance.now()+1800
    return true
  }
  const activateModel=()=>{
    if(!active||!model)return false
    if(active.action==='toggle-lid') {
      const lid=model.getObjectByName('PencilBoxLidPivot')
      if(!lid)return false
      const closed=Math.abs(lid.rotation.x)<THREE.MathUtils.degToRad(20)
      lidTween={lid,from:lid.rotation.x,to:closed?-THREE.MathUtils.degToRad(110):0,elapsed:0,duration:.34}
      return true
    }
    if(active.action==='flip') {
      rotationY=(rotationY+Math.PI)%(Math.PI*2);displayRoot.rotation.y=rotationY
      manualUntil=performance.now()+1800
      return true
    }
    return false
  }
  const consumeClick=event=>{
    if(!active)return null
    if(suppressCloseClick){suppressCloseClick=false;clickCandidate=false;return 'consume'}
    if(clickCandidate&&closeControl.hit(event.clientX,event.clientY)){clickCandidate=false;return 'close'}
    const shouldActivate=clickCandidate&&hitModel(event)
    clickCandidate=false
    if(shouldActivate){activateModel();return 'activate'}
    return 'consume'
  }
  const update=dt=>{
    if(!active)return
    if(lidTween) {
      lidTween.elapsed+=dt
      const t=THREE.MathUtils.smoothstep(Math.min(1,lidTween.elapsed/lidTween.duration),0,1)
      lidTween.lid.rotation.x=THREE.MathUtils.lerp(lidTween.from,lidTween.to,t)
      if(t>=1)lidTween=null
    }
    if(performance.now()>=manualUntil&&!drag) {
      rotationY=(rotationY+Math.min(.05,dt)*spinSpeed)%(Math.PI*2)
      displayRoot.rotation.y=rotationY
    }
  }
  const render=()=>{
    if(!active)return
    const previousAutoClear=renderer.autoClear
    renderer.autoClear=false
    renderer.clearDepth();renderer.render(overlayScene,overlayCamera)
    renderer.clearDepth();renderer.render(modelScene,camera)
    renderer.autoClear=previousAutoClear
  }
  const snapshot=()=>({
    active:active?.id??null,kind:active?.kind??null,title:active?.title??null,classroom:active?.classroom??null,
    rotationY:+rotationY.toFixed(4),pitch:active?+active.pitch.toFixed(4):null,
    displayScale:active?+active.displayScale.toFixed(4):null,
    sourceSize:active?.sourceSize.map(value=>+value.toFixed(5))??null,
    action:active?.action??null,zoom:active?+zoom.toFixed(4):null,
    closeBounds:closeControl.snapshot().bounds,
    lidAngleDegrees:active&&model?.getObjectByName('PencilBoxLidPivot')
      ?+Math.abs(THREE.MathUtils.radToDeg(model.getObjectByName('PencilBoxLidPivot').rotation.x)).toFixed(2):null,
    sharedModel:Boolean(active),extraModelRequests:0,
  })
  const dispose=()=>{
    close();backdrop.geometry.dispose();backdrop.material.dispose()
    hint.geometry.dispose();hint.material.dispose();hintState.texture.dispose()
    closeControl.dispose()
  }
  resize()
  return {
    open,close,update,render,resize,isOpen:()=>Boolean(active),snapshot,dispose,
    pointerDown,pointerMove,pointerUp,wheel,consumeClick,
  }
}

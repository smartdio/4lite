import * as THREE from 'three'

const QR_SOURCE_SIZE=Object.freeze([722,960])

const createFlatMaterial=(color,options={})=>new THREE.MeshBasicMaterial({
  color,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false,...options,
})

export function createSiteQrOverlay({renderer,assetLoader,imageUrl,sourceImage=null,label='视频号 Mo麥AI'}) {
  const scene=new THREE.Scene()
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,10)
  camera.position.z=1
  const root=new THREE.Group()
  root.name='site-qr-overlay'
  root.visible=false
  scene.add(root)

  const unitPlane=new THREE.PlaneGeometry(1,1)
  const backdrop=new THREE.Mesh(unitPlane,createFlatMaterial(0x10100e,{transparent:true,opacity:.68}))
  backdrop.name='site-qr-backdrop'
  backdrop.renderOrder=0
  backdrop.scale.set(2,2,1)
  root.add(backdrop)

  const shadow=new THREE.Mesh(unitPlane,createFlatMaterial(0x000000,{transparent:true,opacity:.34}))
  shadow.name='site-qr-card-shadow'
  shadow.renderOrder=1
  shadow.position.z=.01
  root.add(shadow)

  const frame=new THREE.Mesh(unitPlane,createFlatMaterial(0xeadfc9))
  frame.name='site-qr-card-frame'
  frame.renderOrder=2
  frame.position.z=.02
  root.add(frame)

  const qrMaterial=createFlatMaterial(0xffffff)
  const qrImage=new THREE.Mesh(unitPlane,qrMaterial)
  qrImage.name='site-qr-image'
  qrImage.renderOrder=3
  qrImage.position.z=.03
  root.add(qrImage)

  const closeButton=new THREE.Group()
  closeButton.name='site-qr-close'
  closeButton.position.z=.05
  const closeDisc=new THREE.Mesh(new THREE.CircleGeometry(1,32),createFlatMaterial(0x282622,{transparent:true,opacity:.92}))
  closeDisc.renderOrder=4
  closeButton.add(closeDisc)
  for(const rotation of [Math.PI/4,-Math.PI/4]) {
    const stroke=new THREE.Mesh(unitPlane,createFlatMaterial(0xf8f2e7))
    stroke.renderOrder=5
    stroke.scale.set(1.05,.13,1)
    stroke.rotation.z=rotation
    stroke.position.z=.01
    closeButton.add(stroke)
  }
  root.add(closeButton)

  let loaded=false
  let open=false
  let texture=null
  let cardBounds=null
  let closeBounds=null

  const resize=()=>{
    const rect=renderer.domElement.getBoundingClientRect()
    const viewportWidth=Math.max(1,rect.width)
    const viewportHeight=Math.max(1,rect.height)
    const [sourceWidth,sourceHeight]=QR_SOURCE_SIZE
    const scale=Math.min(viewportWidth*.78/sourceWidth,viewportHeight*.82/sourceHeight)
    const imageWidth=sourceWidth*scale
    const imageHeight=sourceHeight*scale
    const border=Math.max(8,Math.min(15,Math.min(viewportWidth,viewportHeight)*.016))
    const frameWidth=imageWidth+border*2
    const frameHeight=imageHeight+border*2
    const toNdcX=pixels=>pixels*2/viewportWidth
    const toNdcY=pixels=>pixels*2/viewportHeight

    qrImage.scale.set(toNdcX(imageWidth),toNdcY(imageHeight),1)
    frame.scale.set(toNdcX(frameWidth),toNdcY(frameHeight),1)
    shadow.scale.set(toNdcX(frameWidth+10),toNdcY(frameHeight+10),1)
    shadow.position.set(toNdcX(7),-toNdcY(9),.01)

    const closeRadius=Math.max(17,Math.min(24,Math.min(viewportWidth,viewportHeight)*.026))
    const closeX=Math.min(viewportWidth/2-10,frameWidth/2+closeRadius*.34)
    const closeY=Math.min(viewportHeight/2-10,frameHeight/2+closeRadius*.34)
    closeButton.scale.set(toNdcX(closeRadius),toNdcY(closeRadius),1)
    closeButton.position.set(toNdcX(closeX),toNdcY(closeY),.05)

    cardBounds={
      left:rect.left+(viewportWidth-frameWidth)/2,
      right:rect.left+(viewportWidth+frameWidth)/2,
      top:rect.top+(viewportHeight-frameHeight)/2,
      bottom:rect.top+(viewportHeight+frameHeight)/2,
    }
    const closeCenterX=rect.left+viewportWidth/2+closeX
    const closeCenterY=rect.top+viewportHeight/2-closeY
    closeBounds={
      left:closeCenterX-closeRadius,right:closeCenterX+closeRadius,
      top:closeCenterY-closeRadius,bottom:closeCenterY+closeRadius,
    }
  }

  const load=async()=>{
    if(loaded)return snapshot()
    if(sourceImage) {
      await sourceImage.decode()
      texture=new THREE.Texture(sourceImage)
    } else texture=await assetLoader.loadTexture(imageUrl)
    texture.name='site-qr-wechat-channels-mo-mai-ai'
    texture.colorSpace=THREE.SRGBColorSpace
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
    texture.minFilter=THREE.LinearMipmapLinearFilter
    texture.magFilter=THREE.LinearFilter
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
    texture.needsUpdate=true
    qrMaterial.map=texture
    qrMaterial.needsUpdate=true
    loaded=true
    resize()
    return snapshot()
  }

  const show=()=>{
    open=true
    root.visible=true
    resize()
    return true
  }
  const hide=()=>{
    if(!open)return false
    open=false
    root.visible=false
    return true
  }
  const hitAction=(clientX,clientY)=>{
    if(!open)return null
    if(closeBounds&&clientX>=closeBounds.left&&clientX<=closeBounds.right&&clientY>=closeBounds.top&&clientY<=closeBounds.bottom)return 'close'
    if(cardBounds&&clientX>=cardBounds.left&&clientX<=cardBounds.right&&clientY>=cardBounds.top&&clientY<=cardBounds.bottom)return 'inside'
    return 'close'
  }
  const render=()=>{
    if(!open)return false
    const previousAutoClear=renderer.autoClear
    renderer.autoClear=false
    renderer.clearDepth()
    renderer.render(scene,camera)
    renderer.autoClear=previousAutoClear
    return true
  }
  const snapshot=()=>({
    open,loaded,label,imageUrl,sourceSize:[...QR_SOURCE_SIZE],
    cardBounds:cardBounds?{...cardBounds}:null,
    closeBounds:closeBounds?{...closeBounds}:null,
  })

  resize()
  return {load,show,hide,isOpen:()=>open,hitAction,render,resize,snapshot}
}

import * as THREE from 'three'
import {createViewerCloseControl} from './ui/viewer-close-control.js'

const BASE='/assets/textures/document-viewer-runtime'

export function createDocumentViewer({renderer,documentIds,packedDocuments=[]}) {
  const scene=new THREE.Scene();scene.name='document-viewer-scene'
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,10);camera.position.z=1
  const backdrop=new THREE.Mesh(
    new THREE.PlaneGeometry(2,2),
    new THREE.MeshBasicMaterial({name:'document-viewer-backdrop',color:0x15130f,transparent:true,opacity:.78,depthTest:false,depthWrite:false}),
  )
  backdrop.name='document-viewer-backdrop';backdrop.visible=false;backdrop.renderOrder=0;scene.add(backdrop)
  // 与遮罩同属透明队列并显式排在其后，避免遮罩最后混合而把纸面整体压暗。
  const pageMaterial=new THREE.MeshBasicMaterial({
    name:'document-viewer-page',color:0xffffff,transparent:true,opacity:1,depthTest:false,depthWrite:false,
  })
  const page=new THREE.Mesh(new THREE.PlaneGeometry(1,1),pageMaterial)
  page.name='document-viewer-page';page.visible=false;page.position.z=.1;page.renderOrder=1;scene.add(page)
  const closeControl=createViewerCloseControl({renderer,scene,name:'document-viewer-close',renderOrder:3})
  const blobs=new Map()
  let active=null,opening=false,loadPromise=null,openToken=0

  const loadPackedDocuments=async pack=>{
    const response=await fetch(pack.url)
    if(!response.ok)throw new Error(`查看图片包加载失败：${pack.url}`)
    const buffer=await response.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer)
    const magic=new TextDecoder().decode(bytes.subarray(0,8))
    if(magic!=='CBPK0001')throw new Error(`查看图片包格式错误：${pack.url}`)
    const count=view.getUint32(8,true)
    if(count!==pack.ids.length)throw new Error(`查看图片包数量错误：${count}/${pack.ids.length}`)
    let dataOffset=12+count*4
    for(let index=0;index<count;index++) {
      const length=view.getUint32(12+index*4,true)
      blobs.set(pack.ids[index],new Blob([buffer.slice(dataOffset,dataOffset+length)],{type:'image/webp'}))
      dataOffset+=length
    }
    if(dataOffset!==buffer.byteLength)throw new Error(`查看图片包长度错误：${pack.url}`)
  }

  const layout=()=>{
    const viewportAspect=Math.max(.1,renderer.domElement.clientWidth/Math.max(1,renderer.domElement.clientHeight))
    if(active){
      const imageAspect=active.width/active.height
      // 正交相机从 -1 到 1，完整屏高是2；给右上关闭按钮保留安全区。
      const maxHeight=1.84,maxWidth=1.82*viewportAspect
      const height=Math.min(maxHeight,maxWidth/imageAspect)
      page.scale.set(height*imageAspect/viewportAspect,height,1)
    }
    closeControl.layout(camera)
  }
  const load=()=>{
    if(loadPromise)return loadPromise
    const packedIds=new Set(packedDocuments.flatMap(pack=>pack.ids))
    loadPromise=Promise.all([
      ...documentIds.filter(id=>!packedIds.has(id)).map(async id=>{
        const response=await fetch(`${BASE}/${id}.webp`)
        if(!response.ok)throw new Error(`查看图片加载失败：${id}`)
        blobs.set(id,await response.blob())
      }),
      ...packedDocuments.map(loadPackedDocuments),
    ]).then(()=>true)
    return loadPromise
  }
  const close=()=>{
    openToken++;opening=false
    if(active?.texture){pageMaterial.map=null;active.texture.dispose()}
    active?.bitmap?.close?.();active=null
    page.visible=false;backdrop.visible=false
    closeControl.setVisible(false)
  }
  const open=async item=>{
    if(!item||!blobs.has(item.id))return false
    close();const token=++openToken;opening=true
    backdrop.visible=true;closeControl.setVisible(true);layout()
    // ImageBitmap 上传纹理时 WebGL 的 UNPACK_FLIP_Y 不生效，因此在解码阶段翻转。
    const bitmap=await createImageBitmap(blobs.get(item.id),{imageOrientation:'flipY'})
    if(token!==openToken){bitmap.close?.();return false}
    const texture=new THREE.Texture(bitmap)
    texture.colorSpace=THREE.SRGBColorSpace
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
    texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter
    texture.generateMipmaps=false;texture.needsUpdate=true
    active={...item,bitmap,texture,width:bitmap.width,height:bitmap.height};opening=false
    pageMaterial.map=texture;pageMaterial.needsUpdate=true
    backdrop.visible=page.visible=true;layout();return true
  }
  const render=()=>{
    if(!active&&!opening)return
    const previousAutoClear=renderer.autoClear
    renderer.autoClear=false;renderer.clearDepth();renderer.render(scene,camera);renderer.autoClear=previousAutoClear
  }
  const snapshot=()=>({
    loaded:blobs.size===documentIds.length,preloadedBlobs:blobs.size,active:active?.id??null,
    activeKind:active?.kind??null,opening,decodedTextures:active?1:0,
    closeBounds:closeControl.snapshot().bounds,
  })
  const clickAction=event=>closeControl.hit(event.clientX,event.clientY)?'close':'consume'
  return {load,open,close,render,resize:layout,isOpen:()=>Boolean(active||opening),clickAction,snapshot}
}

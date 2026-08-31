import * as THREE from 'three'

const OUTLINE=0x302c25
const PAPER=0xfff6d9

export function createViewerCloseControl({renderer,scene,name='viewer-close',renderOrder=8}) {
  const root=new THREE.Group();root.name=name;root.visible=false;root.position.z=.4
  const flatMaterial=color=>new THREE.MeshBasicMaterial({
    name:`${name}-${color===OUTLINE?'outline':'paper'}-material`,color,
    transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false,
  })
  const outlineMaterial=flatMaterial(OUTLINE),paperMaterial=flatMaterial(PAPER)
  const outer=new THREE.Mesh(new THREE.CircleGeometry(.5,40),outlineMaterial)
  const fill=new THREE.Mesh(new THREE.CircleGeometry(.42,40),paperMaterial);fill.position.z=.001
  const strokeGeometry=new THREE.PlaneGeometry(.095,.54)
  const strokeA=new THREE.Mesh(strokeGeometry,outlineMaterial),strokeB=new THREE.Mesh(strokeGeometry,outlineMaterial)
  strokeA.rotation.z=Math.PI/4;strokeB.rotation.z=-Math.PI/4;strokeA.position.z=strokeB.position.z=.002
  for(const object of [outer,fill,strokeA,strokeB]){object.name=`${name}-${object===outer?'outer':object===fill?'fill':'stroke'}`;object.renderOrder=renderOrder}
  root.add(outer,fill,strokeA,strokeB);scene.add(root)

  let bounds=null
  const layout=camera=>{
    const rect=renderer.domElement.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height)
    const viewWidth=camera.right-camera.left,viewHeight=camera.top-camera.bottom
    const visualPx=Math.min(40,Math.max(34,Math.min(width,height)*.045)),hitPx=Math.max(48,visualPx+12),margin=18
    const centerX=rect.right-margin-visualPx/2,centerY=rect.top+margin+visualPx/2
    root.position.x=camera.left+(centerX-rect.left)/width*viewWidth
    root.position.y=camera.top-(centerY-rect.top)/height*viewHeight
    root.scale.set(visualPx/width*viewWidth,visualPx/height*viewHeight,1)
    bounds={left:centerX-hitPx/2,right:centerX+hitPx/2,top:centerY-hitPx/2,bottom:centerY+hitPx/2}
    return bounds
  }
  const hit=(clientX,clientY)=>Boolean(root.visible&&bounds&&clientX>=bounds.left&&clientX<=bounds.right&&clientY>=bounds.top&&clientY<=bounds.bottom)
  const setVisible=value=>{root.visible=Boolean(value)}
  const snapshot=()=>({visible:root.visible,bounds:bounds?{...bounds}:null})
  const dispose=()=>{
    scene.remove(root);outer.geometry.dispose();fill.geometry.dispose();strokeGeometry.dispose();outlineMaterial.dispose();paperMaterial.dispose()
  }
  return {root,layout,hit,setVisible,snapshot,dispose}
}

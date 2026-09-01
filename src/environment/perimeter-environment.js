import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const PANORAMA_URL='/assets/environment/panorama-360-extended-v03-q78.webp?v=1'
const LOTUS_MAT_URL='/assets/environment/lotus-leaf-pond-mat-v03-dark-unmatted-1024-q82.webp?v=1'
const PERIMETER_TREE_URL='/assets/environment/perimeter-tree-atlas-v04-broadleaf-shrub-1024-q82.webp?v=1'
const FIRST_PERSON_SKY_COLOR=0x81ccf2

const flatMaterial=(name,color,options={})=>new THREE.MeshBasicMaterial({
  name,color,toneMapped:false,fog:false,...options,
})

const worldPositionShader=`
        vec4 fadeWorldPosition=vec4(transformed,1.0);
        #ifdef USE_BATCHING
          fadeWorldPosition=batchingMatrix*fadeWorldPosition;
        #endif
        #ifdef USE_INSTANCING
          fadeWorldPosition=instanceMatrix*fadeWorldPosition;
        #endif
        fadeWorldPosition=modelMatrix*fadeWorldPosition;`

const applyNorthDistanceFade=material=>{
  material.transparent=true
  material.depthWrite=false
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying float vNorthDistanceFade;')
      .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        ${worldPositionShader}
        vNorthDistanceFade=smoothstep(-120.0,-64.0,fadeWorldPosition.z);`)
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying float vNorthDistanceFade;')
      .replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
        diffuseColor.a*=vNorthDistanceFade;`)
  }
  material.customProgramCacheKey=()=>`${material.name}|north-distance-fade-v1`
  material.needsUpdate=true
  return material
}

const applyHorizonGroundFade=material=>{
  material.transparent=true
  material.depthWrite=false
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec2 vHorizonGroundWorldXZ;')
      .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        ${worldPositionShader}
        vHorizonGroundWorldXZ=fadeWorldPosition.xz;`)
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec2 vHorizonGroundWorldXZ;')
      .replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
        float horizonDistance=length(vHorizonGroundWorldXZ-vec2(-6.0,-35.0));
        diffuseColor.a*=1.0-smoothstep(80.0,168.0,horizonDistance);`)
  }
  material.customProgramCacheKey=()=>`${material.name}|radial-horizon-fade-v3-wide`
  material.needsUpdate=true
  return material
}

const applyPanoramaSkyFade=material=>{
  material.transparent=true
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying float vPanoramaSkyFade;')
      .replace('#include <uv_vertex>',`#include <uv_vertex>
        vPanoramaSkyFade=1.0-smoothstep(0.72,0.98,uv.y);`)
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying float vPanoramaSkyFade;')
      .replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
        diffuseColor.a*=vPanoramaSkyFade;`)
  }
  material.customProgramCacheKey=()=>`${material.name}|panorama-sky-fade-v1`
  material.needsUpdate=true
  return material
}

const mergedBoxes=(name,entries,material)=>{
  const geometries=entries.map(({size,position,rotationY=0})=>{
    const geometry=new THREE.BoxGeometry(...size)
    geometry.rotateY(rotationY)
    geometry.translate(...position)
    return geometry
  })
  const mesh=new THREE.Mesh(mergeGeometries(geometries,false),material)
  mesh.name=name
  mesh.castShadow=false
  mesh.receiveShadow=false
  return mesh
}

const mergedGableRoofs=(name,entries,material)=>{
  const geometries=entries.map(({size:[width,depth],position:[cx,baseY,cz],rise,rotationY=0})=>{
    const halfWidth=width/2,halfDepth=depth/2
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([
      -halfWidth,0,-halfDepth, halfWidth,0,-halfDepth,
      -halfWidth,0, halfDepth, halfWidth,0, halfDepth,
      -halfWidth,rise,0, halfWidth,rise,0,
    ],3))
    geometry.setIndex([
      0,1,5,0,5,4,
      4,5,3,4,3,2,
      0,4,2,
      1,3,5,
    ])
    geometry.computeVertexNormals()
    geometry.rotateY(rotationY)
    geometry.translate(cx,baseY,cz)
    return geometry
  })
  const mesh=new THREE.Mesh(mergeGeometries(geometries,false),material)
  mesh.name=name
  mesh.castShadow=false
  mesh.receiveShadow=false
  return mesh
}

const mergedTreeCards=(name,entries,material)=>{
  const columns=4,rows=2,uvInset=.004
  const geometries=entries.map(({position:[x,z],height,cell,rotationY=0,baseY=-.55})=>{
    const width=height*.92
    const geometry=new THREE.PlaneGeometry(width,height)
    const column=cell%columns,row=Math.floor(cell/columns)
    const u0=column/columns+uvInset,u1=(column+1)/columns-uvInset
    // Canvas图片第一行对应Three.js纹理的高V区。
    const v0=(rows-row-1)/rows+uvInset,v1=(rows-row)/rows-uvInset
    const uv=geometry.getAttribute('uv')
    for(let index=0;index<uv.count;index++)uv.setXY(index,u0+uv.getX(index)*(u1-u0),v0+uv.getY(index)*(v1-v0))
    geometry.translate(0,height/2+baseY,0)
    geometry.rotateY(rotationY)
    geometry.translate(x,0,z)
    return geometry
  })
  const mesh=new THREE.Mesh(mergeGeometries(geometries,false),material)
  mesh.name=name
  mesh.castShadow=false
  mesh.receiveShadow=false
  return mesh
}

const tiledPondOverlayGeometry=()=>{
  const geometries=[]
  let state=19820820
  const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296)
  // 二号教学楼北侧先铺一条主动重叠的高覆盖带。14×5个中心点使用小幅
  // 错位和旋转打散规则感，但间距小于贴片尺寸，保证近楼一带没有明显空隙。
  for(let row=0;row<5;row++)for(let column=0;column<14;column++) {
    const scale=.96+random()*.14
    const geometry=new THREE.PlaneGeometry(9*scale,4.5*scale)
    geometry.rotateZ((random()-.5)*.34)
    const worldX=-57+column*8+(random()-.5)*.7
    const worldZ=-61.8-row*3.55+(random()-.5)*.35
    geometry.translate(worldX,-worldZ,0)
    geometries.push(geometry)
  }
  // 余下贴片集中到更北侧，保持完全随机的位置、方向和尺度；与近楼密集带
  // 有数米交叠，避免两种密度之间出现横向断带。
  for(let index=0;index<150;index++) {
    const scale=.85+random()*.3
    const geometry=new THREE.PlaneGeometry(9*scale,4.5*scale)
    geometry.rotateZ(random()*Math.PI*2)
    const worldX=-6+(random()-.5)*100
    const worldZ=-91.5+(random()-.5)*39
    geometry.translate(worldX,-worldZ,0)
    geometries.push(geometry)
  }
  return mergeGeometries(geometries,false)
}

export function createPerimeterEnvironment({scene,assetLoader,atmosphereColor}) {
  const firstPersonRoot=new THREE.Group()
  firstPersonRoot.name='first-person-perimeter-environment'
  const aerialRoot=new THREE.Group()
  aerialRoot.name='aerial-sand-table-environment'
  scene.add(firstPersonRoot,aerialRoot)

  const panoramaMaterial=applyPanoramaSkyFade(flatMaterial('single-layer-360-panorama',0xffffff,{
    side:THREE.BackSide,depthTest:true,depthWrite:false,
  }))
  const panorama=new THREE.Mesh(new THREE.CylinderGeometry(120,120,90,64,1,true),panoramaMaterial)
  panorama.name='single-layer-360-panorama-cylinder'
  // 概念图的真实地平线靠近图片底边，而不是图片中线。首轮对齐后按
  // 实际画面再将整张图下压约4m，保留底边附近作为地平线基准。
  panorama.position.set(-6,28,-35)
  panorama.rotation.y=Math.PI/4
  panorama.frustumCulled=false
  panorama.renderOrder=-100
  firstPersonRoot.add(panorama)

  const horizonGroundMaterial=applyHorizonGroundFade(flatMaterial('deep-green-brown-horizon-ground',0x454936))
  const horizonGround=new THREE.Mesh(new THREE.PlaneGeometry(330,330),horizonGroundMaterial)
  horizonGround.name='first-person-below-horizon-ground'
  horizonGround.rotation.x=-Math.PI/2
  horizonGround.position.set(-6,-1.08,-35)
  horizonGround.receiveShadow=false
  firstPersonRoot.add(horizonGround)

  const lotusMaterial=applyNorthDistanceFade(flatMaterial('pond-wide-lotus-overlay',0xffffff,{
    transparent:true,alphaTest:.025,depthWrite:false,side:THREE.DoubleSide,
  }))
  const lotus=new THREE.Mesh(tiledPondOverlayGeometry(),lotusMaterial)
  lotus.name='north-pond-wide-lotus-overlay'
  lotus.rotation.x=-Math.PI/2
  lotus.position.y=-.975
  lotus.renderOrder=2
  firstPersonRoot.add(lotus)

  const roadMaterial=flatMaterial('perimeter-muted-road',0x99958b)
  firstPersonRoot.add(mergedBoxes('perimeter-roads',[
    {size:[98,.08,15],position:[-6,-.02,8]},
  ],roadMaterial))

  const perimeterGroundMaterial=flatMaterial('perimeter-muted-ground',0x555446)
  firstPersonRoot.add(mergedBoxes('east-perimeter-building-ground',[
    // 按东侧阶梯边界分段，从墙外铺到所有盒子楼／瓦房的东缘。
    {size:[15.25,.12,28.7],position:[40.375,-.08,-55.65]},
    {size:[16.15,.12,15.6],position:[39.925,-.08,-33.5]},
    {size:[20.85,.12,14.2],position:[37.575,-.08,-18.6]},
    {size:[25.75,.12,12],position:[35.125,-.08,-5.5]},
  ],perimeterGroundMaterial))

  const mutedBuilding=flatMaterial('perimeter-muted-buildings',0x817e72)
  const tiledBuilding=flatMaterial('perimeter-old-tiled-buildings',0x777268)
  const wallSideShop={
    // 独立小卖部位于马尾松南侧东西向围墙的南面，处在该墙与校外道路之间。
    // 除“墙后盒子房＋三角屋顶”为亲历确认外，尺寸、颜色和精确位置均为工作值。
    center:[24.55,-9.35],size:[4.8,3.7,4],wallFaceZ:-11.36,roadNorthZ:.5,
    roof:{size:[5.4,4.6],geometrySize:[5.4,4.6],baseY:3.7,rise:1.6,rotationY:0},confidence:'A/C',
  }
  firstPersonRoot.add(mergedBoxes('perimeter-box-buildings',[
    {size:[11,9,7],position:[40.5,4.5,-48]},
    {size:[10,9,7],position:[40,4.5,-62]},
    // 北立面保持不动，向南加深至道路北缘（Z≈0.5）。
    {size:[14.4,9,18.5],position:[-41,4.5,-8.75]},
    {size:[11,8,7],position:[-4.5,4,19.5]},
    {size:[12,5.5,7],position:[29,2.75,19.5]},
    {size:[13,7,7],position:[53.5,3.5,19.5]},
  ],mutedBuilding))
  firstPersonRoot.add(mergedBoxes('perimeter-old-town-buildings',[
    // 东侧瓦房随阶梯围墙逐段西收；按整栋进深覆盖到的最外墙线留0.5m净距。
    {size:[8,3.8,5],position:[28.74,1.9,-4.5]},
    {size:[7.5,4.6,5],position:[33.39,2.3,-10]},
    {size:[8.5,3.4,5],position:[33.89,1.7,-15.5]},
    {size:[7,5.2,5],position:[33.14,2.6,-21]},
    {size:[9,3.9,5],position:[38.84,1.95,-26.5]},
    {size:[7.5,5.5,5],position:[38.09,2.75,-32]},
    {size:[9.5,4.3,5],position:[39.09,2.15,-37.5]},
    {size:[7.5,3.5,5],position:[38.99,1.75,-43]},
    {size:[10,3.2,6],position:[-50,1.6,-37]},
    {size:[9,3.2,6],position:[-50,1.6,-47]},
    // 从既有西侧瓦房向南续排到道路边；略向西错开，避开西南大楼。
    {size:[10,3.8,8.625],position:[-53.5,1.9,-29.6875]},
    {size:[11,4.8,8.625],position:[-54,2.4,-21.0625]},
    {size:[9,3.5,8.625],position:[-53,1.75,-12.4375]},
    {size:[10,4.3,8.625],position:[-53.5,2.15,-3.8125]},
    {size:[12,4.2,6],position:[-39,2.1,19]},
    {size:[12,5.5,6],position:[-27,2.75,19]},
    {size:[11,3.8,6],position:[-15.5,1.9,19]},
    {size:[11,4.2,6],position:[6.5,2.1,19]},
    {size:[11,5.2,6],position:[17.5,2.6,19]},
    {size:[12,3.6,6],position:[41,1.8,19]},
    {size:[16,4.8,6],position:[68,2.4,19]},
  ],tiledBuilding))
  firstPersonRoot.add(mergedGableRoofs('perimeter-old-town-gable-roofs',[
    {size:[8,5],position:[28.74,3.8,-4.5],rise:1.35},
    {size:[7.5,5],position:[33.39,4.6,-10],rise:1.35},
    {size:[8.5,5],position:[33.89,3.4,-15.5],rise:1.3},
    {size:[7,5],position:[33.14,5.2,-21],rise:1.4},
    {size:[9,5],position:[38.84,3.9,-26.5],rise:1.4},
    {size:[7.5,5],position:[38.09,5.5,-32],rise:1.45},
    {size:[9.5,5],position:[39.09,4.3,-37.5],rise:1.4},
    {size:[7.5,5],position:[38.99,3.5,-43],rise:1.25},
    {size:[10,6],position:[-50,3.2,-37],rise:1.5},
    {size:[9,6],position:[-50,3.2,-47],rise:1.45},
    {size:[10,8.625],position:[-53.5,3.8,-29.6875],rise:1.4},
    {size:[11,8.625],position:[-54,4.8,-21.0625],rise:1.5},
    {size:[9,8.625],position:[-53,3.5,-12.4375],rise:1.3},
    {size:[10,8.625],position:[-53.5,4.3,-3.8125],rise:1.4},
    {size:[12,6],position:[-39,4.2,19],rise:1.4},
    {size:[12,6],position:[-27,5.5,19],rise:1.5},
    {size:[11,6],position:[-15.5,3.8,19],rise:1.3},
    {size:[11,6],position:[6.5,4.2,19],rise:1.4},
    {size:[11,6],position:[17.5,5.2,19],rise:1.5},
    {size:[12,6],position:[41,3.6,19],rise:1.3},
    {size:[16,6],position:[68,4.8,19],rise:1.5},
  ],tiledBuilding))
  firstPersonRoot.add(
    mergedBoxes('wall-side-shop-body',[{
      size:wallSideShop.size,
      position:[wallSideShop.center[0],wallSideShop.size[1]/2,wallSideShop.center[1]],
    }],tiledBuilding),
    mergedGableRoofs('wall-side-shop-triangular-roof',[{
      size:wallSideShop.roof.geometrySize,
      position:[wallSideShop.center[0],wallSideShop.roof.baseY,wallSideShop.center[1]],
      rise:wallSideShop.roof.rise,rotationY:wallSideShop.roof.rotationY,
    }],tiledBuilding),
  )

  const perimeterTreeMaterial=flatMaterial('perimeter-watercolor-tree-cards',0xffffff,{
    transparent:false,alphaTest:.12,depthWrite:true,side:THREE.DoubleSide,
  })
  const wallTreeEntries=[]
  const roadsideTreeEntries=[]
  let treeIndex=0
  const addTree=(entries,x,z,rotationY=0,options={})=>{
    // 固定序列避免每次加载改变构图；所有树卡高度保持在6–7m。
    const heights=[6.15,6.55,6.85,6.35,6.7,6.25,6.95,6.45]
    entries.push({
      position:[x,z],height:options.height??heights[treeIndex%heights.length],
      cell:options.cell??treeIndex%8,rotationY,baseY:options.baseY??-.55,
    })
    treeIndex++
  }
  // 各段均放在围墙外侧约0.5m：南侧为+Z，西侧为-X，东侧为+X。
  // 校门中心X=-2.5及其净开口保持无树，左右两侧分别由X=-10与X=5承接。
  ;[-24,-17.5,-10,5,12.5,19].forEach(x=>addTree(wallTreeEntries,x,.65,0))
  // 西侧两段再向墙外移0.5m；只有靠大盒子楼的西南段斜转45°。
  ;[-4,-10,-16.5,-23].forEach(z=>addTree(wallTreeEntries,-29.95,z,Math.PI*3/4))
  ;[-28.5,-35.5,-42.5,-49.5,-56.5].forEach(z=>addTree(wallTreeEntries,-44.95,z,Math.PI/2))
  // 东墙依次沿X=32.6、31.7、27、22.1的折线布置；两处横折段也各放一棵。
  ;[-46,-43.5].forEach(z=>addTree(wallTreeEntries,33.25,z,Math.PI/2))
  ;[-38,-31].forEach(z=>addTree(wallTreeEntries,32.35,z,Math.PI/2))
  addTree(wallTreeEntries,29.35,-25.05,0)
  ;[-22,-16].forEach(z=>addTree(wallTreeEntries,27.65,z,Math.PI/2))
  // 马尾松南侧横墙外的这处树卡让位给亲历者确认的小卖部。
  ;[-7,-2].forEach(z=>addTree(wallTreeEntries,22.75,z,Math.PI/2))
  // 东北两栋盒子楼与校园之间：上层阔叶树，下层灌木封住树干空隙。
  const northeastTreeZ=[-48.5,-51.7,-54.9,-58.1,-61.3,-64.5,-67.7]
  const northeastShrubZ=[-49.9,-53.1,-56.3,-59.5,-62.7,-65.9,-69.1]
  northeastTreeZ.forEach((z,index)=>addTree(wallTreeEntries,index%2?34.8:34,z,Math.PI/2,{cell:index%4}))
  northeastShrubZ.forEach((z,index)=>addTree(wallTreeEntries,index%2?33.7:33.3,z,Math.PI/2,{
    cell:4+index%4,height:3.2+(index%3)*.25,baseY:-.3,
  }))
  // 南侧15m道路对面、连续房屋北立面前再形成一整排树线。
  ;[-40,-32,-24,-16,-8,0,8,16,24,32,40,48,56,64,72].forEach(x=>addTree(roadsideTreeEntries,x,15.35,0))
  // 近远树排分别合并；当前使用Alpha裁切不透明材质并写入深度。
  const roadsideTrees=mergedTreeCards('roadside-watercolor-tree-cards',roadsideTreeEntries,perimeterTreeMaterial)
  const wallTrees=mergedTreeCards('wall-watercolor-tree-cards',wallTreeEntries,perimeterTreeMaterial)
  roadsideTrees.renderOrder=1
  wallTrees.renderOrder=2
  firstPersonRoot.add(roadsideTrees,wallTrees)

  const sandboxBase=mergedBoxes('aerial-sand-table-base',[{
    size:[104,3.2,82],position:[-6,-1.85,-35],
  }],flatMaterial('aerial-sand-table-base',0x8a735b))
  const sandboxTop=mergedBoxes('aerial-sand-table-top',[{
    size:[101,.16,79],position:[-6,-.17,-35],
  }],flatMaterial('aerial-sand-table-top',0xc3ad86))
  aerialRoot.add(sandboxBase,sandboxTop)

  const configureTexture=(texture,{repeat=false}={})=>{
    texture.colorSpace=THREE.SRGBColorSpace
    texture.minFilter=THREE.LinearMipmapLinearFilter
    texture.magFilter=THREE.LinearFilter
    texture.generateMipmaps=true
    texture.anisotropy=Math.min(4,texture.anisotropy||4)
    if(repeat){texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping}
    texture.needsUpdate=true
    return texture
  }
  const load=async()=>{
    const [loadedPanoramaTexture,lotusTexture,perimeterTreeTexture]=await Promise.all([
      assetLoader.loadTexture(PANORAMA_URL),
      assetLoader.loadTexture(LOTUS_MAT_URL),
      assetLoader.loadTexture(PERIMETER_TREE_URL),
    ])
    panoramaMaterial.map=configureTexture(loadedPanoramaTexture)
    lotusMaterial.map=configureTexture(lotusTexture)
    perimeterTreeMaterial.map=configureTexture(perimeterTreeTexture)
    panoramaMaterial.needsUpdate=lotusMaterial.needsUpdate=perimeterTreeMaterial.needsUpdate=true
    return true
  }
  const syncMode=mode=>{
    const aerial=mode==='aerial'
    firstPersonRoot.visible=!aerial
    aerialRoot.visible=aerial
    scene.background=new THREE.Color(aerial?atmosphereColor:FIRST_PERSON_SKY_COLOR)
  }
  syncMode('aerial')
  return {
    load,syncMode,firstPersonRoot,aerialRoot,
    stats:{
      textures:3,drawCallsFirstPerson:12,drawCallsAerial:2,treeCards:53,lotusTiles:220,trianglesEstimate:1334,
      wallSideShop:{
        center:[...wallSideShop.center],size:[...wallSideShop.size],wallFaceZ:wallSideShop.wallFaceZ,
        roadNorthZ:wallSideShop.roadNorthZ,roof:{
          ...wallSideShop.roof,size:[...wallSideShop.roof.size],geometrySize:[...wallSideShop.roof.geometrySize],
        },
        drawCalls:2,externalRequests:0,confidence:wallSideShop.confidence,
      },
    },
  }
}

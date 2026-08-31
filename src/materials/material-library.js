import * as THREE from 'three'

const textureLoader = new THREE.TextureLoader()
const schoolSurfaceTextureCache=new Map()

function colorTexture(url, renderer, { repeat = [1, 1], wrap = true } = {}) {
  const texture = textureLoader.load(url)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  texture.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  texture.repeat.set(...repeat)
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return texture
}

function celGradient() {
  // 五级渐变保留明确色块，同时避免两级硬切造成的塑料感。
  const values = new Uint8Array([
    88, 101, 108,
    126, 140, 146,
    169, 180, 184,
    211, 217, 216,
    246, 244, 235,
  ])
  const texture = new THREE.DataTexture(values, 5, 1, THREE.RGBFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}

function toonMaterial(name, map, gradientMap) {
  const material = new THREE.MeshToonMaterial({
    name,
    map,
    gradientMap,
    color: 0xffffff,
  })
  material.userData.materialFamily = name
  return material
}

function schoolSurfaceTexture(url,renderer,{horizontalRepeat=true}={}) {
  const cached=schoolSurfaceTextureCache.get(url)
  if(cached)return cached
  const texture=colorTexture(url,renderer,{wrap:false})
  // 生成稿左右边缘的色值接近但不是数学无缝；镜像重复让边界共享同一列像素，
  // 避免长端墙每隔一个贴图宽度出现竖直拼缝。
  texture.wrapS=horizontalRepeat?THREE.MirroredRepeatWrapping:THREE.ClampToEdgeWrapping
  texture.wrapT=THREE.ClampToEdgeWrapping
  schoolSurfaceTextureCache.set(url,texture)
  return texture
}

function projectedStoreyMaterial(name,map,{floorBase,floorHeight=3.1,tileWidth=6,textureContrast=1,texturePivot=.82,color=0xffffff,emissive=null,emissiveIntensity=0}) {
  const material=new THREE.MeshStandardMaterial({name,map,color,roughness:.98,metalness:0})
  if(emissive) {
    material.emissive.set(emissive)
    material.emissiveIntensity=emissiveIntensity
  }
  material.userData.materialFamily=name
  material.userData.schoolSurface={kind:'storey-wall',floorBase,floorHeight,tileWidth}
  const previousCompile=material.onBeforeCompile
  const previousKey=material.customProgramCacheKey.bind(material)
  material.onBeforeCompile=shader=>{
    previousCompile(shader)
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>',`#include <common>
        varying vec3 vSchoolSurfaceWorldPosition;
        varying vec3 vSchoolSurfaceWorldNormal;
      `)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vSchoolSurfaceWorldPosition=(modelMatrix*vec4(transformed,1.0)).xyz;
        vSchoolSurfaceWorldNormal=normalize(mat3(modelMatrix)*objectNormal);
      `)
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>
        varying vec3 vSchoolSurfaceWorldPosition;
        varying vec3 vSchoolSurfaceWorldNormal;
      `)
      .replace('#include <map_fragment>',`
        #ifdef USE_MAP
          float schoolHorizontal=abs(vSchoolSurfaceWorldNormal.x)>abs(vSchoolSurfaceWorldNormal.z)
            ?vSchoolSurfaceWorldPosition.z:vSchoolSurfaceWorldPosition.x;
          float schoolStoreyY=fract((vSchoolSurfaceWorldPosition.y-${floorBase.toFixed(4)})/${floorHeight.toFixed(4)}+0.0001);
          vec2 schoolSurfaceUv=abs(vSchoolSurfaceWorldNormal.y)<0.72
            ?vec2(schoolHorizontal/${tileWidth.toFixed(4)},schoolStoreyY)
            :vMapUv;
          vec4 sampledDiffuseColor=texture2D(map,schoolSurfaceUv);
          sampledDiffuseColor.rgb=clamp(
            (sampledDiffuseColor.rgb-vec3(${texturePivot.toFixed(4)}))*${textureContrast.toFixed(4)}+vec3(${texturePivot.toFixed(4)}),
            0.0,
            1.0
          );
          diffuseColor*=sampledDiffuseColor;
        #endif
      `)
  }
  material.customProgramCacheKey=()=>`${previousKey()}|projected-school-storey-v2-${floorBase}-${floorHeight}-${tileWidth}-${textureContrast}-${texturePivot}-${color}`
  return material
}

function schoolMaterialFamily(renderer,{prefix,floorBase,kind='wall',textureContrast=1,texturePivot=.82,color=0xffffff,emissive=null,emissiveIntensity=0}) {
  const suffixes=['a','b','c','d']
  const variants=suffixes.map(suffix=>{
    const texture=schoolSurfaceTexture(`/assets/textures/school-walls/${prefix}-watercolor-v01-${suffix}.webp?v=4`,renderer,{horizontalRepeat:kind==='wall'})
    if(kind==='ceiling') {
      const material=new THREE.MeshStandardMaterial({name:`${prefix}-${suffix}`,map:texture,color:0xffffff,roughness:.98,metalness:0})
      material.userData.materialFamily=prefix
      material.userData.schoolSurface={kind:'ceiling'}
      if(emissive) {material.emissive.set(emissive);material.emissiveIntensity=emissiveIntensity}
      return material
    }
    return projectedStoreyMaterial(`${prefix}-${suffix}`,texture,{floorBase,textureContrast,texturePivot,color,emissive,emissiveIntensity})
  })
  for(const material of variants)material.userData.schoolSurfaceVariants=variants
  return variants
}

function perimeterWallMaterials(renderer) {
  const tileWidth=6.6
  const texture=colorTexture(
    '/assets/textures/perimeter-wall/perimeter-wall-graywhite-damaged-watercolor-v01-ab-atlas.webp?v=1',
    renderer,
    {wrap:false},
  )
  // A/B 横向拼成一个 6.6m 图组；镜像后完整重复周期扩大为 13.2m。
  texture.wrapS=THREE.MirroredRepeatWrapping
  texture.wrapT=THREE.ClampToEdgeWrapping
  const createHeightVariants=wallHeight=>[0,.5].map((phase,index)=>{
    const variant=index===0?'ab':'ba'
    const material=new THREE.MeshStandardMaterial({
      name:`perimeter-wall-graywhite-damaged-watercolor-v01-${variant}-phase-${wallHeight.toFixed(1)}m`,
      map:texture,color:0xffffff,roughness:.98,metalness:0,
    })
    material.userData.materialFamily='perimeter-wall-graywhite-damaged'
    material.userData.perimeterWall={wallHeight,tileWidth,repeatPeriod:tileWidth*2,phase,textureVersion:`v01-${variant}`}
    const previousCompile=material.onBeforeCompile
    const previousKey=material.customProgramCacheKey.bind(material)
    material.onBeforeCompile=shader=>{
      previousCompile(shader)
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>',`#include <common>
          varying vec3 vPerimeterWallWorldPosition;
          varying vec3 vPerimeterWallWorldNormal;
        `)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          vPerimeterWallWorldPosition=(modelMatrix*vec4(transformed,1.0)).xyz;
          vPerimeterWallWorldNormal=normalize(mat3(modelMatrix)*objectNormal);
        `)
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>',`#include <common>
          varying vec3 vPerimeterWallWorldPosition;
          varying vec3 vPerimeterWallWorldNormal;
        `)
        .replace('#include <map_fragment>',`
          #ifdef USE_MAP
            float perimeterWallHorizontal=abs(vPerimeterWallWorldNormal.x)>abs(vPerimeterWallWorldNormal.z)
              ?vPerimeterWallWorldPosition.z:vPerimeterWallWorldPosition.x;
            bool perimeterWallVertical=abs(vPerimeterWallWorldNormal.y)<0.72;
            vec2 perimeterWallUv=perimeterWallVertical
              ?vec2(perimeterWallHorizontal/${tileWidth.toFixed(4)}+${phase.toFixed(4)},clamp(vPerimeterWallWorldPosition.y/${wallHeight.toFixed(4)},0.0,1.0))
              :vec2((vPerimeterWallWorldPosition.x+vPerimeterWallWorldPosition.z)/${tileWidth.toFixed(4)}+${phase.toFixed(4)},0.965);
            diffuseColor*=texture2D(map,perimeterWallUv);
          #endif
        `)
    }
    material.customProgramCacheKey=()=>`${previousKey()}|projected-perimeter-wall-v2-${variant}-${wallHeight}-${tileWidth}-${phase}`
    return material
  })
  return {standard:createHeightVariants(2.2),tall:createHeightVariants(3)}
}

function seededRandom(seed) {
  let state=seed>>>0
  return ()=>{
    state+=0x6d2b79f5
    let value=state
    value=Math.imul(value^(value>>>15),value|1)
    value^=value+Math.imul(value^(value>>>7),value|61)
    return ((value^(value>>>14))>>>0)/4294967296
  }
}

function handPaintedChannel({ base, patches, seed, grayscale=false, marks=0 }) {
  const size=512,canvas=document.createElement('canvas')
  canvas.width=canvas.height=size
  const ctx=canvas.getContext('2d'),random=seededRandom(seed)
  ctx.fillStyle=base;ctx.fillRect(0,0,size,size)
  for(let i=0;i<42;i++) {
    const x=random()*size,y=random()*size,rx=52+random()*125,ry=34+random()*96
    const color=patches[Math.floor(random()*patches.length)]
    ctx.save();ctx.translate(x,y);ctx.rotate((random()-.5)*1.8);ctx.scale(rx,ry)
    const gradient=ctx.createRadialGradient(0,0,0,0,0,1)
    gradient.addColorStop(0,color);gradient.addColorStop(1,grayscale?'rgba(128,128,128,0)':'rgba(255,255,255,0)')
    ctx.globalAlpha=grayscale ? .72 : .58
    ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore()
  }
  // 只保留少量低对比擦痕；地面变化由大色块承担，不生成照片式颗粒噪声。
  ctx.lineCap='round'
  for(let i=0;i<marks;i++) {
    const x=random()*size,y=random()*size,length=18+random()*68
    ctx.strokeStyle=patches[Math.floor(random()*patches.length)]
    ctx.lineWidth=.8+random()*2.2;ctx.globalAlpha=.24+random()*.2
    ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+length*.45,y+(random()-.5)*10,x+length,y+(random()-.5)*15);ctx.stroke()
  }
  ctx.globalAlpha=1
  const texture=new THREE.CanvasTexture(canvas)
  texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping
  texture.minFilter=THREE.LinearMipmapLinearFilter
  texture.magFilter=THREE.LinearFilter
  if(!grayscale)texture.colorSpace=THREE.SRGBColorSpace
  return texture
}

function groundMaterial(name,{colorBase,colorPatches,roughBase,roughPatches,bumpBase,bumpPatches,seed,bumpScale=.018,roughness=1,marks=0}) {
  const map=handPaintedChannel({base:colorBase,patches:colorPatches,seed,marks})
  const roughnessMap=handPaintedChannel({base:roughBase,patches:roughPatches,seed:seed+101,grayscale:true})
  const bumpMap=handPaintedChannel({base:bumpBase,patches:bumpPatches,seed:seed+211,grayscale:true,marks:Math.floor(marks/2)})
  const material=new THREE.MeshStandardMaterial({name,map,roughnessMap,bumpMap,bumpScale,roughness,metalness:0})
  material.userData.materialFamily=name
  material.userData.meterTileSize=name.includes('concrete')?4:name.includes('compacted-dirt')?6:name.includes('slope-dirt')?4.5:name.includes('sand')?4:3.2
  return material
}

export function createMaterialLibrary(renderer) {
  const gradientMap = celGradient()

  const limewashOld = colorTexture(
    '/assets/textures/limewash/limewash-old-white-basecolor-v2.webp',
    renderer,
    { wrap: false },
  )
  // 旧教室南立面横跨两个教室：水平方向重复两次，垂直方向保留唯一墙脚旧化带。
  limewashOld.wrapS = THREE.RepeatWrapping
  limewashOld.wrapT = THREE.ClampToEdgeWrapping
  limewashOld.repeat.set(2, 1)
  const concreteAged = colorTexture(
    '/assets/textures/concrete/concrete-aged-light-basecolor-v1.webp',
    renderer,
    { repeat: [2, 1] },
  )
  const woodPainted = colorTexture(
    '/assets/textures/wood/wood-painted-aged-basecolor-v1.webp',
    renderer,
    { wrap: false },
  )
  const paintedSteel = colorTexture(
    '/assets/textures/painted-steel/painted-steel-dark-green-basecolor-v1.webp',
    renderer,
    { wrap: false },
  )
  const roofTile = colorTexture(
    '/assets/textures/roof-tile/roof-tile-warm-black-basecolor-v1.webp',
    renderer,
    { repeat: [4, 1] },
  )
  const gatePierTexture=colorTexture(
    '/assets/textures/gate-pier/gate-pier-bluegray-stone-four-face-v01.webp?v=1',
    renderer,
    {wrap:false},
  )
  const gatePier=new THREE.MeshStandardMaterial({
    name:'gate-pier-bluegray-stone-four-face-v01',map:gatePierTexture,
    color:0xffffff,roughness:.98,metalness:0,
  })
  gatePier.userData.materialFamily='gate-pier-bluegray-stone'
  gatePier.userData.textureVersion='gate-pier-bluegray-stone-four-face-v01'

  const ground={
    compactedDirt:groundMaterial('ground-compacted-dirt',{
      // 南方略湿的压实泥地以深灰褐为主，只保留很弱的暖棕变化；
      // 中等偏高粗糙度产生克制的潮湿反光，不呈现积水或塑料质感。
      colorBase:'#71695d',colorPatches:['rgba(65,61,55,.20)','rgba(118,101,79,.13)','rgba(78,83,72,.12)'],
      roughBase:'#c9c9c9',roughPatches:['rgba(160,160,160,.20)','rgba(225,225,225,.12)'],
      bumpBase:'#808080',bumpPatches:['rgba(104,104,104,.10)','rgba(154,154,154,.10)'],seed:1982,bumpScale:.016,roughness:.92,marks:8,
    }),
    agedConcrete:groundMaterial('ground-aged-concrete',{
      // 中性略冷的旧水泥：变化来自蓝灰、浅灰和极淡褐色矿物斑，不以黄灰作底。
      colorBase:'#aeb4b4',colorPatches:['rgba(104,113,116,.14)','rgba(202,205,198,.13)','rgba(132,118,105,.045)'],
      roughBase:'#eeeeee',roughPatches:['rgba(212,212,212,.16)','rgba(255,255,255,.15)'],
      bumpBase:'#808080',bumpPatches:['rgba(111,111,111,.08)','rgba(147,147,147,.08)'],seed:1987,bumpScale:.01,marks:11,
    }),
    serviceConcrete:groundMaterial('ground-service-concrete',{
      colorBase:'#8e8f7d',colorPatches:['rgba(74,78,68,.20)','rgba(154,148,122,.13)','rgba(77,94,72,.12)'],
      roughBase:'#e2e2e2',roughPatches:['rgba(184,184,184,.22)','rgba(244,244,244,.12)'],
      bumpBase:'#808080',bumpPatches:['rgba(96,96,96,.12)','rgba(151,151,151,.08)'],seed:1989,bumpScale:.013,marks:8,
    }),
    slopeDirt:groundMaterial('ground-slope-dirt',{
      colorBase:'#776d5f',colorPatches:['rgba(67,62,56,.19)','rgba(126,105,80,.12)','rgba(76,86,72,.11)'],
      roughBase:'#cecece',roughPatches:['rgba(168,168,168,.18)','rgba(229,229,229,.12)'],
      bumpBase:'#808080',bumpPatches:['rgba(91,91,91,.14)','rgba(163,163,163,.12)'],seed:1991,bumpScale:.028,roughness:.94,marks:5,
    }),
    activitySand:groundMaterial('ground-activity-sand',{
      colorBase:'#c9aa68',colorPatches:['rgba(235,196,112,.17)','rgba(158,120,65,.11)','rgba(204,157,84,.12)'],
      roughBase:'#f4f4f4',roughPatches:['rgba(226,226,226,.16)','rgba(255,255,255,.13)'],
      bumpBase:'#808080',bumpPatches:['rgba(105,105,105,.11)','rgba(158,158,158,.12)'],seed:1996,bumpScale:.022,marks:3,
    }),
    fieldStone:groundMaterial('ground-field-stone',{
      colorBase:'#817b69',colorPatches:['rgba(180,173,146,.16)','rgba(83,82,69,.17)','rgba(93,111,75,.08)'],
      roughBase:'#ebebeb',roughPatches:['rgba(201,201,201,.18)','rgba(255,255,255,.13)'],
      bumpBase:'#808080',bumpPatches:['rgba(91,91,91,.14)','rgba(162,162,162,.12)'],seed:2001,bumpScale:.035,marks:2,
    }),
    dampEarth:groundMaterial('ground-damp-earth',{
      colorBase:'#65573f',colorPatches:['rgba(63,67,46,.18)','rgba(117,91,54,.14)'],
      roughBase:'#d8d8d8',roughPatches:['rgba(188,188,188,.18)','rgba(238,238,238,.12)'],
      bumpBase:'#808080',bumpPatches:['rgba(103,103,103,.10)','rgba(145,145,145,.08)'],seed:2004,bumpScale:.014,marks:2,
    }),
    softMoss:groundMaterial('ground-soft-moss',{
      colorBase:'#697451',colorPatches:['rgba(113,126,75,.17)','rgba(62,78,52,.15)'],
      roughBase:'#f2f2f2',roughPatches:['rgba(220,220,220,.12)','rgba(255,255,255,.14)'],
      bumpBase:'#808080',bumpPatches:['rgba(104,104,104,.08)','rgba(151,151,151,.08)'],seed:2008,bumpScale:.012,marks:0,
    }),
  }
  for(const material of Object.values(ground)) for(const texture of [material.map,material.roughnessMap,material.bumpMap]) {
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
  }

  const school={
    b1Ivory:schoolMaterialFamily(renderer,{prefix:'wall-ivory',floorBase:.4}),
    b1Ochre:schoolMaterialFamily(renderer,{prefix:'wall-ochre',floorBase:.4}),
    b2Ochre:schoolMaterialFamily(renderer,{prefix:'wall-ochre',floorBase:.3}),
    // 一号楼走廊内侧及两翼教室朝走廊的白墙已经使用室内贴图；原先较强的
    // 自发光把低频水彩变化冲平。复用同一材质族，增强贴图对比并收低补光，
    // 让微蓝灰底和淡暖色斑可见，但仍保持为干净白墙。
    b1Interior:schoolMaterialFamily(renderer,{prefix:'wall-interior',floorBase:.4,textureContrast:1.55,texturePivot:.84,emissive:0x72798b,emissiveIntensity:.18}),
    b2Interior:schoolMaterialFamily(renderer,{prefix:'wall-interior',floorBase:.3,emissive:0x72798b,emissiveIntensity:.34}),
    ceiling:schoolMaterialFamily(renderer,{prefix:'ceiling',floorBase:0,kind:'ceiling',emissive:0x8c93a7,emissiveIntensity:.32}),
  }

  return {
    gradientMap,
    ground,
    school,
    perimeterWall:perimeterWallMaterials(renderer),
    gatePier,
    sample: {
      limewashOld: toonMaterial('limewash-old-white-exposed-brick', limewashOld, gradientMap),
      concreteAged: toonMaterial('concrete-aged-light', concreteAged, gradientMap),
      woodPainted: toonMaterial('wood-painted-aged', woodPainted, gradientMap),
      paintedSteel: toonMaterial('painted-steel-dark-green', paintedSteel, gradientMap),
      roofTile: toonMaterial('roof-tile-warm-black', roofTile, gradientMap),
    },
  }
}

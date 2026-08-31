import * as THREE from 'three'

const createRadialTexture=(name,stops)=>{
  const canvas=document.createElement('canvas')
  canvas.width=canvas.height=128
  const context=canvas.getContext('2d')
  const center=64
  const gradient=context.createRadialGradient(center,center,0,center,center,center)
  for(const [offset,alpha] of stops)gradient.addColorStop(offset,`rgba(255,255,255,${alpha})`)
  context.fillStyle=gradient
  context.fillRect(0,0,128,128)
  const texture=new THREE.CanvasTexture(canvas)
  texture.name=name
  texture.colorSpace=THREE.SRGBColorSpace
  texture.minFilter=THREE.LinearMipmapLinearFilter
  texture.magFilter=THREE.LinearFilter
  texture.generateMipmaps=true
  return texture
}

const smoothstep=(edge0,edge1,value)=>{
  const t=THREE.MathUtils.clamp((value-edge0)/(edge1-edge0),0,1)
  return t*t*(3-2*t)
}

export function createSunGlare({scene,camera,direction,strength=1}) {
  const root=new THREE.Group()
  root.name='sun-glare-prototype'
  root.frustumCulled=false
  scene.add(root)

  const coreTexture=createRadialTexture('sun-core-radial-v01',[[0,1],[.58,1],[.78,.78],[1,0]])
  const glowTexture=createRadialTexture('sun-glow-radial-v01',[[0,.95],[.08,.72],[.28,.24],[.62,.055],[1,0]])
  const makeSprite=(name,texture,color,size,opacity)=>{
    const material=new THREE.SpriteMaterial({
      name,map:texture,color,transparent:true,opacity,
      blending:THREE.AdditiveBlending,depthTest:true,depthWrite:false,
      fog:false,toneMapped:true,
    })
    const sprite=new THREE.Sprite(material)
    sprite.name=name
    sprite.scale.setScalar(size)
    sprite.frustumCulled=false
    root.add(sprite)
    return sprite
  }

  // 108m 位于第一人称 120m 远景圆柱内侧，并远低于 230m 相机远裁面。
  const distance=108
  // 记忆水彩画面采用约三倍于真实太阳的视觉尺寸，使高空太阳在普通视场中
  // 仍然清楚可辨；核心亮度不随尺寸同步增加，避免形成生硬的白色贴片。
  const core=makeSprite('sun-visible-disc',coreTexture,0xfff4cf,3.6,.98)
  const innerGlow=makeSprite('sun-inner-glare',glowTexture,0xffdf9b,11,.42)
  const outerGlow=makeSprite('sun-outer-glare',glowTexture,0xffd28a,25,.13)
  const sunDirection=direction.clone().normalize()
  const cameraForward=new THREE.Vector3()
  let viewAmount=0

  const update=()=>{
    root.position.copy(camera.position).addScaledVector(sunDirection,distance)
    camera.getWorldDirection(cameraForward)
    const alignment=cameraForward.dot(sunDirection)
    // 约 28° 内出现柔光，12° 内明显增强；太阳盘自身仍由视锥决定是否可见。
    viewAmount=smoothstep(.88,.978,alignment)
    core.material.opacity=.9+.08*viewAmount
    innerGlow.material.opacity=strength*(.10+.40*viewAmount)
    outerGlow.material.opacity=strength*.16*viewAmount
    innerGlow.scale.setScalar(9.5+3*viewAmount)
    outerGlow.scale.setScalar(21+7*viewAmount)
  }

  const dispose=()=>{
    scene.remove(root)
    for(const sprite of [core,innerGlow,outerGlow])sprite.material.dispose()
    coreTexture.dispose();glowTexture.dispose()
  }

  return {
    update,dispose,
    snapshot:()=>({
      enabled:root.visible,strength,viewAmount:+viewAmount.toFixed(3),
      direction:sunDirection.toArray().map(value=>+value.toFixed(4)),
      drawObjects:root.children.length,textures:2,distance,
    }),
  }
}

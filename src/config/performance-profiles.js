import {NeutralToneMapping,PCFSoftShadowMap} from 'three'

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)) {
    Object.freeze(value)
    for(const child of Object.values(value))deepFreeze(child)
  }
  return value
}

// 阶段4先把已经验收的桌面画质原样集中起来；本文件暂不做设备探测或自动降级。
export const DESKTOP_HIGH_PROFILE=deepFreeze({
  id:'desktop-high',
  label:'桌面高画质',
  automaticDowngrade:false,
  modelDetail:{
    lodEnabled:false,
    strategy:'single-full-detail-models',
  },
  loading:{maxConcurrentRequests:4},
  renderer:{
    antialias:true,
    // 每帧绘制后允许浏览器释放默认颜色缓冲，降低移动端显存带宽与合成压力。
    // 测试截图会在同一任务内显式render后立即读取，不需要持续保留上一帧。
    preserveDrawingBuffer:false,
    // 手机高密屏保留 1.5× 实际绘制分辨率；桌面 DPR=1 时不增加开销。
    maxPixelRatio:1.5,
    // 高 DPR、4K 和超宽屏统一限制在 2K 级别的最终绘制缓冲内。
    // 长短边分开限制，同时适用于横屏和竖屏，且不改变画面纵横比。
    maxDrawingBufferSize:{longEdge:2560,shortEdge:1440},
    shadowsEnabled:true,
    shadowMapType:PCFSoftShadowMap,
    toneMapping:NeutralToneMapping,
    toneMappingExposure:1.12,
  },
  shadows:{
    mapSize:2048,
    // 收紧太阳阴影投影盒，在不增加贴图分辨率的前提下降低 PCFSoft 的世界空间软化宽度。
    cameraExtent:60,
    cameraNear:1,
    cameraFar:145,
    bias:-.0001,
    normalBias:.025,
  },
  lighting:{
    hemisphereOutdoorIntensity:1.30,
    // 只在真实教室区域内提高环境光；不影响室外长椅的坐下状态。
    hemisphereIndoorIntensity:1.68,
    // MathUtils.damp 的时间常数，约 0.7 秒完成 95% 的明度过渡。
    indoorTransitionLambda:4.5,
  },
  postProcessing:{
    // 桌面先从 0.75× 提升到 0.875×，再交由 SMAA 处理描线、栏杆和透明树叶边缘。
    // 1.0× 与 GTAO、SMAA 叠加后在 DPR=2 实测会退到 30fps，不作正式值。
    composerPixelRatio:.875,
    touchComposerPixelRatio:1.5,
    smaaEnabled:true,
    gtao:{
      enabled:true,
      outdoor:{radius:.72,distanceExponent:1.35,thickness:.55,distanceFallOff:1.2,scale:.82,samples:6,blendIntensity:.35},
      indoor:{radius:.36,distanceExponent:1.18,thickness:.42,distanceFallOff:1,scale:.88,samples:8,blendIntensity:.70},
      denoise:{lumaPhi:8,depthPhi:2.5,normalPhi:3.5,radius:5,radiusExponent:2,rings:2,samples:6},
    },
  },
  artisticOutlines:{
    enabled:true,
    aerial:{primaryBase:.22,primaryStroke:.64,secondaryBase:.10,secondaryStroke:.32,foundationStroke:.62},
    near:{primaryBase:.30,primaryStroke:.84,secondaryBase:.18,secondaryStroke:.58,foundationStroke:.86},
  },
})

export const ACTIVE_PERFORMANCE_PROFILE=DESKTOP_HIGH_PROFILE

import * as THREE from 'three'
import {createPixelTextSystem} from './pixel-text.js'

const SMOOTH_ATLAS_URL='/assets/ui/hud-v02/hud-smooth-atlas-v03.png'
const SMOOTH_ATLAS_SIZE=[2048,1280]
const MINIGAME_TUTORIAL_ATLAS_URL='/assets/ui/hud-v02/hud-minigame-tutorial-atlas-v02.png'
const MINIGAME_TUTORIAL_ATLAS_SIZE=[2048,1024]
const ARCADE_COMIC_BURST_ATLAS_URL='/assets/ui/arcade-comic-v01/arcade-comic-bursts-v01.png'
const ARCADE_COMIC_BURST_ATLAS_SIZE=[2048,2048]
const ARCADE_COMIC_SCORE_ATLAS_URL='/assets/ui/arcade-comic-v01/arcade-comic-score-v01.png'
const ARCADE_COMIC_SCORE_ATLAS_SIZE=[2048,1792]
const ARCADE_COMIC_TEXT_CONFIG={
  basketball:{url:'/assets/ui/arcade-comic-v01/arcade-comic-basketball-v01.png',size:[2048,1024],defaultPhrase:'two',phrases:{two:[0,0,1024,512],three:[1024,0,1024,512],four:[0,512,1024,512]}},
  pingPong:{url:'/assets/ui/arcade-comic-v01/arcade-comic-ping-pong-v01.png',size:[2048,1536],defaultPhrase:'good',phrases:{good:[0,0,1024,512],smash:[1024,0,1024,512],point:[0,512,1024,512],win:[1024,512,1024,512],again:[0,1024,1024,512]}},
  longJump:{url:'/assets/ui/arcade-comic-v01/arcade-comic-long-jump-v01.png',size:[2048,1536],defaultPhrase:'jump',phrases:{jump:[0,0,1024,512],far:[1024,0,1024,512],good:[0,512,1024,512],again:[1024,512,1024,512],more:[0,1024,1024,512],overrun:[1024,1024,1024,512]}},
  bambooClimb:{url:'/assets/ui/arcade-comic-v01/arcade-comic-bamboo-climb-v01.png',size:[2048,1536],defaultPhrase:'steady',phrases:{steady:[0,0,1024,512],power:[1024,0,1024,512],slip:[0,512,1024,512],again:[1024,512,1024,512],top:[0,1024,1024,512]}},
  hopscotch:{url:'/assets/ui/arcade-comic-v01/arcade-comic-hopscotch-v01.png',size:[1024,1024],defaultPhrase:'throw-good',phrases:{'throw-good':[0,0,512,256],line:[512,0,512,256],'throw-wide':[0,256,512,256],'wrong-tile':[512,256,512,256],'wrong-feet':[0,512,512,256],round:[512,512,512,256],complete:[0,768,512,256]}},
  shuttlecock:{url:'/assets/ui/arcade-comic-v01/arcade-comic-shuttlecock-v01.png',size:[1024,768],defaultPhrase:'switch-foot',phrases:{'switch-foot':[0,0,512,256],watch:[512,0,512,256],miss:[0,256,512,256],again:[512,256,512,256],ten:[0,512,512,256],record:[512,512,512,256]}},
  jacks:{url:'/assets/ui/arcade-comic-v01/arcade-comic-jacks-v01.png',size:[1024,1024],defaultPhrase:'disturbed',phrases:{disturbed:[0,0,512,256],miss:[512,0,512,256],hurry:[0,256,512,256],again:[512,256,512,256],'stage-one':[0,512,512,256],'stage-two':[512,512,512,256],'stage-three':[0,768,512,256],complete:[512,768,512,256]}},
  slingshot:{url:'/assets/ui/arcade-comic-v01/arcade-comic-slingshot-v01.png',size:[2048,1024],defaultPhrase:'hit',phrases:{hit:[0,0,1024,512],miss:[1024,0,1024,512],wood:[0,512,1024,512],wire:[1024,512,1024,512]}},
}

const INTERACTION_RECTS={
  default:[0,0,256,256],look:[256,0,256,256],'open-link':[256,0,256,256],'show-qr':[256,0,256,256],
  'open-xiaohongshu':[256,0,256,256],'open-weibo':[256,0,256,256],'open-x':[256,0,256,256],
  'show-wechat-qr':[256,0,256,256],'open-github':[256,0,256,256],'open-vercel':[256,0,256,256],
  'open-door':[512,0,256,256],'open-window':[768,0,256,256],
  'pick-up-chalk':[0,256,256,256],'pick-up-basketball':[256,256,256,256],'shoot-basketball':[512,256,256,256],'sit-down':[768,256,256,256],
  'stand-up':[0,512,256,256],'start-ping-pong':[256,512,256,256],'throw-chalk':[512,512,256,256],write:[768,512,256,256],
  'start-bamboo-climb':[768,768,256,256],'play-handheld':[256,0,256,256],
  'play-rubiks-cube':[256,0,256,256],
  'start-long-jump':[0,1024,256,256],
  'start-hopscotch':[256,1024,256,256],
  'start-shuttlecock':[512,1024,256,256],
  'start-jacks':[768,1024,256,256],
  'start-flag-raising':[256,0,256,256],
  // 弹弓选择沿用普通查看光标，只替换旁边的动作说明文字。
  'select-slingshot-wood':[256,0,256,256],
  'select-slingshot-wire':[256,0,256,256],
  'select-slingshot-5m':[256,0,256,256],
  'select-slingshot-10m':[256,0,256,256],
}
const POSTURE_RECTS={standing:[0,768,256,256],walking:[256,768,256,256],sitting:[512,768,256,256]}
const MOVEMENT_TUTORIAL_COPY={
  desktop:['WASD／方向键移动 · 鼠标观察','看向地面，出现绿色标记后点击前往'],
  mobile:['看向地面，出现绿色标记后轻触前往','也可用左侧摇杆移动，拖动画面观察'],
}
const MINIGAME_TUTORIAL_RECTS={
  'basketball-desktop':[0,0,1024,512],'basketball-mobile':[1024,0,1024,512],
  'ping-pong-desktop':[0,512,1024,512],'ping-pong-mobile':[1024,512,1024,512],
}
const MINIGAME_INSTRUCTIONS={
  'basketball-desktop':['篮球玩法','1. 对准篮球，点击拾取','2. 按住鼠标左键蓄力，松开投篮','3. F 踢球 · R 重置篮球'],
  'basketball-mobile':['篮球玩法','1. 轻触篮球拾取','2. 按住右下角投篮键蓄力，松开投篮','3. 双指拖动画面可重置篮球'],
  'ping-pong-desktop':['乒乓球玩法','1. 对准球桌，点击进入练习','2. 点击抛球，移动鼠标控制球拍','3. M 开始7分比赛 · X 退出 · Esc 暂停'],
  'ping-pong-mobile':['乒乓球玩法','1. 轻触球桌进入练习','2. 按住移动球和球拍，松手抛球','3. 再次触摸挥拍，上方按钮比赛／退出'],
  'slingshot-desktop':['弹弓玩法','1. 移动视角调整角度，按住鼠标蓄力','2. 松开发射；满力保持过久会抖动','3. W／↑ 5米 · S／↓ 10米 · X退出 · Esc暂停'],
  'slingshot-mobile':['弹弓玩法','1. 拖动画面调整角度，按住射击区蓄力','2. 松开发射；满力保持过久会抖动','3. 点击“距离”按钮切换5米／10米'],
}
const INTERACTION_HINTS={
  look:'点击查看','open-link':'点击打开网页','show-qr':'点击查看二维码',
  'open-xiaohongshu':'点击打开小红书','open-weibo':'点击打开微博','open-x':'点击打开 X',
  'show-wechat-qr':'点击查看视频号二维码','open-github':'点击打开 GitHub','open-vercel':'点击打开在线体验',
  'open-door':'点击开门','open-window':'点击开窗','pick-up-chalk':'点击拾取粉笔',
  'pick-up-basketball':'点击拾取篮球','shoot-basketball':'按住蓄力 · 松开投篮','sit-down':'点击坐下',
  'stand-up':'点击起身','start-ping-pong':'点击开始乒乓球','start-bamboo-climb':'点击开始攀爬','throw-chalk':'点击投掷粉笔',write:'点击书写',
  'play-handheld':'点击玩掌机','play-rubiks-cube':'点击玩魔方','start-long-jump':'点击开始跳远','start-hopscotch':'点击开始跳房子',
  'start-shuttlecock':'点击开始踢毽子',
  'start-jacks':'点击玩抓石子',
  'start-flag-raising':'点击升旗',
  'select-slingshot-wood':'点击选择木弹弓',
  'select-slingshot-wire':'点击选择铁弹弓',
  'select-slingshot-5m':'点击从5米开始',
  'select-slingshot-10m':'点击从10米开始',
}
const HINT_CELL_SIZE=[512,64]
const FLAG_RAISING_HUD_TEXT={
  desktop:'按住绳子向下拉 · 松开后再拉　X退出 · Esc暂停',
  mobile:'按住绳子向下拖动 · 松开后再拉',
  'complete-desktop':'升旗完成 · X退出 · Esc暂停',
  'complete-mobile':'升旗完成 · 点击右上角退出',
}
const HINT_ROWS=Math.ceil(Object.keys(INTERACTION_HINTS).length/2)
const FLAG_RAISING_TEXT_CELL_SIZE=[1024,128]
const FLAG_RAISING_TEXT_RECTS=Object.fromEntries(Object.keys(FLAG_RAISING_HUD_TEXT).map((name,index)=>[
  name,[0,HINT_ROWS*HINT_CELL_SIZE[1]+index*FLAG_RAISING_TEXT_CELL_SIZE[1],...FLAG_RAISING_TEXT_CELL_SIZE],
]))
const HINT_ATLAS_SIZE=[1024,HINT_ROWS*HINT_CELL_SIZE[1]+Object.keys(FLAG_RAISING_HUD_TEXT).length*FLAG_RAISING_TEXT_CELL_SIZE[1]]
const GENERATED_TEXT_ATLAS_SIZE=[2048,2048]
const GENERATED_TEXT_SPLIT_Y=768
const MOVEMENT_TUTORIAL_RECTS={desktop:[0,1536,1200,220],mobile:[0,1756,900,220]}
const generatedHintRect=([x,y,width,height])=>y<GENERATED_TEXT_SPLIT_Y
  ?[x,y+GENERATED_TEXT_SPLIT_Y,width,height]
  :[x+HINT_ATLAS_SIZE[0],y,width,height]
const GENERATED_FLAG_RAISING_TEXT_RECTS=Object.fromEntries(Object.entries(FLAG_RAISING_TEXT_RECTS).map(([name,rect])=>[name,generatedHintRect(rect)]))
const BAMBOO_SAFE_START_COLOR=new THREE.Color(0xf2c94c)
const BAMBOO_SAFE_END_COLOR=new THREE.Color(0x63b86d)
const ARCADE_COMIC_BURST_RECTS={major:[0,0,1024,1024],hit:[1024,0,1024,1024],fail:[0,1024,2048,1024]}
const ARCADE_COMIC_SCORE_GLYPHS='0123456789+-:/.%'
const ARCADE_COMIC_SCORE_LABELS=['score','hit','shots','player','computer','practice','match7','serve','distance','metre','height','centimetre','current','best','record','target','streak','grab','remaining','combo','misses']
const ARCADE_COMIC_SCORE_GLYPH_RECTS=Object.fromEntries([...ARCADE_COMIC_SCORE_GLYPHS].map((glyph,index)=>[glyph,[index*128,0,128,256]]))
const ARCADE_COMIC_SCORE_LABEL_RECTS=Object.fromEntries(ARCADE_COMIC_SCORE_LABELS.map((label,index)=>[label,[(index%4)*512,256+Math.floor(index/4)*256,512,256]]))
const configureTexture=(texture,renderer,pixelated)=>{
  texture.colorSpace=THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
  texture.generateMipmaps=!pixelated
  texture.minFilter=pixelated?THREE.NearestFilter:THREE.LinearMipmapLinearFilter
  texture.magFilter=pixelated?THREE.NearestFilter:THREE.LinearFilter
  texture.anisotropy=pixelated?1:Math.min(4,renderer.capabilities.getMaxAnisotropy())
  texture.needsUpdate=true
  return texture
}

const setAtlasUv=(geometry,rect,[atlasWidth,atlasHeight])=>{
  const [x,y,width,height]=rect
  const u0=x/atlasWidth,u1=(x+width)/atlasWidth
  const v1=1-y/atlasHeight,v0=1-(y+height)/atlasHeight
  const uv=geometry.getAttribute('uv')
  uv.setXY(0,u0,v1);uv.setXY(1,u1,v1);uv.setXY(2,u0,v0);uv.setXY(3,u1,v0);uv.needsUpdate=true
}
const makeAtlasMesh=(material,rect,atlasSize,name)=>{
  const [, ,width,height]=rect
  const geometry=new THREE.PlaneGeometry(1,1);setAtlasUv(geometry,rect,atlasSize)
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=name;mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=1
  return {mesh,aspect:width/height}
}

export function createWebglHud({renderer,isTouchMode=()=>false}) {
  const scene=new THREE.Scene();scene.name='webgl-hud-scene'
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,10);camera.position.z=1
  const loader=new THREE.TextureLoader()
  const pixelText=createPixelTextSystem({renderer})
  const interactionMeshes=new Map(),interactionHintMeshes=new Map(),postureMeshes=new Map(),tutorialMeshes=new Map(),minigameTutorialMeshes=new Map(),minigameInstructionMeshes=new Map()
  let loaded=false,warmed=false,enabled=false,interaction='default',posture='standing',tutorialTimer=0,basketballFeedbackTimer=0,pingPongFeedbackTimer=0
  let viewMode='aerial',viewToggleVisible=false,viewToggleBounds=null,viewButton=null
  let personalRecordVisible=false,personalRecordBounds=null,personalRecordButton=null
  let generatedTextAtlas=null
  let pointTargetVisible=false,pointWalking=false,pointWalkUi=null
  let basketballHud=null,pingPongHud=null,bambooClimbHud=null,longJumpHud=null,hopscotchHud=null,shuttlecockHud=null,jacksHud=null,flagRaisingHud=null,slingshotHud=null,arcadeComicHud=null,minigamePauseHud=null
  let minigamePaused=false
  const arcadeNumberEntries=[]
  const basketballState={visible:false,points:0,hits:0,attempts:0,charging:false,chargeRatio:0,decisionRatio:.62,recommendedRatio:.62,reachable:false,shootButtonVisible:false,shootPressed:false}
  const pingPongState={visible:false,mode:'练习',playerScore:0,aiScore:0,server:'玩家',phase:'idle',prompt:''}
  const bambooClimbState={visible:false,phase:'idle',side:'left',charging:false,chargeRatio:0,aim:[0,-.04],arrowCenter:[-.36,-.04],feedback:'',progress:0,failures:0,complete:false}
  const longJumpState={visible:false,phase:'idle',angleTurns:0,angleError:0,powerRatio:0,overrun:false,distance:0,evaluation:'',result:false}
  const hopscotchState={visible:false,phase:'idle',target:1,currentCell:0,direction:'outbound',feedback:'',faultReason:'',bestProgress:0,aimX:0}
  const shuttlecockState={visible:false,phase:'idle',streak:0,best:0,expectedFoot:'left',feedback:'',kickable:false,touch:false}
  const jacksState={visible:false,phase:'idle',stage:1,required:1,remaining:6,turn:0,streak:0,failures:0,feedback:'',failureReason:null,complete:false}
  const flagRaisingState={visible:false,phase:'idle',complete:false,progress:0,touch:false}
  const slingshotState={visible:false,distance:10,selectedId:'wood',shots:0,hits:0,touch:false}

  const makeFlatMesh=(geometry,material,name)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=3;return mesh
  }

  const makeSmoothText=({name,width=1024,height=160,fontSize=64,fontWeight=700,color='#261f19',strokeColor=null,strokeWidth=0,renderOrder=9})=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
    const context=canvas.getContext('2d')
    const texture=configureTexture(new THREE.CanvasTexture(canvas),renderer,false);texture.name=`${name}-texture`
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
    const mesh=makeFlatMesh(new THREE.PlaneGeometry(1,1),material,name);mesh.renderOrder=renderOrder
    let currentText=''
    const setText=text=>{
      const next=String(text??'');if(next===currentText)return
      currentText=next;context.clearRect(0,0,width,height)
      if(next){
        context.fillStyle=color;context.font=`${fontWeight} ${fontSize}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`
        context.textAlign='center';context.textBaseline='middle';context.lineJoin='round'
        if(strokeColor&&strokeWidth){context.strokeStyle=strokeColor;context.lineWidth=strokeWidth;context.strokeText(next,width/2,height/2)}
        context.fillText(next,width/2,height/2)
      }
      texture.needsUpdate=true
    }
    mesh.userData.smoothText={setText,get text(){return currentText},canvas,texture}
    return mesh
  }

  const makeArcadeScoreLabel=(material,label,name)=>{
    const entry=makeAtlasMesh(material,ARCADE_COMIC_SCORE_LABEL_RECTS[label],ARCADE_COMIC_SCORE_ATLAS_SIZE,name)
    entry.mesh.visible=true;entry.mesh.renderOrder=12;return entry.mesh
  }

  const makeArcadeNumber=(material,maxChars,name)=>{
    const group=new THREE.Group();group.name=name
    const slots=[]
    for(let index=0;index<maxChars;index++){
      const entry=makeAtlasMesh(material,ARCADE_COMIC_SCORE_GLYPH_RECTS['0'],ARCADE_COMIC_SCORE_ATLAS_SIZE,`${name}-${index}`)
      entry.mesh.visible=false;entry.mesh.renderOrder=13;entry.mesh.scale.set(.48,1,1)
      entry.mesh.position.x=(index-(maxChars-1)/2)*.47;group.add(entry.mesh);slots.push(entry.mesh)
    }
    const number={group,slots,maxChars,text:'',baseScale:[1,1],bounceStartedAt:0}
    number.setText=value=>{
      const text=String(value??'').slice(-maxChars)
      if(text===number.text)return false
      number.text=text;number.bounceStartedAt=performance.now()
      const offset=maxChars-text.length
      slots.forEach((slot,index)=>{
        const glyph=text[index-offset]
        slot.visible=Boolean(glyph&&ARCADE_COMIC_SCORE_GLYPH_RECTS[glyph])
        if(slot.visible)setAtlasUv(slot.geometry,ARCADE_COMIC_SCORE_GLYPH_RECTS[glyph],ARCADE_COMIC_SCORE_ATLAS_SIZE)
      })
      return true
    }
    arcadeNumberEntries.push(number);return number
  }

  const layoutArcadeNumber=(number,heightPx,viewportWidth,viewportHeight)=>{
    number.baseScale=[heightPx/viewportWidth*2,heightPx/viewportHeight*2]
    number.group.scale.set(number.baseScale[0],number.baseScale[1],1)
  }

  const layoutArcadeLabel=(mesh,widthPx,heightPx,viewportWidth,viewportHeight)=>mesh.scale.set(widthPx/viewportWidth*2,heightPx/viewportHeight*2,1)

  const updateArcadeNumberBounces=now=>{
    for(const number of arcadeNumberEntries){
      const t=THREE.MathUtils.clamp((now-number.bounceStartedAt)/180,0,1)
      const scale=t<.32?THREE.MathUtils.lerp(1,1.16,t/.32):t<.68?THREE.MathUtils.lerp(1.16,.96,(t-.32)/.36):THREE.MathUtils.lerp(.96,1,(t-.68)/.32)
      number.group.scale.set(number.baseScale[0]*scale,number.baseScale[1]*scale,1)
    }
  }

  const layoutArcadeComicPresentation=(game=arcadeComicHud?.game)=>{
    if(!arcadeComicHud)return
    const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
    const portrait=viewportHeight>viewportWidth
    if(game==='slingshot'){
      const textWidthPx=Math.min(viewportWidth*(portrait?.76:.42),viewportHeight*(portrait?.34:.46))
      const textHeightPx=textWidthPx*.5,burstSizePx=Math.min(viewportWidth*(portrait?.78:.46),viewportHeight*(portrait?.32:.48))
      arcadeComicHud.baseTextScale=[textWidthPx/viewportWidth*2,textHeightPx/viewportHeight*2]
      arcadeComicHud.baseBurstScale=[burstSizePx/viewportWidth*2,burstSizePx/viewportHeight*2]
      arcadeComicHud.root.position.set(0,portrait?.30:.28,0)
    }else if(game==='pingPong'){
      // 乒乓球需要持续观察来球：庆祝层和比分共用顶部中轴位置，
      // 空间不足时整体等比缩小，不能分别压扁标题或爆炸图。
      const textWidthPx=Math.min(viewportWidth*(portrait?.82:.50),viewportHeight*(portrait?.40:.56))
      const textHeightPx=textWidthPx*.5
      const burstSizePx=Math.min(viewportWidth*(portrait?.72:.46),viewportHeight*(portrait?.26:.36))
      const centerYPx=portrait?112:Math.min(108,viewportHeight*.18)
      arcadeComicHud.baseTextScale=[textWidthPx/viewportWidth*2,textHeightPx/viewportHeight*2]
      arcadeComicHud.baseBurstScale=[burstSizePx/viewportWidth*2,burstSizePx/viewportHeight*2]
      arcadeComicHud.root.position.set(0,1-centerYPx/viewportHeight*2,0)
    }else{
      const textWidthPx=viewportWidth*(portrait?.90:.76),textHeightPx=textWidthPx*.5
      const burstWidthPx=viewportWidth*(portrait?1.02:.90),burstHeightPx=burstWidthPx
      arcadeComicHud.baseTextScale=[textWidthPx/viewportWidth*2,textHeightPx/viewportHeight*2]
      arcadeComicHud.baseBurstScale=[burstWidthPx/viewportWidth*2,burstHeightPx/viewportHeight*2]
      arcadeComicHud.root.position.set(0,portrait?.06:.02,0)
    }
    for(const entry of Object.values(arcadeComicHud.textEntries))for(const phrase of Object.values(entry.phrases))phrase.mesh.scale.set(...arcadeComicHud.baseTextScale,1)
    arcadeComicHud.major.mesh.scale.set(...arcadeComicHud.baseBurstScale,1);arcadeComicHud.hit.mesh.scale.set(...arcadeComicHud.baseBurstScale,1);arcadeComicHud.fail.mesh.scale.set(...arcadeComicHud.baseBurstScale,1)
  }

  const makeArcadeComicHud=burstMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-arcade-comic-celebration';root.visible=false;scene.add(root)
    const major=makeAtlasMesh(burstMaterial,ARCADE_COMIC_BURST_RECTS.major,ARCADE_COMIC_BURST_ATLAS_SIZE,'webgl-hud-arcade-comic-burst-major')
    const hit=makeAtlasMesh(burstMaterial,ARCADE_COMIC_BURST_RECTS.hit,ARCADE_COMIC_BURST_ATLAS_SIZE,'webgl-hud-arcade-comic-burst-hit')
    const fail=makeAtlasMesh(burstMaterial,ARCADE_COMIC_BURST_RECTS.fail,ARCADE_COMIC_BURST_ATLAS_SIZE,'webgl-hud-arcade-comic-burst-fail')
    for(const entry of [major,hit,fail]){entry.mesh.renderOrder=20;entry.mesh.visible=true;root.add(entry.mesh)}
    const placeholder=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1,THREE.RGBAFormat)
    placeholder.name='webgl-hud-arcade-comic-placeholder';placeholder.needsUpdate=true
    const textEntries={}
    for(const [game,config] of Object.entries(ARCADE_COMIC_TEXT_CONFIG)){
      const material=new THREE.MeshBasicMaterial({name:`webgl-hud-arcade-comic-${game}-material`,map:placeholder,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
      const phrases={}
      for(const [phrase,rect] of Object.entries(config.phrases)){
        const entry=makeAtlasMesh(material,rect,config.size,`webgl-hud-arcade-comic-${game}-${phrase}`)
        entry.mesh.renderOrder=21;entry.mesh.visible=false;root.add(entry.mesh);phrases[phrase]=entry
      }
      textEntries[game]={material,phrases,activePhrase:config.defaultPhrase,texture:null,promise:null,ready:false}
    }
    arcadeComicHud={
      root,major,hit,fail,textEntries,placeholder,active:false,game:null,phrase:null,secondaryPhrase:null,kind:'major',startedAt:0,duration:1050,
      baseTextScale:[1,1],baseBurstScale:[1,1],queued:null,
    }
  }

  const prepareArcadeComicGame=game=>{
    const entry=arcadeComicHud?.textEntries?.[game]
    if(!entry)return Promise.resolve(false)
    if(entry.ready)return Promise.resolve(true)
    if(entry.promise)return entry.promise
    entry.promise=loader.loadAsync(ARCADE_COMIC_TEXT_CONFIG[game].url).then(texture=>{
      configureTexture(texture,renderer,false);texture.name=`webgl-hud-arcade-comic-${game}-texture`
      entry.texture=texture;entry.material.map=texture
      renderer.initTexture?.(texture)
      entry.ready=true
      const queued=arcadeComicHud.queued
      if(queued?.game===game){arcadeComicHud.queued=null;playArcadeComicCelebration(queued.game,queued.phrase,queued.kind,queued.duration,queued.secondaryPhrase)}
      return true
    }).catch(error=>{entry.promise=null;console.warn(`街机漫画 HUD ${game} 文字载入失败`,error);return false})
    return entry.promise
  }

  const playArcadeComicCelebration=(game,phrase=null,kind='major',duration=1050,secondaryPhrase=null)=>{
    const entry=arcadeComicHud?.textEntries?.[game]
    if(!entry)return false
    if(game==='pingPong'&&secondaryPhrase){
      // 兼容旧调用：若同时传入“好球＋扣杀”，扣杀直接提升为唯一主标题。
      if(secondaryPhrase==='smash')phrase='smash'
      secondaryPhrase=null
    }
    const selected=entry.phrases[phrase]??entry.phrases[ARCADE_COMIC_TEXT_CONFIG[game].defaultPhrase]
    const secondary=secondaryPhrase?entry.phrases[secondaryPhrase]??null:null
    if(!entry.ready){arcadeComicHud.queued={game,phrase,kind,duration,secondaryPhrase};prepareArcadeComicGame(game);return false}
    arcadeComicHud.active=true;arcadeComicHud.game=game;arcadeComicHud.phrase=Object.entries(entry.phrases).find(([,candidate])=>candidate===selected)?.[0]??ARCADE_COMIC_TEXT_CONFIG[game].defaultPhrase
    arcadeComicHud.secondaryPhrase=secondary?Object.entries(entry.phrases).find(([,candidate])=>candidate===secondary)?.[0]??null:null
    arcadeComicHud.kind=['hit','fail','plain'].includes(kind)?kind:'major'
    arcadeComicHud.startedAt=performance.now();arcadeComicHud.duration=Math.max(800,duration)
    layoutArcadeComicPresentation(game)
    arcadeComicHud.root.visible=true;arcadeComicHud.major.mesh.visible=arcadeComicHud.kind==='major'
    arcadeComicHud.hit.mesh.visible=arcadeComicHud.kind==='hit'
    arcadeComicHud.fail.mesh.visible=arcadeComicHud.kind==='fail'
    for(const [name,candidate] of Object.entries(arcadeComicHud.textEntries))for(const phraseEntry of Object.values(candidate.phrases)){
      phraseEntry.mesh.visible=name===game&&(phraseEntry===selected||phraseEntry===secondary);phraseEntry.mesh.position.set(0,phraseEntry===secondary?-.31:0,0)
    }
    return true
  }

  const stopArcadeComicCelebration=(game=null)=>{
    if(!arcadeComicHud)return false
    const activeMatches=!game||arcadeComicHud.game===game
    const queuedMatches=!game||arcadeComicHud.queued?.game===game
    if(queuedMatches)arcadeComicHud.queued=null
    if(!activeMatches)return queuedMatches
    arcadeComicHud.active=false;arcadeComicHud.root.visible=false;arcadeComicHud.secondaryPhrase=null
    for(const entry of [arcadeComicHud.major,arcadeComicHud.hit,arcadeComicHud.fail]){entry.mesh.visible=false;entry.mesh.material.opacity=1}
    for(const entry of Object.values(arcadeComicHud.textEntries)){
      entry.material.opacity=1
      for(const phraseEntry of Object.values(entry.phrases))phraseEntry.mesh.visible=false
    }
    return true
  }

  const sampleKeyframes=(time,keyframes)=>{
    if(time<=keyframes[0][0])return keyframes[0][1]
    for(let index=1;index<keyframes.length;index++){
      const previous=keyframes[index-1],next=keyframes[index]
      if(time<=next[0]){
        const ratio=(time-previous[0])/Math.max(.0001,next[0]-previous[0])
        return THREE.MathUtils.lerp(previous[1],next[1],ratio)
      }
    }
    return keyframes.at(-1)[1]
  }

  const updateArcadeComicCelebration=now=>{
    if(!arcadeComicHud?.active)return
    const elapsed=now-arcadeComicHud.startedAt,duration=arcadeComicHud.duration,t=THREE.MathUtils.clamp(elapsed/duration,0,1)
    const plain=arcadeComicHud.kind==='plain'
    const burstScale=sampleKeyframes(t,[[0,.35],[.16,1.25],[.30,.96],[.42,1],[.76,1.08],[1,1.13]])
    const textDelay=plain?0:50
    const textT=THREE.MathUtils.clamp((elapsed-textDelay)/Math.max(1,duration-textDelay),0,1)
    const textScale=plain
      ?sampleKeyframes(textT,[[0,.58],[.16,1.10],[.34,.97],[.52,1],[1,1]])
      :sampleKeyframes(textT,[[0,.20],[.13,1.35],[.28,.92],[.43,1.08],[.58,1],[1,1]])
    const burst=plain?null:arcadeComicHud.kind==='hit'?arcadeComicHud.hit.mesh:arcadeComicHud.kind==='fail'?arcadeComicHud.fail.mesh:arcadeComicHud.major.mesh
    const textEntry=arcadeComicHud.textEntries[arcadeComicHud.game]
    const textMesh=textEntry.phrases[arcadeComicHud.phrase].mesh
    const secondaryMesh=arcadeComicHud.secondaryPhrase?textEntry.phrases[arcadeComicHud.secondaryPhrase].mesh:null
    if(burst)burst.scale.set(arcadeComicHud.baseBurstScale[0]*burstScale,arcadeComicHud.baseBurstScale[1]*burstScale,1)
    const plainScale=plain?.92:1
    textMesh.scale.set(arcadeComicHud.baseTextScale[0]*textScale*plainScale,arcadeComicHud.baseTextScale[1]*textScale*plainScale,1)
    if(secondaryMesh){
      const secondaryT=THREE.MathUtils.clamp((elapsed-120)/Math.max(1,duration-120),0,1)
      const secondaryScale=sampleKeyframes(secondaryT,[[0,.15],[.16,1.18],[.34,.92],[.50,1],[1,1]])*.58
      secondaryMesh.scale.set(arcadeComicHud.baseTextScale[0]*secondaryScale,arcadeComicHud.baseTextScale[1]*secondaryScale,1)
    }
    if(burst)burst.rotation.z=(arcadeComicHud.kind==='hit'?.035:arcadeComicHud.kind==='fail'?.018:-.018)+Math.sin(t*Math.PI)*.018
    textMesh.rotation.z=plain?-.004:arcadeComicHud.game==='pingPong'?.022:arcadeComicHud.kind==='fail'?.012:-.012
    if(secondaryMesh)secondaryMesh.rotation.z=-textMesh.rotation.z*.55
    if(burst)burst.material.opacity=t<.64?1:1-(t-.64)/.36
    textEntry.material.opacity=t<.82?1:1-(t-.82)/.18
    if(t>=1){arcadeComicHud.active=false;arcadeComicHud.root.visible=false;if(burst)burst.material.opacity=1;textEntry.material.opacity=1;arcadeComicHud.secondaryPhrase=null}
  }

  const makeBambooClimbHud=scoreAtlasMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-bamboo-climb';root.visible=false;scene.add(root)
    const outlineMaterial=new THREE.MeshBasicMaterial({color:0x302c25,transparent:true,opacity:.96,depthTest:false,depthWrite:false,toneMapped:false})
    const backMaterial=new THREE.MeshBasicMaterial({color:0xfff9e8,transparent:true,opacity:.98,depthTest:false,depthWrite:false,toneMapped:false})
    const hazardMaterial=new THREE.MeshBasicMaterial({color:0xe44734,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false})
    const makeArrow=(id)=>{
      const group=new THREE.Group();group.name=`webgl-hud-bamboo-climb-${id}-arrow`
      const shape=new THREE.Shape();shape.moveTo(-.22,-.50);shape.lineTo(.22,-.50);shape.lineTo(.22,.10);shape.lineTo(.48,.10);shape.lineTo(0,.50);shape.lineTo(-.48,.10);shape.lineTo(-.22,.10);shape.closePath()
      const outline=makeFlatMesh(new THREE.ShapeGeometry(shape),outlineMaterial,`${group.name}-outline`)
      const back=makeFlatMesh(new THREE.ShapeGeometry(shape),backMaterial,`${group.name}-back`);back.scale.set(.84,.91,1);back.position.z=.001
      const fillMaterial=new THREE.MeshBasicMaterial({color:0xf2c94c,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false})
      const fill=makeFlatMesh(new THREE.PlaneGeometry(.34,.50),fillMaterial,`${group.name}-safe-fill`);fill.position.z=.002
      const hazardShape=new THREE.Shape();hazardShape.moveTo(-.39,.08);hazardShape.lineTo(.39,.08);hazardShape.lineTo(0,.43);hazardShape.closePath()
      const hazard=makeFlatMesh(new THREE.ShapeGeometry(hazardShape),hazardMaterial,`${group.name}-danger-zone`);hazard.position.z=.003
      group.add(outline,back,fill,hazard);root.add(group);return {group,fill,fillMaterial}
    }
    const left=makeArrow('left'),right=makeArrow('right')
    const cursorMaterial=new THREE.MeshBasicMaterial({color:0xfff8dc,depthTest:false,depthWrite:false,toneMapped:false})
    const cursorOutlineMaterial=new THREE.MeshBasicMaterial({color:0x30372f,depthTest:false,depthWrite:false,toneMapped:false})
    const cursor=new THREE.Group();cursor.name='webgl-hud-bamboo-climb-cursor'
    const cursorOutline=makeFlatMesh(new THREE.RingGeometry(.28,.50,16),cursorOutlineMaterial,'webgl-hud-bamboo-climb-cursor-outline')
    const cursorFill=makeFlatMesh(new THREE.RingGeometry(.30,.39,16),cursorMaterial,'webgl-hud-bamboo-climb-cursor-fill');cursorFill.position.z=.001
    cursor.add(cursorOutline,cursorFill);root.add(cursor)
    const feedbackMaterial=pixelText.makeMaterial(0xffc34e,1,'webgl-hud-bamboo-climb-feedback-text')
    const metaMaterial=pixelText.makeMaterial(0xfff1c9,.96,'webgl-hud-bamboo-climb-meta-text')
    const feedback=pixelText.createLine({maxChars:14,material:feedbackMaterial,name:'webgl-hud-bamboo-climb-feedback',renderOrder:8})
    const progress=pixelText.createLine({maxChars:16,material:metaMaterial,name:'webgl-hud-bamboo-climb-progress',renderOrder:8})
    progress.visible=false
    const arcadeScore={
      heightLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'height','webgl-hud-bamboo-climb-arcade-height'),
      progress:makeArcadeNumber(scoreAtlasMaterial,3,'webgl-hud-bamboo-climb-arcade-progress'),
      percent:makeArcadeNumber(scoreAtlasMaterial,1,'webgl-hud-bamboo-climb-arcade-percent'),
      rise:makeArcadeNumber(scoreAtlasMaterial,3,'webgl-hud-bamboo-climb-arcade-rise'),
      centimetreLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'centimetre','webgl-hud-bamboo-climb-arcade-centimetre'),
    }
    arcadeScore.percent.setText('%');arcadeScore.rise.group.visible=false;arcadeScore.centimetreLabel.visible=false
    const exitText=pixelText.createLine({maxChars:4,material:metaMaterial,name:'webgl-hud-bamboo-climb-exit-text',renderOrder:8});exitText.userData.pixelText.setText('退出')
    const exitBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),outlineMaterial,'webgl-hud-bamboo-climb-exit-back')
    const exitFill=makeFlatMesh(new THREE.PlaneGeometry(1,1),backMaterial,'webgl-hud-bamboo-climb-exit-fill');exitFill.position.z=.001
    const exitRoot=new THREE.Group();exitRoot.name='webgl-hud-bamboo-climb-exit';exitText.position.z=.002;exitRoot.add(exitBack,exitFill,exitText)
    root.add(feedback,progress,arcadeScore.heightLabel,arcadeScore.progress.group,arcadeScore.percent.group,arcadeScore.rise.group,arcadeScore.centimetreLabel,exitRoot)
    bambooClimbHud={root,left,right,cursor,feedback,progress,arcadeScore,exitRoot,exitBack,exitFill,exitText,exitBounds:null,arrowScale:[1,1]}
  }

  const makeLongJumpHud=scoreAtlasMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-long-jump';root.visible=false;scene.add(root)
    const outlineMaterial=new THREE.MeshBasicMaterial({color:0x302c25,transparent:true,opacity:.98,depthTest:false,depthWrite:false,toneMapped:false})
    const warmMaterial=new THREE.MeshBasicMaterial({color:0xfff8dc,transparent:true,opacity:.96,depthTest:false,depthWrite:false,toneMapped:false})
    const targetMaterial=new THREE.MeshBasicMaterial({color:0xe9bd55,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false})
    const dangerMaterial=new THREE.MeshBasicMaterial({color:0xa83d31,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false})
    const clockRoot=new THREE.Group();clockRoot.name='webgl-hud-long-jump-clock'
    const clockOutline=makeFlatMesh(new THREE.RingGeometry(.405,.50,48),outlineMaterial,'webgl-hud-long-jump-clock-outline')
    const clockFace=makeFlatMesh(new THREE.CircleGeometry(.40,48),warmMaterial,'webgl-hud-long-jump-clock-face');clockFace.position.z=.001
    const target=makeFlatMesh(new THREE.PlaneGeometry(.16,.08),targetMaterial,'webgl-hud-long-jump-clock-target');target.position.set(0,.34,.002)
    const needlePivot=new THREE.Group();needlePivot.name='webgl-hud-long-jump-clock-needle';needlePivot.position.z=.004
    const needle=makeFlatMesh(new THREE.PlaneGeometry(.055,.33),outlineMaterial,'webgl-hud-long-jump-clock-needle-shape');needle.position.y=.145
    const hub=makeFlatMesh(new THREE.CircleGeometry(.075,24),targetMaterial,'webgl-hud-long-jump-clock-hub');hub.position.z=.001
    needlePivot.add(needle,hub);clockRoot.add(clockOutline,clockFace,target,needlePivot);root.add(clockRoot)
    const powerRoot=new THREE.Group();powerRoot.name='webgl-hud-long-jump-power'
    const powerFillMaterial=new THREE.MeshBasicMaterial({color:0xf0a128,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false})
    const powerOutline=makeFlatMesh(new THREE.PlaneGeometry(.82,.19),outlineMaterial,'webgl-hud-long-jump-power-outline')
    const powerBack=makeFlatMesh(new THREE.PlaneGeometry(.78,.13),warmMaterial,'webgl-hud-long-jump-power-back');powerBack.position.z=.001
    const powerFill=makeFlatMesh(new THREE.PlaneGeometry(.78,.13),powerFillMaterial,'webgl-hud-long-jump-power-fill');powerFill.position.z=.002
    const danger=makeFlatMesh(new THREE.PlaneGeometry(.036,.25),dangerMaterial,'webgl-hud-long-jump-power-line');danger.position.set(.39,0,.003)
    powerRoot.add(powerOutline,powerBack,powerFill,danger);root.add(powerRoot)
    const textPanelMaterial=new THREE.MeshBasicMaterial({color:0xfff4d2,transparent:true,opacity:.90,depthTest:false,depthWrite:false,toneMapped:false})
    const titleBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),textPanelMaterial,'webgl-hud-long-jump-title-back')
    const metaBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),textPanelMaterial,'webgl-hud-long-jump-meta-back')
    const resultPanelMaterial=new THREE.MeshBasicMaterial({color:0x241b14,transparent:true,opacity:.86,depthTest:false,depthWrite:false,toneMapped:false})
    const resultBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),resultPanelMaterial,'webgl-hud-long-jump-result-back')
    const title=makeSmoothText({name:'webgl-hud-long-jump-title',fontSize:72,fontWeight:700})
    const meta=makeSmoothText({name:'webgl-hud-long-jump-meta',fontSize:54,fontWeight:600,color:'#302820'})
    const result=makeSmoothText({name:'webgl-hud-long-jump-result',fontSize:72,fontWeight:700})
    titleBack.position.z=metaBack.position.z=resultBack.position.z=-.002
    result.visible=resultBack.visible=false
    const arcadeScore={
      root:new THREE.Group(),
      distanceLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'distance','webgl-hud-long-jump-arcade-distance'),
      distance:makeArcadeNumber(scoreAtlasMaterial,4,'webgl-hud-long-jump-arcade-distance-value'),
      metreLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'metre','webgl-hud-long-jump-arcade-metre'),
    }
    arcadeScore.root.name='webgl-hud-long-jump-arcade-score';arcadeScore.root.visible=false
    arcadeScore.root.add(arcadeScore.distanceLabel,arcadeScore.distance.group,arcadeScore.metreLabel)
    root.add(titleBack,metaBack,resultBack,title,meta,result,arcadeScore.root)
    const makeButton=(id,label)=>{
      const buttonRoot=new THREE.Group();buttonRoot.name=`webgl-hud-long-jump-${id}`
      const back=makeFlatMesh(new THREE.PlaneGeometry(1,1),outlineMaterial,`${buttonRoot.name}-back`)
      const fill=makeFlatMesh(new THREE.PlaneGeometry(1,1),warmMaterial,`${buttonRoot.name}-fill`);fill.position.z=.001
      const text=makeSmoothText({name:`${buttonRoot.name}-text`,width:256,height:128,fontSize:56,fontWeight:650,color:'#302c25',renderOrder:10});text.userData.smoothText.setText(label);text.position.z=.002
      buttonRoot.add(back,fill,text);root.add(buttonRoot);return {root:buttonRoot,back,fill,text,bounds:null}
    }
    const exit=makeButton('exit','退出')
    longJumpHud={root,clockRoot,needlePivot,powerRoot,powerFill,titleBack,metaBack,resultBack,title,meta,result,arcadeScore,exit,lastText:''}
  }

  const makeJacksHud=scoreAtlasMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-jacks';root.visible=false;scene.add(root)
    const outlineMaterial=new THREE.MeshBasicMaterial({color:0x302c25,transparent:true,opacity:.94,depthTest:false,depthWrite:false,toneMapped:false})
    const warmMaterial=new THREE.MeshBasicMaterial({color:0xfff8dc,transparent:true,opacity:.92,depthTest:false,depthWrite:false,toneMapped:false})
    const instructionMaterial=pixelText.makeMaterial(0xfff1cf,1,'webgl-hud-jacks-instruction-material')
    const instruction=pixelText.createLine({maxChars:14,material:instructionMaterial,name:'webgl-hud-jacks-instruction',renderOrder:10});instruction.userData.pixelText.setText('点击石子 再接子王')
    const arcadeScore={
      grabLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'grab','webgl-hud-jacks-grab-label'),stage:makeArcadeNumber(scoreAtlasMaterial,1,'webgl-hud-jacks-stage'),
      remainingLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'remaining','webgl-hud-jacks-remaining-label'),remaining:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-jacks-remaining'),
      comboLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'combo','webgl-hud-jacks-combo-label'),combo:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-jacks-combo'),
      missesLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'misses','webgl-hud-jacks-misses-label'),misses:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-jacks-misses'),
    }
    const makeButton=(id,label)=>{
      const buttonRoot=new THREE.Group();buttonRoot.name=`webgl-hud-jacks-${id}`
      const back=makeFlatMesh(new THREE.PlaneGeometry(1,1),outlineMaterial,`${buttonRoot.name}-back`)
      const buttonFill=makeFlatMesh(new THREE.PlaneGeometry(1,1),warmMaterial,`${buttonRoot.name}-fill`);buttonFill.position.z=.001
      const text=pixelText.createLine({maxChars:2,material:pixelText.makeMaterial(0x302c25,1,`${buttonRoot.name}-text-material`),name:`${buttonRoot.name}-text`,renderOrder:10});text.userData.pixelText.setText(label);text.position.z=.002
      buttonRoot.add(back,buttonFill,text);root.add(buttonRoot);return {root:buttonRoot,back,fill:buttonFill,text,bounds:null}
    }
    const exit=makeButton('exit','退出')
    scene.add(exit.root)
    root.add(instruction,...Object.values(arcadeScore).map(value=>value.group??value))
    jacksHud={root,instruction,arcadeScore,exit,scoreBounds:null}
  }

  const makeFlagRaisingHud=hintMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-flag-raising';root.visible=false;scene.add(root)
    const outline=new THREE.MeshBasicMaterial({color:0x302c25,transparent:true,opacity:.94,depthTest:false,depthWrite:false,toneMapped:false})
    const warm=new THREE.MeshBasicMaterial({color:0xfff8dc,transparent:true,opacity:.94,depthTest:false,depthWrite:false,toneMapped:false})
    const instructionMaterial=hintMaterial.clone();instructionMaterial.name='webgl-hud-flag-raising-instruction-material'
    const instructions=Object.fromEntries(Object.entries(GENERATED_FLAG_RAISING_TEXT_RECTS).map(([name,rect])=>{
      const entry=makeAtlasMesh(instructionMaterial,rect,GENERATED_TEXT_ATLAS_SIZE,`webgl-hud-flag-raising-instruction-${name}`)
      entry.mesh.renderOrder=10;entry.mesh.userData.atlasAspect=entry.aspect;return[name,entry.mesh]
    }))
    const instruction=instructions.desktop;instruction.visible=true
    const exitRoot=new THREE.Group();exitRoot.name='webgl-hud-flag-raising-exit'
    const exitBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),outline,'webgl-hud-flag-raising-exit-back')
    const exitFill=makeFlatMesh(new THREE.PlaneGeometry(1,1),warm,'webgl-hud-flag-raising-exit-fill');exitFill.position.z=.001
    const exitText=pixelText.createLine({maxChars:2,material:pixelText.makeMaterial(0x302c25,1,'webgl-hud-flag-raising-exit-text-material'),name:'webgl-hud-flag-raising-exit-text',renderOrder:10})
    exitText.userData.pixelText.setText('退出');exitText.position.z=.002
    exitRoot.add(exitBack,exitFill,exitText);root.add(...Object.values(instructions),exitRoot)
    flagRaisingHud={root,instructions,instruction,instructionText:FLAG_RAISING_HUD_TEXT.desktop,exitRoot,exitBack,exitFill,exitText,exitBounds:null,lastKey:null,instructionBaseScale:[1,1],instructionPixelSize:[0,0],completeStartedAt:0}
  }

  const makeHopscotchHud=scoreAtlasMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-hopscotch';root.visible=false;scene.add(root)
    const outline=new THREE.MeshBasicMaterial({color:0x302c25,transparent:true,opacity:.98,depthTest:false,depthWrite:false,toneMapped:false})
    const warm=new THREE.MeshBasicMaterial({color:0xfff8dc,transparent:true,opacity:.94,depthTest:false,depthWrite:false,toneMapped:false})
    const instruction=pixelText.createLine({maxChars:14,material:pixelText.makeMaterial(0xfff1cf,1,'webgl-hud-hopscotch-instruction-material'),name:'webgl-hud-hopscotch-instruction',renderOrder:10});instruction.userData.pixelText.setText('瞄准后按住 松手投片')
    const arcadeScore={targetLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'target','webgl-hud-hopscotch-target-label'),target:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-hopscotch-target'),bestLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'best','webgl-hud-hopscotch-best-label'),best:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-hopscotch-best')}
    const exitBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),outline,'webgl-hud-hopscotch-exit-back')
    const exitFill=makeFlatMesh(new THREE.PlaneGeometry(1,1),warm,'webgl-hud-hopscotch-exit-fill');exitFill.position.z=.001
    const exitText=pixelText.createLine({maxChars:2,material:pixelText.makeMaterial(0x302c25,1,'webgl-hud-hopscotch-exit-text-material'),name:'webgl-hud-hopscotch-exit-text',renderOrder:10});exitText.userData.pixelText.setText('退出');exitText.position.z=.002
    const exitRoot=new THREE.Group();exitRoot.name='webgl-hud-hopscotch-exit';exitRoot.add(exitBack,exitFill,exitText)
    root.add(instruction,...Object.values(arcadeScore).map(value=>value.group??value),exitRoot);hopscotchHud={root,instruction,arcadeScore,exitRoot,exitBack,exitFill,exitText,exitBounds:null,scoreBounds:null}
  }

  const makeShuttlecockHud=scoreAtlasMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-shuttlecock';root.visible=false;scene.add(root)
    const outlineMaterial=new THREE.MeshBasicMaterial({color:0x302c25,transparent:true,opacity:.98,depthTest:false,depthWrite:false,toneMapped:false})
    const warmMaterial=new THREE.MeshBasicMaterial({color:0xfff8dc,transparent:true,opacity:.95,depthTest:false,depthWrite:false,toneMapped:false})
    const prompt=pixelText.createLine({maxChars:10,material:pixelText.makeMaterial(0xfff1cf,1,'webgl-hud-shuttlecock-prompt-material'),name:'webgl-hud-shuttlecock-prompt',renderOrder:10});prompt.userData.pixelText.setText('看准时机')
    const arcadeScore={streakLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'streak','webgl-hud-shuttlecock-streak-label'),streak:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-shuttlecock-streak'),bestLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'best','webgl-hud-shuttlecock-best-label'),best:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-shuttlecock-best')}
    const makeFoot=(side,label)=>{
      const footRoot=new THREE.Group();footRoot.name=`webgl-hud-shuttlecock-${side}`
      const back=makeFlatMesh(new THREE.PlaneGeometry(1,1),outlineMaterial,`${footRoot.name}-outline`)
      const fill=makeFlatMesh(new THREE.PlaneGeometry(.92,.84),warmMaterial.clone(),`${footRoot.name}-fill`);fill.position.z=.001
      const text=pixelText.createLine({maxChars:1,material:pixelText.makeMaterial(0x302c25,1,`${footRoot.name}-text-material`),name:`${footRoot.name}-text`,renderOrder:10});text.userData.pixelText.setText(label);text.position.z=.002
      footRoot.add(back,fill,text);root.add(footRoot);return {root:footRoot,fill,text,bounds:null}
    }
    const left=makeFoot('left','左'),right=makeFoot('right','右')
    const exitRoot=new THREE.Group();exitRoot.name='webgl-hud-shuttlecock-exit'
    const exitBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),outlineMaterial,'webgl-hud-shuttlecock-exit-back')
    const exitFill=makeFlatMesh(new THREE.PlaneGeometry(1,1),warmMaterial,'webgl-hud-shuttlecock-exit-fill');exitFill.position.z=.001
    const exitText=pixelText.createLine({maxChars:2,material:pixelText.makeMaterial(0x302c25,1,'webgl-hud-shuttlecock-exit-text-material'),name:'webgl-hud-shuttlecock-exit-text',renderOrder:10});exitText.userData.pixelText.setText('退出');exitText.position.z=.002
    exitRoot.add(exitBack,exitFill,exitText);root.add(prompt,...Object.values(arcadeScore).map(value=>value.group??value),exitRoot)
    shuttlecockHud={root,prompt,arcadeScore,left,right,exitRoot,exitBack,exitFill,exitText,exitBounds:null,scoreBounds:null,warmColor:0xfff8dc}
  }

  const makeBasketballHud=scoreAtlasMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-basketball';root.visible=false;scene.add(root)
    const outlineMaterial=new THREE.MeshBasicMaterial({color:0xffe8ad,transparent:true,opacity:.92,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false})
    const feedbackTextMaterial=pixelText.makeMaterial(0xffaa39,1,'webgl-hud-pixel-text-feedback')
    const arcadeScore={
      scoreLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'score','webgl-hud-basketball-arcade-score-label'),
      score:makeArcadeNumber(scoreAtlasMaterial,3,'webgl-hud-basketball-arcade-score'),
      hitLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'hit','webgl-hud-basketball-arcade-hit-label'),
      hits:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-basketball-arcade-hits'),
      slash:makeArcadeNumber(scoreAtlasMaterial,1,'webgl-hud-basketball-arcade-slash'),
      shotsLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'shots','webgl-hud-basketball-arcade-shots-label'),
      shots:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-basketball-arcade-shots'),
    }
    arcadeScore.slash.setText('/')
    root.add(arcadeScore.scoreLabel,arcadeScore.score.group,arcadeScore.hitLabel,arcadeScore.hits.group,arcadeScore.slash.group,arcadeScore.shotsLabel,arcadeScore.shots.group)

    const feedbackRoot=new THREE.Group();feedbackRoot.name='webgl-hud-basketball-score-feedback';feedbackRoot.visible=false;scene.add(feedbackRoot)
    const feedbackBackMaterial=new THREE.MeshBasicMaterial({color:0x10150f,transparent:true,opacity:.90,depthTest:false,depthWrite:false,toneMapped:false})
    const feedbackBorder=makeFlatMesh(new THREE.PlaneGeometry(1,1),outlineMaterial,'webgl-hud-basketball-score-feedback-border')
    const feedbackBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),feedbackBackMaterial,'webgl-hud-basketball-score-feedback-background');feedbackBack.position.z=.001
    const feedbackTitle=pixelText.createLine({maxChars:4,material:feedbackTextMaterial,name:'webgl-hud-basketball-score-feedback-title',renderOrder:8});feedbackTitle.position.z=.002
    const feedbackLine=pixelText.createLine({maxChars:9,material:feedbackTextMaterial,name:'webgl-hud-basketball-score-feedback-text',renderOrder:8});feedbackLine.position.z=.002
    feedbackTitle.userData.pixelText.setText('命中');feedbackRoot.add(feedbackBorder,feedbackBack,feedbackTitle,feedbackLine)

    const chargeRoot=new THREE.Group();chargeRoot.name='webgl-hud-basketball-charge';chargeRoot.visible=false;scene.add(chargeRoot)
    const chargeBorderMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.45,depthTest:false,depthWrite:false,toneMapped:false})
    const chargeBackMaterial=new THREE.MeshBasicMaterial({color:0x161c17,transparent:true,opacity:.65,depthTest:false,depthWrite:false,toneMapped:false})
    const guideShadowMaterial=new THREE.MeshBasicMaterial({color:0x2b3028,transparent:true,opacity:.35,depthTest:false,depthWrite:false,toneMapped:false})
    const guideMaterial=new THREE.MeshBasicMaterial({color:0xfff8d5,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false})
    const chargeMaterial=new THREE.ShaderMaterial({
      uniforms:{
        normalLeft:{value:new THREE.Color(0xf1c55e)},normalRight:{value:new THREE.Color(0xd85e39)},
        reachableLeft:{value:new THREE.Color(0xefc65e)},reachableRight:{value:new THREE.Color(0x78b66d)},reachable:{value:0},
      },
      vertexShader:'varying vec2 hudUv; void main(){hudUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec2 hudUv; uniform vec3 normalLeft; uniform vec3 normalRight; uniform vec3 reachableLeft; uniform vec3 reachableRight; uniform float reachable; void main(){vec3 normalColor=mix(normalLeft,normalRight,hudUv.x);vec3 reachableColor=mix(reachableLeft,reachableRight,hudUv.x);gl_FragColor=vec4(mix(normalColor,reachableColor,reachable),1.0);\n#include <colorspace_fragment>\n}',
      transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
    })
    const chargeBorder=makeFlatMesh(new THREE.PlaneGeometry(.50,.038),chargeBorderMaterial,'webgl-hud-basketball-charge-border')
    const chargeBack=makeFlatMesh(new THREE.PlaneGeometry(.492,.030),chargeBackMaterial,'webgl-hud-basketball-charge-background');chargeBack.position.z=.001
    const chargeFill=makeFlatMesh(new THREE.PlaneGeometry(.492,.030),chargeMaterial,'webgl-hud-basketball-charge-fill');chargeFill.position.z=.002
    const guideShadow=makeFlatMesh(new THREE.PlaneGeometry(.010,.058),guideShadowMaterial,'webgl-hud-basketball-charge-guide-shadow');guideShadow.position.z=.003
    const guide=makeFlatMesh(new THREE.PlaneGeometry(.006,.052),guideMaterial,'webgl-hud-basketball-charge-guide');guide.position.z=.004
    chargeBorder.renderOrder=3;chargeBack.renderOrder=4;chargeFill.renderOrder=5;guideShadow.renderOrder=6;guide.renderOrder=7
    chargeRoot.add(chargeBorder,chargeBack,chargeFill,guideShadow,guide)
    const buttonRoot=new THREE.Group();buttonRoot.name='webgl-hud-basketball-shoot-button';buttonRoot.visible=false;scene.add(buttonRoot)
    const buttonOutlineMaterial=new THREE.MeshBasicMaterial({color:0x30372f,transparent:true,opacity:.92,depthTest:false,depthWrite:false,toneMapped:false})
    const buttonFillMaterial=new THREE.MeshBasicMaterial({color:0xfff8d5,transparent:true,opacity:.94,depthTest:false,depthWrite:false,toneMapped:false})
    const buttonOutline=makeFlatMesh(new THREE.CircleGeometry(.5,48),buttonOutlineMaterial,'webgl-hud-basketball-shoot-button-outline')
    const buttonFill=makeFlatMesh(new THREE.CircleGeometry(.455,48),buttonFillMaterial,'webgl-hud-basketball-shoot-button-fill');buttonFill.position.z=.001
    const buttonIcon=interactionMeshes.get('shoot-basketball').mesh.clone();buttonIcon.name='webgl-hud-basketball-shoot-button-icon';buttonIcon.visible=true;buttonIcon.scale.setScalar(.72);buttonIcon.position.z=.002;buttonIcon.renderOrder=10
    buttonOutline.renderOrder=8;buttonFill.renderOrder=9;buttonRoot.add(buttonOutline,buttonFill,buttonIcon)
    basketballHud={root,arcadeScore,scoreBounds:null,feedbackRoot,feedbackBorder,feedbackBack,feedbackTitle,feedbackLine,chargeRoot,chargeFill,chargeMaterial,guide,guideShadow,buttonRoot,buttonFill,buttonIcon,buttonBounds:null,lastPressed:null,lastScore:null}
  }

  const makeSlingshotHud=scoreAtlasMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-slingshot';root.visible=false;scene.add(root)
    const slingshotPhrases=arcadeComicHud.textEntries.slingshot.phrases
    const wood=slingshotPhrases.wood.mesh.clone(),wire=slingshotPhrases.wire.mesh.clone()
    wood.name='webgl-hud-slingshot-selected-wood';wire.name='webgl-hud-slingshot-selected-wire';wood.visible=true;wire.visible=false
    const arcadeScore={
      hitLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'hit','webgl-hud-slingshot-hit-label'),
      hits:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-slingshot-hits'),
      slash:makeArcadeNumber(scoreAtlasMaterial,1,'webgl-hud-slingshot-slash'),
      shotsLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'shots','webgl-hud-slingshot-shots-label'),
      shots:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-slingshot-shots'),
      distanceLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'distance','webgl-hud-slingshot-distance-label'),
      distance:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-slingshot-distance'),
      metreLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'metre','webgl-hud-slingshot-metre-label'),
    }
    arcadeScore.slash.setText('/')
    const instruction=makeSmoothText({name:'webgl-hud-slingshot-instruction',width:1024,height:128,fontSize:46,fontWeight:650,color:'#fff8dc',strokeColor:'#302c25',strokeWidth:12,renderOrder:10})
    instruction.userData.smoothText.setText('W／↑ 5米　S／↓ 10米')
    root.add(wood,wire,instruction,...Object.values(arcadeScore).map(value=>value.group??value))
    slingshotHud={root,wood,wire,instruction,arcadeScore,bounds:null,lastKey:null}
  }

  const applyBasketballScore=()=>{
    if(!basketballHud)return
    const points=THREE.MathUtils.clamp(Math.round(basketballState.points??0),0,999)
    const hits=THREE.MathUtils.clamp(Math.round(basketballState.hits??0),0,99)
    const attempts=THREE.MathUtils.clamp(Math.round(basketballState.attempts??0),0,99)
    const key=`${points}/${hits}/${attempts}`
    if(basketballHud.lastScore===key)return
    basketballHud.lastScore=key
    basketballHud.arcadeScore.score.setText(String(points).padStart(3,'0'))
    basketballHud.arcadeScore.hits.setText(String(hits).padStart(2,'0'))
    basketballHud.arcadeScore.shots.setText(String(attempts).padStart(2,'0'))
  }

  const makePingPongHud=scoreAtlasMaterial=>{
    const root=new THREE.Group();root.name='webgl-hud-ping-pong';root.visible=false;scene.add(root)
    const arcadeScore={
      playerLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'player','webgl-hud-ping-pong-arcade-player'),
      player:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-ping-pong-arcade-player-score'),
      colon:makeArcadeNumber(scoreAtlasMaterial,1,'webgl-hud-ping-pong-arcade-colon'),
      ai:makeArcadeNumber(scoreAtlasMaterial,2,'webgl-hud-ping-pong-arcade-ai-score'),
      computerLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'computer','webgl-hud-ping-pong-arcade-computer'),
      practiceLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'practice','webgl-hud-ping-pong-arcade-practice'),
      matchLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'match7','webgl-hud-ping-pong-arcade-match7'),
      serveLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'serve','webgl-hud-ping-pong-arcade-serve'),
      serverPlayerLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'player','webgl-hud-ping-pong-arcade-server-player'),
      serverComputerLabel:makeArcadeScoreLabel(scoreAtlasMaterial,'computer','webgl-hud-ping-pong-arcade-server-computer'),
    }
    arcadeScore.colon.setText(':')
    const markerShape=new THREE.Shape();markerShape.moveTo(-.5,.35);markerShape.lineTo(.5,.35);markerShape.lineTo(0,-.5);markerShape.closePath()
    const markerGeometry=new THREE.ShapeGeometry(markerShape)
    const serveMarker=new THREE.Group();serveMarker.name='webgl-hud-ping-pong-serve-marker'
    const makeMarkerLayer=(name,color,x,y,z)=>{
      const material=new THREE.MeshBasicMaterial({color,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
      const mesh=makeFlatMesh(markerGeometry,material,name);mesh.position.set(x,y,z);return mesh
    }
    serveMarker.add(
      makeMarkerLayer('webgl-hud-ping-pong-serve-marker-blue',0x073da5,.14,-.14,.001),
      makeMarkerLayer('webgl-hud-ping-pong-serve-marker-red',0xf12b16,.07,-.07,.002),
      makeMarkerLayer('webgl-hud-ping-pong-serve-marker-yellow',0xffd400,0,0,.003),
    )
    root.add(arcadeScore.playerLabel,arcadeScore.player.group,arcadeScore.colon.group,arcadeScore.ai.group,arcadeScore.computerLabel,arcadeScore.practiceLabel,arcadeScore.matchLabel,arcadeScore.serveLabel,arcadeScore.serverPlayerLabel,arcadeScore.serverComputerLabel,serveMarker)

    const feedbackRoot=new THREE.Group();feedbackRoot.name='webgl-hud-ping-pong-side-feedback';feedbackRoot.visible=false;scene.add(feedbackRoot)
    const outlineMaterial=new THREE.MeshBasicMaterial({color:0xffe8ad,transparent:true,opacity:.92,depthTest:false,depthWrite:false,toneMapped:false})
    const feedbackBackMaterial=new THREE.MeshBasicMaterial({color:0x10150f,transparent:true,opacity:.90,depthTest:false,depthWrite:false,toneMapped:false})
    const feedbackMaterial=pixelText.makeMaterial(0xffaa39,1,'webgl-hud-ping-pong-feedback-text')
    const feedbackBorder=makeFlatMesh(new THREE.PlaneGeometry(1,1),outlineMaterial,'webgl-hud-ping-pong-feedback-border')
    const feedbackBack=makeFlatMesh(new THREE.PlaneGeometry(1,1),feedbackBackMaterial,'webgl-hud-ping-pong-feedback-background');feedbackBack.position.z=.001
    const feedbackTitle=pixelText.createLine({maxChars:6,material:feedbackMaterial,name:'webgl-hud-ping-pong-feedback-title',renderOrder:8});feedbackTitle.position.z=.002
    const feedbackDetail=pixelText.createLine({maxChars:12,material:feedbackMaterial,name:'webgl-hud-ping-pong-feedback-detail',renderOrder:8});feedbackDetail.position.z=.002
    feedbackRoot.add(feedbackBorder,feedbackBack,feedbackTitle,feedbackDetail)
    pingPongHud={root,arcadeScore,serveMarker,scoreBounds:null,feedbackRoot,feedbackBorder,feedbackBack,feedbackTitle,feedbackDetail,lastScore:null}
  }

  const applyPingPongScore=()=>{
    if(!pingPongHud)return
    const player=THREE.MathUtils.clamp(Math.round(pingPongState.playerScore??0),0,99)
    const ai=THREE.MathUtils.clamp(Math.round(pingPongState.aiScore??0),0,99)
    const key=`${player}/${ai}/${pingPongState.mode}/${pingPongState.server}/${pingPongState.prompt}`
    if(pingPongHud.lastScore===key)return
    pingPongHud.lastScore=key
    pingPongHud.arcadeScore.player.setText(String(player))
    pingPongHud.arcadeScore.ai.setText(String(ai))
    const isMatch=pingPongState.mode==='7分比赛'
    pingPongHud.arcadeScore.practiceLabel.visible=!isMatch;pingPongHud.arcadeScore.matchLabel.visible=isMatch
    const playerServes=pingPongState.server==='玩家'
    pingPongHud.arcadeScore.serverPlayerLabel.visible=playerServes;pingPongHud.arcadeScore.serverComputerLabel.visible=!playerServes
    const markerX=playerServes?pingPongHud.serveMarker.userData.playerX:pingPongHud.serveMarker.userData.aiX
    if(Number.isFinite(markerX))pingPongHud.serveMarker.position.x=markerX
  }

  const redrawViewButton=()=>{
    if(!viewButton)return
    const {canvas,texture}=viewButton,ctx=canvas.getContext('2d')
    ctx.clearRect(0,0,canvas.width,canvas.height)
    const drawButton=(offset,{label,detail,icon})=>{
      ctx.lineJoin='round';ctx.lineCap='round'
      ctx.fillStyle='rgba(255,250,226,.96)';ctx.strokeStyle='rgba(49,55,47,.88)';ctx.lineWidth=7
      ctx.beginPath();ctx.roundRect(offset+10,10,364,124,28);ctx.fill();ctx.stroke()
      ctx.strokeStyle='rgba(135,96,39,.76)';ctx.lineWidth=4
      if(icon==='record'){
        ctx.beginPath();ctx.roundRect(offset+39,43,50,58,5);ctx.stroke()
        ctx.beginPath();ctx.moveTo(offset+51,43);ctx.lineTo(offset+51,101);ctx.moveTo(offset+61,59);ctx.lineTo(offset+80,59);ctx.moveTo(offset+61,72);ctx.lineTo(offset+80,72);ctx.moveTo(offset+61,85);ctx.lineTo(offset+76,85);ctx.stroke()
      }else{
        ctx.beginPath();ctx.arc(offset+64,72,24,0,Math.PI*2);ctx.stroke()
        ctx.beginPath();ctx.moveTo(offset+52,72);ctx.lineTo(offset+62,82);ctx.lineTo(offset+79,61);ctx.stroke()
      }
      ctx.fillStyle='#30372f';ctx.textAlign='center';ctx.textBaseline='middle'
      if(isTouchMode()){
        ctx.font='600 42px system-ui, sans-serif';ctx.fillText(label,offset+230,73)
      }else{
        ctx.font='600 38px system-ui, sans-serif';ctx.fillText(label,offset+230,54)
        ctx.fillStyle='rgba(49,55,47,.72)';ctx.font='600 25px system-ui, sans-serif';ctx.fillText(detail,offset+230,105)
      }
    }
    drawButton(0,{label:viewMode==='walk'?'鸟瞰':'第一人称',detail:'快捷键 V',icon:'view'})
    drawButton(384,{label:'个人记录',detail:'查看校园足迹',icon:'record'})
    texture.needsUpdate=true
  }

  const makeViewButton=()=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=144
    const texture=configureTexture(new THREE.CanvasTexture(canvas),renderer,false)
    const material=new THREE.MeshBasicMaterial({name:'webgl-hud-view-toggle-material',map:texture,transparent:true,depthTest:false,depthWrite:false})
    const geometry=new THREE.PlaneGeometry(1,1);setAtlasUv(geometry,[0,0,384,144],[768,144])
    const mesh=new THREE.Mesh(geometry,material)
    mesh.name='webgl-hud-view-toggle';mesh.frustumCulled=false;mesh.renderOrder=2;mesh.visible=false
    const personalGeometry=new THREE.PlaneGeometry(1,1);setAtlasUv(personalGeometry,[384,0,384,144],[768,144])
    const personalMesh=new THREE.Mesh(personalGeometry,material)
    personalMesh.name='webgl-hud-personal-record';personalMesh.frustumCulled=false;personalMesh.renderOrder=2;personalMesh.visible=false
    scene.add(mesh,personalMesh);viewButton={canvas,texture,mesh,aspect:384/144};personalRecordButton={mesh:personalMesh,aspect:384/144};redrawViewButton()
  }

  const makePointWalkUi=()=>{
    // The lower atlas cell is populated by makeMinigamePauseHud. Sharing this
    // resident canvas keeps the pause card from adding a runtime texture.
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=472
    const context=canvas.getContext('2d')
    context.fillStyle='rgba(255,249,223,.94)';context.strokeStyle='rgba(48,53,47,.92)';context.lineWidth=6
    context.beginPath();context.roundRect(8,8,304,64,12);context.fill();context.stroke()
    context.shadowColor='rgba(76,255,125,.88)';context.shadowBlur=10;context.strokeStyle='#48e978';context.lineWidth=6
    context.beginPath();context.arc(43,40,11,0,Math.PI*2);context.stroke();context.shadowBlur=0
    context.fillStyle='#30352f';context.font='600 25px system-ui, sans-serif';context.textAlign='center';context.textBaseline='middle'
    context.fillText(isTouchMode()?'轻触前往 · 再次停止':'点击前往 · 再次停止',181,41)
    const texture=configureTexture(new THREE.CanvasTexture(canvas),renderer,false)
    const material=new THREE.MeshBasicMaterial({name:'webgl-hud-point-walk-status-material',map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
    const statusMesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material)
    setAtlasUv(statusMesh.geometry,[0,0,320,80],[canvas.width,canvas.height])
    statusMesh.name='webgl-hud-point-walk-status';statusMesh.visible=false;statusMesh.frustumCulled=false;statusMesh.renderOrder=14;scene.add(statusMesh)
    pointWalkUi={canvas,context,texture,material,statusMesh}
  }

  const makeMinigamePauseHud=()=>{
    const root=new THREE.Group();root.name='webgl-hud-minigame-pause';root.visible=false
    const shade=makeFlatMesh(
      new THREE.PlaneGeometry(2,2),
      new THREE.MeshBasicMaterial({name:'webgl-hud-minigame-pause-shade-material',color:0x15130f,transparent:true,opacity:.62,depthTest:false,depthWrite:false,toneMapped:false}),
      'webgl-hud-minigame-pause-shade',
    );shade.renderOrder=40
    const {canvas,context,texture,material}=pointWalkUi,cardY=80,cardWidth=640,cardHeight=392
    context.textAlign='center';context.textBaseline='middle';context.lineJoin='round'
    context.fillStyle='#302c25';context.beginPath();context.roundRect(0,cardY,cardWidth,cardHeight,13);context.fill()
    context.fillStyle='rgba(255,246,217,.98)';context.beginPath();context.roundRect(6,cardY+6,cardWidth-12,cardHeight-12,9);context.fill()
    context.fillStyle='#302820';context.font='800 56px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';context.fillText('暂停',320,cardY+100)
    context.fillStyle='#5b5144';context.font='600 25px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';context.fillText('选择继续游戏或返回校园',320,cardY+171)
    const drawButton=(x,label,primary=false)=>{
      context.fillStyle='#302c25';context.beginPath();context.roundRect(x-4,cardY+259,247,86,9);context.fill()
      context.fillStyle=primary?'#f0c760':'#fff6d9';context.beginPath();context.roundRect(x,cardY+263,239,78,6);context.fill()
      context.fillStyle='#302820';context.font='750 34px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';context.fillText(label,x+119.5,cardY+302)
    }
    drawButton(68,'继续游戏',true);drawButton(333,'返回校园');texture.needsUpdate=true
    const cardGeometry=new THREE.PlaneGeometry(1,1);setAtlasUv(cardGeometry,[0,cardY,cardWidth,cardHeight],[canvas.width,canvas.height])
    const card=makeFlatMesh(cardGeometry,material,'webgl-hud-minigame-pause-card');card.position.z=.001;card.renderOrder=41
    const resume={bounds:null},exit={bounds:null}
    root.add(shade,card);scene.add(root)
    minigamePauseHud={root,shade,card,resume,exit}
  }

  const ensureGeneratedTextAtlas=()=>{
    if(generatedTextAtlas)return generatedTextAtlas
    const canvas=document.createElement('canvas');canvas.width=GENERATED_TEXT_ATLAS_SIZE[0];canvas.height=GENERATED_TEXT_ATLAS_SIZE[1]
    const context=canvas.getContext('2d')
    const texture=configureTexture(new THREE.CanvasTexture(canvas),renderer,false);texture.name='webgl-hud-generated-text-atlas'
    const material=new THREE.MeshBasicMaterial({name:'webgl-hud-generated-text-atlas-material',map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
    generatedTextAtlas={canvas,context,texture,material}
    return generatedTextAtlas
  }

  const makeMovementTutorials=()=>{
    const {context,texture,material}=ensureGeneratedTextAtlas()
    for(const [name,lines] of Object.entries(MOVEMENT_TUTORIAL_COPY)){
      const mobile=name==='mobile',[offsetX,offsetY,width,height]=MOVEMENT_TUTORIAL_RECTS[name]
      context.save();context.translate(offsetX,offsetY)
      context.textAlign='center';context.textBaseline='middle';context.lineJoin='round';context.lineCap='round'
      const drawText=(text,y,size,{marker=false,muted=false}={})=>{
        context.font=`600 ${size}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`
        const markerSpace=marker?48:0,textWidth=context.measureText(text).width,totalWidth=textWidth+markerSpace
        const textCenter=width/2+(marker?markerSpace/2:0)
        context.lineWidth=8;context.strokeStyle='rgba(35,40,35,.94)';context.strokeText(text,textCenter,y)
        context.fillStyle=muted?'rgba(255,248,220,.88)':'#fff8dc';context.fillText(text,textCenter,y)
        if(!marker)return
        const markerX=width/2-totalWidth/2+17
        context.strokeStyle='rgba(35,40,35,.94)';context.lineWidth=10
        context.beginPath();context.arc(markerX,y-3,13,0,Math.PI*2);context.stroke()
        context.beginPath();context.moveTo(markerX-8,y+8);context.lineTo(markerX,y+22);context.lineTo(markerX+8,y+8);context.stroke()
        context.strokeStyle='#48e978';context.lineWidth=6
        context.beginPath();context.arc(markerX,y-3,13,0,Math.PI*2);context.stroke()
        context.beginPath();context.moveTo(markerX-8,y+8);context.lineTo(markerX,y+22);context.lineTo(markerX+8,y+8);context.stroke()
      }
      if(mobile){
        drawText(lines[0],72,45,{marker:true})
        drawText(lines[1],148,38,{muted:true})
      }else{
        drawText(lines[0],70,40)
        drawText(lines[1],146,40,{marker:true})
      }
      context.restore()
      const geometry=new THREE.PlaneGeometry(1,1);setAtlasUv(geometry,MOVEMENT_TUTORIAL_RECTS[name],GENERATED_TEXT_ATLAS_SIZE)
      const mesh=new THREE.Mesh(geometry,material)
      mesh.name=`webgl-hud-tutorial-${name}`;mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=15
      const entry={mesh,aspect:width/height,lines:[...lines],panel:false,bounds:null}
      tutorialMeshes.set(name,entry);scene.add(mesh)
    }
    texture.needsUpdate=true
  }

  const addGroup=(definition,target,material,atlasSize,prefix)=>{
    for(const [name,rect] of Object.entries(definition)) {
      const entry=makeAtlasMesh(material,rect,atlasSize,`webgl-hud-${prefix}-${name}`)
      target.set(name,entry);scene.add(entry.mesh)
    }
  }

  const makeInteractionHintAtlas=()=>{
    const {context:ctx,texture,material}=ensureGeneratedTextAtlas(),rects={}
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.font='600 38px system-ui, sans-serif'
    Object.entries(INTERACTION_HINTS).forEach(([name,label],index)=>{
      const column=index%2,row=Math.floor(index/2),sourceX=column*HINT_CELL_SIZE[0],sourceY=row*HINT_CELL_SIZE[1]
      const [x,y]=generatedHintRect([sourceX,sourceY,...HINT_CELL_SIZE])
      rects[name]=[x,y,...HINT_CELL_SIZE]
      ctx.lineWidth=7;ctx.strokeStyle='rgba(39,44,38,.92)';ctx.strokeText(label,x+12,y+HINT_CELL_SIZE[1]/2)
      ctx.fillStyle='#fff8dc';ctx.fillText(label,x+12,y+HINT_CELL_SIZE[1]/2)
    })
    ctx.textAlign='center';ctx.font='650 46px "PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    Object.entries(FLAG_RAISING_HUD_TEXT).forEach(([name,label])=>{
      const [x,y,width,height]=GENERATED_FLAG_RAISING_TEXT_RECTS[name]
      ctx.lineWidth=12;ctx.strokeStyle='rgba(48,44,37,.96)';ctx.strokeText(label,x+width/2,y+height/2)
      ctx.fillStyle='#fff8dc';ctx.fillText(label,x+width/2,y+height/2)
    })
    texture.needsUpdate=true
    addGroup(rects,interactionHintMeshes,material,GENERATED_TEXT_ATLAS_SIZE,'interaction-hint')
    return material
  }

  const makeMinigameInstructionAtlas=()=>{
    const cellSize=[1024,256],{context:ctx,texture,material}=ensureGeneratedTextAtlas(),rects={}
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.lineJoin='round'
    Object.entries(MINIGAME_INSTRUCTIONS).forEach(([name,[title,...lines]],index)=>{
      const x=index%2*cellSize[0],y=Math.floor(index/2)*cellSize[1]
      rects[name]=[x,y,...cellSize]
      ctx.fillStyle='rgba(255,248,220,.94)';ctx.strokeStyle='rgba(39,44,38,.9)';ctx.lineWidth=7
      ctx.beginPath();ctx.roundRect(x+10,y+10,cellSize[0]-20,cellSize[1]-20,28);ctx.fill();ctx.stroke()
      ctx.fillStyle='#30372f';ctx.font='700 48px system-ui, sans-serif';ctx.fillText(title,x+42,y+48)
      ctx.font='600 34px system-ui, sans-serif'
      lines.forEach((line,lineIndex)=>ctx.fillText(line,x+42,y+104+lineIndex*54))
    })
    texture.needsUpdate=true
    addGroup(rects,minigameInstructionMeshes,material,GENERATED_TEXT_ATLAS_SIZE,'minigame-instruction')
  }

  const setPreservedScale=(entry,height)=>{
    const viewportAspect=Math.max(.1,renderer.domElement.clientWidth/Math.max(1,renderer.domElement.clientHeight))
    entry.mesh.scale.set(height*entry.aspect/viewportAspect,height,1)
  }

  const syncBambooClimbAim=()=>{
    if(!bambooClimbHud)return
    const aim=bambooClimbState.aim??[0,-.04]
    const activeCenter=bambooClimbState.arrowCenter??[-.36,-.04]
    const centerX=Math.max(.01,Math.abs(activeCenter[0])),centerY=activeCenter[1]
    bambooClimbHud.left.group.position.set(-centerX-aim[0],centerY-aim[1],0)
    bambooClimbHud.right.group.position.set(centerX-aim[0],centerY-aim[1],0)
    bambooClimbHud.cursor.position.set(0,0,.01)
  }

  const layout=()=>{
    for(const [name,entry] of interactionMeshes)setPreservedScale(entry,name==='default'?.12:.145)
    const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
    const hintWidthPx=Math.max(132,Math.min(256,viewportWidth/2-32)),hintHeightPx=hintWidthPx*HINT_CELL_SIZE[1]/HINT_CELL_SIZE[0]
    for(const entry of interactionHintMeshes.values()){
      const width=hintWidthPx/viewportWidth*2,height=hintHeightPx/viewportHeight*2
      entry.mesh.scale.set(width,height,1)
      entry.mesh.position.set((viewportWidth/2+20+hintWidthPx/2)/viewportWidth*2-1,1-(viewportHeight/2+14+hintHeightPx/2)/viewportHeight*2,0)
    }
    for(const entry of postureMeshes.values()){
      setPreservedScale(entry,.13)
      entry.mesh.position.set(1-entry.mesh.scale.x/2-.035,-1+entry.mesh.scale.y/2+.035,0)
    }
    if(pointWalkUi){
      const statusWidth=Math.min(180,viewportWidth*.46),statusHeight=statusWidth/4
      const bottomPx=isTouchMode()?22:18,centerY=-1+(bottomPx+statusHeight/2)/viewportHeight*2
      pointWalkUi.statusMesh.scale.set(statusWidth/viewportWidth*2,statusHeight/viewportHeight*2,1);pointWalkUi.statusMesh.position.set(0,centerY,0)
    }
    if(minigamePauseHud){
      let panelWidth=Math.min(460,viewportWidth-32),panelHeight=panelWidth*282/460
      if(panelHeight>viewportHeight-32){panelHeight=viewportHeight-32;panelWidth=panelHeight*460/282}
      minigamePauseHud.card.scale.set(panelWidth/viewportWidth*2,panelHeight/viewportHeight*2,1)
      const panelLeft=(viewportWidth-panelWidth)/2,panelTop=(viewportHeight-panelHeight)/2
      const mapBounds=(x,y,width,height)=>({
        left:panelLeft+x/640*panelWidth,right:panelLeft+(x+width)/640*panelWidth,
        top:panelTop+y/392*panelHeight,bottom:panelTop+(y+height)/392*panelHeight,
      })
      minigamePauseHud.resume.bounds=mapBounds(68,263,239,78)
      minigamePauseHud.exit.bounds=mapBounds(333,263,239,78)
    }
    for(const [name,entry] of tutorialMeshes){
      const mobile=name==='mobile',widthPx=Math.min(mobile?520:920,viewportWidth-(mobile?24:48))
      const heightPx=widthPx/entry.aspect,centerY=viewportHeight/2+(mobile?82:95)
      entry.mesh.scale.set(widthPx/viewportWidth*2,heightPx/viewportHeight*2,1)
      entry.mesh.position.set(0,1-centerY/viewportHeight*2,0)
      entry.bounds={left:(viewportWidth-widthPx)/2,right:(viewportWidth+widthPx)/2,top:centerY-heightPx/2,bottom:centerY+heightPx/2,width:widthPx,height:heightPx}
    }
    for(const entry of minigameTutorialMeshes.values()){
      setPreservedScale(entry,.24);entry.mesh.position.set(0,.57,0)
    }
    for(const entry of minigameInstructionMeshes.values()){
      setPreservedScale(entry,.27);entry.mesh.position.set(0,.24,0)
    }
    if(viewButton) {
      const viewportWidth=renderer.domElement.clientWidth,viewportHeight=Math.max(1,renderer.domElement.clientHeight)
      const viewportAspect=Math.max(.1,viewportWidth/viewportHeight)
      const height=.11,width=height*viewButton.aspect/viewportAspect,gap=10/viewportWidth*2
      viewButton.mesh.scale.set(width,height,1);viewButton.mesh.position.set(1-width/2-.035,.90,0)
      viewToggleBounds={left:(viewButton.mesh.position.x-width/2+1)*.5*viewportWidth,right:(viewButton.mesh.position.x+width/2+1)*.5*viewportWidth,top:(1-(viewButton.mesh.position.y+height/2))*.5*viewportHeight,bottom:(1-(viewButton.mesh.position.y-height/2))*.5*viewportHeight}
      personalRecordButton.mesh.scale.set(width,height,1);personalRecordButton.mesh.position.set(viewButton.mesh.position.x-width-gap,.90,0)
      personalRecordBounds={left:(personalRecordButton.mesh.position.x-width/2+1)*.5*viewportWidth,right:(personalRecordButton.mesh.position.x+width/2+1)*.5*viewportWidth,top:(1-(personalRecordButton.mesh.position.y+height/2))*.5*viewportHeight,bottom:(1-(personalRecordButton.mesh.position.y-height/2))*.5*viewportHeight}
    }
    if(slingshotHud){
      const portrait=viewportHeight>viewportWidth,toX=value=>value/viewportWidth*2-1,toY=value=>1-value/viewportHeight*2
      const topY=portrait?54:58,statsY=portrait?132:58
      const nameWidth=portrait?150:190,nameHeight=nameWidth*.5,nameX=portrait?18+nameWidth/2:28+nameWidth/2
      for(const mesh of [slingshotHud.wood,slingshotHud.wire]){mesh.scale.set(nameWidth/viewportWidth*2,nameHeight/viewportHeight*2,1);mesh.position.set(toX(nameX),toY(topY),.004)}
      const s=slingshotHud.arcadeScore,centerX=viewportWidth*.5
      layoutArcadeLabel(s.hitLabel,portrait?64:76,portrait?32:38,viewportWidth,viewportHeight);s.hitLabel.position.set(toX(centerX-(portrait?126:154)),toY(statsY),.004)
      layoutArcadeNumber(s.hits,portrait?54:66,viewportWidth,viewportHeight);s.hits.group.position.set(toX(centerX-(portrait?72:91)),toY(statsY),.004)
      layoutArcadeNumber(s.slash,portrait?48:58,viewportWidth,viewportHeight);s.slash.group.position.set(toX(centerX-(portrait?25:31)),toY(statsY),.004)
      layoutArcadeLabel(s.shotsLabel,portrait?70:84,portrait?35:42,viewportWidth,viewportHeight);s.shotsLabel.position.set(toX(centerX+(portrait?32:42)),toY(statsY),.004)
      layoutArcadeNumber(s.shots,portrait?54:66,viewportWidth,viewportHeight);s.shots.group.position.set(toX(centerX+(portrait?103:128)),toY(statsY),.004)
      const right=portrait?16:28,distanceWidth=portrait?132:176,distanceCenterX=viewportWidth-right-distanceWidth/2
      layoutArcadeLabel(s.distanceLabel,portrait?68:86,portrait?34:43,viewportWidth,viewportHeight);s.distanceLabel.position.set(toX(distanceCenterX-(portrait?34:45)),toY(topY),.004)
      layoutArcadeNumber(s.distance,portrait?58:72,viewportWidth,viewportHeight);s.distance.group.position.set(toX(distanceCenterX+(portrait?25:31)),toY(topY),.004)
      layoutArcadeLabel(s.metreLabel,portrait?38:46,portrait?19:23,viewportWidth,viewportHeight);s.metreLabel.position.set(toX(distanceCenterX+(portrait?62:78)),toY(topY+8),.004)
      slingshotHud.bounds={left:viewportWidth-right-distanceWidth,right:viewportWidth-right,top:Math.max(0,topY-42),bottom:Math.min(viewportHeight,topY+42)}
      const instructionWidth=Math.min(portrait?340:440,viewportWidth-32),instructionHeight=54
      slingshotHud.instruction.scale.set(instructionWidth/viewportWidth*2,instructionHeight/viewportHeight*2,1)
      slingshotHud.instruction.position.set(0,toY(viewportHeight-(portrait?92:48)),.004)
    }
    if(basketballHud){
      const landscape=renderer.domElement.clientWidth>renderer.domElement.clientHeight
      const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
      const portrait=!landscape,compactLandscape=landscape&&viewportWidth<900
      const centerX=viewportWidth*.5,toX=value=>value/viewportWidth*2-1,toY=value=>1-value/viewportHeight*2
      const mainY=portrait?92:compactLandscape?64:72,statsY=portrait?184:compactLandscape?142:164
      const mainHeight=portrait?124:compactLandscape?132:156,statsHeight=portrait?76:compactLandscape?82:96
      basketballHud.root.position.set(0,0,0)
      const halfSpan=portrait?viewportWidth*.48:Math.min(compactLandscape?300:340,viewportWidth*.32)
      basketballHud.scoreBounds={left:Math.round(centerX-halfSpan),right:Math.round(centerX+halfSpan),top:4,bottom:portrait?224:compactLandscape?176:204}
      const b=basketballHud.arcadeScore
      layoutArcadeLabel(b.scoreLabel,portrait?128:compactLandscape?144:176,portrait?64:compactLandscape?72:88,viewportWidth,viewportHeight);b.scoreLabel.position.set(toX(centerX-(portrait?96:compactLandscape?126:154)),toY(mainY),.004)
      layoutArcadeNumber(b.score,mainHeight,viewportWidth,viewportHeight);b.score.group.position.set(toX(centerX+(portrait?66:compactLandscape?82:100)),toY(mainY),.004)
      layoutArcadeLabel(b.hitLabel,portrait?76:compactLandscape?86:104,portrait?38:compactLandscape?43:52,viewportWidth,viewportHeight);b.hitLabel.position.set(toX(centerX-(portrait?142:compactLandscape?190:228)),toY(statsY),.004)
      layoutArcadeNumber(b.hits,statsHeight,viewportWidth,viewportHeight);b.hits.group.position.set(toX(centerX-(portrait?74:compactLandscape?112:132)),toY(statsY),.004)
      layoutArcadeNumber(b.slash,portrait?72:compactLandscape?78:92,viewportWidth,viewportHeight);b.slash.group.position.set(toX(centerX-(portrait?18:compactLandscape?38:44)),toY(statsY),.004)
      layoutArcadeLabel(b.shotsLabel,portrait?76:compactLandscape?86:104,portrait?38:compactLandscape?43:52,viewportWidth,viewportHeight);b.shotsLabel.position.set(toX(centerX+(portrait?54:compactLandscape?54:66)),toY(statsY),.004)
      layoutArcadeNumber(b.shots,statsHeight,viewportWidth,viewportHeight);b.shots.group.position.set(toX(centerX+(portrait?134:compactLandscape?146:174)),toY(statsY),.004)
      const feedbackWidth=landscape?184:174,feedbackHeight=landscape?88:94
      const feedbackCenterY=landscape?152:205
      basketballHud.feedbackRoot.position.set(0,1-feedbackCenterY/viewportHeight*2,0)
      basketballHud.feedbackBorder.scale.set((feedbackWidth+4)/viewportWidth*2,(feedbackHeight+4)/viewportHeight*2,1)
      basketballHud.feedbackBack.scale.set(feedbackWidth/viewportWidth*2,feedbackHeight/viewportHeight*2,1)
      pixelText.setLinePixels(basketballHud.feedbackTitle,landscape?48:56,viewportWidth,viewportHeight)
      pixelText.setLinePixels(basketballHud.feedbackLine,20,viewportWidth,viewportHeight)
      basketballHud.feedbackTitle.position.y=14/viewportHeight*2
      basketballHud.feedbackLine.position.y=-29/viewportHeight*2
      basketballHud.chargeRoot.position.set(0,landscape?-.47:-.58,0)
      const buttonSize=Math.round(THREE.MathUtils.clamp(Math.min(viewportWidth,viewportHeight)*.19,72,84))
      const right=landscape?18:20,bottom=landscape?18:20
      const left=viewportWidth-right-buttonSize,top=viewportHeight-bottom-buttonSize
      basketballHud.buttonBounds={left,top,right:left+buttonSize,bottom:top+buttonSize,width:buttonSize,height:buttonSize}
      basketballHud.buttonRoot.position.set((left+buttonSize/2)/viewportWidth*2-1,1-(top+buttonSize/2)/viewportHeight*2,0)
      basketballHud.buttonRoot.scale.set(buttonSize/viewportWidth*2,buttonSize/viewportHeight*2,1)
    }
    if(pingPongHud){
      const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
      const portrait=viewportHeight>viewportWidth,toX=value=>value/viewportWidth*2-1,toY=value=>1-value/viewportHeight*2
      const p=pingPongHud.arcadeScore
      const centerX=viewportWidth*.5
      const compactLandscape=!portrait&&viewportWidth<900
      const rowY=portrait?116:compactLandscape?66:72,metaY=portrait?206:compactLandscape?142:158
      const scoreHeight=portrait?124:compactLandscape?132:156
      const labelWidth=portrait?118:compactLandscape?142:176,labelHeight=portrait?58:compactLandscape?66:82
      const playerX=centerX-(portrait?62:compactLandscape?84:104),colonX=centerX,aiX=centerX+(portrait?62:compactLandscape?84:104)
      pingPongHud.root.position.set(0,0,0)
      const halfSpan=portrait?viewportWidth*.49:Math.min(compactLandscape?310:390,viewportWidth*.34)
      pingPongHud.scoreBounds={left:Math.round(centerX-halfSpan),right:Math.round(centerX+halfSpan),top:4,bottom:portrait?238:compactLandscape?174:196}
      layoutArcadeLabel(p.playerLabel,labelWidth,labelHeight,viewportWidth,viewportHeight);p.playerLabel.position.set(toX(centerX-(portrait?138:compactLandscape?194:276)),toY(rowY),.004)
      layoutArcadeNumber(p.player,scoreHeight,viewportWidth,viewportHeight);p.player.group.position.set(toX(playerX),toY(rowY),.004)
      layoutArcadeNumber(p.colon,portrait?108:compactLandscape?114:136,viewportWidth,viewportHeight);p.colon.group.position.set(toX(colonX),toY(rowY),.004)
      layoutArcadeNumber(p.ai,scoreHeight,viewportWidth,viewportHeight);p.ai.group.position.set(toX(aiX),toY(rowY),.004)
      layoutArcadeLabel(p.computerLabel,portrait?128:compactLandscape?154:192,labelHeight,viewportWidth,viewportHeight);p.computerLabel.position.set(toX(centerX+(portrait?142:compactLandscape?202:286)),toY(rowY),.004)
      for(const label of [p.practiceLabel,p.matchLabel]){
        layoutArcadeLabel(label,label===p.matchLabel?(portrait?126:compactLandscape?142:172):(portrait?92:compactLandscape?102:124),portrait?40:compactLandscape?42:48,viewportWidth,viewportHeight)
        label.position.set(toX(centerX-(portrait?96:compactLandscape?128:160)),toY(metaY),.004)
      }
      for(const label of [p.serverPlayerLabel,p.serverComputerLabel]){
        layoutArcadeLabel(label,portrait?84:compactLandscape?92:112,portrait?40:compactLandscape?42:48,viewportWidth,viewportHeight)
        label.position.set(toX(centerX+(portrait?20:compactLandscape?22:28)),toY(metaY),.004)
      }
      layoutArcadeLabel(p.serveLabel,portrait?80:compactLandscape?88:108,portrait?40:compactLandscape?42:48,viewportWidth,viewportHeight);p.serveLabel.position.set(toX(centerX+(portrait?102:compactLandscape?112:142)),toY(metaY),.004)
      pingPongHud.serveMarker.userData.playerX=toX(playerX);pingPongHud.serveMarker.userData.aiX=toX(aiX)
      pingPongHud.serveMarker.position.set(pingPongState.server==='玩家'?toX(playerX):toX(aiX),toY(rowY+scoreHeight*.54),.005)
      pingPongHud.serveMarker.scale.set(14/viewportWidth*2,10/viewportHeight*2,1)
    }
    if(bambooClimbHud){
      const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
      const landscape=viewportWidth>viewportHeight
      const arrowWidth=landscape?104:82,arrowHeight=landscape?230:208
      for(const entry of [bambooClimbHud.left,bambooClimbHud.right]){
        entry.group.scale.set(arrowWidth/viewportWidth*2,arrowHeight/viewportHeight*2,1)
      }
      syncBambooClimbAim()
      const cursorSize=26;bambooClimbHud.cursor.scale.set(cursorSize/viewportWidth*2,cursorSize/viewportHeight*2,1)
      pixelText.setLinePixels(bambooClimbHud.feedback,landscape?30:25,viewportWidth,viewportHeight)
      pixelText.setLinePixels(bambooClimbHud.progress,18,viewportWidth,viewportHeight)
      bambooClimbHud.feedback.position.set(0,.58,0);bambooClimbHud.progress.position.set(0,.91,0)
      const b=bambooClimbHud.arcadeScore
      layoutArcadeLabel(b.heightLabel,landscape?160:108,landscape?78:54,viewportWidth,viewportHeight);b.heightLabel.position.set(landscape?-.32:-.54,.82,.004)
      layoutArcadeNumber(b.progress,landscape?140:92,viewportWidth,viewportHeight);b.progress.group.position.set(landscape?.12:.04,.82,.004)
      layoutArcadeNumber(b.percent,landscape?120:84,viewportWidth,viewportHeight);b.percent.group.position.set(landscape?.39:.47,.82,.004)
      layoutArcadeNumber(b.rise,landscape?120:84,viewportWidth,viewportHeight);b.rise.group.position.set(landscape?-.14:-.18,.56,.004)
      layoutArcadeLabel(b.centimetreLabel,landscape?180:120,landscape?74:50,viewportWidth,viewportHeight);b.centimetreLabel.position.set(landscape?.25:.34,.56,.004)
      const exitWidth=86,exitHeight=42,exitRight=18,exitTop=16
      const exitLeft=viewportWidth-exitRight-exitWidth
      bambooClimbHud.exitBounds={left:exitLeft,right:exitLeft+exitWidth,top:exitTop,bottom:exitTop+exitHeight}
      bambooClimbHud.exitRoot.position.set((exitLeft+exitWidth/2)/viewportWidth*2-1,1-(exitTop+exitHeight/2)/viewportHeight*2,0)
      bambooClimbHud.exitBack.scale.set((exitWidth+4)/viewportWidth*2,(exitHeight+4)/viewportHeight*2,1)
      bambooClimbHud.exitFill.scale.set(exitWidth/viewportWidth*2,exitHeight/viewportHeight*2,1)
      pixelText.setLinePixels(bambooClimbHud.exitText,20,viewportWidth,viewportHeight)
    }
    if(longJumpHud){
      const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
      const landscape=viewportWidth>viewportHeight
      const clockPx=landscape?172:142
      longJumpHud.clockRoot.position.set(0,.17,0);longJumpHud.clockRoot.scale.set(clockPx/viewportWidth*2,clockPx/viewportHeight*2,1)
      longJumpHud.powerRoot.position.set(0,-.40,0);longJumpHud.powerRoot.scale.set((landscape?650:420)/viewportWidth*2,(landscape?115:105)/viewportHeight*2,1)
      longJumpHud.title.scale.set((landscape?430:330)/viewportWidth*2,(landscape?58:50)/viewportHeight*2,1)
      longJumpHud.meta.scale.set((landscape?390:300)/viewportWidth*2,38/viewportHeight*2,1)
      longJumpHud.result.scale.set((landscape?400:300)/viewportWidth*2,(landscape?72:60)/viewportHeight*2,1)
      longJumpHud.title.position.set(0,.70,0);longJumpHud.titleBack.position.set(0,.70,-.002)
      longJumpHud.meta.position.set(0,-.66,0);longJumpHud.metaBack.position.set(0,-.66,-.002)
      longJumpHud.result.position.set(0,.24,0);longJumpHud.resultBack.position.set(0,.48,-.002)
      longJumpHud.titleBack.scale.set((landscape?430:330)/viewportWidth*2,(landscape?58:50)/viewportHeight*2,1)
      longJumpHud.metaBack.scale.set((landscape?390:300)/viewportWidth*2,38/viewportHeight*2,1)
      longJumpHud.resultBack.scale.set((landscape?Math.min(940,viewportWidth-40):viewportWidth-24)/viewportWidth*2,(landscape?360:300)/viewportHeight*2,1)
      const a=longJumpHud.arcadeScore,toX=value=>value/viewportWidth*2,toY=value=>value/viewportHeight*2,scoreSpan=Math.min(900,viewportWidth-40);a.root.position.set(0,landscape?.43:.40,.004)
      layoutArcadeLabel(a.distanceLabel,landscape?220:128,landscape?110:72,viewportWidth,viewportHeight);a.distanceLabel.position.set(landscape?toX(-scoreSpan/2+110):toX(-70),landscape?0:toY(102),0)
      layoutArcadeNumber(a.distance,landscape?280:144,viewportWidth,viewportHeight);a.distance.group.position.set(landscape?toX(10):0,0,0)
      layoutArcadeLabel(a.metreLabel,landscape?130:80,landscape?110:72,viewportWidth,viewportHeight);a.metreLabel.position.set(landscape?toX(scoreSpan/2-65):toX(105),landscape?0:toY(-98),0)
      const layoutButton=(button,{left,top,width,height})=>{
        button.bounds={left,right:left+width,top,bottom:top+height}
        button.root.position.set((left+width/2)/viewportWidth*2-1,1-(top+height/2)/viewportHeight*2,0)
        button.back.scale.set((width+4)/viewportWidth*2,(height+4)/viewportHeight*2,1)
        button.fill.scale.set(width/viewportWidth*2,height/viewportHeight*2,1)
        button.text.scale.set(width/viewportWidth*2,height/viewportHeight*2,1)
      }
      layoutButton(longJumpHud.exit,{left:viewportWidth-104,top:16,width:86,height:42})
    }
    if(jacksHud){
      const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
      const portrait=viewportHeight>viewportWidth,toX=value=>value/viewportWidth*2-1,toY=value=>1-value/viewportHeight*2
      jacksHud.root.position.set(0,0,0)
      jacksHud.scoreBounds=portrait?{left:18,right:322,top:12,bottom:116}:{left:18,right:580,top:12,bottom:62}
      const items=portrait
        ?[[jacksHud.arcadeScore.grabLabel,62,36,52,46],[jacksHud.arcadeScore.stage,122,36,48,46],[jacksHud.arcadeScore.remainingLabel,190,36,78,42],[jacksHud.arcadeScore.remaining,266,36,54,46],[jacksHud.arcadeScore.comboLabel,66,92,70,38],[jacksHud.arcadeScore.combo,132,92,50,42],[jacksHud.arcadeScore.missesLabel,206,92,70,38],[jacksHud.arcadeScore.misses,270,92,50,42]]
        :[[jacksHud.arcadeScore.grabLabel,56,36,52,46],[jacksHud.arcadeScore.stage,112,36,48,46],[jacksHud.arcadeScore.remainingLabel,190,36,78,42],[jacksHud.arcadeScore.remaining,266,36,54,46],[jacksHud.arcadeScore.comboLabel,344,36,70,38],[jacksHud.arcadeScore.combo,410,36,50,42],[jacksHud.arcadeScore.missesLabel,484,36,70,38],[jacksHud.arcadeScore.misses,548,36,50,42]]
      for(const [entry,x,y,width,height] of items){const mesh=entry.group??entry;(entry.group?layoutArcadeNumber(entry,height,viewportWidth,viewportHeight):layoutArcadeLabel(entry,width,height,viewportWidth,viewportHeight));mesh.position.set(toX(x),toY(y),.004)}
      pixelText.setLinePixels(jacksHud.instruction,portrait?15:17,viewportWidth,viewportHeight);jacksHud.instruction.position.set(0,portrait?.65:-.82,.004)
      const left=viewportWidth-104,top=portrait?130:16,width=86,height=42,button=jacksHud.exit
      button.bounds={left,right:left+width,top,bottom:top+height}
      button.root.position.set((left+width/2)/viewportWidth*2-1,1-(top+height/2)/viewportHeight*2,0)
      button.back.scale.set((width+4)/viewportWidth*2,(height+4)/viewportHeight*2,1)
      button.fill.scale.set(width/viewportWidth*2,height/viewportHeight*2,1)
      pixelText.setLinePixels(button.text,20,viewportWidth,viewportHeight)
    }
    if(flagRaisingHud){
      const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
      const complete=Boolean(flagRaisingState.complete),preferredHeight=complete?72:58
      const instructionAspect=flagRaisingHud.instruction.userData.atlasAspect??FLAG_RAISING_TEXT_CELL_SIZE[0]/FLAG_RAISING_TEXT_CELL_SIZE[1]
      const instructionWidth=Math.min(preferredHeight*instructionAspect,viewportWidth-36),instructionHeight=instructionWidth/instructionAspect
      flagRaisingHud.instructionPixelSize=[instructionWidth,instructionHeight]
      flagRaisingHud.instructionBaseScale=[instructionWidth/viewportWidth*2,instructionHeight/viewportHeight*2]
      flagRaisingHud.instruction.scale.set(...flagRaisingHud.instructionBaseScale,1)
      flagRaisingHud.instruction.position.set(0,complete?.42:-.78,.004)
      const width=86,height=48,left=viewportWidth-104,top=16
      flagRaisingHud.exitBounds={left,right:left+width,top,bottom:top+height}
      flagRaisingHud.exitRoot.position.set((left+width/2)/viewportWidth*2-1,1-(top+height/2)/viewportHeight*2,0)
      flagRaisingHud.exitBack.scale.set((width+4)/viewportWidth*2,(height+4)/viewportHeight*2,1)
      flagRaisingHud.exitFill.scale.set(width/viewportWidth*2,height/viewportHeight*2,1)
      pixelText.setLinePixels(flagRaisingHud.exitText,20,viewportWidth,viewportHeight)
    }
    if(hopscotchHud){
      const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight),landscape=viewportWidth>viewportHeight
      const portrait=!landscape,toX=value=>value/viewportWidth*2-1,toY=value=>1-value/viewportHeight*2,h=portrait?48:58
      hopscotchHud.root.position.set(0,0,0)
      hopscotchHud.scoreBounds={left:18,right:350,top:12,bottom:72}
      const a=hopscotchHud.arcadeScore
      layoutArcadeLabel(a.targetLabel,portrait?72:92,h*.62,viewportWidth,viewportHeight);layoutArcadeNumber(a.target,h,viewportWidth,viewportHeight)
      layoutArcadeLabel(a.bestLabel,portrait?72:92,h*.62,viewportWidth,viewportHeight);layoutArcadeNumber(a.best,h,viewportWidth,viewportHeight)
      a.targetLabel.position.set(toX(portrait?54:64),toY(42),.004);a.target.group.position.set(toX(portrait?116:142),toY(42),.004)
      a.bestLabel.position.set(toX(portrait?246:230),toY(42),.004);a.best.group.position.set(toX(portrait?310:306),toY(42),.004)
      pixelText.setLinePixels(hopscotchHud.instruction,portrait?15:17,viewportWidth,viewportHeight);hopscotchHud.instruction.position.set(0,portrait?.61:-.84,.004)
      const exitWidth=86,exitHeight=42,left=viewportWidth-104,top=portrait?92:16;hopscotchHud.exitBounds={left,right:left+exitWidth,top,bottom:top+exitHeight}
      hopscotchHud.exitRoot.position.set((left+exitWidth/2)/viewportWidth*2-1,1-(top+exitHeight/2)/viewportHeight*2,0)
      hopscotchHud.exitBack.scale.set((exitWidth+4)/viewportWidth*2,(exitHeight+4)/viewportHeight*2,1);hopscotchHud.exitFill.scale.set(exitWidth/viewportWidth*2,exitHeight/viewportHeight*2,1);pixelText.setLinePixels(hopscotchHud.exitText,20,viewportWidth,viewportHeight)
    }
    if(arcadeComicHud){
      layoutArcadeComicPresentation(arcadeComicHud.game)
    }
    if(shuttlecockHud){
      const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
      const landscape=viewportWidth>viewportHeight,portrait=!landscape,toX=value=>value/viewportWidth*2-1,toY=value=>1-value/viewportHeight*2
      shuttlecockHud.scoreBounds={left:18,right:378,top:12,bottom:72}
      const a=shuttlecockHud.arcadeScore,h=portrait?48:58
      layoutArcadeLabel(a.streakLabel,portrait?78:96,h*.62,viewportWidth,viewportHeight);layoutArcadeNumber(a.streak,h,viewportWidth,viewportHeight)
      layoutArcadeLabel(a.bestLabel,portrait?72:92,h*.62,viewportWidth,viewportHeight);layoutArcadeNumber(a.best,h,viewportWidth,viewportHeight)
      a.streakLabel.position.set(toX(portrait?62:74),toY(42),.004);a.streak.group.position.set(toX(portrait?132:158),toY(42),.004)
      a.bestLabel.position.set(toX(portrait?244:264),toY(42),.004);a.best.group.position.set(toX(portrait?310:338),toY(42),.004)
      pixelText.setLinePixels(shuttlecockHud.prompt,portrait?16:18,viewportWidth,viewportHeight);shuttlecockHud.prompt.position.set(0,portrait?.70:-.55,.004)
      const footSize=landscape?88:78,footBottom=18
      for(const [entry,x] of [[shuttlecockHud.left,viewportWidth*.5-footSize-18],[shuttlecockHud.right,viewportWidth*.5+18]]){
        const top=viewportHeight-footBottom-footSize;entry.bounds={left:x,right:x+footSize,top,bottom:top+footSize}
        entry.root.position.set((x+footSize/2)/viewportWidth*2-1,1-(top+footSize/2)/viewportHeight*2,0)
        entry.root.scale.set(footSize/viewportWidth*2,footSize/viewportHeight*2,1);pixelText.setLinePixels(entry.text,34,footSize,footSize)
      }
      const exitWidth=86,exitHeight=42,exitLeft=viewportWidth-104,exitTop=portrait?92:16
      shuttlecockHud.exitBounds={left:exitLeft,right:exitLeft+exitWidth,top:exitTop,bottom:exitTop+exitHeight}
      shuttlecockHud.exitRoot.position.set((exitLeft+exitWidth/2)/viewportWidth*2-1,1-(exitTop+exitHeight/2)/viewportHeight*2,0)
      shuttlecockHud.exitBack.scale.set((exitWidth+4)/viewportWidth*2,(exitHeight+4)/viewportHeight*2,1)
      shuttlecockHud.exitFill.scale.set(exitWidth/viewportWidth*2,exitHeight/viewportHeight*2,1)
      pixelText.setLinePixels(shuttlecockHud.exitText,20,viewportWidth,viewportHeight)
    }
  }

  const syncVisibility=()=>{
    for(const [name,{mesh}] of interactionMeshes)mesh.visible=enabled&&name===interaction
    for(const [name,{mesh}] of interactionHintMeshes)mesh.visible=enabled&&name===interaction
    for(const [name,{mesh}] of postureMeshes)mesh.visible=enabled&&name===posture
    if(viewButton)viewButton.mesh.visible=viewToggleVisible
    if(personalRecordButton)personalRecordButton.mesh.visible=personalRecordVisible
    if(pointWalkUi)pointWalkUi.statusMesh.visible=enabled&&(pointTargetVisible||pointWalking)
  }

  const warmGpuResources=()=>{
    const previousTarget=renderer.getRenderTarget()
    const previousAutoClear=renderer.autoClear
    const visibility=new Map()
    scene.traverse(object=>{visibility.set(object,object.visible);object.visible=true})
    renderer.setRenderTarget(null)
    renderer.autoClear=true
    renderer.render(scene,camera)
    renderer.setRenderTarget(previousTarget)
    renderer.autoClear=previousAutoClear
    for(const [object,wasVisible] of visibility)object.visible=wasVisible
    warmed=true
  }

  const load=async()=>{
    if(loaded)return true
    const [smoothTexture,minigameTutorialTexture,arcadeComicBurstTexture,arcadeComicScoreTexture]=await Promise.all([
      loader.loadAsync(SMOOTH_ATLAS_URL).then(texture=>configureTexture(texture,renderer,false)),
      loader.loadAsync(MINIGAME_TUTORIAL_ATLAS_URL).then(texture=>configureTexture(texture,renderer,false)),
      loader.loadAsync(ARCADE_COMIC_BURST_ATLAS_URL).then(texture=>configureTexture(texture,renderer,false)),
      loader.loadAsync(ARCADE_COMIC_SCORE_ATLAS_URL).then(texture=>configureTexture(texture,renderer,false)),
      pixelText.load(),
    ])
    const smoothMaterial=new THREE.MeshBasicMaterial({name:'webgl-hud-smooth-atlas-material',map:smoothTexture,transparent:true,depthTest:false,depthWrite:false})
    const minigameTutorialMaterial=new THREE.MeshBasicMaterial({name:'webgl-hud-minigame-tutorial-material',map:minigameTutorialTexture,transparent:true,depthTest:false,depthWrite:false})
    const arcadeComicBurstMaterial=new THREE.MeshBasicMaterial({name:'webgl-hud-arcade-comic-burst-material',map:arcadeComicBurstTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
    const arcadeComicScoreMaterial=new THREE.MeshBasicMaterial({name:'webgl-hud-arcade-comic-score-material',map:arcadeComicScoreTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
    addGroup(INTERACTION_RECTS,interactionMeshes,smoothMaterial,SMOOTH_ATLAS_SIZE,'interaction')
    const interactionHintMaterial=makeInteractionHintAtlas()
    addGroup(POSTURE_RECTS,postureMeshes,smoothMaterial,SMOOTH_ATLAS_SIZE,'posture')
    makeMovementTutorials()
    addGroup(MINIGAME_TUTORIAL_RECTS,minigameTutorialMeshes,minigameTutorialMaterial,MINIGAME_TUTORIAL_ATLAS_SIZE,'minigame-tutorial')
    makeMinigameInstructionAtlas()
    makeViewButton()
    makePointWalkUi()
    makeMinigamePauseHud()
    makeBasketballHud(arcadeComicScoreMaterial)
    makePingPongHud(arcadeComicScoreMaterial)
    makeBambooClimbHud(arcadeComicScoreMaterial)
    makeLongJumpHud(arcadeComicScoreMaterial)
    makeJacksHud(arcadeComicScoreMaterial)
    makeFlagRaisingHud(interactionHintMaterial)
    makeHopscotchHud(arcadeComicScoreMaterial)
    makeArcadeComicHud(arcadeComicBurstMaterial)
    makeSlingshotHud(arcadeComicScoreMaterial)
    makeShuttlecockHud(arcadeComicScoreMaterial)
    layout();warmGpuResources();loaded=true;syncVisibility();return true
  }

  const setInteraction=name=>{
    const next=interactionMeshes.has(name)?name:'default'
    if(next===interaction)return
    interaction=next
    if(loaded){
      for(const [key,{mesh}] of interactionMeshes)mesh.visible=enabled&&key===next
      for(const [key,{mesh}] of interactionHintMeshes)mesh.visible=enabled&&key===next
    }
  }

  const setPosture=name=>{
    const next=postureMeshes.has(name)?name:'standing'
    if(next===posture)return
    posture=next
    if(loaded)for(const [key,{mesh}] of postureMeshes)mesh.visible=enabled&&key===next
  }

  const setEnabled=value=>{
    const next=Boolean(value)
    if(next===enabled)return
    enabled=next
    if(!enabled){tutorialTimer=0;stopArcadeComicCelebration();for(const {mesh} of [...tutorialMeshes.values(),...minigameTutorialMeshes.values(),...minigameInstructionMeshes.values()])mesh.visible=false}
    if(loaded)syncVisibility()
  }

  const setPointTargetVisible=value=>{pointTargetVisible=Boolean(value);if(loaded)syncVisibility()}
  const setPointWalking=value=>{pointWalking=Boolean(value);if(loaded)syncVisibility()}

  const setViewMode=value=>{
    const next=value==='walk'?'walk':'aerial'
    if(next===viewMode)return
    viewMode=next;redrawViewButton()
  }

  const setViewToggleVisible=value=>{
    viewToggleVisible=Boolean(value)
    if(viewButton)viewButton.mesh.visible=viewToggleVisible
  }

  const setPersonalRecordVisible=value=>{
    personalRecordVisible=Boolean(value)
    if(personalRecordButton)personalRecordButton.mesh.visible=personalRecordVisible
  }

  const setBasketballHud=state=>{
    Object.assign(basketballState,state)
    if(!basketballHud)return
    applyBasketballScore()
    basketballHud.root.visible=enabled&&Boolean(basketballState.visible)
    if(basketballState.visible)prepareArcadeComicGame('basketball')
    basketballHud.chargeRoot.visible=basketballHud.root.visible&&Boolean(basketballState.charging)
    basketballHud.buttonRoot.visible=enabled&&Boolean(basketballState.shootButtonVisible)
    const ratio=THREE.MathUtils.clamp(basketballState.chargeRatio??0,0,1)
    basketballHud.chargeFill.scale.x=Math.max(.0001,ratio);basketballHud.chargeFill.position.x=(ratio-1)*.246
    const guideRatio=THREE.MathUtils.clamp(basketballState.decisionRatio??.62,0,1)
    basketballHud.guide.position.x=basketballHud.guideShadow.position.x=(guideRatio-.5)*.492
    basketballHud.chargeMaterial.uniforms.reachable.value=basketballState.reachable?1:0
    const pressed=Boolean(basketballState.shootPressed)
    if(pressed!==basketballHud.lastPressed){basketballHud.lastPressed=pressed;basketballHud.buttonFill.material.color.setHex(pressed?0xffdc86:0xfff8d5);basketballHud.buttonFill.scale.setScalar(pressed?.91:1);basketballHud.buttonIcon.scale.setScalar(pressed?.67:.72)}
  }

  const setSlingshotHud=state=>{
    Object.assign(slingshotState,state)
    if(!slingshotHud)return
    slingshotHud.root.visible=enabled&&Boolean(slingshotState.visible)
    if(slingshotState.visible)prepareArcadeComicGame('slingshot')
    const selectedId=slingshotState.selectedId==='wire'?'wire':'wood'
    slingshotHud.wood.visible=selectedId==='wood';slingshotHud.wire.visible=selectedId==='wire'
    const hits=THREE.MathUtils.clamp(Math.round(slingshotState.hits??0),0,99),shots=THREE.MathUtils.clamp(Math.round(slingshotState.shots??0),0,99)
    const distance=slingshotState.distance===5?5:10,key=`${selectedId}/${hits}/${shots}/${distance}/${Boolean(slingshotState.touch)}`
    if(slingshotHud.lastKey!==key){
      slingshotHud.lastKey=key
      slingshotHud.arcadeScore.hits.setText(String(hits).padStart(2,'0'))
      slingshotHud.arcadeScore.shots.setText(String(shots).padStart(2,'0'))
      slingshotHud.arcadeScore.distance.setText(String(distance))
      slingshotHud.instruction.userData.smoothText.setText(slingshotState.touch?'点击距离按钮切换5米／10米':'W／↑ 5米　S／↓ 10米')
    }
  }

  const setPingPongHud=state=>{
    Object.assign(pingPongState,state)
    if(!pingPongHud)return
    applyPingPongScore()
    pingPongHud.root.visible=Boolean(pingPongState.visible)
    if(pingPongState.visible)prepareArcadeComicGame('pingPong')
    if(!pingPongState.visible)pingPongHud.feedbackRoot.visible=false
  }

  const setBambooClimbHud=state=>{
    Object.assign(bambooClimbState,state)
    if(!bambooClimbHud)return
    const visible=Boolean(bambooClimbState.visible),complete=Boolean(bambooClimbState.complete)
    bambooClimbHud.root.visible=visible
    if(visible)prepareArcadeComicGame('bambooClimb')
    bambooClimbHud.left.group.visible=visible&&!complete&&bambooClimbState.side==='left'
    bambooClimbHud.right.group.visible=visible&&!complete&&bambooClimbState.side==='right'
    bambooClimbHud.cursor.visible=visible&&!complete
    const entry=bambooClimbState.side==='left'?bambooClimbHud.left:bambooClimbHud.right
    const ratio=THREE.MathUtils.clamp(bambooClimbState.chargeRatio??0,0,1)
    entry.fill.scale.y=Math.max(.001,ratio);entry.fill.position.y=-.42+ratio*.25
    entry.fillMaterial.color.copy(BAMBOO_SAFE_START_COLOR).lerp(BAMBOO_SAFE_END_COLOR,ratio)
    syncBambooClimbAim()
    const progress=Math.round(THREE.MathUtils.clamp(bambooClimbState.progress??0,0,1)*100)
    bambooClimbHud.arcadeScore.progress.setText(String(progress).padStart(3,'0'))
    const riseMatch=String(bambooClimbState.feedback??'').match(/\+(\d+)/),rise=riseMatch?THREE.MathUtils.clamp(Number(riseMatch[1]),0,99):null
    bambooClimbHud.arcadeScore.rise.group.visible=rise!=null;bambooClimbHud.arcadeScore.centimetreLabel.visible=rise!=null
    if(rise!=null)bambooClimbHud.arcadeScore.rise.setText(`+${String(rise).padStart(2,'0')}`)
    bambooClimbHud.feedback.userData.pixelText.setText(riseMatch?'':bambooClimbState.feedback??'')
  }

  const setLongJumpHud=state=>{
    Object.assign(longJumpState,state)
    if(!longJumpHud)return
    const visible=Boolean(longJumpState.visible),phase=longJumpState.phase??'idle'
    longJumpHud.root.visible=visible
    if(visible)prepareArcadeComicGame('longJump')
    longJumpHud.clockRoot.visible=visible&&(phase==='aiming'||phase==='charging')
    longJumpHud.powerRoot.visible=visible&&phase==='charging'
    longJumpHud.needlePivot.rotation.z=-(longJumpState.angleTurns??0)*Math.PI*2
    const ratio=THREE.MathUtils.clamp(longJumpState.powerRatio??0,0,1)
    longJumpHud.powerFill.scale.x=Math.max(.001,ratio);longJumpHud.powerFill.position.x=(ratio-1)*.39
    longJumpHud.exit.root.visible=visible
    longJumpHud.result.visible=false
    longJumpHud.resultBack.visible=false
    const title=phase==='entering'?'准备起跳':phase==='aiming'?'看准十二点':phase==='charging'?'正在蓄力':phase==='landing'?'落地':''
    const meta=phase==='aiming'?'按住锁定角度':phase==='charging'?'松开起跳 · 不要越线':''
    longJumpHud.titleBack.visible=visible&&Boolean(title)
    longJumpHud.metaBack.visible=visible&&Boolean(meta)
    const resultText=''
    const key=`${title}/${meta}/${resultText}/${longJumpState.distance}`
    if(key!==longJumpHud.lastText){
      longJumpHud.lastText=key;longJumpHud.title.userData.smoothText.setText(title);longJumpHud.meta.userData.smoothText.setText(meta)
      longJumpHud.result.userData.smoothText.setText(resultText)
    }
    const showDistance=visible&&(phase==='landing'||phase==='result')&&Number.isFinite(longJumpState.distance)
    longJumpHud.resultBack.visible=showDistance
    longJumpHud.arcadeScore.root.visible=showDistance
    if(showDistance)longJumpHud.arcadeScore.distance.setText(Number(longJumpState.distance).toFixed(2))
  }

  const setHopscotchHud=state=>{
    const wasVisible=hopscotchState.visible;Object.assign(hopscotchState,state);if(!hopscotchHud)return
    const visible=Boolean(hopscotchState.visible);hopscotchHud.root.visible=visible
    if(visible)prepareArcadeComicGame('hopscotch');else if(wasVisible)stopArcadeComicCelebration('hopscotch')
    hopscotchHud.arcadeScore.target.setText(String(hopscotchState.target??1).padStart(2,'0'))
    hopscotchHud.arcadeScore.best.setText(String(hopscotchState.bestProgress??0).padStart(2,'0'))
  }

  const setShuttlecockHud=state=>{
    const wasVisible=shuttlecockState.visible;Object.assign(shuttlecockState,state)
    if(!shuttlecockHud)return
    const visible=Boolean(shuttlecockState.visible),expected=shuttlecockState.expectedFoot??'left'
    shuttlecockHud.root.visible=visible
    // 踢毽子反馈由世界场景中的贴地标题承担，避免正交 HUD 遮住毽子。
    if(!visible&&wasVisible)stopArcadeComicCelebration('shuttlecock')
    const activeColor=shuttlecockState.kickable?0x76ad6a:0xe8bd58
    shuttlecockHud.left.fill.material.color.setHex(expected==='left'?activeColor:shuttlecockHud.warmColor)
    shuttlecockHud.right.fill.material.color.setHex(expected==='right'?activeColor:shuttlecockHud.warmColor)
    shuttlecockHud.arcadeScore.streak.setText(String(shuttlecockState.streak??0).padStart(2,'0'))
    shuttlecockHud.arcadeScore.best.setText(String(shuttlecockState.best??0).padStart(2,'0'))
  }

  const setJacksHud=state=>{
    const wasVisible=jacksState.visible;Object.assign(jacksState,state)
    if(!jacksHud)return
    const visible=Boolean(jacksState.visible),phase=jacksState.phase??'idle'
    jacksHud.root.visible=visible;jacksHud.exit.root.visible=visible
    if(visible)prepareArcadeComicGame('jacks');else if(wasVisible)stopArcadeComicCelebration('jacks')
    jacksHud.arcadeScore.stage.setText(String(jacksState.stage??1))
    jacksHud.arcadeScore.remaining.setText(String(jacksState.remaining??0).padStart(2,'0'))
    jacksHud.arcadeScore.combo.setText(String(jacksState.streak??0).padStart(2,'0'))
    jacksHud.arcadeScore.misses.setText(String(jacksState.failures??0).padStart(2,'0'))
  }

  const setFlagRaisingHud=state=>{
    Object.assign(flagRaisingState,state)
    if(!flagRaisingHud)return
    const visible=Boolean(flagRaisingState.visible),complete=Boolean(flagRaisingState.complete)
    flagRaisingHud.root.visible=visible;flagRaisingHud.exitRoot.visible=visible&&Boolean(flagRaisingState.touch)
    const key=`${complete}/${Boolean(flagRaisingState.touch)}`
    if(flagRaisingHud.lastKey!==key){
      flagRaisingHud.lastKey=key
      const variant=complete?(flagRaisingState.touch?'complete-mobile':'complete-desktop'):flagRaisingState.touch?'mobile':'desktop'
      for(const [name,mesh] of Object.entries(flagRaisingHud.instructions))mesh.visible=name===variant
      flagRaisingHud.instruction=flagRaisingHud.instructions[variant];flagRaisingHud.instructionText=FLAG_RAISING_HUD_TEXT[variant]
      flagRaisingHud.completeStartedAt=complete?performance.now():0
      flagRaisingHud.instruction.material.opacity=complete?0:1
      layout()
    }
  }

  const hitViewToggle=(clientX,clientY)=>Boolean(viewToggleVisible&&viewToggleBounds&&clientX>=viewToggleBounds.left&&clientX<=viewToggleBounds.right&&clientY>=viewToggleBounds.top&&clientY<=viewToggleBounds.bottom)
  const hitPersonalRecord=(clientX,clientY)=>Boolean(personalRecordVisible&&personalRecordBounds&&clientX>=personalRecordBounds.left&&clientX<=personalRecordBounds.right&&clientY>=personalRecordBounds.top&&clientY<=personalRecordBounds.bottom)
  const hitBasketballShoot=(clientX,clientY)=>Boolean(enabled&&basketballState.shootButtonVisible&&basketballHud?.buttonBounds&&clientX>=basketballHud.buttonBounds.left&&clientX<=basketballHud.buttonBounds.right&&clientY>=basketballHud.buttonBounds.top&&clientY<=basketballHud.buttonBounds.bottom)
  const hitSlingshotDistance=(clientX,clientY)=>Boolean(enabled&&slingshotState.visible&&slingshotHud?.bounds&&clientX>=slingshotHud.bounds.left&&clientX<=slingshotHud.bounds.right&&clientY>=slingshotHud.bounds.top&&clientY<=slingshotHud.bounds.bottom)
  const hitBambooClimbExit=(clientX,clientY)=>Boolean(bambooClimbState.visible&&bambooClimbHud?.exitBounds&&clientX>=bambooClimbHud.exitBounds.left&&clientX<=bambooClimbHud.exitBounds.right&&clientY>=bambooClimbHud.exitBounds.top&&clientY<=bambooClimbHud.exitBounds.bottom)
  const hitLongJumpExit=(clientX,clientY)=>Boolean(longJumpState.visible&&longJumpHud?.exit.bounds&&clientX>=longJumpHud.exit.bounds.left&&clientX<=longJumpHud.exit.bounds.right&&clientY>=longJumpHud.exit.bounds.top&&clientY<=longJumpHud.exit.bounds.bottom)
  const hitLongJumpRestart=()=>false
  const hitHopscotchExit=(clientX,clientY)=>Boolean(hopscotchState.visible&&hopscotchHud?.exitBounds&&clientX>=hopscotchHud.exitBounds.left&&clientX<=hopscotchHud.exitBounds.right&&clientY>=hopscotchHud.exitBounds.top&&clientY<=hopscotchHud.exitBounds.bottom)
  const hitShuttlecockExit=(clientX,clientY)=>Boolean(shuttlecockState.visible&&shuttlecockHud?.exitBounds&&clientX>=shuttlecockHud.exitBounds.left&&clientX<=shuttlecockHud.exitBounds.right&&clientY>=shuttlecockHud.exitBounds.top&&clientY<=shuttlecockHud.exitBounds.bottom)
  const hitJacksExit=(clientX,clientY)=>Boolean(jacksState.visible&&jacksHud?.exit.bounds&&clientX>=jacksHud.exit.bounds.left&&clientX<=jacksHud.exit.bounds.right&&clientY>=jacksHud.exit.bounds.top&&clientY<=jacksHud.exit.bounds.bottom)
  const hitFlagRaisingExit=(clientX,clientY)=>Boolean(flagRaisingState.visible&&flagRaisingState.touch&&flagRaisingHud?.exitBounds&&clientX>=flagRaisingHud.exitBounds.left&&clientX<=flagRaisingHud.exitBounds.right&&clientY>=flagRaisingHud.exitBounds.top&&clientY<=flagRaisingHud.exitBounds.bottom)
  const hitMinigamePauseAction=(clientX,clientY)=>{
    if(!minigamePaused||!minigamePauseHud)return null
    for(const [action,button] of [['resume',minigamePauseHud.resume],['exit',minigamePauseHud.exit]]){
      const bounds=button.bounds
      if(bounds&&clientX>=bounds.left&&clientX<=bounds.right&&clientY>=bounds.top&&clientY<=bounds.bottom)return action
    }
    return null
  }
  const setMinigamePaused=value=>{
    minigamePaused=Boolean(value)
    if(minigamePauseHud)minigamePauseHud.root.visible=minigamePaused
  }
  const resumeAfterMinigamePause=durationMs=>{
    const delta=Math.max(0,durationMs||0)
    if(tutorialTimer)tutorialTimer+=delta
    if(basketballFeedbackTimer)basketballFeedbackTimer+=delta
    if(pingPongFeedbackTimer)pingPongFeedbackTimer+=delta
    if(arcadeComicHud?.active)arcadeComicHud.startedAt+=delta
    if(flagRaisingHud?.completeStartedAt)flagRaisingHud.completeStartedAt+=delta
    for(const number of arcadeNumberEntries)if(number.bounceStartedAt)number.bounceStartedAt+=delta
  }

  const showTutorial=(name,duration=9000)=>{
    if(!loaded)return
    for(const {mesh} of minigameTutorialMeshes.values())mesh.visible=false
    for(const {mesh} of minigameInstructionMeshes.values())mesh.visible=false
    for(const [key,{mesh}] of tutorialMeshes)mesh.visible=key===name
    tutorialTimer=performance.now()+duration
  }

  const showMinigameTutorial=(name,duration=8000)=>{
    if(!loaded||!minigameTutorialMeshes.has(name)&&!minigameInstructionMeshes.has(name))return
    for(const {mesh} of tutorialMeshes.values())mesh.visible=false
    for(const [key,{mesh}] of minigameTutorialMeshes)mesh.visible=key===name
    for(const [key,{mesh}] of minigameInstructionMeshes)mesh.visible=key===name
    tutorialTimer=performance.now()+duration
  }

  const flashBasketballPoints=(points,duration=1250)=>{
    if(!basketballHud)return
    const value=THREE.MathUtils.clamp(Math.round(points??0),2,4)
    basketballHud.feedbackLine.userData.pixelText.setText(`${value===2?'两':value===3?'三':'四'}分球 +${value}`)
    basketballHud.feedbackRoot.visible=false
    basketballFeedbackTimer=0
    playArcadeComicCelebration('basketball',value===2?'two':value===3?'three':'four','major',Math.min(1100,Math.max(900,duration)))
  }

  const flashPingPongFeedback=(title,detail='',duration=900)=>{
    if(!pingPongHud||!pingPongState.visible)return
    pingPongHud.feedbackTitle.userData.pixelText.setText(title)
    pingPongHud.feedbackDetail.userData.pixelText.setText(detail)
    if(title==='好球'||title==='扣杀'){
      pingPongHud.feedbackRoot.visible=false;pingPongFeedbackTimer=0
      playArcadeComicCelebration('pingPong',title==='扣杀'?'smash':'good','hit',Math.min(1000,Math.max(820,duration)))
      return
    }
    if(title==='得分'){
      pingPongHud.feedbackRoot.visible=false;pingPongFeedbackTimer=0
      if(detail.startsWith('玩家'))playArcadeComicCelebration('pingPong','point','hit',Math.min(1000,Math.max(820,duration)))
      return
    }
    if(title==='比赛结束'){
      if(detail==='玩家胜'){
        pingPongHud.feedbackRoot.visible=false;pingPongFeedbackTimer=0
        playArcadeComicCelebration('pingPong','win','major',Math.min(1100,Math.max(900,duration)))
        return
      }
      pingPongHud.feedbackRoot.visible=false;pingPongFeedbackTimer=0
      playArcadeComicCelebration('pingPong','again','plain',Math.min(1100,Math.max(900,duration)))
      return
    }
    // 未映射的过程信息不再回退到旧像素反馈框；玩法教学由进入时教程承担。
    pingPongHud.feedbackRoot.visible=false;pingPongFeedbackTimer=0
  }

  const update=now=>{
    if(minigamePaused)return
    if(tutorialTimer&&now>=tutorialTimer){tutorialTimer=0;for(const {mesh} of [...tutorialMeshes.values(),...minigameTutorialMeshes.values(),...minigameInstructionMeshes.values()])mesh.visible=false}
    if(basketballFeedbackTimer&&now>=basketballFeedbackTimer){basketballFeedbackTimer=0;if(basketballHud)basketballHud.feedbackRoot.visible=false}
    if(pingPongFeedbackTimer&&now>=pingPongFeedbackTimer){pingPongFeedbackTimer=0;if(pingPongHud)pingPongHud.feedbackRoot.visible=false}
    updateArcadeComicCelebration(now)
    updateArcadeNumberBounces(now)
    if(basketballHud){
      basketballHud.root.visible=enabled&&Boolean(basketballState.visible)
      basketballHud.buttonRoot.visible=enabled&&Boolean(basketballState.shootButtonVisible)
      if(!enabled)basketballHud.feedbackRoot.visible=false
    }
    if(slingshotHud)slingshotHud.root.visible=enabled&&Boolean(slingshotState.visible)
    if(pingPongHud)pingPongHud.root.visible=Boolean(pingPongState.visible)
    if(bambooClimbHud)bambooClimbHud.root.visible=Boolean(bambooClimbState.visible)
    if(longJumpHud)longJumpHud.root.visible=Boolean(longJumpState.visible)
    if(hopscotchHud)hopscotchHud.root.visible=Boolean(hopscotchState.visible)
    if(shuttlecockHud)shuttlecockHud.root.visible=Boolean(shuttlecockState.visible)
    if(jacksHud){jacksHud.root.visible=Boolean(jacksState.visible);jacksHud.exit.root.visible=Boolean(jacksState.visible)}
    if(flagRaisingHud){
      flagRaisingHud.root.visible=Boolean(flagRaisingState.visible);flagRaisingHud.exitRoot.visible=Boolean(flagRaisingState.visible&&flagRaisingState.touch)
      const [baseX,baseY]=flagRaisingHud.instructionBaseScale
      if(flagRaisingState.complete&&flagRaisingHud.completeStartedAt){
        const elapsed=Math.max(0,now-flagRaisingHud.completeStartedAt),ratio=THREE.MathUtils.clamp(elapsed/520,0,1)
        const bounce=1+Math.sin(ratio*Math.PI*2.4)*.09*Math.exp(-ratio*3.2)
        flagRaisingHud.instruction.material.opacity=THREE.MathUtils.smoothstep(ratio,0,.42)
        flagRaisingHud.instruction.scale.set(baseX*bounce,baseY*bounce,1)
      }else{
        flagRaisingHud.instruction.material.opacity=1;flagRaisingHud.instruction.scale.set(baseX,baseY,1)
      }
    }
    if(minigamePauseHud)minigamePauseHud.root.visible=minigamePaused
  }

  const render=()=>{
    if(!loaded)return
    const previousAutoClear=renderer.autoClear
    renderer.autoClear=false;renderer.clearDepth();renderer.render(scene,camera);renderer.autoClear=previousAutoClear
  }

  const resize=()=>{if(loaded){redrawViewButton();layout()}}
  const arcadeNumberPixelHeight=number=>Math.round((number?.baseScale?.[1]??0)*Math.max(1,renderer.domElement.clientHeight)/2)
  const snapshot=()=>({
    loaded,warmed,enabled,interaction,interactionRect:INTERACTION_RECTS[interaction]?[...INTERACTION_RECTS[interaction]]:null,posture,
    interactionHint:[...interactionHintMeshes].find(([,entry])=>entry.mesh.visible)?.[0]??null,
    interactionHintText:INTERACTION_HINTS[interaction]??null,
    viewMode,viewToggleVisible,viewToggleBounds,personalRecordVisible,personalRecordBounds,personalRecordLabel:'个人记录',
    pointTargetVisible,pointWalking,
    tutorialVisible:[...tutorialMeshes].find(([,entry])=>entry.mesh.visible)?.[0]??null,
    movementTutorial:(()=>{const visible=[...tutorialMeshes].find(([,entry])=>entry.mesh.visible);if(!visible)return null;const [variant,entry]=visible;return{variant,lines:[...entry.lines],panel:entry.panel,bounds:entry.bounds?{...entry.bounds}:null}})(),
    minigameTutorialVisible:[...minigameTutorialMeshes].find(([,entry])=>entry.mesh.visible)?.[0]??null,
    minigameInstructionVisible:[...minigameInstructionMeshes].find(([,entry])=>entry.mesh.visible)?.[0]??null,
    minigamePause:{visible:minigamePaused,resumeBounds:minigamePauseHud?.resume.bounds?{...minigamePauseHud.resume.bounds}:null,exitBounds:minigamePauseHud?.exit.bounds?{...minigamePauseHud.exit.bounds}:null},
    basketball:{...basketballState,arcadeScore:basketballHud?{score:basketballHud.arcadeScore.score.text,hits:basketballHud.arcadeScore.hits.text,shots:basketballHud.arcadeScore.shots.text,scorePixelHeight:arcadeNumberPixelHeight(basketballHud.arcadeScore.score),statsPixelHeight:arcadeNumberPixelHeight(basketballHud.arcadeScore.hits)}:null,scoreBounds:basketballHud?.scoreBounds?{...basketballHud.scoreBounds}:null,panelVisible:false,feedbackVisible:Boolean(basketballHud?.feedbackRoot.visible),feedbackTitle:basketballHud?.feedbackTitle.userData.pixelText.text??'',feedbackText:basketballHud?.feedbackLine.userData.pixelText.text??'',shootButtonBounds:basketballHud?.buttonBounds?{...basketballHud.buttonBounds}:null,loaded:Boolean(basketballHud)},
    slingshot:{
      ...slingshotState,distanceButtonBounds:slingshotHud?.bounds?{...slingshotHud.bounds}:null,loaded:Boolean(slingshotHud),
      arcadeScore:slingshotHud?{hits:slingshotHud.arcadeScore.hits.text,shots:slingshotHud.arcadeScore.shots.text,distance:slingshotHud.arcadeScore.distance.text}:null,
      selectedLabel:slingshotHud?.wire.visible?'wire':'wood',instruction:slingshotHud?.instruction.userData.smoothText.text??'',
    },
    pingPong:{...pingPongState,arcadeScore:pingPongHud?{player:pingPongHud.arcadeScore.player.text,ai:pingPongHud.arcadeScore.ai.text,scorePixelHeight:arcadeNumberPixelHeight(pingPongHud.arcadeScore.player)}:null,scoreBounds:pingPongHud?.scoreBounds?{...pingPongHud.scoreBounds}:null,panelVisible:false,promptVisible:false,serveMarkerVisible:Boolean(pingPongHud?.serveMarker.visible),feedbackVisible:Boolean(pingPongHud?.feedbackRoot.visible),feedbackTitle:pingPongHud?.feedbackTitle.userData.pixelText.text??'',feedbackDetail:pingPongHud?.feedbackDetail.userData.pixelText.text??'',loaded:Boolean(pingPongHud)},
    bambooClimb:{...bambooClimbState,arcadeScore:bambooClimbHud?{progress:bambooClimbHud.arcadeScore.progress.text,rise:bambooClimbHud.arcadeScore.rise.text,riseVisible:bambooClimbHud.arcadeScore.rise.group.visible,progressPixelHeight:arcadeNumberPixelHeight(bambooClimbHud.arcadeScore.progress),risePixelHeight:arcadeNumberPixelHeight(bambooClimbHud.arcadeScore.rise)}:null,exitBounds:bambooClimbHud?.exitBounds?{...bambooClimbHud.exitBounds}:null,loaded:Boolean(bambooClimbHud)},
    longJump:{...longJumpState,arcadeScore:longJumpHud?{distance:longJumpHud.arcadeScore.distance.text,visible:longJumpHud.arcadeScore.root.visible,distancePixelHeight:arcadeNumberPixelHeight(longJumpHud.arcadeScore.distance)}:null,resultText:longJumpHud?.result.userData.smoothText.text??'',resultVisible:Boolean(longJumpHud?.result.visible),exitBounds:longJumpHud?.exit.bounds?{...longJumpHud.exit.bounds}:null,restartBounds:null,loaded:Boolean(longJumpHud)},
    hopscotch:{...hopscotchState,arcadeScore:hopscotchHud?{target:hopscotchHud.arcadeScore.target.text,best:hopscotchHud.arcadeScore.best.text,targetPixelHeight:arcadeNumberPixelHeight(hopscotchHud.arcadeScore.target),bestPixelHeight:arcadeNumberPixelHeight(hopscotchHud.arcadeScore.best)}:null,scoreBounds:hopscotchHud?.scoreBounds?{...hopscotchHud.scoreBounds}:null,exitBounds:hopscotchHud?.exitBounds?{...hopscotchHud.exitBounds}:null,loaded:Boolean(hopscotchHud)},
    jacks:{...jacksState,arcadeScore:jacksHud?{stage:jacksHud.arcadeScore.stage.text,remaining:jacksHud.arcadeScore.remaining.text,streak:jacksHud.arcadeScore.combo.text,failures:jacksHud.arcadeScore.misses.text,stagePixelHeight:arcadeNumberPixelHeight(jacksHud.arcadeScore.stage),remainingPixelHeight:arcadeNumberPixelHeight(jacksHud.arcadeScore.remaining)}:null,scoreBounds:jacksHud?.scoreBounds?{...jacksHud.scoreBounds}:null,exitBounds:jacksHud?.exit.bounds?{...jacksHud.exit.bounds}:null,loaded:Boolean(jacksHud)},
    flagRaising:{...flagRaisingState,exitBounds:flagRaisingHud?.exitBounds?{...flagRaisingHud.exitBounds}:null,instruction:flagRaisingHud?.instructionText??'',instructionPixelSize:flagRaisingHud?[...flagRaisingHud.instructionPixelSize]:null,loaded:Boolean(flagRaisingHud)},
    arcadeComic:arcadeComicHud?{
      loaded:true,active:arcadeComicHud.active,game:arcadeComicHud.game,phrase:arcadeComicHud.phrase,secondaryPhrase:arcadeComicHud.secondaryPhrase,kind:arcadeComicHud.kind,
      ready:Object.fromEntries(Object.entries(arcadeComicHud.textEntries).map(([name,entry])=>[name,entry.ready])),
      atlasSizes:Object.fromEntries(Object.entries(ARCADE_COMIC_TEXT_CONFIG).map(([name,config])=>[name,config.size])),
      rootVisible:arcadeComicHud.root.visible,
      rootPosition:[arcadeComicHud.root.position.x,arcadeComicHud.root.position.y],
      baseTextScale:[...arcadeComicHud.baseTextScale],baseBurstScale:[...arcadeComicHud.baseBurstScale],
      burstVisible:Boolean(arcadeComicHud.major.mesh.visible||arcadeComicHud.hit.mesh.visible||arcadeComicHud.fail.mesh.visible),
      burstScale:[arcadeComicHud.major.mesh.scale.x,arcadeComicHud.major.mesh.scale.y],
      hitScale:[arcadeComicHud.hit.mesh.scale.x,arcadeComicHud.hit.mesh.scale.y],
      failScale:[arcadeComicHud.fail.mesh.scale.x,arcadeComicHud.fail.mesh.scale.y],
      textScale:arcadeComicHud.game?[arcadeComicHud.textEntries[arcadeComicHud.game].phrases[arcadeComicHud.phrase].mesh.scale.x,arcadeComicHud.textEntries[arcadeComicHud.game].phrases[arcadeComicHud.phrase].mesh.scale.y]:null,
    }:{loaded:false},
    shuttlecock:{...shuttlecockState,arcadeScore:shuttlecockHud?{streak:shuttlecockHud.arcadeScore.streak.text,best:shuttlecockHud.arcadeScore.best.text,streakPixelHeight:arcadeNumberPixelHeight(shuttlecockHud.arcadeScore.streak),bestPixelHeight:arcadeNumberPixelHeight(shuttlecockHud.arcadeScore.best)}:null,scoreBounds:shuttlecockHud?.scoreBounds?{...shuttlecockHud.scoreBounds}:null,exitBounds:shuttlecockHud?.exitBounds?{...shuttlecockHud.exitBounds}:null,leftBounds:shuttlecockHud?.left.bounds?{...shuttlecockHud.left.bounds}:null,rightBounds:shuttlecockHud?.right.bounds?{...shuttlecockHud.right.bounds}:null,loaded:Boolean(shuttlecockHud)},
    pixelText:pixelText.snapshot(),
    atlases:loaded?6:0,
  })

  return {load,setEnabled,setInteraction,setPosture,setViewMode,setViewToggleVisible,setPersonalRecordVisible,setPointTargetVisible,setPointWalking,setBasketballHud,setSlingshotHud,setPingPongHud,setBambooClimbHud,setLongJumpHud,setHopscotchHud,setShuttlecockHud,setJacksHud,setFlagRaisingHud,setMinigamePaused,resumeAfterMinigamePause,hitViewToggle,hitPersonalRecord,hitBasketballShoot,hitSlingshotDistance,hitBambooClimbExit,hitLongJumpExit,hitLongJumpRestart,hitHopscotchExit,hitShuttlecockExit,hitJacksExit,hitFlagRaisingExit,hitMinigamePauseAction,showTutorial,showMinigameTutorial,flashBasketballPoints,flashPingPongFeedback,prepareArcadeComicGame,playArcadeComicCelebration,stopArcadeComicCelebration,update,render,resize,snapshot}
}

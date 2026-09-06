import * as THREE from 'three'
import {translateRuntimeText} from '../i18n/index.js'

const COLORS={
  ink:'#2e2920',muted:'#74684f',paper:'#ead9ad',paperDeep:'#cfb77e',red:'#9e4332',blue:'#315a67',green:'#4e6847',warm:'#fff4cf',shade:'rgba(18,16,12,.68)',line:'rgba(73,59,38,.34)',white:'rgba(255,255,255,.18)',track:'rgba(76,62,39,.16)',hidden:'#897b5f',
}
const FONT='"Songti SC","STSong","SimSun",serif'
const SANS='"PingFang SC","Microsoft YaHei",system-ui,sans-serif'
const MONO='"Courier New",monospace'

const inside=(bounds,x,y)=>Boolean(bounds&&x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom)
const clampRatio=(value,total)=>total>0?Math.max(0,Math.min(1,value/total)):0
const truncate=(context,text,maxWidth)=>{
  const source=String(text??'')
  if(context.measureText(source).width<=maxWidth)return source
  let value=source
  while(value.length&&context.measureText(`${value}…`).width>maxWidth)value=value.slice(0,-1)
  return `${value}…`
}

export function layoutPersonalGameRows(count,width,height) {
  const portrait=height>width,left=74,top=205,right=width-42,columns=portrait?1:2
  const rowsPerColumn=Math.max(1,Math.ceil(count/columns)),columnGap=portrait?0:28,rowGap=portrait?14:15
  const rowWidth=(right-left-columnGap*(columns-1))/columns
  // Reserve the footer and shrink spacing only when the current catalogue needs it.
  const rowPitch=Math.min(portrait?82:91,(height-64-top+rowGap)/rowsPerColumn),rowHeight=rowPitch-rowGap
  return Array.from({length:count},(_,index)=>({
    left:left+Math.floor(index/rowsPerColumn)*(rowWidth+columnGap),
    top:top+(index%rowsPerColumn)*rowPitch,width:rowWidth,height:rowHeight,
  }))
}

export function createPersonalRecordBook({renderer,isTouchMode=()=>false}={}) {
  const scene=new THREE.Scene();scene.name='personal-record-book-overlay-scene'
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,10);camera.position.z=1
  const shade=new THREE.Mesh(
    new THREE.PlaneGeometry(2,2),
    new THREE.MeshBasicMaterial({name:'personal-record-book-shade-material',color:0x15130f,transparent:true,opacity:.68,depthTest:false,depthWrite:false,toneMapped:false}),
  )
  shade.name='personal-record-book-shade';shade.renderOrder=50;scene.add(shade)

  const canvas=document.createElement('canvas'),context=canvas.getContext('2d')
  const texture=new THREE.CanvasTexture(canvas);texture.name='personal-record-book-resident-texture';texture.colorSpace=THREE.SRGBColorSpace
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())
  const material=new THREE.MeshBasicMaterial({name:'personal-record-book-material',map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);panel.name='personal-record-book-panel';panel.renderOrder=51;scene.add(panel)

  let active=false,page='overview',mode='book',viewModel=null
  let displayBounds=null,actions=[],canvasTextureUploads=0,gameRows=[],bestRecordIds=[]

  const font=(size,{weight=500,family=FONT}={})=>`${weight} ${size}px ${family}`
  const fillText=(text,x,y,size,{color=COLORS.ink,align='left',weight=500,family=FONT,maxWidth=null}={})=>{
    context.fillStyle=color;context.font=font(size,{weight,family});context.textAlign=align;context.textBaseline='middle'
    const localized=translateRuntimeText(text)
    context.fillText(maxWidth?truncate(context,localized,maxWidth):localized,x,y)
  }
  const line=(x1,y1,x2,y2,width=2,color=COLORS.line)=>{
    context.beginPath();context.moveTo(x1,y1);context.lineTo(x2,y2);context.lineWidth=width;context.strokeStyle=color;context.stroke()
  }
  const rect=(x,y,width,height,{fill=null,stroke=null,lineWidth=2}={})=>{
    if(fill){context.fillStyle=fill;context.fillRect(x,y,width,height)}
    if(stroke){context.strokeStyle=stroke;context.lineWidth=lineWidth;context.strokeRect(x,y,width,height)}
  }
  const addAction=(action,x,y,width,height)=>actions.push({action,left:x,top:y,right:x+width,bottom:y+height})
  const drawProgress=(x,y,width,value,total,color=COLORS.blue)=>{
    rect(x,y,width,8,{fill:COLORS.track});rect(x,y,width*clampRatio(value,total),8,{fill:color})
  }
  const drawPaper=()=>{
    const {width,height}=canvas
    context.clearRect(0,0,width,height)
    context.fillStyle=COLORS.paper;context.fillRect(0,0,width,height)
    context.globalAlpha=.18
    for(let y=80;y<height;y+=42)line(0,y,width,y,1,COLORS.blue)
    context.globalAlpha=1
    rect(18,0,18,height,{fill:COLORS.red});rect(43,0,2,height,{fill:'rgba(158,67,50,.28)'})
    const gradient=context.createRadialGradient(width*.2,height*.1,0,width*.2,height*.1,width*.72)
    gradient.addColorStop(0,'rgba(255,255,255,.20)');gradient.addColorStop(1,'rgba(102,72,30,.08)')
    context.fillStyle=gradient;context.fillRect(0,0,width,height)
  }
  const drawHeader=(title='个人纪录册',subtitle='我的校园足迹 · 本机保存')=>{
    const {width}=canvas,left=74
    fillText(title,left,54,40,{weight:500});fillText(subtitle,left,91,19,{color:COLORS.muted,family:SANS})
    context.save();context.translate(width-112,63);context.rotate(-.07);rect(-64,-25,128,50,{stroke:COLORS.red,lineWidth:3});fillText('持续记录中',0,0,19,{color:COLORS.red,align:'center',family:SANS});context.restore()
    line(left,113,width-42,113,3,COLORS.ink)
  }
  const drawTabs=()=>{
    const names=[['overview','总览'],['games','游戏纪录'],['mysteries','神秘任务']],left=74,top=128,width=canvas.width-left-42,gap=5,tabWidth=(width-gap*2)/3
    for(const [index,[id,label]] of names.entries()){
      const x=left+index*(tabWidth+gap),selected=page===id
      rect(x,top,tabWidth,51,{fill:selected?COLORS.red:COLORS.white,stroke:selected?COLORS.red:COLORS.line,lineWidth:2})
      fillText(label,x+tabWidth/2,top+26,21,{align:'center',color:selected?COLORS.warm:COLORS.ink,family:SANS})
      addAction(`tab:${id}`,x,top,tabWidth,51)
    }
    line(left,181,canvas.width-42,181,3,COLORS.red)
    addAction('close',canvas.width-62,12,50,50)
    fillText('×',canvas.width-37,34,37,{align:'center',family:SANS})
  }
  const drawSummaryCell=(x,y,width,height,label,value,total,{suffix='',color=COLORS.blue}={})=>{
    rect(x,y,width,height,{fill:'rgba(255,255,255,.10)',stroke:COLORS.ink,lineWidth:2})
    fillText(label,x+15,y+23,18,{color:COLORS.muted,family:SANS})
    fillText(String(value).padStart(2,'0'),x+15,y+62,34,{family:MONO})
    if(total!=null)fillText(`/ ${total}`,x+72,y+63,19,{color:COLORS.muted,family:MONO})
    else if(suffix)fillText(suffix,x+72,y+63,19,{color:COLORS.muted,family:SANS})
    drawProgress(x+15,y+height-17,width-30,value,total??Math.max(1,value),color)
  }
  const drawOverview=()=>{
    const data=viewModel,{width}=canvas,left=74,right=width-42,top=205,gap=10,portrait=canvas.height>canvas.width
    const columns=portrait?2:4,cellWidth=(right-left-gap*(columns-1))/columns,cellHeight=105
    const cells=[
      ['参观房间',data.counts.rooms,data.totals.rooms,{}],['看过书籍',data.counts.books,data.totals.books,{}],
      ['看过物件',data.counts.objectTypes,data.totals.objectTypes,{suffix:'种'}],['玩过游戏',data.counts.games,data.totals.games,{}],
    ]
    cells.forEach(([label,value,total,options],index)=>drawSummaryCell(left+(index%columns)*(cellWidth+gap),top+Math.floor(index/columns)*(cellHeight+gap),cellWidth,cellHeight,label,value,total,options))
    const sectionTop=top+Math.ceil(cells.length/columns)*(cellHeight+gap)+16
    if(portrait){
      drawBestRecords(left,sectionTop,right-left)
      drawMysterySummary(left,sectionTop+360,right-left)
    }else{
      const sectionGap=26,sectionWidth=(right-left-sectionGap)/2
      drawBestRecords(left,sectionTop,sectionWidth)
      drawMysterySummary(left+sectionWidth+sectionGap,sectionTop,sectionWidth)
    }
  }
  const drawBestRecords=(x,y,width)=>{
    fillText('我的最佳纪录',x,y+18,23,{color:COLORS.red});line(x,y+39,x+width,y+39,2,COLORS.line)
    const records=viewModel.games.filter(game=>game.hasRecord).slice(0,6)
    bestRecordIds=records.map(game=>game.id)
    if(!records.length){fillText('玩一次游戏，第一条纪录会留在这里。',x,y+84,19,{color:COLORS.muted,family:SANS});return}
    records.forEach((game,index)=>{
      const rowY=y+66+index*43
      fillText(game.label,x,rowY,19,{family:SANS,maxWidth:width*.45})
      fillText(game.record,x+width,rowY,19,{align:'right',color:COLORS.blue,family:SANS,maxWidth:width*.52})
      line(x,rowY+21,x+width,rowY+21,1,COLORS.line)
    })
  }
  const drawMysterySummary=(x,y,width)=>{
    fillText(`神秘发现 · ${viewModel.counts.mysteries} / ${viewModel.totals.mysteries}`,x,y+18,23,{color:COLORS.red});line(x,y+39,x+width,y+39,2,COLORS.line)
    const gap=8,tileWidth=(width-gap*2)/3
    viewModel.mysteries.forEach((item,index)=>{
      const tileX=x+index*(tileWidth+gap),tileY=y+57
      context.setLineDash([7,6]);rect(tileX,tileY,tileWidth,88,{fill:COLORS.white,stroke:COLORS.muted,lineWidth:2});context.setLineDash([])
      const mark=item.found?'✓':item.id==='snackBags'?`${item.progress}/${item.total}`:'?'
      fillText(mark,tileX+tileWidth/2,tileY+31,28,{align:'center',color:COLORS.red,family:MONO})
      fillText(item.found?item.label:item.id==='snackBags'?'零食任务':'尚未发现',tileX+tileWidth/2,tileY+66,16,{align:'center',family:SANS,maxWidth:tileWidth-12})
    })
  }
  const drawGames=()=>{
    gameRows=layoutPersonalGameRows(viewModel.games.length,canvas.width,canvas.height)
      .map((bounds,index)=>({id:viewModel.games[index].id,...bounds}))
    gameRows.forEach(({left,top,width,height},index)=>drawGameRow(left,top,width,height,viewModel.games[index]))
  }
  const drawGameRow=(x,y,width,height,game)=>{
    rect(x,y,width,height,{fill:game.played?'rgba(255,255,255,.11)':'rgba(96,77,47,.05)'})
    line(x,y+height,x+width,y+height,1,COLORS.line)
    fillText(game.label,x+12,y+height*.34,20,{family:SANS,maxWidth:width*.46})
    fillText(game.record,x+width-12,y+height*.34,19,{align:'right',color:game.played?COLORS.red:COLORS.hidden,family:SANS,maxWidth:width*.52})
    fillText(game.hidden?'尚未发现':game.played?'已有个人纪录':'未玩过',x+12,y+height*.72,15,{color:game.played?COLORS.green:COLORS.muted,family:SANS})
  }
  const drawMysteries=()=>{
    const {width,height}=canvas,left=74,right=width-42,top=213,portrait=height>width
    fillText('完成任意一个任务，就盖上一枚发现章。',left,top,19,{color:COLORS.muted,family:SANS})
    fillText(`${viewModel.counts.mysteries} / ${viewModel.totals.mysteries}`,right,top,32,{align:'right',color:COLORS.red,family:MONO})
    const rowTop=top+43,rowHeight=portrait?245:175,gap=15
    viewModel.mysteries.forEach((item,index)=>{
      const y=rowTop+index*(rowHeight+gap)
      rect(left,y,right-left,rowHeight,{fill:COLORS.white});line(left,y+rowHeight,right,y+rowHeight,2,COLORS.line)
      context.save();context.translate(left+49,y+55);context.rotate(-.04);context.setLineDash(item.found?[]:[7,5]);rect(-33,-33,66,66,{stroke:item.found?COLORS.ink:COLORS.hidden,lineWidth:3});context.setLineDash([])
      fillText(item.found||item.id==='snackBags'?(item.id==='snackBags'?'食':'机'):'?',0,1,31,{align:'center',color:item.found?COLORS.ink:COLORS.hidden});context.restore()
      const name=item.found||item.id==='snackBags'?item.label:'神秘物件'
      fillText(name,left+98,y+35,24,{family:SANS})
      const detail=item.id==='snackBags'
        ?`找到三包，完成这一项任务 · 已找到 ${item.progress} / ${item.total}`
        :item.found?'已经找到并打开过':'尚未发现，不显示名称与所在房间'
      fillText(detail,left+98,y+72,18,{color:COLORS.muted,family:SANS,maxWidth:right-left-220})
      if(item.id==='snackBags')for(let bag=0;bag<item.total;bag++){
        context.setLineDash(bag<item.progress?[]:[5,4]);rect(left+98+bag*34,y+99,23,17,{fill:bag<item.progress?COLORS.red:null,stroke:COLORS.red,lineWidth:2});context.setLineDash([])
      }
      const stampWidth=portrait?112:124,stampX=portrait?left+98:right-stampWidth-16,stampY=portrait?y+145:y+100
      context.save();context.translate(stampX+stampWidth/2,stampY+24);context.rotate(.04);context.setLineDash(item.found?[]:[7,5]);rect(-stampWidth/2,-24,stampWidth,48,{stroke:item.found?COLORS.green:COLORS.hidden,lineWidth:3});context.setLineDash([])
      fillText(item.found?'已发现':item.progress>0?'进行中':'未发现',0,0,19,{align:'center',color:item.found?COLORS.green:COLORS.hidden,family:SANS});context.restore()
    })
  }
  const drawBook=()=>{
    drawPaper();drawHeader();drawTabs()
    if(page==='games')drawGames()
    else if(page==='mysteries')drawMysteries()
    else drawOverview()
    fillText('界面数据来自当前浏览器 · 清除网站数据会同时清除纪录',74,canvas.height-25,15,{color:COLORS.muted,family:SANS})
    fillText(isTouchMode()?'点右上角 × 返回校园':'Esc 返回校园',canvas.width-42,canvas.height-25,15,{align:'right',color:COLORS.muted,family:SANS})
  }
  const drawPauseMenu=()=>{
    const {width,height}=canvas;context.clearRect(0,0,width,height)
    context.fillStyle='rgba(0,0,0,0)';context.fillRect(0,0,width,height)
    const panelWidth=Math.min(width-100,680),panelHeight=430,x=(width-panelWidth)/2,y=(height-panelHeight)/2
    rect(x,y,panelWidth,panelHeight,{fill:COLORS.ink})
    rect(x+8,y+8,panelWidth-16,panelHeight-16,{fill:COLORS.paper})
    fillText('暂停漫游',width/2,y+84,42,{align:'center'})
    fillText('选择继续校园漫游，或翻开个人纪录册',width/2,y+139,19,{align:'center',color:COLORS.muted,family:SANS})
    const buttonWidth=Math.min(240,(panelWidth-74)/2),buttonHeight=72,gap=24,buttonY=y+229,left=width/2-buttonWidth-gap/2,right=width/2+gap/2
    rect(left,buttonY,buttonWidth,buttonHeight,{fill:'#e7bd59',stroke:COLORS.ink,lineWidth:3});fillText('继续漫游',left+buttonWidth/2,buttonY+36,25,{align:'center',family:SANS})
    rect(right,buttonY,buttonWidth,buttonHeight,{fill:COLORS.warm,stroke:COLORS.ink,lineWidth:3});fillText('个人纪录册',right+buttonWidth/2,buttonY+36,25,{align:'center',family:SANS})
    addAction('resume',left,buttonY,buttonWidth,buttonHeight);addAction('open-book',right,buttonY,buttonWidth,buttonHeight)
    fillText('Esc 关闭菜单',width/2,y+363,16,{align:'center',color:COLORS.muted,family:SANS})
  }
  const redraw=()=>{
    actions=[];gameRows=[];bestRecordIds=[]
    if(mode==='menu')drawPauseMenu();else drawBook()
    texture.needsUpdate=true;canvasTextureUploads++
  }
  const configureCanvas=()=>{
    const portrait=renderer.domElement.clientHeight>renderer.domElement.clientWidth
    const width=portrait?900:1400,height=portrait?1400:900
    if(canvas.width===width&&canvas.height===height)return false
    // WebGL texture storage is immutable: release the old allocation before
    // changing canvas dimensions, then reuse the same texture/material objects.
    texture.dispose()
    canvas.width=width;canvas.height=height;return true
  }
  const resize=()=>{
    const viewportWidth=Math.max(1,renderer.domElement.clientWidth),viewportHeight=Math.max(1,renderer.domElement.clientHeight)
    const changed=configureCanvas(),maxWidth=viewportWidth-24,maxHeight=viewportHeight-24
    const scale=Math.min(maxWidth/canvas.width,maxHeight/canvas.height),displayWidth=canvas.width*scale,displayHeight=canvas.height*scale
    panel.scale.set(displayWidth/viewportWidth*2,displayHeight/viewportHeight*2,1)
    displayBounds={left:(viewportWidth-displayWidth)/2,right:(viewportWidth+displayWidth)/2,top:(viewportHeight-displayHeight)/2,bottom:(viewportHeight+displayHeight)/2,width:displayWidth,height:displayHeight}
    if(changed&&active)redraw()
  }
  const setViewModel=value=>{viewModel=value;if(active&&mode==='book')redraw()}
  const openMenu=value=>{viewModel=value??viewModel;mode='menu';active=true;panel.visible=shade.visible=true;resize();redraw();return true}
  const openBook=(value,initialPage='overview')=>{viewModel=value??viewModel;if(!viewModel)return false;page=['overview','games','mysteries'].includes(initialPage)?initialPage:'overview';mode='book';active=true;panel.visible=shade.visible=true;resize();redraw();return true}
  const close=()=>{active=false;panel.visible=shade.visible=false;return true}
  const hitAction=(clientX,clientY)=>{
    if(!active)return null
    if(!inside(displayBounds,clientX,clientY))return mode==='menu'?'resume':null
    return actions.find(item=>{
      const left=displayBounds.left+item.left/canvas.width*displayBounds.width,right=displayBounds.left+item.right/canvas.width*displayBounds.width
      const top=displayBounds.top+item.top/canvas.height*displayBounds.height,bottom=displayBounds.top+item.bottom/canvas.height*displayBounds.height
      const padX=Math.max(0,(44-(right-left))/2),padY=Math.max(0,(44-(bottom-top))/2)
      return inside({left:left-padX,right:right+padX,top:top-padY,bottom:bottom+padY},clientX,clientY)
    })?.action??null
  }
  const applyAction=action=>{
    if(action==='open-book'){mode='book';page='overview';redraw();return 'book'}
    if(action?.startsWith('tab:')){page=action.slice(4);redraw();return page}
    if(action==='resume'||action==='close'){close();return 'closed'}
    return null
  }
  const render=()=>{
    if(!active)return
    const previousAutoClear=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(scene,camera);renderer.autoClear=previousAutoClear
  }
  const snapshot=()=>({
    active,mode,page,displayBounds:displayBounds?{...displayBounds}:null,
    actions:actions.map(item=>({...item})),canvas:[canvas.width,canvas.height],drawObjects:active?2:0,
    gameRows:gameRows.map(row=>({...row})),bestRecordIds:[...bestRecordIds],
    canvasTextureUploads,viewModel:viewModel?structuredClone(viewModel):null,
  })

  configureCanvas();panel.visible=shade.visible=false;resize()
  return {openMenu,openBook,close,setViewModel,hitAction,applyAction,resize,render,snapshot,isOpen:()=>active,isMenu:()=>active&&mode==='menu'}
}

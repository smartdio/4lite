import * as THREE from 'three'

export const PIXEL_UI_FONT_URL='/assets/fonts/pixel/4lite-fusion-pixel-12px-ui-v02.woff2'
export const PIXEL_UI_FONT_FAMILY='4Lite Pixel UI'
export const PIXEL_UI_CHARS=' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-/:%.得分命中投篮两三四乒乓球局胜负时间连击回合玩家电脑对手暂停开始结束重置本次距离总计最高记录练习比赛制发进行按住移动松手抛点击好扣杀攀爬左右抓稳用力厘米脱手再试一次到顶高度退出目标连续剩余失误瞄准后片逐格跳回轻触重开看时机石子接王'

const CELL_SIZE=64
const COLUMNS=16
const FONT_SIZE=48

const setGlyphUv=(geometry,index,atlasWidth,atlasHeight)=>{
  const x=index%COLUMNS*CELL_SIZE,y=Math.floor(index/COLUMNS)*CELL_SIZE
  const u0=x/atlasWidth,u1=(x+CELL_SIZE)/atlasWidth
  const v1=1-y/atlasHeight,v0=1-(y+CELL_SIZE)/atlasHeight
  const uv=geometry.getAttribute('uv')
  uv.setXY(0,u0,v1);uv.setXY(1,u1,v1);uv.setXY(2,u0,v0);uv.setXY(3,u1,v0);uv.needsUpdate=true
}

export function createPixelTextSystem({renderer}){
  const glyphs=[...new Set([...PIXEL_UI_CHARS])]
  const glyphIndex=new Map(glyphs.map((glyph,index)=>[glyph,index]))
  let loaded=false,texture=null,atlasWidth=0,atlasHeight=0

  const load=async()=>{
    if(loaded)return true
    const face=new FontFace(PIXEL_UI_FONT_FAMILY,`url("${PIXEL_UI_FONT_URL}") format("woff2")`,{style:'normal',weight:'400'})
    await face.load();document.fonts.add(face)
    const rows=Math.ceil(glyphs.length/COLUMNS)
    atlasWidth=COLUMNS*CELL_SIZE;atlasHeight=THREE.MathUtils.ceilPowerOfTwo(rows*CELL_SIZE)
    const canvas=document.createElement('canvas');canvas.width=atlasWidth;canvas.height=atlasHeight
    const context=canvas.getContext('2d',{alpha:true});context.clearRect(0,0,atlasWidth,atlasHeight)
    context.imageSmoothingEnabled=false;context.fillStyle='#ffffff';context.textAlign='center';context.textBaseline='middle'
    context.font=`400 ${FONT_SIZE}px "${PIXEL_UI_FONT_FAMILY}"`
    glyphs.forEach((glyph,index)=>{
      if(glyph===' ')return
      const x=index%COLUMNS*CELL_SIZE+CELL_SIZE/2,y=Math.floor(index/COLUMNS)*CELL_SIZE+CELL_SIZE/2
      context.fillText(glyph,x,y+1)
    })
    texture=new THREE.CanvasTexture(canvas);texture.name='webgl-hud-shared-pixel-glyph-atlas'
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping
    texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.anisotropy=1;texture.needsUpdate=true
    loaded=true;return true
  }

  const makeMaterial=(color=0xfff1bd,opacity=1,name='webgl-pixel-text-material')=>{
    if(!loaded)throw new Error('Pixel text system must be loaded before creating materials')
    return new THREE.MeshBasicMaterial({name,map:texture,color,transparent:true,opacity,depthTest:false,depthWrite:false,toneMapped:false})
  }

  const createLine=({maxChars=16,material,name='webgl-pixel-text-line',renderOrder=10}={})=>{
    if(!loaded)throw new Error('Pixel text system must be loaded before creating lines')
    const group=new THREE.Group();group.name=name;group.frustumCulled=false
    const slots=[]
    for(let index=0;index<maxChars;index++){
      const geometry=new THREE.PlaneGeometry(1,1)
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`${name}-glyph-${index}`;mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=renderOrder
      group.add(mesh);slots.push(mesh)
    }
    let currentText=''
    const setText=value=>{
      const next=String(value??'').slice(0,maxChars)
      if(next===currentText)return false
      currentText=next
      const characters=[...next],advances=characters.map(char=>char===' '?.42:/[\x00-\xff]/.test(char)?.58:1)
      const total=advances.reduce((sum,value)=>sum+value,0)
      let cursor=-total/2
      for(let index=0;index<slots.length;index++){
        const mesh=slots[index],char=characters[index]
        if(char==null||char===' '){mesh.visible=false;if(char===' ')cursor+=advances[index];continue}
        const atlasIndex=glyphIndex.get(char)??glyphIndex.get(' ')
        if(mesh.userData.atlasIndex!==atlasIndex){setGlyphUv(mesh.geometry,atlasIndex,atlasWidth,atlasHeight);mesh.userData.atlasIndex=atlasIndex}
        const advance=advances[index];mesh.position.x=cursor+advance/2;mesh.visible=true;cursor+=advance
      }
      return true
    }
    group.userData.pixelText={setText,get text(){return currentText},maxChars,slots}
    return group
  }

  const setLinePixels=(line,heightPixels,viewportWidth,viewportHeight)=>line.scale.set(heightPixels*2/Math.max(1,viewportWidth),heightPixels*2/Math.max(1,viewportHeight),1)
  const snapshot=()=>({loaded,fontUrl:PIXEL_UI_FONT_URL,glyphs:glyphs.length,atlas:[atlasWidth,atlasHeight],sizes:{small:16,large:32}})

  return {load,makeMaterial,createLine,setLinePixels,snapshot}
}

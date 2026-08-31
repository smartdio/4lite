import {execFile} from 'node:child_process'
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const run=promisify(execFile)
const root=process.cwd()
const candidates=[
  'public/assets/models/activity-sand/activity-sand-north-12x5-v02.glb',
  'public/assets/models/activity-sand/activity-sand-south-7x3-v02.glb',
  'public/assets/models/sandpit/sandpit-recessed-game-v01.glb',
  'public/assets/models/teacher-dormitory/teacher-dormitory-game-optimized-v01.glb',
  'public/assets/models/old-classroom/old-classroom-game-optimized-v02.glb',
  'public/assets/models/toilet/toilet-game-optimized-v01.glb',
]

function parseGlb(buffer,file) {
  let offset=12,json=null,bin=null
  while(offset<buffer.length) {
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4),chunk=buffer.subarray(offset+8,offset+8+length)
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').trim())
    if(type===0x004e4942)bin=chunk
    offset+=8+length
  }
  if(!json||!bin)throw new Error(`${file}: incomplete GLB`)
  const rolesByImage=new Map()
  const addRole=(textureInfo,role)=>{
    if(textureInfo?.index==null)return
    const image=json.textures?.[textureInfo.index]?.source
    if(image==null)return
    if(!rolesByImage.has(image))rolesByImage.set(image,new Set())
    rolesByImage.get(image).add(role)
  }
  for(const material of json.materials??[]) {
    addRole(material.pbrMetallicRoughness?.baseColorTexture,'baseColor')
    addRole(material.pbrMetallicRoughness?.metallicRoughnessTexture,'metallicRoughness')
    addRole(material.normalTexture,'normal')
    addRole(material.occlusionTexture,'occlusion')
    addRole(material.emissiveTexture,'emissive')
  }
  return (json.images??[]).map((image,index)=>{
    if(image.mimeType!=='image/png'||image.bufferView==null)return null
    const view=json.bufferViews[image.bufferView],start=view.byteOffset??0
    return {index,bytes:bin.subarray(start,start+view.byteLength),roles:[...(rolesByImage.get(index)??[])]}
  }).filter(Boolean)
}

const directory=await mkdtemp(path.join(tmpdir(),'4lite-webp-'))
const assets=[]
try {
  for(const relative of candidates) {
    const images=parseGlb(await readFile(path.join(root,relative)),relative),results=[]
    for(const image of images) {
      const stem=`${relative.replaceAll('/','_')}-${image.index}`
      const source=path.join(directory,`${stem}.png`),output=path.join(directory,`${stem}.webp`)
      await writeFile(source,image.bytes)
      const lossless=image.roles.some(role=>role!=='baseColor'&&role!=='emissive')
      const args=lossless
        ?['-quiet','-lossless','-m','6',source,'-o',output]
        :['-quiet','-q','92','-m','6','-sharp_yuv','-alpha_q','100',source,'-o',output]
      await run('cwebp',args)
      results.push({index:image.index,roles:image.roles,mode:lossless?'lossless':'q92-alpha100',pngBytes:image.bytes.length,webpBytes:(await stat(output)).size})
    }
    assets.push({file:relative,images:results,pngBytes:results.reduce((sum,item)=>sum+item.pngBytes,0),webpBytes:results.reduce((sum,item)=>sum+item.webpBytes,0)})
  }
  const sharedSandRelative='public/assets/textures/sand/sandpit-cement-rim-albedo-v01.png'
  const sharedSandSource=await readFile(path.join(root,sharedSandRelative))
  const sharedSandInput=path.join(directory,'shared-sand.png'),sharedSandOutput=path.join(directory,'shared-sand.webp')
  await writeFile(sharedSandInput,sharedSandSource)
  await run('cwebp',['-quiet','-q','92','-m','6','-sharp_yuv',sharedSandInput,'-o',sharedSandOutput])
  const sharedSandResult={index:0,roles:['baseColor'],mode:'q92-alpha100',pngBytes:sharedSandSource.length,webpBytes:(await stat(sharedSandOutput)).size}
  assets.push({file:sharedSandRelative,images:[sharedSandResult],pngBytes:sharedSandResult.pngBytes,webpBytes:sharedSandResult.webpBytes})
} finally {
  await rm(directory,{recursive:true,force:true})
}

const groups={
  sand:assets.filter(asset=>asset.file.includes('sand')),
  buildings:assets.filter(asset=>!asset.file.includes('sand')),
}
const summarize=items=>{
  const pngBytes=items.reduce((sum,item)=>sum+item.pngBytes,0),webpBytes=items.reduce((sum,item)=>sum+item.webpBytes,0)
  return {pngBytes,webpBytes,savedBytes:pngBytes-webpBytes,savedRatio:1-webpBytes/pngBytes}
}
console.log(JSON.stringify({generatedAt:new Date().toISOString(),policy:'baseColor/emissive q92 alpha100; data maps lossless; sizing candidate only, not visual approval',groups:{sand:summarize(groups.sand),buildings:summarize(groups.buildings)},assets},null,2))

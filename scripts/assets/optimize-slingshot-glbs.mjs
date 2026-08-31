import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {mkdir,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const run=promisify(execFile)
const root=process.cwd()
const outputRoot=path.resolve(root,'public/assets/models/slingshot')
const reportPath=path.resolve(root,'artifacts/performance/slingshot/optimization-report.json')
const targets=[
  {id:'wood',source:'GLB/木弹弓.glb',output:'wood-slingshot-game-optimized-v01.glb'},
  {id:'wire',source:'GLB/铁弹弓.glb',output:'wire-slingshot-game-optimized-v01.glb'},
]

const cli=['--yes','@gltf-transform/cli@4.4.2']
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex')
const align4=value=>(value+3)&~3

function parseGlb(buffer,file) {
  if(buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2)throw new Error(`${file}: invalid GLB`)
  let offset=12,json=null,bin=null
  while(offset<buffer.length) {
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4)
    const chunk=buffer.subarray(offset+8,offset+8+length)
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').trim())
    if(type===0x004e4942)bin=chunk
    offset+=8+length
  }
  if(!json||!bin)throw new Error(`${file}: missing JSON or BIN chunk`)
  return {json,bin}
}

function imageRoles(json) {
  const roles=new Map()
  const add=(textureInfo,role)=>{
    if(textureInfo?.index==null)return
    const texture=json.textures?.[textureInfo.index]
    const image=texture?.source??texture?.extensions?.EXT_texture_webp?.source??texture?.extensions?.KHR_texture_basisu?.source
    if(image==null)return
    if(!roles.has(image))roles.set(image,new Set())
    roles.get(image).add(role)
  }
  for(const material of json.materials??[]) {
    add(material.pbrMetallicRoughness?.baseColorTexture,'baseColor')
    add(material.pbrMetallicRoughness?.metallicRoughnessTexture,'metallicRoughness')
    add(material.normalTexture,'normal')
    add(material.occlusionTexture,'occlusion')
    add(material.emissiveTexture,'emissive')
  }
  return roles
}

function triangleCount(json) {
  let triangles=0
  for(const mesh of json.meshes??[])for(const primitive of mesh.primitives??[]) {
    if((primitive.mode??4)!==4)continue
    const count=primitive.indices!=null
      ?json.accessors?.[primitive.indices]?.count
      :json.accessors?.[primitive.attributes?.POSITION]?.count
    triangles+=Math.floor((count??0)/3)
  }
  return triangles
}

function audit(buffer,file) {
  const {json,bin}=parseGlb(buffer,file),roles=imageRoles(json)
  const imageViews=new Set((json.images??[]).map(image=>image.bufferView).filter(index=>index!=null))
  const images=(json.images??[]).map((image,index)=>{
    const view=json.bufferViews?.[image.bufferView]
    const bytes=view?bin.subarray(view.byteOffset??0,(view.byteOffset??0)+(view.byteLength??0)):null
    let width=null,height=null
    if(image.mimeType==='image/png'&&bytes?.length>=24) {
      width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20)
    }
    return {index,name:image.name??null,mimeType:image.mimeType??null,bytes:view?.byteLength??0,width,height,roles:[...(roles.get(index)??[])]}
  })
  return {
    file,bytes:buffer.length,sha256:sha256(buffer),nodes:json.nodes?.length??0,meshes:json.meshes?.length??0,
    primitives:(json.meshes??[]).reduce((sum,mesh)=>sum+(mesh.primitives?.length??0),0),triangles:triangleCount(json),
    materials:json.materials?.length??0,images,
    imageBytes:images.reduce((sum,image)=>sum+image.bytes,0),
    geometryBytes:(json.bufferViews??[]).reduce((sum,view,index)=>sum+(imageViews.has(index)?0:(view.byteLength??0)),0),
    extensionsUsed:json.extensionsUsed??[],extensionsRequired:json.extensionsRequired??[],
  }
}

function buildGlb(json,sourceBin,replacements) {
  const next=structuredClone(json),chunks=[]
  let byteOffset=0
  for(let index=0;index<(next.bufferViews?.length??0);index++) {
    const original=json.bufferViews[index]
    const payload=replacements.get(index)??sourceBin.subarray(original.byteOffset??0,(original.byteOffset??0)+original.byteLength)
    const aligned=align4(byteOffset)
    if(aligned>byteOffset)chunks.push(Buffer.alloc(aligned-byteOffset))
    byteOffset=aligned;chunks.push(payload)
    next.bufferViews[index].byteOffset=byteOffset
    next.bufferViews[index].byteLength=payload.length
    byteOffset+=payload.length
  }
  const logicalBinLength=byteOffset,paddedBinLength=align4(logicalBinLength)
  if(paddedBinLength>logicalBinLength)chunks.push(Buffer.alloc(paddedBinLength-logicalBinLength))
  const bin=Buffer.concat(chunks)
  next.buffers[0].byteLength=logicalBinLength
  let jsonBytes=Buffer.from(JSON.stringify(next))
  const paddedJsonLength=align4(jsonBytes.length)
  if(paddedJsonLength>jsonBytes.length)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(paddedJsonLength-jsonBytes.length,0x20)])
  const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonBytes.length+8+bin.length,8)
  jsonHeader.writeUInt32LE(jsonBytes.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4)
  binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4)
  return Buffer.concat([header,jsonHeader,jsonBytes,binHeader,bin])
}

async function repackWebp(input,output,temporaryDirectory,id) {
  const source=await readFile(input),{json,bin}=parseGlb(source,input),roles=imageRoles(json),replacements=new Map(),details=[]
  for(let imageIndex=0;imageIndex<(json.images?.length??0);imageIndex++) {
    const image=json.images[imageIndex]
    if(image.mimeType!=='image/png'||image.bufferView==null)continue
    const view=json.bufferViews[image.bufferView]
    const bytes=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)
    const imageRoleList=[...(roles.get(imageIndex)??[])]
    const isNumeric=imageRoleList.some(role=>role==='metallicRoughness'||role==='occlusion')
    const isNormal=imageRoleList.includes('normal')
    const pngPath=path.join(temporaryDirectory,`${id}-${imageIndex}.png`)
    const webpPath=path.join(temporaryDirectory,`${id}-${imageIndex}.webp`)
    await writeFile(pngPath,bytes)
    const args=['-quiet','-q',isNormal||isNumeric?'95':'92','-m','6','-sharp_yuv','-alpha_q','100','-alpha_filter','best','-exact',pngPath,'-o',webpPath]
    await run('cwebp',args)
    const webp=await readFile(webpPath)
    replacements.set(image.bufferView,webp)
    image.mimeType='image/webp'
    for(const texture of json.textures??[])if(texture.source===imageIndex) {
      delete texture.source
      texture.extensions={...(texture.extensions??{}),EXT_texture_webp:{source:imageIndex}}
    }
    details.push({imageIndex,roles:imageRoleList,mode:isNormal||isNumeric?'q95-alpha100':'q92-alpha100',beforeBytes:bytes.length,afterBytes:webp.length})
  }
  json.extensionsUsed=[...new Set([...(json.extensionsUsed??[]),'EXT_texture_webp'])]
  json.extensionsRequired=[...new Set([...(json.extensionsRequired??[]),'EXT_texture_webp'])]
  await writeFile(output,buildGlb(json,bin,replacements))
  return details
}

async function optimize(target,temporaryDirectory) {
  const sourcePath=path.resolve(root,target.source)
  const resized=path.join(temporaryDirectory,`${target.id}-resized.glb`)
  const simplified=path.join(temporaryDirectory,`${target.id}-simplified.glb`)
  const webp=path.join(temporaryDirectory,`${target.id}-webp.glb`)
  const outputPath=path.join(outputRoot,target.output)
  await run('npx',[...cli,'resize',sourcePath,resized,'--width','1024','--height','1024','--filter','lanczos3'],{maxBuffer:16*1024*1024})
  await run('npx',[...cli,'simplify',resized,simplified,'--ratio','0.1','--error','0.001'],{maxBuffer:16*1024*1024})
  const images=await repackWebp(simplified,webp,temporaryDirectory,target.id)
  await run('npx',[...cli,'meshopt',webp,outputPath,'--level','high','--quantize-position','16','--quantize-normal','12','--quantize-texcoord','14','--quantize-color','10','--quantize-generic','14','--quantize-weight','12'],{maxBuffer:16*1024*1024})
  const source=await readFile(sourcePath),output=await readFile(outputPath)
  return {
    id:target.id,source:audit(source,target.source),runtime:audit(output,path.relative(root,outputPath)),images,
    savedBytes:source.length-output.length,savedPercent:+((1-output.length/source.length)*100).toFixed(2),
  }
}

await mkdir(outputRoot,{recursive:true})
await mkdir(path.dirname(reportPath),{recursive:true})
const temporaryDirectory=await mkdtemp(path.join(tmpdir(),'4lite-slingshot-optimize-'))
try {
  const results=[]
  for(const target of targets)results.push(await optimize(target,temporaryDirectory))
  const totals=results.reduce((sum,item)=>({sourceBytes:sum.sourceBytes+item.source.bytes,runtimeBytes:sum.runtimeBytes+item.runtime.bytes,savedBytes:sum.savedBytes+item.savedBytes}),{sourceBytes:0,runtimeBytes:0,savedBytes:0})
  const report={
    generatedAt:new Date().toISOString(),tool:'@gltf-transform/cli@4.4.2 + cwebp',
    policy:'source GLBs preserved; near-view textures locked at 1024 Lanczos3 and must not be reduced further; base color WebP q92; normal and metallic-roughness WebP q95; simplify ratio 0.1 constrained to 0.1% mesh-radius error; conservative high Meshopt quantization',
    parameters:{textureSize:1024,minimumTextureSize:1024,filter:'lanczos3',simplifyRatio:0.1,simplifyError:0.001,baseColor:'WebP q92',normal:'WebP q95',metallicRoughness:'WebP q95',meshopt:{level:'high',position:16,normal:12,texcoord:14,color:10,generic:14,weight:12}},
    totals:{...totals,savedPercent:+((1-totals.runtimeBytes/totals.sourceBytes)*100).toFixed(2)},results,
  }
  await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
  console.log(JSON.stringify(report,null,2))
} finally {
  await rm(temporaryDirectory,{recursive:true,force:true})
}

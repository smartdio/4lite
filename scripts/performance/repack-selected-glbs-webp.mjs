import {execFile} from 'node:child_process'
import {copyFile,mkdir,mkdtemp,readFile,stat,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const run=promisify(execFile)
const root=process.cwd()
const scopeFlag=process.argv.indexOf('--scope')
const scope=scopeFlag>=0?process.argv[scopeFlag+1]:'all'
const apply=process.argv.includes('--apply')
const outputFlag=process.argv.indexOf('--output-root')
const candidateRoot=path.resolve(root,outputFlag>=0?process.argv[outputFlag+1]:'artifacts/performance/phase6b/candidates')
const archiveRoot=path.resolve(root,'archive/phase-6b-pre-webp')

if(!['sand','buildings','all'].includes(scope))throw new Error(`Unsupported scope: ${scope}`)

const groups={
  sand:[
    'public/assets/models/activity-sand/activity-sand-north-12x5-v02.glb',
    'public/assets/models/activity-sand/activity-sand-south-7x3-v02.glb',
    'public/assets/models/sandpit/sandpit-recessed-game-v01.glb',
  ],
  buildings:[
    'public/assets/models/teacher-dormitory/teacher-dormitory-game-optimized-v01.glb',
    'public/assets/models/old-classroom/old-classroom-game-optimized-v02.glb',
    'public/assets/models/toilet/toilet-game-optimized-v01.glb',
  ],
}
const targets=scope==='all'?[...groups.sand,...groups.buildings]:groups[scope]

function align4(value){return (value+3)&~3}

function parseGlb(buffer,file){
  if(buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2)throw new Error(`${file}: invalid GLB`)
  let offset=12,json=null,bin=null
  while(offset<buffer.length){
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4)
    const chunk=buffer.subarray(offset+8,offset+8+length)
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').trim())
    if(type===0x004e4942)bin=chunk
    offset+=8+length
  }
  if(!json||!bin)throw new Error(`${file}: missing JSON or BIN chunk`)
  return {json,bin}
}

function imageRoles(json){
  const roles=new Map()
  const add=(textureInfo,role)=>{
    if(textureInfo?.index==null)return
    const image=json.textures?.[textureInfo.index]?.source
    if(image==null)return
    if(!roles.has(image))roles.set(image,new Set())
    roles.get(image).add(role)
  }
  for(const material of json.materials??[]){
    add(material.pbrMetallicRoughness?.baseColorTexture,'baseColor')
    add(material.pbrMetallicRoughness?.metallicRoughnessTexture,'metallicRoughness')
    add(material.normalTexture,'normal')
    add(material.occlusionTexture,'occlusion')
    add(material.emissiveTexture,'emissive')
  }
  return roles
}

async function encodeWebp(bytes,{lossless,temporaryDirectory,stem}){
  const input=path.join(temporaryDirectory,`${stem}.png`),output=path.join(temporaryDirectory,`${stem}.webp`)
  await writeFile(input,bytes)
  const args=lossless
    ?['-quiet','-lossless','-m','6',input,'-o',output]
    :['-quiet','-q','92','-m','6','-sharp_yuv','-alpha_q','100',input,'-o',output]
  await run('cwebp',args)
  return readFile(output)
}

function buildGlb(json,sourceBin,replacements){
  const next=structuredClone(json),chunks=[]
  let byteOffset=0
  for(let index=0;index<(next.bufferViews?.length??0);index++){
    const original=json.bufferViews[index]
    const payload=replacements.get(index)??sourceBin.subarray(original.byteOffset??0,(original.byteOffset??0)+original.byteLength)
    const aligned=align4(byteOffset)
    if(aligned>byteOffset)chunks.push(Buffer.alloc(aligned-byteOffset))
    byteOffset=aligned
    chunks.push(payload)
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
  const totalLength=12+8+jsonBytes.length+8+bin.length
  const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(totalLength,8)
  jsonHeader.writeUInt32LE(jsonBytes.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4)
  binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4)
  return Buffer.concat([header,jsonHeader,jsonBytes,binHeader,bin])
}

async function repack(relative,temporaryDirectory){
  const sourcePath=path.resolve(root,relative),source=await readFile(sourcePath)
  const {json,bin}=parseGlb(source,relative),roles=imageRoles(json),replacements=new Map(),details=[]
  for(let imageIndex=0;imageIndex<(json.images?.length??0);imageIndex++){
    const image=json.images[imageIndex]
    if(image.mimeType!=='image/png'||image.bufferView==null)continue
    const view=json.bufferViews[image.bufferView],bytes=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)
    const imageRoleList=[...(roles.get(imageIndex)??[])],lossless=imageRoleList.some(role=>role!=='baseColor'&&role!=='emissive')
    const webp=await encodeWebp(bytes,{lossless,temporaryDirectory,stem:`${path.basename(relative,'.glb')}-${imageIndex}`})
    replacements.set(image.bufferView,webp)
    image.mimeType='image/webp'
    for(const texture of json.textures??[]){
      if(texture.source!==imageIndex)continue
      delete texture.source
      texture.extensions={...(texture.extensions??{}),EXT_texture_webp:{source:imageIndex}}
    }
    details.push({imageIndex,roles:imageRoleList,mode:lossless?'lossless':'q92-alpha100',beforeBytes:bytes.length,afterBytes:webp.length})
  }
  if(!details.length)throw new Error(`${relative}: no PNG images selected`)
  json.extensionsUsed=[...new Set([...(json.extensionsUsed??[]),'EXT_texture_webp'])]
  json.extensionsRequired=[...new Set([...(json.extensionsRequired??[]),'EXT_texture_webp'])]
  const output=buildGlb(json,bin,replacements)
  const outputPath=apply?sourcePath:path.join(candidateRoot,relative)
  await mkdir(path.dirname(outputPath),{recursive:true})
  if(apply){
    const archivePath=path.join(archiveRoot,relative)
    await mkdir(path.dirname(archivePath),{recursive:true})
    try{await stat(archivePath)}catch{await copyFile(sourcePath,archivePath)}
  }
  await writeFile(outputPath,output)
  return {file:relative,output:path.relative(root,outputPath),beforeBytes:source.length,afterBytes:output.length,savedBytes:source.length-output.length,images:details}
}

const temporaryDirectory=await mkdtemp(path.join(tmpdir(),'4lite-repack-webp-'))
const results=[]
try{
  for(const target of targets)results.push(await repack(target,temporaryDirectory))
  if(scope==='sand'||scope==='all'){
    const relative='public/assets/textures/sand/sandpit-cement-rim-albedo-v01.png'
    const sourcePath=path.resolve(root,relative),source=await readFile(sourcePath)
    const output=await encodeWebp(source,{lossless:false,temporaryDirectory,stem:'shared-sand-cement'})
    const outputRelative='public/assets/textures/sand/sandpit-cement-rim-albedo-v01.webp'
    const outputPath=apply?path.resolve(root,outputRelative):path.join(candidateRoot,outputRelative)
    await mkdir(path.dirname(outputPath),{recursive:true})
    await writeFile(outputPath,output)
    results.push({file:relative,output:path.relative(root,outputPath),beforeBytes:source.length,afterBytes:output.length,savedBytes:source.length-output.length,images:[{roles:['baseColor'],mode:'q92-alpha100'}]})
  }
}finally{
  const {rm}=await import('node:fs/promises')
  await rm(temporaryDirectory,{recursive:true,force:true})
}

const totals=results.reduce((sum,item)=>({beforeBytes:sum.beforeBytes+item.beforeBytes,afterBytes:sum.afterBytes+item.afterBytes,savedBytes:sum.savedBytes+item.savedBytes}),{beforeBytes:0,afterBytes:0,savedBytes:0})
const report={generatedAt:new Date().toISOString(),scope,apply,policy:'baseColor q92 sharp_yuv alpha100; normal/metallicRoughness/occlusion lossless WebP; dimensions unchanged',totals,results}
const reportFlag=process.argv.indexOf('--report')
if(reportFlag>=0){
  const reportPath=path.resolve(root,process.argv[reportFlag+1])
  await mkdir(path.dirname(reportPath),{recursive:true})
  await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
}
console.log(JSON.stringify(report,null,2))

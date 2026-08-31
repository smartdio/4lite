import {execFile} from 'node:child_process'
import {copyFile,mkdir,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const run=promisify(execFile)
const root=process.cwd()
const relative='public/assets/models/playground-trees/casuarina-tree-game-v11.glb'
const sourcePath=path.resolve(root,relative)
const apply=process.argv.includes('--apply')
const outputFlag=process.argv.indexOf('--output')
const outputPath=apply?sourcePath:path.resolve(root,outputFlag>=0?process.argv[outputFlag+1]:'artifacts/performance/phase6e/webp-candidate/casuarina-tree-game-v11.glb')
const comparisonFlag=process.argv.indexOf('--comparison-dir')
const comparisonDirectory=comparisonFlag>=0?path.resolve(root,process.argv[comparisonFlag+1]):null
const archivePath=path.resolve(root,'archive/phase-6e-pre-webp',relative)

const align4=value=>(value+3)&~3

async function normalizedRmse(left,right) {
  try {
    await run('magick',['compare','-metric','RMSE',left,right,'null:'])
    return 0
  } catch(error) {
    const match=String(error.stderr??'').match(/\(([-+\d.eE]+)\)/)
    if(!match)throw error
    return Number(match[1])
  }
}

function parseGlb(buffer) {
  if(buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2)throw new Error('Invalid GLB')
  let offset=12,json=null,bin=null
  while(offset<buffer.length) {
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4)
    const chunk=buffer.subarray(offset+8,offset+8+length)
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').trim())
    if(type===0x004e4942)bin=chunk
    offset+=8+length
  }
  if(!json||!bin)throw new Error('GLB is missing JSON or BIN')
  return {json,bin}
}

function buildGlb(json,sourceBin,replacements) {
  const next=structuredClone(json),chunks=[]
  let byteOffset=0
  for(let index=0;index<(next.bufferViews?.length??0);index++) {
    const sourceView=json.bufferViews[index]
    const payload=replacements.get(index)??sourceBin.subarray(sourceView.byteOffset??0,(sourceView.byteOffset??0)+sourceView.byteLength)
    const aligned=align4(byteOffset)
    if(aligned>byteOffset)chunks.push(Buffer.alloc(aligned-byteOffset))
    byteOffset=aligned
    chunks.push(payload)
    next.bufferViews[index].byteOffset=byteOffset
    next.bufferViews[index].byteLength=payload.length
    byteOffset+=payload.length
  }
  const logicalLength=byteOffset,paddedLength=align4(logicalLength)
  if(paddedLength>logicalLength)chunks.push(Buffer.alloc(paddedLength-logicalLength))
  const bin=Buffer.concat(chunks)
  next.buffers[0].byteLength=logicalLength
  let jsonBytes=Buffer.from(JSON.stringify(next)),jsonLength=align4(jsonBytes.length)
  if(jsonLength>jsonBytes.length)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(jsonLength-jsonBytes.length,0x20)])
  const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonBytes.length+8+bin.length,8)
  jsonHeader.writeUInt32LE(jsonBytes.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4)
  binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4)
  return Buffer.concat([header,jsonHeader,jsonBytes,binHeader,bin])
}

const source=await readFile(sourcePath)
const {json,bin}=parseGlb(source)
const replacements=new Map(),details=[]
const temporaryDirectory=await mkdtemp(path.join(tmpdir(),'4lite-casuarina-webp-'))
try {
  for(const [imageIndex,image] of (json.images??[]).entries()) {
    if(image.mimeType!=='image/png'||image.bufferView==null||!image.name?.includes('foliage'))continue
    const view=json.bufferViews[image.bufferView],start=view.byteOffset??0
    const png=Buffer.from(bin.subarray(start,start+view.byteLength))
    const input=path.join(temporaryDirectory,'casuarina-foliage.png')
    const webpPath=path.join(temporaryDirectory,'casuarina-foliage-q95.webp')
    const decodedPath=path.join(temporaryDirectory,'casuarina-foliage-q95-decoded.png')
    await writeFile(input,png)
    await run('cwebp',['-quiet','-q','95','-m','6','-sharp_yuv','-alpha_q','100','-alpha_filter','best','-exact',input,'-o',webpPath])
    await run('dwebp',['-quiet',webpPath,'-o',decodedPath])
    const webp=await readFile(webpPath)
    const originalAlpha=path.join(temporaryDirectory,'original-alpha.png')
    const decodedAlpha=path.join(temporaryDirectory,'decoded-alpha.png')
    await run('magick',[input,'-alpha','extract',originalAlpha])
    await run('magick',[decodedPath,'-alpha','extract',decodedAlpha])
    const comparison={
      normalizedRmse:await normalizedRmse(input,decodedPath),
      alphaNormalizedRmse:await normalizedRmse(originalAlpha,decodedAlpha),
    }
    if(comparisonDirectory) {
      await mkdir(comparisonDirectory,{recursive:true})
      await copyFile(input,path.join(comparisonDirectory,'casuarina-foliage-original.png'))
      await copyFile(webpPath,path.join(comparisonDirectory,'casuarina-foliage-q95.webp'))
      await copyFile(decodedPath,path.join(comparisonDirectory,'casuarina-foliage-q95-decoded.png'))
    }
    replacements.set(image.bufferView,webp)
    image.mimeType='image/webp'
    for(const texture of json.textures??[])if(texture.source===imageIndex) {
      delete texture.source
      texture.extensions={...(texture.extensions??{}),EXT_texture_webp:{source:imageIndex}}
    }
    details.push({
      imageIndex,name:image.name,mode:'q95-alpha100-exact',
      beforeBytes:png.length,afterBytes:webp.length,savedBytes:png.length-webp.length,
      comparison,
    })
  }
} finally {
  await rm(temporaryDirectory,{recursive:true,force:true})
}

if(details.length!==1)throw new Error(`Expected one foliage PNG, found ${details.length}`)
json.extensionsUsed=[...new Set([...(json.extensionsUsed??[]),'EXT_texture_webp'])]
json.extensionsRequired=[...new Set([...(json.extensionsRequired??[]),'EXT_texture_webp'])]
const output=buildGlb(json,bin,replacements)
await mkdir(path.dirname(outputPath),{recursive:true})
if(apply) {
  await mkdir(path.dirname(archivePath),{recursive:true})
  try{await stat(archivePath)}catch{await copyFile(sourcePath,archivePath)}
}
await writeFile(outputPath,output)

const report={
  generatedAt:new Date().toISOString(),apply,file:relative,output:path.relative(root,outputPath),
  policy:'foliage baseColor q95 sharp_yuv; alpha quality 100 exact; bark remains PNG; dimensions unchanged',
  beforeBytes:source.length,afterBytes:output.length,savedBytes:source.length-output.length,
  savedRatio:1-output.length/source.length,images:details,
}
const reportFlag=process.argv.indexOf('--report')
if(reportFlag>=0) {
  const reportPath=path.resolve(root,process.argv[reportFlag+1])
  await mkdir(path.dirname(reportPath),{recursive:true})
  await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
}
console.log(JSON.stringify(report,null,2))

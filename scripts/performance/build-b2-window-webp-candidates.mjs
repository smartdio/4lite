import {execFile} from 'node:child_process'
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const run=promisify(execFile)
const root=process.cwd()
const sourceRelative='public/assets/models/building-2/b2-classroom-window-alloy-v01.glb'
const outputRoot=path.resolve(root,'artifacts/performance/phase6n/b2-window-webp-candidates')

const align4=value=>(value+3)&~3
function parseGlb(buffer){
  if(buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2)throw new Error('Invalid GLB')
  let offset=12,json,bin
  while(offset<buffer.length){
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4)
    const chunk=buffer.subarray(offset+8,offset+8+length)
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').trim())
    if(type===0x004e4942)bin=chunk
    offset+=8+length
  }
  if(!json||!bin)throw new Error('Missing GLB chunks')
  return {json,bin}
}

function buildGlb(json,sourceBin,replacements){
  const next=structuredClone(json),chunks=[]
  let byteOffset=0
  for(let index=0;index<(next.bufferViews?.length??0);index++){
    const view=json.bufferViews[index]
    const payload=replacements.get(index)??sourceBin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)
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
  const jsonLength=align4(jsonBytes.length)
  if(jsonLength>jsonBytes.length)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(jsonLength-jsonBytes.length,0x20)])
  const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonBytes.length+8+bin.length,8)
  jsonHeader.writeUInt32LE(jsonBytes.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4)
  binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4)
  return Buffer.concat([header,jsonHeader,jsonBytes,binHeader,bin])
}

const source=await readFile(path.resolve(root,sourceRelative))
const parsed=parseGlb(source),temporaryDirectory=await mkdtemp(path.join(tmpdir(),'4lite-b2-window-webp-'))
const results=[]
try{
  for(const quality of [95,98]){
    const json=structuredClone(parsed.json),replacements=new Map(),images=[]
    for(let index=0;index<json.images.length;index++){
      const image=json.images[index],view=parsed.json.bufferViews[image.bufferView]
      const png=parsed.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)
      const input=path.join(temporaryDirectory,`${quality}-${index}.png`),output=path.join(temporaryDirectory,`${quality}-${index}.webp`)
      await writeFile(input,png)
      const roughness=image.name?.includes('roughness')
      const args=roughness
        ?['-quiet','-lossless','-m','6',input,'-o',output]
        :['-quiet','-q',String(quality),'-m','6','-sharp_yuv',input,'-o',output]
      await run('cwebp',args)
      const webp=await readFile(output)
      replacements.set(image.bufferView,webp)
      image.mimeType='image/webp'
      for(const texture of json.textures??[]){
        if(texture.source!==index)continue
        delete texture.source
        texture.extensions={...(texture.extensions??{}),EXT_texture_webp:{source:index}}
      }
      images.push({index,name:image.name,mode:roughness?'lossless':`q${quality}`,beforeBytes:png.length,afterBytes:webp.length})
    }
    json.extensionsUsed=[...new Set([...(json.extensionsUsed??[]),'EXT_texture_webp'])]
    json.extensionsRequired=[...new Set([...(json.extensionsRequired??[]),'EXT_texture_webp'])]
    const candidate=buildGlb(json,parsed.bin,replacements)
    const output=path.join(outputRoot,`b2-classroom-window-alloy-webp-q${quality}.glb`)
    await mkdir(path.dirname(output),{recursive:true})
    await writeFile(output,candidate)
    results.push({quality,output:path.relative(root,output),beforeBytes:source.length,afterBytes:candidate.length,savedBytes:source.length-candidate.length,images})
  }
}finally{await rm(temporaryDirectory,{recursive:true,force:true})}

await mkdir(outputRoot,{recursive:true})
await writeFile(path.join(outputRoot,'candidate-report.json'),`${JSON.stringify({generatedAt:new Date().toISOString(),source:sourceRelative,policy:'base color q95/q98 sharp_yuv; roughness lossless WebP; dimensions unchanged',results},null,2)}\n`)
console.log(JSON.stringify(results,null,2))

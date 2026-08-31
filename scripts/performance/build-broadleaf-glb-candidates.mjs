import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd()
const outputRoot=path.resolve(root,'artifacts/performance/phase6g/glb-candidates')
const assets=[
  {
    species:'bauhinia',
    source:'public/assets/models/playground-trees/bauhinia-tree-game-v11.glb',
    images:{
      'bauhinia-foliage-atlas-rgba-v03':'bauhinia-foliage',
      'bauhinia-flower-atlas-rgba-v01':'bauhinia-flower',
    },
  },
  {
    species:'camphor',
    source:'public/assets/models/playground-trees/camphor-tree-game-v11.glb',
    images:{'camphor-foliage-atlas-rgba-v03':'camphor-foliage'},
  },
]
const modes={
  'webp-q95':{extension:'webp',mimeType:'image/webp',gltfExtension:'EXT_texture_webp',suffix:'q95'},
  'ktx2-uastc':{extension:'ktx2',mimeType:'image/ktx2',gltfExtension:'KHR_texture_basisu',suffix:'uastc-l3-rdo1'},
}
const align4=value=>(value+3)&~3

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
  if(!json||!bin)throw new Error('Missing JSON or BIN')
  return {json,bin}
}

function buildGlb(json,sourceBin,replacements) {
  const next=structuredClone(json),chunks=[]
  let byteOffset=0
  for(let index=0;index<(next.bufferViews?.length??0);index++) {
    const view=json.bufferViews[index]
    const payload=replacements.get(index)??sourceBin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)
    const aligned=align4(byteOffset)
    if(aligned>byteOffset)chunks.push(Buffer.alloc(aligned-byteOffset))
    byteOffset=aligned;chunks.push(payload)
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

const report=[]
for(const asset of assets) {
  const source=await readFile(path.resolve(root,asset.source))
  const parsed=parseGlb(source)
  for(const [mode,config] of Object.entries(modes)) {
    const json=structuredClone(parsed.json),replacements=new Map(),replaced=[]
    for(const [imageIndex,image] of (json.images??[]).entries()) {
      const id=asset.images[image.name]
      if(!id)continue
      const candidate=path.resolve(root,`artifacts/performance/phase6g/texture-candidates/${id}/${id}-${config.suffix}.${config.extension}`)
      const bytes=await readFile(candidate)
      replacements.set(image.bufferView,bytes)
      image.mimeType=config.mimeType
      for(const texture of json.textures??[])if(texture.source===imageIndex) {
        delete texture.source
        texture.extensions={...(texture.extensions??{}),[config.gltfExtension]:{source:imageIndex}}
      }
      replaced.push({imageIndex,name:image.name,bytes:bytes.length})
    }
    json.extensionsUsed=[...new Set([...(json.extensionsUsed??[]),config.gltfExtension])]
    json.extensionsRequired=[...new Set([...(json.extensionsRequired??[]),config.gltfExtension])]
    const output=buildGlb(json,parsed.bin,replacements)
    const outputPath=path.join(outputRoot,mode,`${asset.species}-tree-game-v11.glb`)
    await mkdir(path.dirname(outputPath),{recursive:true})
    await writeFile(outputPath,output)
    report.push({species:asset.species,mode,sourceBytes:source.length,output:path.relative(root,outputPath),outputBytes:output.length,replaced})
  }
}
await mkdir(outputRoot,{recursive:true})
await writeFile(path.join(outputRoot,'report.json'),`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify(report,null,2))

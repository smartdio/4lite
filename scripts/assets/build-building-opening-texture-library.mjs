import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd()
const libraryRelative='public/assets/models/building-openings/building-opening-shared-textures-v01.glb'
const libraryPath=path.join(root,libraryRelative)
const targets=[
  'public/assets/models/building-1/b1-classroom-door-wood-left-v01.glb',
  'public/assets/models/building-1/b1-classroom-door-wood-right-v01.glb',
  'public/assets/models/building-1/b1-classroom-window-wood-corridor-v01.glb',
  'public/assets/models/building-1/b1-classroom-window-wood-rear-v01.glb',
  'public/assets/models/building-2/b2-classroom-window-alloy-v01.glb',
]
const definitions=[
  {set:'wood-frame',slot:'baseColor',name:'painted-wood-green-frame-basecolor-v2',sha256:'404f07961a24c3befe6a0efd2de92086618886ec985c7c8ff226a1afd74a0d75'},
  {set:'wood-frame',slot:'metallicRoughness',name:'painted-wood-green-frame-roughness-v2',sha256:'adf5175d84420703c2a4e729a9ec4cb6dfee291199278e94c77e7bfb29d859ab'},
  {set:'wood-panel',slot:'baseColor',name:'painted-wood-green-panel-seams-basecolor-v2',sha256:'dadc040cd798e78367021979ef8a6a30b9ee7de5880b7e9d5281766832e4d624'},
  {set:'wood-panel',slot:'metallicRoughness',name:'painted-wood-green-panel-roughness-v2',sha256:'caa5609ff765350bbc9c0c0f662bf593e8d2be799c5d8462ee2bda81de8de212'},
  {set:'old-glass',slot:'baseColor',name:'old-glass-bluegrey-basecolor-v1',sha256:'2534bca738a21b757b2d1e829bb691df763ff5aff99c33d6ef94f28c063d2b6b'},
  {set:'old-glass',slot:'metallicRoughness',name:'old-glass-bluegrey-roughness-v1',sha256:'7db1527527ad7143679d2805670ed96165208eec59ebe1929818e178c7dd9548'},
]
const definitionByHash=new Map(definitions.map(item=>[item.sha256,item]))
const align4=value=>(value+3)&~3
const hash=buffer=>createHash('sha256').update(buffer).digest('hex')

function parseGlb(buffer) {
  if(buffer.readUInt32LE(0)!==0x46546c67)throw new Error('Not a binary glTF file')
  let offset=12,json=null,bin=null
  while(offset<buffer.length) {
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4),data=buffer.subarray(offset+8,offset+8+length)
    if(type===0x4e4f534a)json=JSON.parse(data.toString('utf8').trim())
    if(type===0x004e4942)bin=Buffer.from(data)
    offset+=8+length
  }
  if(!json||!bin)throw new Error('GLB must contain JSON and BIN chunks')
  return {json,bin}
}

function encodeGlb(json,bin) {
  const jsonSource=Buffer.from(JSON.stringify(json)),jsonLength=align4(jsonSource.length),binLength=align4(bin.length)
  const output=Buffer.alloc(12+8+jsonLength+8+binLength)
  output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8)
  output.writeUInt32LE(jsonLength,12);output.writeUInt32LE(0x4e4f534a,16);jsonSource.copy(output,20);output.fill(0x20,20+jsonSource.length,20+jsonLength)
  const binHeader=20+jsonLength
  output.writeUInt32LE(binLength,binHeader);output.writeUInt32LE(0x004e4942,binHeader+4);bin.copy(output,binHeader+8)
  return output
}

function materialTextureBindings(material) {
  const pbr=material.pbrMetallicRoughness??{}
  return [
    {slot:'baseColor',owner:pbr,key:'baseColorTexture',value:pbr.baseColorTexture},
    {slot:'metallicRoughness',owner:pbr,key:'metallicRoughnessTexture',value:pbr.metallicRoughnessTexture},
  ]
}

function rewriteTarget(buffer,file,sharedImages) {
  const {json,bin}=parseGlb(buffer)
  if(json.materials?.some(material=>material.extras?.sharedOpeningTextureSet)&&!json.images?.some(image=>image.bufferView!=null&&definitionByHash.has(hash(bin.subarray(json.bufferViews[image.bufferView].byteOffset??0,(json.bufferViews[image.bufferView].byteOffset??0)+json.bufferViews[image.bufferView].byteLength))))) {
    return {output:buffer,changed:false,removedBytes:0}
  }
  const imageDefinitions=new Map()
  for(const [imageIndex,image] of (json.images??[]).entries()) {
    if(image.bufferView==null)continue
    const view=json.bufferViews[image.bufferView],start=view.byteOffset??0,bytes=Buffer.from(bin.subarray(start,start+view.byteLength))
    const definition=definitionByHash.get(hash(bytes))
    if(definition) {
      imageDefinitions.set(imageIndex,{definition,bytes,bufferView:image.bufferView})
      const existing=sharedImages.get(definition.sha256)
      if(existing&&hash(existing)!==definition.sha256)throw new Error(`${file}: shared image mismatch`)
      sharedImages.set(definition.sha256,bytes)
    }
  }
  if(!imageDefinitions.size)throw new Error(`${file}: no shared opening textures found`)

  const removedTextureIndices=new Set()
  for(const [textureIndex,texture] of (json.textures??[]).entries())if(imageDefinitions.has(texture.source))removedTextureIndices.add(textureIndex)
  for(const material of json.materials??[]) {
    const sets=new Set()
    for(const binding of materialTextureBindings(material)) {
      if(!binding.value||!removedTextureIndices.has(binding.value.index))continue
      const texture=json.textures[binding.value.index],match=imageDefinitions.get(texture.source)
      if(match.definition.slot!==binding.slot)throw new Error(`${file}: unexpected ${binding.slot} texture ${match.definition.name}`)
      sets.add(match.definition.set);delete binding.owner[binding.key]
    }
    if(sets.size>1)throw new Error(`${file}: material ${material.name} mixes shared texture sets`)
    if(sets.size===1)material.extras={...material.extras,sharedOpeningTextureSet:[...sets][0]}
  }
  const removedTextures=[...removedTextureIndices].sort((a,b)=>a-b)
  for(const material of json.materials??[])for(const binding of materialTextureBindings(material))if(binding.value) {
    if(removedTextureIndices.has(binding.value.index))throw new Error(`${file}: unresolved shared texture reference`)
    binding.value.index-=removedTextures.filter(index=>index<binding.value.index).length
  }
  json.textures=(json.textures??[]).filter((_,index)=>!removedTextureIndices.has(index))

  const removedImageIndices=new Set(imageDefinitions.keys()),removedImages=[...removedImageIndices].sort((a,b)=>a-b)
  for(const texture of json.textures)texture.source-=removedImages.filter(index=>index<texture.source).length
  json.images=json.images.filter((_,index)=>!removedImageIndices.has(index))

  const removedViewIndices=new Set([...imageDefinitions.values()].map(item=>item.bufferView))
  const ranges=[...removedViewIndices].map(index=>{const view=json.bufferViews[index],start=view.byteOffset??0;return {start,end:start+align4(view.byteLength)}}).sort((a,b)=>a.start-b.start)
  for(let index=1;index<ranges.length;index++)if(ranges[index].start<ranges[index-1].end)throw new Error(`${file}: shared image ranges overlap`)
  const chunks=[];let cursor=0
  for(const range of ranges){chunks.push(bin.subarray(cursor,range.start));cursor=range.end}chunks.push(bin.subarray(cursor))
  const nextBin=Buffer.concat(chunks)
  const viewMap=new Map();let nextViewIndex=0
  json.bufferViews.forEach((view,index)=>{
    if(removedViewIndices.has(index))return
    const start=view.byteOffset??0
    view.byteOffset=start-ranges.filter(range=>range.end<=start).reduce((sum,range)=>sum+range.end-range.start,0)
    viewMap.set(index,nextViewIndex++)
  })
  json.bufferViews=json.bufferViews.filter((_,index)=>!removedViewIndices.has(index))
  const remapBufferViews=value=>{
    if(Array.isArray(value)){for(const item of value)remapBufferViews(item);return}
    if(!value||typeof value!=='object')return
    for(const [key,item] of Object.entries(value)) {
      if(key==='bufferView'&&Number.isInteger(item)) {
        if(!viewMap.has(item))throw new Error(`${file}: unresolved bufferView ${item}`)
        value[key]=viewMap.get(item)
      } else remapBufferViews(item)
    }
  }
  remapBufferViews(json)
  json.buffers[0].byteLength=nextBin.length
  return {output:encodeGlb(json,nextBin),changed:true,removedBytes:bin.length-nextBin.length}
}

function buildLibrary(sharedImages) {
  for(const definition of definitions)if(!sharedImages.has(definition.sha256))throw new Error(`Missing ${definition.name}`)
  const position=Buffer.alloc(36)
  ;[[0,0,0],[.001,0,0],[0,.001,0]].flat().forEach((value,index)=>position.writeFloatLE(value,index*4))
  const indices=Buffer.alloc(8);indices.writeUInt16LE(0,0);indices.writeUInt16LE(1,2);indices.writeUInt16LE(2,4)
  const chunks=[position,indices],bufferViews=[
    {buffer:0,byteOffset:0,byteLength:36,target:34962},
    {buffer:0,byteOffset:36,byteLength:6,target:34963},
  ]
  let offset=44
  const images=definitions.map(definition=>{
    const bytes=sharedImages.get(definition.sha256),bufferView=bufferViews.length
    bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length})
    chunks.push(bytes,Buffer.alloc(align4(bytes.length)-bytes.length));offset+=align4(bytes.length)
    return {name:definition.name,bufferView,mimeType:'image/png'}
  })
  const materialSets=['wood-frame','wood-panel','old-glass']
  const materials=materialSets.map(set=>{
    const baseIndex=definitions.findIndex(item=>item.set===set&&item.slot==='baseColor')
    const roughIndex=definitions.findIndex(item=>item.set===set&&item.slot==='metallicRoughness')
    return {name:`shared-opening-${set}`,pbrMetallicRoughness:{baseColorTexture:{index:baseIndex},metallicRoughnessTexture:{index:roughIndex},metallicFactor:0,roughnessFactor:1}}
  })
  const json={
    asset:{version:'2.0',generator:'4lite building-opening shared texture library'},scene:0,
    scenes:[{nodes:[0]}],nodes:[{name:'shared-opening-texture-carrier',mesh:0}],
    meshes:[{name:'shared-opening-texture-carrier',primitives:materials.map((_,material)=>({attributes:{POSITION:0},indices:1,material}))}],
    accessors:[
      {bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[.001,.001,0]},
      {bufferView:1,componentType:5123,count:3,type:'SCALAR',min:[0],max:[2]},
    ],
    materials,images,textures:definitions.map((_,source)=>({sampler:0,source})),samplers:[{magFilter:9729,minFilter:9987}],
    buffers:[{byteLength:offset}],bufferViews,
  }
  return encodeGlb(json,Buffer.concat(chunks))
}

const sharedImages=new Map(),report=[]
for(const relative of targets) {
  const absolute=path.join(root,relative),source=await readFile(absolute),result=rewriteTarget(source,relative,sharedImages)
  if(result.changed)await writeFile(absolute,result.output)
  report.push({file:relative,before:source.length,after:result.output.length,saved:source.length-result.output.length,changed:result.changed})
}
if(sharedImages.size) {
  await mkdir(path.dirname(libraryPath),{recursive:true})
  await writeFile(libraryPath,buildLibrary(sharedImages))
}
const library=await readFile(libraryPath)
console.log(JSON.stringify({library:{file:libraryRelative,bytes:library.length,sha256:hash(library)},files:report},null,2))

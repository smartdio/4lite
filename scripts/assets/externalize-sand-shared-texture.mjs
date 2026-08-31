import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd()
const sharedHash='39066089f152de5f3ea2e21b1dded55ff9e72659b4ca1964c8a72716f2d53a7f'
const sharedUri='../../textures/sand/sandpit-cement-rim-albedo-v01.png?v=1'
const sharedPath=path.join(root,'public/assets/textures/sand/sandpit-cement-rim-albedo-v01.png')
const targets=[
  'public/assets/models/sandpit/sandpit-recessed-game-v01.glb',
  'public/assets/models/activity-sand/activity-sand-north-12x5-v02.glb',
  'public/assets/models/activity-sand/activity-sand-south-7x3-v02.glb',
]

const align4=value=>(value+3)&~3
const hash=buffer=>createHash('sha256').update(buffer).digest('hex')

function parseGlb(buffer) {
  if(buffer.readUInt32LE(0)!==0x46546c67)throw new Error('Not a binary glTF file')
  const version=buffer.readUInt32LE(4)
  if(version!==2)throw new Error(`Unsupported glTF version ${version}`)
  let offset=12,json=null,bin=null
  while(offset<buffer.length) {
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4)
    const data=buffer.subarray(offset+8,offset+8+length)
    if(type===0x4e4f534a)json=JSON.parse(data.toString('utf8').trim())
    if(type===0x004e4942)bin=Buffer.from(data)
    offset+=8+length
  }
  if(!json||!bin)throw new Error('GLB must contain JSON and BIN chunks')
  return {json,bin}
}

function encodeGlb(json,bin) {
  const jsonSource=Buffer.from(JSON.stringify(json))
  const jsonLength=align4(jsonSource.length)
  const binLength=align4(bin.length)
  const output=Buffer.alloc(12+8+jsonLength+8+binLength)
  output.writeUInt32LE(0x46546c67,0)
  output.writeUInt32LE(2,4)
  output.writeUInt32LE(output.length,8)
  output.writeUInt32LE(jsonLength,12)
  output.writeUInt32LE(0x4e4f534a,16)
  jsonSource.copy(output,20)
  output.fill(0x20,20+jsonSource.length,20+jsonLength)
  const binHeader=20+jsonLength
  output.writeUInt32LE(binLength,binHeader)
  output.writeUInt32LE(0x004e4942,binHeader+4)
  bin.copy(output,binHeader+8)
  return output
}

function remapBufferViewReferences(value,removedIndex) {
  if(Array.isArray(value)) {
    for(const item of value)remapBufferViewReferences(item,removedIndex)
    return
  }
  if(!value||typeof value!=='object')return
  for(const [key,item] of Object.entries(value)) {
    if(key==='bufferView'&&Number.isInteger(item)) {
      if(item===removedIndex)throw new Error(`Unresolved reference to removed bufferView ${removedIndex}`)
      if(item>removedIndex)value[key]=item-1
    } else remapBufferViewReferences(item,removedIndex)
  }
}

function normalizeSharedTextureCoordinates(json,file) {
  const sharedImageIndex=json.images?.findIndex(image=>image.uri===sharedUri)
  if(sharedImageIndex==null||sharedImageIndex<0)return false
  const sharedTextureIndices=new Set(json.textures?.map((texture,index)=>texture.source===sharedImageIndex?index:null).filter(index=>index!=null))
  let changed=false
  json.materials?.forEach((material,materialIndex)=>{
    const binding=material.pbrMetallicRoughness?.baseColorTexture
    if(!binding||!sharedTextureIndices.has(binding.index)||(binding.texCoord??0)===0)return
    const sourceSemantic=`TEXCOORD_${binding.texCoord}`
    let primitiveCount=0
    for(const mesh of json.meshes??[])for(const primitive of mesh.primitives??[]) {
      if(primitive.material!==materialIndex)continue
      if(primitive.attributes?.[sourceSemantic]==null)throw new Error(`${file}: ${material.name} has no ${sourceSemantic}`)
      primitive.attributes.TEXCOORD_0=primitive.attributes[sourceSemantic]
      primitiveCount++
    }
    if(!primitiveCount)throw new Error(`${file}: ${material.name} is not used by a primitive`)
    delete binding.texCoord
    changed=true
  })
  return changed
}

function remapMaterialTextureReferences(material,removedIndex) {
  const visit=value=>{
    if(!value||typeof value!=='object')return
    for(const [key,item] of Object.entries(value)) {
      if(key.endsWith('Texture')&&item&&Number.isInteger(item.index)) {
        if(item.index===removedIndex)throw new Error(`Unresolved material reference to removed texture ${removedIndex}`)
        if(item.index>removedIndex)item.index--
      } else visit(item)
    }
  }
  visit(material)
}

function bindSharedTextureAtRuntime(json,file) {
  const sharedImageIndex=json.images?.findIndex(image=>image.uri===sharedUri)
  if(sharedImageIndex==null||sharedImageIndex<0) {
    const alreadyBound=json.materials?.some(material=>material.extras?.sharedBaseColorTexture===sharedUri)
    if(alreadyBound)return false
    throw new Error(`${file}: external shared image not found`)
  }
  const sharedTextureIndices=json.textures?.map((texture,index)=>texture.source===sharedImageIndex?index:null).filter(index=>index!=null)??[]
  if(sharedTextureIndices.length!==1)throw new Error(`${file}: expected one shared texture, found ${sharedTextureIndices.length}`)
  const sharedTextureIndex=sharedTextureIndices[0]
  let bindings=0
  for(const material of json.materials??[]) {
    const binding=material.pbrMetallicRoughness?.baseColorTexture
    if(binding?.index!==sharedTextureIndex)continue
    delete material.pbrMetallicRoughness.baseColorTexture
    material.extras={...material.extras,sharedBaseColorTexture:sharedUri}
    bindings++
  }
  if(!bindings)throw new Error(`${file}: shared texture is not bound to a base color material`)
  json.textures.splice(sharedTextureIndex,1)
  for(const material of json.materials??[])remapMaterialTextureReferences(material,sharedTextureIndex)
  json.images.splice(sharedImageIndex,1)
  for(const texture of json.textures??[])if(texture.source>sharedImageIndex)texture.source--
  return true
}

function externalize(buffer,file) {
  const {json,bin}=parseGlb(buffer)
  const alreadyExternal=json.images?.some(image=>image.uri===sharedUri)
  if(alreadyExternal) {
    const normalizedUv=normalizeSharedTextureCoordinates(json,file)
    const runtimeBound=bindSharedTextureAtRuntime(json,file)
    return {output:normalizedUv||runtimeBound?encodeGlb(json,bin):buffer,image:null,alreadyExternal:true,normalizedUv,runtimeBound}
  }
  if(json.materials?.some(material=>material.extras?.sharedBaseColorTexture===sharedUri))return {output:buffer,image:null,alreadyExternal:true,normalizedUv:false,runtimeBound:false}
  const match=json.images?.map((image,index)=>{
    if(image.bufferView==null)return null
    const view=json.bufferViews[image.bufferView]
    const start=view.byteOffset??0
    const bytes=bin.subarray(start,start+view.byteLength)
    return hash(bytes)===sharedHash?{image,index,view,bytes}:null
  }).find(Boolean)
  if(!match)throw new Error(`${file}: shared cement image not found`)

  const removedIndex=match.image.bufferView
  const start=match.view.byteOffset??0
  const removeEnd=start+align4(match.view.byteLength)
  for(const [index,view] of json.bufferViews.entries()) {
    if(index===removedIndex)continue
    const viewStart=view.byteOffset??0,viewEnd=viewStart+view.byteLength
    if(viewStart<removeEnd&&viewEnd>start)throw new Error(`${file}: bufferView ${index} overlaps shared image`)
    if(viewStart>=removeEnd)view.byteOffset=viewStart-(removeEnd-start)
  }

  match.image.uri=sharedUri
  delete match.image.bufferView
  delete match.image.mimeType
  json.bufferViews.splice(removedIndex,1)
  remapBufferViewReferences(json,removedIndex)
  const nextBin=Buffer.concat([bin.subarray(0,start),bin.subarray(removeEnd)])
  json.buffers[0].byteLength=nextBin.length
  const normalizedUv=normalizeSharedTextureCoordinates(json,file)
  const runtimeBound=bindSharedTextureAtRuntime(json,file)
  return {output:encodeGlb(json,nextBin),image:Buffer.from(match.bytes),alreadyExternal:false,normalizedUv,runtimeBound}
}

await mkdir(path.dirname(sharedPath),{recursive:true})
let sharedImage=null
const report=[]
for(const relative of targets) {
  const absolute=path.join(root,relative)
  const source=await readFile(absolute)
  const result=externalize(source,relative)
  if(result.image) {
    if(sharedImage&&hash(sharedImage)!==hash(result.image))throw new Error('Shared source images differ')
    sharedImage=result.image
  }
  if(!result.alreadyExternal||result.normalizedUv||result.runtimeBound)await writeFile(absolute,result.output)
  report.push({file:relative,before:source.length,after:result.output.length,saved:source.length-result.output.length,alreadyExternal:result.alreadyExternal,normalizedUv:result.normalizedUv,runtimeBound:result.runtimeBound})
}
if(sharedImage)await writeFile(sharedPath,sharedImage)
const external=await readFile(sharedPath)
if(hash(external)!==sharedHash)throw new Error('External shared texture hash mismatch')
console.log(JSON.stringify({shared:{file:path.relative(root,sharedPath),bytes:external.length,sha256:hash(external),uri:sharedUri},files:report},null,2))

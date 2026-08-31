import {readFile,readdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'

const root=process.cwd()
const modelRoot=path.join(root,'public/assets/models')

async function filesBelow(directory) {
  const entries=await readdir(directory,{withFileTypes:true})
  const files=[]
  for(const entry of entries) {
    const absolute=path.join(directory,entry.name)
    if(entry.isDirectory())files.push(...await filesBelow(absolute))
    else if(entry.isFile()&&entry.name.endsWith('.glb'))files.push(absolute)
  }
  return files
}

function parseGlb(buffer,file) {
  if(buffer.readUInt32LE(0)!==0x46546c67)throw new Error(`${file}: invalid GLB magic`)
  if(buffer.readUInt32LE(4)!==2)throw new Error(`${file}: unsupported GLB version`)
  let offset=12,json=null,binBytes=0,binChunk=null
  while(offset<buffer.length) {
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4)
    const chunk=buffer.subarray(offset+8,offset+8+length)
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').trim())
    if(type===0x004e4942){binBytes+=length;binChunk=chunk}
    offset+=8+length
  }
  if(!json)throw new Error(`${file}: missing JSON chunk`)

  const imageViews=new Set((json.images??[]).map(image=>image.bufferView).filter(index=>index!=null))
  const rolesByImage=new Map()
  const addRole=(textureInfo,role)=>{
    if(textureInfo?.index==null)return
    const texture=json.textures?.[textureInfo.index]
    const imageIndex=texture?.source??texture?.extensions?.KHR_texture_basisu?.source??texture?.extensions?.EXT_texture_webp?.source
    if(imageIndex==null)return
    if(!rolesByImage.has(imageIndex))rolesByImage.set(imageIndex,new Set())
    rolesByImage.get(imageIndex).add(role)
  }
  for(const material of json.materials??[]) {
    addRole(material.pbrMetallicRoughness?.baseColorTexture,'baseColor')
    addRole(material.pbrMetallicRoughness?.metallicRoughnessTexture,'metallicRoughness')
    addRole(material.normalTexture,'normal')
    addRole(material.occlusionTexture,'occlusion')
    addRole(material.emissiveTexture,'emissive')
  }
  const embeddedImages=(json.images??[]).map((image,index)=>{
    const view=image.bufferView==null?null:json.bufferViews?.[image.bufferView]
    const bytes=view==null||!binChunk?null:binChunk.subarray(view.byteOffset??0,(view.byteOffset??0)+(view.byteLength??0))
    let width=null,height=null,pngColorType=null
    if(image.mimeType==='image/png'&&bytes?.length>=24&&bytes.subarray(1,4).toString()==='PNG') {
      width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);pngColorType=bytes[25]
    }
    return {
      index,name:image.name??null,mimeType:image.mimeType??(image.uri?'external':'unknown'),
      bytes:view?.byteLength??0,width,height,pngColorType,roles:[...(rolesByImage.get(index)??[])],uri:image.uri??null,
      sha256:bytes?createHash('sha256').update(bytes).digest('hex'):null,
    }
  })
  const imageBytes=embeddedImages.reduce((sum,image)=>sum+image.bytes,0)
  const geometryBytes=(json.bufferViews??[]).reduce((sum,view,index)=>sum+(imageViews.has(index)?0:(view.byteLength??0)),0)
  let triangles=0,primitives=0
  for(const mesh of json.meshes??[])for(const primitive of mesh.primitives??[]) {
    primitives++
    if((primitive.mode??4)!==4)continue
    const count=primitive.indices!=null
      ?json.accessors?.[primitive.indices]?.count
      :json.accessors?.[primitive.attributes?.POSITION]?.count
    triangles+=Math.floor((count??0)/3)
  }
  const mimeBytes={}
  for(const image of embeddedImages)mimeBytes[image.mimeType]=(mimeBytes[image.mimeType]??0)+image.bytes
  return {
    file:path.relative(root,file),bytes:buffer.length,binBytes,imageBytes,geometryBytes,
    meshes:json.meshes?.length??0,primitives,sourceTriangles:triangles,
    materials:json.materials?.length??0,images:embeddedImages.length,imageDetails:embeddedImages,mimeBytes,
    animations:json.animations?.length??0,
    compression:{
      meshopt:json.extensionsUsed?.includes('EXT_meshopt_compression')??false,
      draco:json.extensionsUsed?.includes('KHR_draco_mesh_compression')??false,
      quantized:json.extensionsUsed?.includes('KHR_mesh_quantization')??false,
    },
  }
}

const files=(await filesBelow(modelRoot)).sort()
const assets=[]
for(const file of files)assets.push(parseGlb(await readFile(file),file))
assets.sort((a,b)=>b.bytes-a.bytes)
const totals=assets.reduce((sum,asset)=>({
  files:sum.files+1,bytes:sum.bytes+asset.bytes,imageBytes:sum.imageBytes+asset.imageBytes,
  geometryBytes:sum.geometryBytes+asset.geometryBytes,sourceTriangles:sum.sourceTriangles+asset.sourceTriangles,
  primitives:sum.primitives+asset.primitives,
}),{files:0,bytes:0,imageBytes:0,geometryBytes:0,sourceTriangles:0,primitives:0})
const imagesByHash=new Map()
for(const asset of assets)for(const image of asset.imageDetails)if(image.sha256) {
  if(!imagesByHash.has(image.sha256))imagesByHash.set(image.sha256,[])
  imagesByHash.get(image.sha256).push({file:asset.file,index:image.index,bytes:image.bytes,mimeType:image.mimeType,width:image.width,height:image.height})
}
const duplicateImages=[...imagesByHash.entries()].filter(([,uses])=>uses.length>1).map(([sha256,uses])=>({sha256,uses,wastedDuplicateBytes:uses[0].bytes*(uses.length-1)})).sort((a,b)=>b.wastedDuplicateBytes-a.wastedDuplicateBytes)
const report={generatedAt:new Date().toISOString(),scope:`all ${files.length} production GLBs under public/assets/models`,totals,duplicateImages,assets}

const reportFlag=process.argv.indexOf('--report')
if(reportFlag>=0)await writeFile(path.resolve(root,process.argv[reportFlag+1]),`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify(report,null,2))

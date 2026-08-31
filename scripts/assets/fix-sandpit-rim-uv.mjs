import {readFile,writeFile} from 'node:fs/promises'

const file=process.argv[2]??'public/assets/models/sandpit/sandpit-recessed-game-v01.glb'
const wallNormalYLimit=.42
const oldHorizontalSpan=6
const rimDepth=.2
const wallTextureTileSize=rimDepth

const buffer=await readFile(file)
if(buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2)throw new Error(`${file}: expected a glTF 2 GLB`)
const jsonLength=buffer.readUInt32LE(12)
const json=JSON.parse(buffer.subarray(20,20+jsonLength).toString('utf8').trim())
const binHeader=20+jsonLength
if(buffer.readUInt32LE(binHeader+4)!==0x004e4942)throw new Error(`${file}: expected one BIN chunk after JSON`)
const binOffset=binHeader+8
const rimMeshIndex=json.meshes.findIndex(mesh=>mesh.name?.includes('SandpitConcreteRimMesh'))
if(rimMeshIndex<0)throw new Error(`${file}: concrete rim mesh not found`)
const primitive=json.meshes[rimMeshIndex].primitives[0]
const normalAccessor=json.accessors[primitive.attributes.NORMAL]
const uvAccessor=json.accessors[primitive.attributes.TEXCOORD_0]
if(!normalAccessor||!uvAccessor||normalAccessor.count!==uvAccessor.count)throw new Error(`${file}: incompatible rim normal/UV accessors`)

function floatOffset(accessor,component) {
  if(accessor.componentType!==5126)throw new Error(`${file}: expected float accessor`)
  const view=json.bufferViews[accessor.bufferView]
  const components=accessor.type==='VEC2'?2:accessor.type==='VEC3'?3:null
  if(!components)throw new Error(`${file}: unsupported accessor type ${accessor.type}`)
  return {
    base:binOffset+(view.byteOffset??0)+(accessor.byteOffset??0)+component*4,
    stride:view.byteStride??components*4,
  }
}

const normalY=floatOffset(normalAccessor,1)
const uvU=floatOffset(uvAccessor,0)
const uvV=floatOffset(uvAccessor,1)
let adjusted=0
for(let index=0;index<uvAccessor.count;index++) {
  const y=buffer.readFloatLE(normalY.base+index*normalY.stride)
  if(y>wallNormalYLimit)continue
  const uOffset=uvU.base+index*uvU.stride
  const vOffset=uvV.base+index*uvV.stride
  buffer.writeFloatLE(buffer.readFloatLE(uOffset)*(oldHorizontalSpan/wallTextureTileSize),uOffset)
  buffer.writeFloatLE(buffer.readFloatLE(vOffset)*(rimDepth/wallTextureTileSize),vOffset)
  adjusted++
}
if(!adjusted)throw new Error(`${file}: no vertical rim UVs were adjusted`)
await writeFile(file,buffer)
console.log(JSON.stringify({file,rimMeshIndex,adjusted,total:uvAccessor.count,horizontalTiles:oldHorizontalSpan/wallTextureTileSize}))

import {stat} from 'node:fs/promises'
import path from 'node:path'

const required=[
  'public/assets/models/campus-birds/campus-birds-v03.glb',
  'public/assets/audio/birds/sparrow-01.ogg',
  'public/assets/audio/birds/sparrow-02.ogg',
  'public/assets/audio/birds/takeoff.ogg',
]

const missing=[]
for(const relative of required) {
  try {
    const info=await stat(path.resolve(relative))
    if(!info.isFile()||info.size===0)missing.push(relative)
  } catch {
    missing.push(relative)
  }
}

if(missing.length) {
  throw new Error(`Required production assets are missing: ${missing.join(', ')}`)
}

console.log(`Verified ${required.length} required production assets.`)

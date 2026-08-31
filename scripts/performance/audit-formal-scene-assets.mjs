import {mkdir,readFile,stat,writeFile} from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd()
const glbFiles=[
  'public/assets/models/building-openings/building-opening-shared-textures-v01.glb',
  'public/assets/models/building-1/b1-classroom-door-wood-left-v01.glb',
  'public/assets/models/building-1/b1-classroom-door-wood-right-v01.glb',
  'public/assets/models/building-1/b1-classroom-window-wood-corridor-v01.glb',
  'public/assets/models/building-1/b1-classroom-window-wood-rear-v01.glb',
  'public/assets/models/building-2/b2-classroom-window-alloy-v01.glb',
  'public/assets/models/banyan-tree/banyan-tree-scene-optimized.glb',
  'public/assets/models/toilet/toilet-game-optimized-v01.glb',
  'public/assets/models/teacher-dormitory/teacher-dormitory-game-optimized-v01.glb',
  'public/assets/models/playground-trees/casuarina-tree-game-v11.glb',
  'public/assets/models/playground-trees/camphor-tree-game-v11.glb',
  'public/assets/models/playground-trees/bauhinia-tree-game-v11.glb',
  'public/assets/models/old-classroom/old-classroom-game-optimized-v02.glb',
  'public/assets/models/sandpit/sandpit-recessed-game-v01.glb',
  'public/assets/models/activity-sand/activity-sand-north-12x5-v02.glb',
  'public/assets/models/activity-sand/activity-sand-south-7x3-v02.glb',
  'public/assets/models/ping-pong-table/ping-pong-table-game-optimized-v01.glb',
  'public/assets/models/concrete-slide/concrete-slide-game-optimized-v01.glb',
]
const directFoundationFiles=[
  'public/assets/textures/sand/sandpit-cement-rim-albedo-v01.webp',
  'public/assets/textures/ground-decals/handpainted-cracks-atlas-v01.png',
]

const sourceAudit=JSON.parse(await readFile(path.resolve(root,'artifacts/performance/phase6n/runtime-glb-audit-after.json'),'utf8'))
const byFile=new Map(sourceAudit.assets.map(asset=>[asset.file,asset]))
const glbs=await Promise.all(glbFiles.map(async file=>{
  const audit=byFile.get(file)
  if(!audit)throw new Error(`Missing GLB audit entry: ${file}`)
  const bytes=(await stat(path.resolve(root,file))).size
  if(bytes!==audit.bytes)throw new Error(`Stale GLB audit entry: ${file}`)
  return {
    file,bytes,imageBytes:audit.imageBytes,geometryBytes:audit.geometryBytes,
    sourceTriangles:audit.sourceTriangles,primitives:audit.primitives,mimeBytes:audit.mimeBytes,
  }
}))
const directFoundation=await Promise.all(directFoundationFiles.map(async file=>({
  file,bytes:(await stat(path.resolve(root,file))).size,
})))
const sum=(rows,key)=>rows.reduce((total,row)=>total+row[key],0)
const report={
  generatedAt:new Date().toISOString(),
  scope:'18 GLBs and two direct textures verified against the formal browser entry request set',
  totals:{
    glbFiles:glbs.length,
    glbBytes:sum(glbs,'bytes'),
    glbImageBytes:sum(glbs,'imageBytes'),
    glbGeometryBytes:sum(glbs,'geometryBytes'),
    sourceTriangles:sum(glbs,'sourceTriangles'),
    primitives:sum(glbs,'primitives'),
    directTextureFiles:directFoundation.length,
    directTextureBytes:sum(directFoundation,'bytes'),
    clickFoundationBytes:sum(glbs,'bytes')+sum(directFoundation,'bytes'),
  },
  rankedGlbs:glbs.sort((a,b)=>b.bytes-a.bytes),
  directFoundation,
  excludedFromFormalEntry:[
    'public/assets/models/playground-trees/casuarina-tree-game-v10.glb',
    'public/assets/models/playground-trees/camphor-tree-game-v10.glb',
    'public/assets/models/playground-trees/bauhinia-tree-game-v10.glb',
  ],
}
const output=path.resolve(root,'artifacts/performance/phase6n/formal-runtime-asset-audit.json')
await mkdir(path.dirname(output),{recursive:true})
await writeFile(output,`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify(report,null,2))

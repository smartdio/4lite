import {access,copyFile,mkdir,readFile,stat,writeFile} from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd()
const candidateRoot=path.resolve(root,'artifacts/performance/phase6g/glb-candidates/webp-q95')
const liveRoot=path.resolve(root,'public/assets/models/playground-trees')
const archiveRoot=path.resolve(root,'archive/phase-6g-pre-broadleaf-webp/public/assets/models/playground-trees')
const species=['bauhinia','camphor']

await mkdir(archiveRoot,{recursive:true})
const applied=[]
for(const name of species) {
  const filename=`${name}-tree-game-v11.glb`
  const candidate=path.join(candidateRoot,filename)
  const live=path.join(liveRoot,filename)
  const archived=path.join(archiveRoot,filename)
  await access(candidate)
  try {
    await access(archived)
  } catch {
    await copyFile(live,archived)
  }
  await copyFile(candidate,live)
  applied.push({
    species:name,
    source:path.relative(root,candidate),
    live:path.relative(root,live),
    archived:path.relative(root,archived),
    bytes:(await stat(live)).size,
  })
}

const candidateReport=JSON.parse(await readFile(path.resolve(root,'artifacts/performance/phase6g/glb-candidates/report.json'),'utf8'))
const result={
  appliedAt:new Date().toISOString(),
  mode:'webp-q95',
  alpha:'lossless',
  files:applied,
  comparison:candidateReport.filter(item=>species.includes(item.species)),
}
await writeFile(path.resolve(root,'artifacts/performance/phase6g/applied-webp-q95.json'),`${JSON.stringify(result,null,2)}\n`)
console.log(JSON.stringify(result,null,2))

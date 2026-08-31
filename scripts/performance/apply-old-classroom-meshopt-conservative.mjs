import {copyFile,mkdir,readFile,stat,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'

const root=process.cwd()
const runtimeRelative='public/assets/models/old-classroom/old-classroom-game-optimized-v02.glb'
const candidateRelative='artifacts/performance/phase6k/old-classroom-meshopt-candidates/old-classroom-meshopt-conservative.glb'
const archiveRelative='archive/phase-6k-pre-old-classroom-meshopt/public/assets/models/old-classroom/old-classroom-game-optimized-v02.glb'
const reportRelative='artifacts/performance/phase6k/applied-report.json'
const runtime=path.join(root,runtimeRelative),candidate=path.join(root,candidateRelative)
const archive=path.join(root,archiveRelative),reportPath=path.join(root,reportRelative)
const sha256=async file=>createHash('sha256').update(await readFile(file)).digest('hex')

await stat(candidate)
await mkdir(path.dirname(archive),{recursive:true})
try { await stat(archive) } catch { await copyFile(runtime,archive) }
await copyFile(candidate,runtime)

const [before,after]=await Promise.all([stat(archive),stat(runtime)])
const report={
  phase:'6K',appliedAt:new Date().toISOString(),tool:'@gltf-transform/cli@4.4.2 meshopt',
  parameters:{level:'high',position:16,normal:12,texcoord:14,color:10,generic:14,weight:12},
  source:{path:archiveRelative,bytes:before.size,sha256:await sha256(archive)},
  runtime:{path:runtimeRelative,bytes:after.size,sha256:await sha256(runtime)},
  savedBytes:before.size-after.size,
  savedPercent:+(((before.size-after.size)/before.size)*100).toFixed(2),
  restore:`Copy ${archiveRelative} back to ${runtimeRelative} and restore the runtime URL to ?v=2.`,
}
await mkdir(path.dirname(reportPath),{recursive:true})
await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify(report,null,2))

import {copyFile,mkdir,readFile,stat,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'

const root=process.cwd()
const runtimeRelative='public/assets/models/building-2/b2-classroom-window-alloy-v01.glb'
const candidateRelative='artifacts/performance/phase6n/b2-window-webp-candidates/b2-classroom-window-alloy-webp-q95.glb'
const archiveRelative='archive/phase-6n-pre-b2-window-webp/public/assets/models/building-2/b2-classroom-window-alloy-v01.glb'
const reportRelative='artifacts/performance/phase6n/applied-report.json'
const runtime=path.join(root,runtimeRelative),candidate=path.join(root,candidateRelative)
const archive=path.join(root,archiveRelative),reportPath=path.join(root,reportRelative)
const sha256=async file=>createHash('sha256').update(await readFile(file)).digest('hex')

await stat(candidate)
await mkdir(path.dirname(archive),{recursive:true})
try { await stat(archive) } catch { await copyFile(runtime,archive) }
await copyFile(candidate,runtime)

const [before,after]=await Promise.all([stat(archive),stat(runtime)])
const report={
  phase:'6N',appliedAt:new Date().toISOString(),tool:'cwebp',
  parameters:{baseColor:'q95, method 6, sharp_yuv',roughness:'lossless, method 6',dimensions:'unchanged'},
  source:{path:archiveRelative,bytes:before.size,sha256:await sha256(archive)},
  runtime:{path:runtimeRelative,bytes:after.size,sha256:await sha256(runtime)},
  savedBytes:before.size-after.size,
  savedPercent:+(((before.size-after.size)/before.size)*100).toFixed(2),
  restore:`Copy ${archiveRelative} back to ${runtimeRelative} and restore the runtime URL to ?v=uvmat-v5.`,
}
await mkdir(path.dirname(reportPath),{recursive:true})
await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify(report,null,2))

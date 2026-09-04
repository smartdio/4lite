import {createHash} from 'node:crypto'
import {gzipSync} from 'node:zlib'
import {readFile, readdir, stat, writeFile} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root=process.cwd()
const budgets=JSON.parse(await readFile(path.join(root,'scripts/performance/budgets.json'),'utf8'))

async function filesBelow(directory) {
  const entries=await readdir(directory,{withFileTypes:true})
  const files=[]
  for(const entry of entries) {
    const absolute=path.join(directory,entry.name)
    if(entry.isDirectory())files.push(...await filesBelow(absolute))
    else if(entry.isFile())files.push(absolute)
  }
  return files
}

const distFiles=await filesBelow(path.join(root,'dist'))
const runtimeFiles=await filesBelow(path.join(root,'public'))
const sizes=async files=>Promise.all(files.map(async file=>({file,size:(await stat(file)).size})))
const distSizes=await sizes(distFiles)
const runtimeSizes=await sizes(runtimeFiles)
const runtimeRelative=file=>path.relative(root,file).split(path.sep).join('/')
const ephemeraRuntime=runtimeSizes.filter(item=>runtimeRelative(item.file).startsWith('public/assets/textures/school-ephemera-runtime/'))
const ephemeraTextures=ephemeraRuntime.filter(item=>item.file.endsWith('.webp'))
const ephemeraTextureBytes=ephemeraTextures.reduce((sum,item)=>sum+item.size,0)
const legacyEphemera=runtimeSizes.filter(item=>runtimeRelative(item.file).startsWith('public/assets/textures/school-ephemera/'))
if(legacyEphemera.length)throw new Error(`Legacy school ephemera leaked into public: ${legacyEphemera.map(item=>runtimeRelative(item.file)).join(', ')}`)
// Two English functional-board alternatives are published, while each locale
// still references and decodes only the same 30-texture working set.
if(ephemeraTextures.length!==32)throw new Error(`Expected 32 published school ephemera textures, found ${ephemeraTextures.length}`)
if(ephemeraRuntime.length!==32)throw new Error(`Production school ephemera directory must contain only 32 WebP textures, found ${ephemeraRuntime.length} files`)
if(ephemeraTextureBytes>3_500_000)throw new Error(`Production school ephemera ${ephemeraTextureBytes} B exceeds 3,500,000 B`)
const schoolBooksRuntime=runtimeSizes.filter(item=>runtimeRelative(item.file).startsWith('public/assets/textures/school-books-runtime/'))
const schoolBookTextures=schoolBooksRuntime.filter(item=>item.file.endsWith('.webp'))
const schoolBookTextureBytes=schoolBookTextures.reduce((sum,item)=>sum+item.size,0)
if(schoolBookTextures.length!==25)throw new Error(`Expected 25 production school book textures, found ${schoolBookTextures.length}`)
if(schoolBooksRuntime.length!==25)throw new Error(`Production school books directory must contain only 25 WebP textures, found ${schoolBooksRuntime.length} files`)
if(schoolBookTextureBytes>1_200_000)throw new Error(`Production school books ${schoolBookTextureBytes} B exceeds 1,200,000 B`)
const compositionRuntime=runtimeSizes.filter(item=>runtimeRelative(item.file).startsWith('public/assets/textures/composition-pages-runtime/'))
const compositionTextures=compositionRuntime.filter(item=>item.file.endsWith('.webp'))
const compositionTextureBytes=compositionTextures.reduce((sum,item)=>sum+item.size,0)
if(compositionTextures.length!==13)throw new Error(`Expected 13 production composition page textures, found ${compositionTextures.length}`)
if(compositionRuntime.length!==13)throw new Error(`Production composition directory must contain only 13 WebP textures, found ${compositionRuntime.length} files`)
if(compositionTextureBytes>350_000)throw new Error(`Production composition pages ${compositionTextureBytes} B exceeds 350,000 B`)
const documentViewerRuntime=runtimeSizes.filter(item=>runtimeRelative(item.file).startsWith('public/assets/textures/document-viewer-runtime/'))
const documentViewerTextures=documentViewerRuntime.filter(item=>item.file.endsWith('.webp'))
const documentViewerTextureBytes=documentViewerTextures.reduce((sum,item)=>sum+item.size,0)
if(documentViewerTextures.length!==38)throw new Error(`Expected 38 document viewer textures, found ${documentViewerTextures.length}`)
if(documentViewerRuntime.length!==38)throw new Error(`Document viewer directory must contain only 38 WebP textures, found ${documentViewerRuntime.length} files`)
if(documentViewerTextureBytes>2_500_000)throw new Error(`Document viewer textures ${documentViewerTextureBytes} B exceed 2,500,000 B`)
const comicBooksRuntime=runtimeSizes.filter(item=>runtimeRelative(item.file).startsWith('public/assets/textures/comic-books-runtime/'))
const comicAtlas=comicBooksRuntime.filter(item=>item.file.endsWith('comic-covers-atlas.webp'))
const comicViewerPack=comicBooksRuntime.filter(item=>item.file.endsWith('comic-viewer-images.pack'))
const comicRuntimeBytes=comicBooksRuntime.reduce((sum,item)=>sum+item.size,0)
if(comicBooksRuntime.length!==3)throw new Error(`Comic books runtime must contain exactly 3 files, found ${comicBooksRuntime.length}`)
if(comicAtlas.length!==1)throw new Error(`Expected one comic cover atlas, found ${comicAtlas.length}`)
if(comicViewerPack.length!==1)throw new Error(`Expected one comic viewer pack, found ${comicViewerPack.length}`)
if(comicRuntimeBytes>2_500_000)throw new Error(`Comic books runtime ${comicRuntimeBytes} B exceeds 2,500,000 B`)
const indexHtml=await readFile(path.join(root,'dist/index.html'),'utf8')
const entryMatch=indexHtml.match(/<script[^>]+src="([^"]+\.js)"/)
if(!entryMatch)throw new Error('Unable to find the production JavaScript entry in dist/index.html')
const entryPath=path.join(root,'dist',entryMatch[1].replace(/^\//,''))
const entry=await readFile(entryPath)
const report={
  generatedAt:new Date().toISOString(),
  buildHash:createHash('sha256').update(entry).digest('hex'),
  dist:{bytes:distSizes.reduce((sum,item)=>sum+item.size,0),files:distSizes.length},
  runtimeAssets:{bytes:runtimeSizes.reduce((sum,item)=>sum+item.size,0),requests:runtimeSizes.length},
  schoolEphemera:{textures:ephemeraTextures.length,textureBytes:ephemeraTextureBytes,files:ephemeraRuntime.length},
  schoolBooks:{textures:schoolBookTextures.length,textureBytes:schoolBookTextureBytes,files:schoolBooksRuntime.length},
  compositionPages:{textures:compositionTextures.length,textureBytes:compositionTextureBytes,files:compositionRuntime.length},
  documentViewer:{textures:documentViewerTextures.length,textureBytes:documentViewerTextureBytes,files:documentViewerRuntime.length},
  comicBooks:{textures:comicAtlas.length,runtimeBytes:comicRuntimeBytes,files:comicBooksRuntime.length},
  entryJs:{file:path.relative(root,entryPath),bytes:entry.length,gzipBytes:gzipSync(entry).length},
  largestRuntimeAssets:runtimeSizes.sort((a,b)=>b.size-a.size).slice(0,12).map(item=>({file:path.relative(root,item.file),bytes:item.size})),
}

const ceilings=budgets.regressionCeilings
// public文件数不是页面请求数：未引用的候选素材也会被Vite原样复制。
// runtimeAssetRequests由Playwright基于Performance Resource Timing实测并执行同一预算。
const checks=[
  ['dist bytes',report.dist.bytes,ceilings.distBytes],
  ['runtime asset bytes',report.runtimeAssets.bytes,ceilings.runtimeAssetBytes],
  ['entry JS bytes',report.entryJs.bytes,ceilings.entryJsBytes],
  ['entry JS gzip bytes',report.entryJs.gzipBytes,ceilings.entryJsGzipBytes],
]
const failures=checks.filter(([,actual,limit])=>actual>limit)
report.checks=checks.map(([name,actual,limit])=>({name,actual,limit,pass:actual<=limit}))

const reportFlag=process.argv.indexOf('--report')
if(reportFlag>=0) {
  const output=path.resolve(root,process.argv[reportFlag+1])
  await writeFile(output,`${JSON.stringify(report,null,2)}\n`)
}

console.log(JSON.stringify(report,null,2))
if(failures.length) {
  console.error(`Build performance budget failed: ${failures.map(([name,actual,limit])=>`${name} ${actual} > ${limit}`).join('; ')}`)
  process.exitCode=1
}

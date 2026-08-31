import {copyFile,mkdir,mkdtemp,readdir,readFile,rm,stat,writeFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const run=promisify(execFile)
const root=process.cwd()
const outputDirectory=path.resolve(root,'artifacts/performance/phase6g/texture-candidates')
const reportPath=path.resolve(root,'artifacts/performance/phase6g/texture-candidate-report.json')
const sources=[
  ['bauhinia-foliage','assets/source/textures/playground-trees/bauhinia-foliage-atlas-rgba-v03.png'],
  ['camphor-foliage','assets/source/textures/playground-trees/camphor-foliage-atlas-rgba-v03.png'],
  ['bauhinia-flower','assets/source/textures/playground-trees/bauhinia-flower-atlas-rgba-v01.png'],
]

async function normalizedRmse(left,right) {
  try {
    await run('magick',['compare','-metric','RMSE',left,right,'null:'])
    return 0
  } catch(error) {
    const match=String(error.stderr??'').match(/\(([-+\d.eE]+)\)/)
    if(!match)throw error
    return Number(match[1])
  }
}

async function compareRgba(original,decoded,temporaryDirectory,stem) {
  const originalAlpha=path.join(temporaryDirectory,`${stem}-original-alpha.png`)
  const decodedAlpha=path.join(temporaryDirectory,`${stem}-decoded-alpha.png`)
  await run('magick',[original,'-alpha','extract',originalAlpha])
  await run('magick',[decoded,'-alpha','extract',decodedAlpha])
  return {
    normalizedRmse:await normalizedRmse(original,decoded),
    alphaNormalizedRmse:await normalizedRmse(originalAlpha,decodedAlpha),
  }
}

function astcGpuBytes(width,height) {
  let total=0,levels=0
  while(true) {
    total+=Math.ceil(width/4)*Math.ceil(height/4)*16
    levels++
    if(width===1&&height===1)break
    width=Math.max(1,Math.floor(width/2))
    height=Math.max(1,Math.floor(height/2))
  }
  return {bytes:total,mipLevels:levels}
}

await mkdir(outputDirectory,{recursive:true})
const temporaryDirectory=await mkdtemp(path.join(tmpdir(),'4lite-phase6g-'))
const results=[]
try {
  for(const [id,relative] of sources) {
    const source=path.resolve(root,relative)
    const sourceBytes=(await stat(source)).size
    const assetDirectory=path.join(outputDirectory,id)
    await mkdir(assetDirectory,{recursive:true})
    const candidates=[]

    for(const quality of [95,98]) {
      const encoded=path.join(assetDirectory,`${id}-q${quality}.webp`)
      const decoded=path.join(assetDirectory,`${id}-q${quality}-decoded.png`)
      await run('cwebp',['-quiet','-q',String(quality),'-m','6','-sharp_yuv','-alpha_q','100','-alpha_filter','best','-exact',source,'-o',encoded])
      await run('dwebp',['-quiet',encoded,'-o',decoded])
      candidates.push({
        mode:`webp-q${quality}`,
        file:path.relative(root,encoded),
        bytes:(await stat(encoded)).size,
        comparison:await compareRgba(source,decoded,temporaryDirectory,`${id}-q${quality}`),
      })
    }

    const lossless=path.join(assetDirectory,`${id}-lossless.webp`)
    const losslessDecoded=path.join(assetDirectory,`${id}-lossless-decoded.png`)
    await run('cwebp',['-quiet','-lossless','-m','6','-exact',source,'-o',lossless])
    await run('dwebp',['-quiet',lossless,'-o',losslessDecoded])
    candidates.push({
      mode:'webp-lossless',
      file:path.relative(root,lossless),
      bytes:(await stat(lossless)).size,
      comparison:await compareRgba(source,losslessDecoded,temporaryDirectory,`${id}-lossless`),
    })

    const ktx2=path.join(assetDirectory,`${id}-uastc-l3-rdo1.ktx2`)
    await run('basisu',['-file',source,'-output_file',ktx2,'-ktx2','-uastc','-uastc_level','3','-uastc_rdo_l','1.0','-mipmap','-validate_output'])
    await run('basisu',['-validate','-file',ktx2])
    const unpackDirectory=path.join(temporaryDirectory,`${id}-unpacked`)
    await mkdir(unpackDirectory,{recursive:true})
    await run('basisu',['-unpack','-file',ktx2,'-output_path',unpackDirectory,'-no_ktx'])
    const unpacked=await readdir(unpackDirectory)
    const astcName=unpacked.find(name=>name.includes('_unpacked_rgba_ASTC_LDR_4X4_RGBA_level_0_')&&name.endsWith('.png'))
    if(!astcName)throw new Error(`ASTC level-0 decode not found for ${id}`)
    const astcDecoded=path.join(assetDirectory,`${id}-uastc-l3-rdo1-astc-decoded.png`)
    await copyFile(path.join(unpackDirectory,astcName),astcDecoded)
    candidates.push({
      mode:'ktx2-uastc-l3-rdo1',
      file:path.relative(root,ktx2),
      bytes:(await stat(ktx2)).size,
      gpu:astcGpuBytes(1536,1024),
      comparison:await compareRgba(source,astcDecoded,temporaryDirectory,`${id}-uastc`),
    })

    results.push({id,source:relative,sourceBytes,candidates})
  }
} finally {
  await rm(temporaryDirectory,{recursive:true,force:true})
}

const report={
  generatedAt:new Date().toISOString(),
  policy:'WebP q95/q98 alpha100 exact and lossless; KTX2 UASTC level3 RDO1.0 with mipmaps; ASTC 4x4 decode used for KTX2 comparison',
  results,
}
await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify(report,null,2))

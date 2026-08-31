import {execFileSync} from 'node:child_process'
import {readFileSync,statSync} from 'node:fs'

const MIB=1024*1024
const MAX_FILE_BYTES=100*MIB
const MAX_REPOSITORY_BYTES=25*MIB

const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:20*MIB}).split('\0').filter(Boolean)
const trackedSet=new Set(tracked)
const errors=[]

const requiredFiles=[
  '.gitattributes','.gitignore','.github/workflows/public-build.yml',
  'README.md','README.zh-CN.md','LICENSE','ASSET_LICENSES.md','package.json','package-lock.json',
  'scripts/public/verify-public-repo.mjs',
  'docs/screenshots/readme/old-textbook-viewer.png',
  'docs/screenshots/readme/comic-book-viewer.png',
  'docs/screenshots/readme/octopus-handheld-game.png',
  'docs/screenshots/readme/slingshot-aiming.png',
]

const approvedAuthorAssets=new Set([
  'assets/branding/4lite-logo-approved.svg',
  'assets/ui/entrance-campus-watercolor-v01.webp',
  'assets/ui/entrance-campus-watercolor-mobile-v01.webp',
  'assets/ui/social/mo-mai-ai-wechat-channels-qr.jpg',
])
const approvedHelpAssets=new Set([
  'docs/references/001-campus-plan-sketch.jpg',
  'tests/performance/baselines/gate.png',
  'tests/performance/baselines/courtyard.png',
  'tests/performance/baselines/activityBasketball.png',
  'tests/performance/baselines/pingPongMatch.png',
])
const approvedReadmeScreenshots=new Set([
  'docs/screenshots/readme/old-textbook-viewer.png',
  'docs/screenshots/readme/comic-book-viewer.png',
  'docs/screenshots/readme/octopus-handheld-game.png',
  'docs/screenshots/readme/slingshot-aiming.png',
])
const approvedPublicAssets=new Set([
  'public/assets/fonts/pixel/4lite-fusion-pixel-12px-ui-v02.woff2',
  'public/assets/fonts/pixel/OFL-Fusion-Pixel.txt',
  'public/assets/fonts/pixel/README.md',
  'public/assets/models/basketball/basketball-game-optimized-v01.glb',
  'public/assets/models/basketball/README.md',
  'public/assets/audio/SOURCES.md',
])
const approvedAudioFiles=new Set([
  ...['click_001','click_002','confirmation_001','confirmation_002','switch_001','switch_002'].map(name=>`public/assets/audio/ui/${name}.ogg`),
  'public/assets/audio/footsteps/footstep_concrete_000.ogg','public/assets/audio/footsteps/footstep_grass_003.ogg',
  ...['doorClose_1','doorClose_2','doorClose_3','doorOpen_1','doorOpen_2'].map(name=>`public/assets/audio/doors/${name}.ogg`),
  ...['creak1','creak2'].map(name=>`public/assets/audio/furniture/${name}.ogg`),
  ...['cloth1','cloth2','cloth3'].map(name=>`public/assets/audio/blackboard/${name}.ogg`),
  ...['drop_001','drop_002','drop_003','tick_001','tick_002'].map(name=>`public/assets/audio/chalk/${name}.ogg`),
  ...['backboard','bounce','pickup','rim_01','rim_02','throw'].map(name=>`public/assets/audio/basketball/${name}.ogg`),
  ...['net','paddle','table'].map(name=>`public/assets/audio/ping-pong/${name}.ogg`),
  ...['air','land','takeoff'].map(name=>`public/assets/audio/long-jump/${name}.ogg`),
])

const isApprovedPublicAsset=path=>{
  return approvedPublicAssets.has(path)||approvedAudioFiles.has(path)
}

const forbiddenExact=new Set([
  'AGENTS.md','handoff.md','LOCAL_DEPLOYMENT.md','vercel.json','.vercelignore',`deploy-${['dev','001'].join('')}.sh`,
])
const forbiddenPrefixes=[
  '.vercel/','GLB/','archive/','artifacts/','dist/','node_modules/','test-results/','playwright-report/',
  'docs/previews/','docs/concepts/','docs/reports/',
]

for(const path of requiredFiles)if(!trackedSet.has(path))errors.push(`missing required public file: ${path}`)

let totalBytes=0
for(const path of tracked){
  if(forbiddenExact.has(path)||forbiddenPrefixes.some(prefix=>path.startsWith(prefix)))errors.push(`forbidden tracked path: ${path}`)
  if(/^\.env(?:\.|$)/.test(path))errors.push(`environment file is tracked: ${path}`)
  if(/^deploy(?:-|\.)/i.test(path))errors.push(`deployment script is tracked: ${path}`)
  if(path.startsWith('assets/')&&!approvedAuthorAssets.has(path))errors.push(`unapproved author asset: ${path}`)
  if(path.startsWith('docs/screenshots/')&&!approvedReadmeScreenshots.has(path))errors.push(`unapproved README screenshot: ${path}`)
  if(path.startsWith('docs/references/')&&!approvedHelpAssets.has(path))errors.push(`private reference is tracked: ${path}`)
  if(path.startsWith('tests/performance/baselines/')&&!approvedHelpAssets.has(path))errors.push(`unapproved visual baseline: ${path}`)
  if(path.startsWith('public/assets/')&&!isApprovedPublicAsset(path))errors.push(`public asset is absent from the authorization allowlist: ${path}`)

  const bytes=statSync(path).size
  totalBytes+=bytes
  if(bytes>MAX_FILE_BYTES)errors.push(`file exceeds 100 MiB: ${path} (${(bytes/MIB).toFixed(2)} MiB)`)
}
if(totalBytes>MAX_REPOSITORY_BYTES)errors.push(`tracked snapshot exceeds 25 MiB (${(totalBytes/MIB).toFixed(2)} MiB)`)

const textExtensions=new Set(['','.cjs','.css','.html','.js','.json','.jsx','.md','.mjs','.sh','.svg','.toml','.ts','.tsx','.txt','.yaml','.yml'])
const homePrefix=['','Users',''].join('/')
const linuxHomePrefix=['','home',''].join('/')
const secretPatterns=[
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key',/AKIA[0-9A-Z]{16}/],
  ['GitHub token',/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/],
  ['OpenAI-style key',/\bsk-(?:proj-)?[A-Za-z0-9_]{32,}/],
  ['credential assignment',/(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*["'][^"'\n]{8,}["']/i],
]
const allowedEmails=new Set(['7675498+smartdio@users.noreply.github.com'])

for(const path of tracked){
  const dot=path.lastIndexOf('.'),extension=dot<0?'':path.slice(dot).toLowerCase()
  if(!textExtensions.has(extension)||statSync(path).size>5*MIB)continue
  const content=readFileSync(path,'utf8')
  if(content.includes(homePrefix)||content.includes(linuxHomePrefix))errors.push(`absolute home path found in: ${path}`)
  const deploymentIdentifier=new RegExp(`(?:${['dev','001'].join('')}|VERCEL_(?:ORG|PROJECT)_ID)`,'i')
  if(deploymentIdentifier.test(content))errors.push(`local deployment identifier found in: ${path}`)
  for(const [label,pattern] of secretPatterns)if(pattern.test(content))errors.push(`${label} found in: ${path}`)
  for(const match of content.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)){
    if(!allowedEmails.has(match[0].toLowerCase()))errors.push(`non-public email found in ${path}: ${match[0]}`)
  }
  for(const match of content.matchAll(/https?:\/\/((?:\d{1,3}\.){3}\d{1,3})(?=[:/]|$)/g)){
    if(!['127.0.0.1','0.0.0.0'].includes(match[1]))errors.push(`server IP found in ${path}: ${match[1]}`)
  }
}

if(errors.length){
  console.error('Public repository boundary check failed:')
  for(const error of [...new Set(errors)])console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Public repository boundary check passed: ${tracked.length} files, ${(totalBytes/MIB).toFixed(2)} MiB tracked.`)

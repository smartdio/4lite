import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const archiveRoot = path.join(workspaceRoot, 'archive/phase-1');
const manifestPath = path.join(archiveRoot, 'manifest.json');
const whitelistPath = path.join(archiveRoot, 'runtime-whitelist.json');
const mode = process.argv[2] ?? '--plan';

const runtimeWhitelist = [
  'assets/models/banyan-tree/banyan-tree-scene-preview-v26-branch-tip-leaf-clusters.glb',
  'assets/models/building-1/b1-classroom-door-wood-left-v01.glb',
  'assets/models/building-1/b1-classroom-door-wood-right-v01.glb',
  'assets/models/building-1/b1-classroom-window-wood-corridor-v01.glb',
  'assets/models/building-1/b1-classroom-window-wood-rear-v01.glb',
  'assets/models/building-2/b2-classroom-window-alloy-v01.glb',
  'assets/models/toilet/toilet-game-optimized-v01.glb',
  'assets/models/teacher-dormitory/teacher-dormitory-game-optimized-v01.glb',
  'assets/models/old-classroom/old-classroom-game-optimized-v02.glb',
  'assets/models/sandpit/sandpit-recessed-game-v01.glb',
  'assets/models/activity-sand/activity-sand-north-12x5-v02.glb',
  'assets/models/activity-sand/activity-sand-south-7x3-v02.glb',
  'assets/models/ping-pong-table/ping-pong-table-game-optimized-v01.glb',
  'assets/models/concrete-slide/concrete-slide-game-optimized-v01.glb',
  'assets/models/playground-trees/casuarina-tree-game-v10.glb',
  'assets/models/playground-trees/camphor-tree-game-v10.glb',
  'assets/models/playground-trees/bauhinia-tree-game-v10.glb',
  'assets/textures/playground-trees/bauhinia-foliage-atlas-rgba-v02.png',
  'assets/textures/classroom-blackboard/blackboard-erased-chalk-a-v02.jpg',
  'assets/textures/classroom-furniture/desk-simple-wood-neutral-v03.png',
  'assets/textures/classroom-furniture/desk-simple-wood-ochre-v03.png',
  'assets/textures/classroom-furniture/desk-simple-wood-graybrown-v03.png',
  'assets/textures/b1-railing-ornament-repeat-v2.png',
  'assets/textures/signage/b1-school-name-calligraphy-v01.png',
  'assets/textures/ground-decals/handpainted-cracks-atlas-v01.png',
  'assets/textures/limewash/limewash-old-white-basecolor-v2.webp',
  'assets/textures/concrete/concrete-aged-light-basecolor-v1.webp',
  'assets/textures/wood/wood-painted-aged-basecolor-v1.webp',
  'assets/textures/painted-steel/painted-steel-dark-green-basecolor-v1.webp',
  'assets/textures/roof-tile/roof-tile-warm-black-basecolor-v1.webp',
  'assets/textures/gate-pier/gate-pier-bluegray-stone-four-face-v01.webp',
  'assets/textures/perimeter-wall/perimeter-wall-graywhite-damaged-watercolor-v01-ab-atlas.webp',
  ...['wall-ivory', 'wall-ochre', 'wall-interior', 'ceiling'].flatMap((prefix) =>
    ['a', 'b', 'c', 'd'].map(
      (variant) => `assets/textures/school-walls/${prefix}-watercolor-v01-${variant}.webp`,
    ),
  ),
].sort();

const textExtensions = new Set([
  '.css', '.html', '.js', '.jsx', '.json', '.md', '.mjs', '.py', '.sh', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const scanExclusions = new Set(['.git', 'archive', 'dist', 'node_modules', 'public']);

function relative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/');
}

async function walkFiles(directory, ignoredDirectoryNames = new Set()) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walkFiles(fullPath, ignoredDirectoryNames)));
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function screenshotTarget(fileName) {
  if (fileName.startsWith('b1-')) return `archive/phase-1/review-screenshots/building-1/${fileName}`;
  if (fileName.startsWith('b2-') || fileName.startsWith('campus-review-b2')) {
    return `archive/phase-1/review-screenshots/building-2/${fileName}`;
  }
  if (/^campus-(terrain|highland|diagnosis)/.test(fileName)) {
    return `archive/phase-1/review-screenshots/terrain/${fileName}`;
  }
  if (/^campus-review-(dorm|old|toilet)/.test(fileName)) {
    return `archive/phase-1/review-screenshots/facilities/${fileName}`;
  }
  return `archive/phase-1/review-screenshots/overall/${fileName}`;
}

async function collectTextFiles() {
  return (await walkFiles(workspaceRoot, scanExclusions)).filter((filePath) => textExtensions.has(path.extname(filePath)));
}

function findReferences(originalPath, textFiles) {
  const publicRelative = originalPath.startsWith('public/') ? originalPath.slice('public/'.length) : null;
  const runtimeUrl = publicRelative ? `/${publicRelative}` : null;
  const references = [];
  for (const filePath of textFiles) {
    const content = readFileSync(filePath, 'utf8');
    const matched = content.includes(originalPath) || (runtimeUrl && content.includes(runtimeUrl));
    if (matched) references.push(relative(filePath));
  }
  return references.sort();
}

async function buildEntry(originalPath, archivedPath, category, reason, textFiles) {
  const source = path.join(workspaceRoot, originalPath);
  return {
    category,
    originalPath,
    archivedPath,
    sizeBytes: statSync(source).size,
    sha256: await sha256(source),
    references: findReferences(originalPath, textFiles),
    reason,
    restore: `node scripts/archive-phase1.mjs --restore`,
  };
}

async function buildRuntimeWhitelist() {
  const publicRoot = path.join(workspaceRoot, 'public');
  const files = await Promise.all(runtimeWhitelist.map(async (filePath) => {
    const fullPath = path.join(publicRoot, filePath);
    if (!existsSync(fullPath)) throw new Error(`运行资源缺失：public/${filePath}`);
    return { path: filePath, sizeBytes: statSync(fullPath).size, sha256: await sha256(fullPath) };
  }));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: '生产页面 Resource Timing 与源码资产引用审计',
    totalFiles: files.length,
    totalBytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    files,
  };
}

async function plan() {
  if (existsSync(manifestPath)) {
    const existingManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (existingManifest.status === 'migrated') {
      throw new Error('现有清单已经完成迁移，拒绝用新计划覆盖；请使用 --verify 或先 --restore。');
    }
  }
  mkdirSync(archiveRoot, { recursive: true });
  const publicRoot = path.join(workspaceRoot, 'public');
  const publicFiles = (await walkFiles(publicRoot)).map(relative).sort();
  const publicRelativeFiles = publicFiles.map((filePath) => filePath.slice('public/'.length));
  const whitelistSet = new Set(runtimeWhitelist);
  const missingRuntimeFiles = runtimeWhitelist.filter((filePath) => !publicRelativeFiles.includes(filePath));
  if (missingRuntimeFiles.length) {
    throw new Error(`运行白名单存在缺失文件:\n${missingRuntimeFiles.join('\n')}`);
  }

  const textFiles = await collectTextFiles();
  const entries = [];
  for (const filePath of publicFiles) {
    const publicRelative = filePath.slice('public/'.length);
    if (whitelistSet.has(publicRelative)) continue;
    entries.push(await buildEntry(
      filePath,
      `archive/phase-1/runtime-history/public/${publicRelative}`,
      'runtime-history',
      '不在当前生产运行资源白名单内；保留供历史追溯和资产重制。',
      textFiles,
    ));
  }

  const rootScreenshots = (await readdir(workspaceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name)
    .sort();
  for (const fileName of rootScreenshots) {
    entries.push(await buildEntry(
      fileName,
      screenshotTarget(fileName),
      'review-screenshot',
      '根目录阶段验收图；不参与生产构建。',
      textFiles,
    ));
  }

  if (existsSync(path.join(workspaceRoot, 'school-assessment.json'))) {
    entries.push(await buildEntry(
      'school-assessment.json',
      'archive/phase-1/legacy-reports/school-assessment.json',
      'legacy-report',
      '阶段性评估输出；不参与生产构建。',
      textFiles,
    ));
  }

  const whitelist = await buildRuntimeWhitelist();
  const manifest = {
    version: 1,
    phase: 'phase-1',
    status: 'planned',
    generatedAt: new Date().toISOString(),
    before: {
      publicFiles: publicFiles.length,
      publicBytes: publicFiles.reduce((sum, filePath) => sum + statSync(path.join(workspaceRoot, filePath)).size, 0),
      runtimeFiles: whitelist.totalFiles,
      runtimeBytes: whitelist.totalBytes,
      archiveCandidateFiles: entries.length,
      archiveCandidateBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    },
    entries,
  };
  writeFileSync(whitelistPath, `${JSON.stringify(whitelist, null, 2)}\n`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ whitelist: whitelistPath, manifest: manifestPath, ...manifest.before }, null, 2));
}

async function writeWhitelist() {
  mkdirSync(archiveRoot, { recursive: true });
  const whitelist = await buildRuntimeWhitelist();
  writeFileSync(whitelistPath, `${JSON.stringify(whitelist, null, 2)}\n`);
  console.log(`运行白名单已更新：${whitelist.totalFiles} 个文件，共 ${whitelist.totalBytes} bytes，均含 SHA-256。`);
}

function loadManifest() {
  if (!existsSync(manifestPath)) throw new Error('缺少 archive/phase-1/manifest.json；请先执行 --plan。');
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function rewriteRecordedReferences(manifest, fromField, toField) {
  for (const entry of manifest.entries) {
    for (const reference of entry.references) {
      if (reference === 'scripts/archive-phase1.mjs' || reference.startsWith('archive/')) continue;
      const referencePath = path.join(workspaceRoot, reference);
      if (!existsSync(referencePath)) continue;
      const content = readFileSync(referencePath, 'utf8');
      if (!content.includes(entry[fromField])) continue;
      writeFileSync(referencePath, content.split(entry[fromField]).join(entry[toField]));
    }
  }
}

async function apply() {
  const manifest = loadManifest();
  if (manifest.status !== 'planned') throw new Error(`清单状态必须是 planned，当前为 ${manifest.status}。`);
  const activeCodeReferences = manifest.entries.flatMap((entry) =>
    entry.references
      .filter((reference) => reference === 'index.html' || reference.startsWith('src/'))
      .map((reference) => `${entry.originalPath} -> ${reference}`),
  );
  if (activeCodeReferences.length) {
    throw new Error(`候选文件仍被运行代码引用，停止迁移：\n${activeCodeReferences.join('\n')}`);
  }

  for (const entry of manifest.entries) {
    const source = path.join(workspaceRoot, entry.originalPath);
    const destination = path.join(workspaceRoot, entry.archivedPath);
    if (!existsSync(source)) throw new Error(`源文件不存在：${entry.originalPath}`);
    if (existsSync(destination)) throw new Error(`归档目标已存在：${entry.archivedPath}`);
    if ((await sha256(source)) !== entry.sha256) throw new Error(`源文件哈希已变化：${entry.originalPath}`);
  }
  rewriteRecordedReferences(manifest, 'originalPath', 'archivedPath');
  for (const entry of manifest.entries) {
    const source = path.join(workspaceRoot, entry.originalPath);
    const destination = path.join(workspaceRoot, entry.archivedPath);
    mkdirSync(path.dirname(destination), { recursive: true });
    renameSync(source, destination);
    if ((await sha256(destination)) !== entry.sha256) throw new Error(`迁移后哈希不匹配：${entry.archivedPath}`);
  }
  manifest.status = 'migrated';
  manifest.migratedAt = new Date().toISOString();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`已迁移 ${manifest.entries.length} 个文件，共 ${manifest.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)} bytes。`);
}

async function verify() {
  const manifest = loadManifest();
  const failures = [];
  const whitelistInventory = existsSync(whitelistPath)
    ? JSON.parse(readFileSync(whitelistPath, 'utf8'))
    : null;
  if (!whitelistInventory) failures.push('运行白名单清单缺失：archive/phase-1/runtime-whitelist.json');
  for (const entry of manifest.entries) {
    const archived = path.join(workspaceRoot, entry.archivedPath);
    if (!existsSync(archived)) failures.push(`归档文件缺失：${entry.archivedPath}`);
    else if ((await sha256(archived)) !== entry.sha256) failures.push(`归档文件哈希不匹配：${entry.archivedPath}`);
    if (existsSync(path.join(workspaceRoot, entry.originalPath))) failures.push(`原路径仍存在：${entry.originalPath}`);
  }
  for (const filePath of runtimeWhitelist) {
    const fullPath = path.join(workspaceRoot, 'public', filePath);
    if (!existsSync(fullPath)) {
      failures.push(`运行资源缺失：public/${filePath}`);
      continue;
    }
    const inventoryEntry = whitelistInventory?.files.find((entry) => entry.path === filePath);
    if (!inventoryEntry?.sha256) failures.push(`运行资源缺少清单哈希：public/${filePath}`);
    else if ((await sha256(fullPath)) !== inventoryEntry.sha256) failures.push(`运行资源哈希不匹配：public/${filePath}`);
  }
  const actualPublicFiles = (await walkFiles(path.join(workspaceRoot, 'public')))
    .map((filePath) => relative(filePath).slice('public/'.length))
    .sort();
  const unexpectedPublicFiles = actualPublicFiles.filter((filePath) => !runtimeWhitelist.includes(filePath));
  if (unexpectedPublicFiles.length) failures.push(`public/ 存在非白名单文件：\n${unexpectedPublicFiles.join('\n')}`);
  if (actualPublicFiles.length !== runtimeWhitelist.length) {
    failures.push(`public/ 文件数 ${actualPublicFiles.length} 与白名单 ${runtimeWhitelist.length} 不一致。`);
  }
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`校验通过：${manifest.entries.length} 个归档文件，${runtimeWhitelist.length} 个运行资源。`);
}

async function restore() {
  const manifest = loadManifest();
  if (manifest.status !== 'migrated') throw new Error(`清单状态必须是 migrated，当前为 ${manifest.status}。`);
  for (const entry of manifest.entries) {
    const source = path.join(workspaceRoot, entry.archivedPath);
    const destination = path.join(workspaceRoot, entry.originalPath);
    if (!existsSync(source)) throw new Error(`归档文件不存在：${entry.archivedPath}`);
    if (existsSync(destination)) throw new Error(`恢复目标已存在：${entry.originalPath}`);
    if ((await sha256(source)) !== entry.sha256) throw new Error(`归档文件哈希已变化：${entry.archivedPath}`);
  }
  for (const entry of manifest.entries) {
    const source = path.join(workspaceRoot, entry.archivedPath);
    const destination = path.join(workspaceRoot, entry.originalPath);
    mkdirSync(path.dirname(destination), { recursive: true });
    renameSync(source, destination);
  }
  rewriteRecordedReferences(manifest, 'archivedPath', 'originalPath');
  manifest.status = 'restored';
  manifest.restoredAt = new Date().toISOString();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`已恢复 ${manifest.entries.length} 个文件。`);
}

const commands = new Map([
  ['--plan', plan],
  ['--apply', apply],
  ['--verify', verify],
  ['--restore', restore],
  ['--whitelist', writeWhitelist],
]);

if (!commands.has(mode)) {
  throw new Error('用法：node scripts/archive-phase1.mjs [--plan|--apply|--verify|--restore|--whitelist]');
}

await commands.get(mode)();

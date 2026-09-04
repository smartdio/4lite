import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const root=fileURLToPath(new URL('../..',import.meta.url))
const read=path=>readFile(`${root}/${path}`,'utf8')

test('bilingual development story includes the later interaction chapters',async()=>{
  const [zh,en]=await Promise.all([
    read('docs/project-development-story.md'),
    read('docs/project-development-story.en.md'),
  ])

  assert.match(zh,/^## 二十八、两把旧弹弓怎样变成一处自然游乐角$/m)
  assert.match(zh,/^## 三十二、开发约两周后，项目又走到了哪里$/m)
  assert.match(en,/^## 28\. How Two Old Slingshots Became a Natural Play Corner$/m)
  assert.match(en,/^## 32\. Where the Project Stood After Roughly Two Weeks$/m)
  assert.equal([...zh.matchAll(/^## /gm)].length,34)
  assert.equal([...en.matchAll(/^## /gm)].length,34)
})

test('publication boundary keeps future chapter titles visible without links or prose',async()=>{
  const [preface,draftZh,draftEn,full,index,hub,storyConfig]=await Promise.all([
    read('stories/from-memory-to-campus/chapters/preface/index.html'),
    read('stories/from-memory-to-campus/chapters/28-slingshot/index.html'),
    read('stories/from-memory-to-campus/en/chapters/28-slingshot/index.html'),
    read('stories/from-memory-to-campus/full/index.html'),
    read('stories/from-memory-to-campus/index.html'),
    read('stories/index.html'),
    read('stories/from-memory-to-campus/story.json'),
  ])

  assert.equal(JSON.parse(storyConfig).publishedThrough,'preface')
  assert.match(preface,/class="story-toc"/)
  assert.match(preface,/这个项目的起点，不是一套完整的建筑图纸/)
  assert.match(draftZh,/<html lang="zh-CN">/)
  assert.match(draftZh,/这一章还没有正式发布/)
  assert.doesNotMatch(draftZh,/两件合计从约 60\.7 MB 降到不足 1 MB/)
  assert.match(draftZh,/href="\/stories\/from-memory-to-campus\/en\/chapters\/28-slingshot\/"/)
  assert.match(draftEn,/This chapter has not been published yet/)
  assert.doesNotMatch(draftEn,/Together they fell from about 60\.7 MB to under 1 MB/)
  assert.doesNotMatch(full,/id="28-slingshot"/)
  assert.match(index,/class="chapter-card-list"/)
  assert.match(index,/class="chapter-card-entry is-unpublished" aria-disabled="true"/)
  assert.doesNotMatch(index,/href="\/stories\/from-memory-to-campus\/chapters\/28-slingshot\/"/)
  assert.doesNotMatch(index,/href="\/stories\/from-memory-to-campus\/full\//)
  assert.match(hub,/持续更新/)
})

test('repository distinguishes software, writing, and asset licences',async()=>{
  const [software,content,assets,packageJson]=await Promise.all([
    read('LICENSE'),read('CONTENT_LICENSE.md'),read('ASSET_LICENSES.md'),read('package.json'),
  ])

  assert.match(software,/^MIT License$/m)
  assert.match(content,/Creative Commons Attribution 4\.0 International/)
  assert.match(assets,/不会覆盖下列媒体资产/)
  assert.equal(JSON.parse(packageJson).license,'MIT')
})

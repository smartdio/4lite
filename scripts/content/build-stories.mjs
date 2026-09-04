import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {marked} from 'marked'

const projectRoot=fileURLToPath(new URL('../..',import.meta.url))
const storyDirectory=join(projectRoot,'stories','from-memory-to-campus')
const config=JSON.parse(await readFile(join(storyDirectory,'story.json'),'utf8'))
const publishedThroughIndex=config.publishedThrough===null?-1:config.slugs.indexOf(config.publishedThrough)
if(config.publishedThrough!==null&&publishedThroughIndex<0){
  throw new Error(`publishedThrough must be null or one of the configured story slugs; received ${config.publishedThrough}`)
}
const isPublished=index=>index<=publishedThroughIndex
const allPublished=publishedThroughIndex===config.slugs.length-1

const ui={
  'zh-CN':{
    languageName:'简体中文',alternateName:'English',stories:'故事',about:'关于',help:'帮助',home:'返回校园',
    series:'开发纪实',contents:'文章导航',previous:'上一篇',next:'下一篇',
    articleIndex:'文章首页',openArticle:'开始阅读',fullLabel:'全文',ongoing:'持续更新',unpublished:'待发布',
    unpublishedLead:'这一章还没有正式发布。内容会按照连载进度逐步开放。',
    indexTitle:'四小故事',indexLead:'把校园的制作过程、个人记忆与人机协作，和可以行走的项目一起保存。',
    articleLead:'一座只存在于记忆里的旧校园，怎样经过草图、建模、试玩和反复纠正，成为可以走进去的浏览器空间。',
    contentLicense:'原创文章采用 CC BY 4.0；代码采用 MIT；图像与其他资产按各自许可。',
  },
  en:{
    languageName:'English',alternateName:'简体中文',stories:'Stories',about:'About',help:'Help',home:'Back to campus',
    series:'Development story',contents:'Article navigation',previous:'Previous',next:'Next',
    articleIndex:'Article index',openArticle:'Start reading',fullLabel:'Full article',ongoing:'Ongoing',unpublished:'Not yet published',
    unpublishedLead:'This chapter has not been published yet. It will open as the serial progresses.',
    indexTitle:'4Lite Stories',indexLead:'The making of the campus, its personal memories, and the human–agent collaboration are preserved beside the place itself.',
    articleLead:'How an old school that survived only in memory became a browser space through sketches, modelling, play, and repeated correction.',
    contentLicense:'Original writing is CC BY 4.0; code is MIT; images and other assets retain their stated licences.',
  },
}

marked.setOptions({gfm:true})

function escapeHtml(value){
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
}

function stripMarkdown(value){
  return value
    .replace(/\[([^\]]+)\]\([^\)]+\)/g,'$1')
    .replace(/[`*_>#]/g,'')
    .replace(/\s+/g,' ')
    .trim()
}

function parseStory(markdown,locale){
  const titleMatch=markdown.match(/^# (.+)$/m)
  if(!titleMatch)throw new Error(`Missing H1 in ${config.sources[locale]}`)
  const sectionMatches=[...markdown.matchAll(/^## (.+)$/gm)]
  if(sectionMatches.length!==config.slugs.length){
    throw new Error(`${config.sources[locale]} has ${sectionMatches.length} H2 sections; expected ${config.slugs.length}`)
  }
  const firstSectionIndex=sectionMatches[0].index
  let prelude=markdown.slice(titleMatch.index+titleMatch[0].length,firstSectionIndex).trim()
  prelude=prelude.split('\n').filter(line=>!line.includes('project-development-story')).join('\n').trim()
  const sections=sectionMatches.map((match,index)=>{
    const start=match.index+match[0].length
    const end=sectionMatches[index+1]?.index??markdown.length
    const body=markdown.slice(start,end).trim()
    return {title:match[1].trim(),slug:config.slugs[index],markdown:`## ${match[1].trim()}\n\n${body}`,body}
  })
  return {title:stripMarkdown(titleMatch[1].trim()),prelude,sections}
}

function localeBase(locale){
  return locale==='zh-CN'?`/stories/${config.id}/`:`/stories/${config.id}/en/`
}

function chapterPath(locale,slug){
  return `${localeBase(locale)}chapters/${slug}/`
}

function alternatePath(locale,kind,slug){
  const other=locale==='zh-CN'?'en':'zh-CN'
  if(kind==='chapter')return chapterPath(other,slug)
  if(kind==='full')return `${localeBase(other)}full/`
  return localeBase(other)
}

function renderHead({locale,title,description,path,alternate}){
  const canonical=`${config.canonicalOrigin}${path}`
  const otherLocale=locale==='zh-CN'?'en':'zh-CN'
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f1e6c9" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="${otherLocale}" href="${config.canonicalOrigin}${alternate}" />
    <link rel="icon" href="data:," />
    <title>${escapeHtml(title)} · 四小 4Lite</title>
  </head>`
}

function renderTopNavigation(locale,current='stories'){
  const t=ui[locale]
  return `<nav class="story-top-nav" aria-label="${escapeHtml(t.stories)}"><a class="story-home-link" href="/">${escapeHtml(t.home)}</a><span class="story-top-links"><a href="/stories/"${current==='stories'?' aria-current="page"':''}>${escapeHtml(t.stories)}</a><a href="/about/">${escapeHtml(t.about)}</a><a href="/help/">${escapeHtml(t.help)}</a></span></nav>`
}

function renderFooter(locale){
  const t=ui[locale]
  return `<footer class="story-footer"><p>${escapeHtml(t.contentLicense)}</p><p><a href="https://github.com/smartdio/4lite/blob/main/CONTENT_LICENSE.md">CC BY 4.0</a> · <a href="https://github.com/smartdio/4lite/blob/main/LICENSE">MIT</a> · <a href="https://github.com/smartdio/4lite/blob/main/ASSET_LICENSES.md">Asset licences</a></p><div data-site-footer-links></div></footer>`
}

function renderDocument({locale,title,description,path,alternate,bodyClass='',body}){
  return `${renderHead({locale,title,description,path,alternate})}
  <body class="${bodyClass}">
    ${renderTopNavigation(locale)}
    ${body}
    ${renderFooter(locale)}
    <script type="module" src="/src/story-page.js"></script>
  </body>
</html>
`
}

function renderHero({locale,kicker,title,lead,alternate,actions=''}){
  const t=ui[locale]
  return `<header class="story-hero"><div class="story-hero-shade"></div><div class="story-hero-copy"><img class="story-logo" data-project-logo alt="四小" width="1774" height="887" /><p class="story-kicker">${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1><p class="story-lead">${escapeHtml(lead)}</p><div class="story-hero-actions">${actions}<a class="story-language" href="${alternate}">${escapeHtml(t.alternateName)}</a></div></div></header>`
}

function renderChapterList(locale,story,currentSlug=''){
  const t=ui[locale]
  const items=story.sections.map((section,index)=>{
    const number=String(index).padStart(2,'0')
    if(isPublished(index)){
      return `<a href="${chapterPath(locale,section.slug)}"${section.slug===currentSlug?' aria-current="page"':''}><span>${number}</span>${escapeHtml(section.title)}</a>`
    }
    return `<span class="story-toc-entry is-unpublished" aria-disabled="true"${section.slug===currentSlug?' aria-current="page"':''}><span>${number}</span><span>${escapeHtml(section.title)}<small>${escapeHtml(t.unpublished)}</small></span></span>`
  }).join('')
  return `<nav class="story-toc" aria-label="${escapeHtml(t.contents)}"><div class="story-toc-heading"><strong>${escapeHtml(t.contents)}</strong><a href="${localeBase(locale)}">${escapeHtml(t.articleIndex)}</a></div><div class="story-toc-links">${items}</div></nav>`
}

function renderSeriesIndex(locale,story){
  const t=ui[locale]
  const path=localeBase(locale)
  const alternate=alternatePath(locale,'index')
  const chapterCards=story.sections.map((section,index)=>{
    const number=String(index).padStart(2,'0')
    if(isPublished(index)){
      const summary=stripMarkdown(section.body.split(/\n\n/)[0]).slice(0,locale==='zh-CN'?92:170)
      return `<li><a class="chapter-card-entry" href="${chapterPath(locale,section.slug)}"><span class="chapter-number">${number}</span><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(summary)}</small></span></a></li>`
    }
    return `<li><div class="chapter-card-entry is-unpublished" aria-disabled="true"><span class="chapter-number">${number}</span><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(t.unpublished)}</small></span></div></li>`
  }).join('')
  const preludeHtml=marked.parse(story.prelude)
  const actions=publishedThroughIndex>=0?`<a class="primary" href="${chapterPath(locale,story.sections[0].slug)}">${escapeHtml(t.openArticle)}</a>${allPublished?`<a href="${path}full/">${escapeHtml(t.fullLabel)}</a>`:''}`:''
  const body=`${renderHero({locale,kicker:`${t.series} · ${t.ongoing}`,title:story.title,lead:t.articleLead,alternate,actions})}<main class="story-index-layout"><section class="story-introduction story-copy">${preludeHtml}</section><section><div class="story-section-heading"><p>${escapeHtml(t.series)}</p><h2>${escapeHtml(t.contents)} · ${escapeHtml(t.ongoing)}</h2></div><ol class="chapter-card-list">${chapterCards}</ol></section></main>`
  return renderDocument({locale,title:story.title,description:t.articleLead,path,alternate,bodyClass:'story-series-index',body})
}

function renderChapter(locale,story,index){
  const t=ui[locale]
  const section=story.sections[index]
  const path=chapterPath(locale,section.slug)
  const alternate=alternatePath(locale,'chapter',section.slug)
  if(!isPublished(index))return renderUnpublishedChapter(locale,story,index)
  const previous=index>0&&isPublished(index-1)?story.sections[index-1]:null
  const next=index<story.sections.length-1&&isPublished(index+1)?story.sections[index+1]:null
  const description=stripMarkdown(section.body.split(/\n\n/)[0]).slice(0,locale==='zh-CN'?120:200)
  const pagination=`<nav class="story-pagination" aria-label="${escapeHtml(t.contents)}">${previous?`<a class="previous" href="${chapterPath(locale,previous.slug)}"><small>${escapeHtml(t.previous)}</small><strong>${escapeHtml(previous.title)}</strong></a>`:'<span></span>'}${next?`<a class="next" href="${chapterPath(locale,next.slug)}"><small>${escapeHtml(t.next)}</small><strong>${escapeHtml(next.title)}</strong></a>`:'<span></span>'}</nav>`
  const fullAction=allPublished?`<a href="${localeBase(locale)}full/#${section.slug}">${escapeHtml(t.fullLabel)}</a>`:''
  const body=`${renderHero({locale,kicker:`${t.series} · ${String(index).padStart(2,'0')}`,title:section.title,lead:story.title,alternate,actions:`<a href="${localeBase(locale)}">${escapeHtml(t.articleIndex)}</a>${fullAction}`})}<main class="story-reading-layout">${renderChapterList(locale,story,section.slug)}<div class="story-reading-column"><article class="story-copy story-chapter">${marked.parse(section.markdown)}</article>${pagination}</div></main>`
  return renderDocument({locale,title:section.title,description,path,alternate,bodyClass:'story-chapter-page',body})
}

function renderUnpublishedChapter(locale,story,index){
  const t=ui[locale]
  const section=story.sections[index]
  const path=chapterPath(locale,section.slug)
  const alternate=alternatePath(locale,'chapter',section.slug)
  const body=`${renderHero({locale,kicker:`${t.series} · ${t.unpublished}`,title:section.title,lead:t.unpublishedLead,alternate,actions:`<a href="${localeBase(locale)}">${escapeHtml(t.articleIndex)}</a>`})}<main class="story-reading-layout">${renderChapterList(locale,story,section.slug)}<div class="story-reading-column"><article class="story-copy story-unpublished-message"><h2>${escapeHtml(t.unpublished)}</h2><p>${escapeHtml(t.unpublishedLead)}</p></article></div></main>`
  return renderDocument({locale,title:section.title,description:t.unpublishedLead,path,alternate,bodyClass:'story-chapter-page story-unpublished-page',body})
}

function renderFull(locale,story){
  const t=ui[locale]
  const path=`${localeBase(locale)}full/`
  const alternate=alternatePath(locale,'full')
  const sections=story.sections.filter((_section,index)=>isPublished(index)).map(section=>{
    const html=marked.parse(section.markdown).replace('<h2>',`<h2 id="${section.slug}">`)
    return `<section class="story-full-section">${html}</section>`
  }).join('')
  const body=`${renderHero({locale,kicker:`${t.series} · ${t.fullLabel}`,title:story.title,lead:t.articleLead,alternate,actions:`<a href="${localeBase(locale)}">${escapeHtml(t.articleIndex)}</a>`})}<main class="story-reading-layout">${renderChapterList(locale,story)}<div class="story-reading-column"><article class="story-copy story-full-article">${marked.parse(story.prelude)}${sections}</article></div></main>`
  return renderDocument({locale,title:`${story.title} · ${t.fullLabel}`,description:t.articleLead,path,alternate,bodyClass:'story-full-page',body})
}

function renderStoriesIndex(zhStory){
  const locale='zh-CN',t=ui[locale],path='/stories/',alternate='/stories/from-memory-to-campus/en/'
  const body=`${renderHero({locale,kicker:'4LITE STORIES',title:t.indexTitle,lead:t.indexLead,alternate,actions:''})}<main class="stories-hub"><article class="story-feature-card"><p class="story-kicker">${escapeHtml(t.series)}</p><h2>${escapeHtml(zhStory.title)}</h2><p>${escapeHtml(t.articleLead)}</p><div class="story-feature-meta"><span>${escapeHtml(t.ongoing)}</span><span>中文 · English</span></div><div class="story-feature-actions"><a class="primary" href="${localeBase(locale)}">${escapeHtml(t.openArticle)}</a><a href="${localeBase('en')}">English</a></div></article></main>`
  return renderDocument({locale,title:t.indexTitle,description:t.indexLead,path,alternate,bodyClass:'stories-index',body})
}

async function save(relativePath,content){
  const target=join(projectRoot,relativePath)
  await mkdir(dirname(target),{recursive:true})
  await writeFile(target,content)
}

const stories={}
for(const locale of Object.keys(config.sources)){
  const markdown=await readFile(join(projectRoot,config.sources[locale]),'utf8')
  stories[locale]=parseStory(markdown,locale)
}

for(const [locale,story] of Object.entries(stories)){
  const prefix=locale==='zh-CN'?`stories/${config.id}`:`stories/${config.id}/en`
  await save(`${prefix}/index.html`,renderSeriesIndex(locale,story))
  await save(`${prefix}/full/index.html`,renderFull(locale,story))
  for(let index=0;index<story.sections.length;index++){
    await save(`${prefix}/chapters/${story.sections[index].slug}/index.html`,renderChapter(locale,story,index))
  }
}

await save('stories/index.html',renderStoriesIndex(stories['zh-CN']))
console.log(`Generated ${config.slugs.length*2+5} story pages from the bilingual source.`)

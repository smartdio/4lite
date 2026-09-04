import assert from 'node:assert/strict'
import test from 'node:test'
import {createTranslator,localeMessages,translateRuntimeTextForLocale} from '../../src/i18n/index.js'

const leafKeys=(value,prefix='')=>Object.entries(value).flatMap(([key,item])=>{
  const path=prefix?`${prefix}.${key}`:key
  if(Array.isArray(item))return []
  return item&&typeof item==='object'?leafKeys(item,path):[path]
})

test('Chinese and English locale packs expose the same string keys',()=>{
  assert.deepEqual(leafKeys(localeMessages.en).sort(),leafKeys(localeMessages['zh-CN']).sort())
})

test('translations interpolate variables and reject missing data',()=>{
  const english=createTranslator('en')
  assert.equal(english.t('loading.preparing',{completed:4,total:12}),'Preparing resources 4 / 12')
  assert.throws(()=>english.t('loading.preparing',{completed:4}),/Missing i18n variable: total/)
  assert.throws(()=>english.t('does.not.exist'),/Missing en translation/)
})

test('localized links and metric units follow the selected locale',()=>{
  const chinese=createTranslator('zh-CN'),english=createTranslator('en')
  assert.equal(chinese.localizedPath('home'),'/')
  assert.equal(english.localizedPath('home'),'/en/')
  assert.equal(english.localizedPath('story'),'/stories/from-memory-to-campus/en/')
  assert.equal(chinese.formatDistanceMetres(1.5),'1.50 米')
  assert.equal(english.formatDistanceMetres(1.5),'1.50 m')
})

test('entry loading copy contains four status messages and eight complete tips',()=>{
  assert.equal(localeMessages.en.loading.messages.length,4)
  assert.equal(localeMessages.en.loading.tips.length,8)
  assert.equal(localeMessages['zh-CN'].loading.messages.length,4)
  assert.equal(localeMessages['zh-CN'].loading.tips.length,8)
  assert.equal(localeMessages.en.loading.tips.every(tip=>tip.length===2&&tip.every(Boolean)),true)
})

test('all twelve minigame families have representative English runtime copy',()=>{
  const cases=new Map([
    ['三分球 +3','3-POINT SHOT +3'],
    ['发球未先落本方台面','The serve did not bounce on your side first'],
    ['跳得真远！','Great jump!'],
    ['抓稳 +18厘米','Steady +18 cm'],
    ['瓦片压线了','Tile touched the line'],
    ['换另一只脚','Use the other foot'],
    ['碰动别的石子了','Another jack moved'],
    ['拖动瞄准 · 按住弹兜发射','Drag to aim · Hold the pouch to fire'],
    ['已经重新打乱','Shuffled'],
    ['升旗完成 · X退出 · Esc暂停','Flag raised · X exit · Esc pause'],
    ['向右取宝 · 向左返船 · 躲避触手 · 三次失误结束','Move right for treasure · Return left · Dodge the tentacles · Three misses end the game'],
    ['左右移动担架，接住跳楼者并送往救护车','Move the stretcher · Catch the jumpers · Carry them to the ambulance'],
  ])
  for(const [source,expected] of cases){
    assert.equal(translateRuntimeTextForLocale(source,'en'),expected)
    assert.equal(translateRuntimeTextForLocale(source,'zh-CN'),source)
  }
})

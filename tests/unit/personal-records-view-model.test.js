import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createPersonalRecords,PERSONAL_GAME_CATALOG} from '../../src/state/personal-records.js'
import {createUserDataStore} from '../../src/state/user-data-store.js'

const fixture=()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}
  const store=createUserDataStore({storage,storageKey:'test:record-view-model'})
  return {records:createPersonalRecords({store}),store,storage}
}

test('all thirteen games distinguish missing records from participation without relying on placeholders',()=>{
  const {records}=fixture()
  for(const game of records.viewModel().games){
    assert.equal(game.hasRecord,false,game.id)
    assert.equal(game.played,false,game.id)
    assert.equal(game.record,game.id==='dodgeball'?'尚未完成比赛':'尚无纪录')
  }
  for(const {id} of PERSONAL_GAME_CATALOG)records.recordGame(id)
  const games=records.viewModel().games
  assert.equal(games.length,13)
  assert.equal(games.filter(game=>game.hasRecord).length,0)
  assert.ok(games.every(game=>game.played))
})

test('existing game records retain their exact display strings and zero-miss completion qualifies',()=>{
  const {records,store,storage}=fixture()
  const achieved=[
    ['dodgeball',{completed:1,pingpongBest:0},'乒乓球 0 分'],
    ['basketball',{bestPoints:12},'12 分'],
    ['pingPong',{longestRally:5,wins:2},'最长 5 拍 · 2 胜'],
    ['longJump',{maxDistance:2.45},'2.45 米'],
    ['bambooClimb',{completions:1,leastFailures:0},'登顶 · 最少 0 次失误'],
    ['hopscotch',{bestProgress:4},'完成至第 4 格'],
    ['shuttlecock',{bestStreak:7},'连续 7 次'],
    ['jacks',{highestStage:3,bestStreak:8},'最高第 3 关 · 连抓 8'],
    ['slingshot',{bestHits:4},'命中 4 个目标'],
    ['rubiksCube',{completions:1,fewestMoves:20},'最少 20 步完成'],
    ['flagRaising',{completions:2},'完成 2 次'],
    ['handheldOctopus',{gameA:13,gameB:17},'A 13 · B 17'],
    ['handheldFire',{gameA:23},'A 23'],
  ]
  for(const [id,metrics] of achieved)records.recordGame(id,{set:metrics})
  const saved=storage.getItem('test:record-view-model')
  for(const [id,,text] of achieved){
    const game=records.viewModel().games.find(game=>game.id===id)
    assert.equal(game.hasRecord,true,id)
    assert.equal(game.record,text,id)
  }
  assert.equal(records.viewModel().games.filter(game=>game.hasRecord).length,13)
  assert.equal(storage.getItem('test:record-view-model'),saved)
  assert.equal(saved.includes('hasRecord'),false)
  assert.equal(store.readPersistedNamespace('personalRecords').version,1)
  const restored=createPersonalRecords({store:createUserDataStore({storage,storageKey:'test:record-view-model'})})
  assert.deepEqual(restored.snapshot(),records.snapshot())
  assert.deepEqual(restored.viewModel().games,records.viewModel().games)
})

test('legacy imported and partial progress records still qualify without altering saved schemas',()=>{
  const {records,store}=fixture()
  store.registerNamespace('handheldOctopus',{defaultValue:{highScores:{gameA:0,gameB:0}}}).set({highScores:{gameA:9,gameB:0}})
  store.registerNamespace('jacksGame',{defaultValue:{}}).set({highestStage:2,bestStreak:0,completions:0})
  records.importLegacy({legacyStorage:{getItem:key=>key==='4lite.hopscotch.best-cell.v1'?'3':null}})
  records.recordGame('bambooClimb',{max:{maxHeight:2.1}})
  records.recordGame('rubiksCube',{max:{moves:6}})
  const expected=new Map([
    ['handheldOctopus','A 9'],['jacks','最高第 2 关'],['hopscotch','完成至第 3 格'],
    ['bambooClimb','最高 2.10 米'],['rubiksCube','已转动 6 步'],
  ])
  for(const game of records.viewModel().games){
    assert.equal(game.hasRecord,expected.has(game.id),game.id)
    if(expected.has(game.id))assert.equal(game.record,expected.get(game.id))
  }
  assert.equal(store.readPersistedNamespace('handheldOctopus').version,1)
  assert.deepEqual(store.readPersistedNamespace('handheldOctopus').data,{highScores:{gameA:9,gameB:0}})
})

test('English route exposes the same record semantics and keeps its existing strings',()=>{
  // Locale is resolved once at module load; use a clean process instead of
  // mutating the Chinese test module cache or adding a runtime locale API.
  const result=execFileSync(process.execPath,['--input-type=module','-e',String.raw`
    globalThis.location={pathname:'/en/'}
    const {createPersonalRecords,PERSONAL_GAME_CATALOG}=await import(process.argv[1])
    const {createUserDataStore}=await import(process.argv[2])
    const records=createPersonalRecords({store:createUserDataStore()})
    const initial=records.viewModel().games
    for(const {id} of PERSONAL_GAME_CATALOG)records.recordGame(id)
    const participating=records.viewModel().games
    records.recordGame('dodgeball',{played:false,set:{completed:1,pingpongBest:0}})
    records.recordGame('basketball',{set:{bestPoints:12}})
    records.recordGame('pingPong',{set:{longestRally:5,wins:2}})
    records.recordGame('longJump',{set:{maxDistance:2.45}})
    records.recordGame('bambooClimb',{set:{completions:1,leastFailures:0}})
    records.recordGame('hopscotch',{set:{bestProgress:4}})
    records.recordGame('shuttlecock',{set:{bestStreak:7}})
    records.recordGame('jacks',{set:{highestStage:3,bestStreak:8}})
    records.recordGame('slingshot',{set:{bestHits:4}})
    records.recordGame('rubiksCube',{set:{completions:1,fewestMoves:20}})
    records.recordGame('flagRaising',{set:{completions:2}})
    records.recordGame('handheldOctopus',{set:{gameA:13,gameB:17}})
    records.recordGame('handheldFire',{set:{gameA:23}})
    console.log(JSON.stringify({initial,participating,completed:records.viewModel().games}))
  `,new URL('../../src/state/personal-records.js',import.meta.url).href,new URL('../../src/state/user-data-store.js',import.meta.url).href],{encoding:'utf8'})
  const {initial,participating,completed}=JSON.parse(result)
  for(const game of initial){
    assert.equal(game.hasRecord,false,game.id)
    assert.equal(game.record,game.id==='dodgeball'?'No completed match yet':'No record yet')
  }
  assert.ok(participating.every(game=>game.played&&!game.hasRecord))
  assert.ok(completed.every(game=>game.hasRecord))
  assert.deepEqual(completed.map(game=>game.record),[
    'Ball 0','12 points','Longest rally: 5 · 2 wins','2.45 m','Reached the top · Fewest misses: 0',
    'Completed through square 4','Best streak: 7','Highest round: 3 · Best catch: 8','4 targets hit',
    'Solved in 20 moves','Completed 2 times','A 13 · B 17','A 23',
  ])
})

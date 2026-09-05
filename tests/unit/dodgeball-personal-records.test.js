import test from 'node:test'
import assert from 'node:assert/strict'
import {createPersonalRecords, PERSONAL_GAME_CATALOG, PERSONAL_RECORD_TOTALS} from '../../src/state/personal-records.js'
import {createUserDataStore} from '../../src/state/user-data-store.js'

const memoryStorage=()=>{
  const values=new Map()
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}
}
function fixture(storage=memoryStorage()) {
  let time=Date.parse('2026-09-05T09:00:00.000Z')
  const store=createUserDataStore({storage,storageKey:'test:dodgeball-records'})
  const records=createPersonalRecords({store,now:()=>time})
  return {records,store,storage,tick:()=>{time+=60000}}
}
const start=records=>records.recordGame('dodgeball',{touchPlayedAt:true,increment:{played:1}})
const finish=(records,mode,score,win=false)=>records.recordGame('dodgeball',{
  played:false,max:{[mode==='beanbag'?'beanbagBest':'pingpongBest']:score},increment:{completed:1,wins:win?1:0},
})
const gameView=records=>records.viewModel().games.find(game=>game.id==='dodgeball')

test('dodgeball is one public game, not a new mystery or a game per ball mode',()=>{
  const {records}=fixture(),view=records.viewModel()
  assert.equal(PERSONAL_GAME_CATALOG.filter(game=>game.id==='dodgeball').length,1)
  assert.equal(PERSONAL_GAME_CATALOG.length,13)
  assert.equal(PERSONAL_RECORD_TOTALS.games,13)
  assert.equal(PERSONAL_RECORD_TOTALS.mysteries,3)
  assert.equal(view.totals.games,13);assert.equal(view.mysteries.length,3)
  assert.equal(view.counts.games,0);assert.equal(view.counts.mysteries,0)
  assert.deepEqual(gameView(records),{id:'dodgeball',label:'热血躲避',hidden:false,played:false,record:'尚未完成比赛',metrics:{}})
  assert.equal(records.snapshot().games.dodgeball,undefined)
})

test('starting or abandoning a match marks participation without inventing a completed score',()=>{
  const {records,tick}=fixture()
  start(records)
  const first=records.snapshot().games.dodgeball
  assert.equal(first.firstPlayedAt,'2026-09-05T09:00:00.000Z')
  assert.equal(first.lastPlayedAt,first.firstPlayedAt)
  assert.deepEqual(first.metrics,{played:1})
  assert.equal(gameView(records).record,'尚未完成比赛')
  // An exit sends no record update. A later start changes only participation.
  tick();start(records)
  const second=records.snapshot().games.dodgeball
  assert.equal(second.firstPlayedAt,first.firstPlayedAt)
  assert.equal(second.lastPlayedAt,'2026-09-05T09:01:00.000Z')
  assert.deepEqual(second.metrics,{played:2})
  assert.equal(records.viewModel().counts.games,1)
  assert.equal(gameView(records).record,'尚未完成比赛')
})

test('a completed zero-point match is distinct from an unfinished match',()=>{
  const {records,tick}=fixture()
  start(records);tick();finish(records,'pingpong',0)
  assert.deepEqual(records.snapshot().games.dodgeball.metrics,{played:1,pingpongBest:0,completed:1,wins:0})
  assert.equal(gameView(records).record,'乒乓球 0 分')
  assert.equal(records.snapshot().games.dodgeball.lastPlayedAt,'2026-09-05T09:00:00.000Z')
  assert.equal(gameView(records).record.includes('沙包'),false)
})

test('ball and beanbag best scores stay independent while completed matches and wins accumulate',()=>{
  const {records,tick}=fixture()
  start(records);finish(records,'pingpong',8,true)
  tick();start(records);finish(records,'beanbag',5)
  tick();start(records);finish(records,'pingpong',3)
  tick();start(records);finish(records,'beanbag',9,true)
  assert.deepEqual(records.snapshot().games.dodgeball.metrics,{played:4,pingpongBest:8,beanbagBest:9,completed:4,wins:2})
  assert.equal(gameView(records).record,'乒乓球 8 分 · 沙包 9 分 · 2 胜')
  assert.equal(records.viewModel().counts.games,1)
  assert.equal(records.viewModel().counts.mysteries,0)
})

test('completed results survive a fresh store without modifying existing game or mystery records',()=>{
  const {records,storage}=fixture()
  records.recordGame('basketball',{max:{bestPoints:12}})
  records.recordMysteryDevice('handheldOctopus')
  start(records);finish(records,'beanbag',4,true)
  const before=records.snapshot(),restored=fixture(storage)
  assert.deepEqual(restored.records.snapshot(),before)
  assert.equal(gameView(restored.records).record,'沙包 4 分 · 1 胜')
  assert.equal(restored.records.viewModel().counts.games,2)
  assert.equal(restored.records.viewModel().counts.mysteries,1)
  assert.deepEqual(restored.store.snapshot().persistedNamespaces,['personalRecords'])
})

test('invalid score values cannot replace a valid dodgeball record',()=>{
  const {records}=fixture()
  start(records);finish(records,'pingpong',6,true)
  records.recordGame('dodgeball',{played:false,max:{pingpongBest:NaN,beanbagBest:Infinity},increment:{completed:NaN,wins:Infinity}})
  assert.deepEqual(records.snapshot().games.dodgeball.metrics,{played:1,pingpongBest:6,completed:1,wins:1})
})

test('clearing personal records resets dodgeball but preserves unrelated saved namespaces',()=>{
  const {records,store}=fixture()
  const existing=store.registerNamespace('existingGame',{defaultValue:{best:0}})
  existing.set({best:27});start(records);finish(records,'pingpong',11,true)
  assert.equal(records.clear(),true)
  assert.equal(records.snapshot().games.dodgeball,undefined)
  assert.equal(gameView(records).played,false)
  assert.equal(gameView(records).record,'尚未完成比赛')
  assert.deepEqual(existing.get(),{best:27})
  assert.deepEqual(store.snapshot().persistedNamespaces,['existingGame'])
})

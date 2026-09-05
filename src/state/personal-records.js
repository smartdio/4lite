import {getUserDataStore} from './user-data-store.js'
import {isEnglish,translateRuntimeText} from '../i18n/index.js'

const STORAGE_NAMESPACE='personalRecords'
const STORAGE_VERSION=1

export const PERSONAL_RECORD_TOTALS={rooms:24,books:47,games:13,mysteries:3,snackBags:3}

export const PERSONAL_GAME_CATALOG=[
  {id:'dodgeball',label:'热血躲避'},
  {id:'basketball',label:'篮球'},
  {id:'pingPong',label:'乒乓球'},
  {id:'longJump',label:'跳远'},
  {id:'bambooClimb',label:'爬竹竿'},
  {id:'hopscotch',label:'跳房子'},
  {id:'shuttlecock',label:'踢毽子'},
  {id:'jacks',label:'抓石子'},
  {id:'slingshot',label:'弹弓'},
  {id:'rubiksCube',label:'魔方'},
  {id:'flagRaising',label:'升旗'},
  {id:'handheldOctopus',label:'Octopus 掌机'},
  {id:'handheldFire',label:'Fire 掌机'},
]

const DEFAULT_VALUE={
  createdAt:null,visitedRooms:{},documents:{},objects:{types:{},instances:{}},games:{},
  mysteries:{snackBags:{found:{}},handheldOctopus:{foundAt:null},handheldFire:{foundAt:null}},
}

const plainObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{}
const cleanTimestamp=value=>typeof value==='string'&&value.length<=40?value:null
const cleanId=value=>typeof value==='string'&&value.length>0&&value.length<=240?value:null
const cleanMap=(value,mapper)=>Object.fromEntries(Object.entries(plainObject(value)).flatMap(([key,item])=>{
  const id=cleanId(key),mapped=id&&mapper(item,id)
  return mapped==null?[]:[[id,mapped]]
}))
const cleanNumber=value=>Number.isFinite(Number(value))?Number(value):null
const cleanMetrics=value=>cleanMap(value,item=>cleanNumber(item))

const validate=value=>{
  const source=plainObject(value),objects=plainObject(source.objects),mysteries=plainObject(source.mysteries)
  return {
    createdAt:cleanTimestamp(source.createdAt),
    visitedRooms:cleanMap(source.visitedRooms,item=>cleanTimestamp(item)),
    documents:cleanMap(source.documents,item=>{
      const entry=plainObject(item),kind=cleanId(entry.kind)??'document'
      return {kind,firstViewedAt:cleanTimestamp(entry.firstViewedAt),sources:cleanMap(entry.sources,sourceAt=>cleanTimestamp(sourceAt))}
    }),
    objects:{
      types:cleanMap(objects.types,item=>{
        const entry=plainObject(item)
        return {kind:cleanId(entry.kind)??'object',label:cleanId(entry.label),firstViewedAt:cleanTimestamp(entry.firstViewedAt)}
      }),
      instances:cleanMap(objects.instances,item=>{
        const entry=plainObject(item)
        return {typeId:cleanId(entry.typeId)??'object',firstViewedAt:cleanTimestamp(entry.firstViewedAt)}
      }),
    },
    games:cleanMap(source.games,item=>{
      const entry=plainObject(item)
      return {firstPlayedAt:cleanTimestamp(entry.firstPlayedAt),lastPlayedAt:cleanTimestamp(entry.lastPlayedAt),metrics:cleanMetrics(entry.metrics)}
    }),
    mysteries:{
      snackBags:{found:cleanMap(plainObject(mysteries.snackBags).found,item=>cleanTimestamp(item))},
      handheldOctopus:{foundAt:cleanTimestamp(plainObject(mysteries.handheldOctopus).foundAt)},
      handheldFire:{foundAt:cleanTimestamp(plainObject(mysteries.handheldFire).foundAt)},
    },
  }
}

const timestamp=now=>new Date(now()).toISOString()
const changed=(before,after)=>JSON.stringify(before)!==JSON.stringify(after)
const formatInteger=value=>String(Math.max(0,Math.round(value)))
const formatRecord=(id,metrics)=>{
  if(id==='dodgeball'){
    if(!metrics.completed)return isEnglish?'No completed match yet':'尚未完成比赛'
    const parts=[]
    if(metrics.pingpongBest!=null)parts.push(isEnglish?`Ball ${formatInteger(metrics.pingpongBest)}`:`乒乓球 ${formatInteger(metrics.pingpongBest)} 分`)
    if(metrics.beanbagBest!=null)parts.push(isEnglish?`Beanbag ${formatInteger(metrics.beanbagBest)}`:`沙包 ${formatInteger(metrics.beanbagBest)} 分`)
    if(metrics.wins>0)parts.push(isEnglish?`${formatInteger(metrics.wins)} wins`:`${formatInteger(metrics.wins)} 胜`)
    return parts.join(' · ')
  }
  if(isEnglish){
    if(id==='basketball'&&metrics.bestPoints>0)return `${formatInteger(metrics.bestPoints)} points`
    if(id==='pingPong'){
      const parts=[]
      if(metrics.longestRally>0)parts.push(`Longest rally: ${formatInteger(metrics.longestRally)}`)
      if(metrics.wins>0)parts.push(`${formatInteger(metrics.wins)} wins`)
      return parts.join(' · ')||'No record yet'
    }
    if(id==='longJump'&&metrics.maxDistance>0)return `${metrics.maxDistance.toFixed(2)} m`
    if(id==='bambooClimb'){
      if(metrics.completions>0&&Number.isFinite(metrics.leastFailures))return `Reached the top · Fewest misses: ${formatInteger(metrics.leastFailures)}`
      if(metrics.maxHeight>0)return `Highest: ${metrics.maxHeight.toFixed(2)} m`
    }
    if(id==='hopscotch'&&metrics.bestProgress>0)return `Completed through square ${formatInteger(metrics.bestProgress)}`
    if(id==='shuttlecock'&&metrics.bestStreak>0)return `Best streak: ${formatInteger(metrics.bestStreak)}`
    if(id==='jacks'){
      const parts=[]
      if(metrics.highestStage>0)parts.push(`Highest round: ${formatInteger(metrics.highestStage)}`)
      if(metrics.bestStreak>0)parts.push(`Best catch: ${formatInteger(metrics.bestStreak)}`)
      return parts.join(' · ')||'No record yet'
    }
    if(id==='slingshot'&&metrics.bestHits>0)return `${formatInteger(metrics.bestHits)} targets hit`
    if(id==='rubiksCube'){
      if(metrics.completions>0&&metrics.fewestMoves>0)return `Solved in ${formatInteger(metrics.fewestMoves)} moves`
      if(metrics.moves>0)return `${formatInteger(metrics.moves)} moves made`
    }
    if(id==='flagRaising'&&metrics.completions>0)return `Completed ${formatInteger(metrics.completions)} times`
    if(id==='handheldOctopus'||id==='handheldFire'){
      const parts=[]
      if(metrics.gameA>0)parts.push(`A ${formatInteger(metrics.gameA)}`)
      if(metrics.gameB>0)parts.push(`B ${formatInteger(metrics.gameB)}`)
      return parts.join(' · ')||'No record yet'
    }
    return 'No record yet'
  }
  if(id==='basketball'&&metrics.bestPoints>0)return `${formatInteger(metrics.bestPoints)} 分`
  if(id==='pingPong'){
    const parts=[]
    if(metrics.longestRally>0)parts.push(`最长 ${formatInteger(metrics.longestRally)} 拍`)
    if(metrics.wins>0)parts.push(`${formatInteger(metrics.wins)} 胜`)
    return parts.join(' · ')||'尚无纪录'
  }
  if(id==='longJump'&&metrics.maxDistance>0)return `${metrics.maxDistance.toFixed(2)} 米`
  if(id==='bambooClimb'){
    if(metrics.completions>0&&Number.isFinite(metrics.leastFailures))return `登顶 · 最少 ${formatInteger(metrics.leastFailures)} 次失误`
    if(metrics.maxHeight>0)return `最高 ${metrics.maxHeight.toFixed(2)} 米`
  }
  if(id==='hopscotch'&&metrics.bestProgress>0)return `完成至第 ${formatInteger(metrics.bestProgress)} 格`
  if(id==='shuttlecock'&&metrics.bestStreak>0)return `连续 ${formatInteger(metrics.bestStreak)} 次`
  if(id==='jacks'){
    const parts=[]
    if(metrics.highestStage>0)parts.push(`最高第 ${formatInteger(metrics.highestStage)} 关`)
    if(metrics.bestStreak>0)parts.push(`连抓 ${formatInteger(metrics.bestStreak)}`)
    return parts.join(' · ')||'尚无纪录'
  }
  if(id==='slingshot'&&metrics.bestHits>0)return `命中 ${formatInteger(metrics.bestHits)} 个目标`
  if(id==='rubiksCube'){
    if(metrics.completions>0&&metrics.fewestMoves>0)return `最少 ${formatInteger(metrics.fewestMoves)} 步完成`
    if(metrics.moves>0)return `已转动 ${formatInteger(metrics.moves)} 步`
  }
  if(id==='flagRaising'&&metrics.completions>0)return `完成 ${formatInteger(metrics.completions)} 次`
  if(id==='handheldOctopus'||id==='handheldFire'){
    const parts=[]
    if(metrics.gameA>0)parts.push(`A ${formatInteger(metrics.gameA)}`)
    if(metrics.gameB>0)parts.push(`B ${formatInteger(metrics.gameB)}`)
    return parts.join(' · ')||'尚无纪录'
  }
  return '尚无纪录'
}

export function createPersonalRecords({store=getUserDataStore(),now=Date.now}={}) {
  const storage=store.registerNamespace(STORAGE_NAMESPACE,{version:STORAGE_VERSION,defaultValue:DEFAULT_VALUE,validate})
  const mutate=updater=>storage.update(current=>{
    const next=validate(current),before=structuredClone(next)
    if(!next.createdAt)next.createdAt=timestamp(now)
    updater(next,timestamp(now))
    return changed(before,next)?next:undefined
  })

  const recordRoom=id=>{
    if(!cleanId(id))return false
    return mutate((value,at)=>{value.visitedRooms[id]??=at})
  }
  const recordDocument=item=>{
    const id=cleanId(item?.id);if(!id)return false
    const kind=cleanId(item.kind)??'document',sourceId=cleanId(item.sourceId)
    return mutate((value,at)=>{
      const entry=value.documents[id]??={kind,firstViewedAt:at,sources:{}}
      entry.kind=kind;entry.firstViewedAt??=at
      if(sourceId)entry.sources[sourceId]??=at
      value.documents[id]=entry
    })
  }
  const recordObject=item=>{
    const id=cleanId(item?.id),kind=cleanId(item?.kind)??'object';if(!id)return false
    const variant=cleanId(item.variant),typeId=cleanId(item.typeId)??(variant?`${kind}:${variant}`:kind)
    return mutate((value,at)=>{
      // Localised display labels are deliberately not written to new saves.
      // The validator still accepts legacy labels so existing records remain intact.
      value.objects.types[typeId]??={kind,firstViewedAt:at}
      value.objects.instances[id]??={typeId,firstViewedAt:at}
    })
  }
  const recordSnackBag=id=>{
    if(!cleanId(id))return false
    return mutate((value,at)=>{value.mysteries.snackBags.found[id]??=at})
  }
  const recordMysteryDevice=id=>{
    if(!['handheldOctopus','handheldFire'].includes(id))return false
    return mutate((value,at)=>{value.mysteries[id].foundAt??=at})
  }
  const recordGame=(id,{played=true,touchPlayedAt=false,max={},min={},increment={},set={}}={})=>{
    if(!PERSONAL_GAME_CATALOG.some(game=>game.id===id))return false
    return mutate((value,at)=>{
      const entry=value.games[id]??={firstPlayedAt:null,lastPlayedAt:null,metrics:{}}
      if(played){entry.firstPlayedAt??=at;if(touchPlayedAt)entry.lastPlayedAt=at}
      for(const [key,raw] of Object.entries(max)){
        const number=cleanNumber(raw);if(number!=null)entry.metrics[key]=Math.max(entry.metrics[key]??-Infinity,number)
      }
      for(const [key,raw] of Object.entries(min)){
        const number=cleanNumber(raw);if(number!=null)entry.metrics[key]=Math.min(entry.metrics[key]??Infinity,number)
      }
      for(const [key,raw] of Object.entries(increment)){
        const number=cleanNumber(raw);if(number!=null)entry.metrics[key]=(entry.metrics[key]??0)+number
      }
      for(const [key,raw] of Object.entries(set)){
        const number=cleanNumber(raw);if(number!=null)entry.metrics[key]=number
      }
      value.games[id]=entry
    })
  }

  const snapshot=()=>validate(storage.get())
  const importLegacy=({legacyStorage=globalThis.localStorage}={})=>{
    const namespaceData=name=>plainObject(store.readPersistedNamespace?.(name)?.data)
    for(const [id,name] of [['handheldOctopus','handheldOctopus'],['handheldFire','handheldFire']]){
      const scores=plainObject(namespaceData(name).highScores),gameA=cleanNumber(scores.gameA)??0,gameB=cleanNumber(scores.gameB)??0
      if(gameA>0||gameB>0){recordMysteryDevice(id);recordGame(id,{touchPlayedAt:false,max:{gameA,gameB}})}
    }
    const jacks=namespaceData('jacksGame')
    if((jacks.highestStage??0)>0||(jacks.bestStreak??0)>0||(jacks.completions??0)>0)recordGame('jacks',{
      touchPlayedAt:false,max:{highestStage:jacks.highestStage,bestStreak:jacks.bestStreak,completions:jacks.completions},
    })
    try {
      const hopscotch=cleanNumber(legacyStorage?.getItem('4lite.hopscotch.best-cell.v1'))??0
      if(hopscotch>0)recordGame('hopscotch',{touchPlayedAt:false,max:{bestProgress:hopscotch}})
      const shuttlecock=cleanNumber(legacyStorage?.getItem('4lite.shuttlecock.best.v1'))??0
      if(shuttlecock>0)recordGame('shuttlecock',{touchPlayedAt:false,max:{bestStreak:shuttlecock}})
    } catch {/* legacy storage is optional */}
    return snapshot()
  }
  const viewModel=({roomTotal=PERSONAL_RECORD_TOTALS.rooms,bookTotal=PERSONAL_RECORD_TOTALS.books,objectTypeTotal=null}={})=>{
    const value=snapshot()
    const bookKinds=new Set(['textbook','workbook','comic'])
    const bookCount=Object.values(value.documents).filter(item=>bookKinds.has(item.kind)).length
    const compositionCount=Object.values(value.documents).filter(item=>item.kind==='composition').length
    const snackFound=Object.keys(value.mysteries.snackBags.found).length
    const mysteries=[
      {id:'snackBags',label:translateRuntimeText('卜卜星零食'),found:snackFound>=PERSONAL_RECORD_TOTALS.snackBags,progress:snackFound,total:PERSONAL_RECORD_TOTALS.snackBags},
      {id:'handheldOctopus',label:translateRuntimeText('Octopus 掌机'),found:Boolean(value.mysteries.handheldOctopus.foundAt),progress:Number(Boolean(value.mysteries.handheldOctopus.foundAt)),total:1},
      {id:'handheldFire',label:translateRuntimeText('Fire 掌机'),found:Boolean(value.mysteries.handheldFire.foundAt),progress:Number(Boolean(value.mysteries.handheldFire.foundAt)),total:1},
    ]
    const games=PERSONAL_GAME_CATALOG.map(game=>{
      const entry=value.games[game.id]??{firstPlayedAt:null,lastPlayedAt:null,metrics:{}}
      const mystery=mysteries.find(item=>item.id===game.id),hidden=Boolean(mystery&&!mystery.found)
      return {...game,label:translateRuntimeText(hidden?'神秘掌机':game.label),hidden,played:Boolean(entry.firstPlayedAt),record:formatRecord(game.id,entry.metrics),metrics:{...entry.metrics}}
    })
    return {
      totals:{rooms:roomTotal,books:bookTotal,objectTypes:objectTypeTotal,games:PERSONAL_RECORD_TOTALS.games,mysteries:PERSONAL_RECORD_TOTALS.mysteries},
      counts:{rooms:Object.keys(value.visitedRooms).length,books:bookCount,compositions:compositionCount,objectTypes:Object.keys(value.objects.types).length,objectInstances:Object.keys(value.objects.instances).length,games:games.filter(game=>game.played).length,mysteries:mysteries.filter(item=>item.found).length},
      games,mysteries,updatedAt:store.snapshot().updatedAt,persistence:store.snapshot(),
    }
  }

  return {recordRoom,recordDocument,recordObject,recordSnackBag,recordMysteryDevice,recordGame,importLegacy,snapshot,viewModel,clear:()=>storage.clear(),subscribe:storage.subscribe}
}

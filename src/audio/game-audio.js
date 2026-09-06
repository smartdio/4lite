const AUDIO_GROUPS={
  birdChirp:['/assets/audio/birds/sparrow-01.ogg','/assets/audio/birds/sparrow-02.ogg'],
  birdFlutter:['/assets/audio/birds/takeoff.ogg'],
  uiClick:['/assets/audio/ui/click_001.ogg','/assets/audio/ui/click_002.ogg'],
  uiConfirm:['/assets/audio/ui/confirmation_001.ogg','/assets/audio/ui/confirmation_002.ogg'],
  viewSwitch:['/assets/audio/ui/switch_001.ogg','/assets/audio/ui/switch_002.ogg'],
  footsteps:['/assets/audio/footsteps/footstep_concrete_000.ogg'],
  footstepsStairs:['/assets/audio/footsteps/footstep_concrete_000.ogg'],
  footstepsSand:['/assets/audio/footsteps/footstep_grass_003.ogg'],
  doorOpen:['/assets/audio/doors/doorOpen_1.ogg','/assets/audio/doors/doorOpen_2.ogg'],
  doorClose:Array.from({length:3},(_,index)=>`/assets/audio/doors/doorClose_${index+1}.ogg`),
  furniture:['/assets/audio/furniture/creak1.ogg','/assets/audio/furniture/creak2.ogg'],
  chalkWrite:Array.from({length:3},(_,index)=>`/assets/audio/blackboard/cloth${index+1}.ogg`),
  blackboardErase:Array.from({length:3},(_,index)=>`/assets/audio/blackboard/cloth${index+1}.ogg`),
  chalkPickup:['/assets/audio/chalk/tick_001.ogg','/assets/audio/chalk/tick_002.ogg'],
  chalkImpact:Array.from({length:3},(_,index)=>`/assets/audio/chalk/drop_00${index+1}.ogg`),
  basketballPickup:['/assets/audio/basketball/pickup.ogg'],
  basketballThrow:['/assets/audio/basketball/throw.ogg'],
  basketballBounce:['/assets/audio/basketball/bounce.ogg'],
  basketballBackboard:['/assets/audio/basketball/backboard.ogg'],
  basketballRim:['/assets/audio/basketball/rim_01.ogg','/assets/audio/basketball/rim_02.ogg'],
  basketballScore:['/assets/audio/blackboard/cloth1.ogg'],
  pingPongPaddle:['/assets/audio/ping-pong/paddle.ogg'],
  pingPongTable:['/assets/audio/ping-pong/table.ogg'],
  pingPongNet:['/assets/audio/ping-pong/net.ogg'],
  // 降调后作为布包鸡毛毽接触鞋面的短拍击；独立分组便于后续替换专用录音。
  shuttlecockKick:['/assets/audio/ping-pong/paddle.ogg'],
  longJumpTakeoff:['/assets/audio/long-jump/takeoff.ogg'],
  longJumpAir:['/assets/audio/long-jump/air.ogg'],
  longJumpLand:['/assets/audio/long-jump/land.ogg'],
  // 升旗首版使用现有已授权短音作为临时声源；独立分组便于后续无缝替换专用录音。
  flagRopeGrab:['/assets/audio/ui/click_001.ogg','/assets/audio/ui/click_002.ogg'],
  flagRopePull:['/assets/audio/furniture/creak1.ogg','/assets/audio/furniture/creak2.ogg'],
  flagRopeTap:['/assets/audio/chalk/tick_001.ogg','/assets/audio/chalk/tick_002.ogg'],
  flagRaisingComplete:['/assets/audio/ui/confirmation_001.ogg','/assets/audio/ui/confirmation_002.ogg'],
}
const AMBIENT_TRACKS={
  cicadas:'/assets/audio/ambient/blendertimer-cicada.ogg',
  frogs:'/assets/audio/ambient/frogs-singing.ogg',
}
const PRELOAD_URLS=Object.freeze([...new Set([...Object.values(AUDIO_GROUPS).flat(),...Object.values(AMBIENT_TRACKS)])])

const randomItem=items=>items[Math.floor(Math.random()*items.length)]

const isCoarsePointer=()=>Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches||globalThis.navigator?.maxTouchPoints>0)

export function createGameAudio() {
  const AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext
  let context=null,master=null
  const buffers=new Map(),loading=new Map(),lastPlayed=new Map(),ambientLoops=new Map()
  const activeVoices=new Set(),activeByGroup=new Map()
  const maximumVoices=isCoarsePointer()?8:16,maximumVoicesPerGroup=3
  let enabled=Boolean(AudioContextClass),plays=0,failures=0,completed=0,cleaned=0,dropped=0,peakVoices=0

  const ensureContext=()=>{
    if(!context&&AudioContextClass) {
      context=new AudioContextClass();master=context.createGain()
      master.gain.value=.48;master.connect(context.destination)
    }
    return context
  }

  const load=url=>{
    if(!ensureContext())return Promise.resolve(null)
    if(buffers.has(url))return Promise.resolve(buffers.get(url))
    if(loading.has(url))return loading.get(url)
    const promise=fetch(url)
      .then(response=>{
        if(!response.ok)throw new Error(`Unable to load audio: ${url}`)
        return response.arrayBuffer()
      })
      .then(data=>context.decodeAudioData(data))
      .then(buffer=>{buffers.set(url,buffer);loading.delete(url);return buffer})
      .catch(error=>{loading.delete(url);failures++;console.warn(error);return null})
    loading.set(url,promise);return promise
  }

  const unlock=()=>{
    if(!ensureContext())return Promise.resolve(false)
    enabled=true
    return context.state==='suspended'?context.resume().then(()=>true).catch(()=>false):Promise.resolve(true)
  }

  const startVoice=(group,buffer,{volume=1,rate=1,detune=0,pan=0}={})=>{
    const groupVoices=activeByGroup.get(group)??0
    if(activeVoices.size>=maximumVoices||groupVoices>=maximumVoicesPerGroup) {
      dropped++
      return false
    }
    const source=context.createBufferSource(),gain=context.createGain()
    const panner=context.createStereoPanner?.()??null
    const voice={group,source,gain,panner,finished:false}
    const cleanup=()=>{
      if(voice.finished)return
      voice.finished=true
      try{source.disconnect()}catch{}
      try{gain.disconnect()}catch{}
      try{panner?.disconnect()}catch{}
      activeVoices.delete(voice)
      const remaining=(activeByGroup.get(group)??1)-1
      if(remaining>0)activeByGroup.set(group,remaining)
      else activeByGroup.delete(group)
      cleaned++
    }
    source.buffer=buffer;source.playbackRate.value=rate
    if('detune' in source)source.detune.value=detune
    gain.gain.value=volume;source.connect(gain)
    if(panner) {
      panner.pan.value=Math.max(-1,Math.min(1,pan))
      gain.connect(panner);panner.connect(master)
    } else gain.connect(master)
    source.addEventListener('ended',()=>{completed++;cleanup()},{once:true})
    activeVoices.add(voice);activeByGroup.set(group,groupVoices+1)
    peakVoices=Math.max(peakVoices,activeVoices.size)
    try {
      source.start();plays++
      return true
    } catch(error) {
      cleanup();failures++;console.warn(error)
      return false
    }
  }

  const play=(group,{volume=1,rate=1,detune=0,pan=0}={})=>{
    const choices=AUDIO_GROUPS[group]
    if(!enabled||!choices?.length)return false
    const url=randomItem(choices)
    const buffer=buffers.get(url)
    if(buffer&&context?.state==='running')return startVoice(group,buffer,{volume,rate,detune,pan})
    void unlock().then(()=>load(url)).then(loaded=>{
      if(loaded&&context.state!=='closed')startVoice(group,loaded,{volume,rate,detune,pan})
    })
    return true
  }

  // Ambient wildlife must never resume the context or queue a stale sound.
  const playReady=(group,options)=>{
    if(!enabled||context?.state!=='running')return false
    const choices=AUDIO_GROUPS[group]
    if(!choices)return false
    const buffer=buffers.get(randomItem(choices))
    return buffer?startVoice(group,buffer,options):false
  }
  const stopGroup=group=>{
    for(const voice of activeVoices)if(voice.group===group&&!voice.finished)try{voice.source.stop()}catch{}
  }
  const playThrottled=(group,minimumIntervalMs,options)=>{
    const now=performance.now(),previous=lastPlayed.get(group)??-Infinity
    if(now-previous<minimumIntervalMs)return false
    lastPlayed.set(group,now);return play(group,options)
  }

  const playTone=(kind='step',{volume=1}={})=>{
    const start=()=>{
      if(!context||context.state==='closed')return false
      const group='handheldTone',groupVoices=activeByGroup.get(group)??0
      if(activeVoices.size>=maximumVoices||groupVoices>=maximumVoicesPerGroup) { dropped++;return false }
      // OC-22 的 SM5A 直接驱动一位压电片。以下频率取自 32.768kHz
      // 时钟的整数分频，使用断续方波而不是现代游戏式连续扫频。
      const patterns={
        arm:[{at:0,f:683,d:.014,g:.30}],
        step:[{at:0,f:1024,d:.020,g:.72},{at:.027,f:819,d:.012,g:.42}],
        treasure:[{at:0,f:1024,d:.025,g:.72},{at:.038,f:1365,d:.028,g:.82},{at:.079,f:2048,d:.024,g:.72}],
        boat:[{at:0,f:683,d:.030,g:.62},{at:.045,f:819,d:.030,g:.70},{at:.090,f:1024,d:.032,g:.78},{at:.138,f:1365,d:.040,g:.84}],
        bonus:[{at:0,f:1024,d:.025,g:.68},{at:.042,f:1365,d:.025,g:.76},{at:.084,f:2048,d:.050,g:.88},{at:.158,f:2048,d:.050,g:.88}],
        start:[{at:0,f:683,d:.030,g:.58},{at:.048,f:1024,d:.030,g:.68},{at:.096,f:1365,d:.045,g:.80}],
        miss:[{at:0,f:512,d:.040,g:.85},{at:.062,f:410,d:.050,g:.92},{at:.132,f:512,d:.040,g:.82},{at:.194,f:341,d:.085,g:1}],
        gameOver:[{at:0,f:683,d:.055,g:.88},{at:.082,f:512,d:.060,g:.92},{at:.170,f:410,d:.070,g:.96},{at:.268,f:341,d:.085,g:1},{at:.390,f:256,d:.150,g:1}],
        // FR-27 uses a separate terse pulse vocabulary. These remain one-bit
        // piezo patterns, but do not borrow Octopus movement/treasure phrases.
        fireTick:[{at:0,f:819,d:.018,g:.48}],
        fireStep:[{at:0,f:1024,d:.018,g:.62}],
        fireCatch:[{at:0,f:1024,d:.024,g:.72},{at:.034,f:1365,d:.032,g:.82}],
        fireStart:[{at:0,f:683,d:.026,g:.58},{at:.040,f:1024,d:.030,g:.70}],
        fireMiss:[{at:0,f:410,d:.050,g:.90},{at:.070,f:341,d:.075,g:1}],
        fireGameOver:[{at:0,f:512,d:.060,g:.88},{at:.090,f:410,d:.070,g:.94},{at:.190,f:256,d:.140,g:1}],
      }
      const pattern=patterns[kind]??patterns.step,oscillators=[],gains=[]
      const filter=context.createBiquadFilter();filter.type='highpass';filter.frequency.value=260;filter.Q.value=.55;filter.connect(master)
      const voice={group,source:oscillators,gain:gains,panner:null,filter,finished:false}
      const cleanup=()=>{
        if(voice.finished)return
        voice.finished=true
        for(const oscillator of oscillators)try{oscillator.disconnect()}catch{}
        for(const gain of gains)try{gain.disconnect()}catch{}
        try{filter.disconnect()}catch{}
        activeVoices.delete(voice)
        const remaining=(activeByGroup.get(group)??1)-1
        if(remaining>0)activeByGroup.set(group,remaining);else activeByGroup.delete(group)
        cleaned++
      }
      const at=context.currentTime
      try {
        pattern.forEach((pulse,index)=>{
          const oscillator=context.createOscillator(),gain=context.createGain(),begin=at+pulse.at,end=begin+pulse.d
          oscillator.type='square';oscillator.frequency.setValueAtTime(pulse.f,begin)
          gain.gain.setValueAtTime(.0001,begin);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,.075*pulse.g*volume),begin+.0025)
          gain.gain.setValueAtTime(Math.max(.0001,.075*pulse.g*volume),Math.max(begin+.0025,end-.004));gain.gain.exponentialRampToValueAtTime(.0001,end)
          oscillator.connect(gain);gain.connect(filter);oscillators.push(oscillator);gains.push(gain)
          if(index===pattern.length-1)oscillator.addEventListener('ended',()=>{completed++;cleanup()},{once:true})
          oscillator.start(begin);oscillator.stop(end+.006)
        })
        activeVoices.add(voice);activeByGroup.set(group,groupVoices+1);peakVoices=Math.max(peakVoices,activeVoices.size);plays++;return true
      } catch(error) { cleanup();failures++;console.warn(error);return false }
    }
    if(!enabled||!ensureContext())return false
    if(context.state==='running')return start()
    void unlock().then(start);return true
  }

  const startAmbient=(group,{volume=0,rate=1,pan=0}={})=>{
    if(ambientLoops.has(group))return true
    const url=AMBIENT_TRACKS[group]
    if(!enabled||!url)return false
    const start=buffer=>{
      if(!buffer||ambientLoops.has(group)||context?.state==='closed')return false
      const source=context.createBufferSource(),gain=context.createGain()
      const panner=context.createStereoPanner?.()??null
      source.buffer=buffer;source.loop=true;source.playbackRate.value=rate
      gain.gain.value=Math.max(0,volume);source.connect(gain)
      if(panner) {
        panner.pan.value=Math.max(-1,Math.min(1,pan))
        gain.connect(panner);panner.connect(master)
      } else gain.connect(master)
      source.start()
      ambientLoops.set(group,{source,gain,panner,url})
      return true
    }
    const buffer=buffers.get(url)
    if(buffer&&context?.state==='running')return start(buffer)
    void unlock().then(()=>load(url)).then(start)
    return true
  }

  const updateAmbient=(group,{volume=0,pan=0,rampSeconds=.8}={})=>{
    const loop=ambientLoops.get(group)
    if(!loop)return false
    const now=context.currentTime,timeConstant=Math.max(.01,rampSeconds/3)
    loop.gain.gain.cancelScheduledValues(now)
    loop.gain.gain.setTargetAtTime(Math.max(0,volume),now,timeConstant)
    if(loop.panner) {
      loop.panner.pan.cancelScheduledValues(now)
      loop.panner.pan.setTargetAtTime(Math.max(-1,Math.min(1,pan)),now,timeConstant)
    }
    return true
  }

  const preload=()=>Promise.all(PRELOAD_URLS.map(load)).then(results=>{
    if(results.some(buffer=>!buffer))throw new Error('常用音效加载或解码失败')
    return true
  })

  return {
    unlock,preload,play,playReady,stopGroup,playThrottled,playTone,startAmbient,updateAmbient,
    snapshot:()=>({
      supported:Boolean(context),enabled,state:context?.state??'unsupported',plays,failures,
      decoded:buffers.size,expectedDecoded:PRELOAD_URLS.length,preloadUrls:[...PRELOAD_URLS],loading:loading.size,groups:Object.keys(AUDIO_GROUPS),
      activeVoices:activeVoices.size,peakVoices,completed,cleaned,dropped,
      activeByGroup:Object.fromEntries(activeByGroup),limits:{global:maximumVoices,perGroup:maximumVoicesPerGroup},
      ambient:Object.fromEntries([...ambientLoops].map(([group,loop])=>[group,{url:loop.url,volume:+loop.gain.gain.value.toFixed(4),pan:+(loop.panner?.pan.value??0).toFixed(4)}])),
    }),
  }
}

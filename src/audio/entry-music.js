const ENTRY_MUSIC_URL='/assets/audio/music/afternoon-in-the-schoolyard.ogg'

export function createEntryMusic({
  url=ENTRY_MUSIC_URL,
  volume=.34,
  onStateChange=()=>{},
}={}) {
  if(typeof Audio==='undefined') {
    const snapshot=()=>({supported:false,playing:false,desired:false,blocked:false,url})
    onStateChange(snapshot())
    return {play:()=>Promise.resolve(false),playIfWanted:()=>Promise.resolve(false),pause:()=>{},toggle:()=>Promise.resolve(false),fadeOut:()=>{},snapshot,refresh:()=>onStateChange(snapshot()),whenReady:()=>Promise.resolve(false)}
  }

  const audio=new Audio(url)
  audio.loop=true
  audio.preload='auto'
  audio.volume=volume
  const readyPromise=audio.readyState>=HTMLMediaElement.HAVE_ENOUGH_DATA
    ?Promise.resolve(true)
    :new Promise(resolve=>{
      audio.addEventListener('canplaythrough',()=>resolve(true),{once:true})
      audio.addEventListener('error',()=>resolve(false),{once:true})
    })
  let desired=true
  let blocked=false
  let fadeFrame=0

  const snapshot=()=>({
    supported:true,
    playing:!audio.paused,
    desired,
    blocked,
    url,
    currentTime:Number.isFinite(audio.currentTime)?+audio.currentTime.toFixed(2):0,
  })
  const notify=()=>onStateChange(snapshot())
  const cancelFade=()=>{
    if(!fadeFrame)return
    cancelAnimationFrame(fadeFrame)
    fadeFrame=0
  }
  const play=()=>{
    desired=true
    cancelFade()
    audio.volume=volume
    const result=audio.play()
    if(!result?.then) {
      blocked=false
      notify()
      return Promise.resolve(true)
    }
    return result.then(()=>{
      blocked=false
      notify()
      return true
    }).catch(error=>{
      blocked=error?.name==='NotAllowedError'
      if(!blocked)console.warn(`Unable to play entry music: ${url}`,error)
      notify()
      return false
    })
  }
  const playIfWanted=()=>desired?play():Promise.resolve(false)
  const pause=()=>{
    desired=false
    blocked=false
    cancelFade()
    audio.pause()
    audio.volume=volume
    notify()
  }
  const toggle=()=>audio.paused?play():(pause(),Promise.resolve(false))
  const fadeOut=(durationMs=900)=>{
    desired=false
    blocked=false
    cancelFade()
    if(audio.paused) {
      audio.currentTime=0
      audio.volume=volume
      notify()
      return
    }
    const startedAt=performance.now()
    const startedVolume=audio.volume
    const step=now=>{
      const progress=Math.min(1,(now-startedAt)/durationMs)
      audio.volume=startedVolume*(1-progress)
      if(progress<1) {
        fadeFrame=requestAnimationFrame(step)
        return
      }
      fadeFrame=0
      audio.pause()
      audio.currentTime=0
      audio.volume=volume
      notify()
    }
    fadeFrame=requestAnimationFrame(step)
  }

  audio.addEventListener('play',notify)
  audio.addEventListener('pause',notify)
  audio.addEventListener('error',notify)
  notify()
  return {play,playIfWanted,pause,toggle,fadeOut,snapshot,refresh:notify,whenReady:()=>readyPromise}
}

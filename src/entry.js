import entranceBackgroundUrl from '../assets/ui/entrance-campus-watercolor-v01.webp'
import entranceMobileBackgroundUrl from '../assets/ui/entrance-campus-watercolor-mobile-v01.webp'
import approvedLogoUrl from '../assets/branding/4lite-logo-approved.svg'
import { createEntryMusic } from './audio/entry-music.js'
import { bindSiteFooterQrCards } from './site-links.js'
import {t} from './i18n/index.js'
import {renderEntryShell} from './ui/entry-shell.js'
import './style.css'

window.__4LITE_ENTRY_ASSETS__ = {
  entranceBackgroundUrl,
  entranceMobileBackgroundUrl,
  approvedLogoUrl,
}

document.documentElement.style.setProperty('--entrance-image', `url('${entranceBackgroundUrl}')`)
document.documentElement.style.setProperty('--entrance-mobile-image', `url('${entranceMobileBackgroundUrl}')`)
document.documentElement.classList.add('entry-visual-loading')

const app = document.querySelector('#app')
app.dataset.loadingLabel=t('loading.visual')
app.innerHTML = renderEntryShell({approvedLogoUrl})

bindSiteFooterQrCards()

const revealEntryWhenVisualsAreReady = async () => {
  const selectedBackgroundUrl = matchMedia('(max-width: 760px)').matches
    ? entranceMobileBackgroundUrl
    : entranceBackgroundUrl
  const background = new Image()
  background.fetchPriority = 'high'
  background.src = selectedBackgroundUrl
  const logo = document.querySelector('.entry-logo')
  const decode = image => image.decode?.().catch(() => {}) ?? Promise.resolve()
  const visualReady = Promise.all([
    background.complete ? decode(background) : new Promise(resolve => {
      background.addEventListener('load', () => void decode(background).then(resolve), { once: true })
      background.addEventListener('error', resolve, { once: true })
    }),
    logo.complete ? decode(logo) : new Promise(resolve => {
      logo.addEventListener('load', () => void decode(logo).then(resolve), { once: true })
      logo.addEventListener('error', resolve, { once: true })
    }),
  ])
  await Promise.race([
    visualReady,
    new Promise(resolve => setTimeout(resolve, 45000)),
  ])
  document.documentElement.classList.remove('entry-visual-loading')
  document.documentElement.classList.add('entry-visual-ready')
}

const updateEntryMusicButton = state => {
  const button = document.querySelector('#entry-music-toggle')
  if (!button) return
  button.hidden = !state.supported
  button.dataset.state = state.playing ? 'playing' : state.blocked ? 'blocked' : 'paused'
  button.setAttribute('aria-pressed', String(state.playing))
  button.setAttribute('aria-label', state.playing ? t('entry.musicPauseAria') : t('entry.musicPlayAria'))
  button.querySelector('span').textContent = state.playing ? t('entry.musicOn') : t('entry.musicOff')
}
const entryMusic = createEntryMusic({ onStateChange: updateEntryMusicButton })
window.__4LITE_ENTRY_MUSIC__ = entryMusic
document.querySelector('#entry-music-toggle').addEventListener('click', () => void entryMusic.toggle())
void entryMusic.play()
void revealEntryWhenVisualsAreReady()

if (import.meta.env.VITE_ENABLE_TEST_API) {
  void import('./main.js')
} else {
  const enterButton = document.querySelector('#enter-campus')
  enterButton.addEventListener('click', async () => {
    enterButton.disabled = true
    enterButton.querySelector('span').textContent = t('entry.entering')
    document.querySelector('#entry-copy').innerHTML = t('entry.enteringCopy')
    window.__4LITE_AUTO_ENTER__ = true
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    try {
      await import('./main.js')
    } catch (error) {
      console.error('游戏主程序载入失败', error)
      app.innerHTML = `<div class="experience-gate"><p class="entry-load-error">${t('entry.loadError')}</p></div>`
    }
  }, { once: true })
}

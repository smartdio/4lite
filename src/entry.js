import entranceBackgroundUrl from '../assets/ui/entrance-campus-watercolor-v01.webp'
import entranceMobileBackgroundUrl from '../assets/ui/entrance-campus-watercolor-mobile-v01.webp'
import approvedLogoUrl from '../assets/branding/4lite-logo-approved.svg'
import { createEntryMusic } from './audio/entry-music.js'
import { bindSiteFooterQrCards, renderSiteFooterLinks } from './site-links.js'
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
app.innerHTML = `
  <div class="experience-gate" id="experience-gate">
    <section class="entry-screen" id="entry-screen" aria-label="四小">
      <div class="entry-wash"></div>
      <div class="entry-content">
        <img class="entry-logo" src="${approvedLogoUrl}" alt="四小" width="1774" height="887" />
        <p class="entry-copy" id="entry-copy">风从走廊那边吹过来。<br>回去看看，那年的校园。</p>
        <button class="entry-primary" id="enter-campus" type="button">
          <span>回到那年夏天</span><i aria-hidden="true">→</i>
        </button>
        <div class="entry-secondary-actions">
          <button class="entry-music-toggle" id="entry-music-toggle" type="button" aria-pressed="false">
            <i aria-hidden="true">♪</i><span>开启音乐</span>
          </button>
          <span class="entry-secondary-rule" aria-hidden="true"></span>
          <nav class="entry-links" aria-label="项目说明">
            <a href="./about/">关于</a><a href="./help/">帮助</a>
          </nav>
        </div>
        <p class="entry-footnote">建议佩戴耳机 · 点击后载入校园</p>
      </div>
      <footer class="entry-media-footer">${renderSiteFooterLinks()}</footer>
    </section>
  </div>`

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
  button.setAttribute('aria-label', state.playing ? '暂停背景音乐' : '播放背景音乐')
  button.querySelector('span').textContent = state.playing ? '音乐开启' : '开启音乐'
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
    enterButton.querySelector('span').textContent = '正在走回校园……'
    document.querySelector('#entry-copy').innerHTML = '旧课桌、走廊和树影正在醒来。<br>第一次进入需要一点时间。'
    window.__4LITE_AUTO_ENTER__ = true
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    try {
      await import('./main.js')
    } catch (error) {
      console.error('游戏主程序载入失败', error)
      app.innerHTML = '<div class="experience-gate"><p class="entry-load-error">校园暂时没有载入成功，请刷新页面后重试。</p></div>'
    }
  }, { once: true })
}

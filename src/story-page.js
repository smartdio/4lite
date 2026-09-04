import approvedLogoUrl from '../assets/branding/4lite-logo-approved.svg'
import entranceBackgroundUrl from '../assets/ui/entrance-campus-watercolor-v01.webp'
import entranceMobileBackgroundUrl from '../assets/ui/entrance-campus-watercolor-mobile-v01.webp'
import {hydrateSiteLinks} from './site-links.js'
import {bindLocalePreferenceLinks,rememberDocumentLocale} from './i18n/locale-preference.js'
import './story-page.css'

rememberDocumentLocale()
bindLocalePreferenceLinks()

document.documentElement.style.setProperty('--story-hero-image',`url('${entranceBackgroundUrl}')`)
document.documentElement.style.setProperty('--story-hero-mobile-image',`url('${entranceMobileBackgroundUrl}')`)

document.querySelectorAll('[data-project-logo]').forEach(image=>{
  image.src=approvedLogoUrl
})

hydrateSiteLinks()

const progress=document.createElement('div')
progress.className='story-reading-progress'
progress.setAttribute('aria-hidden','true')
document.body.append(progress)

const updateProgress=()=>{
  const available=document.documentElement.scrollHeight-window.innerHeight
  const ratio=available>0?Math.min(1,Math.max(0,window.scrollY/available)):0
  progress.style.transform=`scaleX(${ratio})`
}

window.addEventListener('scroll',updateProgress,{passive:true})
window.addEventListener('resize',updateProgress)
updateProgress()
requestAnimationFrame(()=>document.documentElement.classList.add('story-ready'))

import approvedLogoUrl from '../assets/branding/4lite-logo-approved.svg'
import entranceBackgroundUrl from '../assets/ui/entrance-campus-watercolor-v01.webp'
import entranceMobileBackgroundUrl from '../assets/ui/entrance-campus-watercolor-mobile-v01.webp'
import { hydrateSiteLinks } from './site-links.js'
import './info-page.css'

document.documentElement.style.setProperty('--info-hero-image', `url('${entranceBackgroundUrl}')`)
document.documentElement.style.setProperty('--info-hero-mobile-image', `url('${entranceMobileBackgroundUrl}')`)

document.querySelectorAll('[data-project-logo]').forEach(image => {
  image.src = approvedLogoUrl
})

hydrateSiteLinks()

requestAnimationFrame(() => document.documentElement.classList.add('info-ready'))

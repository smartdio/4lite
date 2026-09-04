import {alternateLocalePath,currentLocale,getMessages,localizedPath,t} from '../i18n/index.js'
import {renderSiteFooterLinks} from '../site-links.js'

export function renderEntryShell({approvedLogoUrl,includeLoading=false}={}){
  const copy=getMessages(),[tipTitle,tipText]=copy.loading.tips[0]
  const alternateLocale=currentLocale==='en'?'zh-CN':'en'
  return `
  <div class="experience-gate" id="experience-gate">
    <section class="entry-screen" id="entry-screen" aria-label="${t('entry.aria')}">
      <div class="entry-wash"></div>
      <div class="entry-content">
        <p class="entry-romanization">${t('brand.romanization')}</p>
        <img class="entry-logo" src="${approvedLogoUrl}" alt="${t('entry.aria')}" width="1774" height="887" />
        <div class="entry-brand-caption" aria-label="${t('brand.translation')}">
          <span>${t('brand.translation')}</span>
        </div>
        <p class="entry-copy" id="entry-copy">${t('entry.copy')}</p>
        <button class="entry-primary" id="enter-campus" type="button">
          <span>${t('entry.enter')}</span><i aria-hidden="true">→</i>
        </button>
        <div class="entry-secondary-actions">
          <button class="entry-music-toggle" id="entry-music-toggle" type="button" aria-pressed="false">
            <i aria-hidden="true">♪</i><span>${t('entry.musicOff')}</span>
          </button>
          <span class="entry-secondary-rule" aria-hidden="true"></span>
          <nav class="entry-links" aria-label="${t('entry.linksAria')}">
            <a href="${localizedPath('about')}">${t('entry.about')}</a><a href="${localizedPath('help')}">${t('entry.help')}</a><a class="entry-language" href="${alternateLocalePath()}" data-locale-choice="${alternateLocale}" aria-label="${t('language.switchAria')}">${t('language.switchText')}</a>
          </nav>
        </div>
        <p class="entry-footnote">${t('entry.footnote')}</p>
      </div>
      <footer class="entry-media-footer">${renderSiteFooterLinks()}</footer>
    </section>
    ${includeLoading?`<section class="loading-screen" id="loading-screen" aria-live="polite" aria-hidden="true">
      <div class="loading-card">
        <p class="loading-eyebrow">${t('loading.eyebrow')}</p>
        <h1 id="loading-tip-title">${tipTitle}</h1>
        <p class="loading-tip-text" id="loading-tip-text">${tipText}</p>
        <p class="loading-message" id="loading-message">${copy.loading.messages[0]}</p>
        <div class="loading-rule" aria-hidden="true"><i id="loading-bar"></i></div>
        <div class="loading-meta"><span id="loading-count">${t('loading.preparing',{completed:0,total:'…'})}</span><strong id="loading-percent">0%</strong></div>
        <button class="loading-retry" id="loading-retry" type="button" hidden>${t('loading.retry')}</button>
      </div>
    </section>`:''}
  </div>`
}

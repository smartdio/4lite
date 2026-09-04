export const LOCALE_PREFERENCE_KEY='4lite.locale.v1'

export const normalizeLocale=value=>{
  if(typeof value!=='string')return null
  const normalized=value.trim().toLowerCase()
  if(normalized==='en'||normalized.startsWith('en-'))return'en'
  if(normalized==='zh-cn'||normalized==='zh'||normalized.startsWith('zh-'))return'zh-CN'
  return null
}

export const detectBrowserLocale=(languages=globalThis.navigator?.languages)=>{
  const preferredLanguage=Array.isArray(languages)&&languages.length
    ? languages[0]
    : globalThis.navigator?.language
  return String(preferredLanguage??'').toLowerCase().split('-')[0]==='zh'?'zh-CN':'en'
}

export const readLocalePreference=(storage=globalThis.localStorage)=>{
  try{return normalizeLocale(storage?.getItem(LOCALE_PREFERENCE_KEY))}
  catch{return null}
}

export const rememberLocalePreference=(locale,storage=globalThis.localStorage)=>{
  const normalized=normalizeLocale(locale)
  if(!normalized)return false
  try{storage?.setItem(LOCALE_PREFERENCE_KEY,normalized);return true}
  catch{return false}
}

export function initialLocaleRedirect({
  pathname=globalThis.location?.pathname??'/',
  search=globalThis.location?.search??'',
  hash=globalThis.location?.hash??'',
  storage=globalThis.localStorage,
  languages=globalThis.navigator?.languages,
}={}){
  if(pathname!=='/'&&pathname!=='/index.html')return null
  const preferred=readLocalePreference(storage)??detectBrowserLocale(languages)
  return preferred==='en'?`/en/${search}${hash}`:null
}

const localePreferenceRoots=new WeakSet()

export function bindLocalePreferenceLinks(root=globalThis.document,storage=globalThis.localStorage){
  if(!root?.addEventListener||localePreferenceRoots.has(root))return
  localePreferenceRoots.add(root)
  root.addEventListener('click',event=>{
    const link=event.target?.closest?.('[data-locale-choice],a[lang]')
    if(!link)return
    const locale=normalizeLocale(link.dataset.localeChoice||link.getAttribute('lang'))
    if(locale)rememberLocalePreference(locale,storage)
  },{capture:true})
}

export const rememberDocumentLocale=(root=globalThis.document,storage=globalThis.localStorage)=>{
  const locale=normalizeLocale(root?.documentElement?.lang)
  if(locale)rememberLocalePreference(locale,storage)
  return locale
}

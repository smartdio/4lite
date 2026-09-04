import {expect,test} from '@playwright/test'

test('entry visuals do not wait for music buffering',async({page})=>{
  let audioRequested=false
  let releaseAudio
  await page.route('**/afternoon-in-the-schoolyard.ogg',route=>{
    audioRequested=true
    return new Promise(resolve=>{
      releaseAudio=()=>{void route.continue();resolve()}
    })
  })

  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect.poll(()=>audioRequested,{timeout:5000}).toBe(true)
  await expect(page.locator('html')).toHaveClass(/entry-visual-ready/,{timeout:3000})
  expect(releaseAudio).toBeTruthy()
  releaseAudio()
})

test('entry omits the story link while about, help and standalone story pages remain available',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('link',{name:'故事'})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'关于'})).toHaveAttribute('href','./about/')
  await expect(page.getByRole('link',{name:'帮助'})).toHaveAttribute('href','./help/')
  await expect(page.getByRole('navigation',{name:'媒体账号与项目链接'}).getByRole('link',{name:'GitHub'})).toHaveAttribute('href','https://github.com/smartdio/4lite')
  await expect(page.getByRole('navigation',{name:'媒体账号与项目链接'}).getByRole('link',{name:'Vercel'})).toHaveAttribute('href','https://4lite.vercel.app')

  await page.goto('/stories/',{waitUntil:'networkidle'})
  await expect(page).toHaveTitle('四小故事 · 四小 4Lite')
  await expect(page.getByRole('heading',{name:'四小故事'})).toBeVisible()
  await expect(page.getByRole('link',{name:'开始阅读'})).toHaveAttribute('href','/stories/from-memory-to-campus/')

  await page.goto('/stories/from-memory-to-campus/chapters/28-slingshot/',{waitUntil:'networkidle'})
  await expect(page.getByRole('heading',{name:'二十八、两把旧弹弓怎样变成一处自然游乐角'}).first()).toBeVisible()
  await expect(page.getByRole('heading',{name:'待发布'})).toBeVisible()
  await expect(page.getByText(/这一章还没有正式发布/).first()).toBeVisible()
  await expect(page.getByRole('link',{name:'English'})).toHaveAttribute('href','/stories/from-memory-to-campus/en/chapters/28-slingshot/')
  expect(await page.locator('canvas').count()).toBe(0)

  await page.goto('/about/',{waitUntil:'networkidle'})
  await expect(page).toHaveTitle('关于 · 四小 4Lite')
  await expect(page.getByRole('heading',{name:/一座从记忆里/})).toBeVisible()
  await expect(page.locator('.media-link-list a[href="https://github.com/smartdio/4lite"]')).toBeVisible()
  await expect(page.locator('.media-link-list a[href="https://4lite.vercel.app"]')).toBeVisible()
  expect(await page.locator('canvas').count()).toBe(0)

  await page.goto('/help/',{waitUntil:'networkidle'})
  await expect(page).toHaveTitle('帮助 · 四小 4Lite')
  await expect(page.getByRole('heading',{name:/沿着走廊和树影/})).toBeVisible()
  await expect(page.getByRole('heading',{name:'熟悉哪一种，就用哪一种'})).toBeVisible()
  await expect(page.getByText(/绿色标记出现时点击或轻触/)).toBeVisible()
  await expect(page.getByText(/按住 W、A、S、D 或方向键时/)).toBeVisible()
  await expect(page.getByRole('contentinfo').getByRole('link',{name:'视频号 Mo麥AI'})).toBeVisible()
  expect(await page.locator('canvas').count()).toBe(0)
})

test('wechat channels footer opens the Mo麥AI QR card',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  const trigger=page.getByRole('navigation',{name:'媒体账号与项目链接'}).getByRole('link',{name:'视频号 Mo麥AI'})
  const card=trigger.locator('.site-qr-card')
  await expect(card.locator('img')).toHaveAttribute('alt','视频号 Mo麥AI 二维码')

  await trigger.click()
  await page.mouse.move(10,10)
  await expect(trigger).toHaveAttribute('aria-expanded','true')
  await expect(card).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('aria-expanded','false')
  await expect(card).toBeHidden()
})

test('Chinese and English entry routes share the Sì Xiǎo brand while localising navigation',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN')
  await expect(page.locator('.entry-romanization')).toHaveText('Sì Xiǎo')
  await expect(page.locator('.entry-brand-caption span')).toHaveText('No. 4 Primary School')
  await expect(page.getByRole('link',{name:'Switch to English'})).toHaveAttribute('href','/en/')
  const romanizationBox=await page.locator('.entry-romanization').boundingBox()
  const logoBox=await page.locator('.entry-logo').boundingBox()
  const languageBox=await page.locator('.entry-language').boundingBox()
  expect(romanizationBox).toBeTruthy()
  expect(logoBox).toBeTruthy()
  expect(languageBox).toBeTruthy()
  expect(romanizationBox.y).toBeLessThan(logoBox.y)
  await expect(page.locator('.entry-secondary-actions .entry-language')).toBeVisible()

  await page.goto('/en/',{waitUntil:'domcontentloaded'})
  await expect(page.locator('html')).toHaveAttribute('lang','en')
  await expect(page).toHaveTitle('Sì Xiǎo · 4Lite')
  await expect(page.locator('.entry-logo')).toHaveAttribute('alt','Sì Xiǎo')
  await expect(page.locator('.entry-romanization')).toHaveText('Sì Xiǎo')
  await expect(page.locator('.entry-brand-caption span')).toHaveText('No. 4 Primary School')
  await expect(page.getByRole('button',{name:'Return to That Summer'})).toBeVisible()
  await expect(page.getByRole('link',{name:'切换到中文'})).toHaveAttribute('href','/')
  await expect(page.getByRole('link',{name:'Story'})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'About'})).toHaveAttribute('href','/en/about/')
  await expect(page.getByRole('link',{name:'Guide'})).toHaveAttribute('href','/en/help/')
  await expect(page.getByRole('navigation',{name:'Social media and project links'}).getByRole('link',{name:'WeChat Channels · Mo麥AI'})).toBeVisible()
})

test('root entry detects browser language once and remembers a manual override',async({browser})=>{
  const context=await browser.newContext({locale:'en-US'})
  const page=await context.newPage()
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page).toHaveURL(/\/en\/$/)
  await expect(page.locator('html')).toHaveAttribute('lang','en')

  await page.getByRole('link',{name:'切换到中文'}).click()
  await expect.poll(()=>new URL(page.url()).pathname).toBe('/')
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN')
  await page.reload({waitUntil:'domcontentloaded'})
  await expect.poll(()=>new URL(page.url()).pathname).toBe('/')
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN')
  expect(await page.evaluate(()=>localStorage.getItem('4lite.locale.v1'))).toBe('zh-CN')
  await context.close()
})

test('English about and guide pages expose English metadata and return links',async({page})=>{
  await page.goto('/en/about/',{waitUntil:'networkidle'})
  await expect(page.locator('html')).toHaveAttribute('lang','en')
  await expect(page).toHaveTitle('About · Sì Xiǎo · 4Lite')
  await expect(page.getByRole('heading',{name:/A school finding its way back from memory/})).toBeVisible()
  await expect(page.getByRole('link',{name:'中文'})).toHaveAttribute('href','../../about/')
  await expect(page.getByRole('link',{name:'Story'})).toHaveAttribute('href','../../stories/from-memory-to-campus/en/')
  expect(await page.locator('canvas').count()).toBe(0)

  await page.goto('/en/help/',{waitUntil:'networkidle'})
  await expect(page.locator('html')).toHaveAttribute('lang','en')
  await expect(page).toHaveTitle('Guide · Sì Xiǎo · 4Lite')
  await expect(page.getByRole('heading',{name:/Walk slowly through corridors and shade/})).toBeVisible()
  await expect(page.getByRole('link',{name:'中文'})).toHaveAttribute('href','../../help/')
  await expect(page.getByRole('heading',{name:'Use whichever way feels familiar'})).toBeVisible()
  expect(await page.locator('canvas').count()).toBe(0)
})

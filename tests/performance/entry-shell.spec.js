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

test('entry links open standalone stories, about and help pages',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('link',{name:'故事'})).toHaveAttribute('href','./stories/')
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
  await expect(page.getByText(/两件合计从约 60.7 MB 降到不足 1 MB/)).toBeVisible()
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

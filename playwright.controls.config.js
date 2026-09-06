import {defineConfig} from '@playwright/test'

// 使用普通开发入口：build:test 会跳过鼠标锁定，无法验证真实漫游输入。
const port=Number(process.env.PLAYWRIGHT_PORT||6186)
const baseURL=`http://127.0.0.1:${port}`
export default defineConfig({
  testDir:'./tests/controls',timeout:120000,workers:1,
  expect:{timeout:15000},reporter:'line',
  use:{baseURL,browserName:'chromium',channel:process.env.CI?undefined:'chrome',headless:true,
    viewport:{width:1280,height:720},locale:'zh-CN',reducedMotion:'reduce',trace:'retain-on-failure'},
  outputDir:'test-results/controls',
  webServer:{command:`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port}`,url:baseURL,reuseExistingServer:false},
})

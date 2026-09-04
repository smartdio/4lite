import {defineConfig} from '@playwright/test'

const port=Number(process.env.PLAYWRIGHT_PORT||6176)
const baseURL=`http://127.0.0.1:${port}`

export default defineConfig({
  testDir:'./tests/performance',
  timeout:180000,
  expect:{timeout:15000,toHaveScreenshot:{maxDiffPixelRatio:.008,animations:'disabled'}},
  fullyParallel:false,
  workers:1,
  reporter:[['line'],['html',{open:'never',outputFolder:'test-results/html'}]],
  snapshotPathTemplate:'{testDir}/baselines/{arg}{ext}',
  outputDir:'test-results/artifacts',
  use:{
    baseURL,
    browserName:'chromium',channel:process.env.CI?undefined:'chrome',headless:true,
    viewport:{width:1280,height:720},deviceScaleFactor:1,
    locale:'zh-CN',
    colorScheme:'light',reducedMotion:'reduce',
    screenshot:'only-on-failure',trace:'retain-on-failure',
  },
  webServer:{
    command:`npm run preview -- --port ${port}`,url:baseURL,
    reuseExistingServer:false,timeout:30000,
  },
})

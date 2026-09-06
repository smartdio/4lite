import {defineConfig} from '@playwright/test'

// Opt-in authoring tests. This preview is deliberately not a production entry.
export default defineConfig({
  testDir:'./tests/previews',testMatch:'birds.spec.js',workers:1,timeout:30000,
  reporter:'list',outputDir:'test-results/birds',
  use:{baseURL:'http://127.0.0.1:6184',headless:true,viewport:{width:1280,height:720}},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 6184',url:'http://127.0.0.1:6184',reuseExistingServer:false},
})

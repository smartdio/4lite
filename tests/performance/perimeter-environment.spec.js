import {expect,test} from '@playwright/test'

test('the wall-side shop is a dedicated box with a visible triangular roof',async({page})=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  const environment=await page.evaluate(()=>window.__CAMPUS_TEST__.perimeterEnvironment())
  expect(environment).toMatchObject({
    textures:3,drawCallsFirstPerson:12,drawCallsAerial:2,treeCards:53,
    wallSideShop:{
      center:[24.55,-9.35],size:[4.8,3.7,4],wallFaceZ:-11.36,roadNorthZ:.5,
      roof:{size:[5.4,4.6],geometrySize:[5.4,4.6],baseY:3.7,rise:1.6,rotationY:0},
      drawCalls:2,externalRequests:0,confidence:'A/C',
    },
  })
  const shop=environment.wallSideShop
  expect(shop.center[1]-shop.size[2]/2).toBeCloseTo(shop.wallFaceZ+.01,5)
  expect(shop.center[1]+shop.size[2]/2).toBeLessThan(shop.roadNorthZ)
})

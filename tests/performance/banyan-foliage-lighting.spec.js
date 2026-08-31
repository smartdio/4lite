import {expect,test} from '@playwright/test'

const ready=async page=>{
  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  await page.locator('#enter-campus').click()
  await page.locator('#experience-gate').waitFor({state:'hidden',timeout:30000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
}

test('banyan foliage candidates reuse the formal leaf material and preserve global lighting',async({page})=>{
  await ready(page)
  const globalBefore=await page.evaluate(()=>window.__CAMPUS_TEST__.lighting())

  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.banyanFoliageLighting())).toMatchObject({
    candidate:'A2',formalCandidate:'A2',available:['A0','A1','A2'],colorMultiplier:[1.12,1.18,1.08],
    roughness:.62,specularIntensity:.4,emissiveIntensity:.06,
    materials:1,meshes:1,textures:1,receivesShadow:true,castsShadow:true,
    actual:{color:[1.12,1.18,1.08],roughness:.62,specularIntensity:.4,emissiveIntensity:.06},
  })
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setBanyanFoliageLighting('A0'))).toMatchObject({
    candidate:'A0',colorMultiplier:[1,1,1],roughness:.92,specularIntensity:.1,emissiveIntensity:0,
    materials:1,meshes:1,textures:1,
    actual:{color:[1,1,1],roughness:.92,specularIntensity:.1,emissiveIntensity:0},
  })
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setBanyanFoliageLighting('A1'))).toMatchObject({
    candidate:'A1',colorMultiplier:[1,1,1],roughness:.68,specularIntensity:.3,emissiveIntensity:0,
    materials:1,meshes:1,textures:1,
    actual:{color:[1,1,1],roughness:.68,specularIntensity:.3,emissiveIntensity:0},
  })
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setBanyanFoliageLighting('A2'))).toMatchObject({
    candidate:'A2',materials:1,textures:1,
  })
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.setBanyanFoliageLighting('unknown'))).toBeNull()
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.lighting())).toEqual(globalBefore)
})

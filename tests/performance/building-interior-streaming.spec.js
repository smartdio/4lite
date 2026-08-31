import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('experimental classroom detail roots activate only the occupied or nearby room',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__)

  const result=await page.evaluate(async()=>{
    const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    const ids=window.__CAMPUS_TEST__.classroomSeating().ids
    const snapshots={}
    for(const prefix of ['b1-','b2-']) {
      const id=ids.find(value=>value.startsWith(prefix)&&value.includes('student-stool'))
      window.__CAMPUS_TEST__.sitClassroomSeat(id)
      await settle()
      snapshots[prefix]=window.__CAMPUS_TEST__.buildingInteriorStreaming()
      window.__CAMPUS_TEST__.leaveClassroomSeat()
    }
    window.__CAMPUS_TEST__.applyFixedCamera('courtyard')
    await settle()
    snapshots.outdoor=window.__CAMPUS_TEST__.buildingInteriorStreaming()
    const classroom=ids.find(value=>value.startsWith('b2-')&&value.includes('student-stool'))
      .replace(/-row-\d+-column-\d+-seat-(left|right)-student-stool$/,'')
    snapshots.near=window.__CAMPUS_TEST__.focusClassroomDoor(classroom,2.9)
    snapshots.nearState=window.__CAMPUS_TEST__.buildingInteriorStreaming()
    snapshots.hysteresis=window.__CAMPUS_TEST__.focusClassroomDoor(classroom,4)
    snapshots.hysteresisState=window.__CAMPUS_TEST__.buildingInteriorStreaming()
    snapshots.far=window.__CAMPUS_TEST__.focusClassroomDoor(classroom,4.4)
    snapshots.farState=window.__CAMPUS_TEST__.buildingInteriorStreaming()
    return snapshots
  })

  expect(result['b1-'].activeRooms).toHaveLength(1)
  expect(result['b1-'].activeRooms[0]).toMatch(/^b1-/)
  expect(result['b1-'].lod.visible).toBe(false)
  expect(result['b1-'].roots).toMatchObject({building1:{visibleRooms:1},building2:{visibleRooms:0}})
  expect(result['b2-'].activeRooms).toHaveLength(1)
  expect(result['b2-'].activeRooms[0]).toMatch(/^b2-/)
  expect(result['b2-'].lod.visible).toBe(false)
  expect(result['b2-'].roots).toMatchObject({building1:{visibleRooms:0},building2:{visibleRooms:1}})
  expect(result.outdoor).toMatchObject({
    enabled:true,activeRooms:[],
    lod:{visible:true,studentDesks:582,teacherDesks:22,blackboards:48,b2WhiteWallShells:12,drawObjects:5},
    roots:{building1:{visibleRooms:0},building2:{visibleRooms:0}},
  })
  expect(result.nearState.activeRooms).toContain(result.near.classroom)
  expect(result.nearState.lod.visible).toBe(true)
  expect(result.hysteresisState.activeRooms).toContain(result.hysteresis.classroom)
  expect(result.farState.activeRooms).not.toContain(result.far.classroom)
})

test('full scene comparison records per-room detail savings',async({page},testInfo)=>{
  const measure=async enabled=>{
    await page.goto(enabled ? '/' : '/?interiorStreaming=off',{waitUntil:'networkidle'})
    await page.locator('#enter-campus').click()
    await page.waitForFunction(()=>window.__CAMPUS_TEST__?.loadingState().fullReady,null,{timeout:30000})
    return page.evaluate(async()=>{
      const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
      const snapshot=()=>{
        const value=window.__CAMPUS_TEST__.performanceSnapshot()
        return {calls:value.renderer.render.calls,triangles:value.renderer.render.triangles,textures:value.renderer.memory.textures}
      }
      const ids=window.__CAMPUS_TEST__.classroomSeating().ids
      const result={}
      window.__CAMPUS_TEST__.applyFixedCamera('mainField');await settle();result.outdoor=snapshot()
      for(const prefix of ['b1-','b2-']) {
        const id=ids.find(value=>value.startsWith(prefix)&&value.includes('student-stool'))
        window.__CAMPUS_TEST__.sitClassroomSeat(id);await settle();result[prefix]=snapshot()
        window.__CAMPUS_TEST__.leaveClassroomSeat()
      }
      result.streaming=window.__CAMPUS_TEST__.buildingInteriorStreaming()
      return result
    })
  }

  const disabled=await measure(false)
  const enabled=await measure(true)
  const report={disabled,enabled}
  const reportPath=testInfo.outputPath('classroom-detail-streaming-comparison.json')
  await writeFile(reportPath,JSON.stringify(report,null,2))
  await testInfo.attach('classroom-detail-streaming-comparison',{
    path:reportPath,contentType:'application/json',
  })
  expect(enabled.outdoor.triangles).toBeLessThan(disabled.outdoor.triangles*.5)
  expect(enabled['b1-'].triangles).toBeLessThan(disabled['b1-'].triangles*.5)
  expect(enabled['b2-'].triangles).toBeLessThan(disabled['b2-'].triangles*.5)
  expect(enabled.outdoor.textures).toBeLessThanOrEqual(disabled.outdoor.textures)
})

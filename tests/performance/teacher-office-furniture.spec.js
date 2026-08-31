import {expect,test} from '@playwright/test'

test('teacher offices use the confirmed desk directions and wooden backrest chairs',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__)

  const result=await page.evaluate(()=>({
    furniture:window.__CAMPUS_TEST__.classroomFurniture(),
    seating:window.__CAMPUS_TEST__.classroomSeating(),
    streaming:window.__CAMPUS_TEST__.buildingInteriorStreaming(),
  }))
  expect(result.furniture).toMatchObject({
    rooms:22,officesSkipped:2,officeRooms:2,officeDesks:54,officeChairs:54,
    teacherDesks:22,deskAnchors:582,
  })
  expect(result.furniture.officeLayouts).toEqual([
    expect.objectContaining({
      name:'b1-main-room-2-floor-1',desks:27,chairs:27,
      northWallDesks:4,southWallDesks:4,westWallDesks:3,centerGroups:4,centerGroupDesks:16,
      eastClearance:1.85,westToCenterAisle:1.05,
    }),
    expect.objectContaining({
      name:'b2-room-4-floor-1',desks:27,chairs:27,
      northWallDesks:4,southWallDesks:4,westWallDesks:3,centerGroups:4,centerGroupDesks:16,
      eastClearance:1.85,westToCenterAisle:1.05,
    }),
  ])
  for(const classroom of ['b1-main-room-2-floor-1','b2-room-4-floor-1']) {
    const placements=result.furniture.officePlacements.filter(item=>item.classroom===classroom)
    expect(placements).toHaveLength(27)
    const north=placements.filter(item=>item.zone==='north-window')
    const south=placements.filter(item=>item.zone==='south-window')
    const west=placements.filter(item=>item.zone==='west-blackboard')
    expect(north).toHaveLength(4);expect(south).toHaveLength(4);expect(west).toHaveLength(3)
    expect(north.slice(1).every((item,index)=>Math.abs(item.desk[0]-north[index].desk[0]-1.2)<1e-9)).toBe(true)
    expect(south.slice(1).every((item,index)=>Math.abs(item.desk[0]-south[index].desk[0]-1.2)<1e-9)).toBe(true)
    expect(north.every(item=>item.deskRotationY===0&&item.chair[2]>item.desk[2]&&item.chairFacing[1]===-1)).toBe(true)
    expect(south.every(item=>item.deskRotationY===Math.PI&&item.chair[2]<item.desk[2]&&item.chairFacing[1]===1)).toBe(true)
    expect(west.every(item=>item.deskRotationY===Math.PI/2&&item.chair[0]>item.desk[0]&&item.chairFacing[0]===-1)).toBe(true)
    expect(placements.every(item=>item.chairRotationY===item.deskRotationY+Math.PI)).toBe(true)
  }
  expect(result.seating).toMatchObject({interactions:1695,desks:582,stools:1056,chairs:54,benches:3})
  expect(result.streaming.lod).toMatchObject({studentDesks:582,teacherDesks:22})
})

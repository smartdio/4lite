import {expect,test} from '@playwright/test'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {EXPECTED_DECODED_AUDIO_URLS,EXPECTED_SCENE_ASSET_TASK_IDS} from './expected-runtime-resources.js'

const budgets=JSON.parse(await readFile(path.resolve('scripts/performance/budgets.json'),'utf8'))
const ceilings=budgets.regressionCeilings

test('sealed campus performance and behavior baseline',async({page},testInfo)=>{
  const consoleErrors=[]
  const failedRequests=[]
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
  page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}))

  await page.goto('/',{waitUntil:'networkidle',timeout:120000})
  await page.waitForFunction(()=>window.__CAMPUS_TEST__,null,{timeout:30000})
  const beforeEntry=await page.evaluate(()=>({
    resources:performance.getEntriesByType('resource').map(entry=>entry.name),
    loading:window.__CAMPUS_TEST__.loadingState(),
  }))
  expect(beforeEntry.resources.some(url=>url.endsWith('.glb')||url.includes('.glb?'))).toBe(false)
  expect(beforeEntry.resources.filter(url=>url.endsWith('.ogg'))).toHaveLength(1)
  expect(beforeEntry.resources.some(url=>url.endsWith('/assets/audio/music/afternoon-in-the-schoolyard.ogg'))).toBe(true)
  expect(beforeEntry.loading).toMatchObject({started:false,ready:false,fullReady:false})
  await page.locator('#enter-campus').click()
  await expect(page.locator('#experience-gate')).toBeHidden({timeout:15000})
  await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
  const startup=await page.evaluate(()=>({
    banyan:window.__CAMPUS_TEST__.banyanAsset(),
    controls:window.__CAMPUS_TEST__.controls(),
    player:window.__CAMPUS_TEST__.player(),
    snapshot:window.__CAMPUS_TEST__.performanceSnapshot(),
    resources:performance.getEntriesByType('resource').map(entry=>entry.name),
    registry:window.__CAMPUS_TEST__.assetRegistry(),
    audio:window.__CAMPUS_TEST__.audio(),
  }))
  expect(startup.banyan.strategy).toBe('single-full-detail-model')
  expect(startup.banyan.triangles).toBe(87172)
  expect(startup.banyan.drawObjects).toBe(1)
  expect(startup.banyan.size[1]).toBe(8)
  expect(startup.controls).toMatchObject({mode:'walk',pointerLocked:false})
  expect(startup.player).toMatchObject({mode:'walk',x:-2.5,y:1.62,z:-2.6})
  expect(startup.audio).toMatchObject({supported:true,enabled:true,failures:0,expectedDecoded:EXPECTED_DECODED_AUDIO_URLS,loading:0})
  expect(startup.audio.decoded).toBe(startup.audio.expectedDecoded)
  expect(startup.audio.preloadUrls).toHaveLength(EXPECTED_DECODED_AUDIO_URLS)
  expect(new Set(startup.audio.preloadUrls).size).toBe(EXPECTED_DECODED_AUDIO_URLS)
  expect(startup.audio.plays).toBeGreaterThanOrEqual(1)
  expect(startup.resources.filter(url=>url.endsWith('.ogg'))).toHaveLength(EXPECTED_DECODED_AUDIO_URLS+1)
  expect(startup.resources.some(url=>url.includes('banyan-tree-scene-optimized.glb'))).toBe(true)
  expect(startup.resources.some(url=>url.includes('banyan-tree-scene-lod1.glb')||url.includes('banyan-tree-scene-lod2.glb'))).toBe(false)
  const qualityPolicy=await page.evaluate(()=>({
    profile:window.__CAMPUS_TEST__.performanceProfile(),
    models:window.__CAMPUS_TEST__.modelDetailAudit(),
  }))
  expect(qualityPolicy.profile.id).toBe('desktop-high')
  expect(qualityPolicy.profile.automaticDowngrade).toBe(false)
  expect(qualityPolicy.profile.renderer.maxPixelRatio).toBe(1.5)
  expect(qualityPolicy.profile.renderer.maxDrawingBufferSize).toEqual({longEdge:2560,shortEdge:1440})
  expect(qualityPolicy.profile.shadows.cameraExtent).toBe(60)
  expect(qualityPolicy.profile.lighting).toEqual({
    hemisphereOutdoorIntensity:1.3,hemisphereIndoorIntensity:1.68,indoorTransitionLambda:4.5,
  })
  expect(qualityPolicy.profile.postProcessing.composerPixelRatio).toBe(.875)
  expect(qualityPolicy.profile.postProcessing.smaaEnabled).toBe(true)
  expect(qualityPolicy.models).toEqual({lodEnabled:false,strategy:'single-full-detail-models',lodObjects:0})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.postProcessing())).toMatchObject({gtaoEnabled:true,smaaEnabled:true})
  const fourKPolicy=await page.evaluate(()=>window.__CAMPUS_TEST__.renderResolutionPolicy(3840,2160,2))
  expect(fourKPolicy).toMatchObject({
    css:[3840,2160],maxDrawingBuffer:{longEdge:2560,shortEdge:1440},
    rendererDpr:2/3,composerDpr:2/3,drawing:[2560,1440],composer:[2560,1440],
  })
  const lighting=await page.evaluate(()=>window.__CAMPUS_TEST__.lighting())
  expect(lighting).toMatchObject({
    hemisphereSky:'#dbe7f6',hemisphereGround:'#655f55',hemisphere:1.3,
    hemisphereTarget:1.3,hemisphereOutdoor:1.3,hemisphereIndoor:1.68,indoorBoostActive:false,
    bounceFill:.28,groundBounceEnabled:false,
    bounceFillPosition:[18,58,-45],bounceFillTarget:[0,3,-31],
    shadowBounds:[-60,60,-60,60],
  })
  const bounceDirection=lighting.bounceFillPosition.map((value,index)=>value-lighting.bounceFillTarget[index])
  expect(bounceDirection[1]/Math.hypot(...bounceDirection)).toBeGreaterThan(.9)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.classroomFurniture().lightingContrast)).toEqual({top:1.18,side:.68,bottom:.48})
  const classroomNavigation=await page.evaluate(()=>({
    playerRadius:window.__CAMPUS_TEST__.config.player.radius,
    clearances:window.__CAMPUS_TEST__.classroomFurniture().minimumClearances,
  }))
  expect(classroomNavigation.playerRadius).toBe(.2)
  expect(classroomNavigation.clearances.podiumToFirstDesk).toBeGreaterThan(classroomNavigation.playerRadius*2)
  expect(classroomNavigation.clearances.columnAisle).toBeGreaterThan(classroomNavigation.playerRadius*2)
  const loadingState=await page.evaluate(()=>window.__CAMPUS_TEST__.loadingState())
  expect(loadingState).toMatchObject({ready:true,fullReady:true,completed:EXPECTED_SCENE_ASSET_TASK_IDS.length,total:EXPECTED_SCENE_ASSET_TASK_IDS.length})
  expect(loadingState.taskIds).toEqual(EXPECTED_SCENE_ASSET_TASK_IDS)

  const basketball=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballAsset())
  expect(basketball).toMatchObject({
    status:'loaded',meshes:1,triangles:4368,textureSize:512,diameter:.24,radius:.12,
    drawObjects:3,sourceLicense:'CC0-1.0',sourceAuthor:'DigitalN8m4r3 / Miodrag Sejic',
  })
  expect(basketball.items).toHaveLength(3)
  expect(new Set(basketball.items.map(item=>item.id)).size).toBe(3)
  expect(basketball.placements.every(item=>{
    const minimum=Math.min(...item.size),maximum=Math.max(...item.size)
    return minimum>.232&&maximum>.237&&maximum<.243
  }),JSON.stringify(basketball.placements)).toBe(true)
  expect(basketball.placements.every(item=>Math.abs(item.position[1]-(item.ground+.12))<.004)).toBe(true)
  expect(startup.resources.some(url=>url.includes('basketball-game-optimized-v01.glb'))).toBe(true)
  const hoop=await page.evaluate(()=>window.__CAMPUS_TEST__.basketballHoop())
  expect(hoop).toMatchObject({
    status:'loaded',center:[15.1,-45.4],surfaceY:.0045,rotationY:180,
    boardSize:[1.8,1.05,.04],baseSize:[1.75,.08,1.336],meshes:5,drawObjects:1,
  })
  expect(hoop.rimWorld[1]).toBeCloseTo(2.7545,3)
  expect(Math.abs(hoop.groundGap)).toBeLessThan(.002)
  expect(startup.resources.some(url=>url.includes('basketball-hoop-game-optimized-v01.glb'))).toBe(true)

  const schoolEphemera=await page.evaluate(()=>window.__CAMPUS_TEST__.schoolEphemera())
  expect(schoolEphemera).toMatchObject({
    status:'loaded',seed:1982,uniqueTextures:30,drawObjects:30,classrooms:22,
    officesExcluded:['b1-main-room-2-floor-1','b2-room-4-floor-1'],
    placements:{campusGuide:1,developmentProcess:1,b1Corridor:24,b2Columns:12,studentCode:22,eyeExercise:22,slogans:22,blackboards:22,officePortraits:8},
  })
  expect(schoolEphemera.placements.awards).toBeGreaterThanOrEqual(22)
  expect(schoolEphemera.placements.awards).toBeLessThanOrEqual(66)
  expect(schoolEphemera.decodedBytesWithMipmaps).toBeLessThanOrEqual(34.7*1024*1024)
  expect(schoolEphemera.instances).toBe(134+schoolEphemera.placements.awards)
  expect(schoolEphemera.assignments).toContainEqual({
    id:'b1-passage-west-campus-guide',assetId:'campus-guide',category:'campusGuide',group:null,
  })
  expect(schoolEphemera.assignments).toContainEqual({
    id:'b1-passage-east-development-process',assetId:'development-process',category:'developmentProcess',group:null,
  })
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.schoolEphemera())).toEqual(schoolEphemera)
  const corridorGroups=Object.groupBy(
    schoolEphemera.assignments.filter(item=>item.category==='b1Corridor'||item.category==='b2Columns'),
    item=>item.group,
  )
  for(const assignments of Object.values(corridorGroups))for(let index=1;index<assignments.length;index++) {
    expect(assignments[index].assetId).not.toBe(assignments[index-1].assetId)
  }
  const awardAssignments=Object.groupBy(
    schoolEphemera.assignments.filter(item=>item.category==='awards'),
    item=>item.id.replace(/-award-\d+$/,''),
  )
  for(const assignments of Object.values(awardAssignments))expect(new Set(assignments.map(item=>item.assetId)).size).toBe(assignments.length)

  const schoolBooks=await page.evaluate(()=>window.__CAMPUS_TEST__.schoolBooks())
  await testInfo.attach('school-books',{body:Buffer.from(JSON.stringify(schoolBooks,null,2)),contentType:'application/json'})
  expect(schoolBooks).toMatchObject({
    status:'loaded',seed:'school-books-v1',sourceTextures:25,uniqueTextures:1,drawObjects:3,classrooms:22,
    occupiedTeacherDesks:22,officesExcluded:['b1-main-room-2-floor-1','b2-room-4-floor-1'],
  })
  expect(schoolBooks.occupiedStudentDesks).toBeGreaterThanOrEqual(176)
  expect(schoolBooks.occupiedStudentDesks).toBeLessThanOrEqual(220)
  expect(schoolBooks.placements.textbooks+schoolBooks.placements.workbooks).toBe(schoolBooks.books)
  expect(schoolBooks.placements.studentBooks+schoolBooks.placements.teacherBooks).toBe(schoolBooks.books)
  expect(schoolBooks.placements.textbooks/schoolBooks.books).toBeGreaterThan(.5)
  expect(schoolBooks.placements.textbooks/schoolBooks.books).toBeLessThan(.75)
  expect(schoolBooks.instances).toBe(schoolBooks.books*5)
  expect(schoolBooks.decodedBytesWithMipmaps).toBeLessThanOrEqual(10*1024*1024)
  expect(schoolBooks.sourceDecodedBytesWithMipmaps).toBeLessThanOrEqual(10*1024*1024)
  expect(schoolBooks.atlasSize[0]).toBeLessThanOrEqual(1280)
  expect(schoolBooks.atlasSize[1]).toBeLessThanOrEqual(2048)
  expect(schoolBooks.spineColor).toBe('#d8d5c9')
  expect(schoolBooks.dimensions).toEqual({textbookDepth:.22,workbookDepth:.21})
  expect(schoolBooks.boundsAudit.violations).toEqual([])
  expect(Object.values(schoolBooks.variants).every(count=>count>0)).toBe(true)
  for(const room of Object.values(schoolBooks.roomStats)) {
    expect(room.studentDesks).toBeGreaterThanOrEqual(8)
    expect(room.studentDesks).toBeLessThanOrEqual(10)
    expect(room.studentBooks).toBeGreaterThanOrEqual(room.studentDesks)
    expect(room.studentBooks).toBeLessThanOrEqual(room.studentDesks*2)
    expect(room.teacherBooks).toBeGreaterThanOrEqual(1)
    expect(room.teacherBooks).toBeLessThanOrEqual(2)
  }
  const bookStacks=Object.groupBy(schoolBooks.assignments,item=>item.stackId)
  for(const stack of Object.values(bookStacks))expect(new Set(stack.map(item=>item.assetId)).size).toBe(stack.length)
  for(const assignment of schoolBooks.assignments) {
    const thickness=assignment.size[1]
    const direction=Math.atan2(Math.sin(assignment.rotationY-assignment.anchorRotationY),Math.cos(assignment.rotationY-assignment.anchorRotationY))
    if(assignment.surface==='teacher')expect(Math.abs(Math.abs(direction)-Math.PI)).toBeLessThan(.2)
    else expect(Math.abs(direction)).toBeLessThan(.2)
    if(assignment.kind==='textbook') {
      expect(assignment.size[2]).toBe(.22)
      expect(thickness).toBeGreaterThanOrEqual(.009)
      expect(thickness).toBeLessThanOrEqual(.013)
    }
    else {
      expect(assignment.size[2]).toBe(.21)
      expect(thickness).toBeLessThanOrEqual(.006)
    }
  }
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.schoolBooks())).toEqual(schoolBooks)

  const compositionPages=await page.evaluate(()=>window.__CAMPUS_TEST__.compositionPages())
  await testInfo.attach('composition-pages',{body:Buffer.from(JSON.stringify(compositionPages,null,2)),contentType:'application/json'})
  expect(compositionPages).toMatchObject({
    status:'loaded',seed:'composition-pages-b2-v1',pages:13,uniqueTextures:13,drawObjects:13,
    surfaces:{student:10,teacher:3},
  })
  expect(compositionPages.classrooms).toBeGreaterThanOrEqual(8)
  expect(compositionPages.decodedBytesWithMipmaps).toBeLessThanOrEqual(5*1024*1024)
  expect(new Set(compositionPages.assignments.map(item=>item.id)).size).toBe(13)
  expect(new Set(compositionPages.assignments.map(item=>item.anchor)).size).toBe(13)
  const occupiedBookAnchors=new Set(schoolBooks.assignments.map(item=>item.id.replace(/-book-\d+$/,'')))
  for(const assignment of compositionPages.assignments) {
    expect(assignment.classroom.startsWith('b2-')).toBe(true)
    expect(assignment.anchor.startsWith('b2-')).toBe(true)
    expect(assignment.classroom).not.toBe('b2-room-4-floor-1')
    if(assignment.surface==='student')expect(occupiedBookAnchors.has(assignment.anchor)).toBe(false)
  }
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.compositionPages())).toEqual(compositionPages)

  const comicBooks=await page.evaluate(()=>window.__CAMPUS_TEST__.comicBooks())
  await testInfo.attach('comic-books',{body:Buffer.from(JSON.stringify(comicBooks,null,2)),contentType:'application/json'})
  expect(comicBooks).toMatchObject({
    status:'loaded',seed:'comic-books-b2-cubbies-v1',books:22,uniqueTextures:1,drawObjects:2,
    activeRooms:[],visibleBooks:0,activeDrawObjects:0,
    excludedAnchorNames:[
      'b2-room-3-floor-1-row-5-column-2-student-desk',
      'b2-room-1-floor-2-row-5-column-2-student-desk',
    ],
  })
  expect(comicBooks.cubbies).toBeGreaterThanOrEqual(8)
  expect(comicBooks.cubbies).toBeLessThanOrEqual(11)
  expect(comicBooks.classrooms).toBe(comicBooks.cubbies)
  expect(comicBooks.decodedBytesWithMipmaps).toBeLessThanOrEqual(6*1024*1024)
  expect(new Set(comicBooks.assignments.map(item=>item.id)).size).toBe(22)
  const comicCubbies=Object.groupBy(comicBooks.assignments,item=>`${item.anchor}:${item.cubby}`)
  for(const [key,items] of Object.entries(comicCubbies)) {
    expect(items.length,`${key} comic count`).toBeGreaterThanOrEqual(2)
    expect(items.length,`${key} comic count`).toBeLessThanOrEqual(3)
    expect(new Set(items.map(item=>item.id)).size).toBe(items.length)
  }
  for(const assignment of comicBooks.assignments) {
    expect(assignment.kind).toBe('comic')
    expect(assignment.classroom.startsWith('b2-')).toBe(true)
    expect(assignment.classroom).not.toBe('b2-room-4-floor-1')
    expect(comicBooks.excludedAnchorNames).not.toContain(assignment.anchor)
    expect(assignment.booksInCubby).toBeGreaterThanOrEqual(2)
    expect(assignment.booksInCubby).toBeLessThanOrEqual(3)
  }
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.comicBooks())).toEqual(comicBooks)
  const snackBags=await page.evaluate(()=>window.__CAMPUS_TEST__.snackBags())
  await testInfo.attach('snack-bags',{body:Buffer.from(JSON.stringify(snackBags,null,2)),contentType:'application/json'})
  expect(snackBags).toMatchObject({
    status:'loaded',instances:3,classrooms:3,orientation:'flat-front-up',
    modelSize:{width:.1595,depth:.1496,thickness:.0698},
    sharedResources:{requests:1,geometries:5,materials:4,textures:2,textureSize:[512,491],meshObjects:5},
    boundsAudit:{violations:[]},
  })
  expect(snackBags.sharedResources.decodedBytesWithMipmaps).toBeLessThanOrEqual(2.7*1024*1024)
  expect(snackBags.sharedResources.drawCallsPerVisibleRoom).toBeLessThanOrEqual(5)
  expect(new Set(snackBags.assignments.map(item=>item.classroom))).toEqual(new Set([
    'b2-room-2-floor-1','b2-room-3-floor-2','b2-room-4-floor-3',
  ]))
  expect(new Set(snackBags.assignments.map(item=>item.anchor)).size).toBe(3)
  expect(snackBags.assignments.every(item=>item.orientation==='flat-front-up')).toBe(true)
  expect(snackBags.assignments.every(item=>Math.abs(item.frontClearance-.008)<1e-5)).toBe(true)
  expect(snackBags.assignments.every(item=>!comicBooks.assignments.some(comic=>comic.anchor===item.anchor))).toBe(true)
  expect(startup.resources.some(url=>url.includes('bubuxing-seafood-snack-bag-game-v02.glb'))).toBe(true)
  const focusedSnack=await page.evaluate(()=>window.__CAMPUS_TEST__.focusSnackBag('bubuxing-snack-1'))
  expect(focusedSnack.assignment).toMatchObject({
    id:'bubuxing-snack-1',classroom:'b2-room-2-floor-1',orientation:'flat-front-up',
  })
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer())).toEqual({
    loaded:true,preloadedBlobs:60,active:null,activeKind:null,opening:false,decodedTextures:0,closeBounds:null,
  })
  const focusedComposition=await page.evaluate(()=>window.__CAMPUS_TEST__.focusViewableDocument('composition-future-world-v01'))
  expect(focusedComposition.hit.item).toMatchObject({id:'composition-future-world-v01',kind:'composition'})
  await page.waitForTimeout(150)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.hud().interaction)).toBe('look')
  const openComposition=await page.evaluate(()=>window.__CAMPUS_TEST__.openViewableDocument())
  expect(openComposition).toMatchObject({active:'composition-future-world-v01',activeKind:'composition',decodedTextures:1})
  await page.locator('canvas').click({position:{x:640,y:360}})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer())).toMatchObject({active:'composition-future-world-v01',decodedTextures:1})
  const compositionClose=await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer().closeBounds)
  await page.mouse.click((compositionClose.left+compositionClose.right)/2,(compositionClose.top+compositionClose.bottom)/2)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer())).toMatchObject({active:null,decodedTextures:0})
  const focusedBook=await page.evaluate(()=>window.__CAMPUS_TEST__.focusViewableDocument('workbook-cover-language-v01'))
  expect(focusedBook.hit.item).toMatchObject({id:'workbook-cover-language-v01',kind:'workbook'})
  const openBook=await page.evaluate(()=>window.__CAMPUS_TEST__.openViewableDocument())
  expect(openBook).toMatchObject({active:'workbook-cover-language-v01',activeKind:'workbook',decodedTextures:1})
  await page.keyboard.press('KeyX')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.documentViewer())).toMatchObject({active:null,decodedTextures:0})
  const focusedComic=await page.evaluate(()=>window.__CAMPUS_TEST__.focusViewableDocument('comic-dadi-enqing-01'))
  expect(focusedComic.hit.item).toMatchObject({id:'comic-dadi-enqing-01',kind:'comic'})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.comicBooks())).toMatchObject({
    activeRooms:['b2-room-4-floor-2'],visibleBooks:2,activeDrawObjects:2,
  })
  const openComic=await page.evaluate(()=>window.__CAMPUS_TEST__.openViewableDocument())
  expect(openComic).toMatchObject({active:'comic-dadi-enqing-01',activeKind:'comic',decodedTextures:1})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.closeViewableDocument())).toMatchObject({active:null,decodedTextures:0})
  await page.evaluate(()=>window.__CAMPUS_TEST__.applyFixedCamera('gate'))
  await page.waitForTimeout(150)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.comicBooks())).toMatchObject({
    activeRooms:[],visibleBooks:0,activeDrawObjects:0,
  })

  const schoolChalk=await page.evaluate(()=>window.__CAMPUS_TEST__.schoolChalk())
  expect(schoolChalk).toMatchObject({
    status:'loaded',seed:'school-chalk-v1',boxes:22,drawObjects:2,uniqueTextures:1,externalRequests:0,
    classrooms:22,frontTrays:0,rearTrays:0,officesExcluded:['b1-main-room-2-floor-1','b2-room-4-floor-1'],
    activePool:{capacity:16,template:{box:10,desk:6,tray:0},resetOnClassroomExit:true},activeClassroom:null,
    renderedChalks:0,renderedInteractiveChalks:0,renderedDecorativeChalks:0,
    dimensions:{box:[.17,.09,.035],chalkDiameter:.011,full:.078,half:.038},
  })
  expect(schoolChalk.placements.box).toBe(22*10)
  expect(schoolChalk.boxAssignments).toHaveLength(22)
  expect(schoolChalk.placements.desk).toBe(22*6)
  expect(schoolChalk.placements.tray).toBe(0)
  expect(schoolChalk.chalks).toBe(Object.values(schoolChalk.placements).reduce((sum,count)=>sum+count,0))
  expect(schoolChalk.colors.white).toBeGreaterThan(schoolChalk.chalks/2)
  expect(Object.values(schoolChalk.colors).reduce((sum,count)=>sum+count,0)).toBe(schoolChalk.chalks)
  expect(schoolChalk.lengths.full).toBeGreaterThan(0)
  expect(schoolChalk.lengths.half).toBeGreaterThan(0)
  expect(schoolChalk.boundsAudit).toEqual({violations:[],boxBookOverlapViolations:[]})
  const chalkByRoom=Object.groupBy(schoolChalk.assignments,item=>item.classroom)
  expect(Object.keys(chalkByRoom)).toHaveLength(22)
  for(const assignments of Object.values(chalkByRoom)) {
    expect(assignments.filter(item=>item.location==='box')).toHaveLength(10)
    expect(assignments.filter(item=>item.location==='desk')).toHaveLength(6)
    expect(assignments.filter(item=>item.location==='tray')).toHaveLength(0)
  }
  expect(schoolChalk.assignments.some(item=>schoolChalk.officesExcluded.includes(item.classroom))).toBe(false)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.schoolChalk())).toEqual(schoolChalk)

  const assetStates=await page.evaluate(()=>({
    openings:window.__CAMPUS_TEST__.building1Assets(),
    toilet:window.__CAMPUS_TEST__.toiletAsset(),
    dormitory:window.__CAMPUS_TEST__.dormitoryAsset(),
    banyan:window.__CAMPUS_TEST__.banyanAsset(),
    playgroundTrees:window.__CAMPUS_TEST__.playgroundTrees(),
    oldClassroom:window.__CAMPUS_TEST__.oldClassroomAsset(),
    sandpit:window.__CAMPUS_TEST__.sandpitAsset(),
    activitySand:window.__CAMPUS_TEST__.activitySandAssets(),
    pingPong:window.__CAMPUS_TEST__.pingPongAsset(),
    slide:window.__CAMPUS_TEST__.concreteSlideAsset(),
    groundDetails:window.__CAMPUS_TEST__.groundDetails(),
  }))
  expect(assetStates.openings.status).toBe('ready')
  for(const [name,state] of Object.entries(assetStates).filter(([name])=>name!=='openings'))expect.soft(state.status,`${name} loaded`).toBe('loaded')
  expect(assetStates.activitySand.uniqueUrls).toBe(2)
  expect(assetStates.activitySand.sharedSouthTemplate.geometries).toBeGreaterThan(0)
  expect(assetStates.activitySand.sharedSouthTemplate.materials).toBeGreaterThan(0)
  expect(assetStates.activitySand.sharedSouthTemplate.textures).toBeGreaterThan(0)
  expect(assetStates.playgroundTrees.instances).toBe(23)
  expect(assetStates.playgroundTrees.sourceDrawObjects).toBe(72)
  expect(assetStates.playgroundTrees.drawObjects).toBe(10)
  expect(assetStates.playgroundTrees.species.casuarina).toMatchObject({
    url:'/assets/models/playground-trees/casuarina-tree-game-v11.glb?v=4',meshes:3,triangles:1478,
  })
  expect(assetStates.playgroundTrees.instanceGroups).toEqual({
    casuarina:{placements:16,sourceMeshes:3,drawObjects:3},
    camphor:{placements:4,sourceMeshes:3,drawObjects:3},
    bauhinia:{placements:3,sourceMeshes:4,drawObjects:4},
  })
  const casuarinaPlacements=assetStates.playgroundTrees.placements.filter(placement=>placement.species==='casuarina')
  expect(casuarinaPlacements).toHaveLength(16)
  expect(casuarinaPlacements.filter(placement=>placement.id!=='casuarina-slide-corner-01').every(placement=>placement.height===8)).toBe(true)
  expect(casuarinaPlacements.find(placement=>placement.id==='casuarina-slide-corner-01')?.height).toBe(6.8)
  for(const placement of assetStates.playgroundTrees.placements) {
    expect(Math.abs(placement.actualHeight-placement.height)).toBeLessThan(.002)
    expect(placement.soilRing.every(span=>span>=1.7&&span<=2.6)).toBe(true)
  }
  const playgroundTreeInstances=await page.evaluate(()=>window.__CAMPUS_TEST__.playgroundTreeInstances())
  expect(playgroundTreeInstances).toEqual({instanceMeshes:10,instanceSlots:72,finiteMatrices:72,uniqueGeometries:10,uniqueMaterials:10})
  expect(assetStates.pingPong.sourceDrawObjects).toBe(6)
  expect(assetStates.pingPong.drawObjects).toBe(2)
  expect(assetStates.pingPong.instanceGroups).toEqual({regular:4,mirrored:2})
  expect(assetStates.pingPong.placements).toHaveLength(6)
  expect(assetStates.pingPong.placements.filter(placement=>placement.mirrored)).toHaveLength(2)
  for(const placement of assetStates.pingPong.placements)expect(placement.size).toEqual([2.077,.715,1.35])
  expect(assetStates.pingPong.paddle).toMatchObject({status:'loaded',meshes:1,triangles:9404,singleMaterial:true})
  expect(assetStates.pingPong.paddle.size[0]).toBeLessThan(.025)
  expect(assetStates.pingPong.paddle.size[1]).toBeGreaterThan(.22)
  expect(assetStates.pingPong.game).toMatchObject({
    status:'idle',simulations:0,
    props:{paddles:12,balls:6,rubberColours:['faded-red','worn-black','deep-blue'],staticPaddleMeshes:3},
  })
  const pingPongAudit=await page.evaluate(()=>{
    const test=window.__CAMPUS_TEST__,asset=test.pingPongAsset(),eyeHeight=test.config.player.eyeHeight
    return {
      instances:test.pingPongInstances(),
      collisions:asset.placements.map(({center:[x,z]})=>test.collisionDetails(x,z,eyeHeight).filter(item=>item.name.includes('ping-pong-table-glb')).length),
    }
  })
  expect(pingPongAudit.instances).toEqual({instanceMeshes:2,instanceSlots:6,finitePositiveMatrices:6,uniqueGeometries:2,uniqueMaterials:1})
  expect(pingPongAudit.collisions).toEqual([1,1,1,1,1,1])
  const sharedOpeningTextures=await page.evaluate(()=>window.__CAMPUS_TEST__.building1SharedTextures())
  expect(sharedOpeningTextures.textureSets).toEqual(['old-glass','wood-frame','wood-panel'])
  expect(sharedOpeningTextures.uniqueTextures).toBe(6)
  expect(sharedOpeningTextures.materialBindings).toBeGreaterThanOrEqual(6)
  expect(sharedOpeningTextures.library).toBe('/assets/models/building-openings/building-opening-shared-textures-v01.glb?v=2')
  expect(startup.resources.filter(url=>url.includes('building-opening-shared-textures-v01.glb'))).toHaveLength(1)
  expect(startup.registry.cacheHits).toBeGreaterThanOrEqual(1)
  expect(startup.registry.failures).toBe(0)
  expect(startup.registry.entries.every(entry=>entry.status==='loaded')).toBe(true)
  const sharedSandTexture=await page.evaluate(()=>window.__CAMPUS_TEST__.sharedSandTexture())
  const sharedSandRequests=startup.resources.filter(url=>url.includes('sandpit-cement-rim-albedo-v01.webp'))
  expect(sharedSandRequests).toHaveLength(1)
  expect(sharedSandTexture.materialBindings).toBeGreaterThanOrEqual(4)
  expect(sharedSandTexture.uniqueTextures).toBe(1)
  expect(sharedSandTexture.sourceFormats).toEqual(['webp'])
  expect(sharedSandTexture.pilot).toMatchObject({requested:false,selected:'webp',fallbackReason:null,gpuFormat:null})
  expect(failedRequests).toEqual([])

  const navigation=await page.evaluate(()=>{
    window.__CAMPUS_TEST__.resetNavigationCandidateStats()
    return {
      gate:window.__CAMPUS_TEST__.gateExitCollisionRegression(),
      stairs:window.__CAMPUS_TEST__.b1StairCollisionRegression(),
      stats:window.__CAMPUS_TEST__.navigation(),
    }
  })
  expect(navigation.gate.pass).toBe(true)
  expect(navigation.stairs.pass).toBe(true)

  const interaction=await page.evaluate(()=>{
    const test=window.__CAMPUS_TEST__
    const interactions=test.building1Interactions()
    const placement=interactions.placementStates.find(item=>item.type.startsWith('door'))
    const nearPositive=test.focusBuilding1Interaction(placement.name,1,1)
    const side=nearPositive.hit?1:-1
    const near=nearPositive.hit?nearPositive:test.focusBuilding1Interaction(placement.name,1,-1)
    const extended=test.focusBuilding1Interaction(placement.name,2.2,side)
    const far=test.focusBuilding1Interaction(placement.name,3.2,side)
    const occluded=test.focusBuilding1Interaction(placement.name,.35,side,.85)
    const before=test.building1DoorKinematics(placement.name)
    const toggle=test.toggleBuilding1Interaction(placement.name,'DoorLeaf_Pivot')
    test.advanceBuilding1Interactions(.8)
    const after=test.building1DoorKinematics(placement.name)
    test.toggleBuilding1Interaction(placement.name,'DoorLeaf_Pivot')
    test.advanceBuilding1Interactions(.8)
    return {placement:placement.name,policy:interactions.policy,near,extended,far,occluded,before,toggle,after}
  })
  expect(interaction.policy).toEqual({maxDistance:2.5,requiresClearLineOfSight:true})
  expect(interaction.near.hit?.distance).toBeLessThanOrEqual(2.5)
  expect(interaction.extended.hit?.distance).toBeLessThanOrEqual(2.5)
  expect(interaction.far.hit).toBeNull()
  expect(interaction.occluded.hit).toBeNull()
  expect(typeof interaction.toggle?.open).toBe('boolean')
  expect(interaction.after.hinge.position).toEqual(interaction.before.hinge.position)
  expect(interaction.after.leaf.position).not.toEqual(interaction.before.leaf.position)

  const cameraNames=await page.evaluate(()=>Object.keys(window.__CAMPUS_TEST__.fixedCameras()))
  const cameraMetrics={}
  const canvas=page.locator('canvas')
  for(const name of cameraNames) {
    cameraMetrics[name]=await page.evaluate(cameraName=>{
      window.__CAMPUS_TEST__.applyFixedCamera(cameraName)
      return window.__CAMPUS_TEST__.performanceSnapshot()
    },name)
    await page.waitForTimeout(150)
    await expect(canvas).toHaveScreenshot(`${name}.png`)
  }

  const seating=await page.evaluate(()=>window.__CAMPUS_TEST__.classroomSeating())
  expect(seating).toMatchObject({policy:{maxDistance:2.5,requiresClearLineOfSight:true},interactions:1695,desks:582,stools:1056,chairs:54,benches:3,sittingEyeHeight:1.12,seated:null})
  expect(seating.sampleBench).toMatchObject({id:'b1-north-east-granite-bench-1-seat',facing:[0,-1]})
  expect(await page.evaluate(id=>window.__CAMPUS_TEST__.sitClassroomSeat(id),seating.sampleBench.id)).toBe(true)
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.controls().seated)).toMatchObject({seatId:seating.sampleBench.id,classroom:null})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.leaveClassroomSeat())).toBe(true)
  const stoolId=seating.sampleStool.id
  const seatWallAudit=await page.evaluate(id=>window.__CAMPUS_TEST__.classroomSeatWallOcclusionAudit(id),stoolId)
  expect(seatWallAudit.some(item=>item.distance<=2.5&&item.blocked)).toBe(true)
  await page.evaluate(({center,facing})=>{
    const perpendicular=[facing[1],-facing[0]]
    window.__CAMPUS_TEST__.teleport(
      center[0]+perpendicular[0]*3.2,center[2]+perpendicular[1]*3.2,
      center[0],center[2],0,center[1],center[1]+1,
    )
  },seating.sampleStool)
  await canvas.click({button:'left',position:{x:640,y:360}})
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.player())).mode).toBe('walk')
  await page.evaluate(({center,facing})=>{
    const perpendicular=[facing[1],-facing[0]]
    window.__CAMPUS_TEST__.teleport(
      center[0]+perpendicular[0]*.58,center[2]+perpendicular[1]*.58,
      center[0],center[2],0,center[1],center[1]+1,
    )
  },seating.sampleStool)
  const beforeSeat=await page.evaluate(()=>window.__CAMPUS_TEST__.player())
  await canvas.click({button:'left',position:{x:640,y:360}})
  const seatedPlayer=await page.evaluate(()=>({player:window.__CAMPUS_TEST__.player(),controls:window.__CAMPUS_TEST__.controls()}))
  expect(seatedPlayer.player.mode).toBe('seated')
  expect(seatedPlayer.controls.seated).toMatchObject({seatId:stoolId})
  const seatedPosition={...seatedPlayer.player}
  await page.keyboard.down('KeyW');await page.waitForTimeout(180);await page.keyboard.up('KeyW')
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(seatedPosition)
  await canvas.click({button:'left',position:{x:640,y:360}})
  expect((await page.evaluate(()=>window.__CAMPUS_TEST__.player())).mode).toBe('seated')
  await page.evaluate(()=>document.exitPointerLock?.())
  await page.waitForTimeout(80)
  const groundPoint=await page.evaluate(()=>window.__CAMPUS_TEST__.seatedGroundPoint())
  expect(groundPoint).not.toBeNull()
  await canvas.click({button:'left',position:groundPoint})
  expect(await page.evaluate(()=>window.__CAMPUS_TEST__.player())).toEqual(beforeSeat)

  const frameTimings=await page.evaluate(()=>window.__CAMPUS_TEST__.sampleFrameTimings(180,30))
  const postProcessing=await page.evaluate(()=>({
    off:window.__CAMPUS_TEST__.benchmarkPost(false,8),
    on:window.__CAMPUS_TEST__.benchmarkPost(true,8),
  }))
  const assetTimings=await page.evaluate(()=>window.__CAMPUS_TEST__.assetTimings())
  const assetRegistry=await page.evaluate(()=>window.__CAMPUS_TEST__.assetRegistry())
  const snapshots=Object.values(cameraMetrics)
  const maxima={
    drawCalls:Math.max(...snapshots.map(item=>item.renderer.render.calls)),
    triangles:Math.max(...snapshots.map(item=>item.renderer.render.triangles)),
    textures:Math.max(...snapshots.map(item=>item.renderer.memory.textures)),
    textureMemoryEstimateBytes:Math.max(...snapshots.map(item=>item.textures.estimatedBytes)),
    resourceRequests:Math.max(...snapshots.map(item=>item.resources.requests)),
    sceneReadyMs:Math.max(...snapshots.map(item=>item.readyMs)),
    frameP95Ms:frameTimings.p95Ms,
  }
  const report={
    generatedAt:new Date().toISOString(),viewport:{width:1280,height:720,deviceScaleFactor:1},
    budgets:{baselineCommit:budgets.baselineCommit,regressionCeilings:ceilings,optimizationTargets:budgets.optimizationTargets},
    maxima,frameTimings,postProcessing,navigation,assetStates,startup,assetTimings,cameras:cameraMetrics,
    assetRegistry,consoleErrors,failedRequests,
  }
  const reportPath=testInfo.outputPath('performance-baseline.json')
  await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
  await testInfo.attach('performance-baseline',{path:reportPath,contentType:'application/json'})
  if(process.env.PERF_REPORT_PATH)await writeFile(path.resolve(process.env.PERF_REPORT_PATH),`${JSON.stringify(report,null,2)}\n`)

  expect(maxima.drawCalls).toBeLessThanOrEqual(ceilings.drawCalls)
  expect(maxima.triangles).toBeLessThanOrEqual(ceilings.triangles)
  expect(maxima.textures).toBeLessThanOrEqual(ceilings.textures)
  expect(maxima.textureMemoryEstimateBytes).toBeLessThanOrEqual(ceilings.textureMemoryEstimateBytes)
  expect(maxima.resourceRequests).toBeLessThanOrEqual(ceilings.runtimeAssetRequests)
  expect(maxima.sceneReadyMs).toBeLessThanOrEqual(ceilings.sceneReadyMs)
  expect(maxima.frameP95Ms).toBeLessThanOrEqual(ceilings.frameP95Ms)
  expect(consoleErrors).toEqual([])
})

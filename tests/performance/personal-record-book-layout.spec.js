import {expect,test} from '@playwright/test'

const bookState=page=>page.evaluate(()=>window.__CAMPUS_TEST__.personalRecords().book)
const clickTab=async(page,tab)=>{
  const point=await page.evaluate(tab=>{
    const book=window.__CAMPUS_TEST__.personalRecords().book,action=book.actions.find(item=>item.action===`tab:${tab}`)
    return {x:book.displayBounds.left+(action.left+action.right)/2/book.canvas[0]*book.displayBounds.width,
      y:book.displayBounds.top+(action.top+action.bottom)/2/book.canvas[1]*book.displayBounds.height}
  },tab)
  await page.mouse.click(point.x,point.y)
  await expect.poll(async()=>(await bookState(page)).page).toBe(tab)
}

for(const locale of ['zh-CN','en-US']){
  test.describe(locale,()=>{
    test.use({locale})
    test('all thirteen rows remain distinct and only real results appear in best records',async({page},testInfo)=>{
      const errors=[];page.on('pageerror',error=>errors.push(error.message))
      page.on('console',message=>{
        if(message.type()==='error'||/GL_INVALID_|WebGL: INVALID_/.test(message.text()))errors.push(message.text())
      })
      await page.goto(locale==='en-US'?'/en/':'/',{waitUntil:'networkidle'})
      await page.waitForFunction(()=>window.__CAMPUS_TEST__)
      await page.locator('#enter-campus').click()
      await expect(page.locator('#experience-gate')).toBeHidden({timeout:30000})
      await page.evaluate(()=>window.__CAMPUS_TEST__.ready())
      await page.evaluate(()=>{
        const api=window.__CAMPUS_TEST__
        api.clearPersonalRecords()
        api.recordPersonalGame('dodgeball',{increment:{played:1}})
        api.recordPersonalGame('shuttlecock',{max:{bestStreak:17}})
        api.recordPersonalMysteryDevice('handheldOctopus')
        api.recordPersonalMysteryDevice('handheldFire')
        api.recordPersonalGame('handheldFire',{max:{gameA:22}})
        api.openPersonalRecordBook('overview')
      })
      let book=await bookState(page)
      expect(book.bestRecordIds).toEqual(['shuttlecock','handheldFire'])
      expect(book.viewModel.games.find(game=>game.id==='dodgeball')).toMatchObject({played:true,hasRecord:false})
      await page.screenshot({path:testInfo.outputPath('overview-unfinished.png')})
      await clickTab(page,'games')
      for(const [width,height] of [[1920,1080],[960,540],[844,390],[390,844]]){
        await page.setViewportSize({width,height})
        await expect.poll(async()=>(await bookState(page)).canvas).toEqual(height>width?[900,1400]:[1400,900])
        book=await bookState(page)
        expect(book.gameRows).toHaveLength(13)
        expect(new Set(book.gameRows.map(row=>row.id)).size).toBe(13)
        expect(new Set(book.gameRows.map(row=>row.left)).size).toBe(height>width?1:2)
        expect(book.gameRows[0].id).toBe('dodgeball')
        for(const [index,row] of book.gameRows.entries()){
          expect(row.left).toBeGreaterThanOrEqual(74)
          expect(row.top).toBeGreaterThanOrEqual(205)
          expect(row.left+row.width).toBeLessThanOrEqual(book.canvas[0]-42)
          expect(row.top+row.height).toBeLessThanOrEqual(book.canvas[1]-64)
          for(const other of book.gameRows.slice(index+1)){
            expect(row.left<other.left+other.width&&other.left<row.left+row.width&&row.top<other.top+other.height&&other.top<row.top+row.height).toBe(false)
          }
        }
        const uploads=book.canvasTextureUploads
        await page.waitForTimeout(120)
        expect((await bookState(page)).canvasTextureUploads).toBe(uploads)
        expect(await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getError())).toBe(0)
        await page.screenshot({path:testInfo.outputPath(`games-${width}x${height}.png`)})
      }
      await page.evaluate(()=>{
        const api=window.__CAMPUS_TEST__
        api.recordPersonalGame('dodgeball',{played:false,max:{pingpongBest:0},increment:{completed:1}})
        api.openPersonalRecordBook('overview')
      })
      book=await bookState(page)
      expect(book.bestRecordIds).toEqual(['dodgeball','shuttlecock','handheldFire'])
      expect(book.viewModel.games.find(game=>game.id==='dodgeball')).toMatchObject({hasRecord:true,record:locale==='en-US'?'Ball 0':'乒乓球 0 分'})
      expect(errors).toEqual([])
    })
  })
}

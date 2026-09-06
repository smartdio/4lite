import test from 'node:test'
import assert from 'node:assert/strict'
import {layoutPersonalGameRows} from '../../src/ui/personal-record-book.js'

const overlaps=(a,b)=>a.left<b.left+b.width&&b.left<a.left+a.width&&a.top<b.top+b.height&&b.top<a.top+a.height

for(const [width,height] of [[1400,900],[900,1400]]){
  for(const count of [0,1,12,13,14,16]){
    test(`${count} game rows fit ${width}x${height} without overlaps or covering tabs/footer`,()=>{
      const rows=layoutPersonalGameRows(count,width,height)
      assert.equal(rows.length,count)
      rows.forEach((row,index)=>{
        assert.ok(row.left>=74&&row.top>=205)
        assert.ok(row.width>0&&row.height>0)
        assert.ok(row.left+row.width<=width-42)
        assert.ok(row.top+row.height<=height-64)
        rows.slice(index+1).forEach(other=>assert.equal(overlaps(row,other),false))
      })
    })
  }
}

test('thirteen landscape games occupy seven left rows and six right rows in catalogue order',()=>{
  const rows=layoutPersonalGameRows(13,1400,900)
  assert.equal(rows.filter(row=>row.left===74).length,7)
  assert.equal(rows[6].left,74)
  assert.equal(rows[7].top,205)
  assert.equal(rows[12].top,660)
  assert.notDeepEqual(rows[12],rows[6])
})

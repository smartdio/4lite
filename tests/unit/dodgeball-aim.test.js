import test from 'node:test'
import assert from 'node:assert/strict'
import * as playInput from '../../src/interactions/dodgeball/aim.js'

test('primary-button input includes the whole play area without picking or aiming at characters',()=>{
  for(const x of [0,100,960,1650,1920])for(const y of [300,540,720,869.99]) {
    assert.equal(playInput.isDodgeballPlayPoint(x,y),true,`${x},${y}`)
  }
})

test('score strip, touch controls, letterboxing and invalid input never trigger primary play actions',()=>{
  for(const [x,y] of [[960,0],[960,299.99],[960,870],[960,1080],[-.01,500],[1920.01,500],
    [NaN,500],[960,NaN],[Infinity,500],[960,-Infinity],['960',500],[960,null]]) {
    assert.equal(playInput.isDodgeballPlayPoint(x,y),false,`${x},${y}`)
  }
})

test('input helper exposes no mouse picker or touch-drag aiming API',()=>{
  assert.deepEqual(Object.keys(playInput),['isDodgeballPlayPoint'])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCubeMove,applyCubeMoves,createSolvedCubeState,generateCubeScramble,inverseCubeMove,
  isCubeSolved,serializeCubeState,validateCubeState,
} from '../../src/interactions/rubiks-cube-state.js'

test('four quarter turns restore the cube',()=>{
  const move={axis:'x',layer:1,direction:1}
  const state=applyCubeMoves(createSolvedCubeState(),[move,move,move,move])
  assert.equal(isCubeSolved(state),true)
})

test('a move and its inverse cancel',()=>{
  const move={axis:'z',layer:-1,direction:-1}
  const state=applyCubeMoves(createSolvedCubeState(),[move,inverseCubeMove(move)])
  assert.deepEqual(state,createSolvedCubeState())
})

test('a middle-slice turn moves its four centre cubies with the slice',()=>{
  const solved=createSolvedCubeState()
  const moved=applyCubeMove(solved,{axis:'x',layer:0,direction:1})
  const frontCentre=moved.cubies.find(cubie=>cubie.id==='0,0,1')
  assert.deepEqual(frontCentre.p,[0,-1,0])
  assert.notDeepEqual(frontCentre.o,[1,0,0,0,1,0,0,0,1])
  assert.deepEqual(
    serializeCubeState(applyCubeMoves(solved,Array.from({length:4},()=>({axis:'x',layer:0,direction:1})))),
    serializeCubeState(solved),
  )
})

test('seeded scrambles are stable, legal and unsolved',()=>{
  const first=generateCubeScramble(24,{seed:'rubiks-gate-b'})
  const second=generateCubeScramble(24,{seed:'rubiks-gate-b'})
  assert.deepEqual(first,second)
  assert.equal(first.some((move,index)=>index>0&&move.axis===first[index-1].axis),false)
  assert.equal(isCubeSolved(applyCubeMoves(createSolvedCubeState(),first)),false)
})

test('serialization round-trips and invalid states are rejected',()=>{
  const state=applyCubeMove(createSolvedCubeState(),{axis:'y',layer:0,direction:1})
  assert.deepEqual(validateCubeState(structuredClone(serializeCubeState(state))),state)
  const corrupt=structuredClone(state);corrupt.cubies[0].p=[0,0,0]
  assert.equal(validateCubeState(corrupt),null)
})

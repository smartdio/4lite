const IDENTITY=[1,0,0,0,1,0,0,0,1]
const AXIS_INDEX={x:0,y:1,z:2}
const AXES=Object.keys(AXIS_INDEX)

const cloneCubie=cubie=>({id:cubie.id,p:[...cubie.p],o:[...cubie.o]})
const idFor=(x,y,z)=>`${x},${y},${z}`
const parseId=id=>id.split(',').map(Number)

function multiply3(a,b) {
  const result=new Array(9).fill(0)
  for(let row=0;row<3;row++)for(let column=0;column<3;column++)for(let index=0;index<3;index++) {
    result[row*3+column]+=a[row*3+index]*b[index*3+column]
  }
  return result
}

function transformVector(matrix,vector) {
  return [
    matrix[0]*vector[0]+matrix[1]*vector[1]+matrix[2]*vector[2],
    matrix[3]*vector[0]+matrix[4]*vector[1]+matrix[5]*vector[2],
    matrix[6]*vector[0]+matrix[7]*vector[1]+matrix[8]*vector[2],
  ]
}

function rotationMatrix(axis,direction) {
  const dir=direction<0?-1:1
  if(axis==='x')return dir>0?[1,0,0,0,0,-1,0,1,0]:[1,0,0,0,0,1,0,-1,0]
  if(axis==='y')return dir>0?[0,0,1,0,1,0,-1,0,0]:[0,0,-1,0,1,0,1,0,0]
  if(axis==='z')return dir>0?[0,-1,0,1,0,0,0,0,1]:[0,1,0,-1,0,0,0,0,1]
  throw new Error(`Unknown Rubik axis: ${axis}`)
}

export function createSolvedCubeState() {
  const cubies=[]
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++) {
    if(x===0&&y===0&&z===0)continue
    cubies.push({id:idFor(x,y,z),p:[x,y,z],o:[...IDENTITY]})
  }
  cubies.sort((a,b)=>a.id.localeCompare(b.id))
  return {version:1,cubies}
}

export function cloneCubeState(state) {
  return {version:1,cubies:state.cubies.map(cloneCubie)}
}

export function applyCubeMove(state,move) {
  const axis=move?.axis,layer=Number(move?.layer),direction=move?.direction<0?-1:1
  if(!AXES.includes(axis)||![-1,0,1].includes(layer))throw new Error('Invalid Rubik move')
  const axisIndex=AXIS_INDEX[axis],rotation=rotationMatrix(axis,direction)
  const next=cloneCubeState(state)
  for(const cubie of next.cubies) {
    if(cubie.p[axisIndex]!==layer)continue
    cubie.p=transformVector(rotation,cubie.p).map(value=>Math.round(value))
    cubie.o=multiply3(rotation,cubie.o).map(value=>Math.round(value))
  }
  return next
}

export const inverseCubeMove=move=>({axis:move.axis,layer:move.layer,direction:move.direction<0?1:-1})

function hashText(text) {
  let value=2166136261
  for(let index=0;index<text.length;index++){value^=text.charCodeAt(index);value=Math.imul(value,16777619)}
  return value>>>0
}

function seededRandom(seed) {
  let state=hashText(seed)||1
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}
}

export function generateCubeScramble(count,{seed='rubiks-cube',random=null}={}) {
  const nextRandom=random??seededRandom(seed),moves=[]
  while(moves.length<count) {
    const axis=AXES[Math.floor(nextRandom()*AXES.length)]
    if(moves.at(-1)?.axis===axis)continue
    const layer=nextRandom()<.5?-1:1
    const direction=nextRandom()<.5?-1:1
    moves.push({axis,layer,direction})
  }
  return moves
}

export function applyCubeMoves(state,moves) {
  return moves.reduce((current,move)=>applyCubeMove(current,move),state)
}

const stickerColor=(axis,sign)=>`${axis}${sign>0?'+':'-'}`
const vectorKey=vector=>vector.join(',')

export function isCubeSolved(state) {
  const faces=new Map()
  for(const cubie of state.cubies) {
    const home=parseId(cubie.id)
    for(let axis=0;axis<3;axis++) {
      if(home[axis]===0)continue
      const local=[0,0,0];local[axis]=Math.sign(home[axis])
      const world=transformVector(cubie.o,local).map(value=>Math.round(value))
      const key=vectorKey(world),color=stickerColor(AXES[axis],home[axis])
      if(!faces.has(key))faces.set(key,[])
      faces.get(key).push(color)
    }
  }
  if(faces.size!==6)return false
  return [...faces.values()].every(colors=>colors.length===9&&colors.every(color=>color===colors[0]))
}

function determinant3(matrix) {
  return matrix[0]*(matrix[4]*matrix[8]-matrix[5]*matrix[7])
    -matrix[1]*(matrix[3]*matrix[8]-matrix[5]*matrix[6])
    +matrix[2]*(matrix[3]*matrix[7]-matrix[4]*matrix[6])
}

function validOrientation(matrix) {
  if(!Array.isArray(matrix)||matrix.length!==9||matrix.some(value=>![-1,0,1].includes(value)))return false
  for(let row=0;row<3;row++)if(matrix.slice(row*3,row*3+3).filter(Boolean).length!==1)return false
  for(let column=0;column<3;column++)if([matrix[column],matrix[column+3],matrix[column+6]].filter(Boolean).length!==1)return false
  return determinant3(matrix)===1
}

export function validateCubeState(value) {
  const solved=createSolvedCubeState(),ids=new Set(solved.cubies.map(cubie=>cubie.id))
  if(value?.version!==1||!Array.isArray(value.cubies)||value.cubies.length!==26)return null
  const positions=new Set(),seenIds=new Set(),cubies=[]
  for(const candidate of value.cubies) {
    if(!ids.has(candidate?.id)||seenIds.has(candidate.id))return null
    if(!Array.isArray(candidate.p)||candidate.p.length!==3||candidate.p.some(number=>![-1,0,1].includes(number)))return null
    if(candidate.p.every(number=>number===0)||!validOrientation(candidate.o))return null
    const positionKey=candidate.p.join(',')
    if(positions.has(positionKey))return null
    positions.add(positionKey);seenIds.add(candidate.id);cubies.push(cloneCubie(candidate))
  }
  cubies.sort((a,b)=>a.id.localeCompare(b.id))
  return {version:1,cubies}
}

export function serializeCubeState(state) {
  const valid=validateCubeState(state)
  if(!valid)throw new Error('Cannot serialize invalid Rubik state')
  return valid
}

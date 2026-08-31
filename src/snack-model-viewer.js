import {createPropModelViewer} from './prop-model-viewer.js'

export function createSnackModelViewer({renderer}) {
  const viewer=createPropModelViewer({renderer})
  return {
    ...viewer,
    open:(source,item)=>viewer.open(source,item,{
      kind:'snack',title:'卜卜星 海鲜味',initialRotationY:Math.PI-.10,pitch:-.08,
    }),
  }
}

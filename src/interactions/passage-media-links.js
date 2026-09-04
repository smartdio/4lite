import * as THREE from 'three'
import {SITE_LINKS} from '../site-links.js'
import {translateRuntimeText} from '../i18n/index.js'

const LINK_LAYOUT=[
  {siteLinkId:'xiaohongshu',displayLabel:'小红书',hudInteraction:'open-xiaohongshu',bounds:[.788,.852,.15,.37]},
  {siteLinkId:'weibo',displayLabel:'微博',hudInteraction:'open-weibo',bounds:[.858,.927,.15,.37]},
  {siteLinkId:'x',displayLabel:'X',hudInteraction:'open-x',bounds:[.788,.852,.385,.61]},
  {siteLinkId:'wechat-channels',displayLabel:'视频号',hudInteraction:'show-wechat-qr',bounds:[.858,.927,.385,.61]},
  {siteLinkId:'github',displayLabel:'GitHub',hudInteraction:'open-github',bounds:[.788,.852,.615,.855]},
  {siteLinkId:'vercel',displayLabel:'在线体验',hudInteraction:'open-vercel',bounds:[.858,.927,.615,.855]},
]

const defaultOpenExternal=href=>{
  const anchor=document.createElement('a')
  anchor.href=href
  anchor.target='_blank'
  anchor.rel='noopener noreferrer'
  anchor.hidden=true
  anchor.dataset.passageExternalLink='true'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  return true
}

export function createPassageMediaLinks({camera,renderer,board,maxDistance=2.5,openExternal=defaultOpenExternal}) {
  if(!board)throw new Error('Passage media links require the east passage blackboard anchor')
  const normal=new THREE.Vector3(board.normal[0],0,board.normal[1]).normalize()
  const tangent=new THREE.Vector3(board.normal[1],0,-board.normal[0]).normalize()
  const center=new THREE.Vector3(
    board.wallCenter[0]+board.normal[0]*board.boardOffset,
    board.floorY+board.board.bottom+board.board.height/2,
    board.wallCenter[1]+board.normal[1]*board.boardOffset,
  )
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center)
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),point=new THREE.Vector3(),delta=new THREE.Vector3()
  const links=LINK_LAYOUT.map(layout=>{
    const link=SITE_LINKS.find(item=>item.id===layout.siteLinkId)
    if(!link)throw new Error(`Missing configured site link: ${layout.siteLinkId}`)
    return {...layout,href:link.href,qrImageUrl:link.qrImageUrl??null}
  })

  const hit=(clientX,clientY,useCenter=false)=>{
    if(plane.distanceToPoint(camera.position)<=0)return null
    const rect=renderer.domElement.getBoundingClientRect()
    pointer.set(
      useCenter?0:(clientX-rect.left)/rect.width*2-1,
      useCenter?0:-((clientY-rect.top)/rect.height)*2+1,
    )
    raycaster.setFromCamera(pointer,camera)
    if(!raycaster.ray.intersectPlane(plane,point))return null
    const distance=raycaster.ray.origin.distanceTo(point)
    if(distance>maxDistance)return null
    delta.copy(point).sub(center)
    const u=delta.dot(tangent)/board.board.width+.5
    const v=.5-delta.y/board.board.height
    const link=links.find(({bounds:[left,right,top,bottom]})=>u>=left&&u<=right&&v>=top&&v<=bottom)
    return link?{
      id:link.siteLinkId,label:translateRuntimeText(link.displayLabel),sourceLabel:link.siteLinkId,hudInteraction:link.hudInteraction,
      href:link.href,qrImageUrl:link.qrImageUrl,
      distance,uv:[u,v],
    }:null
  }

  const interact=(clientX,clientY,useCenter=false)=>{
    const link=hit(clientX,clientY,useCenter)
    if(!link)return null
    if(link.qrImageUrl)return {...link,type:'show-passage-site-qr'}
    openExternal(link.href)
    return {...link,type:'open-passage-media-link'}
  }

  return {
    hit,interact,
    snapshot:()=>({
      boardId:board.id,proxyCount:links.length,strategy:'board-local-rectangles',maxDistance,
      links:links.map(({siteLinkId,displayLabel,hudInteraction,href,qrImageUrl,bounds})=>({
        id:siteLinkId,label:translateRuntimeText(displayLabel),hudInteraction,href,qrImageUrl,bounds:[...bounds],
      })),
    }),
  }
}

export default {
  meta:{title:'四小 · 4Lite',description:'四小 4Lite：回到记忆中的八十年代校园。'},
  brand:{name:'四小',romanization:'Sì Xiǎo',translation:'No. 4 Primary School'},
  language:{switchLabel:'语言',switchText:'EN',switchAria:'Switch to English'},
  entry:{
    aria:'四小',copy:'风从走廊那边吹过来。<br>回去看看，那年的校园。',enter:'回到那年夏天',
    musicOn:'音乐开启',musicOff:'开启音乐',musicPlayAria:'播放背景音乐',musicPauseAria:'暂停背景音乐',
    linksAria:'项目说明',story:'故事',about:'关于',help:'帮助',footnote:'建议佩戴耳机 · 点击后载入校园',
    entering:'正在走回校园……',enteringCopy:'旧课桌、走廊和树影正在醒来。<br>第一次进入需要一点时间。',
    loadError:'校园暂时没有载入成功，请刷新页面后重试。',
  },
  loading:{
    visual:'正在准备校园…',eyebrow:'进入校园以前',retry:'重新加载',preparing:'准备资源 {completed} / {total}',readyCount:'校园已经准备好',
    readyMessage:'放学以前，再去校园里走一走吧。',failure:'有一部分校园资源没有准备好。',
    messages:['正在整理旧课桌和走廊……','正在让阳光落进教室……','正在叫醒操场边的树影……','正在把风送回校园……'],
    tips:[
      ['在校园里慢慢走','从校门进入，以第一人称探索走廊、教室、操场和树荫，也可以随时切换鸟瞰。'],
      ['推开门，坐回课桌旁','靠近教室里的门窗和课桌，用准星寻找互动提示；坐下以后还可以翻看旧课本和作业本。'],
      ['在黑板上留下几笔','22块教学黑板都可以书写、擦除和撤销，画下的内容会保存在当前浏览器里。'],
      ['捡起一支粉笔','讲台和教室里散落着粉笔。拾起后可以蓄力抛出，落地的粉笔还能再次捡起。'],
      ['去操场投几个球','校园里的篮球可以拾取、投掷、推动和踢动；从不同距离命中会得到2分、3分或4分。'],
      ['打一局旧球桌乒乓球','西侧六张乒乓球桌都能游玩，可以自由练习，也可以和电脑进行先得7分的比赛。'],
      ['看见绿色标记就能前往','稍微看向地面，出现绿色定位标记时点击或轻触即可自动走过去；途中仍可环视，再次点击或使用移动键即可停止。'],
      ['手机也可以走进校园','左侧摇杆负责移动，拖动画面观察方向；绿色标记出现时轻触前往，对准物件时轻触互动。'],
    ],
  },
  accessibility:{touchLook:'拖动观察方向；绿色定位标记出现时轻触前往，自动行走中轻触停止；对准物件时轻触互动',joystick:'移动摇杆'},
  routes:{home:'/',about:'./about/',help:'./help/',story:'./stories/'},
}

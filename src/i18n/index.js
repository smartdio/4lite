import zhCN from './locales/zh-CN.js'
import en from './locales/en.js'

export const SUPPORTED_LOCALES=Object.freeze(['zh-CN','en'])
const currentPathname=globalThis.location?.pathname??'/'
export const currentLocale=currentPathname==='/en'||currentPathname.startsWith('/en/')?'en':'zh-CN'
export const isEnglish=currentLocale==='en'
const messages=currentLocale==='en'?en:zhCN

const interpolate=(value,variables={})=>String(value).replace(/\{([\w]+)\}/g,(_,key)=>{
  if(!(key in variables))throw new Error(`Missing i18n variable: ${key}`)
  return String(variables[key])
})

export const t=(key,variables)=>{
  const value=key.split('.').reduce((entry,part)=>entry?.[part],messages)
  if(typeof value!=='string')throw new Error(`Missing ${currentLocale} translation: ${key}`)
  return interpolate(value,variables)
}

export const getMessages=()=>messages
export const localizedPath=page=>messages.routes[page]??(()=>{throw new Error(`Unknown localized route: ${page}`)})()
export const alternateLocalePath=()=>{
  const path=currentPathname
  if(currentLocale==='en')return path.replace(/^\/en(?=\/|$)/,'')||'/'
  if(path==='/')return'/en/'
  return `/en${path}`.replace(/\/{2,}/g,'/')
}

const ENGLISH_RUNTIME_TEXT=new Map(Object.entries({
  '热血躲避':'Hot-Blooded Dodge','点击进入热血躲避':'Play Hot-Blooded Dodge','已离开热血躲避':'Exited Hot-Blooded Dodge',
  '鸟瞰':'Aerial View','第一人称':'First Person','快捷键 V':'Shortcut V','个人记录':'My Record','查看校园足迹':'View your campus trail',
  '点击前往 · 再次停止':'Click to walk · Click again to stop','轻触前往 · 再次停止':'Tap to walk · Tap again to stop',
  '暂停':'Paused','选择继续游戏或返回校园':'Resume or exit','继续游戏':'Resume','返回校园':'Exit',
  '退出':'EXIT','玩法':'HOW TO PLAY','比赛':'MATCH','练习':'PRACTICE','7分比赛':'7-POINT MATCH','玩家':'PLAYER','电脑':'COMPUTER','对手':'OPPONENT',
  '玩家 +1':'PLAYER +1','电脑 +1':'COMPUTER +1','对手 +1':'OPPONENT +1',
  '点击查看':'Click to view','点击打开网页':'Click to open the website','点击查看二维码':'Click to view the QR code',
  '点击打开小红书':'Open Xiaohongshu','点击打开微博':'Open Weibo','点击打开 X':'Open X','点击查看视频号二维码':'View the WeChat Channels QR code',
  '点击打开 GitHub':'Open GitHub','点击打开在线体验':'Open the live project','点击开门':'Click to open','点击开窗':'Click to open',
  '点击拾取粉笔':'Click to pick up chalk','点击拾取篮球':'Click to pick up the ball','按住蓄力 · 松开投篮':'Hold to charge · Release to shoot',
  '点击坐下':'Click to sit','点击起身':'Click to stand','点击开始乒乓球':'Play table tennis','点击开始攀爬':'Start climbing',
  '点击投掷粉笔':'Click to throw the chalk','点击书写':'Click to draw','点击玩掌机':'Play the handheld','点击玩魔方':'Play with the cube',
  '点击开始跳远':'Start the long jump','点击开始跳房子':'Play hopscotch','点击开始踢毽子':'Play shuttlecock','点击玩抓石子':'Play jacks','点击升旗':'Raise the flag',
  '点击选择木弹弓':'Choose the wooden slingshot','点击选择铁弹弓':'Choose the wire slingshot','点击从5米开始':'Start at 5 metres','点击从10米开始':'Start at 10 metres',
  'WASD／方向键移动 · 鼠标观察':'WASD / arrow keys to move · Mouse to look','看向地面，出现绿色标记后点击前往':'Look down · Click the green marker to walk',
  '看向地面，出现绿色标记后轻触前往':'Look down · Tap the green marker to walk','也可用左侧摇杆移动，拖动画面观察':'Or use the left joystick · Drag to look',
  '篮球玩法':'BASKETBALL','乒乓球玩法':'TABLE TENNIS','弹弓玩法':'SLINGSHOT',
  '1. 对准篮球，点击拾取':'1. Aim at the ball and click to pick it up','2. 按住鼠标左键蓄力，松开投篮':'2. Hold the left mouse button, then release to shoot','3. F 踢球 · R 重置篮球':'3. F kick · R reset balls',
  '1. 轻触篮球拾取':'1. Tap the ball to pick it up','2. 按住右下角投篮键蓄力，松开投篮':'2. Hold the shoot button, then release','3. 双指拖动画面可重置篮球':'3. Drag with two fingers to reset balls',
  '1. 对准球桌，点击进入练习':'1. Aim at a table and click to practise','2. 点击抛球，移动鼠标控制球拍':'2. Click to toss · Move the mouse to swing','3. M 开始7分比赛 · X 退出 · Esc 暂停':'3. M match · X exit · Esc pause',
  '1. 轻触球桌进入练习':'1. Tap a table to practise','2. 按住移动球和球拍，松手抛球':'2. Hold to move the ball and paddle · Release to toss','3. 再次触摸挥拍，上方按钮比赛／退出':'3. Touch again to swing · Use Match / Exit above',
  '1. 移动视角调整角度，按住鼠标蓄力':'1. Look to aim · Hold the mouse button to charge','2. 松开发射；满力保持过久会抖动':'2. Release to fire · Holding full power causes sway','3. W／↑ 5米 · S／↓ 10米 · X退出 · Esc暂停':'3. W / ↑ 5 m · S / ↓ 10 m · X exit · Esc pause',
  '1. 在画面任意位置拖动瞄准':'1. Drag anywhere on the screen to aim','2. 只有按住弹兜才会蓄力，松开发射':'2. Hold the pouch to charge · Release to fire','3. 点击“距离”按钮切换5米／10米':'3. Tap Distance to switch between 5 m and 10 m',
  '按住绳子向下拉 · 松开后再拉　X退出 · Esc暂停':'Pull the rope down · Release and pull again · X exit · Esc pause',
  '按住绳子向下拖动 · 松开后再拉':'Drag the rope down · Release and pull again','升旗完成 · X退出 · Esc暂停':'Flag raised · X exit · Esc pause','升旗完成 · 点击右上角退出':'Flag raised · Tap Exit above',
  '点击石子 再接子王':'Tap a jack · Then catch the king','瞄准后按住 松手投片':'Aim · Hold · Release to throw','看准时机':'Watch the timing',
  'W／↑ 5米　S／↓ 10米':'W / ↑ 5 m   S / ↓ 10 m','拖动瞄准 · 按住弹兜发射':'Drag to aim · Hold the pouch to fire',
  '左':'LEFT','右':'RIGHT','命中':'HIT','准备起跳':'GET READY','看准十二点':'TIME THE MARK','正在蓄力':'CHARGING','落地':'LANDING',
  '按住锁定角度':'Hold to lock the angle','松开起跳 · 不要越线':'Release to jump · Do not cross the line',
  '好球':'GREAT SHOT','扣杀':'SMASH','得分':'POINT','比赛结束':'MATCH OVER','玩家胜':'YOU WIN','电脑胜':'COMPUTER WINS',
  '这里走不过去':'You cannot walk through here','已停止':'Stopped','小红书':'Xiaohongshu','微博':'Weibo','视频号':'WeChat Channels','视频号二维码':'WeChat Channels QR code','视频号 Mo麥AI':'WeChat Channels · Mo麥AI','在线体验':'Live Project',
  '请先把手里的粉笔抛出':'Throw the chalk you are holding first','请先把手里的篮球投出或复位':'Shoot or reset the basketball first','请先离开乒乓球模式':'Exit table tennis first',
  '请先离开爬竹竿模式':'Exit bamboo climbing first','请先离开跳远模式':'Exit the long jump first','请先离开踢毽子模式':'Exit shuttlecock first','请先离开抓石子模式':'Exit jacks first',
  '请先离开掌机模式':'Exit the handheld game first','请先退出魔方':'Exit the cube first','请先放下弹弓':'Put down the slingshot first','请先离开升旗台':'Leave the flag platform first',
  '已离开跳远模式':'Exited long jump','已离开抓石子':'Exited jacks','已离开跳房子':'Exited hopscotch','已离开踢毽子模式':'Exited shuttlecock','已离开爬竹竿模式':'Exited bamboo climbing',
  '已收起掌机':'Handheld put away','请先放下手里的物品':'Put down the item you are holding first','已放下魔方':'Cube put away','国旗已经升起':'The flag is already raised','已离开升旗台':'Left the flag platform',
  '已离开乒乓球模式':'Exited table tennis','手持篮球时不能坐下':'You cannot sit while holding a basketball','已坐下 · 点击地面起身':'Seated · Click the ground to stand','已起身':'Standing',
  '已拿起粉笔 · 点击准星方向抛出':'Chalk picked up · Click to throw towards the crosshair','粉笔已抛出':'Chalk thrown','粉笔已全部收回':'All chalk reset',
  '已拿起篮球 · 拖动转向，按住右下角投篮按钮蓄力':'Basketball picked up · Drag to aim · Hold the shoot button to charge','已拿起篮球 · 按住左键蓄力，松开投篮':'Basketball picked up · Hold to charge · Release to shoot',
  '已踢出篮球':'Basketball kicked','篮球已全部复位':'All basketballs reset','手持篮球时不能进入黑板模式':'You cannot use a blackboard while holding a basketball',
  '已进入黑板绘画模式':'Blackboard drawing mode','已离开黑板绘画模式':'Exited blackboard drawing','当前浏览器已切换为拖动视角模式':'Switched to drag-to-look mode',
  '未能恢复鼠标控制 · 请再点一次继续游戏':'Mouse control was not restored · Click Resume again','未能重新锁定 · 请再点击一次画面':'Mouse control was not locked · Click the view again',
  '鼠标视角已锁定 · Esc 释放':'Mouse look active · Esc to release','鼠标已释放 · 点击画面重新锁定':'Mouse released · Click the view to resume',
  '这里可以跳远 · 对准踏板点击开始':'Long jump available · Aim at the board and click to start',
  '校园小物':'Campus Object','点击互动':'Click to interact','点击开合':'Click to open / close','点击翻面':'Click to flip','魔方':'Rubik’s Cube','撤销':'UNDO','打乱':'SHUFFLE','复原':'RESET',
  '拼好了！':'Solved!','暂时没有可以撤销的转动':'No move to undo','已经重新打乱':'Shuffled','已经复原':'Reset',
  '拖动贴纸转动\n空白处旋转观察':'Drag a sticker to turn\nDrag empty space to look','拖动贴纸转动 · 空白处旋转观察':'Drag a sticker to turn · Drag empty space to look',
  '按 Q 用左脚开始':'Press Q to start with the left foot','换另一只脚':'Use the other foot','没接住':'Missed it','出界了':'Out of bounds','挪过去接':'Move into position','看准落下时':'Watch it fall',
  '轻轻撒开石子':'Scatter the jacks gently','对准了 · 点击接回子王':'Lined up · Click to catch the king','移动光标到子王下方':'Move under the king','碰动别的石子了':'Another jack moved',
  '没有接住子王':'You missed the king','子王落下来了':'The king fell','这一把重来':'Try this turn again','先移动光标，对准石子':'Aim at a jack first','移动光标接回子王':'Move to catch the king',
  '手要移到子王下方':'Move under the king','先移动光标接子王':'Move to catch the king first','一、二、三都抓完了 · 点击退出':'All three rounds complete · Click Exit',
  '左手开始':'Start with the left hand','脱手 再试':'Slipped · Try again','到顶':'At the top','跳得真远！':'Great jump!','不错！':'Nice!','再来一次！':'Try again!','再用点力！':'A little more power!','用力过头啦！':'Too much power!',
  '投短了':'Too short','投过格了':'Too far','没有投进格子':'Missed the square','投错格了':'Wrong square','瓦片压线了':'Tile touched the line','踩进瓦片格了':'Stepped in the tile square','跳错格了':'Wrong square',
  '双格要双脚落地':'Land with both feet','这一格要单脚落地':'Land on one foot','踩线了':'Stepped on the line','这一轮完成':'Round complete','转身':'Turn around','捡回瓦片':'Pick up the tile','继续跳回来':'Hop back',
  '回合进行中':'Rally in progress','点击抛球':'Click to toss','移动球拍击球':'Move the paddle to hit','本回合结束':'Point over','等待对手发球':'Waiting for the opponent to serve',
  '移动球和球拍 · 松手抛球':'Move the ball and paddle · Release to toss','球下落时移动球拍击球':'Move the paddle as the ball falls','7分制 · 按住移动，松手抛球':'First to 7 · Hold to move · Release to toss',
  '7分制 · 点击抛球':'First to 7 · Click to toss','点击抛球；下落时移动球拍击球':'Click to toss · Move the paddle as it falls','按住移动球和球拍，松手抛球':'Hold to move the ball and paddle · Release to toss',
  '手持粉笔 · 点击抛出':'Holding chalk · Click to throw','卜卜星 海鲜味':'Bubuxing · Seafood Flavour','铁皮铅笔盒':'Tin Pencil Case',
  '篮球':'Basketball','乒乓球':'Table Tennis','跳远':'Long Jump','爬竹竿':'Bamboo Climb','跳房子':'Hopscotch','踢毽子':'Shuttlecock','抓石子':'Jacks','弹弓':'Slingshot','升旗':'Flag Raising',
  'Octopus 掌机':'Octopus Handheld','Fire 掌机':'Fire Handheld','神秘掌机':'Mystery Handheld','卜卜星零食':'Bubuxing Snacks',
  '个人纪录册':'My Record Book','我的校园足迹 · 本机保存':'My Campus Trail · Saved on this device','持续记录中':'RECORDING',
  '总览':'OVERVIEW','游戏纪录':'GAME RECORDS','神秘任务':'MYSTERIES','参观房间':'Rooms Visited','看过书籍':'Books Viewed','看过物件':'Objects Viewed','玩过游戏':'Games Played','种':'types',
  '我的最佳纪录':'My Best Records','尚无纪录':'No record yet','玩一次游戏，第一条纪录会留在这里。':'Play a game and your first record will appear here.',
  '零食任务':'Snack Hunt','尚未发现':'Not Found','已有个人纪录':'Personal record saved','未玩过':'Not Played',
  '完成任意一个任务，就盖上一枚发现章。':'Complete any task to earn a discovery stamp.','食':'S','机':'G','神秘物件':'Mystery Object',
  '已经找到并打开过':'Found and opened','尚未发现，不显示名称与所在房间':'Not found; its name and location remain hidden','已发现':'FOUND','进行中':'IN PROGRESS','未发现':'NOT FOUND',
  '界面数据来自当前浏览器 · 清除网站数据会同时清除纪录':'Records are stored in this browser · Clearing site data removes them','点右上角 × 返回校园':'Tap × above to return to campus','Esc 返回校园':'Esc · Return to Campus',
  '暂停漫游':'Campus Paused','选择继续校园漫游，或翻开个人纪录册':'Resume exploring or open your personal record book','继续漫游':'Resume Exploring','Esc 关闭菜单':'Esc · Close Menu',
  '板擦':'ERASER','清空':'CLEAR','完成':'DONE','黑板绘画':'Blackboard Drawing','按住并拖动，在黑板上留下粉笔痕迹':'Hold and drag to leave chalk marks','黑板绘画工具':'Blackboard drawing tools','粉笔颜色':'Chalk colours',
  '玩法':'HOW TO PLAY','操作':'CONTROLS','模式':'MODE','键盘':'KEYBOARD','向右取宝 · 向左返船 · 躲避触手 · 三次失误结束':'Move right for treasure · Return left · Dodge the tentacles · Three misses end the game',
  '点按主机左右键移动、取宝和返船':'Tap the handheld’s left and right buttons to move, collect treasure and return','点按 GAME A / GAME B / TIME · 右上角退出':'Tap GAME A / GAME B / TIME · Exit at the top right',
  '左右移动担架，接住跳楼者并送往救护车':'Move the stretcher · Catch the jumpers · Carry them to the ambulance','点按主机左右红键移动':'Tap the handheld’s red left and right buttons to move',
  '←/A 左移 · →/D 右移 · 1 游戏A · 2 游戏B · T 时钟 · X 退出 · Esc 暂停':'←/A left · →/D right · 1 Game A · 2 Game B · T clock · X exit · Esc pause',
  '再按一次“打乱”确认':'Press “SHUFFLE” again to confirm','再按一次“复原”确认':'Press “RESET” again to confirm',
  '发球未先落本方台面':'The serve did not bounce on your side first','发球连续落在本方':'The serve bounced twice on the same side','对方未在第二跳前回球':'No return before the second bounce','回球未越过球网':'The return did not cross the net',
  '触网未过':'The ball hit the net','未完成发球':'Serve not completed','未能回球':'Return missed','回球出界':'Return went out','抛球后未击中':'Toss missed','测试判定':'Test decision',
  '合法发球需先落本方台面':'A legal serve must bounce on your side first','用力压低回球':'Drive the return low','发球已击出 · 需先落本方台面':'Serve struck · It must bounce on your side first','球下落时移动球拍击球':'Move the paddle as the ball falls',
  '玩家赢得本局':'You win the match','对手赢得本局':'Opponent wins the match',
  '花仙子铁皮铅笔盒':'Flower Fairy Tin Pencil Case','孙悟空铁皮铅笔盒':'Sun Wukong Tin Pencil Case','黑猫警长铁皮铅笔盒':'Black Cat Detective Tin Pencil Case','聪明的一休铁皮铅笔盒':'Ikkyū Tin Pencil Case',
  '拖动旋转':'Drag to rotate','滚轮缩放':'Scroll to zoom','关闭':'Close','白色粉笔':'White chalk','粉色粉笔':'Pink chalk','黄色粉笔':'Yellow chalk','蓝色粉笔':'Blue chalk','绿色粉笔':'Green chalk',
}))

const runtimePatterns=[
  [/^正在打开(.+)$/u,(_,name)=>`Opening ${translateRuntimeText(name)}`],
  [/^(门|中窗|气窗)已(打开|关闭)$/u,(_,part,state)=>`${part==='门'?'Door':part==='中窗'?'Window':'Transom'} ${state==='打开'?'opened':'closed'}`],
  [/^(?:辅助弧线已拟合 · )?(\d+)分球 · 力量 (\d+)%$/u,(_,points,power)=>`${points}-point shot · Power ${power}%`],
  [/^篮球已出手 · (\d+)分球 · 力量 (\d+)%$/u,(_,points,power)=>`Ball released · ${points}-point shot · Power ${power}%`],
  [/^(\d+) 次！$/u,(_,value)=>`${value} in a row!`],[/^(左|右)脚 · (\d+)$/u,(_,foot,value)=>`${foot==='左'?'Left':'Right'} foot · ${value}`],
  [/^落地 · (\d+) 次$/u,(_,value)=>`Dropped · ${value} hits`],[/^抓(\d+)完成$/u,(_,value)=>`Round ${value} complete`],[/^接住了 · 还剩(\d+)枚$/u,(_,value)=>`Caught · ${value} left`],
  [/^把瓦片投进第 (\d+) 格$/u,(_,value)=>`Throw the tile into square ${value}`],[/^绕过第 (\d+) 格$/u,(_,value)=>`Skip square ${value}`],[/^(\d+) 格全部完成$/u,(_,value)=>`All ${value} squares complete`],
  [/^两分球 \+2$/u,()=> '2-POINT SHOT +2'],[/^三分球 \+3$/u,()=> '3-POINT SHOT +3'],[/^四分球 \+4$/u,()=> '4-POINT SHOT +4'],
  [/^神秘发现 · (\d+) \/ (\d+)$/u,(_,value,total)=>`Discoveries · ${value} / ${total}`],
  [/^找到三包，完成这一项任务 · 已找到 (\d+) \/ (\d+)$/u,(_,value,total)=>`Find all three bags · Found ${value} / ${total}`],
  [/^(玩家|对手)得分 · (.+)$/u,(_,side,reason)=>`${side==='玩家'?'You':'Opponent'} scored · ${translateEnglishRuntimeText(reason)}`],
  [/^撒开石子 · 抓(\d+)$/u,(_,stage)=>`Scatter the jacks · Pick up ${stage}`],[/^子王抛起来了 · 移动光标抓(\d+)$/u,(_,stage)=>`King tossed · Aim to pick up ${stage}`],
  [/^对准石子 · 点击抓(\d+)$/u,(_,stage)=>`Aim at the jacks · Click to pick up ${stage}`],[/^抓(\d+) · (点击抛起子王|再来一把|重新来)$/u,(_,stage,action)=>`Round ${stage} · ${action==='点击抛起子王'?'Click to toss the king':action==='再来一把'?'Another turn':'Try again'}`],
  [/^(抓稳|用力) \+(\d+)厘米$/u,(_,kind,value)=>`${kind==='抓稳'?'Steady':'Strong'} +${value} cm`],
  [/^(.+)教学黑板绘画区域$/u,()=>`Teaching blackboard drawing area`],
]

function translateEnglishRuntimeText(value){
  if(value==null)return value
  const source=String(value),exact=ENGLISH_RUNTIME_TEXT.get(source)
  if(exact!=null)return exact
  for(const [pattern,format] of runtimePatterns){const match=source.match(pattern);if(match)return format(...match)}
  return source
}

export const translateRuntimeTextForLocale=(value,locale=currentLocale)=>locale==='en'?translateEnglishRuntimeText(value):value
export const translateRuntimeText=value=>translateRuntimeTextForLocale(value,currentLocale)

export const formatDistanceMetres=value=>isEnglish?`${Number(value).toFixed(2)} m`:`${Number(value).toFixed(2)} 米`
export const formatInteger=value=>new Intl.NumberFormat(currentLocale==='en'?'en':'zh-CN',{maximumFractionDigits:0}).format(value)

export function createTranslator(locale='zh-CN'){
  if(!SUPPORTED_LOCALES.includes(locale))throw new Error(`Unsupported locale: ${locale}`)
  const selected=locale==='en'?en:zhCN
  return {
    locale,
    t:(key,variables)=>{
      const value=key.split('.').reduce((entry,part)=>entry?.[part],selected)
      if(typeof value!=='string')throw new Error(`Missing ${locale} translation: ${key}`)
      return interpolate(value,variables)
    },
    localizedPath:page=>{
      const value=selected.routes[page]
      if(typeof value!=='string')throw new Error(`Unknown localized route: ${page}`)
      return value
    },
    formatDistanceMetres:value=>locale==='en'?`${Number(value).toFixed(2)} m`:`${Number(value).toFixed(2)} 米`,
    formatInteger:value=>new Intl.NumberFormat(locale==='en'?'en':'zh-CN',{maximumFractionDigits:0}).format(value),
  }
}

export const localeMessages=Object.freeze({'zh-CN':zhCN,en})

"use strict";
// ==================== 全局状态 ====================
const game = {
  mode: 'local',
  difficulty: 'easy',
  aiLevel: 'medium',
  aiPlayerIndex: -1,
  deck: [],
  players: [],
  phase: 'menu',
  timerSec: 0, timerInterval: null,
  maxCards: 5, target: 21,
  stats: { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 },
  aiThinking: false, aiTimerId: null, aiCountdown: 0, aiCountdownInterval: null,
  aiSolved: false, aiSolution: null,
  _maxHintShown: false, _firstRender: false
};

function getOps() {
  const d = game.difficulty;
  if (d === 'easy') return ['+','-','*','/'];
  if (d === 'normal') return ['+','-','*','/','^'];
  return ['+','-','*','/','^'];
}
function hasUnary() { return game.difficulty !== 'easy'; }
function hasFactorial() { return game.difficulty === 'hard'; }

// ==================== 牌库 ====================
function createDeck() {
  const deck = [];
  const max = game.difficulty === 'easy' ? 10 : 13;
  for (let v = 1; v <= max; v++) {
    for (let i = 0; i < 4; i++) deck.push(v);
  }
  return deck;
}
function shuffle(a) { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} }
function drawCard() { return game.deck.length ? game.deck.pop() : null; }

// ==================== 计时器 ====================
function startTimer() { game.timerSec=0;updateTimerUI();stopTimer();game.timerInterval=setInterval(()=>{game.timerSec++;updateTimerUI();updateFooterBar();updateSolutionHint()},1000) }
function stopTimer() { if(game.timerInterval){clearInterval(game.timerInterval);game.timerInterval=null} }
function updateTimerUI() { const m=Math.floor(game.timerSec/60),s=game.timerSec%60;document.getElementById('timer').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0') }
function updateDeckCount() { document.getElementById('deck-count').textContent=game.deck.length }

// ==================== 卡片显示 ====================
const SUITS = ['spade','heart','club','diamond'];
function getSuit(v) { return SUITS[(v-1)%4] }
function isRedSuit(v) { const s=getSuit(v);return s==='heart'||s==='diamond' }
function cardFace(v) { if(v===1)return'A';if(v===11)return'J';if(v===12)return'Q';if(v===13)return'K';return String(v) }
function formatNum(n){ if(typeof n!=='number'||!isFinite(n)) return String(n); return Number.isInteger(n)?n.toString():n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'') }
function suitSvgHTML(suitName){
  var paths={spade:'M12 2.4C8.1 6.5 4.7 9.2 4.7 12.8c0 2.45 1.82 4.25 4.12 4.25 1.23 0 2.25-.5 2.88-1.32-.26 1.8-1.1 3.23-2.52 4.42h5.64c-1.42-1.19-2.26-2.62-2.52-4.42.63.82 1.65 1.32 2.88 1.32 2.3 0 4.12-1.8 4.12-4.25 0-3.6-3.4-6.3-7.3-10.4Z',heart:'M12 20.5C7.35 16.35 4.1 13.45 4.1 9.75A4.05 4.05 0 0 1 8.2 5.6c1.78 0 3.05.92 3.8 2.02.75-1.1 2.02-2.02 3.8-2.02a4.05 4.05 0 0 1 4.1 4.15c0 3.7-3.25 6.6-7.9 10.75Z',diamond:'M12 2.6 19.35 12 12 21.4 4.65 12 12 2.6Z',club:'M12 2.9C9.6 2.9 7.6 4.9 7.6 7.3C7.6 8.2 7.8 9 8.2 9.6C7.6 9.4 7 9.2 6.2 9.2C3.8 9.2 1.8 11.2 1.8 13.7C1.8 16.1 3.8 18.1 6.2 18.1C8.3 18.1 10 16.7 10.5 14.8C10.4 17.4 9.4 19.8 7.4 21.8H16.6C14.6 19.8 13.6 17.4 13.5 14.8C14 16.7 15.7 18.1 17.8 18.1C20.2 18.1 22.2 16.1 22.2 13.7C22.2 11.2 20.2 9.2 17.8 9.2C17 9.2 16.4 9.4 15.8 9.6C16.2 9 16.4 8.2 16.4 7.3C16.4 4.9 14.4 2.9 12 2.9Z'};
  var d=paths[suitName]||paths.spade;
  return '<svg class="suit-icon" viewBox="0 0 24 24" width="1em" height="1em"><path fill="currentColor" d="'+d+'"/></svg>';
}

// ==================== Web Audio 音效 ====================
let _audioCtx=null;let _audioCtxPromise=null;
function _getAudioCtx(){
  if(!_audioCtx){_audioCtx=new(window.AudioContext||window.webkitAudioContext)();_audioCtxPromise=null}
  if(_audioCtx.state==='suspended'&&!_audioCtxPromise){_audioCtxPromise=_audioCtx.resume()}
  return _audioCtx;
}
async function soundPlay(type){
  try{if(_audioCtxPromise){try{await _audioCtxPromise}catch(e){_audioCtxPromise=null;return}_audioCtxPromise=null}
    const ctx=_getAudioCtx();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);
    const now=ctx.currentTime;
    if(type==='draw'){
      osc.type='sine';osc.frequency.setValueAtTime(520,now);osc.frequency.linearRampToValueAtTime(780,now+0.12);
      gain.gain.setValueAtTime(.15,now);gain.gain.exponentialRampToValueAtTime(.001,now+0.25);
      osc.start(now);osc.stop(now+0.25);
    }else if(type==='submit'){
      osc.type='triangle';osc.frequency.setValueAtTime(600,now);osc.frequency.linearRampToValueAtTime(900,now+0.08);
      gain.gain.setValueAtTime(.12,now);gain.gain.exponentialRampToValueAtTime(.001,now+0.18);
      osc.start(now);osc.stop(now+0.18);
    }else if(type==='error'){
      osc.type='sawtooth';osc.frequency.setValueAtTime(200,now);osc.frequency.linearRampToValueAtTime(120,now+0.2);
      gain.gain.setValueAtTime(.08,now);gain.gain.exponentialRampToValueAtTime(.001,now+0.3);
      osc.start(now);osc.stop(now+0.3);
    }else if(type==='flip'){
      osc.type='sine';osc.frequency.setValueAtTime(800,now);osc.frequency.linearRampToValueAtTime(1200,now+0.06);
      gain.gain.setValueAtTime(.10,now);gain.gain.exponentialRampToValueAtTime(.001,now+0.15);
      osc.start(now);osc.stop(now+0.15);
    }else if(type==='win'){
      const osc2=ctx.createOscillator();const gain2=ctx.createGain();osc2.connect(gain2);gain2.connect(ctx.destination);
      osc.type='triangle';osc.frequency.setValueAtTime(523,now);osc.frequency.setValueAtTime(659,now+0.1);osc.frequency.setValueAtTime(784,now+0.2);osc.frequency.setValueAtTime(1047,now+0.3);
      gain.gain.setValueAtTime(.18,now);gain.gain.exponentialRampToValueAtTime(.001,now+0.5);
      osc2.type='triangle';osc2.frequency.setValueAtTime(1047,now+0.2);osc2.frequency.setValueAtTime(784,now+0.35);
      gain2.gain.setValueAtTime(.10,now+0.2);gain2.gain.exponentialRampToValueAtTime(.001,now+0.5);
      osc.start(now);osc.stop(now+0.5);osc2.start(now+0.2);osc2.stop(now+0.5);
    }
  }catch(e){/* 静默失败 */}
}

// ==================== 全角符号自动替换 ====================
const FULLWIDTH_MAP = {
  '０':'0','１':'1','２':'2','３':'3','４':'4','５':'5','６':'6','７':'7','８':'8','９':'9',
  '＋':'+','－':'-','×':'*','＊':'*','÷':'/','／':'/',
  '（':'(','）':')','＝':'=','．':'.','，':',','；':';',
  '＾':'^','！':'!',
  'Ａ':'A','Ｂ':'B','Ｃ':'C','Ｄ':'D','Ｅ':'E','Ｆ':'F','Ｇ':'G',
  'Ｈ':'H','Ｉ':'I','Ｊ':'J','Ｋ':'K','Ｌ':'L','Ｍ':'M',
  'Ｎ':'N','Ｏ':'O','Ｐ':'P','Ｑ':'Q','Ｒ':'R','Ｓ':'S',
  'Ｔ':'T','Ｕ':'U','Ｖ':'V','Ｗ':'W','Ｘ':'X','Ｙ':'Y','Ｚ':'Z',
  'ａ':'a','ｂ':'b','ｃ':'c','ｄ':'d','ｅ':'e','ｆ':'f','ｇ':'g',
  'ｈ':'h','ｉ':'i','ｊ':'j','ｋ':'k','ｌ':'l','ｍ':'m',
  'ｎ':'n','ｏ':'o','ｐ':'p','ｑ':'q','ｒ':'r','ｓ':'s',
  'ｔ':'t','ｕ':'u','ｖ':'v','ｗ':'w','ｘ':'x','ｙ':'y','ｚ':'z'
};
function normalizeInput(str) {
  if (!str) return str;
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    result += FULLWIDTH_MAP[ch] || ch;
  }
  return result;
}

// ==================== 表达式求值 ====================
const TOK_NUM='NUM',TOK_OP='OP',TOK_LP='LP',TOK_RP='RP',TOK_SQRT='SQRT',TOK_NEG='NEG';
const OP_PREC={'+':1,'-':1,'*':2,'/':2,'^':3};

function tokenize(expr) {
  const tokens=[];let i=0;const s=expr.trim();
  while(i<s.length){
    const ch=s[i];
    if(ch===' '){i++;continue}
    if(ch==='A'||ch==='a'){tokens.push({type:TOK_NUM,value:1,raw:'A'});i++;continue}
    if(ch==='J'||ch==='j'){tokens.push({type:TOK_NUM,value:11,raw:'J'});i++;continue}
    if(ch==='Q'||ch==='q'){tokens.push({type:TOK_NUM,value:12,raw:'Q'});i++;continue}
    if(ch==='K'||ch==='k'){tokens.push({type:TOK_NUM,value:13,raw:'K'});i++;continue}
    if(ch==='\u221A'){
      i++;let num='';while(i<s.length&&s[i]>='0'&&s[i]<='9'){num+=s[i];i++}
      if(num){tokens.push({type:TOK_NUM,value:Math.sqrt(Number(num)),raw:'\u221A'+num})}
      else if(i<s.length&&s[i]==='('){tokens.push({type:TOK_SQRT,value:'\u221A',raw:'\u221A'});i++}
      else throw new Error('√ 后面需要数字或括号');
      continue;
    }
    if(ch==='s'&&s.substr(i,5).toLowerCase()==='sqrt('){tokens.push({type:TOK_SQRT,value:'sqrt',raw:'sqrt'});i+=5;continue}
    if(ch>='0'&&ch<='9'){
      let num='';while(i<s.length&&s[i]>='0'&&s[i]<='9'){num+=s[i];i++}
      if(i<s.length&&s[i]==='!'&&hasFactorial()){
        i++;let n=Number(num);
        if(!Number.isInteger(n)||n<0||n>20) throw new Error('阶乘仅支持0~20的整数');
        let f=1;for(let k=2;k<=n;k++)f*=k;
        tokens.push({type:TOK_NUM,value:f,raw:num+'!'});
      }else{tokens.push({type:TOK_NUM,value:Number(num),raw:num})}
      continue;
    }
    if(ch==='^'&&game.difficulty!=='easy'){tokens.push({type:TOK_OP,value:'^',raw:'^'});i++;continue}
    if('+-*/'.includes(ch)){
      if(ch==='-'&&(tokens.length===0||tokens[tokens.length-1].type===TOK_LP||tokens[tokens.length-1].type===TOK_OP)){
        i++;let num='';while(i<s.length&&s[i]>='0'&&s[i]<='9'){num+=s[i];i++}
        if(!num) throw new Error('负号后需要数字');
        tokens.push({type:TOK_NUM,value:-Number(num),raw:'-'+num});
      }else{tokens.push({type:TOK_OP,value:ch,raw:ch});i++}
      continue;
    }
    if(ch==='('){tokens.push({type:TOK_LP,value:'(',raw:'('});i++;continue}
    if(ch===')'){tokens.push({type:TOK_RP,value:')',raw:')'});i++;continue}
    throw new Error('非法字符: \''+ch+'\'');
  }
  return tokens;
}

function toRPN(tokens){
  const out=[],st=[];
  for(const t of tokens){
    if(t.type===TOK_NUM){out.push(t)}
    else if(t.type===TOK_SQRT){st.push(t)}
    else if(t.type===TOK_OP){
      while(st.length>0){
        const top=st[st.length-1];
        if(top.type===TOK_SQRT||(top.type===TOK_OP&&(OP_PREC[top.value]>OP_PREC[t.value]||(OP_PREC[top.value]===OP_PREC[t.value]&&t.value!=='^')))){
          out.push(st.pop());
        }else break;
      }
      st.push(t);
    }else if(t.type===TOK_LP){st.push(t)}
    else if(t.type===TOK_RP){
      while(st.length>0&&st[st.length-1].type!==TOK_LP) out.push(st.pop());
      if(!st.length) throw new Error('括号不匹配');
      st.pop();
    }
  }
  while(st.length>0){
    const top=st.pop();
    if(top.type===TOK_LP||top.type===TOK_RP) throw new Error('括号不匹配');
    out.push(top);
  }
  return out;
}

function evalRPN(rpn){
  const st=[];
  for(const t of rpn){
    if(t.type===TOK_NUM){st.push(t.value)}
    else if(t.type===TOK_SQRT){
      if(st.length<1) throw new Error('√ 需要操作数');
      const v=st.pop();if(v<0) throw new Error('不能对负数开根号');
      st.push(Math.sqrt(v));
    }else if(t.type===TOK_OP){
      if(st.length<2) throw new Error('表达式不完整');
      const b=st.pop(),a=st.pop();let r;
      switch(t.value){
        case'+':r=a+b;break;case'-':r=a-b;break;case'*':r=a*b;break;
        case'/':if(b===0)throw new Error('除数不能为零');r=a/b;break;
        case'^':
          if(Math.abs(b)>100||(a===0&&b<=0)) throw new Error('幂运算参数不合法');
          r=Math.pow(a,b);break;
        default:throw new Error('未知运算符');
      }
      if(!isFinite(r)||isNaN(r)) throw new Error('计算结果溢出');
      st.push(r);
    }
  }
  if(st.length!==1) throw new Error('表达式不完整');
  return st[0];
}

function evaluate(expr){ return evalRPN(toRPN(tokenize(expr))) }

// ==================== 手牌验证 ====================
function extractNumbers(expr){
  const cleaned=expr.replace(/sqrt\(/gi,'').replace(/\u221A/g,'');
  const upper=cleaned.toUpperCase();
  const vals=[];
  for(let i=0;i<upper.length;i++){
    if(upper[i]==='A') vals.push(1);
    else if(upper[i]==='J') vals.push(11);
    else if(upper[i]==='Q') vals.push(12);
    else if(upper[i]==='K') vals.push(13);
  }
  const re=/\d+/g;let m;
  while((m=re.exec(cleaned))!==null) vals.push(Number(m[0]));
  return vals;
}
function validateHand(expr,hand){
  const used=extractNumbers(expr);
  const a=[...used].sort((x,y)=>x-y),b=[...hand].sort((x,y)=>x-y);
  // 检查数量是否一致
  if(a.length!==b.length){
    if(a.length<b.length) return {valid:false,reason:'notAllUsed',missing:b.length-a.length};
    else return {valid:false,reason:'extraCards',extra:a.length-b.length};
  }
  // 逐值比较
  for(let i=0;i<a.length;i++){
    if(a[i]!==b[i]) return {valid:false,reason:'mismatch'};
  }
  return {valid:true};
}

// ==================== AI 求解器（四则运算 + 括号） ====================
let _aiCache=new Map(),_lastCheckedHand='';

function aiSolve(hand,target,ops){
  // 缓存：相同手牌（排序）不重复计算
  const key=hand.slice().sort((a,b)=>a-b).join(',')+'_'+target+'_'+ops.join('');
  if(_aiCache.has(key)) return _aiCache.get(key);

  const results=[],seen=new Set();
  const vals=hand.map(v=>({value:v,expr:cardFace(v)}));
  const n=vals.length;
  if(n===0){_aiCache.set(key,results);return results}

  function helper(arr){
    if(arr.length===1){
      const val=arr[0].value;
      if(Math.abs(val-target)<0.000001){
        const expr=arr[0].expr;
        if(!seen.has(expr)){seen.add(expr);results.push(expr)}
      }
      return;
    }
    if(results.length>=5) return; // 最多找到5个解就停
    for(let i=0;i<arr.length;i++){
      for(let j=i+1;j<arr.length;j++){
        const a=arr[i],b=arr[j];
        const rest=arr.filter((_,k)=>k!==i&&k!==j);
        // 加
        helper(rest.concat({value:a.value+b.value,expr:'('+a.expr+'+'+b.expr+')'}));
        // 减 a-b
        helper(rest.concat({value:a.value-b.value,expr:'('+a.expr+'-'+b.expr+')'}));
        // 减 b-a
        helper(rest.concat({value:b.value-a.value,expr:'('+b.expr+'-'+a.expr+')'}));
        // 乘
        helper(rest.concat({value:a.value*b.value,expr:'('+a.expr+'*'+b.expr+')'}));
        // 除 a/b
        if(Math.abs(b.value)>0.000001){
          helper(rest.concat({value:a.value/b.value,expr:'('+a.expr+'/'+b.expr+')'}));
        }
        // 除 b/a
        if(Math.abs(a.value)>0.000001){
          helper(rest.concat({value:b.value/a.value,expr:'('+b.expr+'/'+a.expr+')'}));
        }
        // 幂运算
        if(ops.includes('^')){
          if(a.value!==0||b.value>0){
            const r=Math.pow(a.value,b.value);
            if(isFinite(r)&&Math.abs(r)<1e10){
              helper(rest.concat({value:r,expr:'('+a.expr+'^'+b.expr+')'}));
            }
          }
          if(b.value!==0||a.value>0){
            const r=Math.pow(b.value,a.value);
            if(isFinite(r)&&Math.abs(r)<1e10){
              helper(rest.concat({value:r,expr:'('+b.expr+'^'+a.expr+')'}));
            }
          }
        }
        if(results.length>=5) return;
      }
    }
  }
  helper(vals);
  _aiCache.set(key,results);
  return results;
}

// ==================== Toast / 日志 ====================
function showToast(msg,type){
  const tc=document.getElementById('toast-container');
  const el=document.createElement('div');el.className='toast-msg toast-'+type;el.textContent=msg;
  tc.appendChild(el);
  setTimeout(()=>{if(el.parentNode)el.parentNode.removeChild(el)},2800);
}
function addLog(msg,cls){
  const lp=document.getElementById('log-panel');
  const line=document.createElement('div');line.className='log-line '+(cls||'');
  line.textContent='['+new Date().toLocaleTimeString()+'] '+msg;
  lp.appendChild(line);lp.scrollTop=lp.scrollHeight;
}

// ==================== 底部信息栏 + 提示 ====================
let _autoHintTimer=null;
function updateFooterBar(){
  const fb=document.getElementById('footer-bar');
  if(game.phase==='menu'){fb.innerHTML=''+suitSvgHTML('spade')+' 选择游戏模式开始吧！';return}
  if(game.phase==='ended'){fb.innerHTML=''+suitSvgHTML('spade')+' 游戏结束！';return}
  const isSolo=game.mode==='solo';
  const isAi=game.mode==='ai';
  if(isSolo){
    const p=game.players[0];
    if(!p||p.conceded){fb.innerHTML=''+suitSvgHTML('spade')+' 你已认输';return}
    if(game.aiThinking){
      fb.innerHTML=''+suitSvgHTML('spade')+' AI思考中...剩余'+game.aiCountdown+'s';
    }else{
      fb.innerHTML=''+suitSvgHTML('spade')+' 手牌'+p.hand.length+'张 | 输入算式后提交 | 💡提示剩余'+(game.stats?game.stats.maxHints-game.stats.hintsUsed:0)+'次';
    }
  }else if(isAi){
    const human=game.players[0];
    const ai=game.players[1];
    if(human&&human.conceded){fb.innerHTML=''+suitSvgHTML('spade')+' 你已认输';return}
    if(game.aiThinking){
      fb.innerHTML=''+suitSvgHTML('spade')+' 🤖 对手在思考...'+game.aiCountdown+'s';
    }else if(game.aiSolved){
      fb.innerHTML=''+suitSvgHTML('spade')+' 🤖 对手似乎已经找到答案！';
    }else{
      fb.innerHTML=''+suitSvgHTML('spade')+' 快！尽快算出'+game.target+'！ | 你的手牌'+human.hand.length+'张';
    }
  }else{
    const activeCnt=game.players.filter(p=>!p.conceded).length;
    fb.innerHTML=''+suitSvgHTML('spade')+' '+activeCnt+'位玩家在比赛中...';
  }
}

function updateSolutionHint(){
  if(game.mode!=='solo'||game.phase!=='playing'||game._maxHintShown) return;
  // 在手牌变化时检测是否有解
  const p=game.players[0];
  if(!p||p.conceded) return;
  const handKey=p.hand.slice().sort((a,b)=>a-b).join(',');
  if(handKey===_lastCheckedHand) return;
  _lastCheckedHand=handKey;
  // 延迟检测
  if(_autoHintTimer) clearTimeout(_autoHintTimer);
  _autoHintTimer=setTimeout(()=>{
    const solutions=aiSolve([...p.hand],game.target,getOps());
    const ha=document.getElementById('hint-area');
    if(solutions.length===0){
      ha.classList.remove('hidden');
      ha.innerHTML='🤔 当前手牌<em>似乎无解</em>，建议加牌试试';
    }
  },100);
}

// ==================== 胜利特效 ====================
function triggerVictoryEffect(){
  const vo=document.getElementById('victory-overlay');
  vo.classList.remove('hidden');
  vo.style.animation='none';void vo.offsetWidth;vo.style.animation='victoryPulse .6s ease-out';
  setTimeout(()=>vo.classList.add('hidden'),700);

  const emojis=['🎉','🎊','✨','🌟','💫','🏆','👑','🎯','🔥','💥','🃏','⭐'];
  for(let i=0;i<30;i++){
    setTimeout(()=>{
      const el=document.createElement('div');
      el.className='confetti';
      el.textContent=emojis[Math.floor(Math.random()*emojis.length)];
      el.style.left=Math.random()*100+'%';
      el.style.top=-(Math.random()*40+10)+'px';
      el.style.animationDuration=(Math.random()*1.5+2)+'s';
      document.body.appendChild(el);
      setTimeout(()=>{if(el.parentNode)el.parentNode.removeChild(el)},3000);
    },i*50);
  }
}

// ==================== 反馈 ====================
function setFeedback(idx,msg,type){
  const p=game.players[idx];p.feedback=msg;p.feedbackType=type;
  const c=document.querySelector('.player-card[data-index="'+idx+'"]');
  if(c){const fb=c.querySelector('.feedback');if(fb){fb.textContent=msg;fb.className='feedback '+type}}
}
function shakeCard(idx){
  const c=document.querySelector('.player-card[data-index="'+idx+'"]');
  if(c){c.classList.add('error-shake');setTimeout(()=>c.classList.remove('error-shake'),400)}
}

// ==================== 渲染 ====================
const PLR_COLORS=['#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c','#e67e22'];

function renderCardHTML(value,extraClass){
  const face=cardFace(value),suit=getSuit(value),red=isRedSuit(value);
  const cls=red?'suit-color-red':'suit-color-black';
  const ec=extraClass?' '+extraClass:'';
  const svg=suitSvgHTML(suit);
  return '<div class="card-el'+ec+'">'+
    '<div class="corner top-left '+cls+'"><span>'+face+'</span><span class="suit-wrap">'+svg+'</span></div>'+
    '<div class="center-suit '+cls+'">'+svg+'</div>'+
    '<div class="corner bottom-right '+cls+'"><span>'+face+'</span><span class="suit-wrap">'+svg+'</span></div>'+
    '</div>';
}

function renderAll(){
  const area=document.getElementById('players-area');area.innerHTML='';
  const isSolo=game.mode==='solo';
  const isAi=game.mode==='ai';
  const isFirst=game._firstRender;

  game.players.forEach((p,i)=>{
    const card=document.createElement('div');
    card.className='player-card';
    if(p.conceded) card.classList.add('conceded');
    if(game.phase==='ended'&&p.feedbackType==='ok') card.classList.add('winner');
    if(isAi&&p.isAi) card.classList.add('ai-card');
    card.setAttribute('data-index',i);

    const hdr=document.createElement('div');hdr.className='player-header';
    const dot=document.createElement('span');dot.className='dot';
    dot.style.backgroundColor=p.isAi?'#3498db':PLR_COLORS[i%PLR_COLORS.length];
    hdr.appendChild(dot);
    const ns=document.createElement('span');ns.textContent=p.name;hdr.appendChild(ns);

    const st=document.createElement('span');st.className='player-status';
    if(p.isAi&&game.aiThinking&&game.phase==='playing'&&!p.conceded){
      st.textContent='🤖 思考中... '+game.aiCountdown+'s';
      st.className+=' thinking';
    }else if(game.phase==='ended'&&p.feedbackType==='ok'){
      st.textContent='🏆 获胜';st.className+=' won';
    }else if(p.conceded){
      st.textContent='认输';st.className+=' lost';
    }else{
      st.textContent='手牌'+p.hand.length+'张';
    }
    hdr.appendChild(st);card.appendChild(hdr);

    const cr=document.createElement('div');cr.className='cards-row';
    p.hand.forEach((v,vi)=>{
      let extraCls='';
      if(p._newCardIdx===vi) extraCls='new-card';
      else if(isFirst) extraCls='animate-in';
      const d=document.createElement('div');
      d.innerHTML=renderCardHTML(v,extraCls);
      const el=d.firstElementChild;
      // 点击牌填入数字
      if(!(isAi&&p.isAi)){
        el.style.cursor='pointer';
        el.title='点击插入 '+cardFace(v);
        el.onclick=()=>{
          const inp=card.querySelector('.formula-input');
          if(inp) insertSymbol(inp,cardFace(v));
        };
      }
      cr.appendChild(el);
    });
    if(p._newCardIdx!==undefined){
      setTimeout(()=>{p._newCardIdx=undefined},500);
    }
    card.appendChild(cr);

    const act=document.createElement('div');act.className='player-actions';
    const input=document.createElement('input');
    input.type='text';input.className='formula-input';
    input.placeholder='输入算式，如 (A+7)*K';
    input.value=p.inputDraft||'';
    input.disabled=(game.phase!=='playing'||p.conceded||(isAi&&p.isAi));
    input.addEventListener('input',()=>{p.inputDraft=input.value});
    act.appendChild(input);

    const btnSub=document.createElement('button');
    btnSub.className='btn-submit';btnSub.textContent='提交';
    btnSub.disabled=(game.phase!=='playing'||p.conceded||(isAi&&p.isAi));
    btnSub.onclick=()=>submitFormula(i);
    act.appendChild(btnSub);

    const btnDraw=document.createElement('button');
    btnDraw.className='btn-draw';btnDraw.textContent='+牌';
    btnDraw.disabled=(game.phase!=='playing'||p.conceded||p.hand.length>=game.maxCards||(isAi&&p.isAi));
    btnDraw.onclick=()=>drawForPlayer(i);
    act.appendChild(btnDraw);

    if(isSolo){
      const btnHint=document.createElement('button');
      btnHint.className='btn-hint';btnHint.textContent='💡提示('+(game.stats.maxHints-game.stats.hintsUsed)+')';
      btnHint.disabled=(game.phase!=='playing'||game.stats.hintsUsed>=game.stats.maxHints||game.aiThinking);
      btnHint.onclick=()=>showHint();
      act.appendChild(btnHint);
    }

    const btnConc=document.createElement('button');
    btnConc.className='btn-concede';btnConc.textContent='认输';
    btnConc.disabled=(game.phase!=='playing'||p.conceded||(isAi&&p.isAi));
    btnConc.onclick=()=>concedePlayer(i);
    act.appendChild(btnConc);
    card.appendChild(act);

    // 符号快捷按钮栏（AI模式下也需要占位保持高度一致）
    const symBar=document.createElement('div');
    symBar.className='symbol-bar';
    if(!(isAi&&p.isAi)&&game.phase==='playing'&&!p.conceded){
      const syms=[];
      syms.push('(',')','+','-','*','/');
      if(game.difficulty!=='easy') syms.push('^','√');
      if(game.difficulty==='hard') syms.push('!');
      syms.push('⌫');
      syms.forEach(s=>{
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='symbol-btn';
        if(s==='⌫'){btn.classList.add('backspace');btn.textContent='⌫'}
        else{btn.textContent=s}
        if(s==='√') btn.textContent='√';
        btn.onclick=(e)=>{
          e.preventDefault();
          if(s==='⌫'){
            const inp=card.querySelector('.formula-input');
            if(inp&&!inp.disabled){
              const start=inp.selectionStart??inp.value.length;
              const end=inp.selectionEnd??inp.value.length;
              if(start!==end){inp.value=inp.value.slice(0,start)+inp.value.slice(end);inp.focus();inp.setSelectionRange(start,start);inp.dispatchEvent(new Event('input',{bubbles:true}))}
              else if(start>0){inp.value=inp.value.slice(0,start-1)+inp.value.slice(start);inp.focus();inp.setSelectionRange(start-1,start-1);inp.dispatchEvent(new Event('input',{bubbles:true}))}
            }
          }else{
            const inp=card.querySelector('.formula-input');
            if(inp) insertSymbol(inp,s);
          }
        };
        symBar.appendChild(btn);
      });
    }else{
      symBar.classList.add('placeholder');
    }
    card.appendChild(symBar);

    const fb=document.createElement('div');
    fb.className='feedback '+(p.feedbackType||'');
    fb.textContent=p.feedback||'';
    card.appendChild(fb);

    area.appendChild(card);
  });

  if(isSolo&&game.phase==='playing'){
    const sp=document.getElementById('stats-panel');
    sp.classList.remove('hidden');
    sp.innerHTML='📊 提交:<span>'+game.stats.submits+'</span> | 提示:<span>'+game.stats.hintsUsed+'/'+game.stats.maxHints+'</span> | 加牌:<span>'+game.stats.draws+'</span>';
  }else{document.getElementById('stats-panel').classList.add('hidden')}

  if(!isSolo) document.getElementById('hint-area').classList.add('hidden');
  if(game._firstRender) game._firstRender=false;
}

// ==================== 提示系统（增强版） ====================
function extractFirstStep(solution){
  // 从解中提取一个简单的子表达式
  if(!solution) return null;
  // 尝试匹配形如 (a op b) 的第一个子式
  const mInner=solution.match(/\(([^()]+?)\)/);
  if(mInner) return mInner[1];
  // 如果没有括号，尝试匹配开头
  const mSimple=solution.match(/^\(?(\d+|[AJQK])([+\-*\/])(\d+|[AJQK])/);
  if(mSimple) return mSimple[1]+' '+mSimple[2]+' '+mSimple[3];
  return null;
}

function showHint(){
  if(game.mode!=='solo'||game.phase!=='playing') return;
  if(game.stats.hintsUsed>=game.stats.maxHints) return;
  const p=game.players[0];
  const solutions=aiSolve([...p.hand],game.target,getOps());
  game.stats.hintsUsed++;
  const level=game.stats.hintsUsed;

  if(solutions.length===0){
    const msgs=[
      '🤔 当前手牌无法算出21，建议加牌试试',
      '🧐 还是无解，再加一张牌也许有转机',
      '😅 依然无解...试试换一组牌？'
    ];
    showToast('💡 提示 #'+level+'：'+msgs[Math.min(level-1,msgs.length-1)],'error');
    addLog('提示 #'+level+'：当前手牌无解', 'hint');
  }else if(level===1){
    // 方向性提示：分析解法中用了哪些运算符和关键操作
    const sol=solutions[0];
    const hasMul=sol.includes('*'),hasDiv=sol.includes('/'),hasAdd=sol.includes('+'),hasSub=sol.includes('-');
    const parts=[];
    if(hasMul) parts.push('乘法');
    if(hasDiv) parts.push('除法');
    if(hasAdd) parts.push('加法');
    if(hasSub) parts.push('减法');
    const firstStep=extractFirstStep(sol);
    let hintMsg='💡 提示 #1：试试用 '+parts.join(' 和 ')+' 组合';
    if(firstStep) hintMsg+='，比如可以先尝试「'+firstStep+'」';
    showToast(hintMsg,'submit');
    addLog('提示 #1：方向性提示已显示', 'hint');
  }else if(level===2){
    // 给出关键中间值提示
    const sol=solutions[0];
    const firstStep=extractFirstStep(sol);
    if(firstStep){
      const tokens=tokenize(firstStep);
      if(tokens.length===3&&tokens[0].type===TOK_NUM&&tokens[1].type===TOK_OP&&tokens[2].type===TOK_NUM){
        try{
          const subVal=evaluate(firstStep);
          showToast('💡 提示 #2：先算出「'+firstStep+' = '+formatNum(subVal)+'」，再处理剩余牌','submit');
          addLog('提示 #2：中间值提示  → '+firstStep+' = '+formatNum(subVal), 'hint');
        }catch(e){
          showToast('💡 提示 #2：尝试从「'+firstStep+'」开始~','submit');
          addLog('提示 #2：模糊步骤提示', 'hint');
        }
      }else{
        showToast('💡 提示 #2：试试先从几个牌组合出关键中间值','submit');
        addLog('提示 #2：模糊步骤提示', 'hint');
      }
    }else{
      showToast('💡 提示 #2：试着先合并其中两张牌','submit');
      addLog('提示 #2：模糊步骤提示', 'hint');
    }
  }else{
    // 完整答案
    showToast('💡 答案：'+solutions[0]+' = 21','win');
    addLog('提示 #3（答案）：'+solutions[0]+' = 21', 'hint');
  }
  renderAll();
}

// ==================== 玩家操作 ====================
function submitFormula(idx){
  if(game.phase!=='playing') return;
  const p=game.players[idx];if(p.conceded) return;
  const expr=normalizeInput(p.inputDraft||'').trim();
  if(!expr){setFeedback(idx,'🤔 嗯？你的算式呢？别害羞~','err');shakeCard(idx);soundPlay('error');return}
  const handValidation=validateHand(expr,p.hand);
  if(!handValidation.valid){
    let fbMsg;
    if(handValidation.reason==='notAllUsed'){
      fbMsg='⚠️ 还有 '+handValidation.missing+' 张牌没用！手牌必须全部用完哦~';
    }else if(handValidation.reason==='extraCards'){
      fbMsg='🕵️ 多了 '+handValidation.extra+' 张牌！请不要使用不属于你的牌~';
    }else{
      fbMsg='🕵️ 手牌不匹配！请检查是否用了不属于你的牌~';
    }
    setFeedback(idx,fbMsg,'err');
    addLog(p.name+' 提交了算式，但手牌不匹配 ❌','err');
    shakeCard(idx);soundPlay('error');return;
  }
  let result;
  try{result=evaluate(expr)}
  catch(e){setFeedback(idx,'🧮 算式格式错误: '+e.message,'err');addLog(p.name+' 提交了非法算式 ❌','err');shakeCard(idx);soundPlay('error');return}
  if(typeof result!=='number'||isNaN(result)||!isFinite(result)){
    setFeedback(idx,'计算结果无效','err');addLog(p.name+' 算式结果无效 ❌','err');shakeCard(idx);soundPlay('error');return;
  }
  if(game.mode==='solo') game.stats.submits++;

  if(Math.abs(result-game.target)<0.000001){
    game.phase='ended';stopTimer();stopAiThinking();
    p.feedback='🎉 ='+game.target+' 获胜！';p.feedbackType='ok';
    setFeedback(idx,p.feedback,'ok');
    addLog('🏆 '+p.name+' 提交算式 "'+expr+'" = '+game.target+' 获胜！！！','win');
    showToast('🎉 '+p.name+' 获胜！答案 = '+game.target,'win');
    document.getElementById('hint-area').classList.add('hidden');
    soundPlay('win');triggerVictoryEffect();
    showResult(idx);renderAll();
  }else{
    const diff=result-game.target;
    const absDiff=Math.abs(diff);
    let fbMsg,toastMsg;
    if(absDiff<=2){
      fbMsg='🔥 差一点！= '+formatNum(result)+'，就差 '+formatNum(absDiff)+'！';
      toastMsg=p.name+' 提交 = '+formatNum(result)+'（只差 '+formatNum(absDiff)+'！）';
    }else if(absDiff<=10){
      fbMsg='🤔 偏差 '+formatNum(absDiff)+'，考虑用乘除调整试试';
      toastMsg=p.name+' 提交 = '+formatNum(result)+'（偏差 '+formatNum(absDiff)+'）';
    }else{
      fbMsg='📉 偏了 '+formatNum(absDiff)+'，离21有点远…';
      toastMsg=p.name+' 提交 = '+formatNum(result)+'（差太远了）';
    }
    setFeedback(idx,fbMsg,'err');
    addLog(p.name+' 提交算式 "'+expr+'" = '+formatNum(result)+' ≠ '+game.target+' ❌','err');
    showToast(toastMsg,'error');
    shakeCard(idx);soundPlay('error');
  }
}

function drawForPlayer(idx){
  if(game.phase!=='playing') return;
  const p=game.players[idx];if(p.conceded) return;
  if(p.hand.length>=game.maxCards){setFeedback(idx,'已达'+game.maxCards+'张上限','err');return}
  if(!game.deck.length){setFeedback(idx,'牌库已空','err');return}
  const card=drawCard();if(card===null) return;
  p.hand.push(card);p.feedback='加牌: +'+cardFace(card);p.feedbackType='ok';
  addLog('🃏 '+p.name+' 加了一张牌 → '+cardFace(card)+' (手牌'+p.hand.length+'张)','info');
  showToast('🃏 '+p.name+' +牌 → '+cardFace(card),'draw');
  if(game.mode==='solo'){ game.stats.draws++; _lastCheckedHand=''; }
  p._newCardIdx=p.hand.length-1;
  updateDeckCount();renderAll();updateFooterBar();
  soundPlay('draw');
  if(game.mode==='ai'&&p.isAi) scheduleAiThink();
}

function concedePlayer(idx){
  if(game.phase!=='playing') return;
  const p=game.players[idx];if(p.conceded) return;
  p.conceded=true;p.feedback='已认输';p.feedbackType='';
  addLog('🏳️ '+p.name+' 举白旗了！','info');
  showToast('🏳️ '+p.name+' 认输','concede');
  renderAll();updateFooterBar();
  checkGameEnd();
}

function checkGameEnd(){
  if(game.phase!=='playing') return;
  const active=game.players.filter(p=>!p.conceded);
  if(active.length===0){
    game.phase='ended';stopTimer();stopAiThinking();
    addLog('所有玩家都认输了，本局无胜者 🤝','info');
    showResult(-1);renderAll();return;
  }
  if(game.mode==='ai'&&active.length===1&&active[0].isAi){
    game.phase='ended';stopTimer();stopAiThinking();
    const ai=game.players[game.aiPlayerIndex];
    ai.feedback='🎉 对手认输，AI获胜！';ai.feedbackType='ok';
    addLog('🤖 AI获胜！所有人类玩家已认输','win');
    showToast('🤖 AI获胜！','win');
    triggerVictoryEffect();
    showResult(game.aiPlayerIndex);renderAll();
  }
}

// ==================== AI 逻辑 ====================
function stopAiThinking(){
  game.aiThinking=false;game.aiCountdown=0;
  if(game.aiTimerId){clearTimeout(game.aiTimerId);game.aiTimerId=null}
  if(game.aiCountdownInterval){clearInterval(game.aiCountdownInterval);game.aiCountdownInterval=null}
}

function scheduleAiThink(){
  if(game.mode!=='ai'||game.phase!=='playing') return;
  stopAiThinking();
  const aiIdx=game.aiPlayerIndex;
  const ai=game.players[aiIdx];
  if(ai.conceded) return;

  game.aiThinking=true;
  game.aiCountdown=99;
  renderAll();updateFooterBar();

  setTimeout(()=>{
    if(game.phase!=='playing'||ai.conceded){game.aiThinking=false;renderAll();updateFooterBar();return}

    const solutions=aiSolve([...ai.hand],game.target,getOps());
    const hasSolution=solutions.length>0;
    game.aiSolved=hasSolution;
    game.aiSolution=hasSolution?solutions[0]:null;

    const rates={easy:0.3,medium:0.5,hard:0.7};
    const rate=rates[game.aiLevel]||0.5;
    const willSucceed=hasSolution&&Math.random()<rate;

    const delay=40000+Math.floor(Math.random()*40000);
    game.aiCountdown=Math.ceil(delay/1000);
    renderAll();updateFooterBar();

    game.aiCountdownInterval=setInterval(()=>{
      game.aiCountdown--;
      if(game.aiCountdown<=0||game.phase!=='playing'){
        clearInterval(game.aiCountdownInterval);
        game.aiCountdownInterval=null;
      }
      updateFooterBar();
      const card=document.querySelector('.player-card[data-index="'+aiIdx+'"]');
      if(card){
        const st=card.querySelector('.player-status');
        if(st&&game.aiThinking) st.textContent='🤖 思考中... '+Math.max(0,game.aiCountdown)+'s';
      }
    },1000);

    game.aiTimerId=setTimeout(()=>{
      clearInterval(game.aiCountdownInterval);
      game.aiCountdownInterval=null;
      game.aiThinking=false;game.aiCountdown=0;
      if(game.phase!=='playing'){renderAll();updateFooterBar();return}
      if(ai.conceded){renderAll();updateFooterBar();return}

      if(willSucceed&&solutions.length>0){
        const sol=solutions[0];
        ai.inputDraft=sol;
        addLog('🤖 '+ai.name+' 得意地提交了答案！', 'info');
        showToast('🤖 '+ai.name+' 提交了答案！','submit');
        renderAll();
        setTimeout(()=>{
          const input=document.querySelector('.player-card[data-index="'+aiIdx+'"] .formula-input');
          if(input) input.value=sol;
          submitFormula(aiIdx);
        },400);
      }else{
        if(ai.hand.length>=game.maxCards||!game.deck.length){
          ai.conceded=true;ai.feedback='AI认输';ai.feedbackType='';
          addLog('🤖 '+ai.name+' 挠了挠头，表示放弃…', 'info');
          showToast('🤖 '+ai.name+' 认输🏳️','concede');
          checkGameEnd();
        }else{
          const card=drawCard();
          if(card!==null){
            ai.hand.push(card);
            addLog('🤖 '+ai.name+' 想不出，加了一张牌 → '+cardFace(card)+' (手牌'+ai.hand.length+'张)', 'info');
            showToast('🤖 '+ai.name+' +牌 → '+cardFace(card),'draw');
            updateDeckCount();
            if(game.phase==='playing') scheduleAiThink();
          }
          checkGameEnd();
        }
        renderAll();updateFooterBar();
      }
    },delay);
  },30);
}

// ==================== 游戏流程 ====================
function selectDifficulty(diff,btn){
  game.difficulty=diff;
  document.querySelectorAll('#menu-overlay .choice-card').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('diff-badge').textContent={easy:'简单',normal:'普通',hard:'困难'}[diff];
  document.getElementById('diff-badge').className='diff-badge '+(diff==='easy'?'diff-easy':diff==='normal'?'diff-normal':'diff-hard');
}

function selectAiLevel(lvl,btn){
  game.aiLevel=lvl;
  document.querySelectorAll('#ai-setup-overlay .choice-card').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
}

function showComingSoon(){alert('联网对战模式即将推出，敬请期待！')}

function showRules(){
  document.getElementById('rules-overlay').classList.remove('hidden');
}
function hideRules(){
  document.getElementById('rules-overlay').classList.add('hidden');
}

function goToMenu(){
  stopTimer();stopAiThinking();
  game.phase='menu';game.players=[];game.deck=[];game.timerSec=0;game.aiSolved=false;game.aiSolution=null;
  game._firstRender=false;game._solving=false;_lastCheckedHand='';
  updateTimerUI();updateDeckCount();
  document.getElementById('players-area').innerHTML='';
  document.getElementById('log-panel').innerHTML='';
  document.getElementById('footer-bar').innerHTML=''+suitSvgHTML('spade')+' 准备开始游戏...';
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('ai-setup-overlay').classList.add('hidden');
  document.getElementById('local-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('rules-overlay').classList.add('hidden');
  updateModeBadge('');
}

function startMode(mode){
  document.getElementById('menu-overlay').classList.add('hidden');
  if(mode==='solo'){
    game.mode='solo';updateModeBadge('单人练习');startSoloGame();
  }else if(mode==='local'){
    game.mode='local';updateModeBadge('本地多人');
    document.getElementById('local-setup-overlay').classList.remove('hidden');
    updateNameInputs();
  }else if(mode==='ai'){
    game.mode='ai';updateModeBadge('AI对战');
    document.getElementById('ai-setup-overlay').classList.remove('hidden');
  }
}

function updateModeBadge(text){
  const b=document.getElementById('mode-badge');
  if(text) { b.textContent=text; b.style.display='' }
  else b.style.display='none';
}

function updateNameInputs(){
  const count=parseInt(document.getElementById('player-count').value)||2;
  const c=document.getElementById('player-name-inputs');c.innerHTML='';
  for(let i=0;i<count;i++){
    const r=document.createElement('div');r.className='row';
    r.innerHTML='<label>玩家'+(i+1)+'</label><input type="text" id="pname-'+i+'" value="玩家'+(i+1)+'" maxlength="10">';
    c.appendChild(r);
  }
}

function initPlayers(names,isAiFlags){
  game.players=[];
  for(let i=0;i<names.length;i++){
    game.players.push({
      name:names[i],hand:[],conceded:false,
      feedback:'',feedbackType:'',inputDraft:'',
      isAi:!!isAiFlags[i]
    });
  }
}

function dealCards(){
  game.deck=createDeck();shuffle(game.deck);game._maxHintShown=false;
  game._firstRender=true;_lastCheckedHand='';
  for(const p of game.players){
    for(let j=0;j<3;j++){const c=drawCard();if(c!==null)p.hand.push(c)}
  }
}

function startSoloGame(){
  initPlayers(['玩家'],[false]);
  dealCards();
  game.phase='playing';game.stats={submits:0,hintsUsed:0,maxHints:3,draws:0};
  updateDeckCount();startTimer();
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  addLog('🧑‍💻 单人练习开始！试试用算式算出'+game.target+'吧','info');
  addLog('💡 点击提示按钮获取帮助（共'+game.stats.maxHints+'次）','info');
  renderAll();updateFooterBar();updateSolutionHint();
}

function startLocalGame(){
  const count=parseInt(document.getElementById('player-count').value)||2;
  if(count<2||count>6){alert('玩家人数请设为2~6人');return}
  const names=[];
  for(let i=0;i<count;i++){
    const inp=document.getElementById('pname-'+i);
    names.push((inp&&inp.value.trim())?inp.value.trim():('玩家'+(i+1)));
  }
  initPlayers(names,Array(count).fill(false));
  dealCards();
  game.phase='playing';
  updateDeckCount();startTimer();
  document.getElementById('local-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  addLog('👥 本地多人开始！每人3张牌，谁先用算式算出'+game.target+'谁获胜！','info');
  renderAll();updateFooterBar();
}

function startAiGame(){
  const nameInput=document.getElementById('ai-player-name');
  const playerName=(nameInput&&nameInput.value.trim())?nameInput.value.trim():'玩家';
  const aiLevelNames={easy:'新手赌徒',medium:'老练玩家',hard:'数学教授'};
  const aiName='🤖 '+aiLevelNames[game.aiLevel];
  game.aiPlayerIndex=1;
  initPlayers([playerName,aiName],[false,true]);
  dealCards();
  game.phase='playing';
  updateDeckCount();startTimer();
  document.getElementById('ai-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  addLog('🤖 AI对战开始！对手：'+aiName,'info');
  addLog('你和AI同时开始思考，先算出21者获胜！','info');
  renderAll();
  scheduleAiThink();
  updateFooterBar();
}

function showResult(winnerIdx){
  const ov=document.getElementById('result-overlay');
  const icon=document.getElementById('result-icon');
  const title=document.getElementById('result-title');
  const detail=document.getElementById('result-detail');
  ov.classList.remove('hidden');
  if(winnerIdx>=0){
    const p=game.players[winnerIdx];
    icon.textContent='🏆';title.textContent=p.name+' 获胜！';
    detail.textContent='用时 '+formatTime(game.timerSec)+'，手牌 '+p.hand.length+' 张';
  }else{
    icon.textContent='🤝';title.textContent='本局无胜者';
    detail.textContent='经过 '+formatTime(game.timerSec)+' 的比拼，无人算出'+game.target;
  }
}

function resetGame(){
  stopTimer();stopAiThinking();
  game.phase='menu';game.players=[];game.deck=[];game.timerSec=0;game._maxHintShown=false;
  game.aiSolved=false;game.aiSolution=null;game._firstRender=false;game._solving=false;_lastCheckedHand='';
  updateTimerUI();updateDeckCount();
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('players-area').innerHTML='';
  document.getElementById('log-panel').innerHTML='';
  document.getElementById('footer-bar').innerHTML=''+suitSvgHTML('spade')+' 准备开始游戏...';
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  if(game.mode==='local'){
    document.getElementById('local-setup-overlay').classList.remove('hidden');
    updateNameInputs();
  }else if(game.mode==='ai'){
    document.getElementById('ai-setup-overlay').classList.remove('hidden');
  }else if(game.mode==='solo'){
    startSoloGame();
  }
}

function formatTime(sec){
  const m=Math.floor(sec/60),s=sec%60;
  return String(m).padStart(2,'0')+'分'+String(s).padStart(2,'0')+'秒';
}

// ==================== 输入辅助 ====================
function insertSymbol(inputEl, symbol) {
  if (!inputEl || inputEl.disabled) return;
  const start = inputEl.selectionStart ?? inputEl.value.length;
  const end = inputEl.selectionEnd ?? inputEl.value.length;
  const val = inputEl.value;
  inputEl.value = val.slice(0, start) + symbol + val.slice(end);
  inputEl.focus();
  const pos = start + symbol.length;
  inputEl.setSelectionRange(pos, pos);
  // 触发表单更新
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}

// ==================== 键盘 ====================
document.addEventListener('keydown',(e)=>{
  if(game.phase!=='playing') return;
  if(e.key==='Enter'){
    const el=document.activeElement;
    if(el&&el.classList.contains('formula-input')){
      const card=el.closest('.player-card');
      if(card){const idx=parseInt(card.getAttribute('data-index'));if(!isNaN(idx))submitFormula(idx)}
    }
  }
});

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('ai-setup-overlay').classList.add('hidden');
  document.getElementById('local-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('rules-overlay').classList.add('hidden');
  updateNameInputs();
  updateModeBadge('');
});
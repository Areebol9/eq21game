"use strict";
// ==================== Toast / 日志 ====================
function showToast(msg, type) {
  const tc = document.getElementById('toast-container');
  const el = document.createElement('div'); el.className = 'toast-msg toast-' + type; el.textContent = msg;
  tc.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 2800);
}
function addLog(msg, cls) {
  const lp = document.getElementById('log-panel');
  const line = document.createElement('div'); line.className = 'log-line ' + (cls || '');
  line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  lp.appendChild(line); lp.scrollTop = lp.scrollHeight;
  updateLogToggleCount();
}

function updateLogToggleCount() {
  const countEl = document.getElementById('log-toggle-count');
  const lp = document.getElementById('log-panel');
  if (countEl && lp) countEl.textContent = String(lp.children.length);
}

function setLogCollapsed(collapsed) {
  const shell = document.getElementById('log-shell');
  const btn = document.getElementById('btn-log-toggle');
  if (!shell || !btn) return;
  shell.classList.toggle('collapsed', !!collapsed);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function toggleLogPanel() {
  const shell = document.getElementById('log-shell');
  if (!shell) return;
  setLogCollapsed(!shell.classList.contains('collapsed'));
}

function initLogPanel() {
  const btn = document.getElementById('btn-log-toggle');
  if (btn) btn.onclick = toggleLogPanel;
  setLogCollapsed(window.matchMedia && window.matchMedia('(max-width: 699px)').matches);
  updateLogToggleCount();
}

// ==================== 底部信息栏 + 提示 ====================
let _autoHintTimer = null;
function clearSolutionHint() {
  if (_autoHintTimer) {
    clearTimeout(_autoHintTimer);
    _autoHintTimer = null;
  }
  const ha = document.getElementById('hint-area');
  if (ha) {
    ha.classList.add('hidden');
    ha.innerHTML = '';
  }
}

function updateFooterBar() {
  const fb = document.getElementById('footer-bar');
  if (game.phase === 'menu') { fb.innerHTML = '<span class="icon">♠</span> 选择游戏模式开始吧！'; return; }
  if (game.phase === 'ended') { fb.innerHTML = '<span class="icon">♠</span> 游戏结束！'; return; }
  const isSolo = game.mode === 'solo';
  const isAi = game.mode === 'ai';
  if (isSolo) {
    const p = game.players[0];
    if (!p || p.conceded) { fb.innerHTML = '<span class="icon">♠</span> 你已认输'; return; }
    if (game.aiThinking) {
      fb.innerHTML = '<span class="icon">♠</span> AI思考中...剩余' + game.aiCountdown + 's';
    } else {
      fb.innerHTML = '<span class="icon">♠</span> 手牌' + p.hand.length + '张 | 输入算式后提交 | 💡提示剩余' + (game.stats ? game.stats.maxHints - game.stats.hintsUsed : 0) + '次';
    }
  } else if (isAi) {
    const human = game.players[0];
    const ai = game.players[1];
    if (human && human.conceded) { fb.innerHTML = '<span class="icon">♠</span> 你已认输'; return; }
    if (game.aiThinking) {
      fb.innerHTML = '<span class="icon">♠</span> 🤖 对手在思考...' + game.aiCountdown + 's';
    } else if (game.aiSolved) {
      fb.innerHTML = '<span class="icon">♠</span> 🤖 对手似乎已经找到答案！';
    } else {
      fb.innerHTML = '<span class="icon">♠</span> 快！尽快算出' + game.target + '！ | 你的手牌' + human.hand.length + '张';
    }
  } else if (game.mode === 'local') {
    fb.innerHTML = '<span class="icon">♥</span> 围桌中 · ' + game.players.filter(p => !p.conceded).length + '人对弈 · 牌库' + game.deck.length + ' · 🎯' + game.target;
  }
}

function updateSolutionHint() {
  if (game.mode !== 'solo' || game.phase !== 'playing' || game._maxHintShown) return;
  const p = game.players[0];
  if (!p || p.conceded) return;
  const handKey = getSolutionHandKey(p.hand);
  const existingCache = getCurrentSolutionCache();
  if (handKey === _lastCheckedHand && existingCache && !existingCache.pending) return;
  _lastCheckedHand = handKey;
  if (_autoHintTimer) clearTimeout(_autoHintTimer);
  _autoHintTimer = setTimeout(() => {
    _autoHintTimer = null;
    if (game.mode !== 'solo' || game.phase !== 'playing') return;
    const current = game.players[0];
    if (!current || current.conceded) return;
    const currentKey = getSolutionHandKey(current.hand);
    if (currentKey !== handKey) return;

    requestSolutionAnalysis();
    const cache = getCurrentSolutionCache();
    const ha = document.getElementById('hint-area');
    if (!cache || cache.pending || cache.timedOut) {
      ha.classList.add('hidden');
      ha.innerHTML = '';
    } else if (cache.simple.length === 0 && cache.cool.length === 0) {
      ha.classList.remove('hidden');
      ha.innerHTML = '🤔 当前手牌<em>似乎无解</em>，建议加牌试试';
    } else {
      ha.classList.add('hidden');
      ha.innerHTML = '';
    }
  }, 100);
}

// ==================== 胜利特效 ====================
function triggerVictoryEffect() {
  const vo = document.getElementById('victory-overlay');
  vo.classList.remove('hidden');
  vo.style.animation = 'none'; void vo.offsetWidth; vo.style.animation = 'victoryPulse .6s ease-out';
  setTimeout(() => vo.classList.add('hidden'), 700);

  const emojis = ['🎉', '🎊', '✨', '🌟', '💫', '🏆', '👑', '🎯', '🔥', '💥', '🃏', '⭐'];
  for (let i = 0; i < 30; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      el.style.left = Math.random() * 100 + '%';
      el.style.top = -(Math.random() * 40 + 10) + 'px';
      el.style.animationDuration = (Math.random() * 1.5 + 2) + 's';
      document.body.appendChild(el);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
    }, i * 50);
  }
}

// ==================== 反馈 ====================
function setFeedback(idx, msg, type) {
  const p = game.players[idx]; p.feedback = msg; p.feedbackType = type;
  const c = document.querySelector('.player-card[data-index="' + idx + '"]');
  if (c) { const fb = c.querySelector('.feedback'); if (fb) { fb.textContent = msg; fb.title = msg; fb.className = 'feedback ' + type; } }
}
function shakeCard(idx) {
  const c = document.querySelector('.player-card[data-index="' + idx + '"]');
  if (c) { const h = c.querySelector('.player-header'); if (h) { h.classList.add('error-shake'); setTimeout(() => h.classList.remove('error-shake'), 400); } }
}

// ==================== 渲染 ====================
const PLR_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22'];

function renderCardHTML(value, extraClass) {
  const face = cardFace(value), suit = getSuit(value), red = isRedSuit(value);
  const cls = red ? 'suit-color-red' : 'suit-color-black';
  const ec = extraClass ? ' ' + extraClass : '';
  return '<div class="card-shell' + ec + '">' +
    '<div class="card-inner">' +
      '<div class="card-face card-front">' +
        '<div class="corner top-left ' + cls + '"><span>' + face + '</span><span>' + suit + '</span></div>' +
        '<div class="center-suit ' + cls + '">' + suit + '</div>' +
        '<div class="corner bottom-right ' + cls + '"><span>' + face + '</span><span>' + suit + '</span></div>' +
      '</div>' +
      '<div class="card-face card-back"></div>' +
    '</div>' +
  '</div>';
}

function renderAll() {
  if (game.mode === 'local' && game.players.length >= 2) {
    renderTabletop();
    return;
  }
  const area = document.getElementById('players-area'); area.innerHTML = '';
  const isSolo = game.mode === 'solo';
  const isAi = game.mode === 'ai';
  const isFirst = game._firstRender;

  game.players.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'player-card';
    if (p.conceded) card.classList.add('conceded');
    if (game.phase === 'ended' && p.feedbackType === 'ok') card.classList.add('winner');
    if (isAi && p.isAi) card.classList.add('ai-card');
    card.setAttribute('data-index', i);

    const hdr = document.createElement('div'); hdr.className = 'player-header';
    const dot = document.createElement('span'); dot.className = 'dot';
    dot.style.backgroundColor = p.isAi ? '#3498db' : PLR_COLORS[i % PLR_COLORS.length];
    hdr.appendChild(dot);
    const ns = document.createElement('span'); ns.textContent = p.name; hdr.appendChild(ns);

    const st = document.createElement('span'); st.className = 'player-status';
    if (p.isAi && game.aiThinking && game.phase === 'playing' && !p.conceded) {
      st.textContent = '🤖 思考中... ' + game.aiCountdown + 's';
      st.className += ' thinking';
    } else if (game.phase === 'ended' && p.feedbackType === 'ok') {
      st.textContent = '🏆 获胜'; st.className += ' won';
    } else if (p.conceded) {
      st.textContent = '认输'; st.className += ' lost';
    } else {
      st.textContent = '手牌' + p.hand.length + '张';
    }
    hdr.appendChild(st); card.appendChild(hdr);

    const cr = document.createElement('div'); cr.className = 'cards-row';
      p.hand.forEach((v, vi) => {
        let shellCls = '';
        const isNew = (p._newCardIdx === vi);
        if (isNew) {
          shellCls = 'is-face-down is-hit-deal hit-card';
        } else if (isFirst) {
          shellCls = 'is-face-down';
        } else {
          shellCls = 'is-face-up';
        }
        const d = document.createElement('div');
        d.innerHTML = renderCardHTML(v, shellCls);
        const el = d.firstElementChild;

        if (!(isAi && p.isAi)) {
          el.style.cursor = 'pointer';
          el.title = '点击插入 ' + cardFace(v);
          el.onclick = () => {
            soundPlay('click');
            const inp = card.querySelector('.formula-input');
            if (inp) insertSymbol(inp, cardFace(v));
          };
        }
        cr.appendChild(el);

        if (isFirst) {
          const cardEl = el;
          const delay = 80 + vi * 120;
          setTimeout(() => {
            cardEl.classList.remove('is-face-down');
            cardEl.classList.add('is-face-up');
          }, delay);
        }
        if (isNew) {
          const cardEl = el;
          requestAnimationFrame(() => {
            setTimeout(() => {
              cardEl.classList.remove('is-face-down');
              cardEl.classList.add('is-face-up');
            }, 260);
          });
          setTimeout(() => {
            cardEl.classList.remove('is-hit-deal');
          }, 560);
        }
      });
    if (p._newCardIdx !== undefined) {
      setTimeout(() => { p._newCardIdx = undefined; }, 200);
    }
    card.appendChild(cr);

    const act = document.createElement('div'); act.className = 'player-actions';
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'formula-input';
    input.placeholder = '组合算式 = 21';
    input.value = p.inputDraft || '';
    input.disabled = (game.phase !== 'playing' || p.conceded || (isAi && p.isAi));
    input.addEventListener('input', () => { p.inputDraft = input.value; });
    act.appendChild(input);

    const btnSub = document.createElement('button');
    btnSub.className = 'btn-submit'; btnSub.textContent = '提交';
    btnSub.disabled = (game.phase !== 'playing' || p.conceded || (isAi && p.isAi));
    btnSub.onclick = () => submitFormula(i);
    act.appendChild(btnSub);

    const btnDraw = document.createElement('button');
    btnDraw.className = 'btn-draw'; btnDraw.textContent = '+牌';
    btnDraw.disabled = (game.phase !== 'playing' || p.conceded || p.hand.length >= game.maxCards || (isAi && p.isAi));
    btnDraw.onclick = () => drawForPlayer(i);
    act.appendChild(btnDraw);

    if (isSolo) {
      const btnHint = document.createElement('button');
      btnHint.className = 'btn-hint'; btnHint.textContent = '💡提示(' + (game.stats.maxHints - game.stats.hintsUsed) + ')';
      btnHint.disabled = (game.phase !== 'playing' || game.stats.hintsUsed >= game.stats.maxHints || game.aiThinking);
      btnHint.onclick = () => showHint();
      act.appendChild(btnHint);
      if (game.difficulty !== 'easy') {
        const btnCool = document.createElement('button');
        btnCool.className = 'btn-hint btn-cool';
        btnCool.textContent = '🎩妙解';
        btnCool.disabled = (game.phase !== 'playing' || game.aiThinking);
        btnCool.onclick = () => showCoolHint();
        act.appendChild(btnCool);
      }
    }

    const btnConc = document.createElement('button');
    btnConc.className = 'btn-concede'; btnConc.textContent = '认输';
    btnConc.disabled = (game.phase !== 'playing' || p.conceded || (isAi && p.isAi));
    btnConc.onclick = () => concedePlayer(i);
    act.appendChild(btnConc);
    card.appendChild(act);

    const symBar = document.createElement('div');
    symBar.className = 'symbol-bar';
    if (!(isAi && p.isAi) && game.phase === 'playing' && !p.conceded) {
      const syms = [];
      syms.push('(', ')', '+', '-', '*', '/');
      if (game.difficulty !== 'easy') syms.push('^', '√');
      if (game.difficulty === 'hard') syms.push('!');
      syms.push('⌫');
      syms.forEach(s => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'symbol-btn';
        if (s === '⌫') { btn.classList.add('backspace'); btn.textContent = '⌫'; }
        else { btn.textContent = s; }
        if (s === '√') btn.textContent = '√';
        btn.onclick = (e) => {
          e.preventDefault();
          if (s === '⌫') {
            const inp = card.querySelector('.formula-input');
            if (inp && !inp.disabled) {
              const start = inp.selectionStart ?? inp.value.length;
              const end = inp.selectionEnd ?? inp.value.length;
              if (start !== end) { inp.value = inp.value.slice(0, start) + inp.value.slice(end); inp.focus(); inp.setSelectionRange(start, start); inp.dispatchEvent(new Event('input', { bubbles: true })); }
              else if (start > 0) { inp.value = inp.value.slice(0, start - 1) + inp.value.slice(start); inp.focus(); inp.setSelectionRange(start - 1, start - 1); inp.dispatchEvent(new Event('input', { bubbles: true })); }
            }
          } else {
            const inp = card.querySelector('.formula-input');
            if (inp) insertSymbol(inp, s);
          }
        };
        symBar.appendChild(btn);
      });
    } else {
      symBar.classList.add('placeholder');
    }
    card.appendChild(symBar);

    const fb = document.createElement('div');
    fb.className = 'feedback ' + (p.feedbackType || '');
    fb.textContent = p.feedback || '';
    fb.title = p.feedback || '';
    card.appendChild(fb);

    area.appendChild(card);
  });

  if (isSolo && game.phase === 'playing') {
    const sp = document.getElementById('stats-panel');
    sp.classList.remove('hidden');
    sp.innerHTML = '📊 提交:<span>' + game.stats.submits + '</span> | 提示:<span>' + game.stats.hintsUsed + '/' + game.stats.maxHints + '</span> | 加牌:<span>' + game.stats.draws + '</span>';
  } else { document.getElementById('stats-panel').classList.add('hidden'); }

  if (!isSolo) document.getElementById('hint-area').classList.add('hidden');
  if (game._firstRender) State.set('_firstRender', false);
}

// ==================== 围桌模式渲染 ====================
function renderTabletop() {
  const count = game.players.length;
  const area = document.getElementById('players-area');
  const center = document.getElementById('tabletop-center');

  area.innerHTML = '';
  area.classList.add('tabletop-' + count + 'p');

  if (center) {
    area.appendChild(center);
    center.classList.remove('hidden');
    center.style.gridRow = '2';
    center.style.gridColumn = count >= 3 ? '1 / 3' : '1';
  }

  const isFirst = game._firstRender;

  // 玩家位置配置: { row, col, rotate }
  const posConfigs = {
    2: [{ row: 3, col: '1', rotate: false }, { row: 1, col: '1', rotate: true }],
    3: [{ row: 3, col: '1 / 3', rotate: false }, { row: 1, col: '1', rotate: true }, { row: 1, col: '2', rotate: true }],
    4: [{ row: 3, col: '1', rotate: false }, { row: 1, col: '1', rotate: true }, { row: 1, col: '2', rotate: true }, { row: 3, col: '2', rotate: false }]
  };
  const positions = posConfigs[count] || posConfigs[2];

  game.players.forEach((p, i) => {
    const pos = positions[i];
    const card = document.createElement('div');
    card.className = 'player-card';
    if (p.conceded) card.classList.add('conceded');
    if (game.phase === 'ended' && p.feedbackType === 'ok') card.classList.add('winner');
    card.setAttribute('data-index', i);
    card.style.gridRow = pos.row;
    card.style.gridColumn = pos.col;

    if (pos.rotate) {
      card.className += ' player-top';
      card.style.transform = 'rotate(180deg)';
    } else {
      card.className += ' player-bottom';
    }

    const hdr = document.createElement('div'); hdr.className = 'player-header';
    const dot = document.createElement('span'); dot.className = 'dot';
    dot.style.backgroundColor = PLR_COLORS[i % PLR_COLORS.length];
    hdr.appendChild(dot);
    hdr.appendChild(document.createTextNode(p.name));
    const st = document.createElement('span'); st.className = 'player-status';
    if (game.phase === 'ended' && p.feedbackType === 'ok') { st.textContent = '🏆 获胜'; st.className += ' won'; }
    else if (p.conceded) { st.textContent = '认输'; st.className += ' lost'; }
    else { st.textContent = '手牌' + p.hand.length + '张'; }
    hdr.appendChild(st); card.appendChild(hdr);

    const cr = document.createElement('div'); cr.className = 'cards-row';
    p.hand.forEach((v, vi) => {
      const isNew = (p._newCardIdx === vi);
      let cls = 'is-face-up';
      if (isNew) cls = 'is-face-down is-hit-deal hit-card';
      else if (isFirst) cls = 'is-face-down';
      const d = document.createElement('div');
      d.innerHTML = renderCardHTML(v, cls);
      const el = d.firstElementChild;
      el.style.cursor = 'pointer';
      el.title = '点击插入 ' + cardFace(v);
      el.onclick = () => { soundPlay('click'); tableAppendExpr(i, cardFace(v)); };
      cr.appendChild(el);

      if (isFirst) {
        const delay = 80 + vi * 120;
        setTimeout(() => { el.classList.remove('is-face-down'); el.classList.add('is-face-up'); }, delay);
      }
      if (isNew) {
        requestAnimationFrame(() => {
          setTimeout(() => { el.classList.remove('is-face-down'); el.classList.add('is-face-up'); }, 260);
        });
        setTimeout(() => el.classList.remove('is-hit-deal'), 560);
      }
    });
    if (p._newCardIdx !== undefined) { setTimeout(() => { p._newCardIdx = undefined; }, 200); }
    card.appendChild(cr);

    const display = document.createElement('div');
    display.className = 'expr-display';
    display.textContent = p.inputDraft || '';
    card.appendChild(display);

    const act = document.createElement('div'); act.className = 'player-actions';
    const btnSub = document.createElement('button');
    btnSub.className = 'btn-submit'; btnSub.textContent = '提交';
    btnSub.disabled = (game.phase !== 'playing' || p.conceded);
    btnSub.onclick = () => submitFormula(i);
    act.appendChild(btnSub);

    const btnDraw = document.createElement('button');
    btnDraw.className = 'btn-draw'; btnDraw.textContent = '+牌';
    btnDraw.disabled = (game.phase !== 'playing' || p.conceded || p.hand.length >= game.maxCards);
    btnDraw.onclick = () => drawForPlayer(i);
    act.appendChild(btnDraw);

    const btnConc = document.createElement('button');
    btnConc.className = 'btn-concede'; btnConc.textContent = '认输';
    btnConc.disabled = (game.phase !== 'playing' || p.conceded);
    btnConc.onclick = () => concedePlayer(i);
    act.appendChild(btnConc);
    card.appendChild(act);

    const symBar = document.createElement('div'); symBar.className = 'symbol-bar';
    if (game.phase === 'playing' && !p.conceded) {
      const syms = ['(', ')', '+', '-', '*', '/'];
      if (game.difficulty !== 'easy') syms.push('^', '√');
      if (game.difficulty === 'hard') syms.push('!');
      syms.push('⌫');
      syms.forEach(s => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'symbol-btn';
        if (s === '⌫') { btn.classList.add('backspace'); btn.textContent = '⌫'; }
        else { btn.textContent = s; }
        if (s === '√') btn.textContent = '√';
        btn.onclick = (e) => { e.preventDefault(); tableAppendExpr(i, s); };
        symBar.appendChild(btn);
      });
    } else { symBar.classList.add('placeholder'); }
    card.appendChild(symBar);

    const fb = document.createElement('div');
    fb.className = 'feedback ' + (p.feedbackType || '');
    fb.textContent = p.feedback || '';
    fb.title = p.feedback || '';
    card.appendChild(fb);

    area.appendChild(card);
  });

  updateTabletopCenter();
  updateDeckCount();
  if (game._firstRender) State.set('_firstRender', false);
}

function tableAppendExpr(idx, symbol) {
  const p = game.players[idx];
  if (!p || p.conceded || game.phase !== 'playing') return;
  if (symbol === '⌫') {
    p.inputDraft = p.inputDraft.slice(0, -1);
  } else {
    p.inputDraft += symbol;
  }
  updateExprDisplay(idx);
}

function updateExprDisplay(idx) {
  const card = document.querySelector('.player-card[data-index="' + idx + '"]');
  if (card) {
    const display = card.querySelector('.expr-display');
    if (display) display.textContent = game.players[idx].inputDraft || '';
  }
}

function updateTabletopCenter() {
  const timer = document.getElementById('tc-timer');
  const deck = document.getElementById('tc-deck');
  if (timer) {
    const m = Math.floor(game.timerSec / 60), s = game.timerSec % 60;
    timer.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
  if (deck) deck.textContent = game.deck.length;
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
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}

// ==================== 历史面板 ====================
function openHistory() {
  renderHistoryPanel();
  document.getElementById('history-panel').classList.remove('hidden');
}

function closeHistory() {
  document.getElementById('history-panel').classList.add('hidden');
}

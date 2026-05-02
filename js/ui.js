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

function uiIcon(name, extraClass, label) {
  return typeof svgIcon === 'function' ? svgIcon(name, extraClass || '', label || '') : '';
}

function footerIcon(name) {
  return '<span class="icon">' + uiIcon(name) + '</span>';
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
  if (game.phase === 'menu') { fb.innerHTML = footerIcon('card') + '选择游戏模式开始吧！'; return; }
  if (game.phase === 'ended') { fb.innerHTML = footerIcon('trophy') + '游戏结束！'; return; }
  const isSolo = game.mode === 'solo';
  const isAi = game.mode === 'ai';
  if (isSolo) {
    const p = game.players[0];
    if (!p || p.conceded) { fb.innerHTML = footerIcon('single') + '你已认输'; return; }
    if (game.aiThinking) {
      fb.innerHTML = footerIcon('ai') + 'AI思考中...剩余' + game.aiCountdown + 's';
    } else {
      fb.innerHTML = footerIcon('card') + '手牌' + p.hand.length + '张 | 输入算式后提交 | 提示剩余' + (game.stats ? game.stats.maxHints - game.stats.hintsUsed : 0) + '次';
    }
  } else if (isAi) {
    const human = game.players[0];
    const ai = game.players[1];
    if (human && human.conceded) { fb.innerHTML = footerIcon('single') + '你已认输'; return; }
    if (game.aiThinking) {
      fb.innerHTML = footerIcon('ai') + '对手在思考...' + game.aiCountdown + 's';
    } else if (game.aiSolved) {
      fb.innerHTML = footerIcon('ai') + '对手似乎已经找到答案！';
    } else {
      fb.innerHTML = footerIcon('target') + '快！尽快算出' + game.target + '！ | 你的手牌' + human.hand.length + '张';
    }
  } else if (game.mode === 'local') {
    fb.innerHTML = footerIcon('table') + '围桌中 · ' + game.players.filter(p => !p.conceded).length + '人对弈 · 牌库' + game.deck.length + ' · 目标 ' + game.target;
  } else if (game.mode === 'online') {
    const state = game.online.connected ? '已连接' : (game.online.connecting ? '连接中' : '离线');
    const room = game.online.roomCode ? '房间 ' + game.online.roomCode + ' · ' : '';
    if (game.phase === 'lobby') fb.innerHTML = footerIcon('online') + room + state + ' · 等待房主开局';
    else fb.innerHTML = footerIcon('online') + room + state + ' · ' + game.players.filter(p => !p.conceded).length + '人在线对弈 · 牌库' + game.deck.length;
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
    if (!cache || cache.pending || cache.timedOut || !cache.completed) {
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

  const icons = ['sparkle', 'star', 'trophy', 'crown', 'target', 'card'];
  for (let i = 0; i < 30; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.innerHTML = uiIcon(icons[Math.floor(Math.random() * icons.length)], 'confetti-icon');
      el.style.left = Math.random() * 100 + '%';
      el.style.top = -(Math.random() * 40 + 10) + 'px';
      el.style.transform = 'rotate(' + Math.floor(Math.random() * 180) + 'deg)';
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
  const svg = suitSvgHTML(suit);
  return '<div class="card-shell' + ec + '">' +
    '<div class="card-inner">' +
      '<div class="card-face card-front">' +
        '<div class="corner top-left ' + cls + '"><span>' + face + '</span><span class="suit-wrap">' + svg + '</span></div>' +
        '<div class="center-suit ' + cls + '">' + svg + '</div>' +
        '<div class="corner bottom-right ' + cls + '"><span>' + face + '</span><span class="suit-wrap">' + svg + '</span></div>' +
      '</div>' +
      '<div class="card-face card-back"></div>' +
    '</div>' +
  '</div>';
}

function renderAll() {
  if (game.mode === 'online') {
    if (game.phase === 'lobby') renderOnlineLobby();
    else if (game.players.length >= 2) renderTabletop();
    else renderOnlineLobby();
    return;
  }
  if (game.mode === 'local' && game.players.length >= 2) {
    renderTabletop();
    return;
  }
  const area = document.getElementById('players-area'); area.innerHTML = '';
  const isSolo = game.mode === 'solo';
  const isAi = game.mode === 'ai';
  area.classList.toggle('ai-mode', isAi);
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
      st.innerHTML = uiIcon('ai', 'status-inline-icon') + ' ' + t('status_thinking', {N: game.aiCountdown});
      st.className += ' thinking';
    } else if (game.phase === 'ended' && p.feedbackType === 'ok') {
      st.innerHTML = uiIcon('trophy', 'status-inline-icon') + ' ' + t('status_win'); st.className += ' won';
    } else if (p.conceded) {
      st.textContent = t('status_lost'); st.className += ' lost';
    } else {
      st.textContent = t('hand_count', {N: p.hand.length});
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
          el.title = t('card_tooltip', {N: cardFace(v)});
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
      setTimeout(() => { p._newCardIdx = undefined; }, 620);
    }
    card.appendChild(cr);

    const act = document.createElement('div'); act.className = 'player-actions';
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'formula-input';
    input.placeholder = '组合算式 = 21';
    input.value = p.inputDraft || '';
    input.disabled = (game.phase !== 'playing' || p.conceded || (isAi && p.isAi));
    if ((isSolo || isAi) && !p.isAi) {
      input.inputMode = 'none';
      input.autocomplete = 'off';
      input.spellcheck = false;
    }
    input.addEventListener('input', () => { p.inputDraft = input.value; });
    act.appendChild(input);

    const btnSub = document.createElement('button');
    btnSub.className = 'btn-submit'; btnSub.textContent = t('btn_submit');
    btnSub.disabled = (game.phase !== 'playing' || p.conceded || (isAi && p.isAi));
    btnSub.onclick = () => submitFormula(i);
    act.appendChild(btnSub);

    const btnDraw = document.createElement('button');
    btnDraw.className = 'btn-draw'; btnDraw.textContent = t('btn_draw');
    btnDraw.disabled = (game.phase !== 'playing' || p.conceded || p.hand.length >= game.maxCards || (isAi && p.isAi));
    btnDraw.onclick = () => drawForPlayer(i);
    act.appendChild(btnDraw);

    if (isSolo) {
      const btnHint = document.createElement('button');
      btnHint.className = 'btn-hint'; btnHint.innerHTML = uiIcon('rules', 'btn-inline-icon') + t('btn_hint') + '(' + (game.stats.maxHints - game.stats.hintsUsed) + ')';
      btnHint.disabled = (game.phase !== 'playing' || game.stats.hintsUsed >= game.stats.maxHints || game.aiThinking);
      btnHint.onclick = () => showHint();
      act.appendChild(btnHint);
      if (game.difficulty !== 'easy') {
        const btnCool = document.createElement('button');
        btnCool.className = 'btn-hint btn-cool';
        btnCool.innerHTML = uiIcon('sparkle', 'btn-inline-icon') + t('btn_cool_hint');
        btnCool.disabled = (game.phase !== 'playing' || game.aiThinking);
        btnCool.onclick = () => showCoolHint();
        act.appendChild(btnCool);
      }
    }

    const btnConc = document.createElement('button');
    btnConc.className = 'btn-concede'; btnConc.textContent = t('btn_give_up');
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
    sp.innerHTML = uiIcon('history', 'stats-inline-icon') + ' 提交:<span>' + game.stats.submits + '</span> | 提示:<span>' + game.stats.hintsUsed + '/' + game.stats.maxHints + '</span> | 加牌:<span>' + game.stats.draws + '</span>';
  } else { document.getElementById('stats-panel').classList.add('hidden'); }

  if (!isSolo) document.getElementById('hint-area').classList.add('hidden');
  if (game._firstRender) State.set('_firstRender', false);
}

// ==================== 围桌模式渲染 ====================
function getTabletopRenderEntries() {
  const entries = game.players.map((player, index) => ({ player, index }));
  if (game.mode !== 'online') return entries;
  const mine = entries.findIndex(entry => entry.player && entry.player.id === game.online.playerId);
  if (mine <= 0) return entries;
  return entries.slice(mine).concat(entries.slice(0, mine));
}

function renderTabletop() {
  const entries = getTabletopRenderEntries();
  const count = entries.length;
  const area = document.getElementById('players-area');
  const center = document.getElementById('tabletop-center');
  const isOnline = game.mode === 'online';

  if (count === 4 && game.tabletopLayout === 'round' && window.innerWidth < 1024) {
    game.tabletopLayout = 'standard';
  }
  const isRound = count === 4 && game.tabletopLayout === 'round';

  area.innerHTML = '';
  area.classList.remove('online-lobby', 'tabletop-2p', 'tabletop-3p', 'tabletop-4p', 'round-layout');
  area.classList.add('tabletop-' + count + 'p');
  if (isRound) area.classList.add('round-layout');
  if (isOnline) area.classList.add('online-tabletop');

  if (center) {
    area.appendChild(center);
    center.classList.remove('hidden');
    if (isRound) {
      center.style.left = 'calc(var(--ph) + var(--pg))';
      center.style.top = 'calc(var(--ph) + var(--pg))';
      center.style.width = 'calc(var(--pw) - var(--ph) - var(--pg))';
      center.style.height = 'calc(var(--pw) - var(--ph) - var(--pg))';
      center.style.gridRow = '';
      center.style.gridColumn = '';
    } else {
      center.style.left = '';
      center.style.top = '';
      center.style.width = '';
      center.style.height = '';
      center.style.gridRow = '2';
      center.style.gridColumn = count >= 3 ? '1 / 3' : '1';
    }

    let toggleBtn = center.querySelector('.tc-layout-toggle');
    if (count === 4 && !isOnline && window.innerWidth >= 1024) {
      if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.className = 'tc-layout-toggle';
        toggleBtn.title = t('table_layout_toggle_tip');
        toggleBtn.onclick = function() {
          game.tabletopLayout = game.tabletopLayout === 'standard' ? 'round' : 'standard';
          renderTabletop();
        };
        center.appendChild(toggleBtn);
      }
      toggleBtn.textContent = isRound ? t('table_layout_standard') : t('table_layout_round');
      toggleBtn.style.display = '';
    } else if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
  }

  const isFirst = game._firstRender;

  // 玩家位置配置: standard 用 {row,col,rotate}, round 用 {left,top,w,h,rotate}
  const posConfigs = {
    2: [{ row: 3, col: '1', rotate: 0 }, { row: 1, col: '1', rotate: 180 }],
    3: [{ row: 3, col: '1 / 3', rotate: 0 }, { row: 1, col: '1', rotate: 180 }, { row: 1, col: '2', rotate: 180 }],
    4: {
      standard: [{ row: 3, col: '1', rotate: 0 }, { row: 1, col: '1', rotate: 180 }, { row: 1, col: '2', rotate: 180 }, { row: 3, col: '2', rotate: 0 }],
      round: [
        { left: 'calc(var(--ph) + var(--pg))',                          top: 'calc(var(--pw) + var(--pg))',                          w: 'var(--pw)', h: 'var(--ph)', rotate: 0 },
        { left: 'calc(0px - var(--ho))',                                top: 'calc(var(--ph) + var(--pg) + var(--ho))',             w: 'var(--pw)', h: 'var(--ph)', rotate: 90 },
        { left: '0',                                                    top: '0',                                                    w: 'var(--pw)', h: 'var(--ph)', rotate: 180 },
        { left: 'calc(var(--pw) + var(--pg) - var(--ho))',              top: 'var(--ho)',                                            w: 'var(--pw)', h: 'var(--ph)', rotate: -90 }
      ]
    }
  };
  const configForCount = posConfigs[count];
  const positions = (count === 4 ? configForCount[isRound ? 'round' : 'standard'] : configForCount) || posConfigs[2];

  entries.forEach((entry, visualIndex) => {
    const p = entry.player;
    const i = entry.index;
    const pos = positions[visualIndex];
    const card = document.createElement('div');
    card.className = 'player-card';
    if (p.conceded) card.classList.add('conceded');
    if (game.phase === 'ended' && p.feedbackType === 'ok') card.classList.add('winner');
    card.setAttribute('data-index', i);
    if (isRound) {
      card.style.left = pos.left;
      card.style.top = pos.top;
      card.style.width = pos.w;
      card.style.height = pos.h;
    } else {
      card.style.gridRow = pos.row;
      card.style.gridColumn = pos.col;
    }

    if (pos.rotate === 180) {
      card.className += ' player-top';
      card.style.transform = 'rotate(180deg)';
    } else if (pos.rotate === 90) {
      card.className += ' player-left';
      card.style.transform = 'rotate(90deg)';
    } else if (pos.rotate === -90) {
      card.className += ' player-right';
      card.style.transform = 'rotate(-90deg)';
    } else {
      card.className += ' player-bottom';
    }

    const hdr = document.createElement('div'); hdr.className = 'player-header';
    const dot = document.createElement('span'); dot.className = 'dot';
    dot.style.backgroundColor = PLR_COLORS[i % PLR_COLORS.length];
    hdr.appendChild(dot);
    hdr.appendChild(document.createTextNode(p.name));
    const st = document.createElement('span'); st.className = 'player-status';
    if (game.phase === 'ended' && p.feedbackType === 'ok') { st.innerHTML = uiIcon('trophy', 'status-inline-icon') + ' ' + t('status_win'); st.className += ' won'; }
    else if (p.conceded) { st.textContent = t('status_lost'); st.className += ' lost'; }
    else { st.textContent = t('hand_count', {N: p.hand.length}); }
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
      el.setAttribute('data-card-index', vi);
      const canControl = !isOnline || p.id === game.online.playerId;
      if (canControl) {
        el.style.cursor = 'pointer';
        el.title = t('card_tooltip', {N: cardFace(v)});
        el.onclick = () => { soundPlay('click'); tableAppendExpr(i, cardFace(v), { action: 'card', cardIndex: vi }); };
      } else {
        el.style.cursor = 'default';
        el.title = t('hand_public', {name: p.name});
      }
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
    if (p._newCardIdx !== undefined) { setTimeout(() => { p._newCardIdx = undefined; }, 620); }
    card.appendChild(cr);

    const display = document.createElement('div');
    display.className = 'expr-display';
    if (p._remoteExprPulse) display.classList.add('remote-expr-action');
    display.textContent = p.inputDraft || '';
    card.appendChild(display);

    const act = document.createElement('div'); act.className = 'player-actions';
    const btnSub = document.createElement('button');
    btnSub.className = 'btn-submit'; btnSub.textContent = t('btn_submit');
    btnSub.disabled = (game.phase !== 'playing' || p.conceded || (isOnline && p.id !== game.online.playerId));
    btnSub.onclick = () => isOnline ? onlineSubmitFormula(i) : submitFormula(i);
    act.appendChild(btnSub);

    const btnDraw = document.createElement('button');
    btnDraw.className = 'btn-draw'; btnDraw.textContent = t('btn_draw');
    btnDraw.disabled = (game.phase !== 'playing' || p.conceded || p.hand.length >= game.maxCards || (isOnline && p.id !== game.online.playerId));
    btnDraw.onclick = () => isOnline ? onlineDrawCard(i) : drawForPlayer(i);
    act.appendChild(btnDraw);

    const btnConc = document.createElement('button');
    btnConc.className = 'btn-concede'; btnConc.textContent = t('btn_give_up');
    btnConc.disabled = (game.phase !== 'playing' || p.conceded || (isOnline && p.id !== game.online.playerId));
    btnConc.onclick = function() {
      if (!confirm(t('confirm_give_up'))) return;
      if (isOnline) onlineConcede(i);
      else concedePlayer(i);
    };
    act.appendChild(btnConc);

    card.appendChild(act);

    const symBar = document.createElement('div'); symBar.className = 'symbol-bar';
    if (game.phase === 'playing' && !p.conceded && (!isOnline || p.id === game.online.playerId)) {
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
        btn.onclick = (e) => {
          e.preventDefault();
          tableAppendExpr(i, s, { action: s === '鈱?' ? 'backspace' : 'symbol', symbol: s });
        };
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
  renderOnlineChatBar();
  if (game._firstRender) State.set('_firstRender', false);
}

function tableAppendExpr(idx, symbol, meta) {
  const p = game.players[idx];
  if (!p || p.conceded || game.phase !== 'playing') return;
  if (game.mode === 'online' && p.id !== game.online.playerId) return;
  if (symbol === '⌫') {
    p.inputDraft = p.inputDraft.slice(0, -1);
  } else {
    p.inputDraft += symbol;
  }
  updateExprDisplay(idx);
  if (game.mode === 'online') {
    sendOnlineDraftUpdate(idx, meta || { action: 'typing', symbol: symbol });
  }
}

function renderOnlineChatBar() {
  const bar = document.getElementById("online-chat-bar");
  if (!bar) return;
  if (game.mode !== "online" || (game.phase !== "lobby" && game.phase !== "playing")) {
    bar.classList.add("hidden");
    return;
  }
  bar.innerHTML = "";
  bar.classList.remove("hidden");

  const isPlaying = game.phase === "playing";
  const items = isPlaying
    ? [["solved", t("chat_got_it")], ["close", t("chat_close")], ["luck", t("chat_go")], ["nice", t("chat_nice")], ["gg", t("chat_gg")]]
    : [["ready", t("chat_ready")], ["hello", t("chat_hello")], ["wait", t("chat_wait")], ["hurry", t("chat_start")], ["again", t("chat_again")]];

  items.forEach(function(item) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item[1];
    btn.disabled = !game.online.connected;
    btn.onclick = function() { onlineQuickChat(item[0]); };
    bar.appendChild(btn);
  });
}

function renderOnlineLobby() {
  const area = document.getElementById('players-area');
  const center = document.getElementById('tabletop-center');
  if (center) {
    document.getElementById('main-container').appendChild(center);
    center.classList.add('hidden');
  }
  area.innerHTML = '';
  area.className = 'online-lobby';
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');

  const panel = document.createElement('section');
  panel.className = 'online-lobby-panel';

  const title = document.createElement('div');
  title.className = 'online-room-title';
  title.innerHTML = '<span>联网房间</span><strong>' + (game.online.roomCode || '------') + '</strong>';
  panel.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'online-room-meta';
  meta.textContent = (game.online.connected ? '已连接' : '离线') + ' · ' + ({ easy: '简单', normal: '普通', hard: '困难' }[game.difficulty] || '简单') + ' · 目标 ' + game.target;
  panel.appendChild(meta);

  const list = document.createElement('div');
  list.className = 'online-seat-list';
  var seatHeader = document.createElement('div');
  seatHeader.className = 'online-seat-header';
  seatHeader.textContent = '玩家列表（' + game.players.length + '/' + (game.online.maxPlayers || 4) + '）';
  list.appendChild(seatHeader);
  game.players.forEach((player, idx) => {
    const row = document.createElement('div');
    row.className = 'online-seat-row';
    if (player.id === game.online.playerId) row.classList.add('mine');
    const left = document.createElement('span');
    left.className = 'online-seat-name';
    left.innerHTML = '<span class="seat-index">P' + (idx + 1) + '</span>' +
      (player.host ? '<span class="seat-host">' + uiIcon('crown', 'seat-host-icon') + '房主</span>' : '') +
      '<span class="seat-player-name">' + escapeHtml(player.name) + '</span>';
    const right = document.createElement('span');
    right.className = player.connected ? 'online-ready' : 'online-offline';
    right.innerHTML = player.connected
      ? uiIcon(player.ready ? 'check' : 'wait', 'status-inline-icon') + (player.ready ? '已准备' : '未准备')
      : uiIcon('onlineOff', 'status-inline-icon') + '短线离席';
    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  });
  // 空位占位
  const maxP = game.online.maxPlayers || 4;
  for (var ei = game.players.length; ei < maxP; ei++) {
    const empty = document.createElement('div');
    empty.className = 'online-seat-row empty-seat';
    empty.innerHTML = '<span>P' + (ei + 1) + ' · -------</span><span class="online-empty">等待加入</span>';
    list.appendChild(empty);
  }
  panel.appendChild(list);

  const myPlayer = game.players.find(function(p) { return p.id === game.online.playerId; });
  const isReady = myPlayer && myPlayer.ready;

  const actions = document.createElement('div');
  actions.className = 'online-lobby-actions';
  const ready = document.createElement('button');
  ready.className = 'btn-lobby-primary' + (isReady ? ' btn-ready-active' : '');
  ready.innerHTML = isReady ? uiIcon('check', 'btn-inline-icon') + '已准备' : '准备';
  ready.disabled = !game.online.connected;
  ready.onclick = function() {
    var newReady = !(myPlayer && myPlayer.ready);
    sendOnlineAction("ready", { ready: newReady });
    ready.innerHTML = newReady ? uiIcon('check', 'btn-inline-icon') + '已准备' : '准备';
    if (newReady) { ready.classList.add('btn-ready-active'); }
    else { ready.classList.remove('btn-ready-active'); }
    if (myPlayer) myPlayer.ready = newReady;
    var rightEls = document.querySelectorAll('.online-seat-row.mine .online-ready');
    if (rightEls.length) rightEls[0].innerHTML = uiIcon(newReady ? 'check' : 'wait', 'status-inline-icon') + (newReady ? '已准备' : '未准备');
  };
  actions.appendChild(ready);
  const start = document.createElement('button');
  start.className = 'btn-lobby-primary';
  start.textContent = '开始对局';
  start.disabled = !game.online.connected || !game.online.isHost || game.players.length < 2;
  start.onclick = onlineStartGame;
  actions.appendChild(start);
  const share = document.createElement('button');
  share.className = 'secondary';
  share.textContent = '复制房间码';
  share.onclick = () => {
    if (navigator.clipboard && game.online.roomCode) navigator.clipboard.writeText(game.online.roomCode);
    showToast('房间码：' + game.online.roomCode, 'submit');
  };
  actions.appendChild(share);
  const leave = document.createElement('button');
  leave.className = 'secondary';
  leave.textContent = '离开房间';
  leave.onclick = function() {
    if (confirm('确定要离开房间吗？')) onlineLeaveRoom();
  };
  actions.appendChild(leave);
  panel.appendChild(actions);

  area.appendChild(panel);
  updateFooterBar();
  renderOnlineChatBar();
}

function updateExprDisplay(idx) {
  const card = document.querySelector('.player-card[data-index="' + idx + '"]');
  if (card) {
    const display = card.querySelector('.expr-display');
    if (display) display.textContent = game.players[idx].inputDraft || '';
  }
}

function restartCssAnimation(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function flashRemoteCardAction(idx, cardIndex) {
  const card = document.querySelector('.player-card[data-index="' + idx + '"]');
  if (!card) return;
  const shells = card.querySelectorAll('.card-shell');
  const shell = shells[cardIndex];
  restartCssAnimation(shell, 'remote-card-action');
  setTimeout(() => { if (shell) shell.classList.remove('remote-card-action'); }, 520);
}

function flashRemoteExprAction(idx) {
  const player = game.players[idx];
  if (player) player._remoteExprPulse = true;
  const card = document.querySelector('.player-card[data-index="' + idx + '"]');
  if (!card) return;
  restartCssAnimation(card.querySelector('.expr-display'), 'remote-expr-action');
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

function updateTcEvent(text) {
  const el = document.getElementById('tc-event');
  if (el) el.textContent = text || '';
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

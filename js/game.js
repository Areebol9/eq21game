"use strict";
// ==================== 计时器 ====================
function startTimer() {
  State.set('timerSec', 0); updateTimerUI(); stopTimer();
  State.set('timerInterval', setInterval(() => { game.timerSec++; updateTimerUI(); updateFooterBar(); updateSolutionHint(); }, 1000));
}
function stopTimer() {
  if (game.timerInterval) { clearInterval(game.timerInterval); State.set('timerInterval', null); }
}

// ==================== 提示系统（增强版） ====================
function extractFirstStep(solution) {
  if (!solution) return null;
  const mInner = solution.match(/\(([^()]+?)\)/);
  if (mInner) return mInner[1];
  const mSimple = solution.match(/^\(?(\d+|[AJQK])([+\-*\/])(\d+|[AJQK])/);
  if (mSimple) return mSimple[1] + ' ' + mSimple[2] + ' ' + mSimple[3];
  return null;
}

function showHint() {
  if (game.mode !== 'solo' || game.phase !== 'playing') return;
  if (game.stats.hintsUsed >= game.stats.maxHints) return;
  const p = game.players[0];
  const solutions = aiSolve([...p.hand], game.target, getBinaryOps());
  game.stats.hintsUsed++;
  const level = game.stats.hintsUsed;

  if (solutions.length === 0) {
    const msgs = [
      '🤔 当前手牌无法算出21，建议加牌试试',
      '🧐 还是无解，再加一张牌也许有转机',
      '😅 依然无解...试试换一组牌？'
    ];
    showToast('💡 提示 #' + level + '：' + msgs[Math.min(level - 1, msgs.length - 1)], 'error');
    addLog('提示 #' + level + '：当前手牌无解', 'hint');
  } else if (level === 1) {
    const sol = solutions[0];
    const hasMul = sol.includes('*'), hasDiv = sol.includes('/'), hasAdd = sol.includes('+'), hasSub = sol.includes('-');
    const parts = [];
    if (hasMul) parts.push('乘法');
    if (hasDiv) parts.push('除法');
    if (hasAdd) parts.push('加法');
    if (hasSub) parts.push('减法');
    const firstStep = extractFirstStep(sol);
    let hintMsg = '💡 提示 #1：试试用 ' + parts.join(' 和 ') + ' 组合';
    if (firstStep) hintMsg += '，比如可以先尝试「' + firstStep + '」';
    showToast(hintMsg, 'submit');
    addLog('提示 #1：方向性提示已显示', 'hint');
  } else if (level === 2) {
    const sol = solutions[0];
    const firstStep = extractFirstStep(sol);
    if (firstStep) {
      const tokens = tokenize(firstStep);
      if (tokens.length === 3 && tokens[0].type === TOK_NUM && tokens[1].type === TOK_OP && tokens[2].type === TOK_NUM) {
        try {
          const subVal = evaluate(firstStep);
          showToast('💡 提示 #2：先算出「' + firstStep + ' = ' + formatNum(subVal) + '」，再处理剩余牌', 'submit');
          addLog('提示 #2：中间值提示  → ' + firstStep + ' = ' + formatNum(subVal), 'hint');
        } catch (e) {
          showToast('💡 提示 #2：尝试从「' + firstStep + '」开始~', 'submit');
          addLog('提示 #2：模糊步骤提示', 'hint');
        }
      } else {
        showToast('💡 提示 #2：试试先从几个牌组合出关键中间值', 'submit');
        addLog('提示 #2：模糊步骤提示', 'hint');
      }
    } else {
      showToast('💡 提示 #2：试着先合并其中两张牌', 'submit');
      addLog('提示 #2：模糊步骤提示', 'hint');
    }
  } else {
    showToast('💡 答案：' + solutions[0] + ' = 21', 'win');
    addLog('提示 #3（答案）：' + solutions[0] + ' = 21', 'hint');
  }
  renderAll();
}

// ==================== 玩家操作 ====================
function submitFormula(idx) {
  if (game.phase !== 'playing') return;
  const p = game.players[idx]; if (p.conceded) return;
  const expr = normalizeInput(p.inputDraft || '').trim();
  if (!expr) { setFeedback(idx, '🤔 嗯？你的算式呢？别害羞~', 'err'); shakeCard(idx); soundPlay('error'); return; }
  const handValidation = validateHand(expr, p.hand);
  if (!handValidation.valid) {
    let fbMsg;
    if (handValidation.reason === 'notAllUsed') {
      fbMsg = '⚠️ 还有 ' + handValidation.missing + ' 张牌没用！手牌必须全部用完哦~';
    } else if (handValidation.reason === 'extraCards') {
      fbMsg = '🕵️ 多了 ' + handValidation.extra + ' 张牌！请不要使用不属于你的牌~';
    } else if (handValidation.reason === 'noMatch') {
      fbMsg = '🃏 你没有用到任何手牌！请用手牌中的数字（' + p.hand.map(cardFace).join(' ') + '）组成算式~';
    } else if (handValidation.reason === 'invalidNumbers') {
      fbMsg = '🚫 你用了不存在的牌值 ' + handValidation.invalidVals.join(', ') + '！牌面数字只能是 1~13（A=1, J=11, Q=12, K=13）';
    } else {
      fbMsg = '🕵️ 手牌不匹配！请检查是否用了不属于你的牌~';
    }
    setFeedback(idx, fbMsg, 'err');
    addLog(p.name + ' 提交了算式，但手牌不匹配 ❌', 'err');
    shakeCard(idx); soundPlay('error'); return;
  }
  let result;
  try { result = evaluate(expr); }
  catch (e) { setFeedback(idx, '🧮 算式格式错误: ' + e.message, 'err'); addLog(p.name + ' 提交了非法算式 ❌', 'err'); shakeCard(idx); soundPlay('error'); return; }
  if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
    setFeedback(idx, '计算结果无效', 'err'); addLog(p.name + ' 算式结果无效 ❌', 'err'); shakeCard(idx); soundPlay('error'); return;
  }
  game.stats.submits++;

  if (Math.abs(result - game.target) < 0.000001) {
    State.set('phase', 'ended'); stopTimer(); stopAiThinking();

    // === 评分与历史记录 ===
    const scoreResult = calculateScore(p, expr, p.hand.length, game.stats.submits, game.timerSec);
    State.set('currentScore', scoreResult.total);
    State.set('scoreBreakdown', scoreResult.breakdown);
    const data = loadHistory();
    const streak = computeStreak(data.records, p.name) + 1;
    State.set('gameTags', getTags(expr, p.hand.length, game.stats.submits, game.timerSec, streak, game.difficulty));

    if (!p.isAi) {
      addRecord({
        id: generateId(), ts: Date.now(),
        mode: game.mode, difficulty: game.difficulty,
        result: 'win',
        player: p.name, hand: [...p.hand],
        formula: expr,
        score: game.currentScore,
        timeSec: game.timerSec,
        submits: game.stats.submits,
        hintsUsed: game.stats.hintsUsed || 0,
        tags: game.gameTags
      });

      if (game.mode === 'local') {
        for (let i = 0; i < game.players.length; i++) {
          if (i === idx) continue;
          const other = game.players[i];
          if (!other.conceded && !other.isAi) {
            addRecord({
              id: generateId(), ts: Date.now(),
              mode: game.mode, difficulty: game.difficulty,
              result: 'lose',
              player: other.name, hand: [...other.hand],
              formula: '', score: 50,
              timeSec: game.timerSec,
              submits: game.stats.submits, hintsUsed: 0,
              tags: []
            });
          }
        }
      }
    }

    p.feedback = '🎉 =' + game.target + ' 获胜！+' + game.currentScore + '分';

    p.feedbackType = 'ok';
    setFeedback(idx, p.feedback, 'ok');
    var winMsg = '🏆 ' + p.name + ' 提交算式 "' + expr + '" = ' + game.target + ' 获胜！！！+' + game.currentScore + '分';
    addLog(winMsg, 'win');
    var toastWin = '🎉 ' + p.name + ' 获胜！答案 = ' + game.target + ' +' + game.currentScore + '分';
    showToast(toastWin, 'win');
    document.getElementById('hint-area').classList.add('hidden');
    soundPlay('win'); triggerVictoryEffect();
    showResult(idx); renderAll();
  } else {
    const diff = result - game.target;
    const absDiff = Math.abs(diff);
    let fbMsg, toastMsg;
    if (absDiff <= 2) {
      fbMsg = '🔥 差一点！= ' + formatNum(result) + '，就差 ' + formatNum(absDiff) + '！';
      toastMsg = p.name + ' 提交 = ' + formatNum(result) + '（只差 ' + formatNum(absDiff) + '！）';
    } else if (absDiff <= 10) {
      fbMsg = '🤔 偏差 ' + formatNum(absDiff) + '，考虑用乘除调整试试';
      toastMsg = p.name + ' 提交 = ' + formatNum(result) + '（偏差 ' + formatNum(absDiff) + '）';
    } else {
      fbMsg = '📉 偏了 ' + formatNum(absDiff) + '，离21有点远…';
      toastMsg = p.name + ' 提交 = ' + formatNum(result) + '（差太远了）';
    }
    setFeedback(idx, fbMsg, 'err');
    addLog(p.name + ' 提交算式 "' + expr + '" = ' + formatNum(result) + ' ≠ ' + game.target + ' ❌', 'err');
    showToast(toastMsg, 'error');
    shakeCard(idx); soundPlay('error');
  }
}

function drawForPlayer(idx) {
  if (game.phase !== 'playing') return;
  const p = game.players[idx]; if (p.conceded) return;
  if (p.hand.length >= game.maxCards) { setFeedback(idx, '已达' + game.maxCards + '张上限', 'err'); return; }
  if (!game.deck.length) { setFeedback(idx, '牌库已空', 'err'); return; }
  const card = drawCard(); if (card === null) return;
  p.hand.push(card); p.feedback = '加牌: +' + cardFace(card); p.feedbackType = 'ok';
  addLog('🃏 ' + p.name + ' 加了一张牌 → ' + cardFace(card) + ' (手牌' + p.hand.length + '张)', 'info');
  showToast('🃏 ' + p.name + ' +牌 → ' + cardFace(card), 'draw');
  if (game.mode === 'solo') { game.stats.draws++; _lastCheckedHand = ''; }
  p._newCardIdx = p.hand.length - 1;
  updateDeckCount(); renderAll(); updateFooterBar();
  soundPlay('draw');
  if (game.mode === 'ai' && p.isAi) scheduleAiThink();
}

function concedePlayer(idx) {
  if (game.phase !== 'playing') return;
  const p = game.players[idx]; if (p.conceded) return;
  p.conceded = true; p.feedback = '已认输'; p.feedbackType = '';

  // 记录认输（AI不写入历史）
  if (!p.isAi) {
    addRecord({
      id: generateId(), ts: Date.now(),
      mode: game.mode, difficulty: game.difficulty,
      result: 'lose',
      player: p.name, hand: [...p.hand],
      formula: '', score: 50,
      timeSec: game.timerSec,
      submits: game.stats.submits || 0, hintsUsed: 0,
      tags: []
    });
  }

  addLog('🏳️ ' + p.name + ' 举白旗了！', 'info');
  showToast('🏳️ ' + p.name + ' 认输', 'concede');
  renderAll(); updateFooterBar();
  checkGameEnd();
}

function checkGameEnd() {
  if (game.phase !== 'playing') return;
  const active = game.players.filter(p => !p.conceded);
  if (active.length === 0) {
    State.set('phase', 'ended'); stopTimer(); stopAiThinking();
    addLog('所有玩家都认输了，本局无胜者 🤝', 'info');
    showResult(-1); renderAll(); return;
  }
  if (game.mode === 'ai' && active.length === 1 && active[0].isAi) {
    State.set('phase', 'ended'); stopTimer(); stopAiThinking();
    const ai = game.players[game.aiPlayerIndex];
    ai.feedback = '🎉 对手认输，AI获胜！'; ai.feedbackType = 'ok';

    // 记录人类玩家失败
    const humanIdx = game.aiPlayerIndex === 0 ? 1 : 0;
    const human = game.players[humanIdx];
    if (human) {
      addRecord({
        id: generateId(), ts: Date.now(),
        mode: game.mode, difficulty: game.difficulty,
        result: 'lose',
        player: human.name, hand: [...human.hand],
        formula: '', score: 50,
        timeSec: game.timerSec,
        submits: game.stats.submits, hintsUsed: 0,
        tags: []
      });
    }

    addLog('🤖 AI获胜！所有人类玩家已认输', 'win');
    showToast('🤖 AI获胜！', 'win');
    triggerVictoryEffect();
    showResult(game.aiPlayerIndex); renderAll();
  }
}

// ==================== AI 逻辑 ====================
function stopAiThinking() {
  State.set('aiThinking', false); State.set('aiCountdown', 0);
  if (game.aiTimerId) { clearTimeout(game.aiTimerId); State.set('aiTimerId', null); }
  if (game.aiCountdownInterval) { clearInterval(game.aiCountdownInterval); State.set('aiCountdownInterval', null); }
}

function scheduleAiThink() {
  if (game.mode !== 'ai' || game.phase !== 'playing') return;
  stopAiThinking();
  const aiIdx = game.aiPlayerIndex;
  const ai = game.players[aiIdx];
  if (ai.conceded) return;

  State.set('aiThinking', true);
  State.set('aiCountdown', 99);
  renderAll(); updateFooterBar();

  setTimeout(() => {
    if (game.phase !== 'playing' || ai.conceded) { State.set('aiThinking', false); renderAll(); updateFooterBar(); return; }

    const solutions = aiSolve([...ai.hand], game.target, getBinaryOps());
    const hasSolution = solutions.length > 0;
    State.set('aiSolved', hasSolution);
    State.set('aiSolution', hasSolution ? solutions[0] : null);

    const rates = { easy: 0.3, medium: 0.5, hard: 0.7 };
    const rate = rates[game.aiLevel] || 0.5;
    const willSucceed = hasSolution && Math.random() < rate;

    const delay = 40000 + Math.floor(Math.random() * 40000);
    State.set('aiCountdown', Math.ceil(delay / 1000));
    renderAll(); updateFooterBar();

    State.set('aiCountdownInterval', setInterval(() => {
      game.aiCountdown--;
      if (game.aiCountdown <= 0 || game.phase !== 'playing') {
        clearInterval(game.aiCountdownInterval);
        State.set('aiCountdownInterval', null);
      }
      updateFooterBar();
      const card = document.querySelector('.player-card[data-index="' + aiIdx + '"]');
      if (card) {
        const st = card.querySelector('.player-status');
        if (st && game.aiThinking) st.textContent = '🤖 思考中... ' + Math.max(0, game.aiCountdown) + 's';
      }
    }, 1000));

    State.set('aiTimerId', setTimeout(() => {
      clearInterval(game.aiCountdownInterval);
      State.set('aiCountdownInterval', null);
      State.set('aiThinking', false); State.set('aiCountdown', 0);
      if (game.phase !== 'playing') { renderAll(); updateFooterBar(); return; }
      if (ai.conceded) { renderAll(); updateFooterBar(); return; }

      if (willSucceed && solutions.length > 0) {
        const sol = solutions[0];
        ai.inputDraft = sol;
        addLog('🤖 ' + ai.name + ' 得意地提交了答案！', 'info');
        showToast('🤖 ' + ai.name + ' 提交了答案！', 'submit');
        renderAll();
        setTimeout(() => {
          const input = document.querySelector('.player-card[data-index="' + aiIdx + '"] .formula-input');
          if (input) input.value = sol;
          submitFormula(aiIdx);
        }, 400);
      } else {
        if (ai.hand.length >= game.maxCards || !game.deck.length) {
          ai.conceded = true; ai.feedback = 'AI认输'; ai.feedbackType = '';
          addLog('🤖 ' + ai.name + ' 挠了挠头，表示放弃…', 'info');
          showToast('🤖 ' + ai.name + ' 认输🏳️', 'concede');
          checkGameEnd();
        } else {
          const card = drawCard();
          if (card !== null) {
            ai.hand.push(card);
            addLog('🤖 ' + ai.name + ' 想不出，加了一张牌 → ' + cardFace(card) + ' (手牌' + ai.hand.length + '张)', 'info');
            showToast('🤖 ' + ai.name + ' +牌 → ' + cardFace(card), 'draw');
            updateDeckCount();
            if (game.phase === 'playing') scheduleAiThink();
          }
          checkGameEnd();
        }
        renderAll(); updateFooterBar();
      }
    }, delay));
  }, 30);
}

// ==================== 游戏流程 ====================
function selectDifficulty(diff, btn) {
  State.set('difficulty', diff);
  document.querySelectorAll('#menu-overlay .choice-card').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('diff-badge').textContent = { easy: '简单', normal: '普通', hard: '困难' }[diff];
  document.getElementById('diff-badge').className = 'diff-badge ' + (diff === 'easy' ? 'diff-easy' : diff === 'normal' ? 'diff-normal' : 'diff-hard');
}

function selectAiLevel(lvl, btn) {
  State.set('aiLevel', lvl);
  document.querySelectorAll('#ai-setup-overlay .choice-card').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function showComingSoon() { alert('联网对战模式即将推出，敬请期待！'); }

function showRules() { document.getElementById('rules-overlay').classList.remove('hidden'); }
function hideRules() { document.getElementById('rules-overlay').classList.add('hidden'); }

function goToMenu() {
  stopTimer(); stopAiThinking();
  State.set('phase', 'menu'); State.set('players', []); State.set('deck', []); State.set('timerSec', 0); State.set('aiSolved', false); State.set('aiSolution', null);
  State.set('_firstRender', false); State.set('_solving', false); _lastCheckedHand = '';
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('gameTags', []);
  updateTimerUI(); updateDeckCount();
  document.getElementById('players-area').innerHTML = '';
  document.getElementById('log-panel').innerHTML = '';
  document.getElementById('footer-bar').innerHTML = '<span class="icon">♠</span> 准备开始游戏...';
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('ai-setup-overlay').classList.add('hidden');
  document.getElementById('local-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('rules-overlay').classList.add('hidden');
  updateModeBadge('');
}

function startMode(mode) {
  document.getElementById('menu-overlay').classList.add('hidden');
  if (mode === 'solo') {
    State.set('mode', 'solo'); updateModeBadge('单人练习'); startSoloGame();
  } else if (mode === 'local') {
    State.set('mode', 'local'); updateModeBadge('本地多人');
    document.getElementById('local-setup-overlay').classList.remove('hidden');
    updateNameInputs();
  } else if (mode === 'ai') {
    State.set('mode', 'ai'); updateModeBadge('AI对战');
    document.getElementById('ai-setup-overlay').classList.remove('hidden');
  }
}

function updateModeBadge(text) {
  const b = document.getElementById('mode-badge');
  if (text) { b.textContent = text; b.style.display = ''; }
  else b.style.display = 'none';
}

function updateNameInputs() {
  const count = parseInt(document.getElementById('player-count').value) || 2;
  const c = document.getElementById('player-name-inputs'); c.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = '<label>玩家' + (i + 1) + '</label><input type="text" id="pname-' + i + '" value="玩家' + (i + 1) + '" maxlength="10">';
    c.appendChild(r);
  }
}

function initPlayers(names, isAiFlags) {
  State.set('players', []);
  for (let i = 0; i < names.length; i++) {
    game.players.push({
      name: names[i], hand: [], conceded: false,
      feedback: '', feedbackType: '', inputDraft: '',
      isAi: !!isAiFlags[i]
    });
  }
}

function dealCards() {
  State.set('deck', createDeck()); shuffle(game.deck); State.set('_maxHintShown', false);
  State.set('_firstRender', true); _lastCheckedHand = '';
  for (const p of game.players) {
    for (let j = 0; j < 3; j++) { const c = drawCard(); if (c !== null) p.hand.push(c); }
  }
}

function startSoloGame() {
  initPlayers(['玩家'], [false]);
  dealCards();
  State.set('phase', 'playing'); State.set('stats', { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 });
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('gameTags', []);
  updateDeckCount(); startTimer();
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  addLog('🧑‍💻 单人练习开始！试试用算式算出' + game.target + '吧', 'info');
  addLog('💡 点击提示按钮获取帮助（共' + game.stats.maxHints + '次）', 'info');
  renderAll(); updateFooterBar(); updateSolutionHint();
}

function startLocalGame() {
  const count = parseInt(document.getElementById('player-count').value) || 2;
  if (count < 2 || count > 6) { alert('玩家人数请设为2~6人'); return; }
  const names = [];
  for (let i = 0; i < count; i++) {
    const inp = document.getElementById('pname-' + i);
    names.push((inp && inp.value.trim()) ? inp.value.trim() : ('玩家' + (i + 1)));
  }
  initPlayers(names, Array(count).fill(false));
  dealCards();
  State.set('phase', 'playing'); State.set('stats', { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 });
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('gameTags', []);
  updateDeckCount(); startTimer();
  document.getElementById('local-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  addLog('👥 本地多人开始！每人3张牌，谁先用算式算出' + game.target + '谁获胜！', 'info');
  renderAll(); updateFooterBar();
}

function startAiGame() {
  const nameInput = document.getElementById('ai-player-name');
  const playerName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : '玩家';
  const aiLevelNames = { easy: '新手赌徒', medium: '老练玩家', hard: '数学教授' };
  const aiName = '🤖 ' + aiLevelNames[game.aiLevel];
  State.set('aiPlayerIndex', 1);
  initPlayers([playerName, aiName], [false, true]);
  dealCards();
  State.set('phase', 'playing'); State.set('stats', { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 });
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('gameTags', []);
  updateDeckCount(); startTimer();
  document.getElementById('ai-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  addLog('🤖 AI对战开始！对手：' + aiName, 'info');
  addLog('你和AI同时开始思考，先算出21者获胜！', 'info');
  renderAll();
  scheduleAiThink();
  updateFooterBar();
}

function showResult(winnerIdx) {
  const ov = document.getElementById('result-overlay');
  const icon = document.getElementById('result-icon');
  const title = document.getElementById('result-title');
  const detail = document.getElementById('result-detail');
  const scoreEl = document.getElementById('result-score');
  const tagsEl = document.getElementById('result-tags');
  ov.classList.remove('hidden');

  if (scoreEl) scoreEl.innerHTML = '';
  if (tagsEl) tagsEl.innerHTML = '';

  if (winnerIdx >= 0) {
    const p = game.players[winnerIdx];
    icon.textContent = '🏆'; title.textContent = p.name + ' 获胜！';
    var detailText = '用时 ' + formatTime(game.timerSec) + '，手牌 ' + p.hand.length + ' 张';

    if (game.currentScore > 0) {
      detailText += ' | ⭐' + game.currentScore + '分';
      // 分数明细
      if (scoreEl && game.scoreBreakdown.length > 0) {
        var bdHtml = '';
        for (var bi = 0; bi < game.scoreBreakdown.length; bi++) {
          bdHtml += '<span class="score-item">' + game.scoreBreakdown[bi].label + ' +' + game.scoreBreakdown[bi].score + '</span>';
        }
        scoreEl.innerHTML = bdHtml;
      }
      // 标签
      if (tagsEl && game.gameTags.length > 0) {
        var tagHtml = '';
        for (var ti = 0; ti < game.gameTags.length; ti++) {
          tagHtml += '<span class="tag-pill">' + game.gameTags[ti] + '</span>';
        }
        tagsEl.innerHTML = tagHtml;
      }
    }
    detail.textContent = detailText;
  } else {
    icon.textContent = '🤝'; title.textContent = '本局无胜者';
    detail.textContent = '经过 ' + formatTime(game.timerSec) + ' 的比拼，无人算出' + game.target;
  }
}

function resetGame() {
  stopTimer(); stopAiThinking();
  State.set('phase', 'menu'); State.set('players', []); State.set('deck', []); State.set('timerSec', 0); State.set('_maxHintShown', false);
  State.set('aiSolved', false); State.set('aiSolution', null); State.set('_firstRender', false); State.set('_solving', false); _lastCheckedHand = '';
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('gameTags', []);
  updateTimerUI(); updateDeckCount();
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('players-area').innerHTML = '';
  document.getElementById('log-panel').innerHTML = '';
  document.getElementById('footer-bar').innerHTML = '<span class="icon">♠</span> 准备开始游戏...';
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  if (game.mode === 'local') {
    document.getElementById('local-setup-overlay').classList.remove('hidden');
    updateNameInputs();
  } else if (game.mode === 'ai') {
    document.getElementById('ai-setup-overlay').classList.remove('hidden');
  } else if (game.mode === 'solo') {
    startSoloGame();
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + '分' + String(s).padStart(2, '0') + '秒';
}
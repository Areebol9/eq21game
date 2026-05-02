"use strict";
// ==================== 计时器 ====================
function startTimer() {
  State.set('timerSec', 0); updateTimerUI(); stopTimer();
  State.set('timerInterval', setInterval(() => { game.timerSec++; updateTimerUI(); updateFooterBar(); updateSolutionHint(); updateTabletopCenter(); }, 1000));
}
function stopTimer() {
  if (game.timerInterval) { clearInterval(game.timerInterval); State.set('timerInterval', null); }
}

// ==================== Solo solution worker ====================
function getSolutionHandKey(hand) {
  return [game.difficulty, game.target, hand.slice().sort((a, b) => a - b).join(',')].join('|');
}

function resetSolutionCache() {
  State.set('solutionCache', { handKey: '', simple: [], cool: [], pending: false, timedOut: false });
  State.set('coolHintUsed', false);
}

function getCurrentSolutionCache() {
  const p = game.players[0];
  if (!p) return null;
  const handKey = getSolutionHandKey(p.hand);
  return game.solutionCache && game.solutionCache.handKey === handKey ? game.solutionCache : null;
}

function isPerfDebugEnabled() {
  try {
    return typeof window !== 'undefined' && window.location && /(?:^|[?&])debug=perf(?:&|$)/.test(window.location.search || '');
  } catch (e) {
    return false;
  }
}

function getPerfStore() {
  if (!isPerfDebugEnabled() || typeof window === 'undefined') return null;
  if (!window.__eq21Perf) window.__eq21Perf = { events: [], slowHands: [] };
  return window.__eq21Perf;
}

function recordPerfEvent(event) {
  const store = getPerfStore();
  if (!store) return;
  const item = Object.assign({ at: Date.now() }, event || {});
  store.events.push(item);
  if (item.type === 'solve' && item.handKey) {
    store.slowHands.push({ handKey: item.handKey, source: item.source || 'unknown', elapsedMs: item.elapsedMs || 0 });
  }
}

function ensureSolutionWorker() {
  if (game.solutionWorker) return game.solutionWorker;
  if (typeof Worker === 'undefined') return null;
  try {
    const worker = new Worker('js/solver-worker.js');
    worker.onmessage = function(e) {
      const data = e.data || {};
      const cache = game.solutionCache;
      if (!cache || data.id !== game.solutionTaskId || data.handKey !== cache.handKey) {
        recordPerfEvent({ type: 'worker-stale', handKey: data.handKey || '', source: 'worker' });
        return;
      }
      cache.simple = data.simpleSolutions || [];
      cache.cool = data.coolSolutions || [];
      cache.pending = false;
      cache.timedOut = !!data.timedOut;
      _lastCheckedHand = '';
      recordPerfEvent({ type: 'solve', handKey: data.handKey, source: 'worker', timedOut: cache.timedOut });
      updateSolutionHint();
      renderAll();
    };
    worker.onerror = function() {
      const cache = game.solutionCache;
      if (cache) { cache.pending = false; cache.timedOut = true; }
    };
    State.set('solutionWorker', worker);
    return worker;
  } catch (e) {
    return null;
  }
}

function requestSolutionAnalysis() {
  if (game.mode !== 'solo' || game.phase !== 'playing') return;
  const p = game.players[0];
  if (!p || p.conceded) return;
  const handKey = getSolutionHandKey(p.hand);
  if (game.solutionCache && game.solutionCache.handKey === handKey && game.solutionCache.pending) return;
  if (game.solutionCache && game.solutionCache.handKey === handKey && (game.solutionCache.simple.length || game.solutionCache.cool.length || game.solutionCache.timedOut)) return;

  State.set('solutionTaskId', game.solutionTaskId + 1);
  const taskHand = [...p.hand];
  State.set('solutionCache', { handKey, simple: [], cool: [], pending: true, timedOut: false, hand: taskHand });
  const worker = ensureSolutionWorker();
  if (worker) {
    worker.postMessage({
      id: game.solutionTaskId,
      handKey,
      hand: taskHand,
      target: game.target,
      difficulty: game.difficulty,
      mode: game.mode,
      maxMs: 1600
    });
    return;
  }

  const detailed = solveHandDetailed(taskHand, game.target, getBinaryOps(), { maxMs: SOLVE_BUDGETS.manualHintMs });
  recordPerfEvent({ type: 'solve', handKey, source: 'fallback', timedOut: detailed.timedOut });
  State.set('solutionCache', {
    handKey,
    simple: detailed.simpleSolutions,
    cool: detailed.coolSolutions,
    pending: false,
    timedOut: detailed.timedOut,
    hand: taskHand
  });
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

function describeCoolSolution(solution, handLength) {
  const expr = solution && solution.expr ? solution.expr : String(solution || '');
  const parts = [];
  if (expr.indexOf('^') !== -1) parts.push('用了幂运算做跳板');
  if (expr.indexOf('\u221A') !== -1 || expr.toLowerCase().indexOf('sqrt') !== -1) parts.push('先开方拆出好用的数');
  if (expr.indexOf('!') !== -1) parts.push('用阶乘把小牌放大');
  if (handLength >= 5) parts.push('五张牌都串进去了');
  if (/7\s*\*\s*3|3\s*\*\s*7/.test(expr)) parts.push('最后收成 7×3');
  return parts.length ? parts.join('，') : '结构很干净';
}

function showHint() {
  if (game.mode !== 'solo' || game.phase !== 'playing') return;
  if (game.stats.hintsUsed >= game.stats.maxHints) return;
  recordPerfEvent({ type: 'hint-click' });
  const p = game.players[0];
  requestSolutionAnalysis();
  const cache = getCurrentSolutionCache();
  if (!cache || cache.pending) {
    clearSolutionHint();
    showToast('我还在端详这手牌，提示次数先替你留着', 'submit');
    renderAll();
    return;
  }
  const solutionInfos = cache.simple.length ? cache.simple : cache.cool;
  const solutions = solutionInfos.map(s => s.expr);
  if (cache.timedOut && solutions.length === 0) {
    clearSolutionHint();
    showToast('这手牌藏得有点深，我先不消耗提示次数', 'submit');
    addLog('提示：后台还在找更稳的思路，未消耗提示次数', 'hint');
    renderAll();
    return;
  }
  game.stats.hintsUsed++;
  const level = game.stats.hintsUsed;

  if (solutions.length === 0) {
    const msgs = [
      '🤔 这手牌现在还没露出通向21的路，加一张试试',
      '🧐 还差一点火候，再补一张也许就亮了',
      '😅 这组牌挺倔，换一组会更轻松'
    ];
    showToast('提示 #' + level + '：' + msgs[Math.min(level - 1, msgs.length - 1)], 'error');
    addLog('提示 #' + level + '：当前手牌暂未找到解', 'hint');
  } else if (level === 1) {
    const sol = solutions[0];
    const hasMul = sol.includes('*'), hasDiv = sol.includes('/'), hasAdd = sol.includes('+'), hasSub = sol.includes('-');
    const parts = [];
    if (hasMul) parts.push('乘法');
    if (hasDiv) parts.push('除法');
    if (hasAdd) parts.push('加法');
    if (hasSub) parts.push('减法');
    if (!parts.length) parts.push('组合');
    const firstStep = extractFirstStep(sol);
    let hintMsg = '提示 #1：这手牌可以往 ' + parts.join(' 和 ') + ' 方向试';
    if (firstStep) hintMsg += '，先盯住「' + firstStep + '」';
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
          showToast('提示 #2：先算出「' + firstStep + ' = ' + formatNum(subVal) + '」，再处理剩余牌', 'submit');
          addLog('提示 #2：中间值提示  → ' + firstStep + ' = ' + formatNum(subVal), 'hint');
        } catch (e) {
          showToast('提示 #2：尝试从「' + firstStep + '」开始', 'submit');
          addLog('提示 #2：模糊步骤提示', 'hint');
        }
      } else {
        showToast('提示 #2：试试先把几张牌合成一个关键中间值', 'submit');
        addLog('提示 #2：模糊步骤提示', 'hint');
      }
    } else {
      showToast('提示 #2：试着先合并其中两张牌', 'submit');
      addLog('提示 #2：模糊步骤提示', 'hint');
    }
  } else {
    showToast('答案：' + solutions[0] + ' = 21', 'win');
    addLog('提示 #3（答案）：' + solutions[0] + ' = 21', 'hint');
  }
  renderAll();
}

function showCoolHint() {
  const p = game.players[0];
  if (game.mode !== 'solo' || game.phase !== 'playing') return;
  if (game.difficulty === 'easy') return;
  recordPerfEvent({ type: 'cool-hint-click' });
  requestSolutionAnalysis();
  const cache = getCurrentSolutionCache();
  if (!cache || cache.pending) {
    showToast('我在翻找这手牌的妙处，稍等一拍', 'submit');
    return;
  }
  if (!cache.cool.length) {
    showToast('这手牌更适合朴素解法', 'submit');
    return;
  }
  const solution = cache.cool[0];
  const why = describeCoolSolution(solution, p ? p.hand.length : 0);
  State.set('coolHintUsed', true);
  showToast('妙解思路：' + why + '。' + solution.expr + ' = 21', 'win');
  addLog('妙解提示：' + why + ' → ' + solution.expr + ' = 21', 'hint');
  if (p) {
    p.feedback = '妙解：' + why + '｜' + solution.expr;
    p.feedbackType = 'info';
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
      fbMsg = '还有 ' + handValidation.missing + ' 张牌没用！手牌必须全部用完哦~';
    } else if (handValidation.reason === 'extraCards') {
      fbMsg = '多了 ' + handValidation.extra + ' 张牌！请不要使用不属于你的牌~';
    } else if (handValidation.reason === 'noMatch') {
      fbMsg = '你没有用到任何手牌！请用手牌中的数字（' + p.hand.map(cardFace).join(' ') + '）组成算式~';
    } else if (handValidation.reason === 'invalidNumbers') {
      fbMsg = '🚫 你用了不存在的牌值 ' + handValidation.invalidVals.join(', ') + '！牌面数字只能是 1~13（A=1, J=11, Q=12, K=13）';
    } else {
      fbMsg = '手牌不匹配！请检查是否用了不属于你的牌~';
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
    State.set('solutionRating', scoreResult.solutionRating || null);
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
        scoreBreakdown: scoreResult.breakdown,
        solutionRating: scoreResult.solutionRating || null,
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
    } else if (game.mode === 'ai') {
      const human = game.players.find(player => !player.isAi);
      if (human) {
        addRecord({
          id: generateId(), ts: Date.now(),
          mode: game.mode, difficulty: game.difficulty,
          result: 'lose',
          player: human.name, hand: [...human.hand],
          formula: '', score: 50,
          timeSec: game.timerSec,
          submits: game.stats.submits, hintsUsed: game.stats.hintsUsed || 0,
          tags: []
        });
      }
    }

    p.feedback = '=' + game.target + ' 获胜！+' + game.currentScore + '分';

    p.feedbackType = 'ok';
    p.winningFormula = expr;
    setFeedback(idx, p.feedback, 'ok');
    var winMsg = p.name + ' 提交算式 "' + expr + '" = ' + game.target + ' 获胜！！！+' + game.currentScore + '分';
    addLog(winMsg, 'win');
    var toastWin = p.name + ' 获胜！答案 = ' + game.target + ' +' + game.currentScore + '分';
    if (game.solutionRating && game.solutionRating.score >= 160) {
      var tags = game.solutionRating.tags || [];
      var levelTag = '';
      for (var t = 0; t < tags.length; t++) {
        if (tags[t].indexOf('妙手天成') >= 0) levelTag = tags[t];
        else if (!levelTag && tags[t].indexOf('炫技解法') >= 0) levelTag = tags[t];
        else if (!levelTag && tags[t].indexOf('奇思妙算') >= 0) levelTag = tags[t];
      }
      if (levelTag) toastWin = levelTag.substring(0, 2) + ' ' + p.name + ' ' + levelTag + '！+' + game.currentScore + '分';
    }
    showToast(toastWin, 'win');
    document.getElementById('hint-area').classList.add('hidden');
    soundPlay('win'); triggerVictoryEffect();
    showResult(idx); renderAll();
    if (game.mode === 'local') updateTcEvent(p.name + ' 获胜！');
  } else {
    const diff = result - game.target;
    const absDiff = Math.abs(diff);
    let fbMsg, toastMsg;
    if (absDiff <= 2) {
      fbMsg = '差一点！= ' + formatNum(result) + '，就差 ' + formatNum(absDiff) + '！';
      toastMsg = p.name + ' 提交 = ' + formatNum(result) + '（只差 ' + formatNum(absDiff) + '！）';
    } else if (absDiff <= 10) {
      fbMsg = '偏差 ' + formatNum(absDiff) + '，考虑用乘除调整试试';
      toastMsg = p.name + ' 提交 = ' + formatNum(result) + '（偏差 ' + formatNum(absDiff) + '）';
    } else {
      fbMsg = '偏了 ' + formatNum(absDiff) + '，离21有点远…';
      toastMsg = p.name + ' 提交 = ' + formatNum(result) + '（差太远了）';
    }
    setFeedback(idx, fbMsg, 'err');
    addLog(p.name + ' 提交算式 "' + expr + '" = ' + formatNum(result) + ' ≠ ' + game.target + ' ❌', 'err');
    showToast(toastMsg, 'error');
    shakeCard(idx); soundPlay('submit');
    if (game.mode === 'local') updateTcEvent(p.name + ' 提交 = ' + formatNum(result));
  }
}

function drawForPlayer(idx) {
  if (game.phase !== 'playing') return;
  const p = game.players[idx]; if (p.conceded) return;
  if (p.hand.length >= game.maxCards) { setFeedback(idx, '已达' + game.maxCards + '张上限', 'err'); return; }
  if (!game.deck.length) { setFeedback(idx, '牌库已空', 'err'); return; }
  const card = drawCard(); if (card === null) return;
  p.hand.push(card); p.feedback = '加牌: +' + cardFace(card); p.feedbackType = 'ok';
  addLog(p.name + ' 加了一张牌 → ' + cardFace(card) + ' (手牌' + p.hand.length + '张)', 'info');
  showToast(p.name + ' +牌 → ' + cardFace(card), 'draw');
  if (game.mode === 'solo') { game.stats.draws++; _lastCheckedHand = ''; resetSolutionCache(); }
  p._newCardIdx = p.hand.length - 1;
  updateDeckCount(); renderAll(); updateFooterBar();
  if (game.mode === 'local') updateTcEvent(p.name + ' +牌 → ' + cardFace(card));
  if (game.mode === 'solo') updateSolutionHint();
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

  addLog(p.name + ' 认输了', 'info');
  showToast(p.name + ' 认输', 'concede');
  if (game.mode === 'local') updateTcEvent(p.name + ' 认输');
  renderAll(); updateFooterBar();
  checkGameEnd();
}

function checkGameEnd() {
  if (game.phase !== 'playing') return;
  const active = game.players.filter(p => !p.conceded);
  if (active.length === 0) {
    State.set('phase', 'ended'); stopTimer(); stopAiThinking();
    addLog('所有玩家都认输了，本局无胜者', 'info');
    showResult(-1); renderAll(); return;
  }
  if (game.mode === 'ai' && active.length === 1 && active[0].isAi) {
    State.set('phase', 'ended'); stopTimer(); stopAiThinking();
    const ai = game.players[game.aiPlayerIndex];
    ai.feedback = '对手认输，AI获胜！'; ai.feedbackType = 'ok';

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

    addLog('AI获胜！所有人类玩家已认输', 'win');
    showToast('AI获胜！', 'win');
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

    const solutions = aiSolve([...ai.hand], game.target, getBinaryOps(), { maxMs: SOLVE_BUDGETS.aiThinkMs });
    const hasSolution = solutions.length > 0;
    if (solutions.timedOut && !hasSolution) {
      addLog('AI求解超过' + SOLVE_BUDGETS.aiThinkMs + 'ms，暂时按想不出处理', 'info');
    }
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
        if (st && game.aiThinking) st.textContent = '思考中... ' + Math.max(0, game.aiCountdown) + 's';
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
        addLog(ai.name + ' 提交了答案！', 'info');
        showToast(ai.name + ' 提交了答案！', 'submit');
        renderAll();
        setTimeout(() => {
          const input = document.querySelector('.player-card[data-index="' + aiIdx + '"] .formula-input');
          if (input) input.value = sol;
          submitFormula(aiIdx);
        }, 400);
      } else {
        if (ai.hand.length >= game.maxCards || !game.deck.length) {
          ai.conceded = true; ai.feedback = 'AI认输'; ai.feedbackType = '';
          addLog(ai.name + ' 表示放弃', 'info');
          showToast(ai.name + ' 认输', 'concede');
          checkGameEnd();
        } else {
          const card = drawCard();
          if (card !== null) {
            ai.hand.push(card);
            addLog(ai.name + ' 想不出，加了一张牌 → ' + cardFace(card) + ' (手牌' + ai.hand.length + '张)', 'info');
            showToast(ai.name + ' +牌 → ' + cardFace(card), 'draw');
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
  if (typeof clearAiCache === 'function') clearAiCache();
  resetSolutionCache();
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

function showComingSoon() {
  if (typeof openOnlineSetup === 'function') openOnlineSetup();
  else alert('联网对战模式即将推出，敬请期待！');
}

function showRules() { document.getElementById('rules-overlay').classList.remove('hidden'); }
function hideRules() { document.getElementById('rules-overlay').classList.add('hidden'); }

function goToMenu() {
  if (game.mode === 'online' && typeof disconnectOnline === 'function') disconnectOnline(game.phase === 'ended');
  stopTimer(); stopAiThinking();
  resetSolutionCache();
  State.set('phase', 'menu'); State.set('players', []); State.set('deck', []); State.set('timerSec', 0); State.set('aiSolved', false); State.set('aiSolution', null);
  State.set('_firstRender', false); State.set('_solving', false); _lastCheckedHand = '';
  State.set('tabletopLayout', 'standard');
  if (typeof clearSolutionHint === 'function') clearSolutionHint();
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('solutionRating', null); State.set('gameTags', []);
  updateTimerUI(); updateDeckCount();
  const tc = document.getElementById('tabletop-center');
  document.getElementById('players-area').innerHTML = '';
  document.getElementById('players-area').classList.remove('tabletop-2p', 'tabletop-3p', 'tabletop-4p');
  if (tc) { document.getElementById('main-container').appendChild(tc); tc.classList.add('hidden'); }
  document.getElementById('log-panel').innerHTML = '';
  document.getElementById('footer-bar').innerHTML = (typeof footerIcon === 'function' ? footerIcon('card') : '<span class="icon">♠</span>') + '准备开始游戏...';
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('ai-setup-overlay').classList.add('hidden');
  document.getElementById('table-setup-overlay').classList.add('hidden');
  const onlineOverlay = document.getElementById('online-setup-overlay');
  if (onlineOverlay) onlineOverlay.classList.add('hidden');
  var chatBar = document.getElementById('online-chat-bar');
  if (chatBar) chatBar.classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('rules-overlay').classList.add('hidden');
  updateModeBadge('');
}

function startMode(mode) {
  document.getElementById('menu-overlay').classList.add('hidden');
  if (mode === 'solo') {
    State.set('mode', 'solo'); updateModeBadge(t('mode_solo')); startSoloGame();
  } else if (mode === 'local') {
    State.set('mode', 'local'); updateModeBadge(t('mode_local'));
    document.getElementById('table-setup-overlay').classList.remove('hidden');
    resetTableSetupDefaults();
  } else if (mode === 'ai') {
    State.set('mode', 'ai'); updateModeBadge(t('mode_ai'));
    document.getElementById('ai-setup-overlay').classList.remove('hidden');
  } else if (mode === 'online') {
    State.set('mode', 'online'); updateModeBadge(t('mode_online'));
    if (typeof openOnlineSetup === 'function') openOnlineSetup();
  }
}

function updateModeBadge(text) {
  const b = document.getElementById('mode-badge');
  if (text) { b.textContent = text; b.style.display = ''; }
  else b.style.display = 'none';
}

function resetTableSetupDefaults() {
  const options = document.querySelectorAll('.table-opt');
  options.forEach(c => c.classList.remove('selected'));
  const defaultOption = document.querySelector('.table-opt[data-players="2"]') || options[0];
  if (defaultOption) defaultOption.classList.add('selected');
  updateTableNameInputs();
}

function updateTableNameInputs() {
  const selected = document.querySelector('.table-opt.selected');
  const count = selected ? parseInt(selected.dataset.players) : 2;
  const container = document.getElementById('table-name-inputs');
  if (!container) return;
  container.innerHTML = '';

  const seatLabels = {
    2: [t('seat_host'), t('seat_opposite')],
    3: [t('seat_host'), t('seat_left'), t('seat_right')],
    4: [t('seat_host'), t('seat_left'), t('seat_opposite'), t('seat_right')]
  };
  const labels = seatLabels[count] || [];

  for (let i = 0; i < count; i++) {
    const r = document.createElement('div');
    r.className = 'row';
    const label = labels[i] || t('default_player', {N: i + 1});
    r.innerHTML = '<label>' + t('default_player', {N: i + 1}) + '（' + label + '）</label>' +
      '<input type="text" id="pname-' + i + '" value="' + t('default_player', {N: i + 1}) + '" maxlength="6">';
    container.appendChild(r);
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

function resetRoundMeta(maxHints) {
  State.set('stats', { submits: 0, hintsUsed: 0, maxHints: maxHints, draws: 0 });
  State.set('currentScore', 0);
  State.set('scoreBreakdown', []);
  State.set('solutionRating', null);
  State.set('gameTags', []);
}

function localRematchNeededCards() {
  return game.mode === 'local' ? game.players.length * 3 : 0;
}

function canStartLocalRematch() {
  return game.mode === 'local' && game.players.length >= 2 && game.deck.length >= localRematchNeededCards();
}

function updateResultAgainButton() {
  const btn = document.getElementById('btn-again');
  const status = document.getElementById('result-rematch-status');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = t('btn_again');
  if (status) {
    status.textContent = '';
    status.className = '';
  }

  if (game.mode === 'local') {
    const needed = localRematchNeededCards();
    if (!canStartLocalRematch()) {
      btn.disabled = true;
      if (status) {
        status.textContent = t('result_card_shortage', {need: needed, remain: game.deck.length});
        status.className = 'result-rematch-status warn';
      }
    } else if (status) {
      status.textContent = '将从当前剩余牌库发牌，上一局手牌不回库。';
      status.className = 'result-rematch-status';
    }
  } else if (game.mode === 'online' && typeof updateOnlineRematchResultUi === 'function') {
    updateOnlineRematchResultUi();
  }
}

function startLocalRematch() {
  if (game.mode !== 'local') { resetGame(); return; }
  if (game.phase !== 'ended') return;
  if (!canStartLocalRematch()) {
    updateResultAgainButton();
    showToast('牌库不足，请返回菜单重新开局', 'error');
    return;
  }
  stopTimer(); stopAiThinking();
  resetSolutionCache();
  if (typeof clearSolutionHint === 'function') clearSolutionHint();
  State.set('phase', 'playing');
  resetRoundMeta(0);
  State.set('_firstRender', true);
  State.set('_maxHintShown', false);
  _lastCheckedHand = '';
  game.players.forEach(player => {
    player.hand = [];
    player.conceded = false;
    player.feedback = '';
    player.feedbackType = '';
    player.inputDraft = '';
    player._newCardIdx = undefined;
    player._remoteExprPulse = false;
    for (let j = 0; j < 3; j++) {
      const card = drawCard();
      if (card !== null) player.hand.push(card);
    }
  });
  updateDeckCount();
  startTimer();
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('table-setup-overlay').classList.add('hidden');
  addLog('再来一局：从当前剩余牌库重新发牌。', 'info');
  renderAll();
  updateFooterBar();
}

function handleAgainGame() {
  if (game.mode === 'local') {
    startLocalRematch();
  } else if (game.mode === 'online' && typeof onlineToggleRematchVote === 'function') {
    onlineToggleRematchVote();
  } else {
    resetGame();
  }
}

function startSoloGame() {
  if (typeof clearSolutionHint === 'function') clearSolutionHint();
  resetSolutionCache();
  initPlayers(['玩家'], [false]);
  dealCards();
  State.set('phase', 'playing'); State.set('stats', { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 });
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('solutionRating', null); State.set('gameTags', []);
  updateDeckCount(); startTimer();
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  addLog('单人练习开始！试试用算式算出' + game.target + '吧', 'info');
  addLog('点击提示按钮获取帮助（共' + game.stats.maxHints + '次）', 'info');
  renderAll(); updateFooterBar(); updateSolutionHint();
}

function startLocalGame() {
  const selected = document.querySelector('.table-opt.selected');
  const count = selected ? parseInt(selected.dataset.players) : 2;
  const names = [];
  for (let i = 0; i < count; i++) {
    const inp = document.getElementById('pname-' + i);
    names.push((inp && inp.value.trim()) ? inp.value.trim() : t('default_player', {N: i + 1}));
  }
  initPlayers(names, Array(count).fill(false));
  dealCards();
  State.set('phase', 'playing'); State.set('stats', { submits: 0, hintsUsed: 0, maxHints: 0, draws: 0 });
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('solutionRating', null); State.set('gameTags', []);
  updateDeckCount(); startTimer();
  document.getElementById('table-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  const playerLabels = { 2: '双人对坐', 3: '三人围桌', 4: '四方会战' };
  addLog('围桌对战开始！' + (playerLabels[count] || '') + '，谁先用算式算出' + game.target + '谁获胜！', 'info');
  renderAll(); updateFooterBar();
}

function startAiGame() {
  const nameInput = document.getElementById('ai-player-name');
  const playerName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : '玩家';
  const aiLevelNames = { easy: '新手赌徒', medium: '老练玩家', hard: '数学教授' };
  const aiName = 'AI · ' + aiLevelNames[game.aiLevel];
  State.set('aiPlayerIndex', 1);
  initPlayers([playerName, aiName], [false, true]);
  dealCards();
  State.set('phase', 'playing'); State.set('stats', { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 });
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('solutionRating', null); State.set('gameTags', []);
  updateDeckCount(); startTimer();
  document.getElementById('ai-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  addLog('AI对战开始！对手：' + aiName, 'info');
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
  const ratingEl = document.getElementById('result-rating');
  const tagsEl = document.getElementById('result-tags');
  ov.classList.remove('hidden');

  if (scoreEl) scoreEl.innerHTML = '';
  if (ratingEl) ratingEl.classList.add('hidden');
  if (tagsEl) tagsEl.innerHTML = '';

  if (winnerIdx >= 0) {
    const p = game.players[winnerIdx];
    if (typeof setSvgIcon === 'function') setSvgIcon(icon, 'trophy');
    else icon.textContent = '胜';
    title.textContent = t('result_win', {name: p.name});
    var detailText = t('result_detail', {time: formatTime(game.timerSec), N: p.hand.length});

    if (game.currentScore > 0) {
      detailText += ' | ' + t('result_score', {N: game.currentScore});
      // 分数明细
      if (scoreEl && game.scoreBreakdown.length > 0) {
        var bdHtml = '';
        for (var bi = 0; bi < game.scoreBreakdown.length; bi++) {
          bdHtml += '<span class="score-item">' + game.scoreBreakdown[bi].label + ' +' + game.scoreBreakdown[bi].score + '</span>';
        }
        scoreEl.innerHTML = bdHtml;
      }
      // 妙解评级
      if (ratingEl && game.solutionRating && game.solutionRating.score >= 160) {
        const sr = game.solutionRating;
        const levelTag = (sr.tags || []).find(function(t) {
          return t.indexOf('妙手天成') >= 0 || t.indexOf('炫技解法') >= 0 || t.indexOf('奇思妙算') >= 0;
        }) || '';
        var ratingIcon = 'star';
        if (levelTag.indexOf('妙手天成') >= 0) ratingIcon = 'trophy';
        else if (levelTag.indexOf('炫技解法') >= 0) ratingIcon = 'sparkle';
        else if (levelTag.indexOf('奇思妙算') >= 0) ratingIcon = 'aiHard';
        ratingEl.innerHTML = '<span class="rating-badge">' + (typeof svgIcon === 'function' ? svgIcon(ratingIcon) : '') + '</span>' +
          '<span class="rating-score">' + levelTag + ' · 评分 ' + sr.score + '</span>';
        ratingEl.classList.remove('hidden');
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
    const formulaEl = document.getElementById('result-formula');
    if (formulaEl) {
      if (winnerIdx >= 0 && p.winningFormula) {
        formulaEl.textContent = p.winningFormula + ' = ' + game.target;
        formulaEl.classList.remove('hidden');
      } else {
        formulaEl.classList.add('hidden');
      }
    }
  } else {
    if (typeof setSvgIcon === 'function') setSvgIcon(icon, 'handshake');
    else icon.textContent = '平';
    title.textContent = t('result_draw');
    detail.textContent = t('result_draw_detail', {time: formatTime(game.timerSec), target: game.target});
    var drawFormula = document.getElementById('result-formula');
    if (drawFormula) drawFormula.classList.add('hidden');
  }
  updateResultAgainButton();
}

function resetGame() {
  stopTimer(); stopAiThinking();
  resetSolutionCache();
  State.set('phase', 'menu'); State.set('players', []); State.set('deck', []); State.set('timerSec', 0); State.set('_maxHintShown', false);
  State.set('aiSolved', false); State.set('aiSolution', null); State.set('_firstRender', false); State.set('_solving', false); _lastCheckedHand = '';
  State.set('tabletopLayout', 'standard');
  if (typeof clearSolutionHint === 'function') clearSolutionHint();
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('solutionRating', null); State.set('gameTags', []);
  updateTimerUI(); updateDeckCount();
  document.getElementById('result-overlay').classList.add('hidden');
  const tc2 = document.getElementById('tabletop-center');
  document.getElementById('players-area').innerHTML = '';
  document.getElementById('players-area').classList.remove('tabletop-2p', 'tabletop-3p', 'tabletop-4p');
  if (tc2) { document.getElementById('main-container').appendChild(tc2); tc2.classList.add('hidden'); }
  document.getElementById('log-panel').innerHTML = '';
  document.getElementById('footer-bar').innerHTML = (typeof footerIcon === 'function' ? footerIcon('card') : '<span class="icon">♠</span>') + '准备开始游戏...';
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  if (game.mode === 'local') {
    resetTableSetupDefaults();
    document.getElementById('table-setup-overlay').classList.remove('hidden');
  } else if (game.mode === 'ai') {
    document.getElementById('ai-setup-overlay').classList.remove('hidden');
  } else if (game.mode === 'online') {
    if (typeof resetOnlineAfterEnded === 'function') resetOnlineAfterEnded();
    if (typeof openOnlineSetup === 'function') openOnlineSetup();
  } else if (game.mode === 'solo') {
    startSoloGame();
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return t('time_min', {N: String(m).padStart(2, '0')}) + t('time_sec', {N: String(s).padStart(2, '0')});
}

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
  State.set('solutionCache', { handKey: '', simple: [], cool: [], pending: false, timedOut: false, completed: false });
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
      cache.completed = true;
      _lastCheckedHand = '';
      recordPerfEvent({ type: 'solve', handKey: data.handKey, source: 'worker', timedOut: cache.timedOut });
      updateSolutionHint();
    };
    worker.onerror = function() {
      const cache = game.solutionCache;
      if (cache) { cache.pending = false; cache.timedOut = true; cache.completed = false; }
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
  const cache = game.solutionCache;
  if (cache && cache.handKey === handKey && (cache.pending || cache.completed || cache.simple.length || cache.cool.length || cache.timedOut)) return;

  State.set('solutionTaskId', game.solutionTaskId + 1);
  const taskHand = [...p.hand];
  State.set('solutionCache', { handKey, simple: [], cool: [], pending: true, timedOut: false, completed: false, hand: taskHand });
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
    completed: true,
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
  if (expr.indexOf('^') !== -1) parts.push(t('cool_desc_pow'));
  if (expr.indexOf('\u221A') !== -1 || expr.toLowerCase().indexOf('sqrt') !== -1) parts.push(t('cool_desc_sqrt'));
  if (expr.indexOf('!') !== -1) parts.push(t('cool_desc_fact'));
  if (handLength >= 5) parts.push(t('cool_desc_5cards'));
  if (/7\s*\*\s*3|3\s*\*\s*7/.test(expr)) parts.push(t('cool_desc_7x3'));
  return parts.length ? parts.join('\uff0c') : t('cool_desc_clean');
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
    showToast(t('hint_analyzing'), 'submit');
    renderAll();
    return;
  }
  const solutionInfos = cache.simple.length ? cache.simple : cache.cool;
  const solutions = solutionInfos.map(s => s.expr);
  if (cache.timedOut && solutions.length === 0) {
    clearSolutionHint();
    showToast(t('hint_deep'), 'submit');
    addLog(t('hint_log_retained'), 'hint');
    renderAll();
    return;
  }
  game.stats.hintsUsed++;
  const level = game.stats.hintsUsed;

  if (solutions.length === 0) {
    const msgs = [
      t('hint_no_solution_1'),
      t('hint_no_solution_2'),
      t('hint_no_solution_3')
    ];
    showToast('Hint #' + level + ': ' + msgs[Math.min(level - 1, msgs.length - 1)], 'error');
    addLog('Hint #' + level + ': no solution found', 'hint');
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
    let hintMsg = 'Hint #1: ' + t('hint_direction', {ops: parts.join(' \u548c ')});
    if (firstStep) hintMsg += t('hint_direction_first', {first: firstStep});
    showToast(hintMsg, 'submit');
    addLog('Hint #1: directional hint shown', 'hint');
  } else if (level === 2) {
    const sol = solutions[0];
    const firstStep = extractFirstStep(sol);
    if (firstStep) {
      const tokens = tokenize(firstStep);
      if (tokens.length === 3 && tokens[0].type === TOK_NUM && tokens[1].type === TOK_OP && tokens[2].type === TOK_NUM) {
        try {
          const subVal = evaluate(firstStep);
          showToast('Hint #2: ' + t('hint_step_calc', {expr: firstStep, val: formatNum(subVal)}), 'submit');
          addLog('Hint #2: intermediate value → ' + firstStep + ' = ' + formatNum(subVal), 'hint');
        } catch (e) {
          showToast('Hint #2: try starting from "' + firstStep + '"', 'submit');
          addLog('Hint #2: vague step hint', 'hint');
        }
      } else {
        showToast('Hint #2: ' + t('hint_step_try'), 'submit');
        addLog('Hint #2: vague step hint', 'hint');
      }
    } else {
      showToast('Hint #2: ' + t('hint_step_merge'), 'submit');
      addLog('Hint #2: vague step hint', 'hint');
    }
  } else {
    showToast(t('hint_answer', {ans: solutions[0]}), 'win');
    addLog('Hint #3 (answer): ' + solutions[0] + ' = 21', 'hint');
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
    showToast(t('hint_cool_searching'), 'submit');
    return;
  }
  if (!cache.cool.length) {
    showToast(t('hint_cool_simple'), 'submit');
    return;
  }
  const solution = cache.cool[0];
  const why = describeCoolSolution(solution, p ? p.hand.length : 0);
  State.set('coolHintUsed', true);
  showToast(t('hint_cool_prefix') + why + '。' + solution.expr + ' = 21', 'win');
  addLog(t('hint_cool_prefix') + why + ' \u2192 ' + solution.expr + ' = 21', 'hint');
  if (p) {
    p.feedback = t('hint_cool_detail') + why + '\uff5c' + solution.expr;
    p.feedbackType = 'info';
  }
  renderAll();
}

// ==================== 玩家操作 ====================
function submitFormula(idx) {
  if (game.phase !== 'playing') return;
  const p = game.players[idx]; if (p.conceded) return;
  const expr = normalizeInput(p.inputDraft || '').trim();
  if (!expr) { setFeedback(idx, t('submit_no_expr'), 'err'); shakeCard(idx); soundPlay('error'); return; }
  const handValidation = validateHand(expr, p.hand);
  if (!handValidation.valid) {
    let fbMsg;
    if (handValidation.reason === 'notAllUsed') {
      fbMsg = t('submit_not_all_used', {n: handValidation.missing});
    } else if (handValidation.reason === 'extraCards') {
      fbMsg = t('submit_extra_cards', {n: handValidation.extra});
    } else if (handValidation.reason === 'noMatch') {
      fbMsg = t('submit_no_match', {cards: p.hand.map(cardFace).join(' ')});
    } else if (handValidation.reason === 'invalidNumbers') {
      fbMsg = t('submit_invalid_nums', {vals: handValidation.invalidVals.join(', ')});
    } else {
      fbMsg = t('submit_mismatch');
    }
    setFeedback(idx, fbMsg, 'err');
    addLog(t('submit_hand_warn', {name: p.name}), 'err');
    shakeCard(idx); soundPlay('error'); return;
  }
  let result;
  try { result = evaluate(expr); }
  catch (e) { setFeedback(idx, t('submit_format_error', {msg: e.message}), 'err'); addLog(t('submit_invalid_log', {name: p.name}), 'err'); shakeCard(idx); soundPlay('error'); return; }
  if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
    setFeedback(idx, t('submit_result_invalid'), 'err'); addLog(t('submit_result_invalid_log', {name: p.name}), 'err'); shakeCard(idx); soundPlay('error'); return;
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

    p.feedback = t('submit_win_feedback', {target: game.target, score: game.currentScore});

    p.feedbackType = 'ok';
    p.winningFormula = expr;
    setFeedback(idx, p.feedback, 'ok');
    var winMsg = t('submit_win_log', {name: p.name, expr: expr, target: game.target, score: game.currentScore});
    addLog(winMsg, 'win');
    var toastWin = p.name + ' Wins! ' + game.target + ' = ' + expr + ' +' + game.currentScore + 'pts';
    if (game.solutionRating && game.solutionRating.score >= 160) {
      var tags = game.solutionRating.tags || [];
      var levelTag = '';
      for (var ti = 0; ti < tags.length; ti++) {
        if (tags[ti].indexOf('Perfect Genius') >= 0) levelTag = tags[ti];
        else if (!levelTag && tags[ti].indexOf('Flashy Solve') >= 0) levelTag = tags[ti];
        else if (!levelTag && tags[ti].indexOf('Clever Math') >= 0) levelTag = tags[ti];
      }
      if (levelTag) toastWin = levelTag.substring(0, 2) + ' ' + p.name + ' ' + levelTag + '！+' + game.currentScore + '分';
    }
    showToast(toastWin, 'win');
    document.getElementById('hint-area').classList.add('hidden');
    soundPlay('win'); triggerVictoryEffect();
    showResult(idx); renderAll();
    if (game.mode === 'local') updateTcEvent(t('tc_event_win', {name: p.name}));
  } else {
    const diff = result - game.target;
    const absDiff = Math.abs(diff);
    let fbMsg, toastMsg;
    if (absDiff <= 2) {
      fbMsg = t('submit_close', {res: formatNum(result), diff: formatNum(absDiff)});
      toastMsg = t('submit_close_toast', {name: p.name, res: formatNum(result), diff: formatNum(absDiff)});
    } else if (absDiff <= 10) {
      fbMsg = t('submit_medium', {diff: formatNum(absDiff)});
      toastMsg = t('submit_medium_toast', {name: p.name, res: formatNum(result), diff: formatNum(absDiff)});
    } else {
      fbMsg = t('submit_far', {diff: formatNum(absDiff)});
      toastMsg = t('submit_far_toast', {name: p.name, res: formatNum(result)});
    }
    setFeedback(idx, fbMsg, 'err');
    addLog(p.name + ' submitted "' + expr + '" = ' + formatNum(result) + ' \u2260 ' + game.target + ' \u274c', 'err');
    showToast(toastMsg, 'error');
    shakeCard(idx); soundPlay('submit');
    if (game.mode === 'local') updateTcEvent(t('tc_event_submit', {name: p.name, res: formatNum(result)}));
  }
}

function drawForPlayer(idx) {
  if (game.phase !== 'playing') return;
  const p = game.players[idx]; if (p.conceded) return;
  if (p.hand.length >= game.maxCards) { setFeedback(idx, t('draw_max_reached', {max: game.maxCards}), 'err'); return; }
  if (!game.deck.length) { setFeedback(idx, t('draw_empty_deck'), 'err'); return; }
  const card = drawCard(); if (card === null) return;
  p.hand.push(card); p.feedback = t('draw_feedback', {card: cardFace(card)}); p.feedbackType = 'ok';
  addLog(t('draw_log', {name: p.name, card: cardFace(card), count: p.hand.length}), 'info');
  showToast(t('draw_toast', {name: p.name, card: cardFace(card)}), 'draw');
  if (game.mode === 'solo') { game.stats.draws++; _lastCheckedHand = ''; resetSolutionCache(); }
  p._newCardIdx = p.hand.length - 1;
  updateDeckCount(); renderAll(); updateFooterBar();
  if (game.mode === 'local') updateTcEvent(t('tc_event_draw', {name: p.name, card: cardFace(card)}));
  if (game.mode === 'solo') updateSolutionHint();
  soundPlay('draw');
  if (game.mode === 'ai' && p.isAi) scheduleAiThink();
}

function concedePlayer(idx) {
  if (game.phase !== 'playing') return;
  const p = game.players[idx]; if (p.conceded) return;
  p.conceded = true; p.feedback = t('concede_feedback'); p.feedbackType = '';

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

  addLog(t('concede_log', {name: p.name}), 'info');
  showToast(t('concede_toast', {name: p.name}), 'concede');
  if (game.mode === 'local') updateTcEvent(t('tc_event_concede', {name: p.name}));
  renderAll(); updateFooterBar();
  checkGameEnd();
}

function checkGameEnd() {
  if (game.phase !== 'playing') return;
  const active = game.players.filter(p => !p.conceded);
  if (active.length === 0) {
    State.set('phase', 'ended'); stopTimer(); stopAiThinking();
    addLog(t('concede_all'), 'info');
    showResult(-1); renderAll(); return;
  }
  if (game.mode === 'ai' && active.length === 1 && active[0].isAi) {
    State.set('phase', 'ended'); stopTimer(); stopAiThinking();
    const ai = game.players[game.aiPlayerIndex];
    ai.feedback = t('concede_ai_win'); ai.feedbackType = 'ok';

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

    addLog(t('concede_ai_win_log'), 'win');
    showToast('AI Wins!', 'win');
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
      addLog('AI solve took longer than ' + SOLVE_BUDGETS.aiThinkMs + 'ms, treating as no solution', 'info');
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
        if (st && game.aiThinking) st.textContent = t('status_thinking', {N: Math.max(0, game.aiCountdown)});
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
        addLog(ai.name + ' submitted answer!', 'info');
        showToast(ai.name + ' submitted answer!', 'submit');
        renderAll();
        setTimeout(() => {
          const input = document.querySelector('.player-card[data-index="' + aiIdx + '"] .formula-input');
          if (input) input.value = sol;
          submitFormula(aiIdx);
        }, 400);
      } else {
        if (ai.hand.length >= game.maxCards || !game.deck.length) {
          ai.conceded = true; ai.feedback = 'AI gave up'; ai.feedbackType = '';
          addLog(ai.name + ' gave up', 'info');
          showToast(ai.name + ' gave up', 'concede');
          checkGameEnd();
        } else {
          const card = drawCard();
          if (card !== null) {
            ai.hand.push(card);
            addLog(ai.name + ' ' + t('draw_log', {name: ai.name, card: cardFace(card), count: ai.hand.length}), 'info');
            showToast(t('draw_toast', {name: ai.name, card: cardFace(card)}), 'draw');
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
  document.getElementById('diff-badge').textContent = t('diff_badge_' + diff);
  document.getElementById('diff-badge').className = 'diff-badge ' + (diff === 'easy' ? 'diff-easy' : diff === 'normal' ? 'diff-normal' : 'diff-hard');
}

function selectAiLevel(lvl, btn) {
  State.set('aiLevel', lvl);
  document.querySelectorAll('#ai-setup-overlay .choice-card').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function showComingSoon() {
  if (typeof openOnlineSetup === 'function') openOnlineSetup();
  else alert(t('coming_soon'));
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
  document.getElementById('footer-bar').innerHTML = (typeof footerIcon === 'function' ? footerIcon('card') : '<span class="icon">\u2660</span>') + t('footer_ready');
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
      status.textContent = t('rematch_will_deal_from');
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
    showToast(t('rematch_local_deck_short'), 'error');
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
  addLog(t('rematch_starting_from_deck'), 'info');
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
  initPlayers([t('player_default')], [false]);
  dealCards();
  State.set('phase', 'playing'); State.set('stats', { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 });
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('solutionRating', null); State.set('gameTags', []);
  updateDeckCount(); startTimer();
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('hint-area').classList.add('hidden');
  addLog(t('start_solo_log', {target: game.target}), 'info');
  addLog(t('start_solo_hint_log', {count: game.stats.maxHints}), 'info');
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
  addLog(t('start_local_log', {layout: t('start_local_' + count + 'p'), target: game.target}), 'info');
  renderAll(); updateFooterBar();
}

function startAiGame() {
  const nameInput = document.getElementById('ai-player-name');
  const playerName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : t('player_default');
  const aiLevelNames = { easy: t('ai_easy'), medium: t('ai_medium'), hard: t('ai_hard') };
  const aiName = 'AI ' + aiLevelNames[game.aiLevel];
  State.set('aiPlayerIndex', 1);
  initPlayers([playerName, aiName], [false, true]);
  dealCards();
  State.set('phase', 'playing'); State.set('stats', { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 });
  State.set('currentScore', 0); State.set('scoreBreakdown', []); State.set('solutionRating', null); State.set('gameTags', []);
  updateDeckCount(); startTimer();
  document.getElementById('ai-setup-overlay').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  addLog(t('start_ai_log', {name: aiName}), 'info');
  addLog(t('start_ai_intro'), 'info');
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
        const levelTag = (sr.tags || []).find(function(tag) {
          return tag.indexOf('Perfect Genius') >= 0 || tag.indexOf('Flashy Solve') >= 0 || tag.indexOf('Clever Math') >= 0;
        }) || '';
        var ratingIcon = 'star';
        if (levelTag.indexOf('Perfect Genius') >= 0) ratingIcon = 'trophy';
        else if (levelTag.indexOf('Flashy Solve') >= 0) ratingIcon = 'sparkle';
        else if (levelTag.indexOf('Clever Math') >= 0) ratingIcon = 'aiHard';
        ratingEl.innerHTML = '<span class="rating-badge">' + (typeof svgIcon === 'function' ? svgIcon(ratingIcon) : '') + '</span>' +
          '<span class="rating-score">' + levelTag + ' \u00b7 Score ' + sr.score + '</span>';
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
  document.getElementById('footer-bar').innerHTML = (typeof footerIcon === 'function' ? footerIcon('card') : '<span class="icon">\u2660</span>') + t('footer_ready');
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

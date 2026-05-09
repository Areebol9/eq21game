"use strict";
// ==================== 历史记录 & 评分系统 ====================
const STORAGE_KEY = 'eq21_history';
const STORAGE_VERSION = 1;

// ==================== 数据持久化 ====================
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: STORAGE_VERSION, records: [] };
    const data = JSON.parse(raw);
    if (data.version !== STORAGE_VERSION) {
      return { version: STORAGE_VERSION, records: [] };
    }
    return data;
  } catch (e) {
    return { version: STORAGE_VERSION, records: [] };
  }
}

function saveHistory(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    showToast(t('history_save_failed'), 'error');
    return false;
  }
}

// ==================== ID 生成 ====================
function generateId() {
  const now = new Date();
  const dateStr = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const data = loadHistory();
  const todayRecords = data.records.filter(r => r.id && r.id.startsWith(dateStr));
  const seq = String(todayRecords.length + 1).padStart(3, '0');
  return dateStr + '-' + seq;
}

// ==================== 连胜动态计算 ====================
function computeStreak(records, playerName) {
  let streak = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    // 训练模式不计入连胜，也不打断连胜
    if (r.mode === 'solo') continue;
    if (r.result === 'win' && r.player === playerName) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ==================== 运算符检测 ====================
function detectOps(formula) {
  return {
    hasMul: formula.includes('*'),
    hasDiv: formula.includes('/'),
    hasPow: formula.includes('^'),
    hasSqrt: formula.includes('\u221A') || formula.toLowerCase().includes('sqrt'),
    hasFact: formula.includes('!')
  };
}

// ==================== 评分计算 ====================
function calculateScore(p, expr, handLength, submits, timeSec) {
  const breakdown = [];
  let total = 0;
  let solutionRating = null;

  // 底分
  total += 500;
  breakdown.push({ label: t('score_base'), score: 500 });

  // 运算符加分
  const ops = detectOps(expr);
  if (ops.hasMul || ops.hasDiv) {
    total += 50;
    breakdown.push({ label: t('score_muldiv'), score: 50 });
  }
  if (ops.hasPow) {
    total += 150;
    breakdown.push({ label: t('score_pow'), score: 150 });
  }
  if (ops.hasSqrt) {
    total += 200;
    breakdown.push({ label: t('score_sqrt'), score: 200 });
  }
  if (ops.hasFact) {
    total += 300;
    breakdown.push({ label: t('score_fact'), score: 300 });
  }

  if (typeof rateSolution === 'function') {
    const rating = rateSolution(expr, game.difficulty, handLength);
    solutionRating = {
      score: rating.score,
      tags: (rating.tags || []).slice(),
      complexity: rating.complexity,
      ops: Object.assign({}, rating.ops || {})
    };
    if (rating.score >= 160) {
      const coolBonus = Math.min(500, Math.round(rating.score / 2));
      total += coolBonus;
      breakdown.push({ label: t('score_cool'), score: coolBonus });
    }
  }

  // 成就加分
  if (handLength <= 3) {
    total += 150;
    breakdown.push({ label: t('score_3cards'), score: 150 });
  }

  if (submits === 1) {
    total += 200;
    breakdown.push({ label: t('score_oneshot'), score: 200 });
  }

  if (timeSec <= 15) {
    total += 200;
    breakdown.push({ label: t('score_lightning'), score: 200 });
  } else if (timeSec <= 30) {
    total += 100;
    breakdown.push({ label: t('score_speed'), score: 100 });
  }

  // 连胜加分（动态计算，含当前局）
  const data = loadHistory();
  const streak = computeStreak(data.records, p.name) + 1;
  if (streak >= 2) {
    const streakBonus = 100 * streak;
    total += streakBonus;
    breakdown.push({ label: t('score_streak', {N: streak}), score: streakBonus });
  }

  return { total, breakdown, solutionRating };
}

// ==================== 标签生成 ====================
function getTags(formula, handLength, submits, timeSec, streak, difficulty) {
  const tags = [];
  if (handLength <= 3) tags.push(t('tag_3cards'));
  if (handLength >= 5) tags.push(t('tag_5cards'));
  if (submits === 1) tags.push(t('tag_oneshot'));
  if (timeSec <= 15) tags.push(t('tag_lightning'));
  else if (timeSec <= 30) tags.push(t('tag_speed'));
  const ops = detectOps(formula);
  if (ops.hasMul || ops.hasDiv) tags.push(t('tag_muldiv'));
  if (ops.hasPow) tags.push(t('tag_pow'));
  if (ops.hasSqrt) tags.push(t('tag_sqrt'));
  if (ops.hasFact) tags.push(t('tag_fact'));
  if (typeof rateSolution === 'function') {
    const rating = rateSolution(formula, difficulty, handLength);
    for (const tag of rating.tags) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  if (streak >= 3) tags.push(t('tag_streak', {N: streak}));
  return tags;
}

// ==================== 记录操作 ====================
function addRecord(record) {
  const data = loadHistory();
  data.records.push(record);
  // 只保留最近200条
  if (data.records.length > 200) {
    data.records = data.records.slice(-200);
  }
  return saveHistory(data);
}

function clearHistory() {
  if (!saveHistory({ version: STORAGE_VERSION, records: [] })) return false;
  renderHistoryPanel();
  showToast(t('history_cleared'), 'info');
  return true;
}

// ==================== 统计函数 ====================
function getStats(records, mode) {
  var filtered;
  if (mode === 'competitive') {
    filtered = records.filter(function(r) { return r.mode !== 'solo'; });
  } else {
    filtered = records;
  }
  var total = filtered.length;
  var wins = filtered.filter(function(r) { return r.result === 'win'; }).length;
  var winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  var highest = filtered.reduce(function(max, r) { return Math.max(max, r.score || 0); }, 0);
  var winRecords = filtered.filter(function(r) { return r.result === 'win'; });
  var fastest = winRecords.reduce(function(min, r) { return Math.min(min, r.timeSec || 99999); }, 99999);
  return { totalGames: total, winRate: winRate, highestScore: highest, fastestSec: fastest === 99999 ? null : fastest };
}

function getBestRecord(records) {
  var competitive = records.filter(function(r) { return r.mode !== 'solo'; });
  return competitive.reduce(function(best, r) {
    if ((r.score || 0) > (best.score || 0)) return r;
    return best;
  }, competitive[0] || null);
}

function getRecentRecords(records, n) {
  n = n || 20;
  return records.slice(-n).reverse();
}

// ==================== 辅助格式化 ====================
function formatHistoryTime(sec) {
  if (sec == null || isNaN(sec)) return '--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return (m > 0 ? t('history_time_min', {N: m}) + t('history_time_sec', {N: s}) : t('history_time_sec', {N: s}));
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.getMonth() + 1 + '/' + d.getDate() + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

// ==================== UI 渲染 ====================
// mode 标签映射（运行时通过 t() 获取）
function getModeLabel(mode) {
  return t('history_mode_' + mode);
}
var _historyDiff = 'all';

function renderHistoryPanel() {
  const data = loadHistory();
  const records = data.records;
  const compRecords = records.filter(function(r) { return r.mode !== 'solo'; });
  const soloCount = records.length - compRecords.length;
  const stats = getStats(records, 'competitive');
  const best = getBestRecord(records);
  const filtered = _historyDiff !== 'all' ? records.filter(function(r) { return r.difficulty === _historyDiff; }) : records;
  const recent = getRecentRecords(filtered, 20);

  // 当前活跃玩家连胜
  const recentWin = records.slice().reverse().find(r => r.result === 'win');
  const currentStreak = recentWin ? computeStreak(records, recentWin.player) : 0;

  // 统计卡片
  const statsEl = document.getElementById('history-stats');
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="history-stat-card"><div class="stat-val">' + stats.totalGames + '</div><div class="stat-label">' + t('history_stat_games') + '</div></div>' +
      '<div class="history-stat-card"><div class="stat-val">' + stats.winRate + '%</div><div class="stat-label">' + t('history_stat_winrate') + '</div></div>' +
      '<div class="history-stat-card"><div class="stat-val">\u2b50' + stats.highestScore + '</div><div class="stat-label">' + t('history_stat_highest') + '</div></div>' +
      '<div class="history-stat-card"><div class="stat-val">\u26a1' + formatHistoryTime(stats.fastestSec) + '</div><div class="stat-label">' + t('history_stat_fastest') + '</div></div>';
  }

  // 单人训练统计
  const soloStatsEl = document.getElementById('history-stats-solo');
  if (soloStatsEl) {
    const soloRecords = records.filter(function(r) { return r.mode === 'solo'; });
    if (soloRecords.length > 0) {
      const sStats = getStats(soloRecords);
      soloStatsEl.innerHTML = '<div class="history-stats-label">\uD83D\uDCCB ' + t('history_solo_label') + '</div>' +
        '<div class="history-stat-card"><div class="stat-val">' + sStats.totalGames + '</div><div class="stat-label">' + t('history_stat_solo_games') + '</div></div>' +
        '<div class="history-stat-card"><div class="stat-val">\u2b50' + sStats.highestScore + '</div><div class="stat-label">' + t('history_stat_highest') + '</div></div>' +
        '<div class="history-stat-card"><div class="stat-val">\u26a1' + formatHistoryTime(sStats.fastestSec) + '</div><div class="stat-label">' + t('history_stat_fastest') + '</div></div>';
      soloStatsEl.style.display = '';
    } else {
      soloStatsEl.style.display = 'none';
    }
  }

  // 连胜显示
  const streakEl = document.getElementById('history-streak');
  if (streakEl) streakEl.textContent = t('history_streak_label') + currentStreak;

  // 最漂亮解法
  const bestEl = document.getElementById('history-best');
  if (bestEl && best) {
    const bestTags = best.tags || [];
    var bestHtml = '<div class="best-title">' + (typeof svgIcon === 'function' ? svgIcon('trophy', 'best-title-icon') : '') + ' ' + t('history_best_title') + '</div>';
    bestHtml += '<div class="best-name">' + hEscape(best.player) + '</div>';
    bestHtml += '<div class="best-score">' + best.score + 'pts</div>';
    bestHtml += '<div class="best-time">' + formatHistoryTime(best.timeSec) + '</div>';
    bestHtml += '<div class="best-hand">' + (best.hand || []).map(function(v) { return cardFace(v); }).join(' ') + '</div>';
    bestHtml += '<div class="best-formula">' + hEscape(best.formula || '') + '</div>';
    if (best.solutionRating && best.solutionRating.score >= 160) {
      var sr = best.solutionRating;
      var srTags = sr.tags || [];
      var levelTag = '';
      for (var t = 0; t < srTags.length; t++) {
        if (srTags[t].indexOf('Perfect Genius') >= 0) levelTag = srTags[t];
        else if (!levelTag && srTags[t].indexOf('Flashy Solve') >= 0) levelTag = srTags[t];
        else if (!levelTag && srTags[t].indexOf('Clever Math') >= 0) levelTag = srTags[t];
      }
      if (levelTag) bestHtml += '<div class="best-rating">' + levelTag + ' · ' + sr.score + '</div>';
    }
    if (bestTags.length > 0) {
      bestHtml += '<div class="best-tags">';
      for (var ti = 0; ti < bestTags.length; ti++) {
        bestHtml += '<span class="tag-pill">' + bestTags[ti] + '</span>';
      }
      bestHtml += '</div>';
    }
    bestEl.innerHTML = bestHtml;
  } else if (bestEl) {
    bestEl.innerHTML = '<div class="best-title">' + (typeof svgIcon === 'function' ? svgIcon('trophy', 'best-title-icon') : '') + ' ' + t('history_best_title') + '</div><div class="history-empty">' + t('history_empty_comp') + '</div>';
  }

  // 难度筛选
  const diffFilter = document.getElementById('history-diff-filter');
  if (diffFilter) {
    if (records.length > 0) {
      diffFilter.style.display = '';
      var activeDiff = _historyDiff || 'all';
      var diffTags = diffFilter.querySelectorAll('.diff-tag');
      for (var d = 0; d < diffTags.length; d++) {
        diffTags[d].classList.toggle('active', diffTags[d].dataset.diff === activeDiff);
        diffTags[d].onclick = function() {
          _historyDiff = this.dataset.diff;
          renderHistoryPanel();
        };
      }
    } else {
      diffFilter.style.display = 'none';
    }
  }

  // 最近记录
  const recEl = document.getElementById('history-records');
  if (recEl) {
    if (recent.length === 0) {
      recEl.innerHTML = '<div class="history-empty">' + t('history_empty') + '</div>';
    } else {
      var recHtml = '';
      for (var ri = 0; ri < recent.length; ri++) {
        var r = recent[ri];
        var rTags = r.tags || [];
        var isWin = r.result === 'win';
        recHtml += '<div class="history-record">';
        recHtml += '<div class="rec-header">';
        recHtml += '<span class="rec-result ' + (isWin ? 'win' : 'lose') + '">' + (isWin ? '✅' : '❌') + '</span>';
        recHtml += '<span class="rec-player">' + hEscape(r.player) + '</span>';
        recHtml += '<span class="rec-score">' + r.score + 'pts</span>';
        recHtml += '<span class="rec-time">' + formatHistoryTime(r.timeSec) + '</span>';
        recHtml += '<span class="mode-tag mode-' + r.mode + '">' + getModeLabel(r.mode) + '</span>';
        recHtml += '</div>';
        recHtml += '<div class="rec-hand">' + (r.hand || []).map(function(v) { return cardFace(v); }).join(' ') + '</div>';
        if (r.formula) recHtml += '<div class="rec-formula">' + hEscape(r.formula) + '</div>';
        if (r.solutionRating && r.solutionRating.score >= 160) {
          var sr = r.solutionRating;
          var srTags = sr.tags || [];
          var levelTag = '';
          for (var tl = 0; tl < srTags.length; tl++) {
            if (srTags[tl].indexOf('Perfect Genius') >= 0) levelTag = srTags[tl];
            else if (!levelTag && srTags[tl].indexOf('Flashy Solve') >= 0) levelTag = srTags[tl];
            else if (!levelTag && srTags[tl].indexOf('Clever Math') >= 0) levelTag = srTags[tl];
          }
          recHtml += '<div class="rec-rating">' + hEscape(levelTag) + ' \u00b7 Score ' + sr.score + '</div>';
        }
        if (rTags.length > 0) {
          recHtml += '<div class="rec-tags">';
          for (var tj = 0; tj < rTags.length; tj++) {
            recHtml += '<span class="tag-pill">' + rTags[tj] + '</span>';
          }
          recHtml += '</div>';
        }
        recHtml += '</div>';
      }
      recEl.innerHTML = recHtml;
    }
  }
}

function hEscape(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


"use strict";
// ==================== 初始化入口 ====================
function init() {
  // 初始化牌库计数
  updateDeckCount();

  // 菜单事件
  document.getElementById('btn-solo').onclick = () => startMode('solo');
  document.getElementById('btn-local').onclick = () => startMode('local');
  document.getElementById('btn-ai').onclick = () => startMode('ai');
  document.getElementById('btn-online').onclick = showComingSoon;
  document.getElementById('btn-rules').onclick = showRules;
  document.getElementById('btn-back').onclick = goToMenu;

  // 规则弹窗关闭
  document.getElementById('btn-close-rules').onclick = hideRules;
  document.getElementById('rules-overlay').onclick = (e) => { if (e.target === document.getElementById('rules-overlay')) hideRules(); };

  // 难度选择
  document.querySelectorAll('.diff-option').forEach(btn => {
    btn.onclick = () => selectDifficulty(btn.dataset.diff, btn);
  });

  // 围桌模式
  document.getElementById('btn-start-table').onclick = startLocalGame;
  document.getElementById('btn-table-back').onclick = goToMenu;
  // 人数选择卡片
  document.querySelectorAll('.table-opt').forEach(c => {
    c.onclick = () => {
      document.querySelectorAll('.table-opt').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      updateTableNameInputs();
    };
  });
  resetTableSetupDefaults();

  // AI 对战
  document.querySelectorAll('.ai-level-option').forEach(btn => {
    btn.onclick = () => selectAiLevel(btn.dataset.level, btn);
  });
  document.getElementById('btn-start-ai').onclick = startAiGame;
  document.getElementById('btn-ai-back').onclick = goToMenu;

  // 结果弹窗
  document.getElementById('btn-again').onclick = resetGame;
  document.getElementById('btn-menu').onclick = goToMenu;

  // 音效开关
  document.getElementById('btn-sound').onclick = toggleSound;

  // 日志折叠
  initLogPanel();

  // 历史面板
  document.getElementById('btn-history').onclick = openHistory;
  document.getElementById('btn-history-close').onclick = closeHistory;
  document.getElementById('btn-history-clear').onclick = () => {
    if (confirm('确定要清空所有对局历史吗？此操作不可恢复！') && clearHistory()) {
      openHistory();
    }
  };

  // 键盘快捷键：Enter 提交
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && game.phase === 'playing' && document.activeElement && document.activeElement.matches('.formula-input')) {
      const idx = parseInt(document.activeElement.closest('.player-card')?.getAttribute('data-index'));
      if (!isNaN(idx)) submitFormula(idx);
    }
    // 键盘快捷键：ESC 关闭弹窗
    if (e.key === 'Escape') {
      if (!document.getElementById('rules-overlay').classList.contains('hidden')) hideRules();
      if (!document.getElementById('history-panel').classList.contains('hidden')) closeHistory();
    }
  });

  // 初始化音效偏好
  game.soundEnabled = localStorage.getItem('eq21_sound') !== 'off';
  updateSoundButton();

  // 按钮点击音效（委托监听所有 <button>）
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (btn) soundPlay('click');
  });

  // 轻量键盘可访问性
  enableKeyboardActivation();

  // 关闭预设 AI 倒计时
  stopAiThinking();
  State.set('_firstRender', false);
}

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function enableKeyboardActivation() {
  document.querySelectorAll('.menu-card, .choice-card').forEach(el => {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (typeof el.onclick === 'function') el.onclick(e);
      }
    });
  });
}

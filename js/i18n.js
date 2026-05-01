"use strict";

var I18N = {
  lang: "zh",
  text: {
    zh: {
      lang_toggle: "EN",

      mode_solo: "单人练习",
      mode_solo_desc: "自由练习 · 渐进提示",
      mode_local: "围桌模式",
      mode_local_desc: "一台设备，多人同桌",
      mode_ai: "AI对战",
      mode_ai_desc: "挑战不同级别的 AI",
      mode_online: "联网对战",
      mode_online_desc: "开房邀请，2~4 人在线",

      section_difficulty: "选择难度",
      diff_easy: "简单",
      diff_easy_cards: "牌面：A ~ 10",
      diff_easy_ops: "运算：+  -  *  /  ( )",
      diff_easy_for: "适合新手入门",
      diff_normal: "普通",
      diff_normal_cards: "牌面：A ~ K",
      diff_normal_ops: "运算：+  -  *  /  ^  √  ( )",
      diff_normal_for: "适合熟练玩家",
      diff_hard: "困难",
      diff_hard_cards: "牌面：A ~ K",
      diff_hard_ops: "运算：+  -  *  /  ^  √  !  ( )",
      diff_hard_for: "适合数学高手",

      btn_history: "对局历史",
      btn_rules: "游戏规则",

      ai_setup_title: "AI对战设置",
      ai_your_name: "你的名字",
      ai_level_label: "选择对手等级",
      ai_easy: "新手赌徒",
      ai_easy_desc: "入门级对手",
      ai_easy_flavor: "\"还在学算牌\"",
      ai_medium: "老练玩家",
      ai_medium_desc: "进阶级对手",
      ai_medium_flavor: "\"数感不错\"",
      ai_hard: "数学教授",
      ai_hard_desc: "专家级对手",
      ai_hard_flavor: "\"几乎不会错过\"",
      btn_start_ai: "开始对战",

      table_setup_title: "围桌模式",
      table_layout_label: "选择人数布局",
      table_2p: "双人对弈",
      table_2p_desc: "面对面决胜",
      table_3p: "三足鼎立",
      table_3p_desc: "三角对峙",
      table_4p: "四方会战",
      table_4p_desc: "围桌四方",
      btn_start_table: "开始对局",

      online_setup_title: "联网对战",
      online_nickname: "昵称",
      online_url_label: "服务地址",
      online_players_label: "房间人数",
      online_2p_desc: "双人切磋",
      online_3p_desc: "三人成局",
      online_4p_desc: "四方争锋",
      btn_create_room: "创建房间",
      btn_join: "加入",
      btn_reconnect: "重连上次房间",
      room_code_placeholder: "输入房间码",

      btn_back: "返回菜单",
      btn_got_it: "知道了！",
      btn_again: "再来一局",
      player_default: "玩家",

      rules_title: "游戏规则",
      rules_goal_title: "目标",
      rules_goal: "使用手中<strong>所有牌</strong>，通过运算组合使结果<strong>恰好等于 21</strong>！",
      rules_cards_title: "牌面对应数值",
      rules_diff_title: "难度与运算符",
      rules_example_title: "表达式示例",
      rules_example_hand: "手牌：<strong>[2, 4, 5, 1]</strong>",
      rules_example_ok1: "✓ (5+2)*(4-1) = 7×3 = 21",
      rules_example_ok2: "✓ 5*4+2-1 = 20+1 = 21",
      rules_example_bad1: "✗ 5+4+2+1 = 12（不等于21）",
      rules_example_bad2: "✗ 5+4+2 = 11（少用了一张牌！）",
      rules_important_title: "重要规则",
      rules_important_1: "每张牌<strong>必须且只能</strong>使用一次",
      rules_important_2: "不能拼接数字（1和2不能拼成12）",
      rules_important_3: "除法结果可以是小数",
      rules_important_4: "每局最多<strong>5张牌</strong>，可主动点击\"+牌\"追加",
      rules_important_5: "花色不影响游戏（仅装饰）",
      rules_important_6: "提交不正确可重试，无次数限制"
    },
    en: {
      lang_toggle: "中文",

      mode_solo: "Solo Practice",
      mode_solo_desc: "Free practice · Hints",
      mode_local: "Tabletop",
      mode_local_desc: "Local multiplayer",
      mode_ai: "AI Battle",
      mode_ai_desc: "Challenge AI opponents",
      mode_online: "Online Match",
      mode_online_desc: "Create room, 2\u20134 players",

      section_difficulty: "Difficulty",
      diff_easy: "Easy",
      diff_easy_cards: "Cards: A \u2013 10",
      diff_easy_ops: "Ops: +  \u2013  *  /  ( )",
      diff_easy_for: "For beginners",
      diff_normal: "Normal",
      diff_normal_cards: "Cards: A \u2013 K",
      diff_normal_ops: "Ops: +  \u2013  *  /  ^  \u221a  ( )",
      diff_normal_for: "For experienced",
      diff_hard: "Hard",
      diff_hard_cards: "Cards: A \u2013 K",
      diff_hard_ops: "Ops: +  \u2013  *  /  ^  \u221a  !  ( )",
      diff_hard_for: "For math experts",

      btn_history: "History",
      btn_rules: "Rules",

      ai_setup_title: "AI Battle Setup",
      ai_your_name: "Your name",
      ai_level_label: "AI Difficulty",
      ai_easy: "Rookie",
      ai_easy_desc: "Beginner AI",
      ai_easy_flavor: "\"Still learning\"",
      ai_medium: "Veteran",
      ai_medium_desc: "Intermediate AI",
      ai_medium_flavor: "\"Sharp instincts\"",
      ai_hard: "Professor",
      ai_hard_desc: "Expert AI",
      ai_hard_flavor: "\"Almost never misses\"",
      btn_start_ai: "Start Battle",

      table_setup_title: "Tabletop Setup",
      table_layout_label: "Players",
      table_2p: "2 Players",
      table_2p_desc: "Head to head",
      table_3p: "3 Players",
      table_3p_desc: "Three-way",
      table_4p: "4 Players",
      table_4p_desc: "Full table",
      btn_start_table: "Start",

      online_setup_title: "Online Match",
      online_nickname: "Nickname",
      online_url_label: "Server URL",
      online_players_label: "Room Size",
      online_2p_desc: "2P duel",
      online_3p_desc: "3P match",
      online_4p_desc: "4P battle",
      btn_create_room: "Create Room",
      btn_join: "Join",
      btn_reconnect: "Reconnect",
      room_code_placeholder: "Room code",

      btn_back: "Back",
      btn_got_it: "Got it!",
      btn_again: "Play Again",
      player_default: "Player",

      rules_title: "Game Rules",
      rules_goal_title: "Objective",
      rules_goal: "Use <strong>all cards</strong> in hand to form an expression equal to <strong>exactly 21</strong>!",
      rules_cards_title: "Card Values",
      rules_diff_title: "Difficulty & Operators",
      rules_example_title: "Examples",
      rules_example_hand: "Hand: <strong>[2, 4, 5, 1]</strong>",
      rules_example_ok1: "\u2713 (5+2)*(4-1) = 7\u00d73 = 21",
      rules_example_ok2: "\u2713 5*4+2-1 = 20+1 = 21",
      rules_example_bad1: "\u2717 5+4+2+1 = 12 (not 21)",
      rules_example_bad2: "\u2717 5+4+2 = 11 (missing a card!)",
      rules_important_title: "Important Rules",
      rules_important_1: "Each card <strong>must</strong> be used <strong>exactly once</strong>",
      rules_important_2: "Cannot concatenate digits (1 & 2 \u2260 12)",
      rules_important_3: "Division may produce decimal results",
      rules_important_4: "Max <strong>5 cards</strong> per round, click \"+Card\" to draw",
      rules_important_5: "Card suits are decorative only",
      rules_important_6: "Retry unlimited times if incorrect"
    }
  }
};

function t(key) {
  return I18N.text[I18N.lang][key] || key;
}

function setLanguage(lang) {
  I18N.lang = lang;
  try { localStorage.setItem("eq21lang", lang); } catch (e) {}
  applyLanguageText();
}

function initLanguage() {
  var saved;
  try { saved = localStorage.getItem("eq21lang"); } catch (e) {}
  if (saved === "en" || saved === "zh") I18N.lang = saved;
  applyLanguageText();
}

function applyLanguageText() {
  var all = document.querySelectorAll("[data-i18n]");
  for (var i = 0; i < all.length; i++) {
    var node = all[i];
    var key = node.getAttribute("data-i18n");
    if (!key) continue;
    var text = I18N.text[I18N.lang][key];
    if (text === undefined) continue;
    if (text.indexOf("<") >= 0) {
      node.innerHTML = text;
    } else {
      node.textContent = text;
    }
  }

  var placeholders = document.querySelectorAll("[data-i18n-placeholder]");
  for (var j = 0; j < placeholders.length; j++) {
    var ph = placeholders[j];
    var phKey = ph.getAttribute("data-i18n-placeholder");
    if (!phKey) continue;
    var phText = I18N.text[I18N.lang][phKey];
    if (phText !== undefined) ph.placeholder = phText;
  }
}

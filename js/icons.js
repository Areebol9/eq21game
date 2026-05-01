"use strict";

const EQ21_ICON_PATHS = {
  rules: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M8 7h8"/><path d="M8 10h6"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M18.5 7a7.5 7.5 0 0 1 0 10"/>',
  volumeOff: '<path d="M4 9v6h4l5 4v-5"/><path d="M13 7.5V5L9.8 7.6"/><path d="M3 3l18 18"/><path d="M18 9l3 3"/><path d="M21 9l-3 3"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.35-5.66"/><path d="M4 4v5h5"/><path d="M12 8v5l3 2"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  card: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M9 7h.01"/><path d="M15 17h.01"/><path d="M10 12h4"/>',
  cardStack: '<rect x="7" y="3" width="12" height="16" rx="2.2"/><path d="M5 7v12a2 2 0 0 0 2 2h8"/><path d="M10 8h6"/><path d="M10 12h4"/>',
  suitSpade: '<path fill="currentColor" stroke="none" d="M12 2.4C8.1 6.5 4.7 9.2 4.7 12.8c0 2.45 1.82 4.25 4.12 4.25 1.23 0 2.25-.5 2.88-1.32-.26 1.8-1.1 3.23-2.52 4.42h5.64c-1.42-1.19-2.26-2.62-2.52-4.42.63.82 1.65 1.32 2.88 1.32 2.3 0 4.12-1.8 4.12-4.25 0-3.6-3.4-6.3-7.3-10.4Z"/>',
  suitHeart: '<path fill="currentColor" stroke="none" d="M12 20.5C7.35 16.35 4.1 13.45 4.1 9.75A4.05 4.05 0 0 1 8.2 5.6c1.78 0 3.05.92 3.8 2.02.75-1.1 2.02-2.02 3.8-2.02a4.05 4.05 0 0 1 4.1 4.15c0 3.7-3.25 6.6-7.9 10.75Z"/>',
  suitDiamond: '<path fill="currentColor" stroke="none" d="M12 2.6 19.35 12 12 21.4 4.65 12 12 2.6Z"/>',
  suitClub: '<path fill="currentColor" stroke="none" d="M12 2.9 C9.6 2.9 7.6 4.9 7.6 7.3 C7.6 8.2 7.8 9.0 8.2 9.6 C7.6 9.4 7.0 9.2 6.2 9.2 C3.8 9.2 1.8 11.2 1.8 13.7 C1.8 16.1 3.8 18.1 6.2 18.1 C8.3 18.1 10.0 16.7 10.5 14.8 C10.4 17.4 9.4 19.8 7.4 21.8 H16.6 C14.6 19.8 13.6 17.4 13.5 14.8 C14.0 16.7 15.7 18.1 17.8 18.1 C20.2 18.1 22.2 16.1 22.2 13.7 C22.2 11.2 20.2 9.2 17.8 9.2 C17.0 9.2 16.4 9.4 15.8 9.6 C16.2 9.0 16.4 8.2 16.4 7.3 C16.4 4.9 14.4 2.9 12 2.9 Z"/>',
  single: `<defs>
  <radialGradient id="sg-bg" cx="35%" cy="30%" r="65%">
    <stop offset="0%" stop-color="#7dc8ff"/>
    <stop offset="50%" stop-color="#3d8bff"/>
    <stop offset="100%" stop-color="#0d2d6e"/>
  </radialGradient>
  <radialGradient id="sg-glow" cx="35%" cy="30%" r="50%">
    <stop offset="0%" stop-color="rgba(150,215,255,0.5)"/>
    <stop offset="70%" stop-color="rgba(50,140,240,0.05)"/>
    <stop offset="100%" stop-color="rgba(10,50,100,0.3)"/>
  </radialGradient>
  <linearGradient id="sg-shine" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="rgba(255,255,255,0.7)"/>
    <stop offset="30%" stop-color="rgba(255,255,255,0.15)"/>
    <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
  </linearGradient>
</defs>
<path d="M12 2.4C8.1 6.5 4.7 9.2 4.7 12.8c0 2.45 1.82 4.25 4.12 4.25 1.23 0 2.25-.5 2.88-1.32-.26 1.8-1.1 3.23-2.52 4.42h5.64c-1.42-1.19-2.26-2.62-2.52-4.42.63.82 1.65 1.32 2.88 1.32 2.3 0 4.12-1.8 4.12-4.25 0-3.6-3.4-6.3-7.3-10.4Z" fill="url(#sg-bg)" stroke="rgba(180,220,255,0.35)" stroke-width="0.5"/>
<path d="M12 2.4C8.1 6.5 4.7 9.2 4.7 12.8c0 2.45 1.82 4.25 4.12 4.25 1.23 0 2.25-.5 2.88-1.32-.26 1.8-1.1 3.23-2.52 4.42h5.64c-1.42-1.19-2.26-2.62-2.52-4.42.63.82 1.65 1.32 2.88 1.32 2.3 0 4.12-1.8 4.12-4.25 0-3.6-3.4-6.3-7.3-10.4Z" fill="url(#sg-glow)" stroke="none" transform="translate(1.8,1.8) scale(0.85)"/>
<path d="M12 2.4C8.1 6.5 4.7 9.2 4.7 12.8c0 2.45 1.82 4.25 4.12 4.25 1.23 0 2.25-.5 2.88-1.32-.26 1.8-1.1 3.23-2.52 4.42h5.64c-1.42-1.19-2.26-2.62-2.52-4.42.63.82 1.65 1.32 2.88 1.32 2.3 0 4.12-1.8 4.12-4.25 0-3.6-3.4-6.3-7.3-10.4Z" fill="none" stroke="url(#sg-shine)" stroke-width="0.7"/>`,
  table: `<defs>
  <radialGradient id="tb-bg" cx="35%" cy="30%" r="65%">
    <stop offset="0%" stop-color="#ff7a8a"/>
    <stop offset="50%" stop-color="#e03050"/>
    <stop offset="100%" stop-color="#4a1020"/>
  </radialGradient>
  <radialGradient id="tb-glow" cx="35%" cy="30%" r="50%">
    <stop offset="0%" stop-color="rgba(255,140,160,0.5)"/>
    <stop offset="70%" stop-color="rgba(220,60,90,0.05)"/>
    <stop offset="100%" stop-color="rgba(70,10,30,0.3)"/>
  </radialGradient>
  <linearGradient id="tb-shine" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="rgba(255,255,255,0.7)"/>
    <stop offset="30%" stop-color="rgba(255,255,255,0.15)"/>
    <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
  </linearGradient>
</defs>
<path d="M12 20.5C7.35 16.35 4.1 13.45 4.1 9.75A4.05 4.05 0 0 1 8.2 5.6c1.78 0 3.05.92 3.8 2.02.75-1.1 2.02-2.02 3.8-2.02a4.05 4.05 0 0 1 4.1 4.15c0 3.7-3.25 6.6-7.9 10.75Z" fill="url(#tb-bg)" stroke="rgba(255,150,170,0.35)" stroke-width="0.5"/>
<path d="M12 20.5C7.35 16.35 4.1 13.45 4.1 9.75A4.05 4.05 0 0 1 8.2 5.6c1.78 0 3.05.92 3.8 2.02.75-1.1 2.02-2.02 3.8-2.02a4.05 4.05 0 0 1 4.1 4.15c0 3.7-3.25 6.6-7.9 10.75Z" fill="url(#tb-glow)" stroke="none" transform="translate(1.8,1.8) scale(0.85)"/>
<path d="M12 20.5C7.35 16.35 4.1 13.45 4.1 9.75A4.05 4.05 0 0 1 8.2 5.6c1.78 0 3.05.92 3.8 2.02.75-1.1 2.02-2.02 3.8-2.02a4.05 4.05 0 0 1 4.1 4.15c0 3.7-3.25 6.6-7.9 10.75Z" fill="none" stroke="url(#tb-shine)" stroke-width="0.7"/>`,
  ai: `<defs>
  <radialGradient id="ai-bg" cx="35%" cy="30%" r="65%">
    <stop offset="0%" stop-color="#f5e6a0"/>
    <stop offset="50%" stop-color="#d4a84b"/>
    <stop offset="100%" stop-color="#6b3a10"/>
  </radialGradient>
  <radialGradient id="ai-glow" cx="35%" cy="30%" r="50%">
    <stop offset="0%" stop-color="rgba(245,230,160,0.5)"/>
    <stop offset="70%" stop-color="rgba(200,160,70,0.05)"/>
    <stop offset="100%" stop-color="rgba(80,40,15,0.3)"/>
  </radialGradient>
  <linearGradient id="ai-shine" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="rgba(255,255,255,0.8)"/>
    <stop offset="25%" stop-color="rgba(255,255,255,0.2)"/>
    <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
  </linearGradient>
</defs>
<path d="M12 2.6 19.35 12 12 21.4 4.65 12 12 2.6Z" fill="url(#ai-bg)" stroke="rgba(255,240,200,0.4)" stroke-width="0.5"/>
<path d="M12 2.6 19.35 12 12 21.4 4.65 12 12 2.6Z" fill="url(#ai-glow)" stroke="none" transform="translate(1.8,1.8) scale(0.85)"/>
<path d="M12 2.6 19.35 12 12 21.4 4.65 12 12 2.6Z" fill="none" stroke="url(#ai-shine)" stroke-width="0.8"/>`,
  online: `<defs>
  <radialGradient id="ol-bg" cx="35%" cy="30%" r="65%">
    <stop offset="0%" stop-color="#85f0a0"/>
    <stop offset="50%" stop-color="#2ea850"/>
    <stop offset="100%" stop-color="#0a3a20"/>
  </radialGradient>
  <radialGradient id="ol-glow" cx="35%" cy="30%" r="50%">
    <stop offset="0%" stop-color="rgba(150,240,180,0.5)"/>
    <stop offset="70%" stop-color="rgba(50,170,80,0.05)"/>
    <stop offset="100%" stop-color="rgba(10,50,30,0.3)"/>
  </radialGradient>
  <linearGradient id="ol-shine" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="rgba(255,255,255,0.65)"/>
    <stop offset="30%" stop-color="rgba(255,255,255,0.12)"/>
    <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
  </linearGradient>
</defs>
<path d="M12 2.9 C9.6 2.9 7.6 4.9 7.6 7.3 C7.6 8.2 7.8 9.0 8.2 9.6 C7.6 9.4 7.0 9.2 6.2 9.2 C3.8 9.2 1.8 11.2 1.8 13.7 C1.8 16.1 3.8 18.1 6.2 18.1 C8.3 18.1 10.0 16.7 10.5 14.8 C10.4 17.4 9.4 19.8 7.4 21.8 H16.6 C14.6 19.8 13.6 17.4 13.5 14.8 C14.0 16.7 15.7 18.1 17.8 18.1 C20.2 18.1 22.2 16.1 22.2 13.7 C22.2 11.2 20.2 9.2 17.8 9.2 C17.0 9.2 16.4 9.4 15.8 9.6 C16.2 9.0 16.4 8.2 16.4 7.3 C16.4 4.9 14.4 2.9 12 2.9 Z" fill="url(#ol-bg)" stroke="rgba(150,240,180,0.3)" stroke-width="0.5"/>
<path d="M12 2.9 C9.6 2.9 7.6 4.9 7.6 7.3 C7.6 8.2 7.8 9.0 8.2 9.6 C7.6 9.4 7.0 9.2 6.2 9.2 C3.8 9.2 1.8 11.2 1.8 13.7 C1.8 16.1 3.8 18.1 6.2 18.1 C8.3 18.1 10.0 16.7 10.5 14.8 C10.4 17.4 9.4 19.8 7.4 21.8 H16.6 C14.6 19.8 13.6 17.4 13.5 14.8 C14.0 16.7 15.7 18.1 17.8 18.1 C20.2 18.1 22.2 16.1 22.2 13.7 C22.2 11.2 20.2 9.2 17.8 9.2 C17.0 9.2 16.4 9.4 15.8 9.6 C16.2 9.0 16.4 8.2 16.4 7.3 C16.4 4.9 14.4 2.9 12 2.9 Z" fill="url(#ol-glow)" stroke="none" transform="translate(1.8,1.8) scale(0.85)"/>
<path d="M12 2.9 C9.6 2.9 7.6 4.9 7.6 7.3 C7.6 8.2 7.8 9.0 8.2 9.6 C7.6 9.4 7.0 9.2 6.2 9.2 C3.8 9.2 1.8 11.2 1.8 13.7 C1.8 16.1 3.8 18.1 6.2 18.1 C8.3 18.1 10.0 16.7 10.5 14.8 C10.4 17.4 9.4 19.8 7.4 21.8 H16.6 C14.6 19.8 13.6 17.4 13.5 14.8 C14.0 16.7 15.7 18.1 17.8 18.1 C20.2 18.1 22.2 16.1 22.2 13.7 C22.2 11.2 20.2 9.2 17.8 9.2 C17.0 9.2 16.4 9.4 15.8 9.6 C16.2 9.0 16.4 8.2 16.4 7.3 C16.4 4.9 14.4 2.9 12 2.9 Z" fill="none" stroke="url(#ol-shine)" stroke-width="0.7"/>`,
  modeSingle: `<defs>
  <radialGradient id="mode-single-base" cx="38%" cy="28%" r="72%">
    <stop offset="0%" stop-color="#1b3d2d"/>
    <stop offset="58%" stop-color="#0d2418"/>
    <stop offset="100%" stop-color="#06110c"/>
  </radialGradient>
  <linearGradient id="mode-single-ring" x1="18%" y1="6%" x2="82%" y2="94%">
    <stop offset="0%" stop-color="#f0d392"/>
    <stop offset="36%" stop-color="#9a7943"/>
    <stop offset="65%" stop-color="#4e3a20"/>
    <stop offset="100%" stop-color="#c7a15d"/>
  </linearGradient>
  <linearGradient id="mode-single-gem" x1="30%" y1="10%" x2="72%" y2="92%">
    <stop offset="0%" stop-color="#a4c1d0"/>
    <stop offset="45%" stop-color="#5a7f9b"/>
    <stop offset="100%" stop-color="#1c3b54"/>
  </linearGradient>
  <radialGradient id="mode-single-glass" cx="34%" cy="20%" r="76%">
    <stop offset="0%" stop-color="rgba(255,255,255,.12)"/>
    <stop offset="42%" stop-color="rgba(180,215,220,.045)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
  </radialGradient>
  <filter id="mode-single-shadow" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy=".55" stdDeviation=".35" flood-color="#020806" flood-opacity=".62"/>
  </filter>
</defs>
<g class="home-mode-badge">
  <circle cx="12" cy="11.15" r="9.4" fill="url(#mode-single-base)"/>
  <circle cx="12" cy="11.15" r="9.05" fill="none" stroke="url(#mode-single-ring)" stroke-width=".72"/>
  <circle cx="12" cy="11.15" r="7.95" fill="rgba(3,18,13,.28)" stroke="rgba(250,225,160,.12)" stroke-width=".32"/>
  <path d="M12 5.1C9.6 7.55 7.45 9.3 7.45 11.6c0 1.56 1.16 2.7 2.62 2.7.78 0 1.43-.32 1.83-.84-.17 1.14-.7 2.04-1.6 2.8h3.6c-.9-.76-1.43-1.66-1.6-2.8.4.52 1.05.84 1.83.84 1.46 0 2.62-1.14 2.62-2.7 0-2.3-2.15-4.05-4.75-6.5Z" fill="url(#mode-single-gem)" stroke="rgba(190,210,218,.45)" stroke-width=".34" filter="url(#mode-single-shadow)"/>
  <path d="M9.32 9.34C9.72 8.82 10.18 8.48 10.68 8.3" fill="none" stroke="rgba(255,255,245,.34)" stroke-width=".24" stroke-linecap="round"/>
  <circle cx="12" cy="11.15" r="7.95" fill="url(#mode-single-glass)" stroke="rgba(250,225,160,.16)" stroke-width=".26"/>
</g>`,
  modeTable: `<defs>
  <radialGradient id="mode-table-base" cx="38%" cy="28%" r="72%">
    <stop offset="0%" stop-color="#1b3d2d"/>
    <stop offset="58%" stop-color="#0d2418"/>
    <stop offset="100%" stop-color="#06110c"/>
  </radialGradient>
  <linearGradient id="mode-table-ring" x1="18%" y1="6%" x2="82%" y2="94%">
    <stop offset="0%" stop-color="#efd08d"/>
    <stop offset="38%" stop-color="#967541"/>
    <stop offset="66%" stop-color="#4b351e"/>
    <stop offset="100%" stop-color="#c69b55"/>
  </linearGradient>
  <linearGradient id="mode-table-gem" x1="30%" y1="8%" x2="72%" y2="94%">
    <stop offset="0%" stop-color="#cb8d84"/>
    <stop offset="46%" stop-color="#98404d"/>
    <stop offset="100%" stop-color="#451720"/>
  </linearGradient>
  <radialGradient id="mode-table-glass" cx="34%" cy="20%" r="76%">
    <stop offset="0%" stop-color="rgba(255,255,255,.12)"/>
    <stop offset="42%" stop-color="rgba(230,190,190,.043)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
  </radialGradient>
  <filter id="mode-table-shadow" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy=".55" stdDeviation=".35" flood-color="#020806" flood-opacity=".62"/>
  </filter>
</defs>
<g class="home-mode-badge">
  <circle cx="12" cy="11.15" r="9.4" fill="url(#mode-table-base)"/>
  <circle cx="12" cy="11.15" r="9.05" fill="none" stroke="url(#mode-table-ring)" stroke-width=".72"/>
  <circle cx="12" cy="11.15" r="7.95" fill="rgba(3,18,13,.28)" stroke="rgba(250,225,160,.12)" stroke-width=".32"/>
  <path d="M12 16.9C9.05 14.22 7 12.35 7 9.96A2.55 2.55 0 0 1 9.58 7.35c1.12 0 1.9.58 2.42 1.28.52-.7 1.3-1.28 2.42-1.28A2.55 2.55 0 0 1 17 9.96c0 2.39-2.05 4.26-5 6.94Z" fill="url(#mode-table-gem)" stroke="rgba(226,166,158,.44)" stroke-width=".34" filter="url(#mode-table-shadow)"/>
  <path d="M9.1 9.56C9.52 9.16 10.1 9.18 10.48 9.5" fill="none" stroke="rgba(255,245,235,.34)" stroke-width=".24" stroke-linecap="round"/>
  <circle cx="12" cy="11.15" r="7.95" fill="url(#mode-table-glass)" stroke="rgba(250,225,160,.16)" stroke-width=".26"/>
</g>`,
  modeAi: `<defs>
  <radialGradient id="mode-ai-base" cx="38%" cy="28%" r="72%">
    <stop offset="0%" stop-color="#1b3d2d"/>
    <stop offset="58%" stop-color="#0d2418"/>
    <stop offset="100%" stop-color="#06110c"/>
  </radialGradient>
  <linearGradient id="mode-ai-ring" x1="18%" y1="6%" x2="82%" y2="94%">
    <stop offset="0%" stop-color="#f2d896"/>
    <stop offset="38%" stop-color="#987642"/>
    <stop offset="66%" stop-color="#49351d"/>
    <stop offset="100%" stop-color="#c49a55"/>
  </linearGradient>
  <linearGradient id="mode-ai-gem" x1="28%" y1="8%" x2="72%" y2="94%">
    <stop offset="0%" stop-color="#d9bf72"/>
    <stop offset="48%" stop-color="#997839"/>
    <stop offset="100%" stop-color="#442d12"/>
  </linearGradient>
  <linearGradient id="mode-ai-glass" x1="28%" y1="8%" x2="72%" y2="94%">
    <stop offset="0%" stop-color="rgba(255,255,255,.105)"/>
    <stop offset="44%" stop-color="rgba(240,220,170,.038)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
  </linearGradient>
  <filter id="mode-ai-shadow" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy=".55" stdDeviation=".35" flood-color="#020806" flood-opacity=".62"/>
  </filter>
</defs>
<g class="home-mode-badge">
  <path d="M12 1.95 21.2 11.15 12 20.35 2.8 11.15Z" fill="url(#mode-ai-base)"/>
  <path d="M12 2.55 20.6 11.15 12 19.75 3.4 11.15Z" fill="none" stroke="url(#mode-ai-ring)" stroke-width=".72" stroke-linejoin="miter"/>
  <path d="M12 3.75 19.4 11.15 12 18.55 4.6 11.15Z" fill="rgba(3,18,13,.24)" stroke="rgba(250,225,160,.12)" stroke-width=".32" stroke-linejoin="miter"/>
  <path d="M12 5.45 16.05 11.15 12 16.95 7.95 11.15Z" fill="url(#mode-ai-gem)" stroke="rgba(236,216,154,.48)" stroke-width=".34" stroke-linejoin="miter" filter="url(#mode-ai-shadow)"/>
  <path d="M10.78 10.62 11.62 9.38" fill="none" stroke="rgba(255,250,220,.34)" stroke-width=".24" stroke-linecap="round"/>
  <path d="M12 3.75 19.4 11.15 12 18.55 4.6 11.15Z" fill="url(#mode-ai-glass)" stroke="rgba(250,225,160,.15)" stroke-width=".24" stroke-linejoin="miter"/>
</g>`,
  modeOnline: `<defs>
  <radialGradient id="mode-online-base" cx="38%" cy="28%" r="72%">
    <stop offset="0%" stop-color="#1b3d2d"/>
    <stop offset="58%" stop-color="#0d2418"/>
    <stop offset="100%" stop-color="#06110c"/>
  </radialGradient>
  <linearGradient id="mode-online-ring" x1="18%" y1="6%" x2="82%" y2="94%">
    <stop offset="0%" stop-color="#efd08d"/>
    <stop offset="38%" stop-color="#967541"/>
    <stop offset="66%" stop-color="#4b351e"/>
    <stop offset="100%" stop-color="#c69b55"/>
  </linearGradient>
  <linearGradient id="mode-online-gem" x1="30%" y1="8%" x2="72%" y2="94%">
    <stop offset="0%" stop-color="#94c49d"/>
    <stop offset="46%" stop-color="#4e895f"/>
    <stop offset="100%" stop-color="#173c26"/>
  </linearGradient>
  <radialGradient id="mode-online-glass" cx="34%" cy="20%" r="76%">
    <stop offset="0%" stop-color="rgba(255,255,255,.12)"/>
    <stop offset="42%" stop-color="rgba(200,235,205,.042)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
  </radialGradient>
  <filter id="mode-online-shadow" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy=".55" stdDeviation=".35" flood-color="#020806" flood-opacity=".62"/>
  </filter>
</defs>
<g class="home-mode-badge">
  <circle cx="12" cy="11.15" r="9.4" fill="url(#mode-online-base)"/>
  <circle cx="12" cy="11.15" r="9.05" fill="none" stroke="url(#mode-online-ring)" stroke-width=".72"/>
  <circle cx="12" cy="11.15" r="7.95" fill="rgba(3,18,13,.28)" stroke="rgba(250,225,160,.12)" stroke-width=".32"/>
  <path d="M12 5.4c-1.52 0-2.78 1.27-2.78 2.78 0 .55.14 1.06.38 1.45-.38-.14-.78-.25-1.3-.25-1.55 0-2.82 1.28-2.82 2.86 0 1.52 1.27 2.8 2.82 2.8 1.32 0 2.4-.89 2.72-2.06-.07 1.65-.7 3.14-1.97 4.4h5.9c-1.27-1.26-1.9-2.75-1.97-4.4.32 1.17 1.4 2.06 2.72 2.06 1.55 0 2.82-1.28 2.82-2.8 0-1.58-1.27-2.86-2.82-2.86-.52 0-.92.11-1.3.25.24-.39.38-.9.38-1.45C14.78 6.67 13.52 5.4 12 5.4Z" fill="url(#mode-online-gem)" stroke="rgba(166,210,172,.42)" stroke-width=".34" filter="url(#mode-online-shadow)"/>
  <path d="M10.36 8.06C10.76 7.72 11.3 7.68 11.72 7.88" fill="none" stroke="rgba(245,255,238,.34)" stroke-width=".24" stroke-linecap="round"/>
  <circle cx="12" cy="11.15" r="7.95" fill="url(#mode-online-glass)" stroke="rgba(250,225,160,.16)" stroke-width=".26"/>
</g>`,
  easy: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2 a10 10 0 1 0 0 20 a10 10 0 1 0 0 -20 z M12 6 a6 6 0 1 1 0 12 a6 6 0 1 1 0 -12 z"/>',
  normal: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2 a10 10 0 1 0 0 20 a10 10 0 1 0 0 -20 z M12 4.5 a7.5 7.5 0 1 1 0 15 a7.5 7.5 0 1 1 0 -15 z M12 8 a4 4 0 1 1 0 8 a4 4 0 1 1 0 -8 z"/>',
  hard: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2 a10 10 0 1 0 0 20 a10 10 0 1 0 0 -20 z M12 6 a6 6 0 1 1 0 12 a6 6 0 1 1 0 -12 z"/><path fill="currentColor" stroke="none" d="M12 7.5 l3 4.5 l-3 4.5 l-3 -4.5 z"/>',
  aiEasy: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2 a10 10 0 1 0 0 20 a10 10 0 1 0 0 -20 z M12 6 a6 6 0 1 1 0 12 a6 6 0 1 1 0 -12 z"/>',
  aiMedium: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2 a10 10 0 1 0 0 20 a10 10 0 1 0 0 -20 z M12 4.5 a7.5 7.5 0 1 1 0 15 a7.5 7.5 0 1 1 0 -15 z M12 8 a4 4 0 1 1 0 8 a4 4 0 1 1 0 -8 z"/>',
  aiHard: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2 a10 10 0 1 0 0 20 a10 10 0 1 0 0 -20 z M12 6 a6 6 0 1 1 0 12 a6 6 0 1 1 0 -12 z"/><path fill="currentColor" stroke="none" d="M12 7.5 l3 4.5 l-3 4.5 l-3 -4.5 z"/>',
  seats2: '<g fill="currentColor" stroke="none"><circle cx="12" cy="5" r="3"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="3"/></g>',
  seats3: '<g fill="currentColor" stroke="none"><circle cx="12" cy="4" r="2.8"/><circle cx="5" cy="17" r="2.8"/><circle cx="19" cy="17" r="2.8"/><circle cx="12" cy="12" r="1.5"/></g>',
  seats4: '<g fill="currentColor" stroke="none"><circle cx="6" cy="5" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><circle cx="12" cy="11" r="1.5"/></g>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 4"/><path d="M17 6h3a3 3 0 0 1-3 4"/>',
  handshake: '<path d="M6 13c1-3 4-3 6 1M5 10l3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 13c-1-3-4-3-6 1M19 10l-3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 16l2-2 2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  playAgain: '<path d="M4 12a8 8 0 1 0 2.35-5.66"/><path d="M4 4v5h5"/><path d="M10 9l6 3-6 3V9Z"/>',
  wait: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  crown: '<path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8Z"/><path d="M5 21h14"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M6 21a6 6 0 0 1 12 0"/>',
  onlineOn: '<circle cx="12" cy="12" r="8"/><path d="M8 12l2.5 2.5L16 9"/>',
  onlineOff: '<path d="M3 3l18 18"/><path d="M8.5 5.1A8 8 0 0 1 19 15.5"/><path d="M14.5 19A8 8 0 0 1 5 9.5"/><path d="M9.5 9.5 12 12"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
  close: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.3 6.7 19.1l1-5.8-4.2-4.1 5.9-.9L12 3Z"/>',
  sparkle: '<path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>',
  lang: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><ellipse cx="12" cy="12" rx="4" ry="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 12h16M12 4v16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgIcon(name, extraClass, label) {
  const iconName = EQ21_ICON_PATHS[name] ? name : "card";
  const cls = extraClass ? " " + String(extraClass).trim() : "";
  const a11y = label ? 'role="img" aria-label="' + escapeHtml(label) + '"' : 'aria-hidden="true"';
  const content = EQ21_ICON_PATHS[iconName];
  if (content.indexOf('<defs') >= 0) {
    return '<svg class="svg-icon mode-icon-svg' + cls + '" ' + a11y + ' viewBox="0 0 24 24">' + content + '</svg>';
  }
  return '<svg class="svg-icon' + cls + '" ' + a11y + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + content + '</svg>';
}

function setSvgIcon(el, name, label, extraClass) {
  if (!el) return;
  el.innerHTML = svgIcon(name, extraClass || "", label);
}

function initSvgIcons(root) {
  const scope = root || document;
  if (!scope || typeof scope.querySelectorAll !== "function") return;
  scope.querySelectorAll("[data-icon]").forEach(function(el) {
    const name = el.getAttribute("data-icon");
    const label = el.getAttribute("data-icon-label") || "";
    const extraClass = el.getAttribute("data-icon-class") || "";
    setSvgIcon(el, name, label, extraClass);
  });
}

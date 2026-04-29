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
  single: '<path fill="currentColor" stroke="none" d="M12 2.4C8.1 6.5 4.7 9.2 4.7 12.8c0 2.45 1.82 4.25 4.12 4.25 1.23 0 2.25-.5 2.88-1.32-.26 1.8-1.1 3.23-2.52 4.42h5.64c-1.42-1.19-2.26-2.62-2.52-4.42.63.82 1.65 1.32 2.88 1.32 2.3 0 4.12-1.8 4.12-4.25 0-3.6-3.4-6.3-7.3-10.4Z"/>',
  table: '<path fill="currentColor" stroke="none" d="M12 20.5C7.35 16.35 4.1 13.45 4.1 9.75A4.05 4.05 0 0 1 8.2 5.6c1.78 0 3.05.92 3.8 2.02.75-1.1 2.02-2.02 3.8-2.02a4.05 4.05 0 0 1 4.1 4.15c0 3.7-3.25 6.6-7.9 10.75Z"/>',
  ai: '<path fill="currentColor" stroke="none" d="M12 2.6 19.35 12 12 21.4 4.65 12 12 2.6Z"/>',
  online: '<path fill="currentColor" stroke="none" d="M12 2.9 C9.6 2.9 7.6 4.9 7.6 7.3 C7.6 8.2 7.8 9.0 8.2 9.6 C7.6 9.4 7.0 9.2 6.2 9.2 C3.8 9.2 1.8 11.2 1.8 13.7 C1.8 16.1 3.8 18.1 6.2 18.1 C8.3 18.1 10.0 16.7 10.5 14.8 C10.4 17.4 9.4 19.8 7.4 21.8 H16.6 C14.6 19.8 13.6 17.4 13.5 14.8 C14.0 16.7 15.7 18.1 17.8 18.1 C20.2 18.1 22.2 16.1 22.2 13.7 C22.2 11.2 20.2 9.2 17.8 9.2 C17.0 9.2 16.4 9.4 15.8 9.6 C16.2 9.0 16.4 8.2 16.4 7.3 C16.4 4.9 14.4 2.9 12 2.9 Z"/>',
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
  handshake: '<path d="M7 12l3-3 4 4 3-3"/><path d="M3 10l4-4 3 3"/><path d="M21 10l-4-4-3 3"/><path d="M9 15l2 2a2 2 0 0 0 3 0l2-2"/>',
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
  sparkle: '<path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>'
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
  return '<svg class="svg-icon' + cls + '" ' + a11y + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + EQ21_ICON_PATHS[iconName] + '</svg>';
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

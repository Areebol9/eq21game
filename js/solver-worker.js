"use strict";

importScripts('config.js', 'expression.js');

self.onmessage = function(e) {
  const msg = e.data || {};
  try {
    game.difficulty = msg.difficulty || 'easy';
    const detailed = solveHandDetailed(msg.hand || [], msg.target || 21, getBinaryOps(), {
      maxMs: msg.maxMs || 1600
    });
    self.postMessage({
      id: msg.id,
      handKey: msg.handKey,
      simpleSolutions: detailed.simpleSolutions,
      coolSolutions: detailed.coolSolutions,
      timedOut: detailed.timedOut
    });
  } catch (err) {
    self.postMessage({
      id: msg.id,
      handKey: msg.handKey,
      simpleSolutions: [],
      coolSolutions: [],
      timedOut: true,
      error: err && err.message ? err.message : String(err)
    });
  }
};

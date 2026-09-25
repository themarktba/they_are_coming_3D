import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import './style.css';
import { Game } from './game.js';

async function boot() {
  try { await document.fonts.load('20px "Press Start 2P"'); } catch { /* fonts optional */ }
  window.game = new Game();
  document.getElementById('loading').remove();
}
boot();

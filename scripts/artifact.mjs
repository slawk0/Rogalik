// Wraps dist/index.html into a page body for publishing as a claude.ai Artifact.
// Usage: node scripts/artifact.mjs <out.html>
import { readFileSync, writeFileSync } from 'fs';
const out = process.argv[2] ?? 'dist/artifact.html';
const html = readFileSync('dist/index.html', 'utf8');
const script = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/)[1];
const page = `<title>Nawia</title>
<style>
  :root { color-scheme: dark; --bg: #181425; background: var(--bg); }
  html, body { height: 100%; margin: 0; background: var(--bg); overflow: hidden; }
  html, body, canvas { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; overscroll-behavior: none; }
  body { display: flex; align-items: center; justify-content: center; }
  canvas { image-rendering: pixelated; image-rendering: crisp-edges; display: block; cursor: none; outline: none; }
</style>
<canvas id="screen" tabindex="0" aria-label="Nawia: turowy rogalik na heksach"></canvas>
<script type="module">${script}</script>
`;
writeFileSync(out, page);
console.log('wrote', out, page.length, 'bytes');

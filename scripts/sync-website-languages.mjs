// Keep static marketing claims tied to the same catalog as the live studio.
import { readFile, writeFile } from 'node:fs/promises';
import { captionLanguages } from '../public/languages.js';
const path = new URL('../website/dist/index.html', import.meta.url);
const html = await readFile(path, 'utf8');
const names = captionLanguages.map(item => item.name).join(', ');
const list = captionLanguages.map(item => `<li>${item.name}${item.code === 'en' ? '' : ` · <bdi lang="${item.tag}">${item.native}</bdi>`}</li>`).join('');
const details = `<details class="language-support"><summary title="${names}">Supports ${captionLanguages.length} languages <span aria-hidden="true">＋</span></summary><div class="language-list"><ul>${list}</ul><p>English speech. ${captionLanguages.length - 1} translation languages. AI translation quality varies; the demo shows three examples.</p></div></details>`;
const updated = html.replace(/English speech captions plus \d+ translation languages/, `English speech captions plus ${captionLanguages.length - 1} translation languages`).replace(/<details class="language-support">[\s\S]*?<\/details>/, details);
if (process.argv.includes('--check')) {
  if (updated !== html) throw new Error('Website language list is stale. Run node scripts/sync-website-languages.mjs.');
} else await writeFile(path, updated);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captionFonts, fontStyle, sanitizeFontName } from '../public/fonts.js';
import { sanitizeDesign, migrateTracks } from '../public/track-model.js';

test('font catalog is usable offline with corresponding distribution licenses', async () => {
  assert.equal(captionFonts.length,24);
  for(const font of captionFonts.filter(f=>f.file)) {
    const data=await readFile(new URL(`../public${font.file}`,import.meta.url)); assert.ok(data.length>1000);
    const license=font.id==='permanent-marker'||font.id==='roboto-slab'?'LICENSE':'OFL';
    assert.match(await readFile(new URL(`../public/fonts/${font.id}-${license}.txt`,import.meta.url),'utf8'),/SIL OPEN FONT LICENSE|Apache License/);
  }
});
test('brand fonts survive track migration and unsafe custom font names are rejected',()=>{
  const design=sanitizeDesign({font:'bungee',color:'#ff0088'});
  assert.equal(design.font,'bungee');assert.match(fontStyle(design).family,/AuraMax-bungee/);
  const tracks=migrateTracks({tracks:{primary:{design},secondary:{enabled:true,design:{font:'lora'}}}});
  assert.equal(tracks.primary.design.font,'bungee');assert.equal(tracks.secondary.design.font,'lora');
  assert.equal(sanitizeDesign({font:'unknown'},design).font,'bungee');
  assert.equal(sanitizeFontName('DIN Next LT Pro'),'DIN Next LT Pro');
  assert.equal(sanitizeFontName('x";background:url(https://example.com)'),'');
  assert.equal(sanitizeFontName('x\nArial'),'');
  assert.equal(sanitizeFontName('x'.repeat(81)),'');
  assert.match(fontStyle(sanitizeDesign({font:'custom',customFont:'DIN Next LT Pro'})).family,/"DIN Next LT Pro"/);
});

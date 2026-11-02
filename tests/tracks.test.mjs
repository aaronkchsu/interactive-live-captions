import test from 'node:test';
import assert from 'node:assert/strict';
import { inputPlan, migrateTracks, addonDefaults } from '../public/track-model.js';
import { sanitizeSettings, parseCommand } from '../src/state.mjs';
import { StreamSession } from '../src/session.mjs';
const flush = () => new Promise(r => setImmediate(r));
function fixture(provider = {}) {
  let now = 10000;
  const session = new StreamSession({ streamerId: 'test', provider: { translate: async (_c,t,l) => `${l}:${t}`, commentary: async () => null, ...provider }, now: () => now });
  session.available.openai = true;
  const context = session.begin('live');
  return { session, advance(ms) { now += ms; }, speech(id=0) { session.acceptSpeech({ ...context, segmentId: `s${id}`, sequence: id, revision: 1, final: true, text: `speech ${id}` }); } };
}
test('subtitles request only speech; commentary and disabled secondary inputs are independent', () => {
  let settings = sanitizeSettings({});
  assert.deepEqual(inputPlan(settings), { microphone: true, speech: true, audio: false, camera: false, chat: false, commentary: false, languages: [] });
  settings = sanitizeSettings({ tracks: { secondary: { mode: 'commentary', inputs: { camera: true } } } }, settings);
  assert.equal(inputPlan(settings).camera, false);
  settings = sanitizeSettings({ tracks: { primary: { mode: 'commentary', inputs: { mic: false, camera: false, chat: true } } } }, settings);
  assert.equal(inputPlan(settings).microphone, false); assert.equal(inputPlan(settings).chat, true);
});
test('legacy bilingual settings migrate, while mode changes preserve each track design', () => {
  const tracks = migrateTracks({ display: 'both', language: 'tr', style: 'comic', preset: 'captions' });
  assert.equal(tracks.secondary.enabled, true); assert.equal(tracks.secondary.language, 'tr');
  let s = sanitizeSettings({ tracks });
  const before = structuredClone(s.tracks.primary.design);
  s = sanitizeSettings({ tracks: { primary: { mode: 'commentary', language: 'sk' } } }, s);
  assert.deepEqual(s.tracks.primary.design, before); assert.equal(s.tracks.secondary.language, 'tr');
});
test('two subtitle languages share one request per unique language and never mix output', async () => {
  const calls = []; const f = fixture({ translate: async (_c,text,language) => { calls.push(language); return language + text; } });
  f.session.setSettings({ tracks: { primary: { language: 'zh' }, secondary: { enabled: true, language: 'zh' } } });
  f.speech(); await flush(); assert.deepEqual(calls, ['zh']);
  assert.equal(f.session.overlay().tracks[0].text, 'zhspeech 0'); assert.equal(f.session.overlay().tracks[1].text, 'zhspeech 0');
  f.session.setSettings({ tracks: { secondary: { language: 'ko' } } }); await flush();
  assert.deepEqual(f.session.overlay().tracks.map(t=>t.text), ['zhspeech 0','kospeech 0']);
});
test('commentary does not translate unused speech and ignores one-person chat spam', async () => {
  let calls = 0, translations = 0;
  const f = fixture({ translate: async () => { translations++; }, commentary: async () => { calls++; return null; } });
  f.session.setSettings({ tracks: { primary: { mode: 'commentary', inputs: { mic: false, chat: true } } } }); f.session.chat.connected = true;
  for(let i=0;i<10;i++) f.session.chat.add({ id:String(i), author:'one', text:'message '+i });
  f.session.tick(); await flush(); assert.equal(calls,0); assert.equal(translations,0);
  f.session.chat.add({id:'b',author:'two',text:'new theme'}); f.session.chat.add({id:'c',author:'three',text:'another theme'});
  f.session.tick(); await flush(); assert.equal(calls,1);
});
test('disabling commentary rejects late results; source toggles filter provider evidence', async () => {
  let resolve, evidence;
  const f = fixture({ commentary: (_c,input) => { evidence=input; return new Promise(r=>resolve=r); } });
  f.session.setSettings({ tracks: { primary: { mode:'commentary', inputs:{mic:true,chat:false,camera:false} } } });
  f.session.trackRuntime.observe({text:'standing'},'camera',10000,'vision');
  f.speech(); f.session.tick(); await flush(); assert.equal(evidence.observations.length,0); assert.equal(evidence.messages.length,0);
  f.session.setSettings({tracks:{primary:{mode:'subtitles'}}}); resolve({text:'late joke',evidence:['s0']}); await flush();
  assert.equal(f.session.overlay().tracks[0].text,'speech 0');
});
test('viewer add-ons enforce opt-in, target selection, cooldown, persistence and restoration', () => {
  const f = fixture(); const action = (id,value) => f.session.action({id,kind:'addon',value,moderator:false,origin:'twitch'});
  assert.equal(action('1','roast').applied,false);
  assert.equal(action('2','red').applied,true); assert.equal(f.session.settings().tracks.primary.design.accent,'#ff3838');
  assert.equal(action('3','commentary').applied,false);
  f.advance(20001); f.session.tick(); assert.equal(f.session.settings().tracks.primary.design.accent,'#f4e83d');
  f.session.setSettings({addons:addonDefaults.map(a=>a.id==='commentary'?{...a,persistent:true}:a)});
  assert.equal(action('4','commentary').persisted,true); assert.equal(f.session.base.tracks.primary.mode,'commentary');
  f.advance(30000); f.session.tick(); assert.equal(f.session.settings().tracks.primary.mode,'commentary');
  assert.equal(action('4','commentary').applied,false);
});
test('language add-on cancels obsolete requests and restores the prior language generation', async () => {
  const requests = []; const f = fixture({translate: (_c,_t,language)=>new Promise(resolve=>requests.push({language,resolve}))});
  f.session.setSettings({tracks:{primary:{language:'zh'}},addons:[{id:'french',name:'French',kind:'language',value:'fr',target:'primary',enabled:true,duration:5}]});
  f.speech(); await flush(); f.session.action({id:'f',kind:'addon',value:'french',moderator:false,origin:'twitch'}); await flush();
  requests[0].resolve('obsolete'); await flush(); assert.equal(f.session.overlay().tracks[0].text,'');
  requests[1].resolve('bonjour'); await flush(); assert.equal(f.session.overlay().tracks[0].text,'bonjour');
  f.advance(5001); f.session.tick(); await flush(); assert.equal(f.session.settings().tracks.primary.language,'zh'); assert.equal(f.session.overlay().tracks[0].text,'');
  requests[2].resolve('你好'); await flush(); assert.equal(f.session.overlay().tracks[0].text,'你好');
});
test('freeze retains both track outputs, styles, and language until resumed', async () => {
  const f=fixture(); f.session.setSettings({tracks:{secondary:{enabled:true,language:'zh'}}}); f.speech(); await flush();
  const before=f.session.overlay().tracks; f.session.setOutput('frozen'); f.advance(1000);
  f.session.setSettings({tracks:{primary:{design:{color:'#ff0000'}},secondary:{language:'ko'}}}); f.speech(1); await flush();
  assert.deepEqual(f.session.overlay().tracks,before); f.session.setOutput('running'); assert.equal(f.session.overlay().tracks[1].language,'ko');
});

test('old viewer commands cannot bypass disabled add-ons, and moderator language changes preserve tracks', () => {
  const f = fixture();
  assert.equal(parseCommand('!mode chaos', false), null);
  assert.equal(f.session.action({id:'legacy',kind:'mode',value:'chaos',moderator:false}).applied,false);
  f.session.setSettings({tracks:{primary:{mode:'commentary',design:{color:'#ff3838'}},secondary:{enabled:true,language:'ko'}}});
  const before = structuredClone(f.session.base.tracks);
  f.session.action({id:'lang',kind:'language',value:'sk',moderator:true});
  assert.equal(f.session.base.tracks.primary.mode,'commentary');
  assert.deepEqual(f.session.base.tracks.primary.design,before.primary.design);
  assert.deepEqual(f.session.base.tracks.secondary,before.secondary);
  assert.equal(f.session.base.tracks.primary.language,'sk');
});

test('English stays paired with the visible translation while newer speech waits', async () => {
  const jobs=[]; const f=fixture({translate:()=>new Promise(resolve=>jobs.push(resolve))});
  f.session.setSettings({display:'source',tracks:{primary:{language:'en'},secondary:{enabled:true,mode:'subtitles',language:'zh'}}});
  f.speech(0); await flush(); jobs[0]('零'); await flush();
  f.speech(1); await flush();
  assert.deepEqual(f.session.overlay().tracks.map(t=>t.text),['speech 0','零']);
  jobs[1]('一'); await flush(); assert.deepEqual(f.session.overlay().tracks.map(t=>t.text),['speech 1','一']);
});

test('late older translations remain in history and never replace a newer translated phrase',async()=>{
  const requests=[];const f=fixture({translate:()=>new Promise(resolve=>requests.push(resolve))});
  f.session.setSettings({tracks:{secondary:{enabled:true,language:'zh'}}});
  f.speech(0);await flush();f.advance(100);f.speech(1);await flush();
  requests[1]('new translation');await flush();f.advance(1000);
  requests[0]('old translation');await flush();
  assert.equal(f.session.overlay().tracks[1].text,'new translation');
  f.advance(4100);
  assert.equal(f.session.overlay().tracks[1].text,'');
  assert.equal(f.session.snapshot().transcript[0].translations.zh.text,'old translation');
  f.session.close();
});
test('English advances after the previous translated pair expires even when the next translation fails',async()=>{
  const requests=[];const f=fixture({translate:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))});
  f.session.setSettings({tracks:{secondary:{enabled:true,language:'zh'}}});
  f.speech(0);await flush();requests[0].resolve('first translation');await flush();
  f.advance(4000);f.speech(1);await flush();requests[1].reject(new Error('Provider unavailable'));await flush();
  assert.equal(f.session.overlay().tracks[0].text,'speech 0');
  f.advance(1100);assert.equal(f.session.overlay().tracks[0].text,'speech 1');
  assert.equal(f.session.overlay().tracks[1].text,'');f.session.close();
});

test('moderator deletion cancels pending commentary and clearing chat removes visible commentary',async()=>{
  const requests=[];const f=fixture({commentary:()=>new Promise(resolve=>requests.push(resolve))});
  f.session.setSettings({tracks:{primary:{mode:'commentary',inputs:{mic:false,chat:true,camera:false}}}});f.session.chat.connected=true;
  for(let i=0;i<3;i++)f.session.chat.add({id:'m'+i,author:'viewer'+i,text:'idea '+i});
  f.session.tick();await flush();assert.equal(requests.length,1);
  f.session.removeChat('m0');requests[0]({text:'Removed message summary',evidence:['m0','m1','m2']});await flush();
  assert.equal(f.session.overlay().tracks[0].text,'');
  f.session.chat.add({id:'m3',author:'viewer3',text:'new idea'});f.session.tick();await flush();
  requests[1]({text:'Fresh summary',evidence:['m1','m2','m3']});await flush();
  assert.equal(f.session.overlay().tracks[0].text,'Fresh summary');
  f.session.removeChat();assert.equal(f.session.overlay().tracks[0].text,'');assert.equal(f.session.chat.messages.length,0);
  assert.equal(f.session.chat.connected,true);f.session.close();
});

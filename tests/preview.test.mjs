import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchAdapter } from '../src/twitch.mjs';
import { CredentialProvider, MemoryStorage } from '../src/storage.mjs';
async function previewAdapter(responses) {
  const credentials = new CredentialProvider(new MemoryStorage());
  await credentials.update({streamerId:'alice'}, {twitchToken:'private',twitchClientId:'client'});
  const calls=[];
  const adapter=new TwitchAdapter({context:{streamerId:'alice'},credentials,fetcher:async url=>{
    calls.push(url); const key=url.includes('/validate')?'validate':new URL(url).pathname.split('/').at(-1);
    return {ok:true,json:async()=>key==='validate'?{client_id:'client',user_id:'1',login:'alice',scopes:['user:read:chat']}:responses[key]};
  }});
  return {adapter,calls};
}
test('live preview uses the authorized channel and returns only public image metadata',async()=>{
 const {adapter,calls}=await previewAdapter({streams:{data:[{title:'Live',thumbnail_url:'https://static-cdn.jtvnw.net/previews/{width}x{height}.jpg'}]}});
 const result=await adapter.preview();assert.equal(result.status,'live');assert.equal(result.channel,'alice');assert.match(result.image,/1280x720/);assert.ok(!JSON.stringify(result).includes('private'));assert.equal(calls.length,2);
});
test('offline preview distinguishes a saved broadcast from no available stream',async()=>{
 const {adapter}=await previewAdapter({streams:{data:[]},videos:{data:[{title:'Yesterday',created_at:'2026-10-31',thumbnail_url:'https://static-cdn.jtvnw.net/vod/%{width}x%{height}.jpg'}]}});
 assert.equal((await adapter.preview()).status,'recorded');
 const {adapter:empty}=await previewAdapter({streams:{data:[]},videos:{data:[]}});const result=await empty.preview();assert.equal(result.status,'offline');assert.equal(result.image,'');
});
test('channel lookup validates names and rejects unexpected thumbnail hosts',async()=>{
 const {adapter,calls}=await previewAdapter({users:{data:[{id:'2',login:'bob'}]},streams:{data:[{title:'Stream',thumbnail_url:'https://unexpected.example/picture.jpg'}]}});
 await assert.rejects(adapter.preview('https://twitch.tv/bob'),/channel name/);assert.equal(calls.length,0);
 const result=await adapter.preview('bob');assert.equal(result.channel,'bob');assert.equal(result.image,'');assert.ok(calls.some(url=>url.endsWith('streams?user_id=2')));
});

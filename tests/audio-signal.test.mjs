import test from 'node:test';
import assert from 'node:assert/strict';
import {hasAudibleAudio} from '../src/audio-signal.mjs';
import {OpenAIProvider} from '../src/providers.mjs';
import {encodeWav} from '../public/microphone.js';

test('silent and near-silent microphone windows produce no cue and no paid request',async()=>{
  const provider=new OpenAIProvider({credentials:{get:async()=>assert.fail('Silent audio must not look up a key')},fetcher:async()=>assert.fail('Silent audio must not reach the model')});
  for(const amplitude of [0,0.00001,0.0005]){
    const wav=encodeWav(Float32Array.from({length:72000},(_,i)=>amplitude*Math.sin(i/10)),24000);
    assert.equal(hasAudibleAudio(wav),false);
    assert.equal(await provider.audio({streamerId:'test'},wav,'en'),null);
  }
});
test('audible PCM passes the signal gate while malformed or truncated input is rejected',()=>{
  const wav=encodeWav(Float32Array.from({length:72000},(_,i)=>0.08*Math.sin(i/10)),24000);
  assert.equal(hasAudibleAudio(wav),true);
  assert.throws(()=>hasAudibleAudio('AAAA'),/Invalid/);
  assert.throws(()=>hasAudibleAudio(Buffer.from(wav,'base64').subarray(0,50).toString('base64')),/Incomplete/);
});

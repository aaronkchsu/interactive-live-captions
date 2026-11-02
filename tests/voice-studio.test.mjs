import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceReadiness } from '../public/voice-studio.js';
test('voice setup explains missing prerequisites and only offers translation with a live route', () => {
 const state={available:{openai:false},baseSettings:{voiceEnabled:false},mode:'demo',microphone:{status:'idle'},voice:{output:'disconnected'}};
 assert.match(voiceReadiness(state).message,/key/);
 state.available.openai=true; assert.match(voiceReadiness(state).message,/routing/);
 state.baseSettings.voiceEnabled=true; assert.match(voiceReadiness(state).message,/live session/);
 state.mode='live';state.microphone.status='listening'; assert.equal(voiceReadiness(state).ready,false);
 state.voice.output='waiting for microphone';assert.equal(voiceReadiness(state).ready,false);
 state.voice.output='connected';assert.equal(voiceReadiness(state).ready,true);
 state.voice.output='disconnected';assert.equal(voiceReadiness(state).ready,false);
});

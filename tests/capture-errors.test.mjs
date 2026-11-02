import test from 'node:test';
import assert from 'node:assert/strict';
import {captureFailure,microphoneFailure,speechFailure} from '../public/capture-errors.js';
test('device, provider and unknown errors retain distinct recovery paths',()=>{
 for(const code of ['NotAllowedError','NotFoundError','NotReadableError','OverconstrainedError','DeviceDisconnected']) {
  const issue=captureFailure({name:code},'microphone');assert.equal(issue.code,code);assert.ok(issue.message);assert.equal(issue.step,2);
 }
 assert.equal(captureFailure(new Error('OpenAI audio connection failed (401).'),'connection').step,0);
 assert.equal(captureFailure(new Error('OpenAI audio connection failed (429).'),'connection').code,'RateLimitError');
 assert.equal(captureFailure(new TypeError('Failed to fetch'),'connection').code,'ConnectionError');
 assert.equal(microphoneFailure({error:''}).code,'UnknownError');
 assert.equal(speechFailure('not-allowed').code,'SpeechPermissionError');
});
test('error details redact credentials and URLs and remain bounded',()=>{
 const issue=captureFailure(new Error('Bearer very-private sk-secret_value access_token=private https://example.com/?token=private '+'x'.repeat(500)));
 assert.ok(!issue.detail.includes('private'));assert.ok(!issue.detail.includes('secret_value'));assert.ok(issue.detail.length<=240);
});

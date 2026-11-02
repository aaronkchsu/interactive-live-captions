import test from 'node:test';
import assert from 'node:assert/strict';
import {createBroadcastAudio} from '../public/broadcast-audio.js';
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
function install(t,name,value){const previous=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true});t.after(()=>previous?Object.defineProperty(globalThis,name,previous):delete globalThis[name]);}

test('a failed OBS answer upload retries the same receiver offer instead of leaving audio stuck',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const node=()=>({gain:{value:1,cancelScheduledValues(){},setTargetAtTime(){}},connect(){return this;},disconnect(){}});
  install(t,'AudioContext',class {
    constructor(){this.state='running';this.currentTime=0;}
    createMediaStreamDestination(){return {...node(),stream:{getAudioTracks:()=>[],getTracks:()=>[]}};}
    createGain(){return node();}createMediaStreamSource(){return node();}async resume(){}async close(){this.state='closed';}
  });
  let peers=0,closed=0,answers=0;
  install(t,'RTCPeerConnection',class {
    constructor(){peers++;this.iceGatheringState='complete';}
    addTrack(){}async setRemoteDescription(){}async createAnswer(){return {type:'answer',sdp:'v=0'};}
    async setLocalDescription(value){this.localDescription=value;}close(){closed++;}
  });
  const audio=createBroadcastAudio({send:async path=>{
    if(path==='voice/signal')return {offer:{id:'same-offer',sdp:'v=0'}};
    if(path==='voice/answer'){answers++;if(answers===1)throw new Error('Transient signaling failure');return {ok:true};}
    throw new Error('Unexpected request '+path);
  }});
  t.after(()=>audio.stop());
  audio.update({baseSettings:{voiceEnabled:true}});audio.attach({},{streamerId:'test',sessionId:'s',captureId:'c'});
  await flush();assert.equal(answers,1);
  t.mock.timers.tick(1000);await flush();assert.equal(answers,2);assert.equal(peers,2);assert.ok(closed>=1);
});

test('the OBS receiver renews a stalled WebRTC handshake without waiting forever',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
  const status={textContent:''},audio={srcObject:null,async play(){}};
  install(t,'document',{querySelector:selector=>selector==='#audio'?audio:selector==='#status'?status:{addEventListener(){}},body:{classList:{toggle(){}}}});
  const events={};install(t,'window',{addEventListener:(name,fn)=>events[name]=fn});
  install(t,'navigator',{sendBeacon(){}});
  let claims=0,closed=0;
  install(t,'RTCPeerConnection',class{
    constructor(){this.iceGatheringState='complete';this.connectionState='connecting';}
    addTransceiver(){}async createOffer(){return {type:'offer',sdp:'v=0'};}async setLocalDescription(value){this.localDescription=value;}
    async setRemoteDescription(){}close(){closed++;}
  });
  install(t,'fetch',async(path,options)=>{
    assert.ok(options.signal,'Receiver HTTP requests need a timeout');
    return {ok:true,json:async()=>path.endsWith('/start')?{token:'test-'+(++claims)}:{answer:'v=0'}};
  });
  await import('../public/voice-receiver.js?release-recovery-test');
  try {
    await flush();assert.equal(claims,1);
    t.mock.timers.tick(16001);await flush();assert.equal(claims,2);assert.ok(closed>=1);
  } finally { events.beforeunload(); }
});

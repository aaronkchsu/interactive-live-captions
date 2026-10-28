class VoiceBoxBuffer extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(sampleRate * 3); this.offset = 0; }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) for (const value of channel) {
      this.buffer[this.offset++] = value;
      if (this.offset === this.buffer.length) { this.port.postMessage(this.buffer, [this.buffer.buffer]); this.buffer = new Float32Array(sampleRate * 3); this.offset = 0; }
    }
    return true;
  }
}
registerProcessor('voicebox-buffer', VoiceBoxBuffer);

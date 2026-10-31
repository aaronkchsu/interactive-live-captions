// Detect actual output samples, not merely an open WebRTC track. Runs on the
// audio thread so a backgrounded studio tab does not depend on polling timers.
class DubReadinessProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.audibleFrames = 0; this.reported = false; this.stopped = false; this.port.onmessage = ({ data }) => { if (data === 'stop') this.stopped = true; }; }
  process(inputs, outputs) {
    if (this.stopped) return false;
    const input = inputs[0] || [], output = outputs[0] || [];
    for (let channel = 0; channel < output.length; channel++) {
      const source = input[channel] || input[0];
      if (source) output[channel].set(source); else output[channel].fill(0);
    }
    if (!this.reported) {
      const frames = input[0]?.length || 0;
      let strongest = 0;
      for (const channel of input) {
        let sum = 0; for (const sample of channel) sum += sample * sample;
        strongest = Math.max(strongest, channel.length ? Math.sqrt(sum / channel.length) : 0);
      }
      // Ignore silence, very low codec noise and isolated clicks. This is an
      // audio-presence gate, not speech recognition or a semantic guarantee.
      this.audibleFrames = strongest >= .003 ? this.audibleFrames + frames : 0;
      if (this.audibleFrames >= sampleRate * .032) {
        this.reported = true;
        this.port.postMessage({ type: 'audible', onset: currentTime - this.audibleFrames / sampleRate });
      }
    }
    return true;
  }
}
registerProcessor('dub-readiness', DubReadinessProcessor);

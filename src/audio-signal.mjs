/** Reject malformed PCM and skip near-silent capture windows before paid analysis. */
export function hasAudibleAudio(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 500000) throw new Error('Invalid microphone audio window.');
  const wav = Buffer.from(encoded, 'base64');
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid microphone audio window.');
  let format, samples;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const kind = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > wav.length) throw new Error('Incomplete microphone audio window.');
    if (kind === 'fmt ' && size >= 16) format = { pcm: wav.readUInt16LE(start), channels: wav.readUInt16LE(start + 2), bits: wav.readUInt16LE(start + 14) };
    if (kind === 'data') samples = wav.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || format.pcm !== 1 || ![1, 2].includes(format.channels) || format.bits !== 16 || !samples?.length || samples.length % (2 * format.channels)) throw new Error('Unsupported microphone audio format.');
  let energy = 0, peak = 0;
  for (let offset = 0; offset < samples.length; offset += 2) {
    const value = samples.readInt16LE(offset) / 32768;
    energy += value * value; peak = Math.max(peak, Math.abs(value));
  }
  // Conservative engineering floor, not an event detector. Real sound still
  // requires provider validation; absence of signal never creates a cue.
  return peak >= 0.003 && Math.sqrt(energy / (samples.length / 2)) >= 0.001;
}

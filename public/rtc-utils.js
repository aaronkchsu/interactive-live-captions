// Local peers exchange complete offers, so no external STUN/TURN service is needed.
export function gatherIce(peer, signal) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', changed); signal?.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
    const changed = () => { if (peer.iceGatheringState === 'complete') finish(); };
    const aborted = () => finish(new DOMException('Stopped', 'AbortError'));
    const timer = setTimeout(() => finish(), 2000);
    peer.addEventListener('icegatheringstatechange', changed); signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

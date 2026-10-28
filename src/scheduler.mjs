/** Bounded work lane. Cancellation is advisory; consumers also verify job identity. */
export class WorkLane {
  constructor({ concurrency = 1, capacity = 1, maxAge = 8000, now = Date.now, onChange = () => {} } = {}) {
    this.concurrency = concurrency; this.capacity = capacity; this.maxAge = maxAge;
    this.now = now; this.onChange = onChange; this.pending = []; this.active = new Map();
    this.metrics = { completed: 0, discarded: 0, errors: 0, latency: 0 };
  }
  enqueue(job) {
    if (this.active.has(job.id) || this.pending.some(item => item.id === job.id)) return false;
    while (this.pending.length >= this.capacity) this.drop(this.pending.shift(), 'superseded');
    this.pending.push(job); this.pump(); return true;
  }
  drop(job, reason) { this.metrics.discarded++; job?.discard?.(reason); }
  pump() {
    while (this.active.size < this.concurrency && this.pending.length) {
      const job = this.pending.shift();
      if (this.now() - job.at > this.maxAge) { this.drop(job, 'expired'); continue; }
      const controller = new AbortController(); this.active.set(job.id, controller);
      const started = this.now();
      Promise.resolve().then(() => job.run(controller.signal)).then(value => {
        if (controller.signal.aborted) return;
        if (this.now() - job.at > this.maxAge) { this.drop(job, 'expired'); job.late?.(value); return; }
        this.metrics.completed++; this.metrics.latency = this.now() - started; job.done?.(value);
      }).catch(error => {
        if (!controller.signal.aborted) { this.metrics.errors++; job.error?.(error); }
      }).finally(() => { this.active.delete(job.id); this.pump(); });
    }
    this.onChange();
  }
  cancel() {
    for (const job of this.pending.splice(0)) this.drop(job, 'cancelled');
    for (const controller of this.active.values()) controller.abort();
    this.onChange();
  }
  snapshot() { return { ...this.metrics, active: this.active.size, queued: this.pending.length }; }
}

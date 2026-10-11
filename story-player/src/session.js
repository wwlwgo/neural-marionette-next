export class StorySession {
  constructor(manifest) { this.manifest = manifest; this.index = 0; this.run = null; this.handled = new Set(); }
  get invitation() { return this.index === this.manifest.bodyPages.length - 1; }
  get ending() { return this.index === this.manifest.bodyPages.length; }
  next() { if (this.index < this.manifest.bodyPages.length - 1) this.index++; }
  previous() { if (!this.ending && this.index > 0) this.index--; }
  restart() { this.index = 0; this.run = null; }
  begin(mode) {
    if (!this.invitation) throw new Error('只能从邀请页开始演出');
    this.run = { runId: crypto.randomUUID(), storyId: this.manifest.storyId,
      cueId: this.manifest.performanceCue.id, spellRef: this.manifest.spellRef, mode };
    return this.run;
  }
  accept(result) {
    const run = this.run;
    if (!run || this.handled.has(result.runId) || result.runId !== run.runId ||
      result.storyId !== run.storyId || result.cueId !== run.cueId || result.mode !== run.mode ||
      result.spellRef?.spellId !== run.spellRef.spellId || result.spellRef?.revision !== run.spellRef.revision) return false;
    if (!['completed', 'cancelled', 'failed'].includes(result.status)) return false;
    if (result.status === 'completed' && result.outcome !== this.manifest.performanceCue.expectedOutcome) return false;
    this.handled.add(result.runId);
    this.run = null;
    if (result.status === 'completed') this.index = this.manifest.bodyPages.length;
    return true;
  }
}

type Submit = (slug: string, score: number) => Promise<void>;

/** Coalesces per-event score reports into a few submissions, sending only scores higher than anything already sent. */
export function createScoreSync(submit: Submit, delayMs = 4000) {
  const sent = new Map<string, number>();
  const pending = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    const batch = [...pending];
    pending.clear();
    for (const [slug, score] of batch) {
      sent.set(slug, score);
      void submit(slug, score);
    }
  }

  function report(slug: string, score: number): void {
    const value = Math.round(score);
    if (!Number.isFinite(value) || value <= Math.max(sent.get(slug) ?? -Infinity, pending.get(slug) ?? -Infinity)) return;
    pending.set(slug, value);
    if (timer === undefined) timer = setTimeout(flush, delayMs);
  }

  return { report, flush };
}

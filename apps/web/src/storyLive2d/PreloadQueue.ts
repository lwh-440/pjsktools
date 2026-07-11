export class PreloadQueue<T> {
  constructor(private readonly tasks: Array<() => Promise<T>>, private readonly concurrency = 5) {}

  async run(signal?: AbortSignal, onProgress?: (completed: number, total: number) => void) {
    const results: Array<T | null> = Array(this.tasks.length).fill(null);
    let cursor = 0;
    let completed = 0;
    const worker = async () => {
      while (cursor < this.tasks.length) {
        if (signal?.aborted) throw new DOMException("Preload cancelled", "AbortError");
        const index = cursor++;
        try {
          results[index] = await this.tasks[index]();
        } catch {
          results[index] = null;
        }
        completed += 1;
        onProgress?.(completed, this.tasks.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, this.tasks.length) }, worker));
    return results;
  }
}

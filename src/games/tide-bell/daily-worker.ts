/** Draws today's cove off the main thread, so generating it never stalls a move or a frame. */
import { dailyLevel } from './generate';

self.onmessage = (event: MessageEvent<{ seed: number }>) => {
  (self as unknown as Worker).postMessage(dailyLevel(event.data.seed));
};

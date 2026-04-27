/**
 * Dedicated AsyncJob poller. Run when `DISABLE_ASYNC_JOB_SWEEP=1` on the web app
 * so only this process (or manual cron) drains `AsyncJob` — avoids duplicate sweep + worker.
 */
import { processPendingJobs } from "../app/lib/jobs.server";

const pollMs = Math.max(2_000, Number(process.env.ASYNC_JOB_POLL_MS) || 5_000);

async function tick(): Promise<void> {
  try {
    await processPendingJobs();
  } catch (e) {
    console.error("job-worker tick", e);
  }
}

async function main(): Promise<void> {
  console.info(`job-worker: polling every ${pollMs}ms`);
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

void main();

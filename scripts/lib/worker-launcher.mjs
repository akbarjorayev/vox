import { spawn } from 'node:child_process';

// Starts the background worker that does the actual speaking, then lets go of
// it so the command returns immediately.
export class WorkerLauncher {
  #workerPath;
  #spawnProcess;

  constructor({ workerPath, spawnProcess = spawn }) {
    this.#workerPath = workerPath;
    this.#spawnProcess = spawnProcess;
  }

  launch(job) {
    const child = this.#spawnProcess(process.execPath, [this.#workerPath], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    });
    child.stdin.end(JSON.stringify(job));
    child.unref();
  }
}

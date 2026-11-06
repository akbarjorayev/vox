import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 20_000;

// Runs a short command to completion. Rejects if it cannot start or exits non-zero.
export class ProcessRunner {
  #timeoutMs;

  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.#timeoutMs = timeoutMs;
  }

  run({ command, args = [], input = '', env = {} }) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
      });
      const timer = setTimeout(() => child.kill(), this.#timeoutMs);
      let stderr = '';

      child.stderr.on('data', (data) => (stderr += data));
      child.stdin.on('error', () => {});
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
      });
      child.stdin.end(input);
    });
  }
}

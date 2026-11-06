import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline';

// A player plays one file at a time and can pause, resume and stop it.
// play() settles with 'ended', 'stopped' or 'failed'; it never rejects.
// Every OS difference in playback lives in this file.

const LINUX_PLAYERS = [
  { name: 'mpv', playsMp3: true, args: (f) => ['--no-video', '--really-quiet', f] },
  { name: 'ffplay', playsMp3: true, args: (f) => ['-nodisp', '-autoexit', '-loglevel', 'quiet', f] },
  { name: 'mpg123', playsMp3: true, args: (f) => ['-q', f] },
  { name: 'cvlc', playsMp3: true, args: (f) => ['--play-and-exit', '--quiet', f] },
  { name: 'paplay', playsMp3: false, args: (f) => [f] },
  { name: 'aplay', playsMp3: false, args: (f) => ['-q', f] },
];

const MAC_PLAYER = { name: 'afplay', playsMp3: true, args: (f) => [f] };

// Prefers a player that can decode MP3 (the natural voice), else any player.
function findLinuxPlayer() {
  const installed = LINUX_PLAYERS.filter((p) => isOnPath(p.name));
  return installed.find((p) => p.playsMp3) ?? installed[0] ?? null;
}

// Cheap check that does not start anything.
export function canPlayAudio() {
  switch (process.platform) {
    case 'win32':
    case 'darwin':
      return true;
    default:
      return findLinuxPlayer() !== null;
  }
}

// Returns a ready player, or null when this machine has no way to play audio.
export function createPlayer() {
  switch (process.platform) {
    case 'win32':
      return new WindowsPlayer();
    case 'darwin':
      return new ProcessPlayer(MAC_PLAYER);
    default: {
      const linuxPlayer = findLinuxPlayer();
      return linuxPlayer ? new ProcessPlayer(linuxPlayer) : null;
    }
  }
}

// macOS and Linux: one short-lived process per file. Pausing suspends it.
class ProcessPlayer {
  #child = null;
  #stopping = false;

  constructor({ name, playsMp3, args }) {
    this.command = name;
    this.playsMp3 = playsMp3;
    this.args = args;
  }

  play(file) {
    return new Promise((resolve) => {
      this.#stopping = false;
      const child = spawn(this.command, this.args(file), { stdio: 'ignore' });
      this.#child = child;
      child.on('error', () => resolve('failed'));
      child.on('close', (code) => {
        this.#child = null;
        resolve(this.#stopping ? 'stopped' : code === 0 ? 'ended' : 'failed');
      });
    });
  }

  pause() {
    this.#child?.kill('SIGSTOP');
  }

  resume() {
    this.#child?.kill('SIGCONT');
  }

  stop() {
    this.#stopping = true;
    // A suspended process ignores SIGTERM until it is continued.
    this.#child?.kill('SIGCONT');
    this.#child?.kill('SIGTERM');
  }

  dispose() {
    this.stop();
  }
}

// Windows: one long-lived PowerShell process that hosts the built-in
// MediaPlayer and takes one-line commands on stdin ("play <file>", "pause",
// "resume", "stop"). It answers "ended", "stopped" or "failed" on stdout.
// Started right away so it is warm by the time the first audio is ready.
const POWERSHELL_PLAYER = `
Add-Type -AssemblyName presentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$state = 'idle'
$opened = [DateTime]::UtcNow
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$task = $reader.ReadLineAsync()
while ($true) {
  if ($task.IsCompleted) {
    $line = $task.Result
    if ($null -eq $line) { break }
    $task = $reader.ReadLineAsync()
    $parts = $line.Split(' ', 2)
    switch ($parts[0]) {
      'play'   { $player.Open([Uri]$parts[1]); $player.Play(); $state = 'playing'; $opened = [DateTime]::UtcNow }
      'pause'  { if ($state -eq 'playing') { $player.Pause(); $state = 'paused' } }
      'resume' { if ($state -eq 'paused') { $player.Play(); $state = 'playing' } }
      'stop'   { $player.Stop(); $player.Close(); $state = 'idle'; Write-Output 'stopped' }
    }
  }
  if ($state -eq 'playing') {
    if ($player.NaturalDuration.HasTimeSpan) {
      if ($player.Position -ge $player.NaturalDuration.TimeSpan.Add([TimeSpan]::FromMilliseconds(-60))) {
        $player.Close(); $state = 'idle'; Write-Output 'ended'
      }
    } elseif (([DateTime]::UtcNow - $opened).TotalSeconds -gt 5) {
      $player.Close(); $state = 'idle'; Write-Output 'failed'
    }
  }
  Start-Sleep -Milliseconds 40
}
`;

class WindowsPlayer {
  playsMp3 = true;
  #child;
  #settle = null;

  constructor() {
    const encoded = Buffer.from(POWERSHELL_PLAYER, 'utf16le').toString('base64');
    this.#child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    createInterface({ input: this.#child.stdout }).on('line', (line) => this.#finish(line.trim()));
    this.#child.on('error', () => this.#finish('failed'));
    this.#child.on('close', () => this.#finish('failed'));
    this.#child.stdin.on('error', () => {});
  }

  play(file) {
    return new Promise((resolve) => {
      this.#settle = resolve;
      this.#send(`play ${file}`);
    });
  }

  pause() {
    this.#send('pause');
  }

  resume() {
    this.#send('resume');
  }

  stop() {
    this.#send('stop');
  }

  dispose() {
    this.#finish('stopped');
    this.#child.stdin.end();
    this.#child.kill();
  }

  #send(command) {
    this.#child.stdin.write(`${command}\n`);
  }

  #finish(result) {
    if (!['ended', 'stopped', 'failed'].includes(result)) return;
    const settle = this.#settle;
    this.#settle = null;
    settle?.(result);
  }
}

function isOnPath(name) {
  return (process.env.PATH ?? '').split(delimiter).some((dir) => {
    try {
      accessSync(join(dir, name), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

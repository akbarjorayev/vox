// Background process started by `vox speak`. It owns one speaking session
// and answers pause / resume / stop commands until the speech is over.
import { randomUUID } from 'node:crypto';
import { TempAudioFiles } from './lib/audio-files.mjs';
import { ControlServer } from './lib/control.mjs';
import { chunk } from './lib/clean.mjs';
import { createSpeechEngine } from './lib/engines.mjs';
import { FileLogger } from './lib/logger.mjs';
import { LOG_FILE, REPORT_FILE, STATE_FILE, TEMP_DIR } from './lib/paths.mjs';
import { createPlayer } from './lib/player.mjs';
import { ProcessRunner } from './lib/process-runner.mjs';
import { ReportStore } from './lib/report-store.mjs';
import { Settings } from './lib/settings.mjs';
import { SpeechSession } from './lib/speech-session.mjs';
import { StateStore } from './lib/state-store.mjs';

const STALE_AUDIO_MS = 10 * 60 * 1000;

async function readStdin() {
  let input = '';
  for await (const part of process.stdin) input += part;
  return input;
}

async function main() {
  const logger = new FileLogger(LOG_FILE);
  const job = JSON.parse(await readStdin());
  const settings = new Settings(job.settings);

  const files = new TempAudioFiles(TEMP_DIR);
  files.removeOlderThan(STALE_AUDIO_MS);

  const report = new ReportStore(REPORT_FILE);
  const player = createPlayer();
  if (!player) {
    logger.log('no audio player available');
    return report.write('failed');
  }

  const session = new SpeechSession({
    onStart: () => report.write('started'),
    chunks: chunk(job.text),
    engine: createSpeechEngine({ canPlayMp3: player.playsMp3, runner: new ProcessRunner(), files, logger }),
    player,
    files,
    options: { voice: settings.voice, speed: settings.speed },
    logger,
  });

  const store = new StateStore(STATE_FILE);
  const token = randomUUID();
  const server = new ControlServer({
    token,
    onCommand: (command) => {
      switch (command) {
        case 'pause':
          session.pause();
          return 'ok';
        case 'resume':
          session.resume();
          return 'ok';
        case 'stop':
          // Hand over immediately so a new worker can take the state.
          store.clear(process.pid);
          session.stop();
          return 'ok';
        case 'status':
          return session.status;
        default:
          return 'unknown';
      }
    },
  });

  const port = await server.listen();
  store.write({ pid: process.pid, port, token });

  const outcome = await session.run();
  logger.log('session', outcome);
  if (outcome === 'failed') report.write('failed');

  server.close();
  store.clear(process.pid);
  player.dispose();
}

main()
  .catch((error) => {
    new FileLogger(LOG_FILE).log('worker crashed:', error);
    new ReportStore(REPORT_FILE).write('failed');
  })
  .finally(() => process.exit(0));

// Background process started by `vox settings page`. It serves the settings
// page, opens it in the browser, and exits when the user saves or walks away.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BrowserOpener } from './lib/browser-opener.mjs';
import { createVox } from './lib/compose.mjs';
import { FileLogger } from './lib/logger.mjs';
import { CONFIG_FILE, LOG_FILE, SETTINGS_REPORT_FILE } from './lib/paths.mjs';
import { ProcessRunner } from './lib/process-runner.mjs';
import { ReportStore } from './lib/report-store.mjs';
import { SettingsServer } from './lib/settings-server.mjs';
import { SettingsStore } from './lib/settings.mjs';
import { VOICES } from './lib/voices.mjs';

const IDLE_MS = 10 * 60 * 1000;

async function main() {
  // The launcher writes a job to stdin; reading and ignoring it lets the launcher finish.
  process.stdin.resume();

  const logger = new FileLogger(LOG_FILE);
  const report = new ReportStore(SETTINGS_REPORT_FILE);
  const vox = createVox();

  const server = new SettingsServer({
    settingsStore: new SettingsStore(CONFIG_FILE),
    preview: (settings) => vox.preview(settings),
    html: readFileSync(new URL('./settings-page.html', import.meta.url), 'utf8'),
    voices: VOICES,
    token: randomUUID(),
    idleMs: IDLE_MS,
  });

  const url = await server.listen();
  try {
    await new BrowserOpener(new ProcessRunner()).open(url);
    report.write('opened');
  } catch (error) {
    logger.log('could not open the browser:', error);
    report.write(url);
  }

  await server.closed;
}

main()
  .catch((error) => new FileLogger(LOG_FILE).log('settings page crashed:', error))
  .finally(() => process.exit(0));

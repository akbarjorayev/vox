import { fileURLToPath } from 'node:url';
import { clean } from './clean.mjs';
import { ControlClient } from './control.mjs';
import { MESSAGES } from './messages.mjs';
import { CONFIG_FILE, REPORT_FILE, SETTINGS_REPORT_FILE, STATE_FILE } from './paths.mjs';
import { canPlayAudio } from './player.mjs';
import { ReportStore } from './report-store.mjs';
import { SettingsPage } from './settings-page.mjs';
import { SettingsStore } from './settings.mjs';
import { StateStore } from './state-store.mjs';
import { Vox } from './vox-app.mjs';
import { WorkerLauncher } from './worker-launcher.mjs';

const scriptPath = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));

// The one place where the real pieces are wired together.
export function createVox() {
  return new Vox({
    store: new StateStore(STATE_FILE),
    client: new ControlClient(),
    launcher: new WorkerLauncher({ workerPath: scriptPath('worker.mjs') }),
    report: new ReportStore(REPORT_FILE),
    settingsStore: new SettingsStore(CONFIG_FILE),
    settingsPage: new SettingsPage({
      launcher: new WorkerLauncher({ workerPath: scriptPath('settings-server.mjs') }),
      report: new ReportStore(SETTINGS_REPORT_FILE),
    }),
    clean,
    canPlayAudio,
    messages: MESSAGES,
  });
}

const OPEN_TIMEOUT_MS = 8000;

// Starts the settings page in the background and reports how that went:
// 'opened', the page's link (when no browser could be opened), or null.
export class SettingsPage {
  #launcher;
  #report;

  constructor({ launcher, report }) {
    this.#launcher = launcher;
    this.#report = report;
  }

  open() {
    this.#report.clear();
    this.#launcher.launch({});
    return this.#report.waitForResult(OPEN_TIMEOUT_MS);
  }
}

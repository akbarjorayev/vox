import { InvalidSettingError, Settings } from './settings.mjs';

// Covers the slowest case: the online voice times out, then the offline one runs.
const START_TIMEOUT_MS = 15_000;
const OPENED = 'opened';
const PREVIEW_TEXT = 'Hello, this is how I sound.';

// What the user can do. Each method returns the text to show, or null when
// success should stay silent.
export class Vox {
  #store;
  #client;
  #launcher;
  #report;
  #settingsStore;
  #settingsPage;
  #clean;
  #canPlayAudio;
  #messages;

  constructor({ store, client, launcher, report, settingsStore, settingsPage, clean, canPlayAudio, messages }) {
    this.#store = store;
    this.#client = client;
    this.#launcher = launcher;
    this.#report = report;
    this.#settingsStore = settingsStore;
    this.#settingsPage = settingsPage;
    this.#clean = clean;
    this.#canPlayAudio = canPlayAudio;
    this.#messages = messages;
  }

  async speak(text) {
    if (!this.#canPlayAudio()) return this.#messages.noSpeaker;

    const spoken = this.#clean(text);
    if (!spoken) return null;

    return this.#start(spoken, this.#settingsStore.load());
  }

  // Plays a short sample with settings that have not been saved yet.
  // Throws InvalidSettingError if the given values are not valid.
  preview(rawSettings) {
    if (!this.#canPlayAudio()) return this.#messages.noSpeaker;
    return this.#start(PREVIEW_TEXT, new Settings(rawSettings));
  }

  async pause() {
    return (await this.#signalActive('pause')) ? this.#messages.paused : this.#messages.nothingPlaying;
  }

  async resume() {
    return (await this.#signalActive('resume')) ? null : this.#messages.nothingPlaying;
  }

  async stop() {
    return (await this.#signalActive('stop')) ? this.#messages.stopped : this.#messages.nothingPlaying;
  }

  async status() {
    const reply = await this.#signalActive('status');
    return this.#messages[reply] ?? this.#messages.ready;
  }

  settings() {
    const { voice, speed, auto } = this.#settingsStore.load();
    return `voice: ${voice}\nspeed: ${speed}\nauto: ${auto ? 'on' : 'off'}`;
  }

  changeSetting(key, raw) {
    try {
      this.#settingsStore.save(this.#settingsStore.load().with(key, raw));
      return this.#messages.saved;
    } catch (error) {
      if (error instanceof InvalidSettingError) return this.#messages.badSetting;
      throw error;
    }
  }

  // The page opens itself; the link is only shown when no browser could be opened.
  async openSettingsPage() {
    const result = await this.#settingsPage.open();
    if (result === OPENED) return null;
    return result ? `${this.#messages.openLink} ${result}` : this.#messages.couldntOpenSettings;
  }

  async #start(spoken, settings) {
    await this.#signalActive('stop');
    this.#report.clear();
    this.#launcher.launch({ text: spoken, settings: settings.toJSON() });

    // Returns as soon as audio starts; only a failure is worth telling the user.
    const result = await this.#report.waitForResult(START_TIMEOUT_MS);
    return result === 'failed' ? this.#messages.couldntSpeak : null;
  }

  // Sends a command to the running worker. Returns its reply, or null when
  // nothing is running (a stale record of a dead worker is cleared).
  async #signalActive(command) {
    const active = this.#store.readActive();
    if (!active) return null;
    try {
      return await this.#client.send(active, command);
    } catch {
      this.#store.clear();
      return null;
    }
  }
}

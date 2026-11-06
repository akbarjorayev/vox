// Plays a list of text chunks one after another. While one chunk plays, the
// next is already being synthesized, so there is no gap between them.
export class SpeechSession {
  #chunks;
  #engine;
  #player;
  #files;
  #options;
  #logger;
  #onStart;

  #status = 'idle';
  #paused = false;
  #stopped = false;
  #resumeGate = null;
  #signalStop;
  #stopSignal = new Promise((resolve) => (this.#signalStop = resolve));

  // onStart runs once, just before the first audio is played.
  constructor({ chunks, engine, player, files, options, logger, onStart = () => {} }) {
    this.#chunks = chunks;
    this.#engine = engine;
    this.#player = player;
    this.#files = files;
    this.#options = options;
    this.#logger = logger;
    this.#onStart = onStart;
  }

  get status() {
    return this.#status;
  }

  // Resolves with 'finished', 'stopped' or 'failed'. Never rejects.
  async run() {
    this.#status = 'playing';
    let outcome = 'finished';
    let upcoming = this.#prepare(0);

    for (let index = 0; index < this.#chunks.length; index++) {
      const prepared = await Promise.race([upcoming, this.#stopSignal]);
      if (this.#stopped) {
        outcome = 'stopped';
        break;
      }
      if (prepared.error) {
        this.#logger.log('could not prepare audio:', prepared.error);
        outcome = 'failed';
        break;
      }

      const isLast = index === this.#chunks.length - 1;
      upcoming = isLast ? null : this.#prepare(index + 1);

      await this.#waitWhilePaused();
      if (!this.#stopped && index === 0) this.#onStart();
      const result = this.#stopped ? 'stopped' : await this.#player.play(prepared.file);
      this.#files.remove(prepared.file);
      if (result !== 'ended') {
        outcome = result;
        break;
      }
    }

    this.#discard(upcoming);
    this.#status = 'idle';
    return outcome;
  }

  pause() {
    if (this.#stopped) return;
    this.#paused = true;
    this.#status = 'paused';
    this.#player.pause();
  }

  resume() {
    if (this.#stopped) return;
    this.#paused = false;
    this.#status = 'playing';
    this.#player.resume();
    this.#releaseGate();
  }

  stop() {
    this.#stopped = true;
    this.#paused = false;
    this.#player.stop();
    this.#releaseGate();
    this.#signalStop();
  }

  // Never rejects, so an unobserved chunk cannot crash the process.
  #prepare(index) {
    return this.#engine.synthesize(this.#chunks[index], this.#options).then(
      (file) => ({ file }),
      (error) => ({ error }),
    );
  }

  // Pausing between two chunks must hold back the next one too.
  async #waitWhilePaused() {
    while (this.#paused && !this.#stopped) {
      await new Promise((resolve) => (this.#resumeGate = resolve));
    }
  }

  #releaseGate() {
    this.#resumeGate?.();
    this.#resumeGate = null;
  }

  #discard(upcoming) {
    upcoming?.then(({ file }) => file && this.#files.remove(file));
  }
}

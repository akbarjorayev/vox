import { EdgeTTS } from 'node-edge-tts';
import { ReachabilityProbe } from './reachability.mjs';
import { genderOf } from './voices.mjs';

// A speech engine turns text into an audio file path:
//   synthesize(text, { voice, speed }) -> Promise<string>
// Engines are interchangeable, so callers never need to know which one runs.

const EDGE_TIMEOUT_MS = 8000;
// Where node-edge-tts connects. Check it again when updating that package.
const EDGE_HOST = 'api.msedgeservices.com';
const HTTPS_PORT = 443;
const REACHABILITY_TIMEOUT_MS = 1500;
const EDGE_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const BASE_WORDS_PER_MINUTE = 175;
const SAPI_RATE_LIMIT = 10;
// Microsoft refuses a request now and then (rate limit). That passes in a
// moment, unlike being offline, so only a refusal is worth a second try.
const REFUSED_PATTERN = /Unexpected server response/;
const RETRY_DELAY_MS = 700;
const MAC_VOICES = { female: 'Samantha', male: 'Daniel' };
const ESPEAK_VOICES = { female: 'en+f3', male: 'en' };
const SAPI_GENDERS = { female: 'Female', male: 'Male' };

export function edgeRate(speed) {
  const percent = Math.round((speed - 1) * 100);
  return percent === 0 ? 'default' : `${percent > 0 ? '+' : ''}${percent}%`;
}

export function nativeWordsPerMinute(speed) {
  return Math.round(BASE_WORDS_PER_MINUTE * speed);
}

export function sapiRate(speed) {
  return Math.max(-SAPI_RATE_LIMIT, Math.min(SAPI_RATE_LIMIT, Math.round((speed - 1) * SAPI_RATE_LIMIT)));
}

// Natural online voice. It only returns MP3.
export class EdgeEngine {
  #files;

  constructor(files) {
    this.#files = files;
  }

  async synthesize(text, { voice, speed }) {
    const file = this.#files.pathFor('mp3');
    const tts = new EdgeTTS({
      voice,
      lang: voice.split('-').slice(0, 2).join('-'),
      outputFormat: EDGE_FORMAT,
      rate: edgeRate(speed),
      timeout: EDGE_TIMEOUT_MS,
    });
    try {
      await tts.ttsPromise(text, file);
    } catch (error) {
      this.#files.remove(file);
      throw error;
    }
    return file;
  }
}

// The computer's own offline voice, of the same gender as the chosen voice so
// a fallback never switches from a woman to a man mid-reply. Subclasses only
// describe how their OS is invoked: an output extension and the command, or
// several commands to try in order.
class NativeEngine {
  #runner;
  #files;

  constructor(runner, files) {
    this.#runner = runner;
    this.#files = files;
  }

  async synthesize(text, { voice, speed }) {
    const file = this.#files.pathFor(this.extension);
    const [first, ...rest] = this.invocations(file, text, { speed, gender: genderOf(voice) });
    try {
      await rest.reduce(
        (attempt, next) => attempt.catch(() => this.#runner.run(next)),
        this.#runner.run(first),
      );
    } catch (error) {
      this.#files.remove(file);
      throw error;
    }
    return file;
  }

  invocations(file, text, options) {
    return [this.invocation(file, text, options)];
  }
}

class WindowsNativeEngine extends NativeEngine {
  extension = 'wav';

  invocation(file, text, { speed, gender }) {
    // Text travels in the environment so it never needs shell quoting.
    const script =
      'Add-Type -AssemblyName System.Speech;' +
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;' +
      '$s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]$env:VOX_GENDER);' +
      '$s.Rate = [int]$env:VOX_RATE;' +
      '$s.SetOutputToWaveFile($env:VOX_OUT);' +
      '$s.Speak($env:VOX_TEXT);' +
      '$s.Dispose()';
    return {
      command: 'powershell',
      args: ['-NoProfile', '-NonInteractive', '-Command', script],
      env: { VOX_TEXT: text, VOX_OUT: file, VOX_RATE: String(sapiRate(speed)), VOX_GENDER: SAPI_GENDERS[gender] },
    };
  }
}

class MacNativeEngine extends NativeEngine {
  extension = 'aiff';

  // Not every Mac has every voice installed, so the system's own voice reads
  // when the chosen one is missing: a different voice beats none.
  invocations(file, text, { speed, gender }) {
    const output = ['-o', file, '-r', String(nativeWordsPerMinute(speed))];
    return [
      { command: 'say', args: ['-v', MAC_VOICES[gender], ...output], input: text },
      { command: 'say', args: output, input: text },
    ];
  }
}

class LinuxNativeEngine extends NativeEngine {
  extension = 'wav';

  invocation(file, text, { speed, gender }) {
    return {
      command: 'espeak-ng',
      args: ['-v', ESPEAK_VOICES[gender], '-w', file, '-s', String(nativeWordsPerMinute(speed)), '--stdin'],
      input: text,
    };
  }
}

const NATIVE_ENGINES = { win32: WindowsNativeEngine, darwin: MacNativeEngine };

export function createNativeEngine(platform, runner, files) {
  const Engine = NATIVE_ENGINES[platform] ?? LinuxNativeEngine;
  return new Engine(runner, files);
}

// Uses the preferred engine and quietly switches to the backup when it can't.
// The reason is logged, not shown. One instance serves one reply:
// - the first try runs alongside a probe of the server; if the probe finds it
//   unreachable first, the backup starts at once, so being offline costs no
//   waiting and being online costs nothing extra;
// - a refusal (rate limit) gets one more try and only that sentence falls
//   back, since refusals pass in a moment;
// - any other failure (timeout, network error) sends the rest of the reply to
//   the backup, so no later sentence waits for the same timeout again.
export class FallbackEngine {
  #preferred;
  #backup;
  #logger;
  #wait;
  #probe;
  #files;
  #isPreferredDown = false;

  constructor({ preferred, backup, logger, wait, probe, files }) {
    this.#preferred = preferred;
    this.#backup = backup;
    this.#logger = logger;
    this.#wait = wait;
    this.#probe = probe;
    this.#files = files;
  }

  async synthesize(text, options) {
    if (this.#isPreferredDown) return this.#backup.synthesize(text, options);

    const attempt = this.#tryPreferred(text, options);
    try {
      const result = await Promise.race([attempt, this.#unreachable()]);
      if (result !== UNREACHABLE) return result;
      this.#isPreferredDown = true;
      // Nothing plays what the abandoned try makes, so its file is removed. If
      // it fails instead, it has removed its own file, and the switch above
      // is already logged.
      attempt.then((file) => this.#files.remove(file), () => {});
      this.#logger.log('voice server unreachable, using backup');
      return this.#backup.synthesize(text, options);
    } catch (error) {
      if (!isRefusal(error)) this.#isPreferredDown = true;
      this.#logger.log('preferred voice unavailable, using backup:', error);
      return this.#backup.synthesize(text, options);
    }
  }

  // Settles only when the server is unreachable; never when it is reachable.
  async #unreachable() {
    if (await this.#probe.isReachable()) return NEVER;
    return UNREACHABLE;
  }

  async #tryPreferred(text, options) {
    try {
      return await this.#preferred.synthesize(text, options);
    } catch (error) {
      if (!isRefusal(error)) throw error;
      this.#logger.log('preferred voice refused, trying again:', error);
      await this.#wait(RETRY_DELAY_MS);
      return this.#preferred.synthesize(text, options);
    }
  }
}

const UNREACHABLE = Symbol('unreachable');
const NEVER = new Promise(() => {});

function isRefusal(error) {
  return REFUSED_PATTERN.test(error?.message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The online voice only returns MP3, so it is skipped when the player cannot decode MP3.
export function createSpeechEngine({ platform = process.platform, canPlayMp3, runner, files, logger }) {
  const native = createNativeEngine(platform, runner, files);
  if (!canPlayMp3) return native;
  return new FallbackEngine({
    preferred: new EdgeEngine(files),
    backup: native,
    logger,
    wait: sleep,
    files,
    probe: new ReachabilityProbe({ host: EDGE_HOST, port: HTTPS_PORT, timeoutMs: REACHABILITY_TIMEOUT_MS }),
  });
}

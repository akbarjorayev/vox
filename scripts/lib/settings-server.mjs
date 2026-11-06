import { createServer } from 'node:http';
import { InvalidSettingError, Settings } from './settings.mjs';

const LOCALHOST = '127.0.0.1';
const MAX_BODY_BYTES = 10_000;
const CLOSE_DELAY_MS = 1000;
const JSON_TYPE = 'application/json';

class HttpError extends Error {
  constructor(status) {
    super(String(status));
    this.status = status;
  }
}

// Serves the settings page on the loopback interface only. The random token in
// every path, the Host check and the JSON-only POSTs keep other programs and
// web pages from changing the user's settings.
export class SettingsServer {
  #store;
  #preview;
  #html;
  #voices;
  #token;
  #idleMs;
  #server = null;
  #port = 0;
  #idleTimer = null;
  #resolveClosed;
  closed = new Promise((resolve) => (this.#resolveClosed = resolve));

  // preview(rawSettings) speaks a sample with the given, unsaved settings.
  constructor({ settingsStore, preview, html, voices, token, idleMs }) {
    this.#store = settingsStore;
    this.#preview = preview;
    this.#html = html;
    this.#voices = voices;
    this.#token = token;
    this.#idleMs = idleMs;
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.#server = createServer((request, response) => this.#handle(request, response));
      this.#server.once('error', reject);
      this.#server.listen(0, LOCALHOST, () => {
        this.#port = this.#server.address().port;
        this.#restartIdleTimer();
        resolve(`http://${LOCALHOST}:${this.#port}/${this.#token}/`);
      });
    });
  }

  close() {
    clearTimeout(this.#idleTimer);
    this.#server?.close();
    this.#server?.closeAllConnections();
    this.#resolveClosed();
  }

  async #handle(request, response) {
    this.#restartIdleTimer();
    try {
      const route = this.#routeFor(request);
      const result = await route(request);
      this.#send(response, result.status ?? 200, result.type ?? JSON_TYPE, result.body);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof InvalidSettingError ? 400 : 500;
      this.#send(response, status, JSON_TYPE, JSON.stringify({ error: 'failed' }));
    }
  }

  #routeFor(request) {
    if (request.headers.host !== `${LOCALHOST}:${this.#port}`) throw new HttpError(403);

    const prefix = `/${this.#token}/`;
    const path = new URL(request.url, `http://${LOCALHOST}`).pathname;
    if (!path.startsWith(prefix)) throw new HttpError(404);

    const routes = {
      'GET ': () => ({ type: 'text/html; charset=utf-8', body: this.#html }),
      'GET api/settings': () => this.#describeSettings(),
      'POST api/preview': (req) => this.#previewSettings(req),
      'POST api/save': (req) => this.#saveSettings(req),
    };
    const route = routes[`${request.method} ${path.slice(prefix.length)}`];
    if (!route) throw new HttpError(404);
    return route;
  }

  #describeSettings() {
    return { body: JSON.stringify({ settings: this.#store.load().toJSON(), voices: this.#voices }) };
  }

  async #previewSettings(request) {
    await this.#preview(await this.#settingsFrom(request));
    return { body: JSON.stringify({ ok: true }) };
  }

  async #saveSettings(request) {
    this.#store.save(await this.#settingsFrom(request));
    setTimeout(() => this.close(), CLOSE_DELAY_MS);
    return { body: JSON.stringify({ ok: true }) };
  }

  // Page values are layered over the saved ones, so a field the page leaves out
  // keeps its saved value. Invalid values are rejected by Settings.
  async #settingsFrom(request) {
    const { voice, speed, auto } = await this.#readJson(request);
    const fromPage = Object.fromEntries(Object.entries({ voice, speed, auto }).filter(([, value]) => value !== undefined));
    return new Settings({ ...this.#store.load().toJSON(), ...fromPage });
  }

  async #readJson(request) {
    if (!request.headers['content-type']?.startsWith(JSON_TYPE)) throw new HttpError(415);

    let raw = '';
    for await (const part of request) {
      raw += part;
      if (raw.length > MAX_BODY_BYTES) throw new HttpError(413);
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new HttpError(400);
    }
  }

  #send(response, status, type, body) {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(body);
  }

  #restartIdleTimer() {
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => this.close(), this.#idleMs);
  }
}

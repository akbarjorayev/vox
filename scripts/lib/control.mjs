import { connect, createServer } from 'node:net';
import { createInterface } from 'node:readline';

// How CLI calls talk to the running worker: one line in ("<token> <command>"),
// one line out. It listens on the loopback interface only, and the token stops
// other local programs from sending commands.

const LOCALHOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 3000;

export class ControlServer {
  #token;
  #onCommand;
  #server = null;

  // onCommand(command) returns the reply text.
  constructor({ token, onCommand }) {
    this.#token = token;
    this.#onCommand = onCommand;
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.#server = createServer((socket) => this.#serve(socket));
      this.#server.once('error', reject);
      this.#server.listen(0, LOCALHOST, () => resolve(this.#server.address().port));
    });
  }

  close() {
    this.#server?.close();
  }

  #serve(socket) {
    socket.on('error', () => {});
    createInterface({ input: socket }).once('line', (line) => {
      const [token, command] = line.split(' ');
      socket.end(`${token === this.#token ? this.#onCommand(command) : 'denied'}\n`);
    });
  }
}

export class ControlClient {
  #timeoutMs;

  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.#timeoutMs = timeoutMs;
  }

  send({ port, token }, command) {
    return new Promise((resolve, reject) => {
      const socket = connect(port, LOCALHOST);
      const timer = setTimeout(() => socket.destroy(new Error('control timeout')), this.#timeoutMs);
      let reply = '';

      socket.on('connect', () => socket.write(`${token} ${command}\n`));
      socket.on('data', (data) => (reply += data));
      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('close', () => {
        clearTimeout(timer);
        resolve(reply.trim());
      });
    });
  }
}

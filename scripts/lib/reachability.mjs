import { connect as tcpConnect } from 'node:net';

// Answers "can the voice server be reached?" with one TCP connection, the
// first time it is asked. Without a network the connection fails at once;
// on a network with no internet it gives up after `timeoutMs`. Either way it
// is far quicker than waiting for the voice service's own timeout.
export class ReachabilityProbe {
  #host;
  #port;
  #timeoutMs;
  #connect;
  #answer = null;

  constructor({ host, port, timeoutMs, connect = tcpConnect }) {
    this.#host = host;
    this.#port = port;
    this.#timeoutMs = timeoutMs;
    this.#connect = connect;
  }

  isReachable() {
    this.#answer ??= this.#probe();
    return this.#answer;
  }

  #probe() {
    return new Promise((resolve) => {
      const socket = this.#connect({ host: this.#host, port: this.#port });
      const settle = (isReachable) => {
        socket.destroy();
        resolve(isReachable);
      };
      socket.setTimeout(this.#timeoutMs);
      socket.once('connect', () => settle(true));
      socket.once('timeout', () => settle(false));
      socket.once('error', () => settle(false));
    });
  }
}

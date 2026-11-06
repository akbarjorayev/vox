// Opens a link in the user's default browser. Isolates the per-OS command.
const OPEN_COMMANDS = {
  win32: (url) => ({ command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] }),
  darwin: (url) => ({ command: 'open', args: [url] }),
};
const openOnLinux = (url) => ({ command: 'xdg-open', args: [url] });

export class BrowserOpener {
  #runner;
  #platform;

  constructor(runner, platform = process.platform) {
    this.#runner = runner;
    this.#platform = platform;
  }

  open(url) {
    const buildInvocation = OPEN_COMMANDS[this.#platform] ?? openOnLinux;
    return this.#runner.run(buildInvocation(url));
  }
}

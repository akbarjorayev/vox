![Vox logo: a speaker sending out sound waves](assets/logo.png)

# vox: text-to-speech for Claude Code

Vox is a Claude Code plugin that reads Claude's replies aloud in a natural voice. It works on Windows, macOS and Linux, with nothing to set up.

> **Requires [Node.js](https://nodejs.org)** (any current LTS version). Vox's speech engine runs on Node. Claude Code doesn't include it, so install it first if `node --version` doesn't work in your terminal. If Node.js is missing, `/vox` tells you.

<!-- Demo GIF goes here -->

## What it does

- `/vox` reads Claude's last reply aloud.
- Code blocks, tables and long links are not read out symbol by symbol. Vox says "code block" or "table" instead, and reads a link as its readable name.
- Pause, resume and stop whenever you like.
- Auto-speak can read every reply as soon as Claude finishes it.
- `/vox` is answered by the plugin itself, so it uses no tokens.

## Install

In Claude Code:

```
/plugin marketplace add akbarjorayev/vox
/plugin install vox@vox
```

Then turn on updates, once: run `/plugin`, open **Marketplaces**, select **vox** and choose **Enable auto-update**. Claude Code then fetches new versions in the background and uses them the next time it starts. Without this, Claude Code doesn't update plugins from marketplaces you add yourself, and you'd run `/plugin marketplace update vox` by hand.

### Requirements

| | Needed |
|---|---|
| Everywhere | A recent Claude Code and [Node.js](https://nodejs.org) |
| Windows, macOS | Nothing else: vox uses the speech and audio the system already has |
| Linux | A sound system. For the natural voices, one of `mpv`, `ffplay`, `mpg123` or `cvlc`. For the offline voice, `espeak-ng` |

## Use

| Command | What it does |
|---|---|
| `/vox` | Read Claude's last reply |
| `/vox Hello there` | Read that text |
| `/vox pause` / `resume` / `stop` | Control playback |
| `/vox .` | Stop. The quickest to type |
| `/vox status` | Is it playing? |
| `/vox settings` | Pick the voice, speed and auto-speak in a dialog |
| `/vox settings speed 1.3` | Change one setting directly (`voice`, `speed` or `auto`) |
| `/vox settings page` | Change them on a page in your browser |
| `/vox help` | Show all commands |

The settings are saved in `~/.vox/config.json`:

| Setting | Default | Values |
|---|---|---|
| `voice` | `en-US-AriaNeural` (female) | Any Microsoft neural voice name, for example `en-GB-RyanNeural` or `uz-UZ-MadinaNeural` |
| `speed` | `1` | `0.5` to `2` |
| `auto` | `off` | `on` reads each reply as soon as it is done |

## Questions

### Does it work offline?

Yes. Vox notices within a moment that it can't reach the voice server and uses your computer's own voice instead: Windows' built-in voices, `say` on macOS, or `espeak-ng` on Linux. It sounds more robotic, but it has the same gender as the voice you picked, so a reply never switches from a woman's voice to a man's.

### Where does my text go?

The natural voices are made by Microsoft's online text-to-speech service, so **the text being read is sent to Microsoft**. If you don't want that, turn off your internet connection and vox will use only your computer's own voice, which never leaves your machine.

### Why did it read one sentence in a different voice?

Microsoft's service sometimes refuses a request for a moment (rate limiting). Vox tries again once, and if it still can't, it reads that sentence with your computer's own voice. Details are written to `vox.log` in your temp folder (`%TEMP%\vox` on Windows, `$TMPDIR/vox` on macOS, `/tmp/vox` on Linux).

### Why can't I hear anything?

Run `/vox status`. Vox only speaks up when you need to act. For example, it tells you if Node.js is missing or no speaker is found. On Linux, playing the natural voices needs one of `mpv`, `ffplay`, `mpg123` or `cvlc`. Without one, vox uses `espeak-ng` with `paplay` or `aplay`.

## What vox runs and connects to

So you know exactly what happens on your computer:

- **Network:** the text being read goes to Microsoft's Edge text-to-speech service (`api.msedgeservices.com`) over a secure WebSocket. Before the first sentence of a reply, vox also opens a plain connection to the same server to check whether you're online. Nothing else goes over the internet.
- **Programs it starts:** Node.js for its own scripts; for playback and the offline voice, what your system has: PowerShell with Windows' built-in speech and media player on Windows, `say` and `afplay` on macOS, and on Linux the first available of `mpv`, `ffplay`, `mpg123`, `cvlc`, `paplay`, `aplay` and `espeak-ng`. `/vox settings page` opens your default browser.
- **Local connections:** while speaking, vox listens on `127.0.0.1` so `/vox pause` and `stop` can reach it, and the settings page is served on `127.0.0.1`. Both use a random token and accept nothing from other computers.
- **What it reads:** Claude's last reply in the current chat, when you run `/vox` or turn on auto-speak.
- **Files it writes:** your settings in `~/.vox/config.json`; short-lived audio files, a small status file and `vox.log` in a `vox` folder in your temp directory. Audio files are deleted after they play.

## Known limits

- Audio plays on the computer running Claude Code, not on a phone or a remote session.
- The natural voices use Microsoft's Edge text-to-speech service, which has no official public API and could stop working. If it does, vox falls back to your computer's own voice.
- I test vox on Windows. The macOS and Linux code paths were reviewed by reading, not run. Reports and fixes are welcome.

## Releasing

Bump `version` in `.claude-plugin/plugin.json` and `package.json` (for example `1.0.0` → `1.0.1`), then push. Claude Code only updates people whose version differs, so a push without a version change reaches nobody.

## Development

```
npm install
npm test                      # unit tests
claude plugin test .          # tests for the /vox command module
claude plugin validate .
claude --plugin-dir .         # run Claude Code with your local copy
```

`CLAUDE.md` describes how vox is built and how it must behave. Read it before changing behavior.

## License

[MIT](LICENSE) © Akbar Jorayev

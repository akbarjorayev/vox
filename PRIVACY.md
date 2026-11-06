# Vox privacy policy

Effective date: November 6, 2026

Vox is a Claude Code plugin that reads Claude's replies aloud. This policy explains what data vox handles and where it goes. In short: vox has no servers of its own and collects nothing about you. To produce natural voices, it sends the text being read to Microsoft's text-to-speech service.

## What leaves your computer

**The text being read aloud.** When vox reads a reply with its natural (online) voices, it sends that text to Microsoft's Edge text-to-speech service at `api.msedgeservices.com` over a secure connection, and receives audio back. The text is sent only when you run `/vox`, or after each reply when you turn on auto-speak. Microsoft's handling of that text is covered by the [Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement).

**A connection check.** Before the first sentence of a reply, vox opens a plain connection to the same Microsoft server to check whether you're online. It sends no data over that connection.

Nothing else is sent anywhere. Vox has no analytics, no telemetry, no accounts and no servers of its own, and the author receives no data from it.

## How to keep everything on your computer

When vox can't reach Microsoft's service, it reads with your computer's own built-in voice (Windows speech, `say` on macOS, `espeak-ng` on Linux). That voice runs entirely on your computer, and the text never leaves it. Use vox offline, or uninstall it, if you don't want text sent to Microsoft.

## What vox stores on your computer

- **Your settings** (voice, speed, auto-speak) in `~/.vox/config.json`.
- **Short-lived audio files** in a `vox` folder in your temp directory, deleted after they play.
- **A small status file and a log file** (`vox.log`) in that same folder, used to control playback and to understand problems. The log records technical events, not the text that was read.

These files stay on your computer. Delete them at any time; vox recreates what it needs with default settings.

## Local connections

While speaking, vox listens on `127.0.0.1` so that `/vox pause` and `/vox stop` can reach it, and `/vox settings page` serves a page on `127.0.0.1`. Both are protected by a random token and accept no connections from other computers.

## Changes

If vox's handling of data changes, this policy will be updated in the [vox repository](https://github.com/akbarjorayev/vox), with a new effective date.

## Contact

Questions about privacy: open an issue at [github.com/akbarjorayev/vox/issues](https://github.com/akbarjorayev/vox/issues), or contact Akbar Jorayev through [akbarjon.uz](https://akbarjon.uz).

# vox

Claude Code plugin that reads Claude's replies aloud on Windows, macOS and Linux. This file is the spec: read it before changing behavior, and update it when behavior changes.

## Commands
- Unit tests: `npm test` (`node --test`)
- Hooks module tests: `claude plugin test .`
- Validate the plugin: `claude plugin validate .`
- Run locally: `claude --plugin-dir .`
- Script directly: `node scripts/vox.mjs <speak|pause|resume|stop|status|settings|help>` (`voices` also exists; it feeds the settings dialog and isn't in `help`)

## How it fits together
- `hooks/register.tsx` is a hooks module. It answers `/vox`, draws the settings dialog and auto-speaks on `turn.complete`. The interface answers it, so it costs no tokens. It only routes to `scripts/vox.mjs`. Shortcuts are mapped there before routing: `/vox .` alone is `stop`.
- `scripts/vox.mjs` is the thin CLI. `lib/vox-app.mjs` holds what the user can do.
- `vox speak` starts `scripts/worker.mjs` in the background and returns at once. The worker owns one reply. It runs a `SpeechSession`, which synthesizes the next sentence while the current one plays, and answers pause/resume/stop over a loopback TCP socket guarded by a random token (`lib/control.mjs`). One playback at a time: a new one replaces the old.
- `vox settings page` starts `scripts/settings-server.mjs`, a loopback-only page with a token in every path.
- Real objects are wired together only in `lib/compose.mjs`, `worker.mjs` and `settings-server.mjs`. Everything else takes its dependencies through the constructor.
- The hooks module has no `types/` contract because it keeps no `$.state`. Add one with the first `$.state` value.

## Reading rules (`lib/clean.mjs`)
- Prose is read as is. Markdown symbols and emoji are dropped.
- A code block is read as "code block". Back-to-back blocks are counted: "2 code blocks".
- Inline code is read as words: camelCase and snake_case are split, `.` is "dot" and `/` is "slash". If it's long (about 40+ characters) or mostly symbols, vox says "code".
- A markdown link is read as its text. A bare link is read as the site plus its readable path. The query and `#fragment` are never read. Reading stops at a path piece that looks like an id or hash, or after 5 pieces.
- A table is read as "table".
- Text is split into sentence-sized chunks so speech starts fast.

## Voices (`lib/engines.mjs`)
- **Online (default):** Microsoft Edge neural voices via `node-edge-tts`. It returns MP3 only and sends the text to Microsoft.
- **Offline (backup):** `System.Speech` on Windows (Zira or David), `say` on macOS (Samantha or Daniel, or the system voice when that one isn't installed), `espeak-ng` on Linux (`en+f3` or `en`). It uses the gender of the chosen voice (`genderOf` in `lib/voices.mjs`, female when unknown), so a reply never switches from a woman's voice to a man's.
- **Switching (`FallbackEngine`, one per reply):**
  - The first online try runs alongside a TCP probe of the voice server (`lib/reachability.mjs`). If the probe finds the server unreachable first, the offline voice starts at once. Being offline costs no waiting, and being online costs nothing extra. The probed host is `EDGE_HOST` in `engines.mjs`, the server `node-edge-tts` connects to; check it again whenever that package is updated.
  - A refusal (`Unexpected server response`, such as a 429) is retried once after a short wait. Only that sentence falls back.
  - Any other failure (timeout, network error) sends the rest of the reply to the offline voice.
- If the player can't decode MP3 (Linux without `mpv`/`ffplay`/`mpg123`/`cvlc`), only the offline voice is used.

## Playback (`lib/player.mjs`)
| OS | Player | Pause / resume |
|---|---|---|
| Windows | One warm PowerShell process hosting .NET `MediaPlayer`, driven over stdin/stdout | native |
| macOS | `afplay` | SIGSTOP / SIGCONT |
| Linux | `mpv`, `ffplay`, `mpg123` or `cvlc` for MP3; else `paplay` / `aplay` for WAV | SIGSTOP / SIGCONT |

Audio files go to `<tmp>/vox`, are deleted after they play, and leftovers older than 10 minutes are removed when a worker starts.

## Product rules (non-negotiable)
- Zero setup: it works with defaults. Never require extra installs beyond Node.js.
- Silent success: no banners or confirmations. Only short replies such as "Paused." / "Stopped.".
- User-facing text is calm and short, and lives in `lib/messages.mjs`. Never say "error" or "failed", or show a stack trace. Details go to `<tmp>/vox/vox.log`.
- Self-heal quietly (offline, stale state). Speak up only when the user must act.
- Never block or crash Claude Code: hooks and scripts exit quickly and log their failures.
- YAGNI: no feature, setting or abstraction without a user-facing reason.

## Settings
`voice` (default `en-US-AriaNeural`), `speed` (0.5 to 2, default 1) and `auto` (default off), in `~/.vox/config.json`. `lib/settings.mjs` validates every field, and an invalid stored field falls back to its default.

## Code conventions
- Small single-purpose classes in `scripts/lib/`. Keep `vox.mjs` and the entry points as wiring.
- OS differences live only in `player.mjs`, `engines.mjs` and `browser-opener.mjs`. Nothing else checks `process.platform`.
- Inject time, randomness, I/O and network (`wait`, `connect`, runners, stores) so behavior is testable without them.
- In `hooks/`, the engine's `$` may only be called, never stored or passed on. Pass plain functions into classes (see `compose` there).
- Follow the global coding standards (OOP where it suits, SOLID, KISS, DRY, YAGNI) with judgment.

## Testing
- Test behavior, with fakes for the network, processes and time. Every bug fix gets a regression test.
- Test the text cleaner thoroughly (code blocks, inline code, links, tables, lists).
- Only Windows can be run here. Review macOS and Linux paths by reading, and say so in the README.

## Releasing
Bump `version` in `.claude-plugin/plugin.json` and `package.json` together, following semver. Claude Code only updates users whose computed version differs, so a push without a bump reaches nobody. Keep `package-lock.json` committed: Claude Code installs the dependencies from it.

## Privacy
The online voice sends the text being read to Microsoft. The README must say so. The offline voice stays on the machine.

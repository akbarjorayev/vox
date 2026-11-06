import type { EngineInterface, Register } from 'claude-code'

// /vox, answered by the interface itself: no model turn, so no tokens.
// The real work is done by scripts/vox.mjs; this module only routes to it.
// The engine's `$` may only be called, never stored or passed on, so the
// classes below receive plain functions instead (see `compose`).

const SETTINGS_PANE = 'vox-settings'
const SAMPLE_TEXT = 'Hello, this is how I sound.'
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]
const VOICE_HOTKEYS = [...'1234567890']
const DIALOG_ROWS = 17
const ROW_LABEL_WIDTH = 12
const COLUMN_GAP = '   '
const SELECTED = '● '
const UNSELECTED = '○ '
const MARKER = SELECTED
const OPEN_CHEVRON = ' ▾'
const CLOSED_CHEVRON = ' ▸'
const CONTROL_WORDS = ['pause', 'resume', 'stop', 'status', 'help']
// Typed alone, "." stops: the quickest thing to type, and a dot ends things.
const SHORTCUTS: Readonly<Record<string, string>> = { '.': 'stop' }
const NODE_MISSING = 'Vox needs Node.js to speak. You can get it at nodejs.org.'
const COULD_NOT_SPEAK = "Vox couldn't speak this time."
const NOTHING_TO_READ = 'Nothing to read yet.'

type Voice = { id: string; name: string; language: string; gender: string }
type Settings = { voice: string; speed: number; auto: boolean }
type Output = { text?: string }
type Elements = ReturnType<EngineInterface['ui']['resolve']>

type RunProcess = (argv: readonly string[], stdin?: string) => Promise<{ stdout: string }>
type ReadMessages = () => Promise<readonly { role: string; text: string }[]>

class NodeUnavailableError extends Error {}

// Runs the vox script and hands back what it printed.
class VoxCli {
  private readonly runProcess: RunProcess
  private readonly scriptPath: string

  constructor(runProcess: RunProcess, scriptPath: string) {
    this.runProcess = runProcess
    this.scriptPath = scriptPath
  }

  async run(args: readonly string[], stdin?: string): Promise<string> {
    try {
      const { stdout } = await this.runProcess(['node', this.scriptPath, ...args], stdin)
      return stdout.trim()
    } catch {
      // The process could not start at all: Node.js is not installed.
      throw new NodeUnavailableError()
    }
  }

  speak(text: string): Promise<string> {
    return this.run(['speak'], text)
  }

  async settings(): Promise<Settings> {
    const lines = (await this.run(['settings'])).split('\n')
    const valueOf = (key: string) => lines.find((line) => line.startsWith(`${key}:`))?.slice(key.length + 1).trim()
    return {
      voice: valueOf('voice') ?? '',
      speed: Number(valueOf('speed') ?? 1),
      auto: valueOf('auto') === 'on',
    }
  }

  async voices(): Promise<Voice[]> {
    return JSON.parse(await this.run(['voices']))
  }
}

// Finds the last thing Claude said, for a bare /vox.
class ReplyReader {
  private readonly readMessages: ReadMessages

  constructor(readMessages: ReadMessages) {
    this.readMessages = readMessages
  }

  async last(): Promise<string | undefined> {
    const messages = await this.readMessages()
    return [...messages].reverse().find((message) => message.role === 'assistant' && message.text.trim())?.text
  }
}

// Turns what was typed after /vox into an action.
class VoxCommand {
  private readonly cli: VoxCli
  private readonly replies: ReplyReader
  private readonly openSettings: () => Promise<unknown>

  constructor(cli: VoxCli, replies: ReplyReader, openSettings: () => Promise<unknown>) {
    this.cli = cli
    this.replies = replies
    this.openSettings = openSettings
  }

  async run(args: string): Promise<Output> {
    try {
      return await this.dispatch(args.trim())
    } catch (error) {
      return { text: error instanceof NodeUnavailableError ? NODE_MISSING : COULD_NOT_SPEAK }
    }
  }

  private async dispatch(typed: string): Promise<Output> {
    const args = SHORTCUTS[typed] ?? typed
    const [word = '', ...rest] = args.split(/\s+/)

    if (word === '') return this.speakLastReply()
    if (word === 'settings' && rest.length === 0) {
      await this.openSettings()
      return {}
    }
    if (word === 'settings' || CONTROL_WORDS.includes(word)) return this.show(await this.cli.run([word, ...rest]))
    return this.show(await this.cli.speak(args))
  }

  private async speakLastReply(): Promise<Output> {
    const reply = await this.replies.last()
    return reply ? this.show(await this.cli.speak(reply)) : { text: NOTHING_TO_READ }
  }

  // A silent success shows nothing at all.
  private show(output: string): Output {
    return output ? { text: output } : {}
  }
}

// Reads each finished reply aloud when the user has turned auto-speak on.
class AutoSpeaker {
  private readonly cli: VoxCli

  constructor(cli: VoxCli) {
    this.cli = cli
  }

  // Never throws: a problem here must not disturb the end of a turn.
  async speakIfOn(reply: string): Promise<void> {
    try {
      if ((await this.cli.settings()).auto) await this.cli.speak(reply)
    } catch {
      // Staying quiet is better than interrupting the conversation.
    }
  }
}

// Whether the dialog's list of voices is showing. Kept here, outside the
// dialog, because the dialog is built afresh for every redraw.
class VoiceListState {
  private shown = false

  get isShown(): boolean {
    return this.shown
  }

  toggle(): void {
    this.shown = !this.shown
  }

  hide(): void {
    this.shown = false
  }
}

// Lays the dialog's rows out in columns of equal width: every name, language
// and gender is padded to the widest in the list, and every row is padded to
// the same total width, so the highlighted row's bar is the same length
// whichever row it is on.
class RowLayout {
  private readonly nameWidth: number
  private readonly languageWidth: number
  private readonly genderWidth: number
  private readonly rowWidth: number

  constructor(voices: readonly Voice[]) {
    this.nameWidth = Math.max(...voices.map((voice) => voice.name.length))
    this.languageWidth = Math.max(...voices.map((voice) => voice.language.length))
    this.genderWidth = Math.max(...voices.map((voice) => voice.gender.length))
    this.rowWidth = ROW_LABEL_WIDTH + this.nameWidth + this.detailWidth
  }

  private get detailWidth(): number {
    return COLUMN_GAP.length + this.languageWidth + COLUMN_GAP.length + this.genderWidth
  }

  // The space between a row's left edge and its value, used by every row.
  label(name: string): string {
    return name.padEnd(ROW_LABEL_WIDTH)
  }

  // The empty space that carries a row's text out to the common width.
  filler(textLength: number): string {
    return ' '.repeat(Math.max(0, this.rowWidth - textLength))
  }

  // The part of a list entry that is not the marker: the name, padded.
  name(voice: Voice): string {
    return voice.name.padEnd(this.nameWidth)
  }

  detail(voice: Voice): string {
    return `${COLUMN_GAP}${voice.language.padEnd(this.languageWidth)}${COLUMN_GAP}${voice.gender.padEnd(this.genderWidth)}`
  }

  // How far in a list entry's marker sits, so the names line up under the voice row's value.
  get markerIndent(): string {
    return ' '.repeat(ROW_LABEL_WIDTH - MARKER.length)
  }
}

// A compact summary of the three settings. The voice list opens beneath the
// voice row on demand; choosing a voice, speed or auto-speak is one key press,
// and anything that can be heard plays a short sample.
class SettingsDialog {
  private readonly cli: VoxCli
  private readonly voiceList: VoiceListState
  private readonly redraw: () => void
  private readonly showToast: (text: string) => void

  constructor(cli: VoxCli, voiceList: VoiceListState, redraw: () => void, showToast: (text: string) => void) {
    this.cli = cli
    this.voiceList = voiceList
    this.redraw = redraw
    this.showToast = showToast
  }

  async render({ Box, Text, Button }: Elements) {
    const [settings, voices] = await Promise.all([this.cli.settings(), this.cli.voices()])
    const layout = new RowLayout(voices)
    const current = voices.find((voice) => voice.id === settings.voice)
    const voiceName = current?.name ?? settings.voice
    const speed = `${settings.speed}×`
    const auto = settings.auto ? 'on' : 'off'
    const isListShown = this.voiceList.isShown

    // `plain` draws a row as `1: label` with no [ ] frame; the focused row is inverted.
    return (
      <Box flexDirection="column">
        <Button key="voice" plain autoFocus hotkey="v" label={`Voice: ${voiceName}`} onPress={() => this.toggleVoiceList()}>
          {layout.label('Voice')}
          <Text bold>{voiceName}</Text>
          {layout.filler(ROW_LABEL_WIDTH + voiceName.length + CLOSED_CHEVRON.length)}
          {isListShown ? OPEN_CHEVRON : CLOSED_CHEVRON}
        </Button>
        {isListShown &&
          voices.map((voice, index) => (
            <Button
              key={`voice-${voice.id}`}
              plain
              hotkey={VOICE_HOTKEYS[index]}
              label={`${voice.name} ${voice.language} ${voice.gender}`}
              onPress={() => void this.change('voice', voice.id, true)}
            >
              {`${layout.markerIndent}${voice.id === settings.voice ? SELECTED : UNSELECTED}`}
              <Text bold={voice.id === settings.voice}>{layout.name(voice)}</Text>
              <Text dimColor>{layout.detail(voice)}</Text>
            </Button>
          ))}
        <Button key="speed" plain hotkey="s" label={`Speed: ${speed}`} onPress={() => void this.changeSpeed(settings)}>
          {layout.label('Speed')}
          <Text bold>{speed}</Text>
          {layout.filler(ROW_LABEL_WIDTH + speed.length)}
        </Button>
        <Button key="auto" plain hotkey="a" label={`Auto-speak: ${auto}`} onPress={() => void this.toggleAuto(settings)}>
          {layout.label('Auto-speak')}
          <Text bold>{auto}</Text>
          {layout.filler(ROW_LABEL_WIDTH + auto.length)}
        </Button>
        <Text> </Text>
        <Text dimColor>{isListShown ? 'Use ↑ ↓ to move, Enter to pick a voice. Esc closes.' : 'Use ↑ ↓ to move, Enter to change. Esc closes.'}</Text>
      </Box>
    )
  }

  private toggleVoiceList(): void {
    this.voiceList.toggle()
    this.redraw()
  }

  private changeSpeed(settings: Settings): Promise<void> {
    const next = SPEEDS.find((speed) => speed > settings.speed) ?? SPEEDS[0]
    return this.change('speed', String(next), true)
  }

  private toggleAuto(settings: Settings): Promise<void> {
    return this.change('auto', settings.auto ? 'off' : 'on', false)
  }

  private async change(key: string, value: string, playSample: boolean): Promise<void> {
    try {
      await this.cli.run(['settings', key, value])
      this.redraw()
      if (playSample) await this.cli.speak(SAMPLE_TEXT)
    } catch {
      this.showToast(COULD_NOT_SPEAK)
    }
  }
}

const voiceList = new VoiceListState()

// Builds the classes from plain functions that call the engine at their own call site.
function compose($: EngineInterface) {
  const cli = new VoxCli(
    (argv, stdin) => $.process.run(argv, { stdin }),
    `${$.plugin.root}/scripts/vox.mjs`,
  )
  const dialog = new SettingsDialog(
    cli,
    voiceList,
    () => $.ui.invalidate('ui.render'),
    (text) => $.ui.toast(text),
  )
  const command = new VoxCommand(cli, new ReplyReader(() => $.session.messages()), () => {
    // Every time the dialog is opened it starts out compact.
    voiceList.hide()
    return $.ui.open({ id: SETTINGS_PANE, title: 'Vox settings', focus: true, closeOnEscape: true, rows: DIALOG_ROWS })
  })
  return { command, dialog, autoSpeaker: new AutoSpeaker(cli) }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'vox',
      description: 'Read aloud last response',
      argumentHint: '[pause | stop | text]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'vox' }, ($, e) => compose($).command.run(e.args))

  on('ui.render', { component: 'Pane', requestId: SETTINGS_PANE }, ($, e) => compose($).dialog.render($.ui.resolve(e)))

  // Only the main conversation's finished answers, never a subagent's or an interrupted turn's.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.reason === 'answer' && e.answer.trim()) {
      await compose($).autoSpeaker.speakIfOn(e.answer)
    }
    return result
  })
}

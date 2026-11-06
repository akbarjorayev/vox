import { expect, test } from 'claude-code/testing'

const SETTINGS = 'voice: en-US-AriaNeural\nspeed: 1'
const VOICES = JSON.stringify([
  { id: 'en-US-AriaNeural', name: 'Aria', language: 'English (US)', gender: 'female' },
  { id: 'uz-UZ-MadinaNeural', name: 'Madina', language: 'Uzbek', gender: 'female' },
  { id: 'en-GB-RyanNeural', name: 'Ryan', language: 'English (UK)', gender: 'male' },
])

type Call = { argv: readonly string[]; stdin?: string }

// Stands for the engine beneath the plugin: records every process the mod
// starts and answers with what the real vox script prints.
function fakeVox(on: (event: 'process.run', hook: (...args: any[]) => unknown) => unknown, output = '') {
  const calls: Call[] = []
  on('process.run', (_: unknown, e: { argv: readonly string[]; init?: { stdin?: string } }) => {
    const [, , command, key] = e.argv
    calls.push({ argv: e.argv.slice(2), stdin: e.init?.stdin })
    const stdout = command === 'settings' && key === undefined ? SETTINGS : command === 'voices' ? VOICES : output
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  return calls
}

async function start($: any, on: any) {
  on('command.register', () => ({ value: { command: 'vox' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

test('pause runs the script and shows what it printed', async ($, on) => {
  const calls = fakeVox(on, 'Paused.')
  await start($, on)

  const result = await $.command.run({ command: 'vox', args: 'pause' })

  expect(result.text).toBe('Paused.')
  expect(calls[0].argv).toEqual(['pause'])
})

test('a dot is a quick way to stop', async ($, on) => {
  const calls = fakeVox(on, 'Stopped.')
  await start($, on)

  const result = await $.command.run({ command: 'vox', args: ' . ' })

  expect(result.text).toBe('Stopped.')
  expect(calls[0].argv).toEqual(['stop'])
})

test('a dot inside text is still read aloud', async ($, on) => {
  const calls = fakeVox(on)
  await start($, on)

  await $.command.run({ command: 'vox', args: '. is a dot' })

  expect(calls[0]).toEqual({ argv: ['speak'], stdin: '. is a dot' })
})

// A bare /vox reads the transcript with $.session.messages(), which the test kit
// does not provide, so that one path is checked in a real session instead.

test('text after /vox is spoken as given', async ($, on) => {
  const calls = fakeVox(on)
  await start($, on)

  await $.command.run({ command: 'vox', args: 'Hello there, friend' })

  expect(calls[0]).toEqual({ argv: ['speak'], stdin: 'Hello there, friend' })
})

test('settings with a value is passed to the script', async ($, on) => {
  const calls = fakeVox(on, 'Done.')
  await start($, on)

  const result = await $.command.run({ command: 'vox', args: 'settings speed 1.3' })

  expect(result.text).toBe('Done.')
  expect(calls[0].argv).toEqual(['settings', 'speed', '1.3'])
})

test('bare settings opens the dialog and prints nothing', async ($, on) => {
  fakeVox(on)
  const opened: unknown[] = []
  on('command.register', () => ({ value: { command: 'vox' } }))
  on('ui.open', (_: unknown, e: unknown) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const result = await $.command.run({ command: 'vox', args: 'settings' })

  expect(result.text).toBeUndefined()
  expect(opened).toHaveLength(1)
  expect(opened[0]).toMatchObject({ id: 'vox-settings', focus: true, closeOnEscape: true })
})

test('without Node.js the answer is calm and says how to get it', async ($, on) => {
  on('process.run', () => {
    throw new Error('spawn node ENOENT')
  })
  await start($, on)

  const result = await $.command.run({ command: 'vox', args: 'pause' })

  expect(result.text).toBe('Vox needs Node.js to speak. You can get it at nodejs.org.')
})

const PANE = {
  plugin: 'vox',
  component: 'Pane',
  requestId: 'vox-settings',
  props: { title: 'Vox settings', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// Opens the dialog the way a person does, which also starts it compact.
async function openDialog($: any, on: any) {
  await start($, on)
  await $.command.run({ command: 'vox', args: 'settings' })
  return $.ui.mount({ ...PANE, surface: 'terminal' })
}

test('the dialog starts compact: the voice row shows the current voice, no list', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)

  const voice = await ui.find({ type: 'Button', key: 'voice' })
  expect(voice?.props.label).toBe('Voice: Aria')
  expect(voice?.props.hotkey).toBe('v')
  expect(await ui.find({ type: 'Button', key: 'voice-en-GB-RyanNeural' })).toBeUndefined()
  await ui.unmount()
})

test('the voice row names only the active voice, not its language or gender', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)

  const text = (await ui.find({ type: 'Button', key: 'voice' }))?.text ?? ''

  expect(text).toContain('Aria')
  expect(text).not.toMatch(/English|female|male/)
  await ui.unmount()
})

test('rows are drawn plain, without the [ ] frame', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)
  await ui.press({ key: 'voice' })

  for (const key of ['voice', 'voice-en-US-AriaNeural', 'speed', 'auto']) {
    expect((await ui.find({ type: 'Button', key }))?.props.plain).toBe(true)
  }
  await ui.unmount()
})

test('every row is the same width, so the highlight bar is even', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)
  await ui.press({ key: 'voice' })

  const keys = ['voice', 'voice-en-US-AriaNeural', 'voice-uz-UZ-MadinaNeural', 'voice-en-GB-RyanNeural', 'speed', 'auto']
  const widths = await Promise.all(keys.map(async (key) => (await ui.find({ type: 'Button', key }))?.text.length))

  expect(new Set(widths).size).toBe(1)
  await ui.unmount()
})

test('pressing the voice row shows the list, with number keys and the current voice marked', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)

  await ui.press({ key: 'voice' })

  const aria = await ui.find({ type: 'Button', key: 'voice-en-US-AriaNeural' })
  const madina = await ui.find({ type: 'Button', key: 'voice-uz-UZ-MadinaNeural' })
  expect(aria?.props.hotkey).toBe('1')
  expect(madina?.props.hotkey).toBe('2')
  expect(aria?.text).toContain('●')
  expect(madina?.text).toContain('○')
  await ui.unmount()
})

test('pressing the voice row again hides the list', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)

  await ui.press({ key: 'voice' })
  await ui.press({ key: 'voice' })

  expect(await ui.find({ type: 'Button', key: 'voice-en-GB-RyanNeural' })).toBeUndefined()
  await ui.unmount()
})

test('the columns line up whatever the length of a name or language', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)
  await ui.press({ key: 'voice' })

  const rows = await Promise.all(
    ['en-US-AriaNeural', 'uz-UZ-MadinaNeural', 'en-GB-RyanNeural'].map((id) => ui.find({ type: 'Button', key: `voice-${id}` })),
  )
  const languageColumns = rows.map((row) => row?.text.search(/English|Uzbek/))
  const genderColumns = rows.map((row) => row?.text.search(/female|male/))

  expect(new Set(languageColumns).size).toBe(1)
  expect(new Set(genderColumns).size).toBe(1)
  await ui.unmount()
})

test('the voice list opens compact again each time the dialog is opened', async ($, on) => {
  fakeVox(on)
  const first = await openDialog($, on)
  await first.press({ key: 'voice' })
  await first.unmount()

  await $.command.run({ command: 'vox', args: 'settings' })
  const second = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await second.find({ type: 'Button', key: 'voice-en-GB-RyanNeural' })).toBeUndefined()
  await second.unmount()
})

test('the first row is highlighted from the start, so Enter works at once', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)

  expect((await ui.find({ type: 'Button', key: 'voice' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
})

test('the hint tells the user to move with the arrows and change with Enter', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)

  const hint = (await ui.find({ type: 'Text', text: /Esc closes/ }))?.text ?? ''

  expect(hint).toContain('↑ ↓')
  expect(hint).toContain('Enter to change')
  expect(hint).not.toMatch(/←|→/)
  await ui.unmount()
})

test('a blank line separates the settings from the hint', async ($, on) => {
  fakeVox(on)
  const ui = await openDialog($, on)

  const texts = (await ui.findAll({ type: 'Text' })).map((text) => text.text)
  const hint = texts.findIndex((text) => text.includes('Esc closes'))

  expect(hint).toBeGreaterThan(0)
  expect(texts[hint - 1].trim()).toBe('')
  await ui.unmount()
})

test('the dialog shows speed and auto-speak with their own letter keys', async ($, on) => {
  fakeVox(on)
  await start($, on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  const speed = await ui.find({ type: 'Button', key: 'speed' })
  const auto = await ui.find({ type: 'Button', key: 'auto' })
  expect(speed?.props.label).toBe('Speed: 1×')
  expect(speed?.props.hotkey).toBe('s')
  expect(auto?.props.label).toBe('Auto-speak: off')
  expect(auto?.props.hotkey).toBe('a')
  await ui.unmount()
})

test('pressing a voice in the open list picks it directly and plays a sample', async ($, on) => {
  const calls = fakeVox(on)
  const ui = await openDialog($, on)
  await ui.press({ key: 'voice' })

  await ui.press({ key: 'voice-en-GB-RyanNeural' })

  expect(calls.map((c) => c.argv.join(' '))).toContain('settings voice en-GB-RyanNeural')
  expect(calls).toContainEqual({ argv: ['speak'], stdin: 'Hello, this is how I sound.' })
  await ui.unmount()
})

test('pressing the speed row moves to the next speed and plays a sample', async ($, on) => {
  const calls = fakeVox(on)
  await start($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'speed' })

  expect(calls.map((c) => c.argv.join(' '))).toContain('settings speed 1.25')
  expect(calls).toContainEqual({ argv: ['speak'], stdin: 'Hello, this is how I sound.' })
  await ui.unmount()
})

test('pressing the auto row turns auto-speak on without playing a sample', async ($, on) => {
  const calls = fakeVox(on)
  await start($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'auto' })

  expect(calls.map((c) => c.argv.join(' '))).toContain('settings auto on')
  expect(calls.some((c) => c.argv[0] === 'speak')).toBe(false)
  await ui.unmount()
})

// Auto-speak listens to turn.complete, which the test kit cannot raise, so that
// one hook is checked in a real session instead.

// Every sentence the user can see lives here: calm, short, no jargon.
export const MESSAGES = Object.freeze({
  paused: 'Paused.',
  stopped: 'Stopped.',
  saved: 'Done.',
  ready: 'Ready.',
  playing: 'Playing.',
  nothingPlaying: 'Nothing is playing.',
  noSpeaker: "Vox can't find a speaker here.",
  couldntSpeak: "Vox couldn't speak this time.",
  badSetting: "That setting doesn't look right.",
  nothingToSay: 'Nothing to say yet. Try: speak "Hello there"',
  openLink: 'Open this link in your browser:',
  couldntOpenSettings: "Vox couldn't open the settings page.",
  unknownCommand: 'Not sure about that one. Try: help',
  help: `Vox reads Claude's replies aloud.

  speak [text]        Read text aloud (or the last reply, in Claude Code)
  pause               Pause
  resume              Continue
  stop                Stop (/vox . for short)
  status              Is it playing?
  settings            Show your voice, speed and auto-speak
  settings page       Change them on a page in your browser
  settings speed 1.3  Set one directly (speed 0.5 to 2, voice <name>, auto on/off)
  help                Show this list`,
});

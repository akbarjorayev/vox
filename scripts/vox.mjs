#!/usr/bin/env node
// Command line entry point. Reads the command, runs it, prints the result.
import { FileLogger } from './lib/logger.mjs';
import { createVox } from './lib/compose.mjs';
import { MESSAGES } from './lib/messages.mjs';
import { LOG_FILE } from './lib/paths.mjs';
import { VOICES } from './lib/voices.mjs';

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let input = '';
  for await (const part of process.stdin) input += part;
  return input;
}

async function run(vox, [command = 'speak', ...rest]) {
  switch (command) {
    case 'speak': {
      const text = rest.length ? rest.join(' ') : await readStdin();
      // Typed in a terminal with no text: say how to use it instead of staying silent.
      return !text.trim() && process.stdin.isTTY ? MESSAGES.nothingToSay : vox.speak(text);
    }
    case 'pause':
      return vox.pause();
    case 'resume':
      return vox.resume();
    case 'stop':
      return vox.stop();
    case 'status':
      return vox.status();
    case 'settings':
      if (rest[0] === 'page') return vox.openSettingsPage();
      return rest.length >= 2 ? vox.changeSetting(rest[0], rest.slice(1).join(' ')) : vox.settings();
    case 'voices':
      // Not in `help`: it feeds the in-app settings dialog.
      return JSON.stringify(VOICES);
    case 'help':
    case '--help':
    case '-h':
      return MESSAGES.help;
    default:
      return MESSAGES.unknownCommand;
  }
}

try {
  const message = await run(createVox(), process.argv.slice(2));
  if (message) console.log(message);
} catch (error) {
  new FileLogger(LOG_FILE).log('command failed:', error);
  console.log(MESSAGES.couldntSpeak);
}

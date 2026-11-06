import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEMP_DIR = join(tmpdir(), 'vox');
export const LOG_FILE = join(TEMP_DIR, 'vox.log');
export const STATE_FILE = join(TEMP_DIR, 'state.json');
export const REPORT_FILE = join(TEMP_DIR, 'report.txt');
export const SETTINGS_REPORT_FILE = join(TEMP_DIR, 'settings-report.txt');
export const CONFIG_FILE = join(homedir(), '.vox', 'config.json');

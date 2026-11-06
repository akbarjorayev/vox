// Turns a markdown reply into plain prose that sounds natural when spoken.

const CODE_BLOCK = 'Code block.';
const TABLE = 'Table.';
const MAX_PATH_SEGMENTS = 5;
const MAX_SEGMENT_LENGTH = 30;
const MAX_SEGMENT_DIGITS = 2;
const URL_PATTERN = /https?:\/\/[^\s<>[\]]+/g;
const TRAILING_PUNCTUATION = /^(.*?)([.,;:!?'")\]]*)$/;
const INLINE_MAX_LENGTH = 40;
const INLINE_MAX_SYMBOL_RATIO = 0.15;

export function clean(markdown) {
  let text = String(markdown ?? '').replace(/\r\n?/g, '\n');

  text = replaceFencedCode(text);
  text = replaceTables(text);
  text = text.replace(/`([^`\n]+)`/g, (_, code) => speakInlineCode(code));
  text = stripMarkdown(text);
  text = removeEmoji(text);

  return toSentences(text);
}

// Splits spoken text into sentence-sized chunks so playback can start quickly.
export function chunk(text, maxLength = 300) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const sentence of sentences.flatMap((s) => splitLong(s, maxLength))) {
    if (current && current.length + sentence.length + 1 > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function speakInlineCode(code) {
  const source = code.trim().replace(/\(\)$/, '');
  if (/^https?:\/\//.test(source)) return speakUrl(source) || 'link';

  const unspeakable = (source.match(/[^A-Za-z0-9_.\-/\\ ]/g) ?? []).length;
  const tooLong = source.length > INLINE_MAX_LENGTH;
  const tooSymbolic = unspeakable / Math.max(source.length, 1) > INLINE_MAX_SYMBOL_RATIO;

  if (!source || tooLong || tooSymbolic) return 'code';

  return source
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' dot ')
    .replace(/\//g, ' slash ')
    .replace(/\\/g, ' backslash ')
    .replace(/[_-]/g, ' ')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The site and the readable part of its path are worth hearing, the query and
// fragment are not: "https://www.google.com/search?q=x" is "google dot com
// slash search". Punctuation that followed the link in the sentence stays.
export function speakUrl(url) {
  const [, address, punctuation] = url.match(TRAILING_PUNCTUATION);
  let parsed;
  try {
    parsed = new URL(address);
  } catch {
    return 'link';
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const path = readablePathSegments(parsed.pathname);
  return [host, ...path].map(spokenWords).join(' slash ') + punctuation;
}

// Reads path pieces like "blog" and "hashing-basics", and stops at the first
// piece that looks like an id or hash, since spelling those out helps nobody.
function readablePathSegments(pathname) {
  const readable = [];
  for (const segment of pathname.split('/').filter(Boolean)) {
    if (!looksReadable(segment) || readable.length === MAX_PATH_SEGMENTS) break;
    readable.push(segment);
  }
  return readable;
}

function looksReadable(segment) {
  const digits = (segment.match(/\d/g) ?? []).length;
  return /^[A-Za-z][A-Za-z0-9_.-]*$/.test(segment) && segment.length <= MAX_SEGMENT_LENGTH && digits <= MAX_SEGMENT_DIGITS;
}

function spokenWords(text) {
  return text.replace(/\./g, ' dot ').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function replaceFencedCode(text) {
  const fenced = /^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:^[ \t]*\1[^\n]*$|(?![\s\S]))/gm;
  return text.replace(fenced, `\n${CODE_BLOCK}\n`);
}

function replaceTables(text) {
  const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
  const lines = text.split('\n');
  const out = [];

  for (const line of lines) {
    if (!isTableLine(line)) {
      out.push(line);
    } else if (out[out.length - 1] !== TABLE) {
      out.push(TABLE);
    }
  }
  return out.join('\n');
}

function stripMarkdown(text) {
  return text
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(URL_PATTERN, speakUrl)
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>+[ \t]?/gm, '')
    .replace(/^[ \t]*([-*+]|\d+[.)])[ \t]+/gm, '')
    .replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1');
}

function removeEmoji(text) {
  return text.replace(/[\p{Extended_Pictographic}️‍]/gu, '');
}

// One line per sentence-ish unit, each ending in punctuation so the voice pauses.
function toSentences(text) {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => (/[.!?:;,]$/.test(line) ? line : `${line}.`));

  return collapseMarkers(lines).join(' ');
}

// Back-to-back blocks are announced once: "2 code blocks.", never repeated.
function collapseMarkers(lines) {
  const result = [];
  for (let i = 0; i < lines.length; ) {
    const marker = lines[i];
    let run = 1;
    while ((marker === CODE_BLOCK || marker === TABLE) && lines[i + run] === marker) run++;

    result.push(marker === CODE_BLOCK && run > 1 ? `${run} code blocks.` : marker);
    i += run;
  }
  return result;
}

function splitLong(sentence, maxLength) {
  if (sentence.length <= maxLength) return [sentence];

  const parts = [];
  let rest = sentence;
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength);
    const cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf(' '));
    const at = cut > 0 ? cut + 1 : maxLength;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, chunk, speakInlineCode } from '../scripts/lib/clean.mjs';

test('plain prose passes through', () => {
  assert.equal(clean('Hello there. How are you?'), 'Hello there. How are you?');
});

test('empty and nullish input give empty text', () => {
  assert.equal(clean(''), '');
  assert.equal(clean(null), '');
  assert.equal(clean(undefined), '');
});

test('fenced code block becomes "Code block."', () => {
  const input = 'Here is the fix:\n```js\nconst a = 1;\n```\nThat should work.';
  assert.equal(clean(input), 'Here is the fix: Code block. That should work.');
});

test('consecutive code blocks are counted', () => {
  assert.equal(clean('```\na\n```\n\n```\nb\n```'), '2 code blocks.');
  assert.equal(clean('```\na\n```\n```\nb\n```\n```\nc\n```'), '3 code blocks.');
});

test('code blocks separated by prose are both announced', () => {
  const input = '```\na\n```\nThen:\n```\nb\n```';
  assert.equal(clean(input), 'Code block. Then: Code block.');
});

test('tilde fences and unterminated fences are handled', () => {
  assert.equal(clean('~~~\nx\n~~~'), 'Code block.');
  assert.equal(clean('Look:\n```\nnever closed'), 'Look: Code block.');
});

test('inline code: plain names are read as words', () => {
  assert.equal(speakInlineCode('config'), 'config');
  assert.equal(speakInlineCode('camelCase'), 'camel Case');
  assert.equal(speakInlineCode('snake_case'), 'snake case');
  assert.equal(speakInlineCode('getUser()'), 'get User');
});

test('inline code: dots and slashes are spoken', () => {
  assert.equal(speakInlineCode('config.json'), 'config dot json');
  assert.equal(speakInlineCode('src/lib'), 'src slash lib');
});

test('inline code: long or symbol-heavy code becomes "code"', () => {
  assert.equal(speakInlineCode('a => b.map(x => x * 2)'), 'code');
  assert.equal(speakInlineCode('{}'), 'code');
  assert.equal(speakInlineCode('x'.repeat(41)), 'code');
  assert.equal(speakInlineCode('   '), 'code');
});

test('inline code inside a sentence', () => {
  assert.equal(clean('Set `speed` to fast.'), 'Set speed to fast.');
});

test('markdown links keep their text and drop the address', () => {
  assert.equal(clean('See [the docs](https://example.com/a) now.'), 'See the docs now.');
});

test('bare links are read as the site name', () => {
  assert.equal(clean('Visit https://example.com today.'), 'Visit example dot com today.');
  assert.equal(clean('Open https://oriel.akbarjon.uz now'), 'Open oriel dot akbarjon dot uz now.');
  assert.equal(clean('Open https://www.google.com now'), 'Open google dot com now.');
});

test('the readable path is read as slash parts', () => {
  assert.equal(clean('Go to https://oriel.akbarjon.uz/about now'), 'Go to oriel dot akbarjon dot uz slash about now.');
  assert.equal(
    clean('Read https://oriel.akbarjon.uz/blog/hashing today'),
    'Read oriel dot akbarjon dot uz slash blog slash hashing today.',
  );
  assert.equal(clean('See https://example.com/blog/hashing-basics'), 'See example dot com slash blog slash hashing basics.');
  assert.equal(clean('Get https://example.com/files/report.pdf'), 'Get example dot com slash files slash report dot pdf.');
});

test('a trailing slash adds nothing', () => {
  assert.equal(clean('Open https://example.com/blog/'), 'Open example dot com slash blog.');
});

test('the query string and fragment are never read', () => {
  assert.equal(clean('Try https://www.google.com/search?q=a&b=c#top'), 'Try google dot com slash search.');
});

test('a very long search link is read as its site and readable path', () => {
  const long =
    'https://www.google.com/search?num=10&newwindow=1&sca_esv=857a02d6a3e4dd64&udm=vids&q=claude+code+skill+for+oop&biw=1536';
  assert.equal(clean(`Look at ${long} please`), 'Look at google dot com slash search please.');
});

test('reading stops at a path piece that looks like an id or hash', () => {
  assert.equal(clean('Open https://example.com/user/8f3a9c21d4e7/settings'), 'Open example dot com slash user.');
  assert.equal(clean('Open https://example.com/2024/05/post'), 'Open example dot com.');
});

test('only the first few path pieces are read', () => {
  assert.equal(
    clean('Open https://example.com/a/b/c/d/e/f/g'),
    'Open example dot com slash a slash b slash c slash d slash e.',
  );
});

test('punctuation after a link stays in the sentence', () => {
  assert.equal(clean('See https://example.com/page.'), 'See example dot com slash page.');
  assert.equal(clean('Go to https://example.com, then stop.'), 'Go to example dot com, then stop.');
  assert.equal(clean('(see https://example.com)'), '(see example dot com).');
});

test('links in angle brackets and in backticks are read the same way', () => {
  assert.equal(clean('Read <https://oriel.akbarjon.uz/about> first.'), 'Read oriel dot akbarjon dot uz slash about first.');
  assert.equal(clean('Run `https://example.com/x` now'), 'Run example dot com slash x now.');
});

test('a link whose text is a link is read once', () => {
  assert.equal(clean('[https://example.com/a](https://example.com/a)'), 'example dot com slash a.');
});

test('images keep alt text', () => {
  assert.equal(clean('![diagram](a.png)'), 'diagram.');
});

test('headings, bold, italics and quotes lose their markers', () => {
  assert.equal(clean('# Title\n**bold** and *italic* and ~~gone~~'), 'Title. bold and italic and gone.');
  assert.equal(clean('> quoted line'), 'quoted line.');
});

test('lists become sentences', () => {
  assert.equal(clean('- one\n- two\n1. three'), 'one. two. three.');
});

test('tables are announced once', () => {
  const input = '| a | b |\n|---|---|\n| 1 | 2 |\nDone.';
  assert.equal(clean(input), 'Table. Done.');
});

test('emoji are removed', () => {
  assert.equal(clean('Great job 🎉 team'), 'Great job team.');
});

test('horizontal rules and html tags are dropped', () => {
  assert.equal(clean('One\n---\nTwo <br> three'), 'One. Two three.');
});

test('windows line endings are normalised', () => {
  assert.equal(clean('One\r\nTwo'), 'One. Two.');
});

test('chunk keeps short text whole', () => {
  assert.deepEqual(chunk('Hi there. Bye.'), ['Hi there. Bye.']);
});

test('chunk splits on sentence boundaries under the limit', () => {
  const text = 'Aaaa aaaa. Bbbb bbbb. Cccc cccc.';
  assert.deepEqual(chunk(text, 22), ['Aaaa aaaa. Bbbb bbbb.', 'Cccc cccc.']);
});

test('chunk breaks an over-long sentence at spaces', () => {
  const text = 'word '.repeat(30).trim() + '.';
  const parts = chunk(text, 50);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 50));
  assert.equal(parts.join(' '), text);
});

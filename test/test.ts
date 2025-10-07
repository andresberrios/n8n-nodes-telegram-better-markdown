import { markdownToTelegramHtml } from '../nodes/TelegramMarkdown/TelegramMarkdown.node.js';

const input =
`# Hello

This is **bold** and this is *italic*

- one
* two
- three
- Nested
  - Here it goes
  - Oh yeah
    - Amazing
  - Slowly
- Root level
Regular text.

***

More text.
1. One
2. Two
    1. Nested one
    2. Nested two
3. Three`;

console.log('=== INPUT ===');
console.log(input);

const output = markdownToTelegramHtml(input);

console.log('\n\n=== OUTPUT ===');
console.log(output);

console.log('\n\n=== OUTPUT (raw string) ===');
console.log(JSON.stringify(output));

import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export async function prompt(label, hidden = false) {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal.');
  const output = hidden
    ? new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      })
    : process.stdout;
  const input = createInterface({ input: process.stdin, output, terminal: true });
  // Start readline before prompting, so hidden input cannot race terminal echo.
  process.stderr.write(`${label}${hidden ? ' (input hidden; press Enter)' : ''}\n`);
  try {
    return await input.question('');
  } finally {
    input.close();
    if (hidden) process.stdout.write('\n');
  }
}

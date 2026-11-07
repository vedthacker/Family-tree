// Writes research-prompt.md (the blank template) from the same source the website uses.
import fs from 'node:fs';
import { buildPrompt } from '../public/js/prompt.js';
fs.writeFileSync(new URL('../research-prompt.md', import.meta.url),
  '# Ancestry research prompt\n\nPaste this into any capable AI assistant after replacing the bracketed values (or use the **Research Prompt Builder** on the website, which fills it in live).\n\n```text\n' + buildPrompt({}) + '```\n');
console.log('research-prompt.md written');

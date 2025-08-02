import { runCLI } from '@playwright/test/lib/cli/cli.js';

(async () => {
  const code = await runCLI(['test'], {
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(code);
})();

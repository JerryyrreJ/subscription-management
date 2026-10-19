import { spawn } from 'node:child_process';
import path from 'node:path';

function runIndexNow(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(cwd, 'scripts', 'indexnow.mjs')], {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`indexnow exited with code ${code ?? 'null'}`));
    });
  });
}

/** Runs only after a production deploy is live. Failures are logged and never fail the deploy. */
export async function onSuccess({ constants }) {
  const context = process.env.CONTEXT;
  if (constants?.IS_LOCAL || context !== 'production') {
    console.log(`IndexNow: skipped (context=${context || 'unset'}, local=${Boolean(constants?.IS_LOCAL)})`);
    return;
  }

  try {
    await runIndexNow(process.cwd());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`IndexNow: submission failed; the deploy is unchanged. ${message}`);
  }
}

import { spawnSync } from 'node:child_process';

const projectFiles = [
  'src/worker.js',
  'site/_worker.js',
  'site/app.js',
  'site/admin.js',
  'scripts/check.mjs',
  'scripts/verify-backup.mjs',
  'scripts/make-qr-update.mjs',
  'scripts/make-seed.mjs'
];

function run(command, args, input = undefined) {
  const options = input === undefined
    ? { encoding: 'utf8', stdio: 'inherit' }
    : { encoding: 'utf8', input, stdio: ['pipe', 'inherit', 'inherit'] };
  let executable = command;
  let executableArgs = args;
  if (process.platform === 'win32' && command.endsWith('.cmd')) {
    const quote = value => /[\s"&|<>^]/.test(value)
      ? `"${value.replace(/["^]/g, character => `^${character}`)}"`
      : value;
    executable = process.env.ComSpec || 'cmd.exe';
    executableArgs = ['/d', '/s', '/c', [quote(command), ...args.map(quote)].join(' ')];
  }
  const result = spawnSync(executable, executableArgs, options);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
}

for (const file of projectFiles) run(process.execPath, ['--check', file]);
console.log(`JavaScript syntax checks passed (${projectFiles.length} files).`);

if (process.argv.includes('--local-d1')) {
  // Every D1 command here is explicitly local and uses ignored Wrangler state.
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const common = ['--no-install', 'wrangler'];
  const localArgs = ['--local', '--persist-to', '.wrangler/local-qa'];
  run(npx, [...common, 'd1', 'migrations', 'apply', 'casajoy-exhibition', ...localArgs], 'y\n');
  run(npx, [...common, 'd1', 'execute', 'casajoy-exhibition', ...localArgs, '--file', 'scripts/local-fixture.sql']);
  run(npx, [...common, 'd1', 'execute', 'casajoy-exhibition', ...localArgs, '--file', 'scripts/local-verify.sql', '--json']);
  console.log('Local D1 migrations and synthetic fixture checks passed.');
}

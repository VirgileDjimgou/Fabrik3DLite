import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const stagedOnly = process.argv.includes('--staged');
const command = stagedOnly
  ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']
  : ['ls-files', '-z'];

const output = execFileSync('git', command, { encoding: 'buffer' });
const files = output
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const sensitivePath = /(^|\/)(?:\.env(?:\..+)?|.*(?:secret|credential|password|token).*)$|\.(?:pem|key|pfx|p12|crt|cer)$/i;
const allowedExample = /(^|\/)\.env(?:\..+)?\.example$/i;
const sourceOrDocPath = /\.(?:cs|ts|vue|js|mjs|cjs|css|scss|html|md)$/i;
const secretPattern = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|(?:CF_|CLOUDFLARE_)?(?:API_)?TOKEN\s*[=:]\s*(?=[^\s"']*\d)[^\s"']{16,}/i;

const violations = [];
for (const file of files) {
  if (sensitivePath.test(file) && !allowedExample.test(file) && !sourceOrDocPath.test(file)) {
    violations.push(`${file}: sensitive filename`);
    continue;
  }

  let content;
  try {
    content = stagedOnly
      ? execFileSync('git', ['show', `:${file}`], { encoding: 'buffer' })
      : readFileSync(file);
  } catch {
    continue;
  }

  if (!content.includes(0) && secretPattern.test(content.toString('utf8'))) {
    violations.push(`${file}: possible credential content`);
  }
}

if (violations.length > 0) {
  console.error('Security check failed. Remove the following files or credentials before committing/pushing:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Security check passed (${files.length} file(s) checked).`);

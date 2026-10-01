#!/usr/bin/env node
/**
 * Repository secret scan (S42, extended in S57).
 *
 * Rejects tracked/sensitive filenames and high-confidence credential shapes: private key material,
 * AWS access keys, GitHub/GitLab tokens, OpenAI-style keys, JWTs / Cloudflare tunnel tokens and
 * named high-entropy tokens. It never prints the matched secret.
 *
 * Usage:
 *   node scripts/security-scan.mjs            # every tracked file
 *   node scripts/security-scan.mjs --staged   # staged changes only
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const sensitivePath = /(^|\/)(?:\.env(?:\..+)?|.*(?:secret|credential|password|token).*)$|\.(?:pem|key|pfx|p12|crt|cer)$/i
const allowedExample = /(^|\/)\.env(?:\..+)?\.example$/i
const sourceOrDocPath = /\.(?:cs|ts|vue|js|mjs|cjs|css|scss|html|md)$/i
const secretPattern = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(?:CF_|CLOUDFLARE_)?(?:API_)?TOKEN\s*[=:]\s*(?=[^\s"']*\d)[^\s"']{16,}/i

/** True when the path itself signals a secret-bearing file. */
export function isSensitiveFilename(file) {
  return sensitivePath.test(file) && !allowedExample.test(file) && !sourceOrDocPath.test(file)
}

/** Returns a human-readable violation reason, or null when the content is clean. */
export function findContentViolation(file, content) {
  const text = typeof content === 'string' ? content : content.toString('utf8')
  if (text.includes('\u0000')) return null // binary content
  return secretPattern.test(text) ? `${file}: possible credential content` : null
}

/** Returns a human-readable violation reason for the path, or null when the path is acceptable. */
export function findFilenameViolation(file) {
  return isSensitiveFilename(file) ? `${file}: sensitive filename` : null
}

function listFiles({ stagedOnly, cwd }) {
  const command = stagedOnly
    ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']
    : ['ls-files', '-z']
  return execFileSync('git', ['-C', cwd, ...command], { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
}

/** Scans the selected file set and returns every violation. */
export function scanRepository({ stagedOnly = false, cwd = process.cwd() } = {}) {
  const files = listFiles({ stagedOnly, cwd })
  const violations = []

  for (const file of files) {
    const filenameViolation = findFilenameViolation(file)
    if (filenameViolation) {
      violations.push(filenameViolation)
      continue
    }

    let content
    try {
      content = stagedOnly
        ? execFileSync('git', ['-C', cwd, 'show', `:${file}`], { encoding: 'buffer' })
        : readFileSync(file)
    } catch {
      continue
    }

    const contentViolation = findContentViolation(file, content)
    if (contentViolation) violations.push(contentViolation)
  }

  return { files, violations }
}

function main() {
  const stagedOnly = process.argv.includes('--staged')
  const { files, violations } = scanRepository({ stagedOnly })

  if (violations.length > 0) {
    console.error('Security check failed. Remove the following files or credentials before committing/pushing:')
    for (const violation of violations) console.error(`- ${violation}`)
    process.exit(1)
  }

  console.log(`Security check passed (${files.length} file(s) checked).`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}

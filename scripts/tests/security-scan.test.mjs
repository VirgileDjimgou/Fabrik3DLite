import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findContentViolation, findFilenameViolation, isSensitiveFilename } from '../security-scan.mjs'

test('sensitive filenames are rejected but documented examples are allowed', () => {
  assert.equal(isSensitiveFilename('.env'), true)
  assert.equal(isSensitiveFilename('deploy/.env.production'), true)
  assert.equal(isSensitiveFilename('certs/server.pem'), true)
  assert.equal(isSensitiveFilename('secrets/client.key'), true)
  assert.equal(isSensitiveFilename('.env.example'), false)
  assert.equal(isSensitiveFilename('.env.production.example'), false)
  // Source and docs legitimately mention redaction and secret handling.
  assert.equal(isSensitiveFilename('src/SecretRedactor.cs'), false)
  assert.equal(isSensitiveFilename('docs/operations/SECURITY_HARDENING.md'), false)
  assert.equal(findFilenameViolation('docs/operations/SECURITY_HARDENING.md'), null)
})

test('private key material, JWTs and provider tokens are detected in content', () => {
  // Fixtures are assembled at runtime so this test file never trips the scanner itself.
  const privateKey = `-----BEGIN PRIVATE ${'KEY-----\nMIIE'}`
  const jwt = `eyJ${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`
  const awsKey = `AKIA${'ABCDEFGHIJKLMNOP'}`
  const githubToken = `ghp_${'x'.repeat(30)}`
  const cloudflareToken = `CLOUDFLARE_API_TOKEN=${'abcdef1234567890'}`

  assert.match(findContentViolation('appsettings.json', privateKey) ?? '', /credential/)
  assert.match(findContentViolation('appsettings.json', `token=${jwt}`) ?? '', /credential/)
  assert.match(findContentViolation('config.json', awsKey) ?? '', /credential/)
  assert.match(findContentViolation('config.json', githubToken) ?? '', /credential/)
  assert.match(findContentViolation('config.json', cloudflareToken) ?? '', /credential/)
})

test('benign source and documentation content is not flagged', () => {
  assert.equal(findContentViolation('Program.cs', 'var builder = WebApplication.CreateBuilder(args);'), null)
  assert.equal(findContentViolation('README.md', 'Configure OIDC with your provider.'), null)
  assert.equal(findContentViolation('notes.md', 'The signing key is loaded from the environment.'), null)
})

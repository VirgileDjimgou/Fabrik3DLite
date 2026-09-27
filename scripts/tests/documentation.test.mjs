import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDocumentation, REQUIRED_DOCUMENTS } from '../docs/check-docs.mjs'

test('documentation set is complete and internally consistent', () => {
  const { errors, checked } = checkDocumentation()
  assert.deepEqual(errors, [], `documentation problems:\n${errors.join('\n')}`)
  assert.equal(checked.documents, REQUIRED_DOCUMENTS.length)
  assert.ok(checked.links >= 100, `expected the link check to resolve a meaningful number of links, got ${checked.links}`)
})

test('the 1.0 sample project manifest references parseable components', () => {
  const { errors } = checkDocumentation()
  // The dedicated assertions live in checkDocumentation; this keeps the intent explicit.
  assert.equal(errors.filter((error) => error.startsWith('sample project')).length, 0)
})

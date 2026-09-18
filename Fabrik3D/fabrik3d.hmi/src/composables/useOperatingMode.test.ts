import { describe, expect, it } from 'vitest'
import { useOperatingMode } from './useOperatingMode'
describe('operating modes', () => { it('only permits explicit safe transitions', () => { const modes = useOperatingMode(); expect(modes.transition('automatic')).toBe(false); expect(modes.transition('setup')).toBe(true); expect(modes.transition('maintenance')).toBe(true); expect(modes.transition('automatic')).toBe(false) }) })

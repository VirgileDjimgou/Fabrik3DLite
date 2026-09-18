import { sanitizeAlias } from './report'
/** Local-only pseudonym: no name, email, or external identity is retained. */
export interface LocalLearnerProfile { alias: string }
export function createLocalLearnerProfile(alias: string): LocalLearnerProfile { return { alias: sanitizeAlias(alias) } }

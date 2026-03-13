import { createI18n } from 'vue-i18n'
import en from './en'
import de from './de'
import fr from './fr'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, de, fr },
})

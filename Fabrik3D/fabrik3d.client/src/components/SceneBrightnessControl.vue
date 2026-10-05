<template>
  <div class="scene-brightness" data-scene-brightness>
    <label class="scene-brightness__label" for="scene-brightness-slider">
      {{ t('brightness.label') }}
    </label>
    <div class="scene-brightness__row">
      <input
        id="scene-brightness-slider"
        class="scene-brightness__slider"
        data-scene-brightness-slider
        type="range"
        :min="AMBIENT_BRIGHTNESS_MIN"
        :max="AMBIENT_BRIGHTNESS_MAX"
        :step="AMBIENT_BRIGHTNESS_STEP"
        :value="ambientBrightness"
        :aria-valuetext="percent"
        @input="onInput"
      />
      <output class="scene-brightness__value" data-scene-brightness-value for="scene-brightness-slider">{{ percent }}</output>
      <button
        type="button"
        class="scene-brightness__reset"
        data-scene-brightness-reset
        :title="t('brightness.reset')"
        @click="resetAmbientBrightness"
      >{{ t('brightness.reset') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  AMBIENT_BRIGHTNESS_MAX,
  AMBIENT_BRIGHTNESS_MIN,
  AMBIENT_BRIGHTNESS_STEP,
  ambientBrightnessPercent,
} from '../equipment/visuals/ambientBrightness'
import {
  ambientBrightness,
  resetAmbientBrightness,
  setAmbientBrightness,
} from '../composables/sceneBrightness'
import { useSimulatorI18n } from '../i18n/simulator'

const { t } = useSimulatorI18n()
const percent = computed(() => ambientBrightnessPercent(ambientBrightness.value))

function onInput(event: Event): void {
  const input = event.target as HTMLInputElement
  setAmbientBrightness(Number(input.value))
}
</script>

<style scoped>
.scene-brightness {
  display: grid;
  gap: 0.3rem;
  font: 0.72rem/1.2 ui-monospace, monospace;
  color: #b9eaff;
}
.scene-brightness__label {
  font-weight: 600;
}
.scene-brightness__row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.scene-brightness__slider {
  width: 8.5rem;
  accent-color: #00cc88;
  cursor: pointer;
}
.scene-brightness__value {
  min-width: 2.8rem;
  text-align: right;
}
.scene-brightness__reset {
  padding: 0.15rem 0.4rem;
  border: 1px solid #34758a;
  border-radius: 0.25rem;
  background: transparent;
  color: #b9eaff;
  cursor: pointer;
  font: inherit;
}
</style>

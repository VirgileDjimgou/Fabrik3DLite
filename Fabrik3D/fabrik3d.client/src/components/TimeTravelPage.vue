<template>
  <main class="tt-page" data-view="time-travel" data-tt-page>
    <header class="tt-head">
      <div>
        <h1>{{ t('tt.title') }}</h1>
        <p>{{ t('tt.subtitle') }} <strong>{{ t('tt.simulated') }}</strong></p>
      </div>
      <div class="mode-group" role="group" :aria-label="t('tt.mode')">
        <span class="mode-chip" :class="{ active: modeValue === 'live' }" data-tt-mode-chip="live">{{ t('tt.live') }}</span>
        <span class="mode-chip" :class="{ active: modeValue === 'simulation' }" data-tt-mode-chip="simulation">{{ t('tt.simulation') }}</span>
        <span class="mode-chip" :class="{ active: modeValue === 'replay' }" data-tt-mode-chip="replay">{{ t('tt.replay') }}</span>
      </div>
    </header>

    <div class="tt-banner" :class="`banner-${modeValue}`" data-tt-banner :data-tt-mode="modeValue">
      <strong data-tt-mode-label>{{ modeLabel }}</strong>
      <span v-if="modeValue === 'replay'" data-tt-readonly>{{ t('tt.readOnly') }}</span>
      <button v-if="modeValue === 'replay'" type="button" data-tt-exit @click="exitReplay">{{ t('tt.exit') }}</button>
      <button v-else type="button" data-tt-enter @click="enterReplay">{{ t('tt.enter') }}</button>
    </div>

    <section class="controls" data-tt-controls>
      <button type="button" data-tt-play :aria-pressed="playing" @click="togglePlay">{{ playing ? t('tt.pause') : t('tt.play') }}</button>
      <button type="button" data-tt-step-backward @click="stepBackward">{{ t('tt.stepBackward') }}</button>
      <button type="button" data-tt-step-forward @click="stepForward">{{ t('tt.stepForward') }}</button>
      <label class="speed">
        <span>{{ t('tt.speed') }}</span>
        <select data-tt-speed :value="speed" @change="onSpeedChange">
          <option v-for="option in SPEED_OPTIONS" :key="option" :value="option">{{ option }}×</option>
        </select>
      </label>
      <span class="cursor">{{ t('tt.cursor') }} <b data-tt-cursor>{{ cursorLabel }}</b></span>
    </section>

    <section class="scrubber">
      <input
        type="range"
        data-tt-scrubber
        :aria-label="t('tt.scrubber')"
        :min="0"
        :max="durationMs"
        :step="250"
        :value="cursorMs - startMs"
        @input="onScrub"
      />
      <div class="event-list" data-tt-events>
        <span v-if="markers.length === 0">{{ t('tt.noEvents') }}</span>
        <button
          v-for="marker in markers"
          :key="marker.id"
          type="button"
          class="marker"
          :class="`marker-${marker.kind}`"
          :data-tt-marker="marker.id"
          :title="`${marker.timestamp} ${marker.kind} ${marker.label}`"
          @click="jumpTo(marker)"
        >{{ markerKindLabel(marker.kind) }} · {{ marker.label }}</button>
      </div>
    </section>

    <div class="grid">
      <section class="panel scene-panel" data-tt-scene-panel>
        <h2>{{ t('tt.scene') }}</h2>
        <TimeTravelScene :joints="snapshot.robot.joints" :slot-index="snapshot.material.slotIndex" :exactness="snapshot.robot.exactness" :carrying="carrying" />
      </section>

      <section class="panel" data-tt-robot>
        <h2>{{ t('tt.robot') }}</h2>
        <dl>
          <dt>{{ t('tt.joints') }}</dt>
          <dd class="mono" data-tt-robot-joints>{{ jointsText }}</dd>
          <dt>{{ t('tt.pose') }}</dt>
          <dd class="mono">{{ poseText }}</dd>
          <dt>{{ t('tt.exactness') }}</dt>
          <dd><span class="quality" :class="`exactness-${snapshot.robot.exactness}`" data-tt-exactness>{{ exactnessLabel }}</span></dd>
        </dl>
      </section>

      <section class="panel" data-tt-cnc>
        <h2>{{ t('tt.cnc') }}</h2>
        <dl>
          <dt>{{ t('tt.state') }}</dt><dd class="mono" data-tt-cnc-state>{{ snapshot.cnc?.state ?? gapText }}</dd>
          <dt>{{ t('tt.door') }}</dt><dd class="mono">{{ snapshot.cnc?.doorState ?? gapText }}</dd>
          <dt>{{ t('tt.fixture') }}</dt><dd class="mono">{{ formatBool(snapshot.cnc?.fixtureClamped) }}</dd>
          <dt>{{ t('tt.spindle') }}</dt><dd class="mono">{{ formatBool(snapshot.cnc?.spindleRunning) }}</dd>
          <dt>{{ t('tt.part') }}</dt><dd class="mono">{{ formatBool(snapshot.cnc?.partPresent) }}</dd>
        </dl>
      </section>

      <section class="panel" data-tt-material>
        <h2>{{ t('tt.material') }}</h2>
        <dl>
          <dt>{{ t('tt.pallet') }}</dt><dd class="mono">{{ snapshot.material.palletId ?? gapText }}</dd>
          <dt>{{ t('tt.slot') }}</dt><dd class="mono" data-tt-material-slot>{{ snapshot.material.slotIndex ?? gapText }}</dd>
          <dt>{{ t('tt.state') }}</dt><dd class="mono">{{ snapshot.material.state ?? gapText }}</dd>
        </dl>
      </section>

      <section class="panel" data-tt-signals>
        <h2>{{ t('tt.signals') }}</h2>
        <table>
          <thead><tr><th>{{ t('tt.signal') }}</th><th>{{ t('tt.value') }}</th><th>{{ t('tt.quality') }}</th><th>{{ t('tt.source') }}</th></tr></thead>
          <tbody>
            <tr v-for="signal in snapshot.signals" :key="signal.signalId" :data-tt-signal="signal.signalId">
              <td class="mono">{{ signal.signalId }}</td>
              <td class="mono">{{ formatValue(signal.value) }}</td>
              <td>{{ signal.quality }}</td>
              <td>{{ signal.source }}</td>
            </tr>
            <tr v-if="snapshot.signals.length === 0"><td colspan="4" class="muted">{{ t('tt.noSignals') }}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="panel" data-tt-alarms>
        <h2>{{ t('tt.alarms') }}</h2>
        <ul>
          <li v-for="alarm in snapshot.alarms" :key="alarm.alarmId" :data-tt-alarm="alarm.alarmId">
            <b>{{ alarm.alarmId }}</b> · {{ alarm.state }} · {{ alarm.severity }}
          </li>
          <li v-if="snapshot.alarms.length === 0" class="muted">{{ t('tt.noAlarms') }}</li>
        </ul>
      </section>

      <section class="panel" data-tt-faults>
        <h2>{{ t('tt.faults') }}</h2>
        <ul>
          <li v-for="fault in snapshot.faults" :key="fault.faultId" :data-tt-fault="fault.faultId" :class="{ active: fault.active }">
            <b>{{ fault.faultId }}</b> · {{ fault.active ? t('tt.active') : t('tt.cleared') }} · {{ fault.lastAction }}
          </li>
          <li v-if="snapshot.faults.length === 0" class="muted">{{ t('tt.noFaults') }}</li>
        </ul>
      </section>

      <section class="panel" data-tt-job>
        <h2>{{ t('tt.job') }}</h2>
        <dl>
          <dt>{{ t('tt.session') }}</dt><dd class="mono">{{ snapshot.job.sessionId ?? gapText }}</dd>
          <dt>{{ t('tt.jobId') }}</dt><dd class="mono">{{ snapshot.job.jobId ?? gapText }}</dd>
          <dt>{{ t('tt.task') }}</dt><dd class="mono">{{ snapshot.job.taskId ?? gapText }}</dd>
          <dt>{{ t('tt.phase') }}</dt><dd class="mono" data-tt-job-phase>{{ snapshot.job.phase ?? gapText }}</dd>
          <dt>{{ t('tt.progress') }}</dt><dd class="mono">{{ snapshot.job.progress === null ? gapText : `${Math.round(snapshot.job.progress * 100)}%` }}</dd>
        </dl>
      </section>

      <section class="panel" data-tt-authority>
        <h2>{{ t('tt.authority') }}</h2>
        <dl v-if="snapshot.authority">
          <dt>{{ t('tt.scope') }}</dt><dd class="mono">{{ snapshot.authority.scope }}</dd>
          <dt>{{ t('tt.modeLabel') }}</dt><dd class="mono">{{ snapshot.authority.mode }}</dd>
          <dt>{{ t('tt.state') }}</dt><dd class="mono">{{ snapshot.authority.state }}</dd>
          <dt>{{ t('tt.owner') }}</dt><dd class="mono">{{ snapshot.authority.ownerId ?? gapText }}</dd>
        </dl>
        <p v-else class="muted">{{ gapText }}</p>
      </section>

      <section class="panel" data-tt-twin>
        <h2>{{ t('tt.twin') }}</h2>
        <ul>
          <li v-for="state in twinStates" :key="state.equipment.id" :data-tt-twin-state="state.equipment.id">
            <b>{{ state.equipment.id }}</b> · {{ state.executionState }} · {{ state.quality }} · replay
          </li>
          <li v-if="twinStates.length === 0" class="muted">{{ t('tt.noTwin') }}</li>
        </ul>
      </section>

      <section class="panel" data-tt-gaps>
        <h2>{{ t('tt.gaps') }}</h2>
        <ul>
          <li v-for="gap in snapshot.gaps" :key="`${gap.field}-${gap.reason}`" :data-tt-gap="`${gap.field}:${gap.reason}`">
            {{ gap.field }} — {{ gap.reason }}
          </li>
          <li v-if="snapshot.gaps.length === 0" class="muted">{{ t('tt.noGaps') }}</li>
        </ul>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import TimeTravelScene from './TimeTravelScene.vue'
import { createTimeTravelDemoInput } from '../timeTravel/demo'
import { TimeTravelController } from '../timeTravel/controller'
import { ReplayIsolationGate, TimeTravelModeGate } from '../timeTravel/isolation'
import { reconstructTwinStates } from '../twin/replay'
import type { ReconstructionSnapshot, TimelineMarker } from '../timeTravel/types'
import { useSimulatorI18n } from '../i18n/simulator'

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const

const { t } = useSimulatorI18n()
const input = createTimeTravelDemoInput()
const isolation = new ReplayIsolationGate()
const mode = new TimeTravelModeGate(isolation, 'simulation')
mode.enterReplay()

const controller = new TimeTravelController(input, { stepMs: 250 })
const markers = controller.markers
const startMs = controller.rangeMs.startMs
const endMs = controller.rangeMs.endMs

const cursorMs = ref(controller.cursorMs)
const playing = ref(controller.isPlaying)
const speed = ref(controller.speed)
const modeValue = ref(mode.mode)
const snapshot = ref<ReconstructionSnapshot>(controller.snapshot())

const durationMs = endMs - startMs
const gapText = computed(() => t('tt.gap'))
const gapTextValue = gapText
const twinStates = computed(() => reconstructTwinStates(snapshot.value))
const jointsText = computed(() => (snapshot.value.robot.joints ? snapshot.value.robot.joints.map((value) => value.toFixed(3)).join(', ') : gapText.value))
const poseText = computed(() => {
  const pose = snapshot.value.robot.pose
  return pose ? `x=${pose.x.toFixed(3)} y=${pose.y.toFixed(3)} z=${pose.z.toFixed(3)} m` : gapText.value
})
const exactnessLabel = computed(() => t(`tt.exactness.${snapshot.value.robot.exactness}`))
const modeLabel = computed(() => t(`tt.mode.${modeValue.value}`))
const carrying = computed(() => snapshot.value.robot.pose !== null && snapshot.value.cnc?.partPresent === true && snapshot.value.material.slotIndex === 0)
const cursorLabel = computed(() => new Date(cursorMs.value).toISOString())

function sync(next: ReconstructionSnapshot): void {
  cursorMs.value = controller.cursorMs
  playing.value = controller.isPlaying
  snapshot.value = next
}

function togglePlay(): void {
  if (playing.value) {
    controller.pause()
    sync(controller.snapshot())
    return
  }
  controller.play()
  playing.value = controller.isPlaying
  startLoop()
}

function startLoop(): void {
  if (frameHandle !== 0) return
  lastFrame = 0
  frameHandle = requestAnimationFrame(loop)
}

function loop(time: number): void {
  if (!playing.value) { frameHandle = 0; return }
  const delta = lastFrame === 0 ? 0 : Math.min(100, time - lastFrame)
  lastFrame = time
  sync(controller.advance(delta))
  if (playing.value) frameHandle = requestAnimationFrame(loop)
  else frameHandle = 0
}

function stepForward(): void { sync(controller.stepForward()) }
function stepBackward(): void { sync(controller.stepBackward()) }

function onScrub(event: Event): void {
  sync(controller.seekMs(startMs + Number((event.target as HTMLInputElement).value)))
}

function onSpeedChange(event: Event): void {
  speed.value = controller.setSpeed(Number((event.target as HTMLSelectElement).value))
}

function jumpTo(marker: TimelineMarker): void { sync(controller.jumpToMarker(marker)) }

function markerKindLabel(kind: TimelineMarker['kind']): string {
  return t(`tt.marker.${kind}`)
}

function exitReplay(): void {
  modeValue.value = mode.exitReplay('simulation')
  controller.pause()
  playing.value = false
  if (frameHandle !== 0) { cancelAnimationFrame(frameHandle); frameHandle = 0 }
}

function enterReplay(): void {
  mode.enterReplay()
  modeValue.value = mode.mode
}

function formatValue(value: number | string | boolean | null): string {
  return value === null ? gapTextValue.value : String(value)
}

function formatBool(value: boolean | null | undefined): string {
  return value === null || value === undefined ? gapTextValue.value : String(value)
}

let frameHandle = 0
let lastFrame = 0

onUnmounted(() => {
  if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
  isolation.exitReplay()
})
</script>

<style scoped>
.tt-page { min-height: 100vh; padding: 1rem 1.2rem 2rem; background: #0a161f; color: #dbe7ec; font-family: 'Segoe UI', ui-monospace, monospace; }
.tt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.tt-head h1 { margin: 0 0 .25rem; color: #9de3f6; font-size: 1.15rem; }
.tt-head p { margin: 0; color: #8fb6c4; font-size: .82rem; }
.tt-head strong { color: #ffd166; }
.mode-group { display: flex; gap: .35rem; }
.mode-chip { padding: .28rem .7rem; border-radius: 999px; border: 1px solid #2c4a58; color: #7f9fac; font-size: .72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.mode-chip.active[data-tt-mode-chip='live'] { border-color: #3fa9f5; color: #d6efff; background: #14384c; }
.mode-chip.active[data-tt-mode-chip='simulation'] { border-color: #00cc88; color: #06201a; background: #00cc88; }
.mode-chip.active[data-tt-mode-chip='replay'] { border-color: #ffb703; color: #241a00; background: #ffb703; }
.tt-banner { display: flex; align-items: center; gap: .75rem; margin: .75rem 0; padding: .5rem .75rem; border-radius: .35rem; border: 1px solid #555; font-size: .8rem; }
.banner-replay { border-color: #ffb703; background: #2a2208; color: #ffd166; }
.banner-simulation { border-color: #00cc88; background: #08251d; color: #9df6cf; }
.banner-live { border-color: #3fa9f5; background: #0d2838; color: #bfe6ff; }
.tt-banner button { margin-left: auto; padding: .28rem .7rem; border: 1px solid currentColor; border-radius: .3rem; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.controls { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-bottom: .5rem; }
.controls button { padding: .35rem .8rem; border: 1px solid #34758a; border-radius: .3rem; background: #10232d; color: #dbe7ec; cursor: pointer; font: inherit; }
.controls button:hover { border-color: #00cc88; }
.speed { display: flex; align-items: center; gap: .3rem; color: #9fc4d2; font-size: .8rem; }
.speed select { background: #10232d; color: #fff; border: 1px solid #34758a; border-radius: .25rem; padding: .25rem; font: inherit; }
.cursor { color: #8fb6c4; font-size: .78rem; }
.cursor b { color: #ffd166; }
.scrubber { display: flex; flex-direction: column; gap: .4rem; margin-bottom: .8rem; }
.scrubber input[type='range'] { width: 100%; accent-color: #ffb703; }
.event-list { display: flex; gap: .35rem; flex-wrap: wrap; }
.marker { padding: .2rem .55rem; border-radius: .25rem; border: 1px solid #34758a; background: #10232d; color: #dbe7ec; cursor: pointer; font-size: .72rem; }
.marker-alarm { border-color: #ff8080; color: #ffc9c9; }
.marker-fault { border-color: #f0a000; color: #ffe0a3; }
.marker-command { border-color: #3fa9f5; color: #cbe9ff; }
.marker-phase { border-color: #7fd1b0; color: #d3f6e8; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: .7rem; }
.panel { border: 1px solid #23485a; border-radius: .35rem; padding: .55rem .65rem; background: #0d1f29; }
.panel h2 { margin: 0 0 .35rem; font-size: .78rem; color: #9de3f6; text-transform: uppercase; letter-spacing: .05em; }
.scene-panel { grid-column: 1 / -1; }
dl { display: grid; grid-template-columns: auto 1fr; gap: .15rem .5rem; margin: 0; font-size: .76rem; }
dt { color: #8fb6c4; }
dd { margin: 0; overflow-wrap: anywhere; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
table { width: 100%; border-collapse: collapse; font-size: .74rem; }
th { text-align: left; color: #8fb6c4; text-transform: uppercase; letter-spacing: .04em; padding: .2rem .3rem; }
td { padding: .2rem .3rem; border-top: 1px solid rgb(255 255 255 / 5%); }
ul { list-style: none; margin: 0; padding: 0; font-size: .76rem; }
li { padding: .15rem 0; }
li.active { color: #ffd166; }
.muted { color: #6f8f9c; }
.quality { padding: .05rem .35rem; border-radius: 999px; border: 1px solid currentColor; font-size: .66rem; font-weight: 800; text-transform: uppercase; }
.exactness-exact { color: #68dfa8; }
.exactness-interpolated, .exactness-held { color: #ffd166; }
.exactness-gap { color: #ff8080; }
</style>

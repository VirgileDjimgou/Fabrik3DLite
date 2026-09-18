<template>
  <section class="browser" data-equipment-scene-browser>
    <header><strong>Equipment & scenes</strong><input v-model="query" type="search" placeholder="Search catalog" aria-label="Search catalog" /></header>
    <div class="filters"><button v-for="item in categories" :key="item" type="button" :class="{ active: category === item }" @click="category = item">{{ item }}</button></div>
    <ul>
      <li v-for="item in filtered" :key="item.id" :data-browser-item="item.id">
        <span class="thumbnail" aria-hidden="true">{{ item.thumbnail }}</span><span><strong>{{ item.label }}</strong><small>{{ item.category }} · {{ item.license }}</small></span><em :class="item.ready ? 'ready' : 'static'">{{ item.ready ? 'simulation-ready' : 'visual/layout' }}</em>
      </li>
    </ul>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { createIndustrialAssetRegistry } from '../equipment/assets'
import { createDefaultScenePresetCatalog } from '../scenes'
const query = ref(''); const category = ref('all')
const entries = [
  ...createIndustrialAssetRegistry().list().map(asset => ({ id: asset.id, label: asset.description, category: 'equipment', ready: asset.source === 'glb', license: asset.source === 'glb' ? asset.manifest.license.name : 'procedural', thumbnail: '▣' })),
  ...createDefaultScenePresetCatalog().list().map(scene => ({ id: scene.id, label: scene.name.en, category: 'scene', ready: scene.capability === 'simulation-ready', license: 'Fabrik3D scene data', thumbnail: '◇' })),
]
const categories = ['all', 'equipment', 'scene']
const filtered = computed(() => entries.filter(entry => (category.value === 'all' || entry.category === category.value) && `${entry.label} ${entry.id}`.toLowerCase().includes(query.value.toLowerCase())))
</script>
<style scoped>
.browser { padding: .8rem; color: #e5edf2; background: #0c1419; font: .75rem/1.35 ui-monospace, monospace; }.browser header { display:flex; gap:.6rem; align-items:center; }.browser input { padding:.35rem; background:#152a34; color:#fff; border:1px solid #34758a; }.filters { display:flex; gap:.3rem; margin:.6rem 0; }.filters button { background:transparent; color:#b9eaff; border:1px solid #34758a; }.filters .active { color:#06201a; background:#00cc88; }ul { list-style:none; padding:0; display:grid; gap:.35rem; max-width:42rem; }li { display:flex; gap:.55rem; align-items:center; border:1px solid #2c718b; padding:.45rem; }li span:nth-child(2) { display:grid; flex:1; }small { color:#8fa9b4; }.thumbnail { font-size:1.5rem; color:#ffd166; }em { font-style:normal; font-size:.65rem; }.ready { color:#68dfa8; }.static { color:#ffd166; }
</style>

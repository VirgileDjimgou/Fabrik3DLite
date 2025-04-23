<template>
  <div class="cnc-visualization">
    <h2>CNC Visualization</h2>
    <canvas ref="cncCanvas" width="800" height="600"></canvas>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue';

export default defineComponent({
  name: 'CNCVisualization',
  setup() {
    const cncCanvas = ref<HTMLCanvasElement | null>(null);

    onMounted(() => {
      if (cncCanvas.value) {
        const ctx = cncCanvas.value.getContext('2d');
        if (ctx) {
          // Example drawing code for CNC visualization
          ctx.fillStyle = 'lightgray';
          ctx.fillRect(0, 0, cncCanvas.value.width, cncCanvas.value.height);
          ctx.strokeStyle = 'blue';
          ctx.lineWidth = 2;
          ctx.strokeRect(100, 100, 600, 400);
          ctx.fillStyle = 'red';
          ctx.fillRect(350, 250, 100, 100);
        }
      }
    });

    return {
      cncCanvas,
    };
  },
});
</script>

<style scoped>
.cnc-visualization {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
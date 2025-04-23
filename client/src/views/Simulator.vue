<template>
  <div class="simulator">
    <h1>Fabrik3D Lite Simulator</h1>
    <div class="controls">
      <CNCControl />
      <RobotControl />
      <MQTTClient />
    </div>
    <div class="visualizations">
      <CNCVisualization />
      <RobotVisualization />
      <MQTTMessageLog />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import CNCControl from '@/components/CNC/CNCControl.vue';
import RobotControl from '@/components/Robotics/RobotControl.vue';
import MQTTClient from '@/components/MQTT/MQTTClient.vue';
import CNCVisualization from '@/components/CNC/CNCVisualization.vue';
import RobotVisualization from '@/components/Robotics/RobotVisualization.vue';
import MQTTMessageLog from '@/components/MQTT/MQTTMessageLog.vue';

export default defineComponent({
  name: 'Simulator',
  components: {
    CNCControl,
    RobotControl,
    MQTTClient,
    CNCVisualization,
    RobotVisualization,
    MQTTMessageLog,
  },
});
</script>

<style scoped>
.simulator {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.controls {
  margin-bottom: 20px;
}

.visualizations {
  display: flex;
  justify-content: space-around;
  width: 100%;
}
</style>
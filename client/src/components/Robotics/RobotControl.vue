<template>
  <div class="robot-control">
    <h2>Robot Control</h2>
    <div>
      <label for="robotCommand">Command:</label>
      <input type="text" id="robotCommand" v-model="command" />
      <button @click="sendCommand">Send Command</button>
    </div>
    <div>
      <h3>Status</h3>
      <pre>{{ status }}</pre>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { mqttClient } from '@/services/mqttService'; // Assuming you have a service for MQTT

export default defineComponent({
  name: 'RobotControl',
  setup() {
    const command = ref('');
    const status = ref('Waiting for command...');

    const sendCommand = () => {
      if (command.value) {
        mqttClient.publish('robot/control', command.value);
        status.value = `Command sent: ${command.value}`;
        command.value = ''; // Clear the input after sending
      } else {
        status.value = 'Please enter a command.';
      }
    };

    return {
      command,
      status,
      sendCommand,
    };
  },
});
</script>

<style scoped>
.robot-control {
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 5px;
  background-color: #f9f9f9;
}
</style>
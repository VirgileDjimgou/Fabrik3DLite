<template>
  <div class="cnc-control">
    <h1>CNC Control</h1>
    <div>
      <label for="jobId">Job ID:</label>
      <input type="text" id="jobId" v-model="jobId" />
    </div>
    <div>
      <label for="command">Command:</label>
      <input type="text" id="command" v-model="command" />
    </div>
    <button @click="sendCommand">Send Command</button>
    <div v-if="response">
      <h2>Response:</h2>
      <pre>{{ response }}</pre>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  name: 'CNCControl',
  setup() {
    const jobId = ref('');
    const command = ref('');
    const response = ref<string | null>(null);

    const sendCommand = async () => {
      try {
        const res = await fetch(`/api/cnc/${jobId.value}/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ command: command.value }),
        });
        response.value = await res.json();
      } catch (error) {
        response.value = 'Error sending command';
      }
    };

    return {
      jobId,
      command,
      response,
      sendCommand,
    };
  },
});
</script>

<style scoped>
.cnc-control {
  padding: 20px;
}

.cnc-control h1 {
  font-size: 24px;
}

.cnc-control label {
  margin-right: 10px;
}

.cnc-control input {
  margin-bottom: 10px;
}
</style>
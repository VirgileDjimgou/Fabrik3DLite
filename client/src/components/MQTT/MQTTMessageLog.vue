<template>
  <div class="mqtt-message-log">
    <h2>MQTT Message Log</h2>
    <ul>
      <li v-for="(message, index) in messages" :key="index">
        <strong>Topic:</strong> {{ message.topic }} <br />
        <strong>Payload:</strong> {{ message.payload }} <br />
        <strong>Timestamp:</strong> {{ message.timestamp }}
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  name: 'MQTTMessageLog',
  setup() {
    const messages = ref<Array<{ topic: string; payload: string; timestamp: string }>>([]);

    const addMessage = (topic: string, payload: string) => {
      messages.value.push({
        topic,
        payload,
        timestamp: new Date().toLocaleString(),
      });
    };

    return {
      messages,
      addMessage,
    };
  },
});
</script>

<style scoped>
.mqtt-message-log {
  border: 1px solid #ccc;
  padding: 16px;
  border-radius: 8px;
  background-color: #f9f9f9;
}

.mqtt-message-log h2 {
  margin-bottom: 12px;
}

.mqtt-message-log ul {
  list-style-type: none;
  padding: 0;
}

.mqtt-message-log li {
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: #fff;
}
</style>
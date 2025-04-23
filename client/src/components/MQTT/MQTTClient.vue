<template>
  <div>
    <h2>MQTT Client</h2>
    <div>
      <label for="brokerUrl">Broker URL:</label>
      <input type="text" v-model="brokerUrl" id="brokerUrl" />
    </div>
    <div>
      <label for="clientId">Client ID:</label>
      <input type="text" v-model="clientId" id="clientId" />
    </div>
    <button @click="connect">Connect</button>
    <button @click="disconnect">Disconnect</button>
    
    <div v-if="isConnected">
      <h3>Connected to {{ brokerUrl }}</h3>
      <div>
        <label for="topic">Topic:</label>
        <input type="text" v-model="topic" id="topic" />
      </div>
      <div>
        <label for="message">Message:</label>
        <input type="text" v-model="message" id="message" />
      </div>
      <button @click="publish">Publish</button>
    </div>

    <div>
      <h3>Message Log</h3>
      <ul>
        <li v-for="(msg, index) in messageLog" :key="index">{{ msg }}</li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { MqttClient } from 'mqtt';

export default defineComponent({
  name: 'MQTTClient',
  setup() {
    const brokerUrl = ref('ws://broker.hivemq.com:8000/mqtt');
    const clientId = ref('mqtt_client_' + Math.random().toString(16).substr(2, 8));
    const topic = ref('');
    const message = ref('');
    const messageLog = ref<string[]>([]);
    const isConnected = ref(false);
    let client: MqttClient | null = null;

    const connect = () => {
      client = new MqttClient(brokerUrl.value);
      client.on('connect', () => {
        isConnected.value = true;
        console.log('Connected to MQTT broker');
      });

      client.on('message', (topic: string, message: Buffer) => {
        messageLog.value.push(`Received message: ${message.toString()} on topic: ${topic}`);
      });

      client.connect({ clientId: clientId.value });
    };

    const disconnect = () => {
      if (client) {
        client.end();
        isConnected.value = false;
        console.log('Disconnected from MQTT broker');
      }
    };

    const publish = () => {
      if (client && isConnected.value) {
        client.publish(topic.value, message.value);
        messageLog.value.push(`Published message: ${message.value} to topic: ${topic.value}`);
      }
    };

    return {
      brokerUrl,
      clientId,
      topic,
      message,
      messageLog,
      isConnected,
      connect,
      disconnect,
      publish,
    };
  },
});
</script>

<style scoped>
h2 {
  color: #333;
}
</style>
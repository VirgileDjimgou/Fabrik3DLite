<template>
  <div class="about">
    <h1>About Fabrik3D Lite</h1>
    <p>
      Fabrik3D Lite is a modular educational simulator designed for robotic and CNC simulations. 
      It provides an intuitive interface for users to interact with robotic arms and CNC machines, 
      facilitating hands-on learning and experimentation.
    </p>
    <h2>Features</h2>
    <ul>
      <li>Robotic arm control and visualization</li>
      <li>CNC machine control and visualization</li>
      <li>Real-time MQTT messaging for communication</li>
      <li>Integration with MongoDB for data storage</li>
    </ul>
    <h2>Getting Started</h2>
    <p>
      To get started with Fabrik3D Lite, clone the repository and install the necessary dependencies 
      for both the client and server components. Follow the setup instructions in the README file.
    </p>
  </div>
</template>

<script lang="ts">
export default {
  name: 'About',
};
</script>

<style scoped>
.about {
  padding: 20px;
}
.about h1 {
  font-size: 2em;
}
.about h2 {
  margin-top: 1.5em;
}
.about p {
  margin: 0.5em 0;
}
.about ul {
  list-style-type: disc;
  margin-left: 20px;
}
</style>
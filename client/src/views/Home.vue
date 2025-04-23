<template>
  <div class="home">
    <h1>Welcome to Fabrik3D Lite</h1>
    <p>Your modular educational simulator for robotic and CNC simulations.</p>
    <p>Explore the features and capabilities of our platform.</p>
    <router-link to="/simulator" class="btn">Go to Simulator</router-link>
  </div>
</template>

<script lang="ts">
export default {
  name: 'Home',
};
</script>

<style scoped>
.home {
  text-align: center;
  margin-top: 50px;
}

.btn {
  display: inline-block;
  padding: 10px 20px;
  background-color: #42b983;
  color: white;
  text-decoration: none;
  border-radius: 5px;
  transition: background-color 0.3s;
}

.btn:hover {
  background-color: #367c6b;
}
</style>
using System;
using System.Text;
using System.Threading.Tasks;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Client.Options;
using MQTTnet.Exceptions;
using Microsoft.Extensions.Logging;

namespace Fabrik3D_Lite.server.Services
{
    public class MQTTService : IDisposable
    {
        private readonly IMqttClient _mqttClient;
        private readonly IMqttClientOptions _mqttOptions;
        private readonly ILogger<MQTTService> _logger;

        public MQTTService(string brokerAddress, int brokerPort, ILogger<MQTTService> logger)
        {
            var factory = new MqttFactory();
            _mqttClient = factory.CreateMqttClient();
            _mqttOptions = new MqttClientOptionsBuilder()
                .WithClientId("Fabrik3D_Lite_Client")
                .WithTcpServer(brokerAddress, brokerPort)
                .Build();
            _logger = logger;
        }

        public async Task ConnectAsync()
        {
            try
            {
                await _mqttClient.ConnectAsync(_mqttOptions);
                _logger.LogInformation("Connected to MQTT broker.");
            }
            catch (MqttProtocolViolationException ex)
            {
                _logger.LogError($"Protocol error: {ex.Message}");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error connecting to MQTT broker: {ex.Message}");
            }
        }

        public async Task PublishAsync(string topic, string payload)
        {
            var message = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(payload)
                .WithExactlyOnceQoS()
                .WithRetainFlag()
                .Build();

            await _mqttClient.PublishAsync(message);
            _logger.LogInformation($"Message published to topic {topic}: {payload}");
        }

        public async Task SubscribeAsync(string topic)
        {
            _mqttClient.UseApplicationMessageReceivedHandler(e =>
            {
                var receivedMessage = Encoding.UTF8.GetString(e.ApplicationMessage.Payload);
                _logger.LogInformation($"Message received from topic {e.ApplicationMessage.Topic}: {receivedMessage}");
            });

            await _mqttClient.SubscribeAsync(topic);
            _logger.LogInformation($"Subscribed to topic {topic}");
        }

        public async Task DisconnectAsync()
        {
            await _mqttClient.DisconnectAsync();
            _logger.LogInformation("Disconnected from MQTT broker.");
        }

        public void Dispose()
        {
            _mqttClient?.Dispose();
        }
    }
}
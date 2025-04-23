using Microsoft.AspNetCore.Mvc;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Client.Options;
using System.Text;
using System.Threading.Tasks;

namespace Fabrik3D_Lite.server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class MQTTController : ControllerBase
    {
        private readonly IMqttClient _mqttClient;

        public MQTTController()
        {
            var factory = new MqttFactory();
            _mqttClient = factory.CreateMqttClient();
        }

        [HttpPost("publish")]
        public async Task<IActionResult> PublishMessage([FromBody] string message)
        {
            var options = new MqttClientOptionsBuilder()
                .WithTcpServer("broker.hivemq.com")
                .Build();

            await _mqttClient.ConnectAsync(options, CancellationToken.None);

            var mqttMessage = new MqttApplicationMessageBuilder()
                .WithTopic("fabrik3d/messages")
                .WithPayload(message)
                .WithExactlyOnceQoS()
                .Build();

            await _mqttClient.PublishAsync(mqttMessage, CancellationToken.None);
            await _mqttClient.DisconnectAsync();

            return Ok("Message published successfully.");
        }

        [HttpGet("subscribe")]
        public async Task<IActionResult> SubscribeToMessages()
        {
            var options = new MqttClientOptionsBuilder()
                .WithTcpServer("broker.hivemq.com")
                .Build();

            await _mqttClient.ConnectAsync(options, CancellationToken.None);

            _mqttClient.UseApplicationMessageReceivedHandler(e =>
            {
                var receivedMessage = Encoding.UTF8.GetString(e.ApplicationMessage.Payload);
                // Handle the received message (e.g., store it, log it, etc.)
            });

            await _mqttClient.SubscribeAsync("fabrik3d/messages");

            return Ok("Subscribed to messages.");
        }
    }
}
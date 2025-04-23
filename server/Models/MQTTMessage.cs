using System;

namespace Fabrik3D_Lite.Models
{
    public class MQTTMessage
    {
        public string Topic { get; set; }
        public string Payload { get; set; }
        public DateTime Timestamp { get; set; }

        public MQTTMessage(string topic, string payload)
        {
            Topic = topic;
            Payload = payload;
            Timestamp = DateTime.UtcNow;
        }
    }
}
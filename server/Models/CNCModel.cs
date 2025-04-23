using System;

namespace Fabrik3D_Lite.Models
{
    public class CNCModel
    {
        public string Id { get; set; }
        public string JobName { get; set; }
        public string Material { get; set; }
        public double FeedRate { get; set; }
        public double SpindleSpeed { get; set; }
        public string Tool { get; set; }
        public string GCode { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        public CNCModel()
        {
            CreatedAt = DateTime.UtcNow;
            UpdatedAt = DateTime.UtcNow;
        }
    }
}
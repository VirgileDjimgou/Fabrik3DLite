using System.ComponentModel.DataAnnotations;

namespace Fabrik3D_Lite.server.Models
{
    public class RobotModel
    {
        [Key]
        public string Id { get; set; }
        
        public string Name { get; set; }
        
        public string Description { get; set; }
        
        public double MaxSpeed { get; set; }
        
        public double MaxLoad { get; set; }
        
        public string[] SupportedOperations { get; set; }
        
        public string Status { get; set; }
        
        public DateTime LastUpdated { get; set; }
    }
}
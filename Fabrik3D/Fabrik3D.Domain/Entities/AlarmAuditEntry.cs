using MongoDB.Bson.Serialization.Attributes;
namespace Fabrik3D.Domain.Entities;
public class AlarmAuditEntry
{
    public string Action { get; set; } = string.Empty;
    public string By { get; set; } = string.Empty;
    [BsonDateTimeOptions(Kind = DateTimeKind.Utc)] public DateTime AtUtc { get; set; }
    public string? Note { get; set; }
}

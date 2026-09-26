using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

/// <summary>
/// A named, persisted cell template. Content is the versioned cell file
/// JSON retained verbatim so files stay deterministic and reviewable.
/// </summary>
public class CellTemplate
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Tenant boundary (S43). Null on legacy documents; readers treat it as the default organization.</summary>
    public string? OrganizationId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Cell file schema version, e.g. "1.0".</summary>
    public string SchemaVersion { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public int Version { get; set; }

    /// <summary>Authenticated subject that created the template (S42 audit identity).</summary>
    public string? CreatedBy { get; set; }

    /// <summary>Authenticated subject that last updated the template (S42 audit identity).</summary>
    public string? UpdatedBy { get; set; }
}
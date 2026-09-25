using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Signals;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Fabrik3D.Domain.Entities;

/// <summary>
/// An immutable historian document for one sampled signal value (S40). Stored in its own
/// collection; it never participates in live orchestration and can never issue a command.
/// The schema version is stored on every document so compatible readers can evolve.
/// </summary>
public class TelemetrySample
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    /// <summary>Historian document schema version (<see cref="HistorianSchema.Version"/>).</summary>
    public string SchemaVersion { get; set; } = HistorianSchema.Version;

    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;

    /// <summary>Optional simulation session / run reference.</summary>
    public string? SessionId { get; set; }

    /// <summary>Optional finer-grained run reference within a session.</summary>
    public string? RunId { get; set; }

    public string EquipmentId { get; set; } = string.Empty;

    public string SignalId { get; set; } = string.Empty;

    /// <summary>Numeric payload for Bool/Int/UInt/Float/Enum values.</summary>
    public double? NumericValue { get; set; }

    /// <summary>Textual payload for string values (bounded).</summary>
    public string? TextValue { get; set; }

    [BsonRepresentation(BsonType.String)]
    public SignalDataType ValueType { get; set; } = SignalDataType.Float;

    [BsonRepresentation(BsonType.String)]
    public SignalQuality Quality { get; set; } = SignalQuality.Good;

    [BsonRepresentation(BsonType.String)]
    public SignalSource Source { get; set; } = SignalSource.Simulated;

    [BsonRepresentation(BsonType.String)]
    public SignalOrigin Origin { get; set; } = SignalOrigin.Simulation;

    public string? CorrelationId { get; set; }
}

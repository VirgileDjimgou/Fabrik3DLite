using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Fabrik3D.Contracts.DTOs;

namespace Fabrik3D.Domain.Mapping;

/// <summary>
/// Minimal, protocol-free projection of an internal signal used to validate mappings.
/// The simulator signal catalog (S32) stays authoritative; the server mirror supplies
/// these descriptors when connectors register their points.
/// </summary>
public sealed record InternalSignalDescriptor(string SignalId, string EquipmentId, bool Writable, string DataType);

/// <summary>Canonical wire vocabulary for the versioned mapping schema 1.0.</summary>
public static class SignalMappingVocabulary
{
    public const string SchemaVersion = "1.0";
    public const string LegacySchemaVersion = "0.9";

    public static readonly IReadOnlyList<string> Protocols = ["opcua", "mqtt", "modbus"];
    public static readonly IReadOnlyList<string> Directions = ["read", "write", "read-write"];
    public static readonly IReadOnlyList<string> DataTypes = ["bool", "int", "uint", "float", "enum", "string"];
    public static readonly IReadOnlyList<string> ModbusAreas = ["coil", "discrete-input", "input-register", "holding-register"];
    public static readonly IReadOnlyList<string> ByteOrders = ["big-endian", "little-endian"];
    public static readonly IReadOnlyList<string> WordOrders = ["high-word-first", "low-word-first"];
    public static readonly IReadOnlyList<string> AddressConventions = ["zero-based", "one-based"];

    public static bool DirectionAllowsWrite(string? direction)
        => string.Equals(direction, "write", StringComparison.OrdinalIgnoreCase)
           || string.Equals(direction, "read-write", StringComparison.OrdinalIgnoreCase);

    public static bool DirectionAllowsRead(string? direction)
        => string.Equals(direction, "read", StringComparison.OrdinalIgnoreCase)
           || string.Equals(direction, "read-write", StringComparison.OrdinalIgnoreCase);

    public static bool IsRegisterArea(string? area)
        => string.Equals(area, "input-register", StringComparison.OrdinalIgnoreCase)
           || string.Equals(area, "holding-register", StringComparison.OrdinalIgnoreCase);

    public static bool Contains(string? value, IReadOnlyList<string> allowed)
        => value is not null && allowed.Any(candidate => string.Equals(candidate, value.Trim(), StringComparison.OrdinalIgnoreCase));

    /// <summary>Stable identity of an external target, used for duplicate/conflict detection.</summary>
    public static string TargetKey(SignalMappingEntryDto entry)
    {
        var target = entry.Target;
        return entry.Protocol?.Trim().ToLowerInvariant() switch
        {
            "opcua" => $"opcua:{target.NodeId}",
            "mqtt" => $"mqtt:{target.Topic}#{target.PayloadField}",
            "modbus" => $"modbus:{target.AddressConvention ?? "zero-based"}:{target.UnitId?.ToString() ?? string.Empty}:{target.Area}@{target.Address}:{target.Width}{(target.BitIndex is null ? string.Empty : $".{target.BitIndex}")}",
            _ => $"{entry.Protocol}:unknown",
        };
    }

    /// <summary>Registers/coils occupy one address; 32/64-bit register values occupy two.</summary>
    public static int RegisterCount(SignalMappingTargetDto target)
        => target.Width is null or <= 16 ? 1 : 2;
}

public sealed record SignalMappingValidation(
    IReadOnlyList<SignalMappingDiagnosticDto> Diagnostics,
    IReadOnlyList<SignalMappingConflictDto> Conflicts)
{
    public bool Valid => Diagnostics.All(diagnostic => !string.Equals(diagnostic.Severity, "error", StringComparison.OrdinalIgnoreCase));
}

/// <summary>
/// Validates mapping documents against the same rules as the simulator module
/// (<c>src/mapping</c>). Some duplication is deliberate: the client is authoritative for the
/// simulator signal catalog, while the server re-checks every rule before an apply.
/// </summary>
public static class SignalMappingValidator
{
    private static readonly string[] TopLevelFields = ["SchemaVersion", "Id", "Name", "Description", "Entries", "Version"];
    private static readonly string[] EntryFields =
    [
        "Id", "Name", "InternalSignalId", "EquipmentId", "Protocol", "Direction", "DataType",
        "Scale", "Offset", "Unit", "Enabled", "Target", "Description", "Notes",
    ];
    private static readonly string[] TargetFields =
    [
        "NodeId", "Topic", "PayloadField", "Retain", "Area", "Address", "Width", "BitIndex",
        "ByteOrder", "WordOrder", "Signed", "UnitId", "AddressConvention",
    ];
    private static readonly string[] ExecutableFields = ["compute", "script", "function", "expression", "eval", "exec", "code", "formula", "lambda", "sql"];

    private static readonly Regex AbsolutePath = new(@"^(?:[A-Za-z]:[\\/]|\\\\|/)", RegexOptions.Compiled);
    private static readonly Regex PathTraversal = new(@"(?:^|[\\/])\.\.(?:[\\/]|$)", RegexOptions.Compiled);
    private static readonly Regex FileUri = new(@"^file:", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static SignalMappingValidation Validate(
        SignalMappingDocumentDto document,
        IReadOnlyDictionary<string, InternalSignalDescriptor> catalog)
    {
        ArgumentNullException.ThrowIfNull(document);
        ArgumentNullException.ThrowIfNull(catalog);

        var diagnostics = new List<SignalMappingDiagnosticDto>();

        if (!string.Equals(document.SchemaVersion, SignalMappingVocabulary.SchemaVersion, StringComparison.Ordinal))
        {
            diagnostics.Add(Error("unsupported-version", $"Expected schemaVersion '1.0', got '{document.SchemaVersion}'.", "/schemaVersion"));
        }
        if (string.IsNullOrWhiteSpace(document.Id))
        {
            diagnostics.Add(Error("missing-id", "Mapping file is missing an id.", "/id"));
        }
        if (string.IsNullOrWhiteSpace(document.Name))
        {
            diagnostics.Add(Error("missing-name", "Mapping file is missing a name.", "/name"));
        }
        if (document.Entries is null)
        {
            diagnostics.Add(Error("missing-entries", "Mapping file 'entries' must be an array.", "/entries"));
            return new SignalMappingValidation(diagnostics, []);
        }

        var ids = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < document.Entries.Count; index++)
        {
            ValidateEntry(document.Entries[index], index, catalog, ids, diagnostics);
        }

        var conflicts = DetectConflicts(document);
        foreach (var conflict in conflicts)
        {
            diagnostics.Add(new SignalMappingDiagnosticDto(
                conflict.Severity, conflict.Code, conflict.Message,
                conflict.EntryIds.Count > 0 ? $"/entries/{IndexOfEntry(document, conflict.EntryIds[0])}" : "/entries",
                conflict.EntryIds.Count > 0 ? conflict.EntryIds[0] : null));
        }

        return new SignalMappingValidation(diagnostics, conflicts);
    }

    private static int IndexOfEntry(SignalMappingDocumentDto document, string entryId)
    {
        for (var index = 0; index < document.Entries.Count; index++)
        {
            if (string.Equals(document.Entries[index].Id, entryId, StringComparison.Ordinal)) return index;
        }
        return 0;
    }

    private static void ValidateEntry(
        SignalMappingEntryDto entry, int index,
        IReadOnlyDictionary<string, InternalSignalDescriptor> catalog,
        HashSet<string> ids, List<SignalMappingDiagnosticDto> diagnostics)
    {
        var path = $"/entries/{index}";
        var entryId = entry.Id;

        for (var field = 0; field < ExecutableFields.Length; field++)
        {
            // DTOs do not carry arbitrary fields, but identifiers and names could smuggle a
            // script marker; reject obvious executable-looking payloads explicitly.
            if (ContainsExecutableMarker(entry.Name) || ContainsExecutableMarker(entry.Notes))
            {
                diagnostics.Add(Error("executable-payload-rejected", "Mapping entries are data and cannot contain executable-looking content.", path, entryId));
                break;
            }
        }

        if (string.IsNullOrWhiteSpace(entry.Id))
        {
            diagnostics.Add(Error("missing-entry-id", "Mapping entry is missing an id.", $"{path}/id"));
        }
        else if (!ids.Add(entry.Id))
        {
            diagnostics.Add(Error("duplicate-entry-id", $"Duplicate mapping id '{entry.Id}'.", $"{path}/id", entryId));
        }
        if (string.IsNullOrWhiteSpace(entry.Name))
        {
            diagnostics.Add(Error("missing-entry-name", "Mapping entry is missing a name.", $"{path}/name", entryId));
        }

        if (!SignalMappingVocabulary.Contains(entry.Protocol, SignalMappingVocabulary.Protocols))
        {
            diagnostics.Add(Error("unsupported-protocol", $"Unsupported protocol '{entry.Protocol}'.", $"{path}/protocol", entryId));
        }
        if (!SignalMappingVocabulary.Contains(entry.Direction, SignalMappingVocabulary.Directions))
        {
            diagnostics.Add(Error("invalid-direction", $"Direction '{entry.Direction}' is not read, write or read-write.", $"{path}/direction", entryId));
        }
        if (!SignalMappingVocabulary.Contains(entry.DataType, SignalMappingVocabulary.DataTypes))
        {
            diagnostics.Add(Error("invalid-data-type", $"Data type '{entry.DataType}' is not a known signal data type.", $"{path}/dataType", entryId));
        }
        if (!double.IsFinite(entry.Scale) || entry.Scale == 0.0)
        {
            diagnostics.Add(Error("invalid-scale", "scale must be a finite, non-zero number.", $"{path}/scale", entryId));
        }
        if (!double.IsFinite(entry.Offset))
        {
            diagnostics.Add(Error("invalid-offset", "offset must be a finite number.", $"{path}/offset", entryId));
        }

        if (string.IsNullOrWhiteSpace(entry.InternalSignalId))
        {
            diagnostics.Add(Error("missing-signal-id", "internalSignalId is required.", $"{path}/internalSignalId", entryId));
        }
        else if (!catalog.TryGetValue(entry.InternalSignalId, out var signal))
        {
            diagnostics.Add(Error("unknown-signal", $"Internal signal '{entry.InternalSignalId}' is not declared in the signal catalog.", $"{path}/internalSignalId", entryId));
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(entry.EquipmentId) && !string.Equals(entry.EquipmentId, signal.EquipmentId, StringComparison.Ordinal))
            {
                diagnostics.Add(Warning("equipment-mismatch", $"equipmentId '{entry.EquipmentId}' does not match the signal's equipment '{signal.EquipmentId}'.", $"{path}/equipmentId", entryId));
            }
            if (SignalMappingVocabulary.DirectionAllowsWrite(entry.Direction) && !signal.Writable)
            {
                diagnostics.Add(Error("unwritable-write-direction", $"Signal '{entry.InternalSignalId}' is read-only but mapping direction is '{entry.Direction}'.", $"{path}/direction", entryId));
            }
            if (!string.Equals(entry.DataType, signal.DataType, StringComparison.OrdinalIgnoreCase))
            {
                diagnostics.Add(Warning("data-type-mismatch", $"Mapping data type '{entry.DataType}' differs from signal data type '{signal.DataType}'.", $"{path}/dataType", entryId));
            }
        }

        if (entry.Target is null)
        {
            diagnostics.Add(Error("missing-target", "Mapping entry requires a target descriptor.", $"{path}/target", entryId));
            return;
        }

        ValidateNoPaths(entry, path, entryId, diagnostics);

        switch (entry.Protocol?.Trim().ToLowerInvariant())
        {
            case "opcua":
                ValidateOpcUa(entry, path, entryId, diagnostics);
                break;
            case "mqtt":
                ValidateMqtt(entry, path, entryId, diagnostics);
                break;
            case "modbus":
                ValidateModbus(entry, path, entryId, diagnostics);
                break;
        }
    }

    private static void ValidateNoPaths(SignalMappingEntryDto entry, string path, string entryId, List<SignalMappingDiagnosticDto> diagnostics)
    {
        var target = entry.Target;
        void Check(string? value, string field)
        {
            if (string.IsNullOrEmpty(value)) return;
            var trimmed = value.Trim();
            if (AbsolutePath.IsMatch(trimmed) || PathTraversal.IsMatch(trimmed) || FileUri.IsMatch(trimmed))
            {
                diagnostics.Add(Error("path-traversal-rejected", $"Target field '{field}' must not reference a filesystem path ('{value}').", $"{path}/target/{field}", entryId));
            }
        }

        Check(target.NodeId, "nodeId");
        Check(target.Topic, "topic");
        Check(target.PayloadField, "payloadField");
    }

    private static void ValidateOpcUa(SignalMappingEntryDto entry, string path, string entryId, List<SignalMappingDiagnosticDto> diagnostics)
    {
        if (string.IsNullOrWhiteSpace(entry.Target.NodeId))
        {
            diagnostics.Add(Error("missing-node-id", "OPC UA mapping requires a 'nodeId'.", $"{path}/target/nodeId", entryId));
        }
    }

    private static void ValidateMqtt(SignalMappingEntryDto entry, string path, string entryId, List<SignalMappingDiagnosticDto> diagnostics)
    {
        if (string.IsNullOrWhiteSpace(entry.Target.Topic))
        {
            diagnostics.Add(Error("missing-topic", "MQTT mapping requires a 'topic'.", $"{path}/target/topic", entryId));
        }
        else if (entry.Target.Topic.Contains('#') || entry.Target.Topic.Contains('+'))
        {
            diagnostics.Add(Error("invalid-topic", "MQTT mapping topics must be concrete and cannot contain wildcards (+/#).", $"{path}/target/topic", entryId));
        }
        if (string.IsNullOrWhiteSpace(entry.Target.PayloadField))
        {
            diagnostics.Add(Error("missing-payload-field", "MQTT mapping requires a 'payloadField'.", $"{path}/target/payloadField", entryId));
        }
    }

    private static void ValidateModbus(SignalMappingEntryDto entry, string path, string entryId, List<SignalMappingDiagnosticDto> diagnostics)
    {
        var target = entry.Target;
        if (!SignalMappingVocabulary.Contains(target.Area, SignalMappingVocabulary.ModbusAreas))
        {
            diagnostics.Add(Error("invalid-area", $"Area '{target.Area}' is not coil, discrete-input, input-register or holding-register.", $"{path}/target/area", entryId));
            return;
        }
        if (target.Address is null || target.Address < 0)
        {
            diagnostics.Add(Error("invalid-address", "Modbus address must be a non-negative integer.", $"{path}/target/address", entryId));
        }
        if (target.Width is null || target.Width <= 0)
        {
            diagnostics.Add(Error("invalid-width", "Modbus width must be a positive integer.", $"{path}/target/width", entryId));
        }
        if (target.AddressConvention is not null && !SignalMappingVocabulary.Contains(target.AddressConvention, SignalMappingVocabulary.AddressConventions))
        {
            diagnostics.Add(Error("invalid-address-convention", $"Address convention '{target.AddressConvention}' is not zero-based or one-based.", $"{path}/target/addressConvention", entryId));
        }
        if (target.UnitId is { } unitId && (unitId < 1 || unitId > 247))
        {
            diagnostics.Add(Error("invalid-unit-id", "unitId must be an integer between 1 and 247.", $"{path}/target/unitId", entryId));
        }

        var registerArea = SignalMappingVocabulary.IsRegisterArea(target.Area);
        var dataType = entry.DataType?.Trim().ToLowerInvariant();

        if (dataType == "bool")
        {
            if (registerArea)
            {
                if (target.Width != 16)
                {
                    diagnostics.Add(Error("invalid-width", $"Boolean register mapping '{entry.Id}' must declare width 16.", $"{path}/target/width", entryId));
                }
                if (target.BitIndex is not { } bit || bit is < 0 or > 15)
                {
                    diagnostics.Add(Error("invalid-bit-index", "Boolean register mapping requires bitIndex between 0 and 15.", $"{path}/target/bitIndex", entryId));
                }
            }
            else
            {
                if (target.Width != 1)
                {
                    diagnostics.Add(Error("invalid-width", $"Boolean {target.Area} mapping '{entry.Id}' must declare width 1.", $"{path}/target/width", entryId));
                }
                if (target.BitIndex is not null)
                {
                    diagnostics.Add(Error("invalid-bit-index", $"Boolean {target.Area} mapping cannot carry a bitIndex.", $"{path}/target/bitIndex", entryId));
                }
            }
        }
        else if (dataType is "int" or "uint")
        {
            if (target.Width is not (16 or 32))
            {
                diagnostics.Add(Error("invalid-width", "Integer mapping must declare width 16 or 32 (64-bit integers are unsupported).", $"{path}/target/width", entryId));
            }
        }
        else if (dataType == "float")
        {
            if (target.Width is not (32 or 64))
            {
                diagnostics.Add(Error("invalid-width", "Float mapping must declare width 32 or 64.", $"{path}/target/width", entryId));
            }
        }

        if (registerArea)
        {
            if (target.ByteOrder is null)
            {
                diagnostics.Add(Error("ambiguous-endianness", "Register mapping must declare byteOrder explicitly.", $"{path}/target/byteOrder", entryId));
            }
            else if (!SignalMappingVocabulary.Contains(target.ByteOrder, SignalMappingVocabulary.ByteOrders))
            {
                diagnostics.Add(Error("invalid-byte-order", $"byteOrder '{target.ByteOrder}' is not big-endian or little-endian.", $"{path}/target/byteOrder", entryId));
            }

            if (target.Width is > 16)
            {
                if (target.WordOrder is null)
                {
                    diagnostics.Add(Error("missing-word-order", "Multi-word mapping must declare wordOrder explicitly.", $"{path}/target/wordOrder", entryId));
                }
                else if (!SignalMappingVocabulary.Contains(target.WordOrder, SignalMappingVocabulary.WordOrders))
                {
                    diagnostics.Add(Error("invalid-word-order", $"wordOrder '{target.WordOrder}' is not high-word-first or low-word-first.", $"{path}/target/wordOrder", entryId));
                }
            }
        }
        else if (target.BitIndex is not null)
        {
            diagnostics.Add(Error("invalid-bit-index", $"{target.Area} mappings are bit-level and cannot carry a bitIndex.", $"{path}/target/bitIndex", entryId));
        }

        if (target.Address is { } address && address >= 0 && target.Width is > 0)
        {
            var last = address + SignalMappingVocabulary.RegisterCount(target) - 1;
            if (last > 65535)
            {
                diagnostics.Add(Error("address-out-of-range", $"Mapping spans zero-based addresses {address}..{last}, beyond 65535.", $"{path}/target/address", entryId));
            }
        }
    }

    /// <summary>Two writers of the same target, or one signal on incompatible targets.</summary>
    public static IReadOnlyList<SignalMappingConflictDto> DetectConflicts(SignalMappingDocumentDto document)
    {
        ArgumentNullException.ThrowIfNull(document);
        var conflicts = new List<SignalMappingConflictDto>();
        var entries = document.Entries ?? [];

        var writersByTarget = new SortedDictionary<string, List<SignalMappingEntryDto>>(StringComparer.Ordinal);
        var entriesBySignal = new SortedDictionary<string, List<SignalMappingEntryDto>>(StringComparer.Ordinal);

        foreach (var entry in entries)
        {
            if (entry is null) continue;
            if (SignalMappingVocabulary.DirectionAllowsWrite(entry.Direction))
            {
                var key = SignalMappingVocabulary.TargetKey(entry);
                if (!writersByTarget.TryGetValue(key, out var bucket))
                {
                    bucket = [];
                    writersByTarget[key] = bucket;
                }
                bucket.Add(entry);
            }
            if (!entriesBySignal.TryGetValue(entry.InternalSignalId, out var signalBucket))
            {
                signalBucket = [];
                entriesBySignal[entry.InternalSignalId] = signalBucket;
            }
            signalBucket.Add(entry);
        }

        foreach (var (key, writers) in writersByTarget)
        {
            if (writers.Count < 2) continue;
            conflicts.Add(new SignalMappingConflictDto(
                "error", "duplicate-write-target",
                $"External target '{key}' is written by {writers.Count} mappings ({string.Join(", ", writers.Select(entry => entry.Id))}); ambiguous writes are unsafe.",
                writers.Select(entry => entry.Id).ToList()));
        }

        foreach (var (signalId, mappings) in entriesBySignal)
        {
            if (mappings.Count < 2) continue;
            var protocols = mappings.Select(entry => entry.Protocol).Distinct(StringComparer.OrdinalIgnoreCase).Count();
            var directions = mappings.Select(entry => entry.Direction).Distinct(StringComparer.OrdinalIgnoreCase).Count();
            var dataTypes = mappings.Select(entry => entry.DataType).Distinct(StringComparer.OrdinalIgnoreCase).Count();
            if (protocols > 1 || directions > 1 || dataTypes > 1)
            {
                conflicts.Add(new SignalMappingConflictDto(
                    "warning", "incompatible-signal-mapping",
                    $"Internal signal '{signalId}' is mapped to incompatible targets ({string.Join(", ", mappings.Select(entry => $"{entry.Id}:{entry.Protocol}/{entry.Direction}/{entry.DataType}"))}).",
                    mappings.Select(entry => entry.Id).ToList()));
            }
        }

        return conflicts;
    }

    private static bool ContainsExecutableMarker(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var lowered = value.ToLowerInvariant();
        return ExecutableFields.Any(field => lowered.Contains($"{field}(", StringComparison.Ordinal) || lowered.Contains($"{field} ", StringComparison.Ordinal));
    }

    private static SignalMappingDiagnosticDto Error(string code, string message, string? path = null, string? entryId = null)
        => new("error", code, message, path, entryId);

    private static SignalMappingDiagnosticDto Warning(string code, string message, string? path = null, string? entryId = null)
        => new("warning", code, message, path, entryId);
}

/// <summary>
/// Deterministic serialization of mapping documents: entries sorted by id and a fixed field
/// order, so equal documents produce byte-identical output. No timestamp is written.
/// </summary>
public static class SignalMappingSerializer
{
    public static string Serialize(SignalMappingDocumentDto document, bool pretty = true)
    {
        ArgumentNullException.ThrowIfNull(document);
        var root = new JsonObject
        {
            ["schemaVersion"] = SignalMappingVocabulary.SchemaVersion,
            ["id"] = document.Id,
            ["name"] = document.Name,
        };
        if (document.Description is not null) root["description"] = document.Description;

        var entries = new JsonArray();
        foreach (var entry in document.Entries.OrderBy(entry => entry.Id, StringComparer.Ordinal))
        {
            entries.Add(SerializeEntry(entry));
        }
        root["entries"] = entries;

        return root.ToJsonString(new JsonSerializerOptions { WriteIndented = pretty });
    }

    private static JsonNode SerializeEntry(SignalMappingEntryDto entry)
    {
        var node = new JsonObject
        {
            ["id"] = entry.Id,
            ["name"] = entry.Name,
        };
        if (entry.Description is not null) node["description"] = entry.Description;
        node["protocol"] = entry.Protocol;
        node["internalSignalId"] = entry.InternalSignalId;
        node["equipmentId"] = entry.EquipmentId;
        node["direction"] = entry.Direction;
        node["dataType"] = entry.DataType;
        node["scale"] = entry.Scale;
        node["offset"] = entry.Offset;
        if (entry.Unit is not null) node["unit"] = entry.Unit;
        node["enabled"] = entry.Enabled;
        if (entry.Notes is not null) node["notes"] = entry.Notes;
        node["target"] = SerializeTarget(entry.Protocol, entry.Target);
        return node;
    }

    private static JsonNode SerializeTarget(string protocol, SignalMappingTargetDto target)
    {
        var node = new JsonObject();
        switch (protocol?.Trim().ToLowerInvariant())
        {
            case "opcua":
                node["nodeId"] = target.NodeId;
                break;
            case "mqtt":
                node["topic"] = target.Topic;
                node["payloadField"] = target.PayloadField;
                if (target.Retain is not null) node["retain"] = target.Retain;
                break;
            case "modbus":
                node["area"] = target.Area;
                node["address"] = target.Address;
                node["width"] = target.Width;
                if (target.BitIndex is not null) node["bitIndex"] = target.BitIndex;
                if (target.ByteOrder is not null) node["byteOrder"] = target.ByteOrder;
                if (target.WordOrder is not null) node["wordOrder"] = target.WordOrder;
                if (target.Signed is not null) node["signed"] = target.Signed;
                if (target.UnitId is not null) node["unitId"] = target.UnitId;
                if (target.AddressConvention is not null) node["addressConvention"] = target.AddressConvention;
                break;
        }
        return node;
    }
}

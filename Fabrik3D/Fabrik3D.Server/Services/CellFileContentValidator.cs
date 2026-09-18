using System.Text.Json;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Lightweight content check for persisted cell files. Full human-readable
/// schema validation and migration live client-side; the server only needs
/// to confirm the file is JSON with a supported schema version.
/// </summary>
public static class CellFileContentValidator
{
    /// <summary>Schema versions the server accepts for persisted templates.</summary>
    public static readonly string[] SupportedVersions = ["0.9", "1.0"];

    /// <summary>
    /// Validates that content is a JSON object with a supported schemaVersion.
    /// Returns an error message, or null when the content is acceptable.
    /// </summary>
    public static string? ValidateContent(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return "Cell file content is required.";
        try
        {
            using var document = JsonDocument.Parse(content);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return "Cell file must be a JSON object.";
            if (!document.RootElement.TryGetProperty("schemaVersion", out var version))
                return "Cell file is missing the 'schemaVersion' property.";
            if (version.ValueKind != JsonValueKind.String)
                return "Cell file 'schemaVersion' must be a string.";
            var value = version.GetString();
            if (value is null || !SupportedVersions.Contains(value))
                return $"Unsupported cell file schemaVersion '{value}'. Supported versions: {string.Join(", ", SupportedVersions)}.";
            return null;
        }
        catch (JsonException)
        {
            return "Cell file content is not valid JSON.";
        }
    }

    /// <summary>Reads the schemaVersion from already-validated content.</summary>
    public static string SchemaVersionOf(string content)
    {
        using var document = JsonDocument.Parse(content);
        return document.RootElement.GetProperty("schemaVersion").GetString() ?? "1.0";
    }
}
namespace Fabrik3D.Infrastructure.OpcUa;
public record OpcUaNodeValue(string NodeId, object? Value, DateTime TimestampUtc);
public record OpcUaMappedState(string EquipmentId, string Category, string ExecutionState, Dictionary<string, object?> Measurements, DateTime TimestampUtc, string Source = "observed");
/** Sample namespace: ns=2;s=Fabrik3D/{Equipment}/{Field}. No vendor model is implied. */
public static class OpcUaMapping
{
    public static OpcUaMappedState Map(string equipmentId, string category, IEnumerable<OpcUaNodeValue> values)
    {
        var nodes = values.ToList();
        var execution = nodes.FirstOrDefault(v => v.NodeId.EndsWith("/ExecutionState", StringComparison.Ordinal))?.Value?.ToString() ?? "Unknown";
        var measurements = nodes.Where(v => !v.NodeId.EndsWith("/ExecutionState", StringComparison.Ordinal)).ToDictionary(v => v.NodeId.Split('/').Last(), v => v.Value);
        return new(equipmentId, category, execution, measurements, nodes.Count == 0 ? DateTime.UtcNow : nodes.Max(v => v.TimestampUtc));
    }
    public static bool CanWrite(OpcUaOptions options, string nodeId) => options.Enabled && options.AllowWrites && options.WriteAllowList.Contains(nodeId, StringComparer.Ordinal);
}

namespace Fabrik3D.Domain.Historian;

/// <summary>
/// Versioned historian vocabulary (S40). The historian persists selected telemetry samples and
/// orchestration events. It is deliberately additive and never on the command path.
/// </summary>
public static class HistorianSchema
{
    /// <summary>Document schema version written to every historian document.</summary>
    public const string Version = "1.0";

    public const string TelemetrySampleCollection = "telemetrySamples";

    public const string HistorizedEventCollection = "historizedEvents";

    /// <summary>Hard cap on a single historized event payload, in characters.</summary>
    public const int DefaultMaxPayloadLength = 4096;
}

/// <summary>
/// The kind of a historized event. Wire names are stable and map to the simulator timeline kinds
/// without changing their local semantics.
/// </summary>
public enum HistorianEventKind
{
    Event,
    Command,
    StateTransition,
    Alarm,
    Acknowledgement,
    Authority,
    Fault,
}

/// <summary>Canonical string representation of historian vocabulary (stable wire contract).</summary>
public static class HistorianVocabulary
{
    public static string ToWire(HistorianEventKind kind) => kind switch
    {
        HistorianEventKind.Event => "event",
        HistorianEventKind.Command => "command",
        HistorianEventKind.StateTransition => "state-transition",
        HistorianEventKind.Alarm => "alarm",
        HistorianEventKind.Acknowledgement => "acknowledgement",
        HistorianEventKind.Authority => "authority",
        HistorianEventKind.Fault => "fault",
        _ => "event",
    };

    public static bool TryParseKind(string? value, out HistorianEventKind kind)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "event": kind = HistorianEventKind.Event; return true;
            case "command": kind = HistorianEventKind.Command; return true;
            case "state-transition": kind = HistorianEventKind.StateTransition; return true;
            case "alarm": kind = HistorianEventKind.Alarm; return true;
            case "acknowledgement":
            case "acknowledgment": kind = HistorianEventKind.Acknowledgement; return true;
            case "authority": kind = HistorianEventKind.Authority; return true;
            case "fault":
            case "fault-action": kind = HistorianEventKind.Fault; return true;
            default: kind = HistorianEventKind.Event; return false;
        }
    }

    private static readonly string[] KnownSeverities = ["info", "warning", "error", "critical"];

    public static bool IsKnownSeverity(string? severity) =>
        severity is not null && KnownSeverities.Contains(severity.Trim().ToLowerInvariant());

    /// <summary>Maps a simulator timeline kind to a historian event kind. Unknown kinds become event.</summary>
    public static HistorianEventKind FromTimelineKind(string? timelineKind) =>
        timelineKind?.Trim().ToLowerInvariant() switch
        {
            "command" => HistorianEventKind.Command,
            "state-transition" => HistorianEventKind.StateTransition,
            "alarm" => HistorianEventKind.Alarm,
            "acknowledgement" => HistorianEventKind.Acknowledgement,
            "fault-action" => HistorianEventKind.Fault,
            "telemetry" => HistorianEventKind.Event,
            _ => HistorianEventKind.Event,
        };
}

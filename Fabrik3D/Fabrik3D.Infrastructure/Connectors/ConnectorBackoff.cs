namespace Fabrik3D.Infrastructure.Connectors;

/// <summary>
/// Shared bounded-exponential reconnect backoff used by every industrial connector (S56).
/// The formula was previously duplicated identically in the OPC UA, MQTT and Modbus connectors;
/// extracting it makes the reconnect policy a single, tested contract:
/// <c>delay = min(max, base * 2^(attempt-1))</c>, capped at exponent 10, and zero when the base
/// delay is zero (immediate retry, used by tests and explicit development fixtures).
/// </summary>
public static class ConnectorBackoff
{
    /// <summary>Highest exponent applied, so <c>base * 2^10</c> bounds the un-capped growth.</summary>
    public const int MaxExponent = 10;

    /// <summary>
    /// Computes the delay before reconnect <paramref name="attempt"/> (1-based). Invalid, non-positive
    /// attempts are treated as the first attempt instead of producing a negative exponent.
    /// </summary>
    /// <param name="attempt">1-based reconnect attempt counter.</param>
    /// <param name="baseDelaySeconds">Initial delay in seconds; 0 means retry immediately.</param>
    /// <param name="maxDelaySeconds">Upper bound in seconds.</param>
    public static TimeSpan Compute(int attempt, int baseDelaySeconds, int maxDelaySeconds)
    {
        var baseSeconds = Math.Max(0, baseDelaySeconds);
        if (baseSeconds == 0)
        {
            return TimeSpan.Zero;
        }

        var maxSeconds = Math.Max(baseSeconds, maxDelaySeconds);
        var normalizedAttempt = Math.Max(1, attempt);
        var exponent = Math.Min(normalizedAttempt - 1, MaxExponent);
        var seconds = Math.Min(maxSeconds, baseSeconds * Math.Pow(2, exponent));
        return TimeSpan.FromSeconds(seconds);
    }
}

namespace Fabrik3D.Server.Demo;

/// <summary>
/// Explicit public-demo lifecycle configuration (section "Demo", S63). The bounded demo reset is
/// disabled by default and is only available in the clearly-labelled public-demo deployment profile;
/// no production profile enables it, so production/profile data can never be reset through it.
/// </summary>
public sealed class DemoOptions
{
    public const string SectionName = "Demo";

    /// <summary>True only for the dedicated public-demo deployment profile (appsettings.Demo.json).</summary>
    public bool Enabled { get; set; }

    /// <summary>Allows the operator-triggered bounded reset when the demo profile is enabled.</summary>
    public bool ResetEnabled { get; set; } = true;

    /// <summary>Operator-facing label for the reset affordance.</summary>
    public string ResetLabel { get; set; } = "Reset Demo";

    /// <summary>True when the bounded reset endpoint and HMI affordance are available.</summary>
    public bool IsResetAvailable => Enabled && ResetEnabled;
}

namespace Fabrik3D.Server.Hubs;

/// <summary>
/// SignalR group names for targeted orchestration dispatch (S51). Groups are scoped by simulator
/// identity so a targeted execution request never reaches unrelated simulators or tenants.
/// </summary>
public static class OrchestrationGroups
{
    /// <summary>Group a simulator joins to receive targeted execution requests.</summary>
    public static string Simulator(string simulatorId) => $"simulator:{simulatorId}";

    /// <summary>Group for HMI observers of a single job's dispatch lifecycle.</summary>
    public static string Job(string jobId) => $"job:{jobId}";
}

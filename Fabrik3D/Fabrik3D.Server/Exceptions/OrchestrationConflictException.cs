namespace Fabrik3D.Server.Exceptions;

/// <summary>
/// Raised when a command conflicts with the current orchestration state:
/// concurrent modifications, ownership violations, or unclaimable jobs.
/// Mapped to HTTP 409 with the provided error code.
/// </summary>
public class OrchestrationConflictException : Exception
{
    public string Code { get; }

    public OrchestrationConflictException(string code, string message) : base(message)
    {
        Code = code;
    }
}

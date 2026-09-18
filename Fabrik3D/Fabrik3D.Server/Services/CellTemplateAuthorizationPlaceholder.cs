using Fabrik3D.Server.Settings;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Authorization placeholder around cell template storage. There is no
/// real identity provider yet, so the guard is gated by configuration and
/// checks for a minimal operator identifier header. Tests verify both the
/// enabled (rejecting) and disabled (allowing) behaviours.
/// </summary>
public class CellTemplateAuthorizationPlaceholder
{
    private readonly IOptions<OrchestrationOptions> _options;

    public CellTemplateAuthorizationPlaceholder(IOptions<OrchestrationOptions> options)
    {
        _options = options;
    }

    /// <summary>
    /// True when the write may proceed. When false, <paramref name="reason"/>
    /// holds a human-readable explanation.
    /// </summary>
    public bool IsWriteAllowed(HttpContext context, out string? reason)
    {
        if (!_options.Value.RequireCellTemplateAuth)
        {
            reason = null;
            return true;
        }

        var operatorId = context.Request.Headers["X-Operator-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(operatorId))
        {
            reason = "Cell template writes require an 'X-Operator-Id' header.";
            return false;
        }
        reason = null;
        return true;
    }
}
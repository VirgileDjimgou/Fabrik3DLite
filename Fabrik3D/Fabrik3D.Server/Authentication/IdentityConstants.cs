namespace Fabrik3D.Server.Authentication;

/// <summary>
/// Stable role names used on the wire, in tokens and in policy requirements.
/// </summary>
public static class Fabrik3DRoles
{
    public const string Learner = "Learner";
    public const string Instructor = "Instructor";
    public const string Engineer = "Engineer";
    public const string Operator = "Operator";
    public const string Administrator = "Administrator";

    /// <summary>
    /// Clearly-labelled public/demo read-only identity. Never grants any mutating permission and is
    /// only meaningful when explicitly enabled by configuration.
    /// </summary>
    public const string PublicDemo = "PublicDemo";

    /// <summary>Documentation order for the permission matrix and discovery payload.</summary>
    public static readonly IReadOnlyList<string> All =
    [
        Learner, Instructor, Engineer, Operator, Administrator,
    ];

    public static bool IsKnown(string? role)
        => role is not null && All.Contains(role, StringComparer.Ordinal);

    public static bool IsAssignable(string? role, bool publicDemoEnabled)
        => IsKnown(role) || (publicDemoEnabled && string.Equals(role, PublicDemo, StringComparison.Ordinal));
}

/// <summary>
/// Named authorization policies and the documented role → permission matrix. Authorization is
/// enforced server-side; the frontends only reflect the resulting 401/403 responses.
/// </summary>
public static class Fabrik3DPolicies
{
    /// <summary>Any authenticated principal, including the public demo identity.</summary>
    public const string Authenticated = "Fabrik3D.Authenticated";

    /// <summary>Read access to jobs, sessions, alarms, messages, historian queries and diagnostics.</summary>
    public const string Read = "Fabrik3D.Read";

    /// <summary>Machine control: job/task lifecycle, alarms, session and machine state, telemetry ingest.</summary>
    public const string Operate = "Fabrik3D.Operate";

    /// <summary>
    /// Training evidence reporting: starting/reporting/completing the caller's own training session
    /// (S44). Instructors read within their organization through <see cref="Read"/> plus the
    /// instructor-correction policy <see cref="Instruct"/>.
    /// </summary>
    public const string Train = "Fabrik3D.Train";

    /// <summary>Engineering: cell templates, signal mappings, connector configuration, forced handover.</summary>
    public const string Engineer = "Fabrik3D.Engineer";

    /// <summary>Instructor actions: training sessions, fault-lab and assessment control (S44+).</summary>
    public const string Instruct = "Fabrik3D.Instruct";

    /// <summary>Administration: role assignment and privileged server configuration.</summary>
    public const string Admin = "Fabrik3D.Admin";

    /// <summary>
    /// Documented permission matrix. Keep in sync with the architecture document
    /// <c>docs/architecture/IDENTITY_AND_RBAC.md</c>; tests assert this matrix.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> PermissionMatrix =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [Read] = [Fabrik3DRoles.Learner, Fabrik3DRoles.Instructor, Fabrik3DRoles.Engineer, Fabrik3DRoles.Operator, Fabrik3DRoles.Administrator, Fabrik3DRoles.PublicDemo],
            [Operate] = [Fabrik3DRoles.Operator, Fabrik3DRoles.Engineer, Fabrik3DRoles.Administrator],
            [Train] = [Fabrik3DRoles.Learner, Fabrik3DRoles.Instructor, Fabrik3DRoles.Administrator],
            [Engineer] = [Fabrik3DRoles.Engineer, Fabrik3DRoles.Administrator],
            [Instruct] = [Fabrik3DRoles.Instructor, Fabrik3DRoles.Administrator],
            [Admin] = [Fabrik3DRoles.Administrator],
        };

    public static IReadOnlyList<string> RolesFor(string policy)
        => PermissionMatrix.TryGetValue(policy, out var roles) ? roles : [];
}

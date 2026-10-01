using Fabrik3D.Contracts.DTOs;

namespace Fabrik3D.Server.Exceptions;

/// <summary>
/// Raised when a composer submission is structurally invalid or incompatible with the selected
/// cell/scenario (S52). Mapped to HTTP 400 with the actionable issue list.
/// </summary>
public class JobComposerValidationException : Exception
{
    public IReadOnlyList<ComposerValidationIssueDto> Errors { get; }

    public JobComposerValidationException(IReadOnlyList<ComposerValidationIssueDto> errors)
        : base(errors.Count == 0
            ? "The job definition is invalid."
            : string.Join(" ", errors.Select(e => e.Message)))
    {
        Errors = errors;
    }
}
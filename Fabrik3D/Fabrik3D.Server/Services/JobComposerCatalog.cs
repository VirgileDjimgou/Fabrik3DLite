namespace Fabrik3D.Server.Services;

/// <summary>A logical target cell and the scenarios it supports (S52).</summary>
public sealed record ComposerCellDefinition(
    string Id,
    string Name,
    string DefaultScenarioId,
    IReadOnlyList<string> CompatibleScenarioIds);

/// <summary>A selectable scenario/recipe (S52).</summary>
public sealed record ComposerScenarioDefinition(string Id, string Name, string Level);

/// <summary>
/// Server-side composer catalog (S52). It mirrors the built-in simulator scene/scenario catalog so
/// the server can validate cell/scenario compatibility without trusting client input. It is static,
/// versioned data: no arbitrary code and no client-supplied catalog.
/// </summary>
public static class JobComposerCatalog
{
    public static readonly IReadOnlyList<ComposerScenarioDefinition> Scenarios =
    [
        new("robot-axes", "Robot axes", "beginner"),
        new("coordinate-frames", "Coordinate frames", "beginner"),
        new("pick-and-place", "Pick and place", "intermediate"),
        new("cnc-loading", "CNC loading", "intermediate"),
        new("pallet-processing", "Complete pallet processing", "advanced"),
        new("sorting-normal-cycle", "Vision sorting normal cycle", "intermediate"),
        new("sorting-jam-recovery", "Vision sorting jam recovery", "advanced"),
        new("palletizing-normal-cycle", "Palletizing normal cycle", "intermediate"),
        new("palletizing-vacuum-recovery", "Palletizing vacuum recovery", "advanced"),
        new("assembly-inspection-cycle", "Assembly and inspection", "intermediate"),
        new("safety-door-recovery", "Safety door recovery", "advanced"),
    ];

    public static readonly IReadOnlyList<ComposerCellDefinition> Cells =
    [
        new("reference-cell", "CNC machine tending (reference)", "pallet-processing",
            ["robot-axes", "coordinate-frames", "pick-and-place", "cnc-loading", "pallet-processing"]),
        new("vision-sorting-cell", "Vision sorting cell", "sorting-normal-cycle",
            ["sorting-normal-cycle", "sorting-jam-recovery"]),
        new("palletizing-cell", "Robot palletizing cell", "palletizing-normal-cycle",
            ["palletizing-normal-cycle", "palletizing-vacuum-recovery"]),
        new("assembly-inspection-cell", "Assembly and inspection cell", "assembly-inspection-cycle",
            ["assembly-inspection-cycle"]),
        new("safety-training-cell", "Robot safety training cell", "safety-door-recovery",
            ["safety-door-recovery"]),
    ];

    public static ComposerCellDefinition? FindCell(string? id) =>
        string.IsNullOrWhiteSpace(id)
            ? null
            : Cells.FirstOrDefault(c => string.Equals(c.Id, id.Trim(), StringComparison.Ordinal));

    public static ComposerScenarioDefinition? FindScenario(string? id) =>
        string.IsNullOrWhiteSpace(id)
            ? null
            : Scenarios.FirstOrDefault(s => string.Equals(s.Id, id.Trim(), StringComparison.Ordinal));
}
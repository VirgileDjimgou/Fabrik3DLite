using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Domain.Entities;
using TaskStatusEnum = Fabrik3D.Contracts.Enums.TaskStatus;

namespace Fabrik3D.Domain.Jobs;

/// <summary>Actionable validation issue produced while planning a job definition.</summary>
public sealed record JobDefinitionIssue(string Code, string Field, string Message);

/// <summary>Deterministic plan for a composer submission: issues plus the tasks to persist.</summary>
public sealed record JobDefinitionPlan(
    List<JobDefinitionIssue> Issues,
    List<MachiningTask> Tasks,
    string? PalletId,
    int PalletRows,
    int PalletColumns,
    bool UsesGeneratedTasks)
{
    public bool IsValid => Issues.Count == 0;
}

/// <summary>
/// Structural composer rules (S52): pallet bounds, duplicate slots, task bounds and deterministic
/// row/column task generation. Cell/scenario compatibility is resolved by the server catalog on top
/// of this pure plan so the same structural rules are unit-testable without infrastructure.
/// </summary>
public static class JobComposerRules
{
    public const int MaxRows = 32;
    public const int MaxColumns = 32;
    public const int MaxTasks = 256;

    public static JobDefinitionPlan Plan(string jobId, CreateJobRequest request)
    {
        var issues = new List<JobDefinitionIssue>();

        if (!Enum.TryParse<MachineMode>(request.MachineMode, true, out _))
        {
            issues.Add(new JobDefinitionIssue(
                "invalid_machine_mode", "machineMode",
                $"Machine mode '{request.MachineMode}' is not supported. Use Automatic, Manual or Setup."));
        }

        if (request.Priority is < 0 or > 9)
        {
            issues.Add(new JobDefinitionIssue(
                "invalid_priority", "priority", "Priority must be between 0 and 9."));
        }

        string? palletId = null;
        var rows = 0;
        var columns = 0;
        var tasks = new List<MachiningTask>();
        var usesGeneratedTasks = false;

        if (request.PalletLayout is not null)
        {
            usesGeneratedTasks = true;
            palletId = request.PalletLayout.PalletId?.Trim();
            rows = request.PalletLayout.Rows;
            columns = request.PalletLayout.Columns;

            if (string.IsNullOrWhiteSpace(palletId))
            {
                issues.Add(new JobDefinitionIssue(
                    "invalid_pallet_id", "palletLayout.palletId", "A pallet id is required."));
            }

            if (rows is < 1 or > MaxRows)
            {
                issues.Add(new JobDefinitionIssue(
                    "invalid_pallet_rows", "palletLayout.rows",
                    $"Pallet rows must be between 1 and {MaxRows}."));
            }

            if (columns is < 1 or > MaxColumns)
            {
                issues.Add(new JobDefinitionIssue(
                    "invalid_pallet_columns", "palletLayout.columns",
                    $"Pallet columns must be between 1 and {MaxColumns}."));
            }

            var seen = new HashSet<string>(StringComparer.Ordinal);
            var slots = new List<(int Row, int Column)>();
            foreach (var slot in request.OccupiedSlots)
            {
                if (slot.Row < 0 || slot.Row >= rows || slot.Column < 0 || slot.Column >= columns)
                {
                    issues.Add(new JobDefinitionIssue(
                        "slot_out_of_bounds", "occupiedSlots",
                        $"Slot R{slot.Row} C{slot.Column} is outside the {rows}x{columns} pallet."));
                    continue;
                }

                var key = $"{slot.Row}:{slot.Column}";
                if (!seen.Add(key))
                {
                    issues.Add(new JobDefinitionIssue(
                        "duplicate_slot", "occupiedSlots",
                        $"Slot R{slot.Row} C{slot.Column} is declared more than once."));
                    continue;
                }

                slots.Add((slot.Row, slot.Column));
            }

            if (slots.Count == 0)
            {
                issues.Add(new JobDefinitionIssue(
                    "no_tasks", "occupiedSlots",
                    "Select at least one occupied pallet slot to generate tasks."));
            }
            else if (slots.Count > MaxTasks)
            {
                issues.Add(new JobDefinitionIssue(
                    "too_many_tasks", "occupiedSlots",
                    $"A job is limited to {MaxTasks} tasks; {slots.Count} slots were selected."));
            }
            else if (issues.Count == 0)
            {
                tasks = GenerateFromSlots(jobId, palletId!, slots, request.PartType);
            }
        }
        else if (request.Tasks.Count > 0)
        {
            if (request.Tasks.Count > MaxTasks)
            {
                issues.Add(new JobDefinitionIssue(
                    "too_many_tasks", "tasks",
                    $"A job is limited to {MaxTasks} tasks; {request.Tasks.Count} were supplied."));
            }
            else
            {
                var seen = new HashSet<string>(StringComparer.Ordinal);
                for (var i = 0; i < request.Tasks.Count; i++)
                {
                    var t = request.Tasks[i];
                    var taskPallet = string.IsNullOrWhiteSpace(t.PalletId) ? null : t.PalletId!.Trim();
                    if (taskPallet is not null)
                    {
                        var key = $"{taskPallet}:{t.SlotRow}:{t.SlotColumn}";
                        if (!seen.Add(key))
                        {
                            issues.Add(new JobDefinitionIssue(
                                "duplicate_slot", $"tasks[{i}]",
                                $"Slot R{t.SlotRow} C{t.SlotColumn} on pallet '{taskPallet}' is declared more than once."));
                        }
                    }

                    tasks.Add(new MachiningTask
                    {
                        JobId = jobId,
                        Name = t.Name,
                        Description = t.Description,
                        PartType = t.PartType,
                        PalletId = taskPallet,
                        SlotRow = t.SlotRow,
                        SlotColumn = t.SlotColumn,
                        SlotKey = taskPallet is null ? null : $"{taskPallet}:R{t.SlotRow}:C{t.SlotColumn}",
                        SequenceOrder = i,
                        Status = TaskStatusEnum.Pending,
                        IsRequired = true,
                    });
                }
            }
        }
        else
        {
            issues.Add(new JobDefinitionIssue(
                "no_tasks", "tasks",
                "A job definition requires at least one task or occupied pallet slot."));
        }

        return new JobDefinitionPlan(issues, tasks, palletId, rows, columns, usesGeneratedTasks);
    }

    /// <summary>
    /// Deterministic generation: slots are ordered by row then column (ascending) and each task gets
    /// a stable name, slot key and sequence order. Identical input always yields identical output.
    /// </summary>
    public static List<MachiningTask> GenerateFromSlots(
        string jobId, string palletId, IEnumerable<(int Row, int Column)> slots, string? partType)
    {
        var normalizedPartType = string.IsNullOrWhiteSpace(partType) ? "part" : partType.Trim();
        return slots
            .OrderBy(s => s.Row)
            .ThenBy(s => s.Column)
            .Select((slot, index) => new MachiningTask
            {
                JobId = jobId,
                Name = $"Slot R{slot.Row} C{slot.Column}",
                Description = $"Generated from pallet '{palletId}' slot R{slot.Row} C{slot.Column}.",
                PartType = normalizedPartType,
                PalletId = palletId,
                SlotRow = slot.Row,
                SlotColumn = slot.Column,
                SlotKey = $"{palletId}:R{slot.Row}:C{slot.Column}",
                SequenceOrder = index,
                Status = TaskStatusEnum.Pending,
                IsRequired = true,
            })
            .ToList();
    }
}
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Jobs;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S52 deterministic composer rules: row/column task generation, stable ordering/keys and
/// structural validation of pallets, slots and task bounds.
/// </summary>
public class JobComposerRulesTests
{
    private static CreateJobRequest Request(
        PalletLayoutRequest? layout = null,
        List<PalletSlotRequest>? slots = null,
        List<CreateTaskRequest>? tasks = null) => new()
    {
        Name = "Composer job",
        MachineMode = "Automatic",
        PalletLayout = layout,
        OccupiedSlots = slots ?? [],
        Tasks = tasks ?? [],
        PartType = "hex-billet",
    };

    [Fact]
    public void Generation_is_deterministic_row_major_with_stable_keys()
    {
        var request = Request(
            new PalletLayoutRequest { PalletId = "pallet-7", Rows = 3, Columns = 3 },
            [
                new PalletSlotRequest { Row = 2, Column = 1 },
                new PalletSlotRequest { Row = 0, Column = 2 },
                new PalletSlotRequest { Row = 0, Column = 0 },
            ]);

        var first = JobComposerRules.Plan("job-1", request);
        var second = JobComposerRules.Plan("job-1", request);

        Assert.True(first.IsValid);
        Assert.Equal(3, first.Tasks.Count);
        Assert.Equal(
            first.Tasks.Select(t => (t.SequenceOrder, t.Name, t.SlotKey)),
            second.Tasks.Select(t => (t.SequenceOrder, t.Name, t.SlotKey)));

        Assert.Equal([0, 1, 2], first.Tasks.Select(t => t.SequenceOrder));
        Assert.Equal(["Slot R0 C0", "Slot R0 C2", "Slot R2 C1"], first.Tasks.Select(t => t.Name));
        Assert.Equal(
            ["pallet-7:R0:C0", "pallet-7:R0:C2", "pallet-7:R2:C1"],
            first.Tasks.Select(t => t.SlotKey));
        Assert.All(first.Tasks, t => Assert.Equal("hex-billet", t.PartType));
        Assert.All(first.Tasks, t => Assert.True(t.IsRequired));
    }

    [Fact]
    public void Zero_tasks_is_invalid()
    {
        var plan = JobComposerRules.Plan("job-1", Request());

        Assert.False(plan.IsValid);
        Assert.Contains(plan.Issues, i => i.Code == "no_tasks");
    }

    [Fact]
    public void Empty_occupied_slots_is_invalid()
    {
        var plan = JobComposerRules.Plan("job-1", Request(
            new PalletLayoutRequest { PalletId = "pallet-1", Rows = 2, Columns = 2 }));

        Assert.False(plan.IsValid);
        Assert.Contains(plan.Issues, i => i.Code == "no_tasks");
    }

    [Fact]
    public void Duplicate_slots_are_rejected()
    {
        var plan = JobComposerRules.Plan("job-1", Request(
            new PalletLayoutRequest { PalletId = "pallet-1", Rows = 2, Columns = 2 },
            [
                new PalletSlotRequest { Row = 1, Column = 1 },
                new PalletSlotRequest { Row = 1, Column = 1 },
            ]));

        Assert.False(plan.IsValid);
        Assert.Contains(plan.Issues, i => i.Code == "duplicate_slot");
    }

    [Fact]
    public void Out_of_bounds_slots_are_rejected()
    {
        var plan = JobComposerRules.Plan("job-1", Request(
            new PalletLayoutRequest { PalletId = "pallet-1", Rows = 2, Columns = 2 },
            [new PalletSlotRequest { Row = 2, Column = 0 }]));

        Assert.False(plan.IsValid);
        Assert.Contains(plan.Issues, i => i.Code == "slot_out_of_bounds");
    }

    [Fact]
    public void Invalid_pallet_dimensions_are_rejected()
    {
        var plan = JobComposerRules.Plan("job-1", Request(
            new PalletLayoutRequest { PalletId = "pallet-1", Rows = 0, Columns = 99 },
            [new PalletSlotRequest { Row = 0, Column = 0 }]));

        Assert.False(plan.IsValid);
        Assert.Contains(plan.Issues, i => i.Code == "invalid_pallet_rows");
        Assert.Contains(plan.Issues, i => i.Code == "invalid_pallet_columns");
    }

    [Fact]
    public void Too_many_tasks_is_rejected()
    {
        var slots = Enumerable.Range(0, JobComposerRules.MaxTasks + 1)
            .Select(i => new PalletSlotRequest { Row = i / 32, Column = i % 32 })
            .ToList();

        var plan = JobComposerRules.Plan("job-1", Request(
            new PalletLayoutRequest { PalletId = "pallet-1", Rows = 32, Columns = 32 }, slots));

        Assert.False(plan.IsValid);
        Assert.Contains(plan.Issues, i => i.Code == "too_many_tasks");
    }

    [Fact]
    public void Explicit_tasks_are_preserved_in_order()
    {
        var plan = JobComposerRules.Plan("job-1", Request(tasks:
        [
            new CreateTaskRequest { Name = "First", PartType = "a", PalletId = "p1", SlotRow = 0, SlotColumn = 0 },
            new CreateTaskRequest { Name = "Second", PartType = "b", PalletId = "p1", SlotRow = 0, SlotColumn = 1 },
        ]));

        Assert.True(plan.IsValid);
        Assert.Equal(["First", "Second"], plan.Tasks.Select(t => t.Name));
        Assert.Equal([0, 1], plan.Tasks.Select(t => t.SequenceOrder));
        Assert.Equal("p1:R0:C0", plan.Tasks[0].SlotKey);
    }

    [Fact]
    public void Explicit_duplicate_slots_are_rejected()
    {
        var plan = JobComposerRules.Plan("job-1", Request(tasks:
        [
            new CreateTaskRequest { Name = "First", PalletId = "p1", SlotRow = 0, SlotColumn = 0 },
            new CreateTaskRequest { Name = "Second", PalletId = "p1", SlotRow = 0, SlotColumn = 0 },
        ]));

        Assert.False(plan.IsValid);
        Assert.Contains(plan.Issues, i => i.Code == "duplicate_slot");
    }

    [Fact]
    public void Invalid_machine_mode_and_priority_are_rejected()
    {
        var request = Request(tasks: [new CreateTaskRequest { Name = "T" }]) with
        {
            MachineMode = "Teleport",
            Priority = 42,
        };

        var plan = JobComposerRules.Plan("job-1", request);

        Assert.False(plan.IsValid);
        Assert.Contains(plan.Issues, i => i.Code == "invalid_machine_mode");
        Assert.Contains(plan.Issues, i => i.Code == "invalid_priority");
    }
}
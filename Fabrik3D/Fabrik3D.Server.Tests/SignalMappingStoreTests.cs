using Fabrik3D.Domain.Mapping;
using Fabrik3D.Server.Services;
using Xunit;

namespace Fabrik3D.Server.Tests;

/// <summary>Versioned store semantics: optimistic concurrency, activation and audit.</summary>
public class SignalMappingStoreTests
{
    private static SignalMappingStore CreateStore() => new(TimeProvider.System);

    [Fact]
    public void Upsert_creates_then_increments_the_version()
    {
        var store = CreateStore();
        var document = SignalMappingTestData.SampleDocument();

        Assert.True(store.TryUpsert(document, 0, true, "tester", out var created, out var error), error);
        Assert.Equal(1, created!.Version);

        var updated = document with { Name = "Renamed" };
        Assert.True(store.TryUpsert(updated, 1, true, "tester", out var second, out error), error);
        Assert.Equal(2, second!.Version);
        Assert.Equal("Renamed", store.Get(document.Id)!.Document.Name);
    }

    [Fact]
    public void Upsert_rejects_stale_and_duplicate_versions()
    {
        var store = CreateStore();
        var document = SignalMappingTestData.SampleDocument();
        Assert.True(store.TryUpsert(document, 0, true, "tester", out _, out _));

        Assert.False(store.TryUpsert(document, 0, true, "tester", out _, out var duplicateError));
        Assert.Equal("already-exists", duplicateError);

        Assert.False(store.TryUpsert(document, 99, true, "tester", out _, out var staleError));
        Assert.Equal("concurrent-modification", staleError);

        Assert.False(store.TryUpsert(document with { Id = "missing" }, 3, true, "tester", out _, out var missingError));
        Assert.Equal("not-found", missingError);
    }

    [Fact]
    public void Delete_is_version_guarded_and_removes_active_state()
    {
        var store = CreateStore();
        var document = SignalMappingTestData.SampleDocument();
        store.TryUpsert(document, 0, true, "tester", out var stored, out _);
        store.Activate(stored!.Document, "tester");
        Assert.NotNull(store.ActiveDocument(document.Id));

        Assert.False(store.TryDelete(document.Id, 99, "tester", out var versionError));
        Assert.Equal("concurrent-modification", versionError);

        Assert.True(store.TryDelete(document.Id, 1, "tester", out _));
        Assert.Null(store.Get(document.Id));
        Assert.Null(store.ActiveDocument(document.Id));
    }

    [Fact]
    public void List_and_audit_are_deterministic()
    {
        var store = CreateStore();
        store.TryUpsert(SignalMappingTestData.SampleDocument(), 0, true, "tester", out _, out _);
        var summaries = store.List();
        Assert.Single(summaries);
        Assert.Equal(6, summaries[0].EntryCount);
        Assert.True(summaries[0].Valid);
        Assert.Contains(store.Audit(), entry => entry.Action == "upsert");
    }

    [Fact]
    public void Activate_indexes_the_document_by_protocol()
    {
        var store = CreateStore();
        var document = SignalMappingTestData.SampleDocument();
        store.TryUpsert(document, 0, true, "tester", out var stored, out _);
        store.Activate(stored!.Document, "tester");

        Assert.Equal(document.Id, store.ActiveForProtocol("opcua")!.Id);
        Assert.Equal(document.Id, store.ActiveForProtocol("mqtt")!.Id);
        Assert.Equal(document.Id, store.ActiveForProtocol("modbus")!.Id);
    }
}

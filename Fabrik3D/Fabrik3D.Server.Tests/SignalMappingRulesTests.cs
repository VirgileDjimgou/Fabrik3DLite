using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Mapping;
using Xunit;

namespace Fabrik3D.Server.Tests;

/// <summary>Unit tests for the versioned mapping validator, conflict detection and deterministic serializer.</summary>
public class SignalMappingRulesTests
{
    private static SignalMappingDocumentDto Sample() => SignalMappingTestData.SampleDocument();

    private static SignalMappingEntryDto Entry(string id) => Sample().Entries.Single(entry => entry.Id == id);

    private static SignalMappingEntryDto With(
        SignalMappingEntryDto entry,
        string? protocol = null,
        string? direction = null,
        string? dataType = null,
        string? internalSignalId = null,
        SignalMappingTargetDto? target = null)
        => entry with
        {
            Protocol = protocol ?? entry.Protocol,
            Direction = direction ?? entry.Direction,
            DataType = dataType ?? entry.DataType,
            InternalSignalId = internalSignalId ?? entry.InternalSignalId,
            Target = target ?? entry.Target,
        };

    [Fact]
    public void Valid_sample_document_has_no_errors()
    {
        var validation = SignalMappingValidator.Validate(Sample(), SignalMappingTestData.ReferenceCatalog());
        Assert.True(validation.Valid);
        Assert.DoesNotContain(validation.Diagnostics, diagnostic => diagnostic.Severity == "error");
        Assert.Empty(validation.Conflicts);
    }

    [Fact]
    public void Unknown_internal_signal_is_rejected_with_a_row_reference()
    {
        var document = Sample() with
        {
            Entries = [With(Entry("opcua-robot-start"), internalSignalId: "robot-1.NotReal")],
        };
        var validation = SignalMappingValidator.Validate(document, SignalMappingTestData.ReferenceCatalog());
        var error = Assert.Single(validation.Diagnostics, diagnostic => diagnostic.Code == "unknown-signal");
        Assert.Equal("error", error.Severity);
        Assert.Equal("opcua-robot-start", error.EntryId);
        Assert.Equal("/entries/0/internalSignalId", error.Path);
    }

    [Fact]
    public void Write_direction_against_a_read_only_signal_is_rejected()
    {
        var document = Sample() with
        {
            Entries = [With(Entry("opcua-cnc-spindle-speed"), direction: "write")],
        };
        var validation = SignalMappingValidator.Validate(document, SignalMappingTestData.ReferenceCatalog());
        Assert.Contains(validation.Diagnostics, diagnostic => diagnostic.Code == "unwritable-write-direction");
    }

    [Fact]
    public void Ambiguous_register_endianness_is_rejected()
    {
        var entry = With(Entry("modbus-cnc-feed-rate"), target: Entry("modbus-cnc-feed-rate").Target with { ByteOrder = null });
        var document = Sample() with { Entries = [entry] };
        var validation = SignalMappingValidator.Validate(document, SignalMappingTestData.ReferenceCatalog());
        Assert.Contains(validation.Diagnostics, diagnostic => diagnostic.Code == "ambiguous-endianness");
    }

    [Fact]
    public void Unsafe_duplicate_write_target_is_a_conflict_and_error()
    {
        var original = Entry("opcua-robot-start");
        var duplicate = With(original) with { Id = "opcua-robot-start-copy" };
        var document = Sample() with { Entries = [original, duplicate] };
        var validation = SignalMappingValidator.Validate(document, SignalMappingTestData.ReferenceCatalog());
        Assert.False(validation.Valid);
        Assert.Single(validation.Conflicts, conflict => conflict.Code == "duplicate-write-target");
        Assert.Contains(validation.Diagnostics, diagnostic => diagnostic.Code == "duplicate-write-target" && diagnostic.Severity == "error");
    }

    [Fact]
    public void Unsupported_protocol_and_version_are_rejected()
    {
        var document = Sample() with
        {
            SchemaVersion = "2.0",
            Entries = [With(Entry("opcua-robot-start"), protocol: "profinet")],
        };
        var validation = SignalMappingValidator.Validate(document, SignalMappingTestData.ReferenceCatalog());
        Assert.Contains(validation.Diagnostics, diagnostic => diagnostic.Code == "unsupported-version");
        Assert.Contains(validation.Diagnostics, diagnostic => diagnostic.Code == "unsupported-protocol");
    }

    [Fact]
    public void Path_traversal_targets_are_rejected()
    {
        var entry = With(Entry("opcua-robot-start"), target: new SignalMappingTargetDto(NodeId: "file:///etc/passwd"));
        var document = Sample() with { Entries = [entry] };
        var validation = SignalMappingValidator.Validate(document, SignalMappingTestData.ReferenceCatalog());
        Assert.Contains(validation.Diagnostics, diagnostic => diagnostic.Code == "path-traversal-rejected");
    }

    [Fact]
    public void Executable_looking_names_are_rejected()
    {
        var entry = With(Entry("opcua-robot-start")) with { Name = "eval( something )" };
        var document = Sample() with { Entries = [entry] };
        var validation = SignalMappingValidator.Validate(document, SignalMappingTestData.ReferenceCatalog());
        Assert.Contains(validation.Diagnostics, diagnostic => diagnostic.Code == "executable-payload-rejected");
    }

    [Fact]
    public void Serializer_is_deterministic_and_omits_timestamps()
    {
        var document = Sample();
        var reversed = document with { Entries = document.Entries.Reverse().ToList() };
        var first = SignalMappingSerializer.Serialize(document);
        var second = SignalMappingSerializer.Serialize(reversed);
        Assert.Equal(first, second);
        Assert.DoesNotContain("2026-", first);
        Assert.DoesNotContain("\"version\"", first);
    }

    [Fact]
    public void Serialized_document_round_trips_through_json()
    {
        var document = Sample();
        var json = SignalMappingSerializer.Serialize(document);
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var parsed = JsonSerializer.Deserialize<SignalMappingDocumentDto>(json, options);
        Assert.NotNull(parsed);
        Assert.Equal(SignalMappingSerializer.Serialize(document), SignalMappingSerializer.Serialize(parsed!));
    }
}

using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Server.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace Fabrik3D.Server.Tests;

/// <summary>All-or-nothing mapping application with explicit pending/success/failure semantics.</summary>
public class SignalMappingApplyServiceTests
{
    private sealed class FixedCatalog : IInternalSignalCatalog
    {
        private readonly IReadOnlyDictionary<string, InternalSignalDescriptor> _descriptors;
        public FixedCatalog(IReadOnlyDictionary<string, InternalSignalDescriptor> descriptors) => _descriptors = descriptors;
        public IReadOnlyDictionary<string, InternalSignalDescriptor> Describe() => _descriptors;
    }

    private static SignalMappingApplyService CreateService(
        SignalMappingStore store,
        bool opcuaEnabled = true,
        bool mqttEnabled = true,
        bool modbusEnabled = true)
        => new(
            new FixedCatalog(SignalMappingTestData.ReferenceCatalog()),
            store,
            TimeProvider.System,
            Options.Create(new OpcUaOptions { Enabled = opcuaEnabled }),
            Options.Create(new MqttOptions { Enabled = mqttEnabled }),
            Options.Create(new ModbusOptions { Enabled = modbusEnabled }));

    [Fact]
    public void Applies_a_valid_mapping_when_every_used_connector_is_enabled()
    {
        var store = new SignalMappingStore(TimeProvider.System);
        store.TryUpsert(SignalMappingTestData.SampleDocument(), 0, true, "tester", out var stored, out _);
        var service = CreateService(store, opcuaEnabled: true, mqttEnabled: true, modbusEnabled: true);

        var result = service.Apply(stored!.Document, "alice");

        Assert.True(result.Applied);
        Assert.Equal("alice", result.AppliedBy);
        Assert.Equal(3, result.Protocols.Count);
        Assert.All(result.Protocols, protocol => Assert.Equal("activated", protocol.Status));
        Assert.NotNull(store.ActiveDocument(stored.Document.Id));
        Assert.Contains(store.Audit(), entry => entry.Action == "apply" && entry.By == "alice");
    }

    [Fact]
    public void Never_partially_applies_when_a_used_connector_is_disabled()
    {
        var store = new SignalMappingStore(TimeProvider.System);
        store.TryUpsert(SignalMappingTestData.SampleDocument(), 0, true, "tester", out var stored, out _);
        var service = CreateService(store, opcuaEnabled: true, mqttEnabled: false, modbusEnabled: true);

        var result = service.Apply(stored!.Document, "alice");

        Assert.False(result.Applied);
        var disabled = Assert.Single(result.Protocols, protocol => protocol.Protocol == "mqtt");
        Assert.Equal("connector-disabled", disabled.Status);
        Assert.Null(store.ActiveDocument(stored.Document.Id));
        Assert.DoesNotContain(store.Audit(), entry => entry.Action == "apply");
    }

    [Fact]
    public void Rejects_an_invalid_document_without_activating_anything()
    {
        var invalid = SignalMappingTestData.SampleDocument() with
        {
            Entries =
            [
                SignalMappingTestData.SampleDocument().Entries[0] with { InternalSignalId = "cnc-1.Unknown" },
            ],
        };
        var store = new SignalMappingStore(TimeProvider.System);
        var service = CreateService(store);

        var result = service.Apply(invalid, "alice");

        Assert.False(result.Applied);
        Assert.Contains(result.Diagnostics, diagnostic => diagnostic.Code == "unknown-signal");
        Assert.Null(store.ActiveDocument(invalid.Id));
    }

    [Fact]
    public void Validate_reports_the_same_row_level_diagnostics()
    {
        var service = CreateService(new SignalMappingStore(TimeProvider.System));
        var document = SignalMappingTestData.SampleDocument() with
        {
            Entries =
            [
                SignalMappingTestData.SampleDocument().Entries[5] with { Direction = "write", InternalSignalId = "cnc-1.FeedRate" },
            ],
        };

        var validation = service.Validate(document);

        Assert.False(validation.Valid);
        Assert.Contains(validation.Diagnostics, diagnostic => diagnostic.Code == "unwritable-write-direction");
    }
}

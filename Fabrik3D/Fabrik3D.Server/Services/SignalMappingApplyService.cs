using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Microsoft.Extensions.Options;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Explicit, all-or-nothing mapping application.
///
/// A mapping is only activated when it validates against the internal signal catalog and every
/// protocol it uses has an enabled connector. A disabled connector fails the whole apply, so a
/// running connector keeps its previous validated mapping. The active document is exposed for
/// connectors to load on their next reload; nothing is written to a protocol here.
/// </summary>
public sealed class SignalMappingApplyService
{
    private readonly IInternalSignalCatalog _catalog;
    private readonly SignalMappingStore _store;
    private readonly TimeProvider _time;
    private readonly OpcUaOptions _opcUa;
    private readonly MqttOptions _mqtt;
    private readonly ModbusOptions _modbus;

    public SignalMappingApplyService(
        IInternalSignalCatalog catalog,
        SignalMappingStore store,
        TimeProvider time,
        IOptions<OpcUaOptions> opcUa,
        IOptions<MqttOptions> mqtt,
        IOptions<ModbusOptions> modbus)
    {
        _catalog = catalog;
        _store = store;
        _time = time;
        _opcUa = opcUa.Value;
        _mqtt = mqtt.Value;
        _modbus = modbus.Value;
    }

    public SignalMappingValidationResultDto Validate(SignalMappingDocumentDto document)
    {
        var validation = SignalMappingValidator.Validate(document, _catalog.Describe());
        return new SignalMappingValidationResultDto(validation.Valid, validation.Diagnostics);
    }

    public SignalMappingApplyResultDto Apply(SignalMappingDocumentDto document, string appliedBy)
    {
        ArgumentNullException.ThrowIfNull(document);
        var validation = SignalMappingValidator.Validate(document, _catalog.Describe());
        var protocols = new List<SignalMappingApplyEntryDto>();

        var entries = (document.Entries ?? []).Where(entry => entry.Enabled).ToList();
        var byProtocol = entries
            .GroupBy(entry => entry.Protocol?.Trim().ToLowerInvariant() ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Key.Length > 0)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .ToList();

        var applied = validation.Valid && byProtocol.Count > 0;
        foreach (var group in byProtocol)
        {
            var enabled = ConnectorEnabled(group.Key);
            var status = !validation.Valid ? "invalid" : enabled ? "activated" : "connector-disabled";
            var reason = status switch
            {
                "invalid" => "mapping-has-errors",
                "connector-disabled" => $"connector '{group.Key}' is disabled; no partial apply",
                _ => null,
            };
            protocols.Add(new SignalMappingApplyEntryDto(group.Key, status, group.Count(), reason));
            if (!enabled) applied = false;
        }

        if (applied)
        {
            _store.Activate(document, appliedBy);
        }

        return new SignalMappingApplyResultDto(
            applied,
            document.Id,
            document.Version,
            protocols,
            validation.Diagnostics,
            _time.GetUtcNow(),
            string.IsNullOrWhiteSpace(appliedBy) ? null : appliedBy);
    }

    private bool ConnectorEnabled(string protocol) => protocol switch
    {
        "opcua" => _opcUa.Enabled,
        "mqtt" => _mqtt.Enabled,
        "modbus" => _modbus.Enabled,
        _ => false,
    };
}

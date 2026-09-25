using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;

namespace Fabrik3D.Infrastructure.Mapping;

/// <summary>
/// Projects validated mapping documents into the concrete connector configuration objects.
/// Wire details (node ids, topics, registers, endianness) never leave this adapter, and no
/// connector option is mutated: a projection produces new entries or a rebuilt options object.
/// </summary>
public static class SignalMappingProjection
{
    public static ModbusPointMapping ToModbusPoint(SignalMappingEntryDto entry)
    {
        ArgumentNullException.ThrowIfNull(entry);
        var target = entry.Target;
        return new ModbusPointMapping
        {
            SignalId = entry.InternalSignalId,
            Area = target.Area ?? "holding-register",
            Address = target.Address ?? 0,
            AddressConvention = target.AddressConvention,
            UnitId = target.UnitId,
            DataType = entry.DataType,
            Width = target.Width ?? 16,
            ByteOrder = target.ByteOrder,
            WordOrder = target.WordOrder,
            BitIndex = target.BitIndex,
            Scale = entry.Scale,
            Offset = entry.Offset,
            EngineeringUnit = entry.Unit,
            Direction = entry.Direction,
        };
    }

    public static List<ModbusPointMapping> ToModbusPoints(SignalMappingDocumentDto document)
        => EnabledEntries(document).Where(entry => IsProtocol(entry, "modbus")).Select(ToModbusPoint).ToList();

    public static MqttSignalMapping ToMqttMapping(SignalMappingEntryDto entry)
    {
        ArgumentNullException.ThrowIfNull(entry);
        return new MqttSignalMapping
        {
            SignalId = entry.InternalSignalId,
            Measurement = entry.Target.PayloadField ?? entry.InternalSignalId,
            EquipmentId = string.IsNullOrWhiteSpace(entry.EquipmentId) ? null : entry.EquipmentId,
            DataType = entry.DataType,
            EngineeringUnit = entry.Unit,
            Writable = SignalMappingVocabulary.DirectionAllowsWrite(entry.Direction),
        };
    }

    public static List<MqttSignalMapping> ToMqttMappings(SignalMappingDocumentDto document)
        => EnabledEntries(document).Where(entry => IsProtocol(entry, "mqtt")).Select(ToMqttMapping).ToList();

    public static OpcUaNodeMapEntry ToOpcUaEntry(SignalMappingEntryDto entry)
    {
        ArgumentNullException.ThrowIfNull(entry);
        return new OpcUaNodeMapEntry
        {
            SignalId = entry.InternalSignalId,
            NodeId = entry.Target.NodeId ?? string.Empty,
            EquipmentId = string.IsNullOrWhiteSpace(entry.EquipmentId) ? null : entry.EquipmentId,
            Name = entry.Name,
            Direction = entry.Direction?.Trim().ToLowerInvariant() switch
            {
                "write" => SignalVocabulary.ToWire(SignalDirection.OutputFromController),
                "read-write" => SignalVocabulary.ToWire(SignalDirection.Internal),
                _ => SignalVocabulary.ToWire(SignalDirection.InputToController),
            },
            DataType = entry.DataType,
            EngineeringUnit = entry.Unit,
            Writable = SignalMappingVocabulary.DirectionAllowsWrite(entry.Direction),
        };
    }

    public static List<OpcUaNodeMapEntry> ToOpcUaEntries(SignalMappingDocumentDto document)
        => EnabledEntries(document).Where(entry => IsProtocol(entry, "opcua")).Select(ToOpcUaEntry).ToList();

    /// <summary>Rebuilds Modbus options with the document's enabled points. The base options is not mutated.</summary>
    public static ModbusOptions BuildModbusOptions(ModbusOptions baseOptions, SignalMappingDocumentDto document)
    {
        ArgumentNullException.ThrowIfNull(baseOptions);
        return new ModbusOptions
        {
            Enabled = baseOptions.Enabled,
            Host = baseOptions.Host,
            Port = baseOptions.Port,
            UnitId = baseOptions.UnitId,
            ConnectTimeoutMilliseconds = baseOptions.ConnectTimeoutMilliseconds,
            RequestTimeoutMilliseconds = baseOptions.RequestTimeoutMilliseconds,
            PollIntervalMilliseconds = baseOptions.PollIntervalMilliseconds,
            ReconnectDelaySeconds = baseOptions.ReconnectDelaySeconds,
            MaxReconnectDelaySeconds = baseOptions.MaxReconnectDelaySeconds,
            StaleAfterMilliseconds = baseOptions.StaleAfterMilliseconds,
            AllowWrites = baseOptions.AllowWrites,
            WriteAllowList = [.. baseOptions.WriteAllowList],
            AddressConvention = baseOptions.AddressConvention,
            Points = ToModbusPoints(document),
        };
    }

    /// <summary>Rebuilds MQTT options with the document's enabled signal map. The base options is not mutated.</summary>
    public static MqttOptions BuildMqttOptions(MqttOptions baseOptions, SignalMappingDocumentDto document)
    {
        ArgumentNullException.ThrowIfNull(baseOptions);
        return new MqttOptions
        {
            Enabled = baseOptions.Enabled,
            Broker = baseOptions.Broker,
            ClientId = baseOptions.ClientId,
            QoS = baseOptions.QoS,
            CleanSession = baseOptions.CleanSession,
            SessionExpirySeconds = baseOptions.SessionExpirySeconds,
            ReconnectDelaySeconds = baseOptions.ReconnectDelaySeconds,
            MaxReconnectDelaySeconds = baseOptions.MaxReconnectDelaySeconds,
            ConnectTimeoutSeconds = baseOptions.ConnectTimeoutSeconds,
            KeepAliveSeconds = baseOptions.KeepAliveSeconds,
            ProtocolVersion = baseOptions.ProtocolVersion,
            UserName = baseOptions.UserName,
            Password = baseOptions.Password,
            UseTls = baseOptions.UseTls,
            AllowUntrustedCertificates = baseOptions.AllowUntrustedCertificates,
            AllowAnonymousBroker = baseOptions.AllowAnonymousBroker,
            AllowWrites = baseOptions.AllowWrites,
            CommandAllowList = [.. baseOptions.CommandAllowList],
            AllowRetainedCommands = baseOptions.AllowRetainedCommands,
            AllowRetainedTelemetry = baseOptions.AllowRetainedTelemetry,
            MaxPayloadBytes = baseOptions.MaxPayloadBytes,
            StaleAfterMilliseconds = baseOptions.StaleAfterMilliseconds,
            DuplicateWindowSize = baseOptions.DuplicateWindowSize,
            WillTopic = baseOptions.WillTopic,
            WillPayload = baseOptions.WillPayload,
            WillRetain = baseOptions.WillRetain,
            TelemetryTopics = [.. baseOptions.TelemetryTopics],
            CommandTopics = [.. baseOptions.CommandTopics],
            SignalMap = ToMqttMappings(document),
        };
    }

    /// <summary>Rebuilds OPC UA options with the document's enabled node map. The base options is not mutated.</summary>
    public static OpcUaOptions BuildOpcUaOptions(OpcUaOptions baseOptions, SignalMappingDocumentDto document)
    {
        ArgumentNullException.ThrowIfNull(baseOptions);
        return new OpcUaOptions
        {
            Enabled = baseOptions.Enabled,
            Endpoint = baseOptions.Endpoint,
            SecurityPolicy = baseOptions.SecurityPolicy,
            ApplicationName = baseOptions.ApplicationName,
            CertificateTrustStore = baseOptions.CertificateTrustStore,
            UserName = baseOptions.UserName,
            Password = baseOptions.Password,
            AutoAcceptUntrustedCertificates = baseOptions.AutoAcceptUntrustedCertificates,
            ReconnectDelaySeconds = baseOptions.ReconnectDelaySeconds,
            MaxReconnectDelaySeconds = baseOptions.MaxReconnectDelaySeconds,
            SamplingIntervalMilliseconds = baseOptions.SamplingIntervalMilliseconds,
            PublishingIntervalMilliseconds = baseOptions.PublishingIntervalMilliseconds,
            OperationTimeoutMilliseconds = baseOptions.OperationTimeoutMilliseconds,
            SessionTimeoutMilliseconds = baseOptions.SessionTimeoutMilliseconds,
            StaleAfterMilliseconds = baseOptions.StaleAfterMilliseconds,
            AllowWrites = baseOptions.AllowWrites,
            WriteAllowList = [.. baseOptions.WriteAllowList],
            NodeMap = ToOpcUaEntries(document),
        };
    }

    private static IEnumerable<SignalMappingEntryDto> EnabledEntries(SignalMappingDocumentDto document)
        => (document.Entries ?? []).Where(entry => entry.Enabled).OrderBy(entry => entry.Id, StringComparer.Ordinal);

    private static bool IsProtocol(SignalMappingEntryDto entry, string protocol)
        => string.Equals(entry.Protocol?.Trim(), protocol, StringComparison.OrdinalIgnoreCase);
}

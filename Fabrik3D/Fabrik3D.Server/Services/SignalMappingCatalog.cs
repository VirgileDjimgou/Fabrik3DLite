using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Signals;

namespace Fabrik3D.Server.Services;

/// <summary>
/// Known internal signals used to validate mapping references. The simulator signal catalog
/// (S32) is authoritative; the server mirror supplies the descriptors of signals that
/// connectors have registered at runtime. An empty catalog means "no signals known yet",
/// which is surfaced explicitly rather than guessed.
/// </summary>
public interface IInternalSignalCatalog
{
    IReadOnlyDictionary<string, InternalSignalDescriptor> Describe();
}

/// <summary>Catalog backed by the transport-neutral server signal mirror.</summary>
public sealed class SignalMirrorCatalog : IInternalSignalCatalog
{
    private readonly SignalMirrorStore _mirror;

    public SignalMirrorCatalog(SignalMirrorStore mirror) => _mirror = mirror;

    public IReadOnlyDictionary<string, InternalSignalDescriptor> Describe()
    {
        var descriptors = new Dictionary<string, InternalSignalDescriptor>(StringComparer.Ordinal);
        foreach (var definition in _mirror.Definitions())
        {
            if (string.IsNullOrWhiteSpace(definition.SignalId)) continue;
            descriptors[definition.SignalId] = new InternalSignalDescriptor(
                definition.SignalId,
                definition.EquipmentId,
                definition.Writable,
                SignalMappingVocabularyDataType(definition));
        }
        return descriptors;
    }

    private static string SignalMappingVocabularyDataType(Fabrik3D.Domain.Signals.IndustrialSignalDefinition definition)
        => Fabrik3D.Domain.Signals.SignalVocabulary.ToWire(definition.DataType);
}

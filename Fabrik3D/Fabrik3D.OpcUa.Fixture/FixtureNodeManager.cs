using Opc.Ua;
using Opc.Ua.Server;

namespace Fabrik3D.OpcUa.Fixture;

/// <summary>
/// A deterministic, purpose-built OPC UA server node manager used only by tests. It exposes
/// plain read/write variables in the namespace <c>urn:fabrik3d:fixture</c>. It is not shipped
/// to production and contains no vendor model.
/// </summary>
public sealed class FixtureNodeManager : CustomNodeManager2
{
    private readonly IReadOnlyList<FixtureVariable> _definitions;
    private readonly Dictionary<string, BaseDataVariableState> _variables = new(StringComparer.Ordinal);

    public FixtureNodeManager(IServerInternal server, ApplicationConfiguration configuration, IReadOnlyList<FixtureVariable> definitions)
        : base(server, configuration, NamespaceUri)
    {
        SystemContext.NodeIdFactory = this;
        _definitions = definitions;
    }

    public const string NamespaceUri = "urn:fabrik3d:fixture";

    /// <summary>Namespace index assigned to the fixture namespace.</summary>
    public ushort FixtureNamespaceIndex => NamespaceIndexes[0];

    public string NodeIdText(string identifier) => new NodeId(identifier, FixtureNamespaceIndex).ToString();

    public override NodeId New(ISystemContext context, NodeState node) => node.NodeId;

    public override void CreateAddressSpace(IDictionary<NodeId, IList<IReference>> externalReferences)
    {
        lock (Lock)
        {
            base.CreateAddressSpace(externalReferences);

            var root = new FolderState(null)
            {
                NodeId = new NodeId("Fabrik3D", FixtureNamespaceIndex),
                BrowseName = new QualifiedName("Fabrik3D", FixtureNamespaceIndex),
                DisplayName = new LocalizedText("Fabrik3D"),
                TypeDefinitionId = ObjectTypeIds.FolderType,
                ReferenceTypeId = ReferenceTypeIds.Organizes,
            };

            root.AddReference(ReferenceTypeIds.Organizes, true, ObjectIds.ObjectsFolder);
            if (!externalReferences.TryGetValue(ObjectIds.ObjectsFolder, out var references))
            {
                externalReferences[ObjectIds.ObjectsFolder] = references = new List<IReference>();
            }

            references.Add(new NodeStateReference(ReferenceTypeIds.Organizes, false, root.NodeId));
            AddPredefinedNode(SystemContext, root);

            foreach (var definition in _definitions)
            {
                var variable = new BaseDataVariableState(root)
                {
                    NodeId = new NodeId(definition.Identifier, FixtureNamespaceIndex),
                    BrowseName = new QualifiedName(definition.Identifier, FixtureNamespaceIndex),
                    DisplayName = new LocalizedText(definition.Identifier),
                    TypeDefinitionId = VariableTypeIds.BaseDataVariableType,
                    DataType = definition.DataType,
                    ValueRank = ValueRanks.Scalar,
                    AccessLevel = AccessLevels.CurrentReadOrWrite,
                    UserAccessLevel = AccessLevels.CurrentReadOrWrite,
                    MinimumSamplingInterval = MinimumSamplingIntervals.Continuous,
                    Historizing = false,
                    Value = definition.InitialValue,
                    StatusCode = StatusCodes.Good,
                    Timestamp = DateTime.UtcNow,
                    ReferenceTypeId = ReferenceTypeIds.HasComponent,
                };

                root.AddChild(variable);
                AddPredefinedNode(SystemContext, variable);
                _variables[definition.Identifier] = variable;
            }
        }
    }

    /// <summary>
    /// Sets a variable value and notifies subscriptions (simulates a live machine change).
    /// A status-only transition (same value, different status code) also notifies, unlike the
    /// default BaseVariableState setter which only marks value changes.
    /// </summary>
    public void SetValue(string identifier, object? value, uint statusCode = StatusCodes.Good)
    {
        lock (Lock)
        {
            if (!_variables.TryGetValue(identifier, out var variable))
            {
                throw new ArgumentOutOfRangeException(nameof(identifier), identifier, "Unknown fixture variable.");
            }

            variable.Value = null;
            variable.StatusCode = statusCode;
            variable.Value = value;
            variable.Timestamp = DateTime.UtcNow;
            variable.ClearChangeMasks(SystemContext, false);
        }
    }

    /// <summary>Reads the current variable value (used by tests to observe a client write).</summary>
    public object? GetValue(string identifier)
    {
        lock (Lock)
        {
            return _variables.TryGetValue(identifier, out var variable) ? variable.Value : null;
        }
    }

    public uint GetStatusCode(string identifier)
    {
        lock (Lock)
        {
            return _variables.TryGetValue(identifier, out var variable) ? variable.StatusCode.Code : StatusCodes.BadNodeIdUnknown;
        }
    }
}

/// <summary>Fixture variable declaration (no vendor model).</summary>
public sealed record FixtureVariable(string Identifier, NodeId DataType, object? InitialValue);

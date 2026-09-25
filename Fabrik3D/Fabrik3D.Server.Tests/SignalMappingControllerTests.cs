using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Controllers;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Xunit;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Controller-level checks for the mapping endpoint contract: optimistic concurrency, the explicit
/// apply response and the authenticated audit identity recorded on every mutation.
/// </summary>
public class SignalMappingControllerTests
{
    private sealed class FixedCatalog : IInternalSignalCatalog
    {
        public IReadOnlyDictionary<string, InternalSignalDescriptor> Describe() => SignalMappingTestData.ReferenceCatalog();
    }

    private sealed class StubIdentity(string subject, params string[] roles) : ICurrentIdentity
    {
        public bool IsAuthenticated => true;
        public string Subject { get; } = subject;
        public string? Name => Subject;
        public IReadOnlyList<string> Roles { get; } = roles;
        public string AuditId => Subject;
    }

    private static (MappingsController Controller, SignalMappingStore Store) CreateController(string subject = "engineer-1")
    {
        var store = new SignalMappingStore(TimeProvider.System);
        var apply = new SignalMappingApplyService(
            new FixedCatalog(),
            store,
            TimeProvider.System,
            Options.Create(new OpcUaOptions { Enabled = true }),
            Options.Create(new MqttOptions { Enabled = true }),
            Options.Create(new ModbusOptions { Enabled = true }));
        var controller = new MappingsController(store, apply, new StubIdentity(subject, Fabrik3DRoles.Engineer))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        return (controller, store);
    }

    [Fact]
    public void Upsert_then_get_and_apply_round_trips_through_the_controller()
    {
        var (controller, store) = CreateController();
        var document = SignalMappingTestData.SampleDocument();

        var created = controller.Upsert(document.Id, document);
        var createdResult = Assert.IsType<CreatedAtActionResult>(created);
        var stored = Assert.IsType<SignalMappingDocumentDto>(createdResult.Value);
        Assert.Equal(1, stored.Version);

        var fetched = Assert.IsType<OkObjectResult>(controller.Get(document.Id));
        Assert.IsType<SignalMappingDocumentDto>(fetched.Value);

        var applied = Assert.IsType<OkObjectResult>(controller.Apply(document.Id));
        var result = Assert.IsType<SignalMappingApplyResultDto>(applied.Value);
        Assert.True(result.Applied);
        Assert.NotNull(store.ActiveDocument(document.Id));

        var list = Assert.IsType<OkObjectResult>(controller.GetAll());
        Assert.Single(Assert.IsAssignableFrom<IReadOnlyList<SignalMappingSummaryDto>>(list.Value));
    }

    [Fact]
    public void Mutations_record_the_authenticated_subject_in_the_audit_trail()
    {
        var (controller, store) = CreateController("engineer-42");
        var document = SignalMappingTestData.SampleDocument();

        Assert.IsType<CreatedAtActionResult>(controller.Upsert(document.Id, document));

        var entry = Assert.Single(store.Audit());
        Assert.Equal("engineer-42", entry.By);
        Assert.NotEqual("anonymous", entry.By);
    }

    [Fact]
    public void Upsert_conflict_is_reported_as_conflict()
    {
        var (controller, _) = CreateController();
        var document = SignalMappingTestData.SampleDocument();
        Assert.IsType<CreatedAtActionResult>(controller.Upsert(document.Id, document));
        var conflict = Assert.IsType<ObjectResult>(controller.Upsert(document.Id, document, expectedVersion: 0));
        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
    }

    [Fact]
    public void Apply_unknown_mapping_returns_not_found()
    {
        var (controller, _) = CreateController();
        Assert.IsType<NotFoundObjectResult>(controller.Apply("does-not-exist"));
    }
}

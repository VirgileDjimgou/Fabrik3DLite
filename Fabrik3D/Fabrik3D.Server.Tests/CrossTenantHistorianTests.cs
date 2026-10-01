using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Historian;
using Fabrik3D.Domain.Organizations;
using Fabrik3D.Domain.Signals;
using Fabrik3D.Infrastructure.Historian;
using Fabrik3D.Infrastructure.Repositories;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S57 historian cross-tenant negatives at the persistence layer. Historian repositories are
/// tenant-scoped, so samples and events written for one organization must be invisible to another
/// and legacy/default documents must never leak into a different tenant.
/// </summary>
[Collection(HistorianCollection.Name)]
public class CrossTenantHistorianTests
{
    private readonly HistorianFixture _fx;

    public CrossTenantHistorianTests(HistorianFixture fx) => _fx = fx;

    private sealed class StubTenant(string organizationId) : ITenantContext
    {
        public TenantScope Scope { get; } = TenantScope.ForOrganization(organizationId);
    }

    [Fact]
    public async Task Samples_and_events_are_invisible_across_organizations()
    {
        var context = _fx.CreateContext();
        var orgA = new HistorianRepository(context, new StubTenant("org-historian-a"));
        var orgB = new HistorianRepository(context, new StubTenant("org-historian-b"));
        var now = DateTime.UtcNow;

        await orgA.InsertSamplesAsync(
        [
            new TelemetrySample
            {
                TimestampUtc = now,
                EquipmentId = "cnc-1",
                SignalId = "cnc.spindle.speed",
                NumericValue = 42,
                ValueType = SignalDataType.Float,
                Quality = SignalQuality.Good,
                Source = SignalSource.Simulated,
                Origin = SignalOrigin.Simulation,
            },
        ]);
        await orgA.InsertEventsAsync(
        [
            new HistorizedEvent
            {
                TimestampUtc = now,
                Kind = HistorianEventKind.Event,
                Severity = "info",
                Code = "TENANT-A-EVENT",
                Payload = """{"detail":"seed"}""",
                Source = "simulation",
            },
        ]);

        Assert.Single(await orgA.QuerySamplesAsync(new TelemetrySampleQuery(Limit: 100), 100));
        Assert.Single(await orgA.QueryEventsAsync(new HistorizedEventQuery(Limit: 100), 100));

        Assert.Empty(await orgB.QuerySamplesAsync(new TelemetrySampleQuery(Limit: 100), 100));
        Assert.Empty(await orgB.QueryEventsAsync(new HistorizedEventQuery(Limit: 100), 100));
        Assert.Equal(0, await orgB.CountSamplesAsync(new TelemetrySampleQuery()));
        Assert.Equal(0, await orgB.CountEventsAsync(new HistorizedEventQuery()));
    }
}

using Fabrik3D.Infrastructure.Connectors;
using Xunit;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S56 deterministic recovery-policy tests. The connectors previously duplicated this backoff
/// formula; it is now a single tested contract shared by OPC UA, MQTT and Modbus.
/// </summary>
public class ConnectorBackoffTests
{
    [Fact]
    public void Zero_base_delay_retries_immediately()
    {
        Assert.Equal(TimeSpan.Zero, ConnectorBackoff.Compute(1, 0, 60));
        Assert.Equal(TimeSpan.Zero, ConnectorBackoff.Compute(9, 0, 60));
    }

    [Theory]
    [InlineData(1, 5)]
    [InlineData(2, 10)]
    [InlineData(3, 20)]
    [InlineData(4, 40)]
    [InlineData(5, 60)]
    [InlineData(50, 60)]
    public void Delay_doubles_and_is_capped_at_the_maximum(int attempt, int expectedSeconds)
    {
        Assert.Equal(TimeSpan.FromSeconds(expectedSeconds), ConnectorBackoff.Compute(attempt, 5, 60));
    }

    [Fact]
    public void Exponent_is_capped_so_growth_never_overflows()
    {
        // base 1s, max effectively unbounded: 2^10 = 1024s is the highest step.
        Assert.Equal(TimeSpan.FromSeconds(1024), ConnectorBackoff.Compute(11, 1, int.MaxValue));
        Assert.Equal(TimeSpan.FromSeconds(1024), ConnectorBackoff.Compute(1000, 1, int.MaxValue));
    }

    [Fact]
    public void Non_positive_attempt_is_treated_as_the_first_attempt()
    {
        Assert.Equal(TimeSpan.FromSeconds(5), ConnectorBackoff.Compute(0, 5, 60));
        Assert.Equal(TimeSpan.FromSeconds(5), ConnectorBackoff.Compute(-3, 5, 60));
    }

    [Fact]
    public void A_max_below_the_base_is_clamped_to_the_base()
    {
        Assert.Equal(TimeSpan.FromSeconds(5), ConnectorBackoff.Compute(1, 5, 1));
        Assert.Equal(TimeSpan.FromSeconds(5), ConnectorBackoff.Compute(4, 5, 2));
    }

    [Fact]
    public void Negative_base_delay_retries_immediately_rather_than_throwing()
    {
        Assert.Equal(TimeSpan.Zero, ConnectorBackoff.Compute(3, -10, 60));
    }
}

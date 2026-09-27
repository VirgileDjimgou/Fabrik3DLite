using Fabrik3D.Server.Deployment;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Support-bundle configuration scoping (S48): the bundle must include the Fabrik3D configuration
/// sections and must never dump unrelated process environment variables (host paths, user names or
/// tool credentials), which ASP.NET Core otherwise merges into the same configuration root.
/// </summary>
public class SupportBundleBuilderTests
{
    [Theory]
    [InlineData("Deployment:Profile")]
    [InlineData("MongoDb:ConnectionString")]
    [InlineData("Authentication:SigningKey")]
    [InlineData("Historian:RetentionMaxAgeDays")]
    [InlineData("OpcUa:Enabled")]
    [InlineData("Logging:LogLevel:Default")]
    public void Application_sections_are_included(string key)
    {
        Assert.True(SupportBundleBuilder.IsRelevantConfigurationKey(key));
    }

    [Theory]
    [InlineData("PATH")]
    [InlineData("USERPROFILE")]
    [InlineData("HOME")]
    [InlineData("HOSTNAME")]
    [InlineData("AWS_SECRET_ACCESS_KEY")]
    [InlineData("Unrelated:Custom:Value")]
    public void Unrelated_environment_keys_are_excluded(string key)
    {
        Assert.False(SupportBundleBuilder.IsRelevantConfigurationKey(key));
    }
}

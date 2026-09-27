using Fabrik3D.Infrastructure.Modbus;
using Fabrik3D.Infrastructure.Mqtt;
using Fabrik3D.Infrastructure.OpcUa;
using Fabrik3D.Server.Services;
using Fabrik3D.Server.Settings;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// S49 security-hardening defaults and input-boundary tests. They complement the existing
/// connector integration tests: here we assert that the secure defaults are fail-closed and that
/// oversized input is rejected before expensive parsing.
/// </summary>
public class SecurityHardeningTests
{
    [Fact]
    public void Every_protocol_adapter_is_disabled_and_write_fail_closed_by_default()
    {
        var opcUa = new OpcUaOptions();
        Assert.False(opcUa.Enabled);
        Assert.False(opcUa.AllowWrites);
        Assert.Empty(opcUa.WriteAllowList);
        Assert.False(opcUa.AutoAcceptUntrustedCertificates);

        var mqtt = new MqttOptions();
        Assert.False(mqtt.Enabled);
        Assert.False(mqtt.AllowWrites);
        Assert.Empty(mqtt.CommandAllowList);
        Assert.False(mqtt.AllowRetainedCommands);
        Assert.False(mqtt.AllowUntrustedCertificates);

        var modbus = new ModbusOptions();
        Assert.False(modbus.Enabled);
        Assert.False(modbus.AllowWrites);
        Assert.Empty(modbus.WriteAllowList);
    }

    [Fact]
    public void Security_headers_default_to_owasp_aligned_values()
    {
        var options = new SecurityHeadersOptions();

        Assert.True(options.Enabled);
        Assert.Equal("nosniff", options.ContentTypeOptions);
        Assert.Equal("DENY", options.FrameOptions);
        Assert.Equal("no-referrer", options.ReferrerPolicy);
        Assert.Equal("same-origin", options.CrossOriginOpenerPolicy);
        Assert.Equal("same-site", options.CrossOriginResourcePolicy);
        Assert.Equal("none", options.PermittedCrossDomainPolicies);
        // HSTS is a deployment decision at the terminating proxy; it must not be silently asserted.
        Assert.Null(options.StrictTransportSecurity);
    }

    [Fact]
    public void Cell_file_content_is_bounded_before_json_parsing()
    {
        var oversized = new string('x', CellFileContentValidator.MaxContentLengthChars + 1);

        var error = CellFileContentValidator.ValidateContent(oversized);

        Assert.NotNull(error);
        Assert.Contains("maximum size", error, StringComparison.Ordinal);
    }

    [Fact]
    public void Explicit_size_limit_is_honoured_and_allows_small_valid_content()
    {
        const string valid = """{ "schemaVersion": "1.0", "id": "cell-1", "name": "Cell", "worldFrameId": "world", "equipment": [] }""";

        Assert.Null(CellFileContentValidator.ValidateContent(valid, maxLengthChars: valid.Length));
        Assert.NotNull(CellFileContentValidator.ValidateContent(valid, maxLengthChars: 4));
        Assert.Null(CellFileContentValidator.ValidateContent(valid, maxLengthChars: 0));
    }
}

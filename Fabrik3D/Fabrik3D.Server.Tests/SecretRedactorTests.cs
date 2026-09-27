using Fabrik3D.Server.Deployment;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Redaction policy tests (S48): support bundles and the recent-log buffer must never expose
/// credentials, tokens or connection strings.
/// </summary>
public class SecretRedactorTests
{
    [Theory]
    [InlineData("MongoDb:ConnectionString")]
    [InlineData("Authentication:SigningKey")]
    [InlineData("Authentication:ClientSecret")]
    [InlineData("Mqtt:Password")]
    [InlineData("Some:ApiKey")]
    [InlineData("Orchestration:AuthorityConfirmationToken")]
    [InlineData("nested:accesstoken")]
    public void Sensitive_keys_are_detected(string key)
    {
        Assert.True(SecretRedactor.IsSensitiveKey(key));
    }

    [Theory]
    [InlineData("MongoDb:DatabaseName")]
    [InlineData("Deployment:Profile")]
    [InlineData("Historian:MaxBatchSize")]
    [InlineData("Logging:LogLevel:Default")]
    public void Benign_keys_are_not_sensitive(string key)
    {
        Assert.False(SecretRedactor.IsSensitiveKey(key));
    }

    [Theory]
    [InlineData("mongodb://user:password@mongo:27017")]
    [InlineData("https://admin:hunter2@example.com")]
    [InlineData("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature")]
    [InlineData("-----BEGIN PRIVATE " + "KEY-----\nMIIE...\n-----END PRIVATE KEY-----")]
    public void Secret_looking_values_are_detected(string value)
    {
        Assert.True(SecretRedactor.LooksLikeSecret(value));
    }

    [Theory]
    [InlineData("mongodb://mongo:27017")]
    [InlineData("Fabrik3D")]
    [InlineData("Production")]
    public void Benign_values_are_not_secrets(string value)
    {
        Assert.False(SecretRedactor.LooksLikeSecret(value));
    }

    [Fact]
    public void Redact_value_keeps_benign_values_and_hides_sensitive_keys()
    {
        Assert.Equal("Fabrik3D", SecretRedactor.RedactValue("MongoDb:DatabaseName", "Fabrik3D"));
        Assert.Equal(SecretRedactor.Placeholder, SecretRedactor.RedactValue("MongoDb:ConnectionString", "mongodb://mongo:27017"));
        Assert.Equal(SecretRedactor.Placeholder, SecretRedactor.RedactValue("Custom:Value", "mongodb://user:pw@host:27017"));
    }

    [Fact]
    public void Redact_message_masks_embedded_credentials_and_tokens()
    {
        var message = "Connecting to mongodb://svc:sup3rs3cret@mongo:27017 with token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig";

        var redacted = SecretRedactor.RedactMessage(message);

        Assert.DoesNotContain("sup3rs3cret", redacted);
        Assert.DoesNotContain("eyJhbGciOiJIUzI1NiJ9", redacted);
        Assert.Contains(SecretRedactor.Placeholder, redacted);
    }

    [Fact]
    public void Recent_log_buffer_redacts_before_retaining()
    {
        var buffer = new RecentLogBuffer();

        buffer.Add(Microsoft.Extensions.Logging.LogLevel.Information, "Test",
            "Starting with mongodb://user:secret@localhost:27017");

        var entry = Assert.Single(buffer.Snapshot());
        Assert.DoesNotContain("secret@", entry);
        Assert.Contains(SecretRedactor.Placeholder, entry);
    }
}

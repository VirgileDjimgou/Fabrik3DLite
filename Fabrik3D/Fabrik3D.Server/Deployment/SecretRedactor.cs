using System.Text.RegularExpressions;

namespace Fabrik3D.Server.Deployment;

/// <summary>
/// Central redaction policy for diagnostics. A configuration key or log message is redacted when it
/// names a secret-bearing concept or when its value looks like a credential, connection string with
/// embedded credentials, bearer token or private key. Redaction is applied before anything is
/// written to a support bundle or captured in the recent-log buffer.
/// </summary>
public static partial class SecretRedactor
{
    public const string Placeholder = "[REDACTED]";

    private static readonly string[] SensitiveKeyFragments =
    [
        "password", "passwd", "pwd", "secret", "signingkey", "privatekey",
        "token", "credential", "apikey", "api_key", "connectionstring",
        "authorityconfirmationtoken", "clientsecret", "accesskey",
    ];

    /// <summary>True when the configuration key names a secret-bearing concept.</summary>
    public static bool IsSensitiveKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return false;
        var normalized = key.Replace("_", string.Empty).Replace("-", string.Empty).ToLowerInvariant();
        return SensitiveKeyFragments.Any(fragment => normalized.Contains(fragment, StringComparison.Ordinal));
    }

    /// <summary>True when the value looks like a credential even under an innocuous key.</summary>
    public static bool LooksLikeSecret(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;

        // mongodb://user:pass@host, https://user:pass@host, amqp://user:pass@host
        if (CredentialUriRegex().IsMatch(value)) return true;

        // JWT / bearer token shape
        if (JwtRegex().IsMatch(value)) return true;

        // PEM private key material
        if (value.Contains("BEGIN PRIVATE KEY", StringComparison.Ordinal)
            || value.Contains("BEGIN RSA PRIVATE KEY", StringComparison.Ordinal))
        {
            return true;
        }

        return false;
    }

    /// <summary>Redacts a configuration value when the key or the value is sensitive.</summary>
    public static string RedactValue(string key, string? value)
    {
        if (value is null) return string.Empty;
        return IsSensitiveKey(key) || LooksLikeSecret(value) ? Placeholder : value;
    }

    /// <summary>Redacts any secret-looking substring inside a free-form log message.</summary>
    public static string RedactMessage(string? message)
    {
        if (string.IsNullOrEmpty(message)) return string.Empty;
        var redacted = CredentialUriRegex().Replace(message, m => $"{m.Groups[1].Value}{Placeholder}@");
        redacted = JwtRegex().Replace(redacted, Placeholder);
        return redacted;
    }

    [GeneratedRegex(@"(?i)\b[a-z][a-z0-9+.\-]*://[^\s/@:]+:[^\s/@]+@")]
    private static partial Regex CredentialUriRegex();

    [GeneratedRegex(@"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b")]
    private static partial Regex JwtRegex();
}

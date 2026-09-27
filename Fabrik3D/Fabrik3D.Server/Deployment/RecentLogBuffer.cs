using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Fabrik3D.Server.Deployment;

/// <summary>
/// Bounded in-memory ring buffer of recent log entries used by the support bundle. Messages are
/// redacted at capture time so a secret can never reach the bundle even if it was logged by mistake.
/// </summary>
public sealed class RecentLogBuffer
{
    private const int Capacity = 200;
    private readonly ConcurrentQueue<string> _entries = new();

    public void Add(LogLevel level, string category, string message)
    {
        var safeMessage = SecretRedactor.RedactMessage(message);
        var entry = $"{DateTime.UtcNow:O} [{level}] {category}: {safeMessage}";
        _entries.Enqueue(entry);
        while (_entries.Count > Capacity && _entries.TryDequeue(out _))
        {
            // Trim oldest entries beyond the documented bound.
        }
    }

    public IReadOnlyList<string> Snapshot() => _entries.ToArray();
}

/// <summary>Logger provider that feeds <see cref="RecentLogBuffer"/>.</summary>
public sealed class RecentLogBufferProvider : ILoggerProvider
{
    private readonly RecentLogBuffer _buffer;

    public RecentLogBufferProvider(RecentLogBuffer buffer) => _buffer = buffer;

    public ILogger CreateLogger(string categoryName) => new RecentLogBufferLogger(_buffer, categoryName);

    public void Dispose()
    {
    }

    private sealed class RecentLogBufferLogger : ILogger
    {
        private readonly RecentLogBuffer _buffer;
        private readonly string _category;

        public RecentLogBufferLogger(RecentLogBuffer buffer, string category)
        {
            _buffer = buffer;
            _category = category;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            var message = formatter(state, exception);
            if (exception is not null)
            {
                message = $"{message} | {exception.GetType().Name}: {exception.Message}";
            }
            _buffer.Add(logLevel, _category, message);
        }
    }
}

using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Contracts.Enums;
using Fabrik3D.Contracts.Events;
using Fabrik3D.Domain.Entities;
using Fabrik3D.Domain.Mapping;
using Fabrik3D.Infrastructure.Repositories;

namespace Fabrik3D.Server.Services;

public class AlarmService
{
    private readonly AlarmRepository _alarms;
    private readonly HubNotificationService _hub;

    public AlarmService(AlarmRepository alarms, HubNotificationService hub)
    {
        _alarms = alarms;
        _hub = hub;
    }

    public async Task<List<AlarmDto>> GetAllAsync(int limit = 100)
    {
        var alarms = await _alarms.GetAllAsync(limit);
        return alarms.Select(a => a.ToDto()).ToList();
    }

    public async Task<List<AlarmDto>> GetActiveAsync()
    {
        var alarms = await _alarms.GetActiveAsync();
        return alarms.Select(a => a.ToDto()).ToList();
    }

    public async Task<AlarmDto> RaiseAsync(
        string code, string title, string message,
        AlarmSeverity severity, string source,
        string? jobId = null, string? sessionId = null)
    {
        var alarm = new Alarm
        {
            Code = code,
            Title = title,
            Message = message,
            Severity = severity,
            Source = source,
            JobId = jobId,
            SimulationSessionId = sessionId,
        };

        await _alarms.CreateAsync(alarm);

        await _hub.AlarmRaisedAsync(new AlarmRaisedEvent(
            alarm.Id, alarm.Code, alarm.Title, alarm.Message,
            alarm.Severity.ToString(), alarm.Source, DateTime.UtcNow));

        return alarm.ToDto();
    }

    public async Task<AlarmDto?> AcknowledgeAsync(string id, string acknowledgedBy)
    {
        var alarm = await _alarms.GetByIdAsync(id);
        if (alarm is null) return null;

        alarm.Acknowledged = true;
        alarm.AcknowledgedAtUtc = DateTime.UtcNow;
        alarm.AcknowledgedBy = acknowledgedBy;
        await _alarms.UpdateAsync(alarm);

        await _hub.AlarmAcknowledgedAsync(new AlarmAcknowledgedEvent(
            alarm.Id, acknowledgedBy, DateTime.UtcNow));

        return alarm.ToDto();
    }
}

using Fabrik3D.Server.DTOs;
using Fabrik3D.Server.Mapping;
using Fabrik3D.Server.Models.Entities;
using Fabrik3D.Server.Repositories;

namespace Fabrik3D.Server.Services;

public class OperatorMessageService
{
    private readonly OperatorMessageRepository _messages;
    private readonly HubNotificationService _hub;

    public OperatorMessageService(OperatorMessageRepository messages, HubNotificationService hub)
    {
        _messages = messages;
        _hub = hub;
    }

    public async Task<List<OperatorMessageDto>> GetAllAsync(int limit = 100)
    {
        var messages = await _messages.GetAllAsync(limit);
        return messages.Select(m => m.ToDto()).ToList();
    }

    public async Task<OperatorMessageDto> PublishAsync(
        string title, string message, string type, string source,
        string? jobId = null, string? sessionId = null)
    {
        var msg = new OperatorMessage
        {
            Title = title,
            Message = message,
            Type = type,
            Source = source,
            JobId = jobId,
            SimulationSessionId = sessionId,
        };

        await _messages.CreateAsync(msg);

        await _hub.OperatorMessageAsync(new OperatorMessageEvent(
            msg.Id, msg.Title, msg.Message,
            msg.Type, msg.Source, DateTime.UtcNow));

        return msg.ToDto();
    }
}

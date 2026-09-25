using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Authentication;
using Fabrik3D.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

/// <summary>
/// Engineering signal-mapping surface: versioned, validated mapping documents plus an explicit,
/// all-or-nothing apply. It never bypasses connector write policy and never executes mapping
/// content. Mutations require the Engineer policy (or Administrator); reads require Read.
/// </summary>
[ApiController]
[Route("api/mappings")]
[Produces("application/json")]
[Authorize(Policy = Fabrik3DPolicies.Read)]
public class MappingsController : ControllerBase
{
    private readonly SignalMappingStore _store;
    private readonly SignalMappingApplyService _apply;
    private readonly ICurrentIdentity _identity;

    public MappingsController(
        SignalMappingStore store,
        SignalMappingApplyService apply,
        ICurrentIdentity identity)
    {
        _store = store;
        _apply = apply;
        _identity = identity;
    }

    /// <summary>List mapping document summaries (metadata only).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<SignalMappingSummaryDto>), 200)]
    public IActionResult GetAll() => Ok(_store.List());

    /// <summary>Get a mapping document by id.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(SignalMappingDocumentDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public IActionResult Get(string id)
    {
        var stored = _store.Get(id);
        return stored is null ? NotFound() : Ok(stored.Document);
    }

    /// <summary>Validate a mapping document without storing it (read-only dry run).</summary>
    [HttpPost("validate")]
    [ProducesResponseType(typeof(SignalMappingValidationResultDto), 200)]
    public IActionResult Validate([FromBody] SignalMappingDocumentDto document)
        => Ok(_apply.Validate(document));

    /// <summary>Create or update a mapping document with optimistic concurrency (engineering).</summary>
    [HttpPut("{id}")]
    [Authorize(Policy = Fabrik3DPolicies.Engineer)]
    [ProducesResponseType(typeof(SignalMappingDocumentDto), 200)]
    [ProducesResponseType(typeof(SignalMappingDocumentDto), 201)]
    [ProducesResponseType(typeof(ApiErrorDto), 400)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public IActionResult Upsert(string id, [FromBody] SignalMappingDocumentDto document, [FromQuery] int expectedVersion = 0)
    {
        if (document is null)
        {
            return BadRequest(new ApiErrorDto("validation_failed", "A mapping document is required.", StatusCodes.Status400BadRequest));
        }
        if (!string.Equals(document.Id, id, StringComparison.Ordinal))
        {
            return BadRequest(new ApiErrorDto("id_mismatch", "The route id must match the document id.", StatusCodes.Status400BadRequest));
        }

        var existing = _store.Get(id);
        var validation = _apply.Validate(document);
        if (!_store.TryUpsert(document, expectedVersion, validation.Valid, _identity.AuditId, out var stored, out var error))
        {
            var status = error switch
            {
                "not-found" => StatusCodes.Status404NotFound,
                _ => StatusCodes.Status409Conflict,
            };
            return StatusCode(status, new ApiErrorDto(error ?? "conflict", "The mapping document could not be saved.", status));
        }

        var payload = stored!.Document;
        return existing is null
            ? CreatedAtAction(nameof(Get), new { id }, payload)
            : Ok(payload);
    }

    /// <summary>Delete a mapping document with optimistic concurrency (engineering).</summary>
    [HttpDelete("{id}")]
    [Authorize(Policy = Fabrik3DPolicies.Engineer)]
    [ProducesResponseType(204)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    [ProducesResponseType(typeof(ApiErrorDto), 409)]
    public IActionResult Delete(string id, [FromQuery] int expectedVersion = 0)
    {
        if (!_store.TryDelete(id, expectedVersion, _identity.AuditId, out var error))
        {
            var status = error == "not-found" ? StatusCodes.Status404NotFound : StatusCodes.Status409Conflict;
            return StatusCode(status, new ApiErrorDto(error ?? "conflict", "The mapping document could not be deleted.", status));
        }
        return NoContent();
    }

    /// <summary>Explicitly apply a stored mapping document. All-or-nothing; disabled connectors fail the apply.</summary>
    [HttpPost("{id}/apply")]
    [Authorize(Policy = Fabrik3DPolicies.Engineer)]
    [ProducesResponseType(typeof(SignalMappingApplyResultDto), 200)]
    [ProducesResponseType(typeof(ApiErrorDto), 403)]
    [ProducesResponseType(typeof(ApiErrorDto), 404)]
    public IActionResult Apply(string id)
    {
        var stored = _store.Get(id);
        if (stored is null)
        {
            return NotFound(new ApiErrorDto("not_found", $"Mapping '{id}' does not exist.", StatusCodes.Status404NotFound));
        }
        return Ok(_apply.Apply(stored.Document, _identity.AuditId));
    }

    /// <summary>Recent mapping audit trail (most recent first).</summary>
    [HttpGet("audit")]
    [ProducesResponseType(typeof(List<SignalMappingAuditDto>), 200)]
    public IActionResult Audit() => Ok(_store.Audit());
}

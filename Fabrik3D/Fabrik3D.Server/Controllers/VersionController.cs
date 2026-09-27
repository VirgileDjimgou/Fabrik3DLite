using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Server.Deployment;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fabrik3D.Server.Controllers;

/// <summary>Product and build version information for the HMI and simulator "about" surfaces.</summary>
[ApiController]
[Route("api/version")]
[AllowAnonymous]
public class VersionController : ControllerBase
{
    private readonly VersionInfo _version;

    public VersionController(VersionInfo version) => _version = version;

    [HttpGet]
    [ProducesResponseType(typeof(VersionDto), 200)]
    public IActionResult Get() => Ok(_version.ToDto());
}

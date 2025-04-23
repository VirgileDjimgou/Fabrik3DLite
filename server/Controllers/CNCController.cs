using Microsoft.AspNetCore.Mvc;
using Fabrik3D_Lite.Models;
using Fabrik3D_Lite.Services;
using System.Threading.Tasks;

namespace Fabrik3D_Lite.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CNCController : ControllerBase
    {
        private readonly CNCService _cncService;

        public CNCController(CNCService cncService)
        {
            _cncService = cncService;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<CNCModel>>> GetAllCNCJobs()
        {
            var jobs = await _cncService.GetAllCNCJobsAsync();
            return Ok(jobs);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<CNCModel>> GetCNCJobById(string id)
        {
            var job = await _cncService.GetCNCJobByIdAsync(id);
            if (job == null)
            {
                return NotFound();
            }
            return Ok(job);
        }

        [HttpPost]
        public async Task<ActionResult<CNCModel>> CreateCNCJob(CNCModel cncJob)
        {
            var createdJob = await _cncService.CreateCNCJobAsync(cncJob);
            return CreatedAtAction(nameof(GetCNCJobById), new { id = createdJob.Id }, createdJob);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateCNCJob(string id, CNCModel cncJob)
        {
            if (id != cncJob.Id)
            {
                return BadRequest();
            }

            await _cncService.UpdateCNCJobAsync(cncJob);
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCNCJob(string id)
        {
            await _cncService.DeleteCNCJobAsync(id);
            return NoContent();
        }
    }
}
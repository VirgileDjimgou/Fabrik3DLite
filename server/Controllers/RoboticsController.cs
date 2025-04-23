using Microsoft.AspNetCore.Mvc;
using Fabrik3D_Lite.Models;
using Fabrik3D_Lite.Services;
using System.Threading.Tasks;

namespace Fabrik3D_Lite.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class RoboticsController : ControllerBase
    {
        private readonly RoboticsService _roboticsService;

        public RoboticsController(RoboticsService roboticsService)
        {
            _roboticsService = roboticsService;
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<RobotModel>> GetRobotById(string id)
        {
            var robot = await _roboticsService.GetRobotByIdAsync(id);
            if (robot == null)
            {
                return NotFound();
            }
            return Ok(robot);
        }

        [HttpPost]
        public async Task<ActionResult<RobotModel>> CreateRobot(RobotModel robotModel)
        {
            var createdRobot = await _roboticsService.CreateRobotAsync(robotModel);
            return CreatedAtAction(nameof(GetRobotById), new { id = createdRobot.Id }, createdRobot);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateRobot(string id, RobotModel robotModel)
        {
            if (id != robotModel.Id)
            {
                return BadRequest();
            }

            await _roboticsService.UpdateRobotAsync(robotModel);
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteRobot(string id)
        {
            var result = await _roboticsService.DeleteRobotAsync(id);
            if (!result)
            {
                return NotFound();
            }
            return NoContent();
        }
    }
}
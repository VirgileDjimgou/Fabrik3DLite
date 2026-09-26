using System.Text.Json;
using Fabrik3D.Contracts.DTOs;
using Fabrik3D.Domain.Training;

namespace Fabrik3D.Server.Tests;

/// <summary>
/// Guards the committed training-report sample artifact (S44) against contract drift. The artifact is
/// the human-readable evidence that a server report carries the model and the educational-scope
/// statement; this test keeps it aligned with <see cref="TrainingReportDto"/> and the disclaimer.
/// </summary>
public class TrainingReportSampleTests
{
    private const string SampleRelativePath = "docs/architecture/samples/training-session-report.sample.json";

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    [Fact]
    public void Committed_sample_report_matches_the_contract_and_states_educational_scope()
    {
        var path = LocateSample();
        Assert.NotNull(path);

        var report = JsonSerializer.Deserialize<TrainingReportDto>(File.ReadAllText(path!), Options);

        Assert.NotNull(report);
        Assert.Equal("server", report!.AssessmentAuthority);
        Assert.Equal("educational", report.EducationalScope);
        Assert.Contains("does not certify", report.Disclaimer, StringComparison.Ordinal);
        Assert.Equal(TrainingSchema.Version, report.SchemaVersion);

        Assert.NotNull(report.Assessment);
        Assert.Equal(report.Session.Score, report.Assessment!.ComputedScore);
        Assert.Equal(report.Assessment.EffectiveScore, report.Assessment.ComputedScore);
        Assert.Equal(5, report.Assessment.Criteria.Count);
        Assert.Equal(report.Assessment.ComputedPossibleScore, report.Assessment.Criteria.Sum(c => c.Points));
        Assert.Equal(report.Assessment.ComputedScore, report.Assessment.Criteria.Sum(c => c.Earned));
        Assert.Equal(1, report.Metrics.FaultsEncountered);
        Assert.Equal(1, report.Metrics.RecoveryActions);
    }

    private static string? LocateSample()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, SampleRelativePath);
            if (File.Exists(candidate)) return candidate;
            directory = directory.Parent;
        }
        return null;
    }
}

using Fabrik3D.Server.Services;

namespace Fabrik3D.Server.Tests;

public class CellFileContentValidatorTests
{
    private static readonly string ValidV1 = """
        {
          "schemaVersion": "1.0",
          "id": "cell-1",
          "name": "Cell",
          "worldFrameId": "world",
          "equipment": []
        }
        """;

    private static readonly string ValidV09 = """
        {
          "schemaVersion": "0.9",
          "cell": { "id": "cell-1", "name": "Cell" },
          "equipment": []
        }
        """;

    [Fact]
    public void Accepts_supported_schema_versions()
    {
        Assert.Null(CellFileContentValidator.ValidateContent(ValidV1));
        Assert.Null(CellFileContentValidator.ValidateContent(ValidV09));
    }

    [Fact]
    public void Rejects_empty_or_non_json_content()
    {
        Assert.NotNull(CellFileContentValidator.ValidateContent(""));
        Assert.NotNull(CellFileContentValidator.ValidateContent("   "));
        Assert.NotNull(CellFileContentValidator.ValidateContent("not json"));
        Assert.NotNull(CellFileContentValidator.ValidateContent("[1, 2, 3]"));
    }

    [Fact]
    public void Rejects_missing_or_invalid_schema_version()
    {
        Assert.NotNull(CellFileContentValidator.ValidateContent("{}"));
        Assert.NotNull(CellFileContentValidator.ValidateContent("""
            { "schemaVersion": 42, "equipment": [] }
            """));
        Assert.NotNull(CellFileContentValidator.ValidateContent("""
            { "schemaVersion": "2.0", "equipment": [] }
            """));
    }

    [Fact]
    public void Reports_unsupported_version_with_a_useful_message()
    {
        var error = CellFileContentValidator.ValidateContent("""
            { "schemaVersion": "99.0", "equipment": [] }
            """);
        Assert.NotNull(error);
        Assert.Contains("99.0", error);
        Assert.Contains("Supported versions", error);
    }

    [Fact]
    public void Reads_the_schema_version_from_valid_content()
    {
        Assert.Equal("1.0", CellFileContentValidator.SchemaVersionOf(ValidV1));
        Assert.Equal("0.9", CellFileContentValidator.SchemaVersionOf(ValidV09));
    }
}
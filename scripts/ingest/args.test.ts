import { describe, expect, it } from "vitest";
import { parseArgs } from "./args";

const required = ["--source=ccc", "--language=hu"];

describe("the flags a run needs", () => {
  it("reads source and language", () => {
    expect(parseArgs(required)).toMatchObject({ source: "ccc", language: "hu" });
  });

  it("defaults every switch to off", () => {
    expect(parseArgs(required)).toMatchObject({
      dryRun: false,
      refetch: false,
      remote: false,
    });
  });

  it("requires both source and language", () => {
    expect(() => parseArgs(["--source=ccc"])).toThrow(/both required/);
    expect(() => parseArgs(["--language=hu"])).toThrow(/both required/);
    expect(() => parseArgs([])).toThrow(/both required/);
  });

  it("rejects a value flag with no value", () => {
    expect(() => parseArgs(["--source", "--language=hu"])).toThrow(
      /--source needs a value/
    );
    expect(() => parseArgs(["--source=", "--language=hu"])).toThrow(
      /--source needs a value/
    );
  });
});

describe("switches", () => {
  it("accepts a bare switch", () => {
    expect(parseArgs([...required, "--dry-run"]).dryRun).toBe(true);
  });

  it("accepts an explicit true/false", () => {
    expect(parseArgs([...required, "--dry-run=true"]).dryRun).toBe(true);
    expect(parseArgs([...required, "--dry-run=false"]).dryRun).toBe(false);
  });

  it("rejects a switch given a non-boolean value", () => {
    // `--dry-run=yes` previously parsed to FALSE, silently.
    expect(() => parseArgs([...required, "--dry-run=yes"])).toThrow(
      /takes no value/
    );
  });

  it("reads every switch", () => {
    const args = parseArgs([...required, "--dry-run", "--refetch", "--remote"]);
    expect(args).toMatchObject({ dryRun: true, refetch: true, remote: true });
  });
});

describe("unknown flags are fatal", () => {
  /**
   * THE REGRESSION. Each of these previously parsed cleanly to dryRun=false and
   * the ingest wrote to the database — a typo in the one flag whose entire job
   * is "do not write", silently doing the opposite.
   */
  it.each(["--dryrun", "--dry-runn", "--drt-run", "--dryRun".toLowerCase()])(
    "refuses %s rather than ignoring it",
    (typo) => {
      expect(() => parseArgs([...required, typo])).toThrow(/Unknown flag/);
    }
  );

  it("suggests the flag that was meant", () => {
    expect(() => parseArgs([...required, "--dryrun"])).toThrow(
      /Did you mean --dry-run\?/
    );
  });

  it("lists the known flags", () => {
    expect(() => parseArgs([...required, "--nonsense"])).toThrow(/--refetch/);
  });

  it("still rejects a non-flag argument", () => {
    expect(() => parseArgs([...required, "ccc"])).toThrow(/Not a flag/);
    expect(() => parseArgs([...required, "-r"])).toThrow(/Not a flag/);
  });

  it("rejects a repeated flag rather than taking the last one", () => {
    expect(() => parseArgs(["--source=ccc", "--source=summa", "--language=hu"])).toThrow(
      /given twice/
    );
  });
});

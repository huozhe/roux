import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { _test } from "./transcript";

describe("parseXmlCaptions", () => {
  it("parses start/dur text nodes", () => {
    const xml = `<?xml version="1.0"?>
<body>
  <text start="1.5" dur="2.0">hello &amp; world</text>
  <text start="4" dur="1">next</text>
</body>`;
    const cues = _test.parseXmlCaptions(xml);
    assert.equal(cues.length, 2);
    assert.equal(cues[0]!.text, "hello & world");
    assert.equal(cues[0]!.start_seconds, 1.5);
    assert.equal(cues[0]!.duration_seconds, 2);
    assert.equal(cues[1]!.start_seconds, 4);
  });
});

describe("parseJson3Captions", () => {
  it("maps events to cues", () => {
    const raw = JSON.stringify({
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "hi " }, { utf8: "there" }] },
        { tStartMs: 5000, segs: [{ utf8: "bye" }] },
        { tStartMs: 6000 }, // no segs
      ],
    });
    const cues = _test.parseJson3Captions(raw);
    assert.equal(cues.length, 2);
    assert.equal(cues[0]!.text, "hi there");
    assert.equal(cues[0]!.start_seconds, 1);
    assert.equal(cues[0]!.duration_seconds, 2);
    assert.equal(cues[1]!.text, "bye");
  });
});

describe("pickTrack", () => {
  it("prefers English", () => {
    const t = _test.pickTrack([
      { languageCode: "es", baseUrl: "http://es" },
      { languageCode: "en", baseUrl: "http://en" },
    ]);
    assert.equal(t?.baseUrl, "http://en");
  });
  it("returns null for empty", () => {
    assert.equal(_test.pickTrack([]), null);
  });
});

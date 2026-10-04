package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type conformanceCase struct {
	Schema   string          `json:"schema"`
	Request  json.RawMessage `json:"request"`
	Expected struct {
		Source struct {
			Format     string `json:"format"`
			Digest     string `json:"digest"`
			ByteLength int    `json:"byteLength"`
		} `json:"source"`
		CandidateCount int `json:"candidateCount"`
		Candidates []struct {
			Kind                      string `json:"kind"`
			Sheet                     string `json:"sheet"`
			Range                     string  `json:"range"`
			StructuralPath            *string `json:"structuralPath"`
			Execution                 string  `json:"execution"`
			Method                    string `json:"method"`
			ProvenanceAlgorithm       string `json:"provenanceAlgorithm"`
			FingerprintRepresentation string `json:"fingerprintRepresentation"`
			FingerprintDigest         string `json:"fingerprintDigest"`
		} `json:"candidates"`
	} `json:"expected"`
}

func runConformanceCase(
	t *testing.T,
	filename string,
) response {
	t.Helper()
	file := filepath.Join(
		"..",
		"..",
		"test",
		"fixtures",
		"portable-core-v1",
		filename,
	)
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var fixture conformanceCase
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Schema != "mmi.portable-core-conformance/v1" {
		t.Fatalf("unexpected fixture schema: %s", fixture.Schema)
	}

	output, err := run(fixture.Request)
	if err != nil {
		t.Fatal(err)
	}
	var actualResponse response
	if err := json.Unmarshal(output, &actualResponse); err != nil {
		t.Fatal(err)
	}

	if actualResponse.Schema != responseSchema ||
		actualResponse.Operation != "inspect" ||
		actualResponse.Execution != "deterministic" {
		t.Fatalf(
			"unexpected response envelope: %+v",
			actualResponse,
		)
	}
	if actualResponse.Source.Format != fixture.Expected.Source.Format ||
		actualResponse.Source.Digest != fixture.Expected.Source.Digest ||
		actualResponse.Source.ByteLength != fixture.Expected.Source.ByteLength {
		t.Fatalf("source mismatch: %+v", actualResponse.Source)
	}
	if len(actualResponse.Candidates) != fixture.Expected.CandidateCount {
		t.Fatalf(
			"candidate count: got %d want %d",
			len(actualResponse.Candidates),
			fixture.Expected.CandidateCount,
		)
	}
	for index, expected := range fixture.Expected.Candidates {
		actual := actualResponse.Candidates[index]
		if actual.Kind != expected.Kind ||
			actual.Locator.Sheet != expected.Sheet ||
			actual.Locator.Range != expected.Range ||
			actual.Execution != expected.Execution ||
			actual.Method != expected.Method ||
			actual.Provenance.Algorithm != expected.ProvenanceAlgorithm ||
			actual.Fingerprint.Representation != expected.FingerprintRepresentation {
			t.Fatalf("candidate %d mismatch: %+v", index, actual)
		}
		if expected.StructuralPath != nil {
			if actual.Locator.StructuralPath == nil ||
				*actual.Locator.StructuralPath != *expected.StructuralPath {
				t.Fatalf(
					"candidate %d structural path mismatch: %+v",
					index,
					actual.Locator.StructuralPath,
				)
			}
		}
		if expected.FingerprintDigest != "" &&
			actual.Fingerprint.Digest != expected.FingerprintDigest {
			t.Fatalf(
				"candidate %d fingerprint: got %s want %s",
				index,
				actual.Fingerprint.Digest,
				expected.FingerprintDigest,
			)
		}
		if actual.Locator.SourceDigest != actualResponse.Source.Digest ||
			actual.Provenance.Run.InputDigest != actualResponse.Source.Digest {
			t.Fatalf("candidate %d digest binding mismatch", index)
		}
	}
	return actualResponse
}

func TestCSVConformanceCase(t *testing.T) {
	actualResponse := runConformanceCase(
		t,
		"csv-table.case.json",
	)
	if got := actualResponse.Candidates[0].Fingerprint.Digest; got != "sha256:1843ff7d0f2bb62e5453688434fc7c5eaad0968fb21d7c6e8bcdd47e79cedfb6" {
		t.Fatalf("fingerprint mismatch: %s", got)
	}
	if got := actualResponse.Candidates[0].Reference; got != "![[./fixture.csv#Sheet1|A1:B3?header=first]]" {
		t.Fatalf("reference mismatch: %s", got)
	}
}

func TestJSONTreeConformanceCase(t *testing.T) {
	actualResponse := runConformanceCase(
		t,
		"json-tree.case.json",
	)
	if actualResponse.Source.Format != "json" {
		t.Fatalf("unexpected JSON source format: %s", actualResponse.Source.Format)
	}
}

func TestRejectsProviderDependentAndUnknownFields(t *testing.T) {
	for _, input := range []string{
		`{"schema":"mmi.portable-core-request/v1","operation":"inspect","source":{"name":"x.csv","label":"./x.csv","bytesBase64":""},"executionPolicy":{"allowProviderDependent":true}}`,
		`{"schema":"mmi.portable-core-request/v1","operation":"inspect","source":{"name":"x.csv","label":"./x.csv","bytesBase64":""},"command":"write"}`,
	} {
		if _, err := run([]byte(input)); err == nil {
			t.Fatalf("expected rejection: %s", input)
		}
	}
}


func TestParseCSVMatchesReferenceSemantics(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected [][]string
	}{
		{
			name:  "utf8-bom-and-crlf",
			input: "\uFEFFID,Name\r\n1,Alice\r\n",
			expected: [][]string{
				{"ID", "Name"},
				{"1", "Alice"},
			},
		},
		{
			name:  "quoted-comma-and-escaped-quote",
			input: "ID,Name\n1,\"Smith, John\"\n2,\"A \"\"quoted\"\" name\"\n",
			expected: [][]string{
				{"ID", "Name"},
				{"1", "Smith, John"},
				{"2", "A \"quoted\" name"},
			},
		},
		{
			name:  "quoted-newline",
			input: "ID,Note\n1,\"line1\nline2\"\n",
			expected: [][]string{
				{"ID", "Note"},
				{"1", "line1\nline2"},
			},
		},
		{
			name:  "unquoted-trim-and-quoted-preserve-space",
			input: " A ,\" B \"\n",
			expected: [][]string{
				{"A", " B "},
			},
		},
		{
			name:  "standalone-cr-is-ignored-like-typescript-reference",
			input: "A,B\r1,2\n",
			expected: [][]string{
				{"A", "B1", "2"},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := parseCSV(test.input)
			if err != nil {
				t.Fatal(err)
			}
			if !equalRows(actual, test.expected) {
				t.Fatalf("rows mismatch:\n got: %#v\nwant: %#v", actual, test.expected)
			}
		})
	}
}

func TestParseCSVRejectsUnterminatedQuotedField(t *testing.T) {
	if _, err := parseCSV("ID,Name\n1,\"unterminated"); err == nil {
		t.Fatal("expected unterminated quoted field to be rejected")
	}
}

func equalRows(left, right [][]string) bool {
	if len(left) != len(right) {
		return false
	}
	for row := range left {
		if len(left[row]) != len(right[row]) {
			return false
		}
		for col := range left[row] {
			if left[row][col] != right[row][col] {
				return false
			}
		}
	}
	return true
}


func TestMaxScanCellsUsesPortableSafeIntegerSemantics(t *testing.T) {
	accepted := `{"schema":"mmi.portable-core-request/v1","operation":"inspect","source":{"name":"x.csv","label":"./x.csv","bytesBase64":"QQo="},"options":{"maxScanCells":9007199254740991},"executionPolicy":{"allowProviderDependent":false}}`
	if _, err := run([]byte(accepted)); err != nil {
		t.Fatalf("largest JavaScript-safe integer must be accepted: %v", err)
	}

	for _, input := range []string{
		`{"schema":"mmi.portable-core-request/v1","operation":"inspect","source":{"name":"x.csv","label":"./x.csv","bytesBase64":"QQo="},"options":{"maxScanCells":9007199254740992}}`,
		`{"schema":"mmi.portable-core-request/v1","operation":"inspect","source":{"name":"x.csv","label":"./x.csv","bytesBase64":"QQo="},"options":{"maxScanCells":1.5}}`,
		`{"schema":"mmi.portable-core-request/v1","operation":"inspect","source":{"name":"x.csv","label":"./x.csv","bytesBase64":"QQo="},"options":{"maxScanCells":0}}`,
	} {
		if _, err := run([]byte(input)); err == nil {
			t.Fatalf("expected maxScanCells rejection: %s", input)
		}
	}
}


func TestJSONTreeRejectsInvalidUTF8AndInvalidJSON(t *testing.T) {
	for _, input := range []string{
		`{"schema":"mmi.portable-core-request/v1","operation":"inspect","source":{"name":"x.json","label":"./x.json","bytesBase64":"eyJhIjr/LX0="}}`,
		`{"schema":"mmi.portable-core-request/v1","operation":"inspect","source":{"name":"x.json","label":"./x.json","bytesBase64":"ew=="}}`,
	} {
		if _, err := run([]byte(input)); err == nil {
			t.Fatalf("expected JSON rejection: %s", input)
		}
	}
}

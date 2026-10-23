package main

import (
	"encoding/base64"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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
			StructuralPath            *string         `json:"structuralPath"`
			Status                    string          `json:"status"`
			Claims                    json.RawMessage `json:"claims"`
			Execution                 string          `json:"execution"`
			Method                    string `json:"method"`
			ProvenanceAlgorithm       string `json:"provenanceAlgorithm"`
			ProvenanceVersion         string `json:"provenanceVersion"`
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
		if expected.Status != "" && actual.Status != expected.Status {
			t.Fatalf(
				"candidate %d status: got %s want %s",
				index,
				actual.Status,
				expected.Status,
			)
		}
		if len(expected.Claims) > 0 {
			actualRaw, err := json.Marshal(actual.Claims)
			if err != nil {
				t.Fatal(err)
			}
			var actualClaims any
			var expectedClaims any
			if err := json.Unmarshal(actualRaw, &actualClaims); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(expected.Claims, &expectedClaims); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(actualClaims, expectedClaims) {
				t.Fatalf(
					"candidate %d claims mismatch:\n got: %#v\nwant: %#v",
					index,
					actualClaims,
					expectedClaims,
				)
			}
		}
		if expected.ProvenanceVersion != "" &&
			actual.Provenance.Run.ImplementationVersion != expected.ProvenanceVersion {
			t.Fatalf(
				"candidate %d provenance version: got %s want %s",
				index,
				actual.Provenance.Run.ImplementationVersion,
				expected.ProvenanceVersion,
			)
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

func TestXLSXConformanceCase(t *testing.T) {
	actualResponse := runConformanceCase(
		t,
		"xlsx-table.case.json",
	)
	if got := actualResponse.Candidates[0].Fingerprint.Digest; got != "sha256:1843ff7d0f2bb62e5453688434fc7c5eaad0968fb21d7c6e8bcdd47e79cedfb6" {
		t.Fatalf("fingerprint mismatch: %s", got)
	}
	if got := actualResponse.Candidates[0].Reference; got != "![[./fixture.xlsx#Sheet1|A1:B3?header=first]]" {
		t.Fatalf("reference mismatch: %s", got)
	}
	if got := actualResponse.Source.Format; got != "xlsx" {
		t.Fatalf("format mismatch: %s", got)
	}
}

func TestXLSXLeadingBlankRowsConformanceCase(t *testing.T) {
	actualResponse := runConformanceCase(
		t,
		"xlsx-leading-blank-rows.case.json",
	)
	if got := actualResponse.Candidates[0].Locator.Range; got != "A3:B5" {
		t.Fatalf("range mismatch: %s", got)
	}
	if got := actualResponse.Candidates[0].Reference; got != "![[./fixture.xlsx#Sheet1|A3:B5?header=first]]" {
		t.Fatalf("reference mismatch: %s", got)
	}
}

func TestCSVLeadingBlankRowsConformanceCase(t *testing.T) {
	actualResponse := runConformanceCase(
		t,
		"csv-leading-blank-rows.case.json",
	)
	if got := actualResponse.Candidates[0].Locator.Range; got != "A3:B5" {
		t.Fatalf("range mismatch: %s", got)
	}
	if got := actualResponse.Candidates[0].Reference; got != "![[./fixture.csv#Sheet1|A3:B5?header=first]]" {
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

func TestJSONTreeUnicodeAndPointerConformanceCase(t *testing.T) {
	actualResponse := runConformanceCase(
		t,
		"json-tree-unicode.case.json",
	)
	wantPaths := []string{
		"",
		"/a~1b",
		"/a~1b/~0node",
		"/😀",
		"/�",
	}
	for index, want := range wantPaths {
		actual := actualResponse.Candidates[index].Locator.StructuralPath
		if actual == nil || *actual != want {
			t.Fatalf(
				"candidate %d structural path: got %v want %q",
				index,
				actual,
				want,
			)
		}
	}
}


func TestXMLTreeConformanceCase(t *testing.T) {
	actualResponse := runConformanceCase(
		t,
		"xml-tree.case.json",
	)
	if actualResponse.Source.Format != "xml" {
		t.Fatalf(
			"unexpected XML source format: %s",
			actualResponse.Source.Format,
		)
	}
}


func TestNamespacedXMLTreeConformanceCase(t *testing.T) {
	actualResponse := runConformanceCase(
		t,
		"xml-tree-namespace.case.json",
	)
	wantPaths := []string{
		"/p:root[1]",
		"/p:root[1]/p:item[1]",
		"/p:root[1]/p:item[2]",
	}
	for index, want := range wantPaths {
		actual := actualResponse.Candidates[index].Locator.StructuralPath
		if actual == nil || *actual != want {
			t.Fatalf(
				"candidate %d structural path: got %v want %q",
				index,
				actual,
				want,
			)
		}
	}
}

func TestXMLTreeRejectsDTDEncodingAndUndeclaredPrefixes(t *testing.T) {
	for _, source := range []string{
		`<!DOCTYPE service [<!ENTITY x "value">]><service>&x;</service>`,
		`<?xml version="1.0" encoding="Shift_JIS"?><service/>`,
		`<p:service/>`,
	} {
		request := map[string]any{
			"schema":    requestSchema,
			"operation": "inspect",
			"source": map[string]any{
				"name":        "service.xml",
				"label":       "./service.xml",
				"bytesBase64": base64.StdEncoding.EncodeToString([]byte(source)),
			},
			"executionPolicy": map[string]any{
				"allowProviderDependent": false,
			},
		}
		raw, err := json.Marshal(request)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := run(raw); err == nil {
			t.Fatalf("expected XML rejection: %s", source)
		}
	}
}

func TestXMLSpreadsheetDoesNotFallThroughToGenericTree(t *testing.T) {
	source := `<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"/>`
	request := map[string]any{
		"schema":    requestSchema,
		"operation": "inspect",
		"source": map[string]any{
			"name":        "legacy.xml",
			"label":       "./legacy.xml",
			"bytesBase64": base64.StdEncoding.EncodeToString([]byte(source)),
		},
	}
	raw, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := run(raw); err == nil ||
		!strings.Contains(err.Error(), "XML Spreadsheet 2003") {
		t.Fatalf(
			"expected XML Spreadsheet 2003 profile rejection, got: %v",
			err,
		)
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
		{
			name:  "leading-blank-records-preserve-physical-row-origin",
			input: "\n\nName,Role\nAlice,Admin\n",
			expected: [][]string{
				{""},
				{""},
				{"Name", "Role"},
				{"Alice", "Admin"},
			},
		},
		{
			name:  "single-trailing-line-terminator-does-not-add-a-record",
			input: "Name,Role\nAlice,Admin\n",
			expected: [][]string{
				{"Name", "Role"},
				{"Alice", "Admin"},
			},
		},
		{
			name:  "repeated-trailing-line-terminator-preserves-blank-record",
			input: "Name,Role\nAlice,Admin\n\n",
			expected: [][]string{
				{"Name", "Role"},
				{"Alice", "Admin"},
				{""},
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

func TestCSVRegionCoordinatesIncludeLeadingBlankRecords(t *testing.T) {
	rows, err := parseCSV("\n\nName,Role\nAlice,Admin\nBob,User\n")
	if err != nil {
		t.Fatal(err)
	}
	regions := detectRegions(rows, 1_000)
	if len(regions) != 1 {
		t.Fatalf("regions: got %d want 1: %#v", len(regions), regions)
	}
	if got := regions[0].a1; got != "A3:B5" {
		t.Fatalf("region A1 range: got %s want A3:B5", got)
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


func TestCanonicalJSONMatchesJavaScriptNumberSemantics(t *testing.T) {
	negativeZero := math.Copysign(0, -1)
	rendered, err := canonicalJSON(negativeZero)
	if err != nil {
		t.Fatal(err)
	}
	if rendered != "0" {
		t.Fatalf("negative zero canonical form: got %q want %q", rendered, "0")
	}

	if _, err := canonicalJSON(math.Inf(1)); err == nil {
		t.Fatal("non-finite JSON Tree number must be rejected")
	}
	if _, err := canonicalJSON(float64(maxSafeInteger)); err != nil {
		t.Fatalf("largest safe integer must be accepted: %v", err)
	}
	if _, err := canonicalJSON(float64(maxSafeInteger) + 1); err == nil {
		t.Fatal("unsafe integer must be rejected")
	}
}


func TestCanonicalJSONMatchesJavaScriptUnicodeSemantics(t *testing.T) {
	rendered, err := canonicalJSON("  <>&")
	if err != nil {
		t.Fatal(err)
	}
	if rendered != "\"\u2028\u2029<>&\"" {
		t.Fatalf("string canonical form: got %q", rendered)
	}
}

func TestJSONTreeRejectsUnpairedSurrogateEscapes(t *testing.T) {
	for _, source := range []string{
		`{"value":"\ud800"}`,
		`{"value":"\udc00"}`,
		`{"\ud800":"value"}`,
	} {
		if _, err := jsonTreeCandidates(
			[]byte(source),
			"./fixture.json",
			"sha256:"+strings.Repeat("a", 64),
		); err == nil {
			t.Fatalf("expected unpaired surrogate rejection: %s", source)
		}
	}

	if _, err := jsonTreeCandidates(
		[]byte(`{"value":"\ud83d\ude00"}`),
		"./fixture.json",
		"sha256:"+strings.Repeat("a", 64),
	); err != nil {
		t.Fatalf("valid surrogate pair must be accepted: %v", err)
	}
}

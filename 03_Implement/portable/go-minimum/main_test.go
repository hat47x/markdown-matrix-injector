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
			Range                     string `json:"range"`
			Execution                 string `json:"execution"`
			Method                    string `json:"method"`
			ProvenanceAlgorithm       string `json:"provenanceAlgorithm"`
			FingerprintRepresentation string `json:"fingerprintRepresentation"`
		} `json:"candidates"`
	} `json:"expected"`
}

func TestCSVConformanceCase(t *testing.T) {
	file := filepath.Join("..", "..", "test", "fixtures", "portable-core-v1", "csv-table.case.json")
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
	var response response
	if err := json.Unmarshal(output, &response); err != nil {
		t.Fatal(err)
	}

	if response.Schema != responseSchema || response.Operation != "inspect" || response.Execution != "deterministic" {
		t.Fatalf("unexpected response envelope: %+v", response)
	}
	if response.Source.Format != fixture.Expected.Source.Format ||
		response.Source.Digest != fixture.Expected.Source.Digest ||
		response.Source.ByteLength != fixture.Expected.Source.ByteLength {
		t.Fatalf("source mismatch: %+v", response.Source)
	}
	if len(response.Candidates) != fixture.Expected.CandidateCount {
		t.Fatalf("candidate count: got %d want %d", len(response.Candidates), fixture.Expected.CandidateCount)
	}
	for index, expected := range fixture.Expected.Candidates {
		actual := response.Candidates[index]
		if actual.Kind != expected.Kind ||
			actual.Locator.Sheet != expected.Sheet ||
			actual.Locator.Range != expected.Range ||
			actual.Execution != expected.Execution ||
			actual.Method != expected.Method ||
			actual.Provenance.Algorithm != expected.ProvenanceAlgorithm ||
			actual.Fingerprint.Representation != expected.FingerprintRepresentation {
			t.Fatalf("candidate %d mismatch: %+v", index, actual)
		}
		if actual.Locator.SourceDigest != response.Source.Digest ||
			actual.Provenance.Run.InputDigest != response.Source.Digest {
			t.Fatalf("candidate %d digest binding mismatch", index)
		}
	}
	if got := response.Candidates[0].Fingerprint.Digest; got != "sha256:1843ff7d0f2bb62e5453688434fc7c5eaad0968fb21d7c6e8bcdd47e79cedfb6" {
		t.Fatalf("fingerprint mismatch: %s", got)
	}
	if got := response.Candidates[0].Reference; got != "![[./fixture.csv#Sheet1|A1:B3?header=first]]" {
		t.Fatalf("reference mismatch: %s", got)
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

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

const (
	requestSchema  = "mmi.portable-core-request/v1"
	responseSchema = "mmi.portable-core-response/v1"
	defaultMaxScan int64 = 1_000_000
	maxSafeInteger int64 = 9_007_199_254_740_991
)

type request struct {
	Schema           string           `json:"schema"`
	Operation        string           `json:"operation"`
	Source           requestSource    `json:"source"`
	Options          *requestOptions  `json:"options,omitempty"`
	ExecutionPolicy *executionPolicy `json:"executionPolicy,omitempty"`
}

type requestSource struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	BytesBase64 string `json:"bytesBase64"`
}

type requestOptions struct {
	MaxScanCells *int64 `json:"maxScanCells,omitempty"`
}

type executionPolicy struct {
	AllowProviderDependent *bool `json:"allowProviderDependent,omitempty"`
}

type response struct {
	Schema      string       `json:"schema"`
	Operation   string       `json:"operation"`
	Execution   string       `json:"execution"`
	Source      sourceResult `json:"source"`
	Candidates  []candidate  `json:"candidates"`
	Diagnostics []diagnostic `json:"diagnostics"`
}

type sourceResult struct {
	Name       string `json:"name"`
	Label      string `json:"label"`
	Format     string `json:"format"`
	Digest     string `json:"digest"`
	ByteLength int    `json:"byteLength"`
}

type diagnostic struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
}

type candidate struct {
	Kind        string      `json:"kind"`
	Locator     locator     `json:"locator"`
	Status      string      `json:"status"`
	Execution   string      `json:"execution"`
	Method      string      `json:"method"`
	Claims      []claim     `json:"claims"`
	Provenance  provenance  `json:"provenance"`
	Fingerprint fingerprint `json:"fingerprint"`
	Scores      []any       `json:"scores"`
	Reference   string      `json:"reference,omitempty"`
}

type locator struct {
	Source         string  `json:"source"`
	SourceDigest   string  `json:"sourceDigest"`
	Sheet          string  `json:"sheet,omitempty"`
	Range          string  `json:"range,omitempty"`
	StructuralPath *string `json:"structuralPath,omitempty"`
}

type claim struct {
	Aspect     string      `json:"aspect"`
	Value      any         `json:"value,omitempty"`
	Status     string      `json:"status"`
	Execution  string      `json:"execution"`
	Method     string      `json:"method"`
	ReasonCode string      `json:"reasonCode"`
	Evidence   *[]evidence `json:"evidence,omitempty"`
}

type evidence struct {
	Code   string `json:"code"`
	Detail string `json:"detail,omitempty"`
}

type provenance struct {
	Algorithm string               `json:"algorithm"`
	Run       deterministicRun     `json:"run"`
}

type deterministicRun struct {
	Execution             string         `json:"execution"`
	InputDigest           string         `json:"inputDigest"`
	Config                map[string]any `json:"config"`
	ImplementationVersion string         `json:"implementationVersion"`
}

type fingerprint struct {
	Algorithm      string `json:"algorithm"`
	Representation string `json:"representation"`
	Digest         string `json:"digest"`
}

type block struct {
	top, bottom, left, right int
	splitByRow, splitByCol   bool
}

type region struct {
	top, bottom, left, right int
	a1                       string
	title                    string
	titleA1                  string
	headers                  []string
	headerConfidence         string
	reasons                  []string
}

func run(input []byte) ([]byte, error) {
	var req request
	decoder := json.NewDecoder(strings.NewReader(string(input)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		return nil, fmt.Errorf("invalid request JSON: %w", err)
	}
	if err := ensureEOF(decoder); err != nil {
		return nil, err
	}
	if req.Schema != requestSchema {
		return nil, fmt.Errorf("unsupported schema: %q", req.Schema)
	}
	if req.Operation != "inspect" {
		return nil, fmt.Errorf("unsupported operation: %q", req.Operation)
	}
	if req.Source.Name == "" || req.Source.Label == "" {
		return nil, errors.New("source.name and source.label are required")
	}
	if req.ExecutionPolicy != nil && req.ExecutionPolicy.AllowProviderDependent != nil && *req.ExecutionPolicy.AllowProviderDependent {
		return nil, errors.New("portable core v1 does not allow provider-dependent execution")
	}
	maxScan := defaultMaxScan
	if req.Options != nil && req.Options.MaxScanCells != nil {
		if *req.Options.MaxScanCells <= 0 || *req.Options.MaxScanCells > maxSafeInteger {
			return nil, errors.New("options.maxScanCells must be a positive safe integer")
		}
		maxScan = *req.Options.MaxScanCells
	}

	bytes, err := base64.StdEncoding.DecodeString(req.Source.BytesBase64)
	if err != nil || base64.StdEncoding.EncodeToString(bytes) != req.Source.BytesBase64 {
		return nil, errors.New("source.bytesBase64 must be canonical base64")
	}
	extension := strings.ToLower(filepath.Ext(req.Source.Name))
	if extension != ".csv" && extension != ".json" {
		return nil, errors.New("go-minimum currently supports CSV and JSON only")
	}
	if !utf8.Valid(bytes) {
		return nil, errors.New("go-minimum CSV/JSON profile currently supports UTF-8 only")
	}

	sum := sha256.Sum256(bytes)
	sourceDigest := "sha256:" + hex.EncodeToString(sum[:])

	var format string
	var candidates []candidate
	switch extension {
	case ".csv":
		format = "csv"
		rows, err := parseCSV(string(bytes))
		if err != nil {
			return nil, err
		}
		regions := detectRegions(rows, maxScan)
		candidates = make([]candidate, 0, len(regions))
		for _, r := range regions {
			candidates = append(
				candidates,
				toCandidate(
					req.Source.Label,
					sourceDigest,
					rows,
					r,
					maxScan,
				),
			)
		}
	case ".json":
		format = "json"
		candidates, err = jsonTreeCandidates(
			bytes,
			req.Source.Label,
			sourceDigest,
		)
		if err != nil {
			return nil, err
		}
	}

	out := response{
		Schema:    responseSchema,
		Operation: "inspect",
		Execution: "deterministic",
		Source: sourceResult{
			Name:       req.Source.Name,
			Label:      req.Source.Label,
			Format:     format,
			Digest:     sourceDigest,
			ByteLength: len(bytes),
		},
		Candidates:  candidates,
		Diagnostics: []diagnostic{},
	}
	return json.MarshalIndent(out, "", "  ")
}

func jsonTreeCandidates(
	input []byte,
	source string,
	sourceDigest string,
) ([]candidate, error) {
	if err := validateJSONSurrogateEscapes(input); err != nil {
		return nil, err
	}
	var value any
	if err := json.Unmarshal(input, &value); err != nil {
		return nil, fmt.Errorf("invalid JSON source: %w", err)
	}
	out := []candidate{}
	if err := collectJSONTreeCandidates(
		value,
		"",
		source,
		sourceDigest,
		&out,
	); err != nil {
		return nil, err
	}
	return out, nil
}

func validateJSONSurrogateEscapes(input []byte) error {
	inString := false
	for index := 0; index < len(input); {
		current := input[index]
		if !inString {
			if current == '"' {
				inString = true
			}
			index++
			continue
		}
		if current == '"' {
			inString = false
			index++
			continue
		}
		if current != '\\' {
			index++
			continue
		}
		if index+1 >= len(input) {
			return nil
		}
		if input[index+1] != 'u' {
			index += 2
			continue
		}
		if index+6 > len(input) {
			return nil
		}
		code, ok := jsonHexCodeUnit(input[index+2 : index+6])
		if !ok {
			index += 2
			continue
		}
		if code >= 0xd800 && code <= 0xdbff {
			if index+12 > len(input) ||
				input[index+6] != '\\' ||
				input[index+7] != 'u' {
				return errors.New(
					"JSON Tree strings must not contain unpaired UTF-16 surrogates",
				)
			}
			next, ok := jsonHexCodeUnit(input[index+8 : index+12])
			if !ok || next < 0xdc00 || next > 0xdfff {
				return errors.New(
					"JSON Tree strings must not contain unpaired UTF-16 surrogates",
				)
			}
			index += 12
			continue
		}
		if code >= 0xdc00 && code <= 0xdfff {
			return errors.New(
				"JSON Tree strings must not contain unpaired UTF-16 surrogates",
			)
		}
		index += 6
	}
	return nil
}

func jsonHexCodeUnit(input []byte) (uint16, bool) {
	if len(input) != 4 {
		return 0, false
	}
	var value uint16
	for _, char := range input {
		value <<= 4
		switch {
		case char >= '0' && char <= '9':
			value += uint16(char - '0')
		case char >= 'a' && char <= 'f':
			value += uint16(char-'a') + 10
		case char >= 'A' && char <= 'F':
			value += uint16(char-'A') + 10
		default:
			return 0, false
		}
	}
	return value, true
}

func collectJSONTreeCandidates(
	value any,
	pointer string,
	source string,
	sourceDigest string,
	out *[]candidate,
) error {
	if !isJSONContainer(value) {
		return nil
	}

	entries := jsonEntries(value)
	childPointers := make([]string, 0, len(entries))
	leafValues := []string{}
	for _, entry := range entries {
		child := jsonChildPointer(pointer, entry.key)
		childPointers = append(childPointers, child)
		if !isJSONContainer(entry.value) {
			canonical, err := canonicalJSON(entry.value)
			if err != nil {
				return err
			}
			leafValues = append(
				leafValues,
				child+"="+canonical,
			)
		}
	}

	nodeType := "object"
	if _, ok := value.([]any); ok {
		nodeType = "array"
	}
	claims := []claim{
		{
			Aspect: "structural-path", Value: pointer,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "json-pointer",
		},
		{
			Aspect: "node-type", Value: nodeType,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "json-container-type",
		},
		{
			Aspect: "children", Value: childPointers,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "json-parent-child",
		},
	}
	if len(leafValues) > 0 {
		claims = append(claims, claim{
			Aspect: "leaf-values", Value: leafValues,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "json-scalar-child",
		})
	}

	canonical, err := canonicalJSON(value)
	if err != nil {
		return err
	}
	sum := sha256.Sum256([]byte(canonical))
	pathValue := pointer
	*out = append(*out, candidate{
		Kind: "tree",
		Locator: locator{
			Source:         source,
			SourceDigest:   sourceDigest,
			StructuralPath: &pathValue,
		},
		Status: "observed", Execution: "deterministic", Method: "M0",
		Claims: claims,
		Provenance: provenance{
			Algorithm: "mmi.json-tree-adapter",
			Run: deterministicRun{
				Execution:   "deterministic",
				InputDigest: sourceDigest,
				Config: map[string]any{
					"format":         "json",
					"objectKeyOrder": "lexicographic",
				},
				ImplementationVersion: "3",
			},
		},
		Fingerprint: fingerprint{
			Algorithm:      "sha256",
			Representation: "json-subtree-canonical-v1",
			Digest: "sha256:" + hex.EncodeToString(sum[:]),
		},
		Scores: []any{},
	})

	for _, entry := range entries {
		if isJSONContainer(entry.value) {
			if err := collectJSONTreeCandidates(
				entry.value,
				jsonChildPointer(pointer, entry.key),
				source,
				sourceDigest,
				out,
			); err != nil {
				return err
			}
		}
	}
	return nil
}

type jsonEntry struct {
	key   string
	value any
}

func jsonEntries(value any) []jsonEntry {
	switch current := value.(type) {
	case []any:
		entries := make([]jsonEntry, 0, len(current))
		for index, child := range current {
			entries = append(entries, jsonEntry{
				key:   fmt.Sprint(index),
				value: child,
			})
		}
		return entries
	case map[string]any:
		keys := make([]string, 0, len(current))
		for key := range current {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(left, right int) bool {
			return utf16Less(keys[left], keys[right])
		})
		entries := make([]jsonEntry, 0, len(keys))
		for _, key := range keys {
			entries = append(entries, jsonEntry{
				key:   key,
				value: current[key],
			})
		}
		return entries
	default:
		return nil
	}
}

func isJSONContainer(value any) bool {
	switch value.(type) {
	case []any, map[string]any:
		return true
	default:
		return false
	}
}

func jsonPointerToken(value string) string {
	return strings.ReplaceAll(
		strings.ReplaceAll(value, "~", "~0"),
		"/",
		"~1",
	)
}

func jsonChildPointer(parent, token string) string {
	return parent + "/" + jsonPointerToken(token)
}

func canonicalJSON(value any) (string, error) {
	switch current := value.(type) {
	case nil, bool, string:
		return marshalJSONNoHTML(current)
	case float64:
		if math.IsNaN(current) || math.IsInf(current, 0) {
			return "", errors.New("Structured Tree numbers must be finite")
		}
		if math.Trunc(current) == current &&
			math.Abs(current) > float64(maxSafeInteger) {
			return "", errors.New(
				"Structured Tree integers must be within the JavaScript safe-integer range",
			)
		}
		if current == 0 {
			return "0", nil
		}
		return marshalJSONNoHTML(current)
	case []any:
		parts := make([]string, 0, len(current))
		for _, child := range current {
			rendered, err := canonicalJSON(child)
			if err != nil {
				return "", err
			}
			parts = append(parts, rendered)
		}
		return "[" + strings.Join(parts, ",") + "]", nil
	case map[string]any:
		keys := make([]string, 0, len(current))
		for key := range current {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(left, right int) bool {
			return utf16Less(keys[left], keys[right])
		})
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			renderedKey, err := marshalJSONNoHTML(key)
			if err != nil {
				return "", err
			}
			renderedValue, err := canonicalJSON(current[key])
			if err != nil {
				return "", err
			}
			parts = append(
				parts,
				renderedKey+":"+renderedValue,
			)
		}
		return "{" + strings.Join(parts, ",") + "}", nil
	default:
		return "", fmt.Errorf(
			"unsupported JSON value type: %T",
			value,
		)
	}
}

func marshalJSONNoHTML(value any) (string, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return "", err
	}
	rendered := strings.TrimSuffix(buffer.String(), "\n")
	rendered = strings.ReplaceAll(rendered, "\\u2028", " ")
	rendered = strings.ReplaceAll(rendered, "\\u2029", " ")
	return rendered, nil
}

func utf16Less(left, right string) bool {
	leftUnits := utf16.Encode([]rune(left))
	rightUnits := utf16.Encode([]rune(right))
	limit := len(leftUnits)
	if len(rightUnits) < limit {
		limit = len(rightUnits)
	}
	for index := 0; index < limit; index++ {
		if leftUnits[index] == rightUnits[index] {
			continue
		}
		return leftUnits[index] < rightUnits[index]
	}
	return len(leftUnits) < len(rightUnits)
}

func ensureEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err == io.EOF {
		return nil
	}
	return errors.New("request JSON must contain exactly one value")
}

func parseCSV(contents string) ([][]string, error) {
	text := strings.TrimPrefix(contents, "\uFEFF")
	if text == "" {
		return [][]string{}, nil
	}
	runes := []rune(text)
	rows := [][]string{}
	row := []string{}
	var field strings.Builder
	fieldQuoted := false
	inQuotes := false

	flushField := func() {
		value := field.String()
		if !fieldQuoted {
			value = strings.TrimSpace(value)
		}
		row = append(row, value)
		field.Reset()
		fieldQuoted = false
	}
	flushRow := func() {
		flushField()
		rows = append(rows, row)
		row = []string{}
	}

	for i := 0; i < len(runes); i++ {
		ch := runes[i]
		if inQuotes {
			if ch == '"' {
				if i+1 < len(runes) && runes[i+1] == '"' {
					field.WriteRune('"')
					i++
				} else {
					inQuotes = false
				}
			} else {
				field.WriteRune(ch)
			}
			continue
		}
		if ch == '"' && field.Len() == 0 && !fieldQuoted {
			inQuotes = true
			fieldQuoted = true
			continue
		}
		switch ch {
		case ',':
			flushField()
		case '\r':
			// CRLF is completed by the following LF. Standalone CR is
			// tolerated and ignored to preserve the TypeScript profile.
		case '\n':
			flushRow()
		default:
			field.WriteRune(ch)
		}
	}
	if inQuotes {
		return nil, errors.New("unterminated quoted CSV field")
	}
	// A final LF terminates the record already flushed in the loop. Do not
	// invent another blank row. Repeated LFs still preserve the blank records
	// between them, matching the TypeScript source-coordinate contract.
	if !strings.HasSuffix(text, "\n") {
		flushRow()
	}
	return rows, nil
}

func detectRegions(rows [][]string, maxScan int64) []region {
	if len(rows) == 0 {
		return []region{}
	}
	width := 0
	for _, row := range rows {
		if len(row) > width {
			width = len(row)
		}
	}
	if width == 0 {
		return []region{}
	}
	maxRows := maxScan / int64(width)
	if maxRows < 1 {
		maxRows = 1
	}
	lastRow := len(rows) - 1
	truncated := false
	if maxRows <= int64(lastRow) {
		lastRow = int(maxRows - 1)
		truncated = true
	}

	occupied := map[int]map[int]bool{}
	for r := 0; r <= lastRow; r++ {
		for c := 0; c < width; c++ {
			if strings.TrimSpace(cell(rows, r, c)) != "" {
				if occupied[r] == nil {
					occupied[r] = map[int]bool{}
				}
				occupied[r][c] = true
			}
		}
	}
	blocks := findBlocks(occupied)
	consumed := map[int]bool{}
	titleFor := map[int]int{}

	for ci, candidate := range blocks {
		if candidate.top != candidate.bottom {
			continue
		}
		cells := occupiedCellsIn(occupied, candidate)
		if len(cells) != 1 {
			continue
		}
		for oi, other := range blocks {
			if oi == ci {
				continue
			}
			if other.top > candidate.bottom &&
				other.top-candidate.bottom <= 2 &&
				other.left <= candidate.right &&
				other.right >= candidate.left {
				if _, exists := titleFor[oi]; !exists {
					titleFor[oi] = ci
					consumed[ci] = true
					break
				}
			}
		}
	}

	out := []region{}
	for bi, b := range blocks {
		if consumed[bi] {
			continue
		}
		top := b.top
		title := ""
		titleA1 := ""

		if ti, ok := titleFor[bi]; ok {
			tb := blocks[ti]
			cells := occupiedCellsIn(occupied, tb)
			col := tb.left
			if len(cells) > 0 {
				col = cells[0]
			}
			title = strings.TrimSpace(cell(rows, tb.top, col))
			titleA1 = a1(tb.top, col)
		} else if b.bottom > top && b.right > b.left {
			first := occupiedCellsInRow(occupied, top, b)
			second := occupiedCellsInRow(occupied, top+1, b)
			if len(first) == 1 && len(second) >= 2 {
				title = strings.TrimSpace(cell(rows, top, first[0]))
				titleA1 = a1(top, first[0])
				top++
			}
		}

		reasons := []string{}
		if b.splitByRow {
			reasons = append(reasons, "split-by-blank-row")
		}
		if b.splitByCol {
			reasons = append(reasons, "split-by-blank-column")
		}
		if truncated {
			reasons = append(reasons, "truncated-scan")
		}
		if b.bottom-top+1 == 1 {
			reasons = append(reasons, "single-row")
		}
		if b.right-b.left+1 == 1 {
			reasons = append(reasons, "single-column")
		}

		confidence, headers := classifyHeader(rows, top, b.bottom, b.left, b.right)
		if confidence == "uncertain" {
			reasons = append(reasons, "header-uncertain")
		}
		if confidence == "none" {
			reasons = append(reasons, "no-header")
		}

		out = append(out, region{
			top: top, bottom: b.bottom, left: b.left, right: b.right,
			a1: a1Range(top, b.left, b.bottom, b.right),
			title: title, titleA1: titleA1,
			headers: headers, headerConfidence: confidence, reasons: reasons,
		})
	}
	return out
}

func findBlocks(occupied map[int]map[int]bool) []block {
	rows := make([]int, 0, len(occupied))
	for r := range occupied {
		rows = append(rows, r)
	}
	sort.Ints(rows)
	bands := [][]int{}
	for _, r := range rows {
		if len(bands) > 0 {
			last := bands[len(bands)-1]
			if r == last[len(last)-1]+1 {
				bands[len(bands)-1] = append(last, r)
				continue
			}
		}
		bands = append(bands, []int{r})
	}
	multipleBands := len(bands) > 1
	blocks := []block{}
	for _, band := range bands {
		colSet := map[int]bool{}
		for _, r := range band {
			for c := range occupied[r] {
				colSet[c] = true
			}
		}
		cols := make([]int, 0, len(colSet))
		for c := range colSet {
			cols = append(cols, c)
		}
		sort.Ints(cols)
		groups := [][]int{}
		for _, c := range cols {
			if len(groups) > 0 {
				last := groups[len(groups)-1]
				if c == last[len(last)-1]+1 {
					groups[len(groups)-1] = append(last, c)
					continue
				}
			}
			groups = append(groups, []int{c})
		}
		for _, group := range groups {
			left, right := group[0], group[len(group)-1]
			inGroup := []int{}
			for _, r := range band {
				for c := range occupied[r] {
					if c >= left && c <= right {
						inGroup = append(inGroup, r)
						break
					}
				}
			}
			blocks = append(blocks, block{
				top: inGroup[0], bottom: inGroup[len(inGroup)-1],
				left: left, right: right,
				splitByRow: multipleBands, splitByCol: len(groups) > 1,
			})
		}
	}
	return blocks
}

func classifyHeader(rows [][]string, top, bottom, left, right int) (string, []string) {
	width := right-left+1
	texts := make([]string, width)
	populated := 0
	for c := left; c <= right; c++ {
		text := strings.TrimSpace(cell(rows, top, c))
		texts[c-left] = text
		if text != "" {
			populated++
		}
	}
	if bottom == top || populated < max(1, (width*6+9)/10) {
		return "none", nil
	}

	valuesRecur := false
	for c := left; c <= right; c++ {
		header := texts[c-left]
		for r := top+1; r <= bottom; r++ {
			value := strings.TrimSpace(cell(rows, r, c))
			if header != "" && value == header {
				valuesRecur = true
			}
		}
	}
	distinctSet := map[string]bool{}
	for _, text := range texts {
		if text != "" {
			distinctSet[text] = true
		}
	}
	distinct := len(distinctSet) == populated
	if distinct && !valuesRecur {
		return "likely", texts
	}
	return "uncertain", texts
}

func toCandidate(source, sourceDigest string, rows [][]string, r region, maxScan int64) candidate {
	claims := []claim{
		{
			Aspect: "location", Value: r.a1, Status: "observed",
			Execution: "deterministic", Method: "M0",
			ReasonCode: "source-cell-coordinates",
		},
	}
	ev := make([]evidence, 0, len(r.reasons))
	for _, reason := range r.reasons {
		ev = append(ev, evidence{Code: reason})
	}
	claims = append(claims, claim{
		Aspect: "boundary", Value: r.a1, Status: "inferred",
		Execution: "deterministic", Method: "M1",
		ReasonCode: "blank-row-column-regions", Evidence: &ev,
	})
	if r.title != "" {
		titleEvidence := []evidence{}
		if r.titleA1 != "" {
			titleEvidence = append(titleEvidence, evidence{Code: "title-cell", Detail: r.titleA1})
		}
		claims = append(claims, claim{
			Aspect: "title", Value: r.title, Status: "inferred",
			Execution: "deterministic", Method: "M1",
			ReasonCode: "title-above-block", Evidence: &titleEvidence,
		})
	}
	if r.headerConfidence == "likely" && r.headers != nil {
		claims = append(claims, claim{
			Aspect: "header", Value: r.headers, Status: "inferred",
			Execution: "deterministic", Method: "M1",
			ReasonCode: "header-rules-passed",
		})
	} else {
		reason := "no-header"
		if r.headerConfidence == "uncertain" {
			reason = "header-uncertain"
		}
		claims = append(claims, claim{
			Aspect: "header", Status: "abstained",
			Execution: "deterministic", Method: "M1",
			ReasonCode: reason,
		})
	}

	materialRows := []string{}
	for row := r.top; row <= r.bottom; row++ {
		values := []string{}
		for col := r.left; col <= r.right; col++ {
			values = append(values, cell(rows, row, col))
		}
		materialRows = append(materialRows, strings.Join(values, "\x1f"))
	}
	material := strings.Join(materialRows, "\x1e")
	fpSum := sha256.Sum256([]byte(material))
	reference := fmt.Sprintf("![[%s#Sheet1|%s", source, r.a1)
	if r.headerConfidence == "likely" && r.headers != nil {
		reference += "?header=first"
	}
	reference += "]]"

	return candidate{
		Kind: "table-range",
		Locator: locator{Source: source, SourceDigest: sourceDigest, Sheet: "Sheet1", Range: r.a1},
		Status: "inferred", Execution: "deterministic", Method: "M1",
		Claims: claims,
		Provenance: provenance{
			Algorithm: "mmi.table-region-detector",
			Run: deterministicRun{
				Execution: "deterministic", InputDigest: sourceDigest,
				Config: map[string]any{"maxScanCells": maxScan},
				ImplementationVersion: "1",
			},
		},
		Fingerprint: fingerprint{
			Algorithm: "sha256", Representation: "table-display-cells-v1",
			Digest: "sha256:" + hex.EncodeToString(fpSum[:]),
		},
		Scores: []any{},
		Reference: reference,
	}
}

func cell(rows [][]string, row, col int) string {
	if row < 0 || row >= len(rows) || col < 0 || col >= len(rows[row]) {
		return ""
	}
	return rows[row][col]
}

func occupiedCellsIn(occupied map[int]map[int]bool, b block) []int {
	out := []int{}
	for r := b.top; r <= b.bottom; r++ {
		for c := range occupied[r] {
			if c >= b.left && c <= b.right {
				out = append(out, c)
			}
		}
	}
	sort.Ints(out)
	return out
}

func occupiedCellsInRow(occupied map[int]map[int]bool, row int, b block) []int {
	out := []int{}
	for c := range occupied[row] {
		if c >= b.left && c <= b.right {
			out = append(out, c)
		}
	}
	sort.Ints(out)
	return out
}

func a1(row, col int) string {
	return columnName(col) + fmt.Sprint(row+1)
}

func a1Range(startRow, startCol, endRow, endCol int) string {
	start := a1(startRow, startCol)
	end := a1(endRow, endCol)
	if start == end {
		return start
	}
	return start + ":" + end
}

func columnName(index int) string {
	n := index + 1
	out := ""
	for n > 0 {
		rem := (n - 1) % 26
		out = string(rune('A'+rem)) + out
		n = (n - 1) / 26
	}
	return out
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func main() {
	var input []byte
	var err error
	switch len(os.Args) {
	case 1:
		input, err = io.ReadAll(os.Stdin)
	case 2:
		if os.Args[1] == "-" {
			input, err = io.ReadAll(os.Stdin)
		} else {
			input, err = os.ReadFile(os.Args[1])
		}
	default:
		fmt.Fprintln(os.Stderr, "usage: mmi-portable-go-minimum [request.json|-]")
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	output, err := run(input)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	os.Stdout.Write(output)
	os.Stdout.Write([]byte("\n"))
}

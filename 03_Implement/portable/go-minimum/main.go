package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"time"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/text/encoding/japanese"
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

type cellRange struct {
	startRow, startCol, endRow, endCol int
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
	if extension != ".csv" && extension != ".json" && extension != ".xml" && extension != ".xlsx" && extension != ".xlsm" {
		return nil, errors.New("go-minimum currently supports CSV, JSON, generic XML, and XLSX")
	}
	if (extension == ".json" || extension == ".xml") && !utf8.Valid(bytes) {
		return nil, errors.New("go-minimum CSV/JSON/XML profile currently supports UTF-8 only")
	}

	sum := sha256.Sum256(bytes)
	sourceDigest := "sha256:" + hex.EncodeToString(sum[:])

	var format string
	var candidates []candidate
	switch extension {
	case ".csv":
		format = "csv"
		text, err := decodeCSVBytes(bytes)
		if err != nil {
			return nil, err
		}
		rows, err := parseCSV(text)
		if err != nil {
			return nil, err
		}
		regions := detectRegions(rows, nil, maxScan)
		candidates = make([]candidate, 0, len(regions))
		for _, r := range regions {
			candidates = append(
				candidates,
				toCandidate(
					req.Source.Label,
					sourceDigest,
					"Sheet1",
					rows,
					r,
					nil,
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
	case ".xlsx", ".xlsm":
		if extension == ".xlsx" {
			format = "xlsx"
		} else {
			format = "xlsm"
		}
		sheets, err := parseXLSXSheets(bytes)
		if err != nil {
			return nil, err
		}
		candidates = make([]candidate, 0)
		for _, sh := range sheets {
			regions := detectRegions(sh.rows, sh.merges, maxScan)
			for _, r := range regions {
				candidates = append(
					candidates,
					toCandidate(
						req.Source.Label,
						sourceDigest,
						sh.name,
						sh.rows,
						r,
						sh.merges,
						maxScan,
					),
				)
			}
		}
	case ".xml":
		if isXMLSpreadsheet2003Bytes(bytes) {
			format = "xml-spreadsheet"
			sheets, err := parseXMLSpreadsheet2003Sheets(bytes)
			if err != nil {
				return nil, err
			}
			candidates = make([]candidate, 0)
			for _, sh := range sheets {
				regions := detectRegions(sh.rows, sh.merges, maxScan)
				for _, r := range regions {
					candidates = append(
						candidates,
						toCandidate(
							req.Source.Label,
							sourceDigest,
							sh.name,
							sh.rows,
							r,
							sh.merges,
							maxScan,
						),
					)
				}
			}
			if len(candidates) == 0 {
				candidates = []candidate{}
			}
		} else {
			format = "xml"
			candidates, err = xmlTreeCandidates(
				bytes,
				req.Source.Label,
				sourceDigest,
			)
			if err != nil {
				return nil, err
			}
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

type xmlAttribute struct {
	name  string
	value string
}

type xmlContent struct {
	text    *string
	element *xmlElement
}

type xmlElement struct {
	name       string
	attributes []xmlAttribute
	content    []xmlContent
}

type xmlFrame struct {
	element    xmlElement
	namespaces map[string]string
}

func isXMLSpreadsheet2003Bytes(input []byte) bool {
	return bytes.Contains(
		input,
		[]byte(`<?mso-application progid="Excel.Sheet"?>`),
	) || bytes.Contains(
		input,
		[]byte("urn:schemas-microsoft-com:office:spreadsheet"),
	)
}

func xmlTreeCandidates(
	input []byte,
	source string,
	sourceDigest string,
) ([]candidate, error) {
	root, err := parseGenericXML(input)
	if err != nil {
		return nil, err
	}
	out := []candidate{}
	if err := collectXMLTreeCandidates(
		root,
		xmlPathFor("", root.name, 1),
		source,
		sourceDigest,
		&out,
	); err != nil {
		return nil, err
	}
	return out, nil
}

func parseGenericXML(input []byte) (*xmlElement, error) {
	text := strings.TrimPrefix(string(input), "\ufeff")
	decoder := xml.NewDecoder(strings.NewReader(text))
	stack := []xmlFrame{}
	var root *xmlElement

	for {
		token, err := decoder.RawToken()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("invalid XML source: %w", err)
		}

		switch current := token.(type) {
		case xml.ProcInst:
			if strings.EqualFold(current.Target, "xml") {
				if encoding := xmlDeclarationEncoding(string(current.Inst)); encoding != "" &&
					!strings.EqualFold(strings.ReplaceAll(encoding, "-", ""), "utf8") {
					return nil, fmt.Errorf(
						"generic XML Tree sources must declare UTF-8, not %s",
						encoding,
					)
				}
			}
		case xml.Directive:
			return nil, errors.New(
				"DTD/declaration syntax is not supported for deterministic XML Tree extraction",
			)
		case xml.StartElement:
			parentNamespaces := map[string]string{
				"xml": "http://www.w3.org/XML/1998/namespace",
			}
			if len(stack) > 0 {
				parentNamespaces = cloneStringMap(
					stack[len(stack)-1].namespaces,
				)
			}
			attributes := make([]xmlAttribute, 0, len(current.Attr))
			seenAttributes := map[string]bool{}

			// Namespace declarations apply to the element and all attributes on
			// the same start tag. RawToken preserves the original prefixes.
			for _, attribute := range current.Attr {
				name := xmlQualifiedName(attribute.Name)
				if attribute.Name.Space == "xmlns" {
					if attribute.Name.Local == "xmlns" {
						return nil, errors.New(
							"the xmlns prefix cannot be redeclared",
						)
					}
					if attribute.Name.Local == "xml" &&
						attribute.Value != "http://www.w3.org/XML/1998/namespace" {
						return nil, errors.New(
							"the xml prefix must use its reserved namespace URI",
						)
					}
					parentNamespaces[attribute.Name.Local] = attribute.Value
				} else if attribute.Name.Space == "" &&
					attribute.Name.Local == "xmlns" {
					parentNamespaces[""] = attribute.Value
				}
				if seenAttributes[name] {
					return nil, fmt.Errorf(
						"duplicate XML attribute: %s",
						name,
					)
				}
				seenAttributes[name] = true
				attributes = append(attributes, xmlAttribute{
					name:  name,
					value: attribute.Value,
				})
			}

			name := xmlQualifiedName(current.Name)
			if current.Name.Space != "" &&
				current.Name.Space != "xml" &&
				parentNamespaces[current.Name.Space] == "" {
				return nil, fmt.Errorf(
					"undeclared XML namespace prefix: %s",
					current.Name.Space,
				)
			}
			for _, attribute := range current.Attr {
				if attribute.Name.Space != "" &&
					attribute.Name.Space != "xmlns" &&
					attribute.Name.Space != "xml" &&
					parentNamespaces[attribute.Name.Space] == "" {
					return nil, fmt.Errorf(
						"undeclared XML namespace prefix: %s",
						attribute.Name.Space,
					)
				}
			}

			stack = append(stack, xmlFrame{
				element: xmlElement{
					name:       name,
					attributes: attributes,
					content:    []xmlContent{},
				},
				namespaces: parentNamespaces,
			})
		case xml.CharData:
			value := string(current)
			if value == "" {
				continue
			}
			if len(stack) == 0 {
				if strings.TrimSpace(value) != "" {
					return nil, errors.New(
						"text is not allowed outside the XML document element",
					)
				}
				continue
			}
			copyValue := value
			top := &stack[len(stack)-1]
			top.element.content = append(
				top.element.content,
				xmlContent{text: &copyValue},
			)
		case xml.EndElement:
			if len(stack) == 0 {
				return nil, fmt.Errorf(
					"unexpected XML closing tag: %s",
					xmlQualifiedName(current.Name),
				)
			}
			index := len(stack) - 1
			frame := stack[index]
			stack = stack[:index]
			name := xmlQualifiedName(current.Name)
			if frame.element.name != name {
				return nil, fmt.Errorf(
					"mismatched XML closing tag: %s",
					name,
				)
			}
			element := frame.element
			if len(stack) > 0 {
				parent := &stack[len(stack)-1]
				parent.element.content = append(
					parent.element.content,
					xmlContent{element: &element},
				)
			} else if root == nil {
				root = &element
			} else {
				return nil, errors.New(
					"XML document contains multiple root elements",
				)
			}
		}
	}

	if len(stack) != 0 {
		return nil, errors.New("XML document contains unclosed elements")
	}
	if root == nil {
		return nil, errors.New("XML document has no root element")
	}
	return root, nil
}

func xmlDeclarationEncoding(instruction string) string {
	lower := strings.ToLower(instruction)
	index := strings.Index(lower, "encoding")
	if index < 0 {
		return ""
	}
	rest := instruction[index+len("encoding"):]
	rest = strings.TrimLeft(rest, " \t\r\n")
	if len(rest) == 0 || rest[0] != '=' {
		return ""
	}
	rest = strings.TrimLeft(rest[1:], " \t\r\n")
	if len(rest) < 2 || (rest[0] != '"' && rest[0] != '\'') {
		return ""
	}
	quote := rest[0]
	end := strings.IndexByte(rest[1:], quote)
	if end < 0 {
		return ""
	}
	return rest[1 : end+1]
}

func xmlQualifiedName(name xml.Name) string {
	if name.Space == "" {
		return name.Local
	}
	return name.Space + ":" + name.Local
}

func cloneStringMap(input map[string]string) map[string]string {
	out := make(map[string]string, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func xmlPathFor(parent, name string, ordinal int) string {
	return fmt.Sprintf("%s/%s[%d]", parent, name, ordinal)
}

func collectXMLTreeCandidates(
	element *xmlElement,
	path string,
	source string,
	sourceDigest string,
	out *[]candidate,
) error {
	children := []*xmlElement{}
	for _, item := range element.content {
		if item.element != nil {
			children = append(children, item.element)
		}
	}
	siblingCounts := map[string]int{}
	childPaths := make([]string, 0, len(children))
	for _, child := range children {
		siblingCounts[child.name]++
		childPaths = append(
			childPaths,
			xmlPathFor(path, child.name, siblingCounts[child.name]),
		)
	}

	attributes := append([]xmlAttribute(nil), element.attributes...)
	sort.Slice(attributes, func(left, right int) bool {
		return utf16Less(attributes[left].name, attributes[right].name)
	})
	attributeValues := make([]string, 0, len(attributes))
	for _, attribute := range attributes {
		rendered, err := marshalJSONNoHTML(attribute.value)
		if err != nil {
			return err
		}
		attributeValues = append(
			attributeValues,
			"@"+attribute.name+"="+rendered,
		)
	}

	textValues := []string{}
	for _, item := range element.content {
		if item.text != nil && strings.TrimSpace(*item.text) != "" {
			textValues = append(textValues, *item.text)
		}
	}

	claims := []claim{
		{
			Aspect: "structural-path", Value: path,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "xml-element-path",
		},
		{
			Aspect: "node-type", Value: "element",
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "xml-element",
		},
		{
			Aspect: "element-name", Value: element.name,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "xml-qualified-name",
		},
		{
			Aspect: "children", Value: childPaths,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "xml-parent-child",
		},
	}
	if len(attributeValues) > 0 {
		claims = append(claims, claim{
			Aspect: "attributes", Value: attributeValues,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "xml-attributes",
		})
	}
	if len(textValues) > 0 {
		claims = append(claims, claim{
			Aspect: "text", Value: textValues,
			Status: "observed", Execution: "deterministic",
			Method: "M0", ReasonCode: "xml-text",
		})
	}

	canonical, err := canonicalXMLElement(element)
	if err != nil {
		return err
	}
	sum := sha256.Sum256([]byte(canonical))
	pathValue := path
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
			Algorithm: "mmi.xml-tree-adapter",
			Run: deterministicRun{
				Execution:   "deterministic",
				InputDigest: sourceDigest,
				Config: map[string]any{
					"format": "xml",
					"path":   "qualified-name-sibling-index-v1",
					"dtd":    "rejected",
				},
				ImplementationVersion: "2",
			},
		},
		Fingerprint: fingerprint{
			Algorithm:      "sha256",
			Representation: "xml-subtree-canonical-v1",
			Digest:         "sha256:" + hex.EncodeToString(sum[:]),
		},
		Scores: []any{},
	})

	for index, child := range children {
		if err := collectXMLTreeCandidates(
			child,
			childPaths[index],
			source,
			sourceDigest,
			out,
		); err != nil {
			return err
		}
	}
	return nil
}

func canonicalXMLElement(element *xmlElement) (string, error) {
	name, err := marshalJSONNoHTML(element.name)
	if err != nil {
		return "", err
	}

	attributes := append([]xmlAttribute(nil), element.attributes...)
	sort.Slice(attributes, func(left, right int) bool {
		return utf16Less(attributes[left].name, attributes[right].name)
	})
	attributeParts := make([]string, 0, len(attributes))
	for _, attribute := range attributes {
		key, err := marshalJSONNoHTML(attribute.name)
		if err != nil {
			return "", err
		}
		value, err := marshalJSONNoHTML(attribute.value)
		if err != nil {
			return "", err
		}
		attributeParts = append(
			attributeParts,
			"["+key+","+value+"]",
		)
	}

	contentParts := make([]string, 0, len(element.content))
	for _, item := range element.content {
		if item.text != nil {
			value, err := marshalJSONNoHTML(*item.text)
			if err != nil {
				return "", err
			}
			contentParts = append(
				contentParts,
				`["text",`+value+`]`,
			)
			continue
		}
		child, err := canonicalXMLElement(item.element)
		if err != nil {
			return "", err
		}
		value, err := marshalJSONNoHTML(child)
		if err != nil {
			return "", err
		}
		contentParts = append(
			contentParts,
			`["element",`+value+`]`,
		)
	}

	return `{"name":` + name +
		`,"attributes":[` + strings.Join(attributeParts, ",") +
		`],"content":[` + strings.Join(contentParts, ",") +
		`]}`, nil
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

func decodeCSVBytes(bytes []byte) (string, error) {
	// UTF-16 BOM rejection (matches TS workbookLoader.decodeCsv).
	if len(bytes) >= 2 && (bytes[0] == 0xff && bytes[1] == 0xfe || bytes[0] == 0xfe && bytes[1] == 0xff) {
		return "", errors.New("csvUtf16")
	}
	hasUtf8Bom := len(bytes) >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf
	// Try UTF-8 first.
	if utf8.Valid(bytes) {
		return string(bytes), nil
	}
	if hasUtf8Bom {
		return "", errors.New("csvInvalidUtf8")
	}
	// Fall back to shift_jis (CP932 / Windows-31J), matching TS TextDecoder('shift_jis').
	dec := japanese.ShiftJIS.NewDecoder()
	out, err := dec.Bytes(bytes)
	if err != nil {
		return "", errors.New("csvUnreadableEncoding")
	}
	// Ensure the result is valid UTF-8.
	if !utf8.Valid(out) {
		return "", errors.New("csvUnreadableEncoding")
	}
	return string(out), nil
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

type xlsxSheet struct {
	name   string
	rows   [][]string
	merges []cellRange
}

type xmlSpreadsheetSheet struct {
	name string
	rows [][]string
}

// XML Spreadsheet 2003 structs for struct-based unmarshaling.
type xmlSSWorkbook struct {
	XMLName    xml.Name          `xml:"Workbook"`
	Worksheets []xmlSSWorksheet  `xml:"Worksheet"`
}
type xmlSSWorksheet struct {
	Name  string       `xml:"Name,attr"`
	Table xmlSSTable   `xml:"Table"`
}
type xmlSSTable struct {
	Rows []xmlSSRow `xml:"Row"`
}
type xmlSSRow struct {
	Cells []xmlSSCell `xml:"Cell"`
}
type xmlSSCell struct {
	Data xmlSSData `xml:"Data"`
}
type xmlSSData struct {
	Type string `xml:"Type,attr"`
	Text string `xml:",chardata"`
}

func parseXMLSpreadsheet2003Sheets(data []byte) ([]xlsxSheet, error) {
	var wb xmlSSWorkbook
	if err := xml.Unmarshal(data, &wb); err != nil {
		return nil, fmt.Errorf("invalid XML Spreadsheet 2003: %w", err)
	}
	result := []xlsxSheet{}
	for _, ws := range wb.Worksheets {
		name := ws.Name
		if name == "" {
			name = fmt.Sprintf("Sheet%d", len(result)+1)
		}
		rows := [][]string{}
		for _, row := range ws.Table.Rows {
			cells := []string{}
			for _, cell := range row.Cells {
				val := strings.TrimSpace(cell.Data.Text)
				cells = append(cells, val)
			}
			// pad? keep as-is (detectRegions handles ragged rows via cell())
			rows = append(rows, cells)
		}
		if len(rows) == 0 {
			rows = [][]string{}
		}
		result = append(result, xlsxSheet{name: name, rows: rows, merges: nil})
	}
	if len(result) == 0 {
		result = append(result, xlsxSheet{name: "Sheet1", rows: [][]string{}, merges: nil})
	}
	return result, nil
}


// parseXLSXStyles parses xl/styles.xml and returns numFmtId per cellXfs index
// and custom format codes. Provisional implementation for #506.
func parseXLSXStyles(reader *zip.Reader) (map[int]int, map[int]string) {
	xfNumFmt := map[int]int{}
	numFmts := map[int]string{}
	builtin := map[int]string{
		0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00",
		9: "0%", 10: "0.00%", 14: "mm-dd-yy", 15: "d-mmm-yy",
		16: "d-mmm", 17: "mmm-yy", 22: "m/d/yy h:mm", 49: "@",
	}
	for k, v := range builtin {
		numFmts[k] = v
	}
	for _, f := range reader.File {
		if f.Name != "xl/styles.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		dec := xml.NewDecoder(rc)
		inCellXfs := false
		inNumFmts := false
		xfIndex := 0
		for {
			tok, err := dec.Token()
			if err != nil {
				break
			}
			switch v := tok.(type) {
			case xml.StartElement:
				switch v.Name.Local {
				case "numFmts":
					inNumFmts = true
				case "numFmt":
					if inNumFmts {
						var id int
						var code string
						for _, a := range v.Attr {
							if a.Name.Local == "numFmtId" {
								id, _ = strconv.Atoi(a.Value)
							}
							if a.Name.Local == "formatCode" {
								code = a.Value
							}
						}
						if code != "" {
							numFmts[id] = code
						}
					}
				case "cellXfs":
					inCellXfs = true
				case "xf":
					if inCellXfs {
						numFmtId := 0
						for _, a := range v.Attr {
							if a.Name.Local == "numFmtId" {
								numFmtId, _ = strconv.Atoi(a.Value)
							}
						}
						xfNumFmt[xfIndex] = numFmtId
						xfIndex++
					}
				}
			case xml.EndElement:
				switch v.Name.Local {
				case "numFmts":
					inNumFmts = false
				case "cellXfs":
					inCellXfs = false
				}
			}
		}
		rc.Close()
	}
	return xfNumFmt, numFmts
}

// applyNumberFormat applies a basic Excel number format to a raw value.
// Provisional: handles General, integers, decimals, and date serials.
func applyNumberFormat(raw, formatCode string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || formatCode == "" || formatCode == "General" || formatCode == "@" {
		return raw
	}
	lower := strings.ToLower(formatCode)
	isDate := strings.ContainsAny(lower, "ydh")
	if isDate {
		var serial float64
		if _, err := fmt.Sscanf(raw, "%f", &serial); err != nil {
			return raw
		}
		var days int
		if serial >= 60 && serial < 61 {
			days = 60
		} else if serial > 60 {
			days = int(serial)
		} else {
			days = int(serial) + 1
		}
		tt := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC).AddDate(0, 0, days)
		frac := serial - float64(int(serial))
		hour, minute, second := 0, 0, 0
		if frac > 0 {
			totalSec := int(frac * 86400)
			hour = totalSec / 3600
			minute = (totalSec % 3600) / 60
			second = totalSec % 60
		}
		result := ""
		i := 0
		for i < len(formatCode) {
			if i+4 <= len(formatCode) && formatCode[i:i+4] == "yyyy" {
				result += fmt.Sprintf("%04d", tt.Year())
				i += 4
				continue
			}
			if i+2 <= len(formatCode) && formatCode[i:i+2] == "yy" {
				result += fmt.Sprintf("%02d", tt.Year()%100)
				i += 2
				continue
			}
			if i+2 <= len(formatCode) && formatCode[i:i+2] == "mm" {
				result += fmt.Sprintf("%02d", tt.Month())
				i += 2
				continue
			}
			if i < len(formatCode) && formatCode[i] == 'm' {
				result += fmt.Sprintf("%d", tt.Month())
				i++
				continue
			}
			if i+2 <= len(formatCode) && formatCode[i:i+2] == "dd" {
				result += fmt.Sprintf("%02d", tt.Day())
				i += 2
				continue
			}
			if i < len(formatCode) && formatCode[i] == 'd' {
				result += fmt.Sprintf("%d", tt.Day())
				i++
				continue
			}
			if i+2 <= len(formatCode) && formatCode[i:i+2] == "hh" {
				result += fmt.Sprintf("%02d", hour)
				i += 2
				continue
			}
			if i < len(formatCode) && formatCode[i] == 'h' {
				result += fmt.Sprintf("%d", hour)
				i++
				continue
			}
			if i+2 <= len(formatCode) && formatCode[i:i+2] == "ss" {
				result += fmt.Sprintf("%02d", second)
				i += 2
				continue
			}
			if i < len(formatCode) && formatCode[i] == 's' {
				result += fmt.Sprintf("%d", second)
				i++
				continue
			}
			result += string(formatCode[i])
			i++
		}
		if result == formatCode {
			if frac > 0 {
				return fmt.Sprintf("%04d-%02d-%02d %02d:%02d:%02d", tt.Year(), tt.Month(), tt.Day(), hour, minute, second)
			}
			return fmt.Sprintf("%04d-%02d-%02d", tt.Year(), tt.Month(), tt.Day())
		}
		return result
	}

	// Number formatting: count decimal places
	if strings.Contains(formatCode, ".") {
		parts := strings.SplitN(formatCode, ".", 2)
		decimals := 0
		for _, ch := range parts[1] {
			if ch == '0' || ch == '#' {
				decimals++
			} else {
				break
			}
		}
		var val float64
		if _, err := fmt.Sscanf(raw, "%f", &val); err != nil {
			return raw
		}
		return fmt.Sprintf("%.*f", decimals, val)
	}
	return raw
}

func parseXLSXSheets(data []byte) ([]xlsxSheet, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("xlsx is not a zip archive: %w", err)
	}

	// Parse styles for number format application.
	xfNumFmt, numFmts := parseXLSXStyles(reader)

	// Read shared strings.
	shared := []string{}
	for _, f := range reader.File {
		if f.Name != "xl/sharedStrings.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		dec := xml.NewDecoder(rc)
		for {
			tok, err := dec.Token()
			if err != nil {
				break
			}
			se, ok := tok.(xml.StartElement)
			if !ok || se.Name.Local != "si" {
				continue
			}
			var b strings.Builder
			depth := 1
			for depth > 0 {
				tok2, err := dec.Token()
				if err != nil {
					break
				}
				switch v := tok2.(type) {
				case xml.StartElement:
					depth++
					if v.Name.Local == "t" {
						var s string
						if err := dec.DecodeElement(&s, &v); err == nil {
							b.WriteString(s)
						}
						depth--
					}
				case xml.EndElement:
					depth--
				}
			}
			shared = append(shared, b.String())
		}
		rc.Close()
	}

	// Determine sheet list (name + target path) from workbook.xml + rels.
	type sheetInfo struct {
		name   string
		target string
	}
	sheets := []sheetInfo{}
	// rels map: rId -> target
	rels := map[string]string{}
	for _, f := range reader.File {
		if f.Name != "xl/_rels/workbook.xml.rels" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		dec := xml.NewDecoder(rc)
		for {
			tok, err := dec.Token()
			if err != nil {
				break
			}
			se, ok := tok.(xml.StartElement)
			if !ok || se.Name.Local != "Relationship" {
				continue
			}
			var id, target string
			for _, a := range se.Attr {
				if a.Name.Local == "Id" {
					id = a.Value
				}
				if a.Name.Local == "Target" {
					target = a.Value
				}
			}
			if id != "" && target != "" {
				// target may be relative to xl/
				if !strings.HasPrefix(target, "/") {
					target = "xl/" + strings.TrimPrefix(target, "./")
				} else {
					target = strings.TrimPrefix(target, "/")
				}
				rels[id] = target
			}
		}
		rc.Close()
	}
	// parse workbook.xml
	for _, f := range reader.File {
		if f.Name != "xl/workbook.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		dec := xml.NewDecoder(rc)
		for {
			tok, err := dec.Token()
			if err != nil {
				break
			}
			se, ok := tok.(xml.StartElement)
			if !ok || se.Name.Local != "sheet" {
				continue
			}
			var name, rid string
			for _, a := range se.Attr {
				if a.Name.Local == "name" {
					name = a.Value
				}
				if a.Name.Local == "id" || a.Name.Space != "" {
					// r:id
					if strings.HasSuffix(a.Name.Local, "id") || a.Name.Local == "id" {
						rid = a.Value
					}
				}
			}
			// r:id is in the r namespace; handle by local name "id"
			for _, a := range se.Attr {
				if a.Name.Local == "id" {
					rid = a.Value
				}
			}
			if name == "" {
				name = fmt.Sprintf("Sheet%d", len(sheets)+1)
			}
			target := ""
			if rid != "" {
				target = rels[rid]
			}
			if target == "" {
				// fallback: xl/worksheets/sheetN.xml
				target = fmt.Sprintf("xl/worksheets/sheet%d.xml", len(sheets)+1)
			}
			sheets = append(sheets, sheetInfo{name: name, target: target})
		}
		rc.Close()
	}
	// fallback if no workbook.xml parsed
	if len(sheets) == 0 {
		sheets = append(sheets, sheetInfo{name: "Sheet1", target: "xl/worksheets/sheet1.xml"})
	}

	// Parse each sheet.
	result := []xlsxSheet{}
	for _, sh := range sheets {
		var sheetFile *zip.File
		for _, f := range reader.File {
			if f.Name == sh.target {
				sheetFile = f
				break
			}
		}
		if sheetFile == nil {
			// try sheet1.xml
			for _, f := range reader.File {
				if strings.HasPrefix(f.Name, "xl/worksheets/sheet") && strings.HasSuffix(f.Name, ".xml") {
					// pick by index not already used; simple: first available
					sheetFile = f
					break
				}
			}
		}
		if sheetFile == nil {
			continue
		}
		rc, err := sheetFile.Open()
		if err != nil {
			continue
		}
		rows := map[int]map[int]string{}
		maxRow, maxCol := 0, 0
		dec := xml.NewDecoder(rc)
		var merges []cellRange
		for {
			tok, err := dec.Token()
			if err != nil {
				break
			}
			se, ok := tok.(xml.StartElement)
			if !ok {
				continue
			}
			if se.Name.Local == "mergeCell" {
				var ref string
				for _, a := range se.Attr {
					if a.Name.Local == "ref" {
						ref = a.Value
					}
				}
				if ref != "" {
					// parse ref like "A1:C1" or "A1"
					parts := strings.Split(ref, ":")
					if len(parts) == 1 {
						parts = append(parts, parts[0])
					}
					r1, c1 := parseCellRef(parts[0])
					r2, c2 := parseCellRef(parts[1])
					if r1 > 0 && c1 > 0 && r2 > 0 && c2 > 0 {
						merges = append(merges, cellRange{startRow: r1 - 1, startCol: c1 - 1, endRow: r2 - 1, endCol: c2 - 1})
					}
				}
				continue
			}
			if se.Name.Local != "c" {
				continue
			}
			var ref, t string
			styleIdx := -1
			for _, a := range se.Attr {
				if a.Name.Local == "r" {
					ref = a.Value
				}
				if a.Name.Local == "t" {
					t = a.Value
				}
				if a.Name.Local == "s" {
					styleIdx, _ = strconv.Atoi(a.Value)
				}
			}
			var v, isText string
			depth := 1
			for depth > 0 {
				tok2, err := dec.Token()
				if err != nil {
					break
				}
				switch v2 := tok2.(type) {
				case xml.StartElement:
					depth++
					if v2.Name.Local == "v" {
						var s string
						if err := dec.DecodeElement(&s, &v2); err == nil {
							v = s
						}
						depth--
					} else if v2.Name.Local == "t" {
						var s string
						if err := dec.DecodeElement(&s, &v2); err == nil {
							isText = s
						}
						depth--
					} else if v2.Name.Local == "is" {
						innerDepth := 1
						for innerDepth > 0 {
							tok3, err := dec.Token()
							if err != nil {
								break
							}
							switch v3 := tok3.(type) {
							case xml.StartElement:
								innerDepth++
								if v3.Name.Local == "t" {
									var s string
									if err := dec.DecodeElement(&s, &v3); err == nil {
										isText += s
									}
									innerDepth--
								}
							case xml.EndElement:
								innerDepth--
							}
						}
						depth--
					}
				case xml.EndElement:
					depth--
				}
			}
			rowNum, colNum := parseCellRef(ref)
			if rowNum <= 0 || colNum <= 0 {
				continue
			}
			if rowNum > maxRow {
				maxRow = rowNum
			}
			if colNum > maxCol {
				maxCol = colNum
			}
			if rows[rowNum] == nil {
				rows[rowNum] = map[int]string{}
			}
			var value string
			switch t {
			case "s":
				idx, _ := strconv.Atoi(v)
				if idx >= 0 && idx < len(shared) {
					value = shared[idx]
				}
			case "inlineStr":
				value = isText
			default:
				value = v
			}
			// Apply number format if a style is present.
			if styleIdx >= 0 && xfNumFmt != nil {
				numFmtId, ok := xfNumFmt[styleIdx]
				if ok {
					formatCode := ""
					if numFmts != nil {
						formatCode = numFmts[numFmtId]
					}
					value = applyNumberFormat(value, formatCode)
				}
			}
			rows[rowNum][colNum] = value
		}
		rc.Close()

		if maxRow == 0 || maxCol == 0 {
			result = append(result, xlsxSheet{name: sh.name, rows: [][]string{}, merges: merges})
			continue
		}
		out := make([][]string, maxRow)
		for r := 1; r <= maxRow; r++ {
			out[r-1] = make([]string, maxCol)
			if cells, ok := rows[r]; ok {
				for c := 1; c <= maxCol; c++ {
					if v, ok := cells[c]; ok {
						out[r-1][c-1] = v
					}
				}
			}
		}
		result = append(result, xlsxSheet{name: sh.name, rows: out, merges: merges})
	}
	if len(result) == 0 {
		result = append(result, xlsxSheet{name: "Sheet1", rows: [][]string{}, merges: nil})
	}
	return result, nil
}

// parseXLSX is retained for single-sheet callers; it returns the first sheet's rows.
func parseXLSX(data []byte) ([][]string, error) {
	sheets, err := parseXLSXSheets(data)
	if err != nil {
		return nil, err
	}
	if len(sheets) == 0 {
		return [][]string{}, nil
	}
	return sheets[0].rows, nil
}

func parseCellRef(ref string) (int, int) {
	// e.g. "A1", "BC12"
	col := 0
	i := 0
	for i < len(ref) && ((ref[i] >= 'A' && ref[i] <= 'Z') || (ref[i] >= 'a' && ref[i] <= 'z')) {
		ch := ref[i]
		if ch >= 'a' && ch <= 'z' {
			ch -= 32
		}
		col = col*26 + int(ch-'A'+1)
		i++
	}
	rowStr := ref[i:]
	row, _ := strconv.Atoi(rowStr)
	return row, col
}

func isSingleMerge(merges []cellRange, b block) bool {
	for _, m := range merges {
		if m.startRow <= b.top && m.endRow >= b.bottom &&
			m.startCol <= b.left && m.endCol >= b.right {
			return true
		}
	}
	return false
}

func detectRegions(rows [][]string, merges []cellRange, maxScan int64) []region {
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
	// Mark merged ranges as occupied (TS parity: regionDetector lines 98-103).
	for _, m := range merges {
		if m.startRow > lastRow {
			continue
		}
		for row := m.startRow; row <= m.endRow && row <= lastRow; row++ {
			for col := m.startCol; col <= m.endCol; col++ {
				if col >= width {
					continue
				}
				if occupied[row] == nil {
					occupied[row] = map[int]bool{}
				}
				occupied[row][col] = true
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
		if len(cells) != 1 && !isSingleMerge(merges, candidate) {
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
			if (len(first) == 1 || isSingleMerge(merges, block{top: top, bottom: top, left: b.left, right: b.right})) && len(second) >= 2 {
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
		// contains-merged-cells: TS parity (regionDetector line 168)
		rangeRect := struct{ sr, sc, er, ec int }{top, b.left, b.bottom, b.right}
		for _, m := range merges {
			if m.startRow <= rangeRect.er && m.endRow >= rangeRect.sr &&
				m.startCol <= rangeRect.ec && m.endCol >= rangeRect.sc {
				reasons = append(reasons, "contains-merged-cells")
				break
			}
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

func toCandidate(source, sourceDigest, sheetName string, rows [][]string, r region, merges []cellRange, maxScan int64) candidate {
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
	reference := fmt.Sprintf("![[%s#%s|%s", source, sheetName, r.a1)
	if r.headerConfidence == "likely" && r.headers != nil {
		reference += "?header=first"
	}
	reference += "]]"

	return candidate{
		Kind: "table-range",
		Locator: locator{Source: source, SourceDigest: sourceDigest, Sheet: sheetName, Range: r.a1},
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

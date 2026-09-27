# Structured Artifact Neutral Observation v0

## 1. Position

This contract is the research-only interchange for Issue #218 SAI-0A/H1.

It does not replace MMI worksheet perception, review-route, or reference-expression contracts.

MMI runtime/evaluation schema, hat47x.structured-artifact-observation/v0, and another product runtime schema remain separate.

The purpose is to test whether independent products can project comparable structural observations without importing each other's runtime types.

## 2. JSON identity

Schema:

~~~text
hat47x.structured-artifact-observation/v0
~~~

External JSON uses snake_case for cross-language use.

Top-level identity is fixed to:

- schema
- observation_id
- producer
- source
- region
- features
- labels
- split
- provenance

Unknown top-level fields fail closed.

## 3. Producer and provenance

Every neutral observation must remain traceable to its product-specific source observation.

Producer:

- repository
- producer_schema
- producer_version_or_git_sha
- adapter_version

Provenance:

- source_observation_ref
- source_observation_digest
- adapter_config_digest

Digests use lowercase sha256:<64 hex>.

The adapter does not create new semantic authority.

## 4. Source

Source contains:

- source_digest
- source_format
- source_family_id
- sheet_or_entity_id
- privacy_class
- synthetic

An absolute local path is not part of the neutral contract.

source_format=synthetic requires synthetic=true.

## 5. Region

Spreadsheet coordinates use:

~~~text
coordinate_system = one_based_inclusive
~~~

Row/column start, end, and count are either all null or all populated.

When populated:

~~~text
count = end - start + 1
~~~

XML or other non-grid observations may use null coordinates.

## 6. Features

v0 permits the following product-neutral namespaces.

geometry:
- border_closure
- grid_alignment
- merge_ambiguity
- topology_consistency
- non_empty_ratio
- merged_cell_count

pattern:
- repeated_row_signal
- repeated_column_signal

role:
- header_candidate_signal
- body_candidate_signal

Each feature stores:

- value
- kind
- method
- confidence

Kind is measured, derived, categorical, or unknown.

Measured/derived values must be finite numbers. true/false are not numeric values. NaN and infinity are rejected.

Unknown uses value=null.

Missing feature is not zero. The adapter does not fill unavailable observations.

MMI matched/ambiguous/novel or review-route values are not silently converted into geometry features.

## 7. Labels

Labels are optional and remain separate from features.

v0 candidate labels:

- region.table_like
- region.header_boundary
- region.repeated_block
- region.hierarchy_relation
- region.ambiguous_or_non_table

Every label stores:

- value
- label_source
- labeler_or_rule_version
- blind_to_candidate_model
- confidence

label_source is deterministic, human_annotation, adjudication, or teacher_candidate.

human_annotation and adjudication require blind_to_candidate_model=true.

MMI review-route adjudication is not automatically converted into a structural label.

## 8. Split and leakage

Split is train, valid, test, or unassigned.

Group keys:

- source_family
- workbook_or_document
- mutation_family

The validator rejects the same group crossing train/valid/test.

This prevents nearby sheets, mutations from one source, or near-duplicate fixture families from leaking across evaluation boundaries.

unassigned is a research pool state; it does not constitute a training/evaluation split.

## 9. Divergence

Two products may emit different observations for the same source or region.

Those observations remain separate rather than being merged into a synthetic truth row.

The first SAI-0 success criterion is not agreement. It is:

Two independent products can emit validator-clean neutral observations while preserving traceability to their original observations.

## 10. Canonical serialization

After validation, object keys are sorted recursively and serialized as JSON plus LF.

Research artifact identity can use SHA-256 over those canonical bytes.

This does not replace source_digest or product runtime identity.

## 11. Non-goals

v0 does not include:

- model training
- MMI runtime schema changes
- worksheet matcher tuning
- review-route changes
- automatic source writes
- cross-product ground-truth merging
- common scoring of product-specific confidence
- creation of a standalone research repository

## 12. Next step

SAI-0B/H1 asks excel-houganshi-normalizer #20 to independently emit the same JSON contract.

Only after two products reuse the contract should rules, logistic regression, or LightGBM comparisons begin.

## 13. Before v1: convergence check with SEI contracts (informative)

This section is informative. It does not change v0 rules and creates no dependency on SEI.

Before promoting hat47x.structured-artifact-observation/v0 to v1, check whether it can converge with the following contracts of hat47x/sei-cognition (all v1alpha1, on SEI main under contracts/):

- sei.semantic-interchange/v1alpha1: a thin portable envelope. A receiver must not interpret an unknown contract id or version as known. SEI fixtures keep such records opaque as not_verified, and partial knowledge is not treated as malformed.
- sei.capability-observation/v1alpha1: provider-specific context stays behind references or extensions. Trust and priority are not inferred from the provider kind.
- sei.jcs+sha256/v1alpha1 and sei.raw-bytes+sha256/v1alpha1: representation profiles used by SEI exact bindings.

Differences to resolve or record before v1:

1. Unknown content. v0 fails closed on unknown top-level fields. The SEI envelope carries unknown nested contracts opaquely as not_verified. These can coexist: fail closed inside a known schema version, and carry unknown versions opaquely at the envelope level. v1 should state which applies where.
2. Canonical bytes. §10 sorts object keys recursively, serializes compact JSON, and appends LF. v0 does not declare RFC 8785 (JCS). The SEI JCS profile follows RFC 8785 and has no trailing newline. Both use SHA-256, but the same object yields different digests, at least because of the trailing LF. v1 should either adopt the JCS profile or declare its own representation profile identity.
3. Digest text. Both sides use sha256:<64 lowercase hex>. MMI source identity (source-identity-contract-v1.md, representation source-file-bytes-v1) follows the same byte rule as sei.raw-bytes+sha256/v1alpha1.
4. Provenance. v0 producer and provenance fields (§3) should map onto SEI adapter and mapping provenance without flattening source origin, derivation, and adapter version into one field.
5. Confidence. The v0 non-goal "common scoring of product-specific confidence" (§11) agrees with ADR-0018 D4 and with SEI provider neutrality. v1 should keep it.

Goal: avoid a third independent envelope in the family. Candidate outcomes are (a) keep v0/v1 as a payload contract that an SEI interchange envelope can carry as an extension record, (b) align v1 canonicalization with the JCS profile, or (c) keep both separate and publish a mapping. The choice belongs to v1 promotion and needs agreement from the second producer (excel-houganshi-normalizer).

No dependency: MMI validators, adapters, and tests do not import SEI code or schemas. The check is a document comparison and, if needed, a fixture-level digest comparison.

Evidence: design only. No cross-product run has been performed.

See also: [SEI decision-semantics mapping](sei-decision-semantics-mapping.md) (Japanese) and [issue-0192](../01_Plans/issues/issue-0192-sei-decision-basis-table-binding.md).

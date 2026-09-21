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

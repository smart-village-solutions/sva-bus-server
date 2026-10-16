## ADDED Requirements

### Requirement: Instance-labelled API key administration

The backend platform SHALL support exact-label filtering of API key metadata and an
optional exact-label precondition for revocation and activation. Existing authenticated
admin calls without a label filter or precondition SHALL remain compatible.

#### Scenario: List keys for a Studio instance

- **WHEN** an authenticated administrator lists keys with `label=sl-sankt-wendel`
- **THEN** only records whose label exactly equals `sl-sankt-wendel` are returned
- **AND** key hashes and raw API keys are absent from the response

#### Scenario: Reject an empty supplied filter

- **WHEN** an authenticated administrator supplies an empty label filter
- **THEN** the platform returns HTTP 400 instead of an unfiltered list

#### Scenario: Reject a key belonging to another instance

- **WHEN** an authenticated administrator attempts revocation or activation with a label precondition that differs from the stored key label
- **THEN** the platform returns HTTP 404
- **AND** the key remains unchanged

#### Scenario: Preserve existing clients and metadata

- **WHEN** an existing client authenticates with a previously issued key or an administrator uses an existing endpoint without a label precondition
- **THEN** the existing authentication and lifecycle behavior is preserved
- **AND** no key regeneration or metadata migration is required

### Requirement: Correlated Studio administrator audit context

The backend platform SHALL accept an optional validated Studio actor identifier only
within authenticated admin requests and SHALL audit it separately from the technical
admin-token identity and the operator-entered `createdBy` initials. The actor identifier
SHALL be treated as an assertion by the authenticated technical caller, not as an
independent authentication credential.

#### Scenario: Audit a Studio-originated mutation

- **WHEN** the authenticated Studio server supplies a valid `x-admin-actor-id` and request correlation identifier for a key mutation
- **THEN** audit output includes the technical admin identity, Studio actor identifier, request correlation identifier, action, key identifier and result
- **AND** raw keys, hashes, admin tokens and contact email addresses are excluded from audit details

#### Scenario: An actor header does not grant admin access

- **WHEN** a caller supplies a Studio actor header without a valid admin bearer token
- **THEN** the platform rejects the request according to existing admin authentication rules
- **AND** no key mutation is executed

### Requirement: Non-cacheable API key administration responses

The backend platform SHALL mark API key administration responses with
`Cache-Control: no-store` and SHALL continue returning raw generated keys only in
successful creation responses.

#### Scenario: Create and subsequently list a key

- **WHEN** an authenticated administrator creates a key and subsequently lists its metadata
- **THEN** the creation response contains the generated raw key once
- **AND** the listing contains neither the raw key nor its hash
- **AND** both responses include `Cache-Control: no-store`

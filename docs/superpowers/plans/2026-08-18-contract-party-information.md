# Contract Party Information Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store complete lessor and tenant identity information per contract, reuse it when renewing a unit contract, and render it consistently in the lease and safety-agreement PDF.

**Architecture:** Add four lessor snapshot columns to `contracts` while retaining the existing tenant columns. Normalize optional text in `ContractsService`, render both parties from the saved contract record, and keep the two Vue contract-entry paths synchronized through the existing `UnitsView` form state.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, class-validator, Vue 3, Element Plus, Vitest, Jest, pdf-lib.

## Global Constraints

- All eight party information fields are optional.
- For a unit with previous contracts, a new contract inherits the latest contract's lessor fields.
- Without history, lessor name and license number are empty, lessor contact is `吴孝斌`, and lessor phone is `18651510352`.
- Existing contracts migrate to lessor name/contact `吴孝斌`, lessor phone `18651510352`, and an empty lessor license number.
- The existing tenant business-license file upload remains tenant-only.
- No new dependencies.

---

### Task 1: Persist lessor information on contracts

**Files:**
- Create: `backend/src/database/migrations/1712400000000-add-contract-lessor-fields.ts`
- Create: `backend/src/contracts/contracts.dto.spec.ts`
- Create: `backend/src/contracts/contracts.service.spec.ts`
- Create: `backend/src/units/units.service.spec.ts`
- Modify: `backend/src/database/typeorm.config.ts`
- Modify: `backend/src/contracts/contract.entity.ts`
- Modify: `backend/src/contracts/contracts.dto.ts`
- Modify: `backend/src/contracts/contracts.service.ts`
- Modify: `backend/src/units/units.service.ts`

**Interfaces:**
- Produces contract properties `lessorName`, `lessorLicenseCode`, `lessorContactName`, and `lessorPhone`, all strings.
- `CreateContractDto` and `UpdateContractDto` accept all four properties as optional strings with maximum lengths matching the corresponding tenant fields.
- `ContractsService.create()` and `ContractsService.update()` trim all eight party fields and persist missing values as empty strings.
- `UnitsService` includes all four lessor properties in `activeContract` and every serialized contract.

- [ ] **Step 1: Add failing service and OpenAPI tests**

Create fixtures that call `ContractsService.create()` and `update()` with padded lessor values, then assert the repository receives:

```ts
expect(repository.create).toHaveBeenCalledWith(
  expect.objectContaining({
    lessorName: "江阴市示例产业园有限公司",
    lessorLicenseCode: "91320281TEST000001",
    lessorContactName: "吴孝斌",
    lessorPhone: "18651510352",
  }),
);
```

Add DTO validation cases proving all eight party identity strings may be omitted while maximum lengths are still enforced.
Add a `UnitsService.list()` fixture asserting both `activeContract` and `contracts[0]` expose the saved lessor values.

- [ ] **Step 2: Run focused backend tests and verify failure**

Run: `npm test -- --runTestsByPath src/contracts/contracts.dto.spec.ts src/contracts/contracts.service.spec.ts src/units/units.service.spec.ts`

Expected: FAIL because the entity and DTO do not expose lessor fields.

- [ ] **Step 3: Add migration, entity, DTO, and service mapping**

The migration must add non-null string columns with empty defaults and then backfill existing rows:

```sql
UPDATE "contracts"
SET "lessorName" = '吴孝斌',
    "lessorLicenseCode" = '',
    "lessorContactName" = '吴孝斌',
    "lessorPhone" = '18651510352'
```

Register the migration in `databaseMigrations`. Add entity columns with `default: ""`; add optional DTO fields with `@IsString()` and `@MaxLength(...)`; make the existing four tenant identity DTO fields optional as well; trim optional values in both service write paths. Extend both contract serialization branches in `UnitsService` with the lessor fields.

- [ ] **Step 4: Run focused tests and backend build**

Run: `npm test -- --runTestsByPath src/contracts/contracts.dto.spec.ts src/contracts/contracts.service.spec.ts src/units/units.service.spec.ts`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands PASS.

- [ ] **Step 5: Commit backend persistence**

```bash
git add backend/src/database/migrations/1712400000000-add-contract-lessor-fields.ts backend/src/database/typeorm.config.ts backend/src/contracts/contract.entity.ts backend/src/contracts/contracts.dto.ts backend/src/contracts/contracts.dto.spec.ts backend/src/contracts/contracts.service.ts backend/src/contracts/contracts.service.spec.ts backend/src/units/units.service.ts backend/src/units/units.service.spec.ts
git commit -m "feat: 保存合同甲方信息"
```

### Task 2: Render both parties in generated PDFs

**Files:**
- Modify: `backend/src/contracts/contract-document.ts`
- Modify: `backend/src/contracts/contract-document.spec.ts`

**Interfaces:**
- Consumes the four lessor properties from `Contract`.
- `buildStandardLeaseContractPages()` renders both parties' four identity fields.
- `buildContractDocumentOverlays()` maps party names to the safety-agreement unit fields and contact names to its contact fields.

- [ ] **Step 1: Add failing PDF mapping tests**

Update `buildContractFixture()` with company lessor data and assert the lease body contains:

```ts
expect(bodyText).toContain("出租方（甲方）：江阴市示例产业园有限公司");
expect(bodyText).toContain("甲方联系人：吴孝斌    联系电话：18651510352    证照号码：91320281TEST000001");
expect(bodyText).toContain("承租方（乙方）：测试租户有限公司");
```

Assert the signature line contains both names and the safety overlays contain the lessor company and contact. Add a fixture with empty contacts and assert each contact falls back to its party name.

- [ ] **Step 2: Run the contract-document test and verify failure**

Run: `npm test -- --runTestsByPath src/contracts/contract-document.spec.ts`

Expected: FAIL because lessor data is still hardcoded.

- [ ] **Step 3: Replace hardcoded lessor constants with contract fields**

Remove `LESSOR_NAME` and `LESSOR_COMPANY`. Build the first-page identity block with normalized values, build the signature text from both party names, and use:

```ts
const lessorContact = normalizeOptionalText(contract.lessorContactName || contract.lessorName);
const tenantContact = normalizeOptionalText(contract.contactName || contract.tenantName);
```

Use `contract.lessorName` for `page4-lessor`, `contract.tenantName` for `page4-tenant`, and the resolved contacts for the two page-10 overlays.

- [ ] **Step 4: Run PDF tests and build**

Run: `npm test -- --runTestsByPath src/contracts/contract-document.spec.ts`

Run: `npm run build`

Expected: PASS, including PDF page-count and raster-overlay assertions.

- [ ] **Step 5: Commit PDF rendering**

```bash
git add backend/src/contracts/contract-document.ts backend/src/contracts/contract-document.spec.ts
git commit -m "feat: 合同展示甲乙双方完整信息"
```

### Task 3: Add lessor fields to both contract entry flows

**Files:**
- Modify: `frontend/src/generated/openapi.ts`
- Modify: `frontend/src/views/UnitsView.vue`
- Modify: `frontend/src/views/UnitsView.contract-download.spec.ts`

**Interfaces:**
- `Contract` and `UnitSummary.activeContract` expose the four lessor strings.
- Both `unitContractForm` and `contractForm` contain the four lessor fields.
- Contract create/update payloads include all four lessor fields.

- [ ] **Step 1: Extend frontend fixtures and add failing behavior tests**

Add lessor values to contract fixtures. Assert `openCreateContract()` inherits them from `selectedUnit.contracts[0]`, and assert a no-history unit displays default contact and phone. Submit with empty party inputs and assert no validation error occurs and the payload includes normalized empty strings.

```ts
expect(contractsApi.create).toHaveBeenCalledWith(
  expect.objectContaining({
    lessorName: "江阴市示例产业园有限公司",
    lessorLicenseCode: "91320281TEST000001",
    lessorContactName: "吴孝斌",
    lessorPhone: "18651510352",
  }),
);
```

- [ ] **Step 2: Run the focused frontend test and verify failure**

Run: `npm test -- --run src/views/UnitsView.contract-download.spec.ts`

Expected: FAIL because the form and API types lack lessor fields.

- [ ] **Step 3: Implement grouped party fields and default rules**

In both contract forms, render two clearly labeled groups. Each group contains name, business-license number, contact, and phone. Keep the tenant business-license file input below the identity groups.

Set no-history defaults with constants:

```ts
const DEFAULT_LESSOR_CONTACT_NAME = "吴孝斌";
const DEFAULT_LESSOR_PHONE = "18651510352";
```

Remove the existing tenant name/contact/phone required checks from `validateContractForm()`. Retain date, positive annual rent, and non-negative deposit validation. Populate all new fields in reset, inherit, edit, unit-create, and create/update payload paths.

Keep `hasInitialContractInput()` from treating the untouched default lessor contact and phone as user intent to create an initial contract. It should continue to rely on tenant input, dates, money, or uploaded files; edited lessor name/license values may also count as intent.

- [ ] **Step 4: Run frontend tests and build**

Run: `npm test -- --run src/views/UnitsView.contract-download.spec.ts`

Run: `npm test`

Run: `npm run build`

Expected: all commands PASS.

- [ ] **Step 5: Commit frontend forms**

```bash
git add frontend/src/generated/openapi.ts frontend/src/views/UnitsView.vue frontend/src/views/UnitsView.contract-download.spec.ts
git commit -m "feat: 合同表单增加甲方信息"
```

### Task 4: Release, verify, and deploy

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/config/app-meta.ts`
- Modify: `README.md`

**Interfaces:**
- Produces application version `V0.2.17` and matching package version `0.2.17`.

- [ ] **Step 1: Update version and release notes**

Set backend/frontend package versions to `0.2.17`, set `APP_VERSION` to `V0.2.17`, and add a dated README entry describing editable complete lessor and tenant information, renewal inheritance, and PDF mapping.

- [ ] **Step 2: Run the complete local verification suite**

Backend:

```bash
npm test
npm run lint
npm run build
```

Frontend:

```bash
npm test
npm run build
```

Run the repository migration smoke command used by CI and confirm the new migration applies after `1712300000000`.

- [ ] **Step 3: Commit the release metadata**

```bash
git add backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json frontend/src/config/app-meta.ts README.md
git commit -m "chore: 发布 V0.2.17"
```

- [ ] **Step 4: Push and verify GitHub Actions**

Push `main`, wait for backend tests, frontend tests, migration smoke, and both container image jobs to succeed. Do not deploy a tag until its image manifest is available.

- [ ] **Step 5: Deploy DSM and run production checks**

Pull the immutable commit image tags in `/volume4/docker/docker/rent`, update the `latest` aliases only after image labels match the pushed commit, run `docker compose up -d`, and verify all three containers are healthy.

Confirm production serves `V0.2.17`, the contract API returns the four lessor fields, and a generated PDF request succeeds for an existing contract after migration.

# Rent Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-level rent ledger that summarizes receivables and payments across contracts, exposes contract-period payment evidence, and produces printable and downloadable reconciliation statements.

**Architecture:** Add a read-only NestJS reconciliation module that loads contracts, rent payments, active receipts, and unit data in bounded queries, then performs all money calculations in integer cents. Add a focused Vue feature that consumes stable reconciliation DTOs, switches between tenant summary and detail views, reuses existing evidence preview components, and downloads server-rendered PDF statements.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, class-validator, PDFKit, Vue 3, Vue Router, Element Plus, Vitest, Jest.

## Global Constraints

- Group contracts by trimmed, exact `tenantName`; do not merge different tenant names.
- A contract period's receivable equals `annualRent`; do not prorate by days.
- A payment belongs only to its saved `contractId`; do not infer allocation from payment date.
- Calculate totals in integer cents and expose two-decimal amounts.
- Show overpayment as a separate non-negative credit, never as hidden or negative debt.
- Exclude soft-deleted payments and void receipts.
- Do not add a database table or migration.
- PDF payment rows contain receipt numbers but do not embed payment images.
- No new npm dependencies.

---

### Task 1: Build the reconciliation aggregation service

**Files:**
- Create: `backend/src/rent-reconciliation/rent-reconciliation.dto.ts`
- Create: `backend/src/rent-reconciliation/rent-reconciliation.types.ts`
- Create: `backend/src/rent-reconciliation/rent-reconciliation.service.ts`
- Create: `backend/src/rent-reconciliation/rent-reconciliation.service.spec.ts`

**Interfaces:**
- Consumes `Repository<Contract>` and `Repository<Receipt>`.
- Produces `RentReconciliationListResponse`, `TenantReconciliationDetail`, `ContractPeriodReconciliation`, and `RentReconciliationPayment`.
- Exposes `RentReconciliationService.list(query)` and `RentReconciliationService.detail(query)`.
- Uses status values `outstanding`, `settled`, and `credit`.

- [ ] **Step 1: Define failing aggregation tests**

Create repository fixtures for one tenant with two contracts, one tenant with no payments, a partially paid contract, an exactly paid contract, and an overpaid contract. Assert exact totals and payment ownership:

```ts
const result = await service.detail({ tenantName: " 大理石 ", year: 2026 });

expect(result).toEqual(
  expect.objectContaining({
    tenantName: "大理石",
    receivableAmount: 200000,
    paidAmount: 175000,
    outstandingAmount: 25000,
    creditAmount: 0,
    status: "outstanding",
  }),
);
expect(result.periods[0].payments.every((payment) => payment.contractId === result.periods[0].contractId)).toBe(true);
```

Add explicit cases for `100000.01 + 0.02`, deleted payment exclusion, active versus void receipts, tenant-name trimming, distinct names, contract-year overlap, keyword filtering, status filtering, empty results, and unknown tenant `NotFoundException`.

- [ ] **Step 2: Run the focused service test and verify failure**

Run from `backend`:

```bash
npm test -- --runTestsByPath src/rent-reconciliation/rent-reconciliation.service.spec.ts
```

Expected: FAIL because the reconciliation module and service do not exist.

- [ ] **Step 3: Define validated queries and stable response types**

Implement DTOs with `class-validator` and `class-transformer`:

```ts
export enum RentReconciliationStatus {
  OUTSTANDING = "outstanding",
  SETTLED = "settled",
  CREDIT = "credit",
}

export class ListRentReconciliationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @IsEnum(RentReconciliationStatus) status?: RentReconciliationStatus;
}

export class TenantRentReconciliationQueryDto {
  @IsString() @IsNotEmpty() @MaxLength(200) tenantName!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
}
```

Define response types with these exact payment fields: `id`, `contractId`, `paymentDate`, `amount`, `method`, `note`, `attachmentFiles`, and `activeReceipt`. Define period fields for unit identity, dates, four totals, status, and payments. Define list response as `{ items, availableYears }`.

- [ ] **Step 4: Implement cent-safe tenant and period aggregation**

Load contracts with `unit`, `rentPayments`, and payment attachments. Load active rent-payment receipts once with `In(paymentIds)` and map them by `sourceId`. Keep pure helpers small and testable:

```ts
function toCents(value: number) {
  return Math.round(Number(value) * 100);
}

function resolveBalance(receivableCents: number, paidCents: number) {
  return {
    outstandingCents: Math.max(receivableCents - paidCents, 0),
    creditCents: Math.max(paidCents - receivableCents, 0),
  };
}
```

Treat a contract as belonging to a selected year when `startDate <= YYYY-12-31` and `endDate >= YYYY-01-01`. Compute `availableYears` from every year touched by every contract before applying the selected-year filter. Sort tenant rows by debt descending then tenant name; sort periods and payments by date descending.

- [ ] **Step 5: Run service tests and backend type checks**

Run:

```bash
npm test -- --runTestsByPath src/rent-reconciliation/rent-reconciliation.service.spec.ts
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the aggregation service**

```bash
git add backend/src/rent-reconciliation/rent-reconciliation.dto.ts backend/src/rent-reconciliation/rent-reconciliation.types.ts backend/src/rent-reconciliation/rent-reconciliation.service.ts backend/src/rent-reconciliation/rent-reconciliation.service.spec.ts
git commit -m "feat: 增加房租对账汇总服务"
```

### Task 2: Expose reconciliation and PDF endpoints

**Files:**
- Create: `backend/src/rent-reconciliation/rent-reconciliation.document.ts`
- Create: `backend/src/rent-reconciliation/rent-reconciliation.document.spec.ts`
- Create: `backend/src/rent-reconciliation/rent-reconciliation.controller.ts`
- Create: `backend/src/rent-reconciliation/rent-reconciliation.module.ts`
- Modify: `backend/src/rent-reconciliation/rent-reconciliation.service.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces authenticated `GET /api/rent-reconciliation`, `GET /api/rent-reconciliation/detail`, and `GET /api/rent-reconciliation/pdf`.
- Exposes `renderRentReconciliationPdf(detail, fontPath): Promise<Buffer>`.
- Exposes `RentReconciliationService.generatePdf(query): Promise<{ buffer; filename; mimeType }>`.

- [ ] **Step 1: Add failing PDF renderer and service tests**

Use `backend/assets/fonts/NotoSansCJKsc-Regular.otf` in the renderer test. Assert a valid non-empty PDF buffer and stable filename behavior:

```ts
const buffer = await renderRentReconciliationPdf(detailFixture, fontPath);
expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
expect(buffer.length).toBeGreaterThan(1000);

const generated = await service.generatePdf({ tenantName: "大理石/仓储", year: 2026 });
expect(generated.filename).toBe("房租对账单_大理石_仓储_2026-08-21.pdf");
```

Also cover no matching contract, font lookup failure, period page breaks, empty payment periods, and active receipt numbers in payment rows.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- --runTestsByPath src/rent-reconciliation/rent-reconciliation.document.spec.ts src/rent-reconciliation/rent-reconciliation.service.spec.ts
```

Expected: FAIL because document rendering and `generatePdf()` do not exist.

- [ ] **Step 3: Render the A4 statement with PDFKit**

Implement one renderer that receives only `TenantReconciliationDetail` and a resolved OTF font path. Render title, tenant, generation date, four cumulative totals, then each period and its payment rows. Add an `ensureSpace(requiredHeight)` helper that starts a page and redraws the payment header before content would overflow.

Use consistent labels and two decimal places:

```ts
const formatMoney = (value: number) => `￥${value.toFixed(2)}`;
const paymentReceipt = payment.activeReceipt?.receiptNo ?? "未开收据";
```

Do not include attachment binaries. Resolve the font from `/app/assets/fonts/NotoSansCJKsc-Regular.otf`, configured `PDF_FONT_PATH` when it is not TTC, and local `assets/fonts/NotoSansCJKsc-Regular.otf`. Throw `ServiceUnavailableException("对账单 PDF 字体不可用")` when none exists.

- [ ] **Step 4: Register controller and module**

Protect the controller with `JwtAuthGuard`. Return JSON for list/detail and use `StreamableFile` for PDF. Set headers exactly once:

```ts
response.setHeader("Content-Type", "application/pdf");
response.setHeader("Content-Disposition", buildAttachmentDisposition(generated.filename));
response.setHeader("Content-Length", String(generated.buffer.length));
return new StreamableFile(generated.buffer);
```

Sanitize `\\ / : * ? " < > |` and control characters in the tenant filename segment. Import `RentReconciliationModule` in `AppModule`.

- [ ] **Step 5: Run focused and full backend verification**

Run:

```bash
npm test -- --runTestsByPath src/rent-reconciliation/rent-reconciliation.document.spec.ts src/rent-reconciliation/rent-reconciliation.service.spec.ts
npm test
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit authenticated APIs and PDF output**

```bash
git add backend/src/rent-reconciliation backend/src/app.module.ts
git commit -m "feat: 提供房租对账与 PDF 接口"
```

### Task 3: Build the tenant ledger Web page

**Files:**
- Create: `frontend/src/features/rent-reconciliation/types.ts`
- Create: `frontend/src/features/rent-reconciliation/api.ts`
- Create: `frontend/src/features/rent-reconciliation/views/RentReconciliationView.vue`
- Create: `frontend/src/features/rent-reconciliation/views/RentReconciliationView.spec.ts`
- Modify: `frontend/src/styles/base.css`

**Interfaces:**
- Consumes the three `/rent-reconciliation` endpoints.
- Reuses `PaymentVoucherPreviewDialog` and `apiFileUrl()` for evidence and receipt preview.
- Produces summary and detail modes in one route component.

- [ ] **Step 1: Add failing view interaction tests**

Mock `rentReconciliationApi`, `window.print`, `URL.createObjectURL`, and `URL.revokeObjectURL`. Mount the page with Element Plus stubs and assert:

```ts
expect(wrapper.text()).toContain("大理石");
expect(wrapper.text()).toContain("￥100,000.00");

await findButton(wrapper, "查看对账").trigger("click");
await flushPromises();
expect(rentReconciliationApi.detail).toHaveBeenCalledWith({ tenantName: "大理石", year: undefined });
expect(wrapper.text()).toContain("2025-09-01 至 2026-08-31");
expect(wrapper.text()).toContain("转账");
```

Add tests for year/status queries, empty list, failed loading, detail back navigation, voucher dialog input, receipt iframe URL, print, PDF download filename, and a double-click while `downloading` that calls `downloadPdf` only once.

- [ ] **Step 2: Run the view test and verify failure**

Run from `frontend`:

```bash
npm test -- src/features/rent-reconciliation/views/RentReconciliationView.spec.ts
```

Expected: FAIL because the feature does not exist.

- [ ] **Step 3: Implement typed API calls and guarded PDF download**

Mirror backend response interfaces in `types.ts`, importing `StoredFile` for attachment and receipt file metadata. Build query strings only for populated filters:

```ts
export const rentReconciliationApi = {
  list: (query: ReconciliationListQuery) =>
    apiFetch<RentReconciliationListResponse>(`/rent-reconciliation${buildQuery(query)}`),
  detail: (query: ReconciliationDetailQuery) =>
    apiFetch<TenantReconciliationDetail>(`/rent-reconciliation/detail${buildQuery(query)}`),
  downloadPdf: (query: ReconciliationDetailQuery) =>
    apiDownload(`/rent-reconciliation/pdf${buildQuery(query)}`),
};
```

In the view, set `downloading` before awaiting the API and return immediately when already true. Trigger one hidden-anchor download from the returned Blob URL, remove the anchor, and revoke the URL in `finally`.

- [ ] **Step 4: Implement summary and detail views**

Use the existing `AppShell`, `panel-card`, `page-header`, `page-filters`, `stats-row`, and `table-shell` conventions. The summary table shows tenant, period count, cumulative receivable/paid/debt/credit, last payment date, status, and a “查看对账” command.

In detail mode, show a back button, four totals, and unframed contract-period sections ordered newest first. Each period exposes payment date, amount, method, note, voucher count, active receipt number, voucher preview, and receipt preview. Use `--` for absent values and an explicit “本期暂无实付记录” state.

Add print CSS that hides the sidebar, top actions, filters, preview dialogs, and screen-only controls while keeping tenant totals, contract periods, and payment rows visible. Ensure tables scroll on small screens without changing fixed-format row heights.

- [ ] **Step 5: Run focused tests, type checks, and build**

Run:

```bash
npm test -- src/features/rent-reconciliation/views/RentReconciliationView.spec.ts
npm run type-check
npm run build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the reconciliation Web page**

```bash
git add frontend/src/features/rent-reconciliation frontend/src/styles/base.css
git commit -m "feat: 增加房租对账页面"
```

### Task 4: Integrate navigation and authenticated routing

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/components/AppShell.vue`
- Modify: `frontend/src/components/AppShell.version.spec.ts`

**Interfaces:**
- Produces authenticated route `/rent-reconciliation` named `rent-reconciliation`.
- Produces sidebar entry “房租对账” with badge “账”.

- [ ] **Step 1: Add failing navigation assertions**

Extend `AppShell.version.spec.ts` and assert the rendered navigation contains the route and label:

```ts
const reconciliationLink = wrapper.findAllComponents(RouterLinkStub).find(
  (link) => link.props("to") === "/rent-reconciliation",
);
expect(reconciliationLink?.text()).toContain("房租对账");
```

Add a router assertion that the route metadata contains `requiresAuth: true`.

- [ ] **Step 2: Run the navigation test and verify failure**

Run:

```bash
npm test -- src/components/AppShell.version.spec.ts
```

Expected: FAIL because no reconciliation navigation item exists.

- [ ] **Step 3: Register route and sidebar item**

Import `RentReconciliationView` from the new feature directory, add the authenticated route, and insert the menu after “房租收费”:

```ts
{
  label: "房租对账",
  to: "/rent-reconciliation",
  badge: "账",
  caption: "应收实收与结欠",
  description: "按租户和合同期间核对房租应收、实收、结欠和付款凭证。",
}
```

- [ ] **Step 4: Run frontend tests and build**

Run:

```bash
npm test
npm run build
```

Expected: all commands PASS.

- [ ] **Step 5: Commit route integration**

```bash
git add frontend/src/router/index.ts frontend/src/components/AppShell.vue frontend/src/components/AppShell.version.spec.ts
git commit -m "feat: 接入房租对账导航"
```

### Task 5: Release, verify, and deploy

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/config/app-meta.ts`
- Modify: `README.md`

**Interfaces:**
- Produces application version `V0.3.0` and matching package version `0.3.0`.

- [ ] **Step 1: Update version and release notes**

Run `npm version 0.3.0 --no-git-tag-version` separately in `backend` and `frontend`. Set `APP_VERSION` to `V0.3.0`, update `APP_UPDATED_AT` with the current CST timestamp, and prepend a README entry describing tenant-level cumulative reconciliation, contract-period payment details, evidence/receipt preview, debt/credit calculation, printing, and PDF export.

- [ ] **Step 2: Run complete local verification**

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

Also run `git diff --check` and confirm `git status --short` contains only the intended release files before committing.

- [ ] **Step 3: Commit release metadata**

```bash
git add backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json frontend/src/config/app-meta.ts README.md
git commit -m "chore: 发布 V0.3.0"
```

- [ ] **Step 4: Push and verify GitHub Actions**

Push `main`, watch the repository workflow through completion, and confirm the `V0.3.0` backend/frontend images are published. If a job fails, inspect its logs, fix only the responsible files, rerun local checks, commit, and push again.

- [ ] **Step 5: Update DSM and verify production**

Use the existing Web update action or DSM compose update path to pull the successful `V0.3.0` images and recreate the project. Verify `http://rent.ace-station.top:1111` reports `V0.3.0`, then test the “房租对账” menu, tenant totals, period expansion, voucher/receipt preview, print layout, and one PDF download against production data.

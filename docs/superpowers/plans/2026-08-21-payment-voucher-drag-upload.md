# Payment Voucher Drag Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reusable click-and-drag image picker to rent, deposit, and utility payment flows, including utility voucher persistence, historical backfill management, and preview.

**Architecture:** Keep file binaries in the existing `payment-voucher` storage flow and keep local `File[]` state in Vue until the parent form is saved. Add one reusable stateless upload component for all three pages; extend only utility charge records with a TypeORM many-to-many relation and reuse the existing `/utilities/records/:id/pay` endpoint for initial payment and later voucher management.

**Tech Stack:** Vue 3, TypeScript, Element Plus, Vitest, NestJS 11, TypeORM 0.3, PostgreSQL, class-validator, Jest, Docker Compose, GitHub Actions, GHCR.

## Global Constraints

- Accept only `image/jpeg`, `image/png`, and `image/webp`.
- Allow at most 10 payment voucher images per business record, counting existing and pending images together.
- Do not add a new npm dependency or a new file upload endpoint.
- Keep rent-payment and deposit payloads and database relations backward compatible.
- Add utility vouchers at the actual payment step, not while recording an unpaid meter charge.
- Allow already-paid utility records to add, remove, and preview historical vouchers.
- When `attachmentFileIds` is omitted from the utility pay payload, preserve current attachments; when it is an explicit empty array, clear them.
- Keep `.workflow/` untracked and untouched.

---

### Task 1: Persist utility payment voucher relationships

**Files:**
- Create: `backend/src/database/migrations/1712500000000-add-utility-payment-voucher-attachments.ts`
- Create: `backend/src/database/migrations/1712500000000-add-utility-payment-voucher-attachments.spec.ts`
- Create: `backend/src/utilities/utilities.service.spec.ts`
- Modify: `backend/src/database/typeorm.config.ts`
- Modify: `backend/src/utilities/utility-charge-record.entity.ts`
- Modify: `backend/src/utilities/utilities.dto.ts`
- Modify: `backend/src/utilities/utilities.module.ts`
- Modify: `backend/src/utilities/utilities.service.ts`
- Modify: `docs/database-schema.md`

**Interfaces:**
- Consumes `FilesService.resolvePaymentVoucherFiles(fileIds: string[]): Promise<StoredFile[]>`.
- Adds `UtilityChargeRecord.attachmentFiles: StoredFile[]` with eager `ManyToMany` loading.
- Extends `MarkUtilityRecordPaidDto` with `attachmentFileIds?: string[]`.
- Keeps `UtilitiesService.markAsPaid(id, dto)` as the only payment update entry point.
- Creates join table `utility_charge_record_attachment_files(utilityChargeRecordId, fileId)`.

- [ ] **Step 1: Write failing utility service tests**

Create `utilities.service.spec.ts` with a focused service fixture. Assert association, preservation, and explicit clearing:

```ts
const record = {
  id: "record-1",
  status: UtilityChargeStatus.UNPAID,
  attachmentFiles: [{ id: "existing-voucher" }],
};
recordsRepository.findOne.mockResolvedValue(record);
filesService.resolvePaymentVoucherFiles.mockResolvedValue([{ id: "voucher-1" }]);

await service.markAsPaid("record-1", {
  paidAt: "2026-08-21",
  paymentMethod: "微信",
  attachmentFileIds: ["voucher-1"],
} as never);

expect(filesService.resolvePaymentVoucherFiles).toHaveBeenCalledWith(["voucher-1"]);
expect(recordsRepository.save).toHaveBeenCalledWith(
  expect.objectContaining({
    status: UtilityChargeStatus.PAID,
    paidAt: "2026-08-21",
    paymentMethod: "微信",
    attachmentFiles: [{ id: "voucher-1" }],
  }),
);
```

Add one call without `attachmentFileIds` and assert `existing-voucher` remains. Add one call with `attachmentFileIds: []` and assert `resolvePaymentVoucherFiles([])` is called and `attachmentFiles` becomes `[]`.

- [ ] **Step 2: Write a failing migration query test**

Mock `QueryRunner.query` and assert `up()` issues SQL containing the exact join table, both foreign keys, and both indexes; assert `down()` drops only the new table:

```ts
expect(sql).toContain('CREATE TABLE IF NOT EXISTS "utility_charge_record_attachment_files"');
expect(sql).toContain('REFERENCES "utility_charge_records"("id") ON DELETE CASCADE');
expect(sql).toContain('REFERENCES "stored_files"("id") ON DELETE CASCADE');
expect(downSql).toContain('DROP TABLE IF EXISTS "utility_charge_record_attachment_files"');
```

- [ ] **Step 3: Run focused tests and verify failure**

Run from `backend`:

```bash
npm test -- --runTestsByPath src/utilities/utilities.service.spec.ts src/database/migrations/1712500000000-add-utility-payment-voucher-attachments.spec.ts
```

Expected: FAIL because the entity relation, DTO field, migration, module dependency, and service behavior do not exist.

- [ ] **Step 4: Add the entity relation and migration**

Add the same eager relation pattern used by rent and deposit records:

```ts
@ManyToMany(() => StoredFile, { eager: true })
@JoinTable({
  name: "utility_charge_record_attachment_files",
  joinColumn: { name: "utilityChargeRecordId", referencedColumnName: "id" },
  inverseJoinColumn: { name: "fileId", referencedColumnName: "id" },
})
attachmentFiles!: StoredFile[];
```

The migration creates a composite primary key, `ON DELETE CASCADE` foreign keys, and indexes named `IDX_utility_charge_record_attachment_files_recordId` and `IDX_utility_charge_record_attachment_files_fileId`. Register `AddUtilityPaymentVoucherAttachments1712500000000` in the explicit migrations array in `typeorm.config.ts` and document the join table in `docs/database-schema.md`.

- [ ] **Step 5: Validate the utility pay DTO and resolve voucher files**

Add these validators to `MarkUtilityRecordPaidDto`:

```ts
@IsArray()
@ArrayMaxSize(10)
@ArrayUnique()
@IsUUID("4", { each: true })
@IsOptional()
attachmentFileIds?: string[];
```

Import `FilesModule` in `UtilitiesModule`, inject `FilesService`, and preserve omitted attachments:

```ts
if (dto.attachmentFileIds !== undefined) {
  record.attachmentFiles = await this.filesService.resolvePaymentVoucherFiles(dto.attachmentFileIds);
}
```

Continue trimming `paymentMethod`, set `paidAt`, mark the record paid, and save only after voucher resolution succeeds.

- [ ] **Step 6: Run focused and backend verification**

Run:

```bash
npm test -- --runTestsByPath src/utilities/utilities.service.spec.ts src/database/migrations/1712500000000-add-utility-payment-voucher-attachments.spec.ts
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 7: Commit utility voucher persistence**

```bash
git add backend/src/database/migrations/1712500000000-add-utility-payment-voucher-attachments.ts backend/src/database/migrations/1712500000000-add-utility-payment-voucher-attachments.spec.ts backend/src/database/typeorm.config.ts backend/src/utilities/utility-charge-record.entity.ts backend/src/utilities/utilities.dto.ts backend/src/utilities/utilities.module.ts backend/src/utilities/utilities.service.ts backend/src/utilities/utilities.service.spec.ts docs/database-schema.md
git commit -m "feat: 增加水电收款凭证关联"
```

### Task 2: Build the reusable drag-and-drop voucher component

**Files:**
- Create: `frontend/src/components/PaymentVoucherUpload.vue`
- Create: `frontend/src/components/PaymentVoucherUpload.spec.ts`
- Modify: `frontend/src/styles/base.css`
- Modify: `frontend/src/utils/payment-vouchers.ts`
- Modify: `frontend/src/utils/payment-vouchers.spec.ts`

**Interfaces:**
- Props: `modelValue: File[]`, `existingFiles: Array<Pick<StoredFile, "id" | "originalName">>`, `disabled?: boolean`.
- Emits: `update:modelValue(files: File[])`, `remove-existing(fileId: string)`.
- Reuses `PAYMENT_VOUCHER_IMAGE_ACCEPT` and `appendPaymentVoucherImages(existingCount, currentUploads, selectedFiles)`.
- Adds `MAX_PAYMENT_VOUCHER_IMAGES = 10` as an exported constant for the count label.

- [ ] **Step 1: Extend utility tests for empty drops and exported limits**

Add assertions that an empty `File[]` returns the existing upload array unchanged and that `MAX_PAYMENT_VOUCHER_IMAGES` equals 10:

```ts
expect(appendPaymentVoucherImages(1, [png], [])).toEqual([png]);
expect(MAX_PAYMENT_VOUCHER_IMAGES).toBe(10);
```

- [ ] **Step 2: Write failing component interaction tests**

Mount the component with one existing file. Mock the hidden input `click`, then test click/keyboard opening, input selection, drop selection, active drag styling, pending removal, existing removal, invalid image errors, maximum count errors, empty drops, and disabled behavior:

```ts
await wrapper.get(".payment-voucher-dropzone").trigger("drop", {
  dataTransfer: { files: [pngFile, webpFile] },
});
expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual([pngFile, webpFile]);

await wrapper.get('[data-file-id="existing-1"] button').trigger("click");
expect(wrapper.emitted("remove-existing")?.at(-1)).toEqual(["existing-1"]);
```

- [ ] **Step 3: Run component tests and verify failure**

Run from `frontend`:

```bash
npm test -- --run src/components/PaymentVoucherUpload.spec.ts src/utils/payment-vouchers.spec.ts
```

Expected: FAIL because the component and exported maximum do not exist.

- [ ] **Step 4: Implement the controlled upload component**

Keep the native input visually hidden and route input and drop files through one handler:

```ts
function appendFiles(files: FileList | File[]) {
  if (props.disabled || files.length === 0) return;
  try {
    emit(
      "update:modelValue",
      appendPaymentVoucherImages(props.existingFiles.length, props.modelValue, files),
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "收款凭证选择失败");
  }
}
```

The dropzone uses `role="button"`, `tabindex`, `aria-disabled`, `@click`, `@keydown.enter.prevent`, `@keydown.space.prevent`, `@dragenter.prevent`, `@dragover.prevent`, `@dragleave.prevent`, and `@drop.prevent`. Reset the native input value after every change so the same file can be selected again after removal.

Render existing and pending files in compact rows using original filenames, with explicit “移除” buttons. Show `已选择 N / 10 张` inside the control. Add `.is-dragging`, `:focus-visible`, disabled, mobile wrapping, and long-filename overflow styles in `base.css` using current CSS variables.

- [ ] **Step 5: Run component tests, type checks, and build**

Run:

```bash
npm test -- --run src/components/PaymentVoucherUpload.spec.ts src/utils/payment-vouchers.spec.ts
npm run type-check
npm run build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the reusable uploader**

```bash
git add frontend/src/components/PaymentVoucherUpload.vue frontend/src/components/PaymentVoucherUpload.spec.ts frontend/src/styles/base.css frontend/src/utils/payment-vouchers.ts frontend/src/utils/payment-vouchers.spec.ts
git commit -m "feat: 增加收款凭证拖拽组件"
```

### Task 3: Replace rent and deposit file inputs

**Files:**
- Create: `frontend/src/views/RentPaymentsView.voucher.spec.ts`
- Create: `frontend/src/views/DepositsView.voucher.spec.ts`
- Modify: `frontend/src/views/RentPaymentsView.vue`
- Modify: `frontend/src/views/DepositsView.vue`

**Interfaces:**
- Consumes `PaymentVoucherUpload` from Task 2.
- Keeps page-owned `existingVoucherFiles: Ref<StoredFile[]>` and `voucherUploads: Ref<File[]>`.
- Keeps the existing rent/deposit API payload field `attachmentFileIds`.

- [ ] **Step 1: Write failing page integration tests**

Mock page APIs and stub `PaymentVoucherUpload` as a controlled component. For each page, open the create form, emit two pending files, click save, and assert `filesApi.upload(files, "payment-voucher")` is called before the create API receives returned IDs:

```ts
expect(filesApi.upload).toHaveBeenCalledWith([pngFile, webpFile], "payment-voucher");
expect(rentPaymentsApi.create).toHaveBeenCalledWith(
  expect.objectContaining({ attachmentFileIds: ["uploaded-1", "uploaded-2"] }),
);
```

For edit mode, initialize one existing file, emit `remove-existing`, add one pending image, save, and assert the payload contains only the newly uploaded ID. Repeat the payload assertion for `depositsApi.create` and `depositsApi.update`.

- [ ] **Step 2: Run page tests and verify failure**

Run:

```bash
npm test -- --run src/views/RentPaymentsView.voucher.spec.ts src/views/DepositsView.voucher.spec.ts
```

Expected: FAIL because both forms still render native file inputs and do not expose the reusable component contract.

- [ ] **Step 3: Replace duplicated form markup and handlers**

Import the component in both pages and replace the chip list plus `<input type="file">` with:

```vue
<PaymentVoucherUpload
  v-model="voucherUploads"
  :existing-files="existingVoucherFiles"
  :disabled="submitting"
  @remove-existing="removeExistingVoucher"
/>
```

Remove `PAYMENT_VOUCHER_IMAGE_ACCEPT`, `appendPaymentVoucherImages`, and `onVoucherFilesChange` imports/functions from both views. Keep `removeVoucherUpload` only if still referenced outside the component; otherwise remove it. Preserve current save ordering, upload category, error messages, and form reset behavior.

- [ ] **Step 4: Run focused tests and full frontend verification**

Run:

```bash
npm test -- --run src/views/RentPaymentsView.voucher.spec.ts src/views/DepositsView.voucher.spec.ts src/components/PaymentVoucherUpload.spec.ts
npm test -- --run
npm run build
```

Expected: all commands PASS.

- [ ] **Step 5: Commit rent and deposit integration**

```bash
git add frontend/src/views/RentPaymentsView.vue frontend/src/views/RentPaymentsView.voucher.spec.ts frontend/src/views/DepositsView.vue frontend/src/views/DepositsView.voucher.spec.ts
git commit -m "feat: 房租与押金支持拖拽凭证"
```

### Task 4: Add utility payment and historical voucher management

**Files:**
- Create: `frontend/src/views/UtilitiesView.voucher.spec.ts`
- Modify: `frontend/src/generated/openapi.ts`
- Modify: `frontend/src/api/index.ts`
- Modify: `frontend/src/views/UtilitiesView.vue`

**Interfaces:**
- Extends `UtilityChargeRecord` with `attachmentFiles: StoredFile[]`.
- Extends `utilitiesApi.payRecord(id, payload)` payload to `{ paidAt?: string; paymentMethod?: string; attachmentFileIds?: string[] }`.
- Consumes `PaymentVoucherUpload`, `PaymentVoucherPreviewDialog`, and `filesApi.upload`.
- Produces one payment dialog for unpaid collection and paid historical voucher management.

- [ ] **Step 1: Write failing utility view tests**

Mock `unitsApi`, `utilitiesApi`, `filesApi`, and `receiptsApi`. Assert an unpaid row opens “确认水电收款”, uploads pending images, and submits all fields once:

```ts
expect(filesApi.upload).toHaveBeenCalledWith([pngFile], "payment-voucher");
expect(utilitiesApi.payRecord).toHaveBeenCalledWith("utility-1", {
  paidAt: "2026-08-21",
  paymentMethod: "微信",
  attachmentFileIds: ["uploaded-1"],
});
```

Add a deferred upload promise and double-click the confirm button; assert one upload and one pay request. For an already-paid row, assert “管理凭证” opens with existing files, removing one and adding another submits the final ID list. Assert the list voucher count opens `PaymentVoucherPreviewDialog`.

- [ ] **Step 2: Run the utility view test and verify failure**

Run:

```bash
npm test -- --run src/views/UtilitiesView.voucher.spec.ts
```

Expected: FAIL because utility records have no attachment type, column, payment dialog, upload flow, or management action.

- [ ] **Step 3: Extend frontend types and API payload**

Add `attachmentFiles: StoredFile[]` to `UtilityChargeRecord` in `generated/openapi.ts`. Update the pay method signature without changing the endpoint:

```ts
payRecord: (
  id: string,
  payload: { paidAt?: string; paymentMethod?: string; attachmentFileIds?: string[] },
) => apiFetch<UtilityChargeRecord>(`/utilities/records/${id}/pay`, {
  method: "POST",
  body: JSON.stringify(payload),
}),
```

- [ ] **Step 4: Implement the utility payment dialog and list column**

Replace the direct `markRecordPaid(id)` call with `openPaymentDialog(row)`. Track the selected record, existing files, pending files, payment date, method, and `paymentSubmitting` guard. For unpaid records, default date to `todayIso()` and method to `record.paymentMethod || "转账"`; for paid records, use saved values.

Save in this exact order:

```ts
let attachmentFileIds = existingVoucherFiles.value.map((file) => file.id);
if (voucherUploads.value.length) {
  const uploaded = await filesApi.upload(voucherUploads.value, "payment-voucher");
  attachmentFileIds = [...attachmentFileIds, ...uploaded.map((file) => file.id)];
}
await utilitiesApi.payRecord(paymentRecord.value.id, {
  paidAt: paymentForm.paidAt,
  paymentMethod: paymentForm.paymentMethod.trim(),
  attachmentFileIds,
});
```

Add a “凭证” column using the same count button and preview dialog as rent/deposit. Keep “开收据” for paid rows and add “管理凭证” beside it. The payment dialog uses `PaymentVoucherUpload`, disables inputs while submitting, remains open on failure, closes on success, and refreshes records after save.

- [ ] **Step 5: Run focused and full frontend verification**

Run:

```bash
npm test -- --run src/views/UtilitiesView.voucher.spec.ts src/components/PaymentVoucherUpload.spec.ts
npm test -- --run
npm run build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit utility Web voucher management**

```bash
git add frontend/src/generated/openapi.ts frontend/src/api/index.ts frontend/src/views/UtilitiesView.vue frontend/src/views/UtilitiesView.voucher.spec.ts
git commit -m "feat: 水电收费支持管理收款凭证"
```

### Task 5: Verify, release, and deploy

**Files:**
- Modify: `README.md`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/config/app-meta.ts`

**Interfaces:**
- Publishes `V0.4.0` because the release adds a database relation and a new utility payment workflow.
- Uses existing GitHub CI, GHCR publish workflow, and DSM Web updater.

- [ ] **Step 1: Run complete verification before release metadata changes**

Run:

```bash
cd backend && npm test -- --runInBand && npm run lint && npm run build
cd ../frontend && npm test -- --run && npm run build
cd .. && docker compose config
```

Expected: backend and frontend tests PASS, lint and builds PASS, and Compose config exits 0.

- [ ] **Step 2: Update release metadata and README**

Run `date '+%Y-%m-%d %H:%M CST'` and use that exact output for `APP_UPDATED_AT`, README update time, and the top update-history entry. Set package versions to `0.4.0`, set `APP_VERSION` to `V0.4.0`, and describe these shipped behaviors:

```text
房租、押金和水电收款凭证统一支持点击选择与拖拽图片；水电费在标记已缴费时可上传凭证，已缴费历史记录可补传、移除和预览凭证。
```

- [ ] **Step 3: Re-run version-sensitive verification**

Run:

```bash
cd frontend && npm test -- --run && npm run build
cd ../backend && npm run build
cd .. && git diff --check
```

Expected: all commands PASS and no whitespace errors.

- [ ] **Step 4: Commit the release**

```bash
git add README.md backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json frontend/src/config/app-meta.ts
git commit -m "chore: 发布 V0.4.0"
```

- [ ] **Step 5: Push and wait for both GitHub workflows**

```bash
git push origin main
```

Use the GitHub Actions API to verify both CI and `Publish Docker Images` for the release commit finish with `conclusion: success`. Do not start DSM deployment while either workflow is queued, in progress, or failed.

- [ ] **Step 6: Start DSM Web update and monitor health**

Authenticate through `POST /api/auth/login`, confirm `GET /api/deployment-update/status` reports `onlineVersion: "V0.4.0"` and `running: false`, then call `POST /api/deployment-update/start`. Monitor updater logs and wait for:

```text
factory-rental-postgres   healthy
factory-rental-backend    healthy
factory-rental-frontend   running
```

- [ ] **Step 7: Verify the deployed application**

Confirm the public root and `/api/health` return HTTP 200, the updater reports `running: false`, and the served asset contains `V0.4.0`. Log in and verify:

- rent payment drag selection and existing-file removal;
- deposit drag selection and existing-file removal;
- utility unpaid payment dialog upload;
- paid utility historical voucher management;
- utility voucher count preview;
- invalid file and 11-image rejection messages.

- [ ] **Step 8: Confirm repository state**

Run:

```bash
git status --short --branch
git log -5 --oneline --decorate
```

Expected: `main` matches `origin/main`; only the pre-existing untracked `.workflow/` directory remains.

<template>
  <AppShell>
    <template #top-actions>
      <div class="toolbar-row reconciliation-screen-only">
        <template v-if="selectedTenantName">
          <el-button @click="backToSummary">返回总账</el-button>
          <el-button :disabled="!detail" @click="printDetail">打印</el-button>
          <el-button type="primary" :loading="downloading" :disabled="!detail" @click="downloadPdf">
            下载 PDF
          </el-button>
          <el-button :loading="detailLoading" @click="loadDetail">刷新</el-button>
        </template>
        <template v-else>
          <el-button :loading="loading" @click="loadList">刷新</el-button>
        </template>
      </div>
    </template>

    <section class="panel-card page-panel reconciliation-page">
      <template v-if="!selectedTenantName">
        <div class="page-header">
          <div>
            <h2>房租对账</h2>
            <p>按租户汇总各租赁期的当前结欠、预收和未分配结余。</p>
          </div>
        </div>

        <div class="page-filters reconciliation-filters">
          <el-select v-model="filters.keyword" clearable placeholder="选择租户" aria-label="选择租户">
            <el-option label="全部租户" value="" />
            <el-option
              v-for="tenantName in tenantOptions"
              :key="tenantName"
              :label="tenantName"
              :value="tenantName"
            />
          </el-select>
          <el-select v-model="filters.year" placeholder="租赁年度" aria-label="租赁年度">
            <el-option label="全部年度" value="" />
            <el-option v-for="year in listResponse.availableYears" :key="year" :label="`${year} 年`" :value="year" />
          </el-select>
          <el-select v-model="filters.status" placeholder="对账状态" aria-label="对账状态">
            <el-option label="全部状态" value="" />
            <el-option label="欠款" value="outstanding" />
            <el-option label="已结清" value="settled" />
            <el-option label="有预收" value="prepaid" />
            <el-option label="有结余" value="credit" />
          </el-select>
          <el-button type="primary" @click="loadList">查询</el-button>
          <el-button @click="resetFilters">清空筛选</el-button>
        </div>

        <div class="table-shell">
          <el-table
            :data="listResponse.items"
            v-loading="loading"
            class="reconciliation-ledger-table"
            size="small"
            row-key="tenantName"
          >
            <el-table-column prop="tenantName" label="租户" min-width="132" show-overflow-tooltip />
            <el-table-column prop="contractCount" label="租赁期" width="72" />
            <el-table-column label="当前结欠" min-width="112" align="right">
              <template #default="{ row }">
                <strong :class="{ 'amount-overdue': row.outstandingAmount !== 0 }">
                  {{ formatCurrency(row.outstandingAmount) }}
                </strong>
              </template>
            </el-table-column>
            <el-table-column label="预收" min-width="104" align="right">
              <template #default="{ row }">
                {{ row.prepaidAmount > 0 ? formatCurrency(row.prepaidAmount) : "--" }}
              </template>
            </el-table-column>
            <el-table-column label="未分配" min-width="104" align="right">
              <template #default="{ row }">
                {{ row.unallocatedAmount > 0 ? formatCurrency(row.unallocatedAmount) : "--" }}
              </template>
            </el-table-column>
            <el-table-column label="最后付款" width="104">
              <template #default="{ row }">{{ row.lastPaymentDate || "--" }}</template>
            </el-table-column>
            <el-table-column label="状态" width="84">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="96" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" @click="openDetail(row.tenantName)">查看对账</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="!loading && !listResponse.items.length" class="reconciliation-empty">暂无符合条件的对账记录</div>
      </template>

      <template v-else>
        <div class="page-header reconciliation-detail-header">
          <div>
            <p class="reconciliation-eyebrow">房租对账单</p>
            <h2>{{ selectedTenantName }}</h2>
            <p>{{ selectedYear ? `${selectedYear} 租赁年度` : "全部租赁期间" }}</p>
          </div>
          <el-tag v-if="detail" :type="statusTagType(detail.status)" size="large">
            {{ statusLabel(detail.status) }}
          </el-tag>
        </div>

        <div v-if="detail" class="stats-row reconciliation-stats">
          <div
            class="stat-item"
            data-test="current-outstanding"
            :class="{ 'amount-overdue': detail.outstandingAmount !== 0 }"
          >
            <small :class="{ 'amount-overdue': detail.outstandingAmount !== 0 }">当前结欠</small>
            <strong :class="{ 'amount-overdue': detail.outstandingAmount !== 0 }">
              {{ formatCurrency(detail.outstandingAmount) }}
            </strong>
          </div>
          <div class="stat-item">
            <small>预收</small>
            <strong>{{ formatCurrency(detail.prepaidAmount) }}</strong>
          </div>
          <div class="stat-item">
            <small>未分配</small>
            <strong>{{ formatCurrency(detail.unallocatedAmount) }}</strong>
          </div>
        </div>

        <div v-if="detailLoading" class="reconciliation-empty">正在加载对账明细...</div>
        <div v-else-if="detail" class="reconciliation-period-list">
          <section
            v-for="period in detail.periods"
            :key="period.scheduleId"
            class="reconciliation-period"
          >
            <div class="reconciliation-period-header">
              <div>
                <h3>{{ period.unit.code }} / {{ period.unit.location }}</h3>
                <p>第 {{ period.sequence }} 期 · {{ period.startDate }} 至 {{ period.endDate }} · 到期日 {{ period.dueDate }}</p>
              </div>
              <el-tag :type="periodStatusTagType(period.status)" size="small">
                {{ periodStatusLabel(period.status) }}
              </el-tag>
            </div>

            <dl class="reconciliation-period-totals">
              <div><dt>应收</dt><dd>{{ formatCurrency(period.receivableAmount) }}</dd></div>
              <div><dt>实收</dt><dd>{{ formatCurrency(period.paidAmount) }}</dd></div>
              <div data-test="period-outstanding">
                <dt :class="{ 'amount-overdue': period.outstandingAmount !== 0 }">结欠</dt>
                <dd :class="{ 'amount-overdue': period.outstandingAmount !== 0 }">
                  {{ formatCurrency(period.outstandingAmount) }}
                </dd>
              </div>
              <div><dt>预收</dt><dd>{{ formatCurrency(period.prepaidAmount) }}</dd></div>
            </dl>

            <div v-if="period.payments.length" class="table-shell reconciliation-payment-table">
              <el-table :data="period.payments" size="small" row-key="id">
                <el-table-column prop="paymentDate" label="付款日期" width="104" />
                <el-table-column label="金额" width="112" align="right">
                  <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
                </el-table-column>
                <el-table-column prop="method" label="方式" width="90" show-overflow-tooltip />
                <el-table-column label="付款凭证" width="94" class-name="reconciliation-screen-only">
                  <template #default="{ row }">
                    <el-button
                      v-if="row.attachmentFiles.length"
                      text
                      type="primary"
                      @click="openVoucherPreview(row.attachmentFiles)"
                    >
                      {{ row.attachmentFiles.length }} 张
                    </el-button>
                    <span v-else>--</span>
                  </template>
                </el-table-column>
                <el-table-column label="收据" min-width="132">
                  <template #default="{ row }">
                    <span>{{ row.activeReceipt?.receiptNo || "未开收据" }}</span>
                    <el-button
                      v-if="row.activeReceipt?.pdfFile"
                      class="reconciliation-screen-only"
                      text
                      type="primary"
                      @click="openReceiptPreview(row.activeReceipt.pdfFile.id)"
                    >
                      查看收据
                    </el-button>
                  </template>
                </el-table-column>
                <el-table-column label="备注" min-width="140" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.note || "--" }}</template>
                </el-table-column>
              </el-table>
            </div>
            <div v-else class="reconciliation-period-empty">本期暂无实付记录</div>
          </section>
        </div>
      </template>
    </section>

    <el-dialog v-model="receiptPreviewVisible" title="收据预览" width="960px">
      <iframe v-if="receiptPreviewFileId" class="file-preview-frame" :src="apiFileUrl(receiptPreviewFileId)" />
      <template #footer>
        <el-button @click="receiptPreviewVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <PaymentVoucherPreviewDialog
      v-model="voucherPreviewVisible"
      :files="voucherPreviewFiles"
      title="房租收款凭证"
    />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AppShell from "../../../components/AppShell.vue";
import PaymentVoucherPreviewDialog from "../../../components/PaymentVoucherPreviewDialog.vue";
import { apiFileUrl } from "../../../api/client";
import { formatCurrency } from "../../../utils/format";
import { rentReconciliationApi } from "../api";
import type {
  ReconciliationFile,
  RentReconciliationListResponse,
  RentReconciliationPeriodStatus,
  RentReconciliationStatus,
  TenantReconciliationDetail,
} from "../types";

const loading = ref(false);
const detailLoading = ref(false);
const downloading = ref(false);
const selectedTenantName = ref("");
const detail = ref<TenantReconciliationDetail | null>(null);
const listResponse = ref<RentReconciliationListResponse>({ items: [], availableYears: [] });
const tenantOptions = ref<string[]>([]);
const receiptPreviewVisible = ref(false);
const receiptPreviewFileId = ref("");
const voucherPreviewVisible = ref(false);
const voucherPreviewFiles = ref<ReconciliationFile[]>([]);
let listRequestSequence = 0;
let detailRequestSequence = 0;

const filters = reactive<{
  keyword: string;
  year: number | "";
  status: RentReconciliationStatus | "";
}>({
  keyword: "",
  year: "",
  status: "",
});

const selectedYear = computed(() => (filters.year === "" ? undefined : filters.year));

onMounted(loadList);

async function loadList() {
  const requestSequence = ++listRequestSequence;
  const query = {
    keyword: filters.keyword.trim() || undefined,
    year: selectedYear.value,
    status: filters.status || undefined,
  };
  try {
    loading.value = true;
    const response = await rentReconciliationApi.list(query);
    if (requestSequence !== listRequestSequence) return;
    listResponse.value = response;
    if (!query.keyword && query.year === undefined && !query.status) {
      tenantOptions.value = [...new Set(response.items.map((item) => item.tenantName).filter(Boolean))];
    }
  } catch (error) {
    if (requestSequence === listRequestSequence) {
      listResponse.value = { items: [], availableYears: listResponse.value.availableYears };
      ElMessage.error(error instanceof Error ? error.message : "加载房租对账失败");
    }
  } finally {
    if (requestSequence === listRequestSequence) {
      loading.value = false;
    }
  }
}

async function loadDetail() {
  if (!selectedTenantName.value) {
    return;
  }

  const requestSequence = ++detailRequestSequence;
  const query = {
    tenantName: selectedTenantName.value,
    year: selectedYear.value,
  };
  try {
    detailLoading.value = true;
    const response = await rentReconciliationApi.detail(query);
    if (requestSequence !== detailRequestSequence) return;
    detail.value = response;
  } catch (error) {
    if (requestSequence === detailRequestSequence) {
      detail.value = null;
      ElMessage.error(error instanceof Error ? error.message : "加载对账明细失败");
    }
  } finally {
    if (requestSequence === detailRequestSequence) {
      detailLoading.value = false;
    }
  }
}

async function openDetail(tenantName: string) {
  selectedTenantName.value = tenantName;
  detail.value = null;
  await loadDetail();
}

function backToSummary() {
  detailRequestSequence += 1;
  selectedTenantName.value = "";
  detail.value = null;
  detailLoading.value = false;
}

async function resetFilters() {
  filters.keyword = "";
  filters.year = "";
  filters.status = "";
  await loadList();
}

function statusLabel(status: RentReconciliationStatus) {
  if (status === "outstanding") return "欠款";
  if (status === "credit") return "有结余";
  if (status === "prepaid") return "有预收";
  return "已结清";
}

function statusTagType(status: RentReconciliationStatus) {
  if (status === "outstanding") return "danger";
  if (status === "credit" || status === "prepaid") return "warning";
  return "success";
}

function periodStatusLabel(status: RentReconciliationPeriodStatus) {
  if (status === "overdue") return "欠款";
  if (status === "not-due") return "未到期";
  if (status === "partially-prepaid") return "部分预收";
  if (status === "prepaid") return "已预收";
  return "已结清";
}

function periodStatusTagType(status: RentReconciliationPeriodStatus) {
  if (status === "overdue") return "danger";
  if (status === "partially-prepaid" || status === "prepaid") return "warning";
  if (status === "not-due") return "info";
  return "success";
}

function openVoucherPreview(files: ReconciliationFile[]) {
  voucherPreviewFiles.value = files;
  voucherPreviewVisible.value = true;
}

function openReceiptPreview(fileId: string) {
  if (receiptPreviewVisible.value && receiptPreviewFileId.value === fileId) return;
  receiptPreviewFileId.value = fileId;
  receiptPreviewVisible.value = true;
}

function printDetail() {
  if (detail.value) {
    window.print();
  }
}

async function downloadPdf() {
  if (!detail.value || downloading.value) {
    return;
  }

  let objectUrl = "";
  try {
    downloading.value = true;
    const downloaded = await rentReconciliationApi.downloadPdf({
      tenantName: detail.value.tenantName,
      year: selectedYear.value,
    });
    objectUrl = URL.createObjectURL(downloaded.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = downloaded.filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "下载房租对账单失败");
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    downloading.value = false;
  }
}
</script>

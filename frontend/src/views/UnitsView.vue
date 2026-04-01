<template>
  <AppShell>
    <template #top-actions>
      <div class="toolbar-row">
        <el-button type="primary" @click="openCreateUnit">新增厂房</el-button>
        <el-button @click="loadUnits">刷新</el-button>
      </div>
    </template>

    <section class="panel-card page-panel">
      <div class="stats-row units-stats-row">
        <div class="stat-item">
          <small>厂房总数</small>
          <strong>{{ units.length }}</strong>
        </div>
        <div class="stat-item">
          <small>当前在租</small>
          <strong>{{ occupiedCount }}</strong>
        </div>
        <div class="stat-item">
          <small>空置数量</small>
          <strong>{{ vacantCount }}</strong>
        </div>
        <div class="stat-item">
          <small>即将到期</small>
          <strong>{{ expiringCount }}</strong>
        </div>
        <div class="stat-item stat-item-sensitive">
          <div class="stat-item-head">
            <small>当前年租金合计</small>
            <button class="stat-toggle-button" type="button" @click="rentSumVisible = !rentSumVisible">
              {{ rentSumVisible ? "隐藏" : "显示" }}
            </button>
          </div>
          <strong>{{ rentSumVisible ? formatCurrency(activeRentSum) : "*****" }}</strong>
        </div>
      </div>
    </section>

    <section class="panel-card page-panel">
      <div class="table-shell">
        <el-table :data="units" v-loading="loading" size="small" class="units-table">
        <el-table-column prop="code" label="编号" width="62" />
        <el-table-column prop="location" label="位置" min-width="92" show-overflow-tooltip />
        <el-table-column label="面积(㎡)" width="84">
          <template #default="{ row }">
            {{ formatArea(row.area) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="74">
          <template #default="{ row }">
            <el-tag :type="unitStatusTagType(row.status)">
              {{ unitStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前租户" min-width="102" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.activeContract?.tenantName || "--" }}
          </template>
        </el-table-column>
        <el-table-column label="当前合同" min-width="168" show-overflow-tooltip>
          <template #default="{ row }">
            {{
              row.activeContract
                ? `${row.activeContract.startDate} 至 ${row.activeContract.endDate}`
                : "--"
            }}
          </template>
        </el-table-column>
        <el-table-column label="当前年租金" min-width="124">
          <template #default="{ row }">
            {{
              row.activeContract
                ? displayRentAmount(row.activeContract.annualRent)
                : "--"
            }}
          </template>
        </el-table-column>
        <el-table-column label="当前合同欠费" min-width="124">
          <template #default="{ row }">
            {{
              row.activeContract
                ? displayRentAmount(row.activeContract.outstandingAmount)
                : "--"
            }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" :fixed="actionColumnFixed">
          <template #default="{ row }">
            <el-space wrap>
              <el-button text type="primary" @click="openDetail(row.id)">管理</el-button>
              <el-button text type="danger" @click="confirmRemoveUnit(row.id)">删除</el-button>
            </el-space>
          </template>
        </el-table-column>
        </el-table>
      </div>
    </section>

    <el-dialog v-model="unitDialogVisible" :title="unitForm.id ? '编辑厂房' : '新增厂房'" width="760px">
      <el-form label-position="top">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="厂房编号">
              <el-input v-model="unitForm.code" placeholder="例如 A-01" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="位置">
              <el-input v-model="unitForm.location" placeholder="例如 东区 1 号车间" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="面积(平方米)">
              <el-input-number
                v-model="unitForm.area"
                :min="0"
                :precision="2"
                controls-position="right"
                placeholder="例如 500"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <template v-if="!unitForm.id">
          <div class="detail-section">
            <div class="page-header" style="margin-bottom: 12px">
              <div>
                <h3>初始合同信息</h3>
                <p>如果厂房当前已出租，可在新增厂房时一并录入租户、年租金、合同日期和附件。</p>
              </div>
            </div>

            <el-row :gutter="14">
              <el-col :span="12">
                <el-form-item label="公司名称">
                  <el-input v-model="unitContractForm.tenantName" placeholder="为空则视为空置" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="营业执照代码">
                  <el-input v-model="unitContractForm.licenseCode" placeholder="统一社会信用代码" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="14">
              <el-col :span="12">
                <el-form-item label="负责人">
                  <el-input v-model="unitContractForm.contactName" placeholder="例如 林建生" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="电话">
                  <el-input v-model="unitContractForm.tenantPhone" placeholder="例如 13800000000" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="14">
              <el-col :span="12">
                <el-form-item label="合同开始">
                  <el-date-picker
                    v-model="unitContractForm.startDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    style="width: 100%"
                    @change="handleUnitContractStartDateChange"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="合同结束">
                  <el-date-picker
                    v-model="unitContractForm.endDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="年租金">
              <el-input-number
                v-model="unitContractForm.annualRent"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </el-form-item>

            <el-form-item label="营业执照">
              <div class="detail-grid">
                <div v-if="unitBusinessLicenseUpload" class="file-chip-list">
                  <span class="file-chip">营业执照</span>
                </div>
                <input
                  ref="unitBusinessLicenseInput"
                  type="file"
                  accept=".pdf,image/*"
                  @change="onUnitBusinessLicenseChange"
                />
              </div>
            </el-form-item>

            <el-form-item label="合同附件">
              <div class="detail-grid">
                <div v-if="unitAttachmentUploads.length" class="file-chip-list">
                  <span
                    v-for="(file, index) in unitAttachmentUploads"
                    :key="file.name + file.size"
                    class="file-chip"
                  >
                    {{ attachmentPreviewLabel(index, unitAttachmentUploads.length) }}
                  </span>
                </div>
                <input
                  ref="unitAttachmentInput"
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  @change="onUnitAttachmentFilesChange"
                />
              </div>
            </el-form-item>
          </div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="unitDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingUnit" @click="saveUnit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailDrawerVisible"
      width="min(1180px, 92vw)"
      top="4vh"
      :show-close="false"
      class="unit-detail-dialog"
    >
      <div v-if="selectedUnit" class="detail-grid">
        <section class="detail-section">
          <div class="page-header">
            <div>
              <h2>厂房基础信息</h2>
              <p>
                当前状态：
                {{ unitStatusLabel(selectedUnit.status) }}
                <span v-if="selectedUnit.activeContract">
                  ，当前租户 {{ selectedUnit.activeContract.tenantName }}
                </span>
              </p>
            </div>
            <div class="toolbar-row">
              <el-button @click="refreshSelectedUnit">刷新</el-button>
              <el-button type="primary" :loading="submittingDetailUnit" @click="saveDetailUnit">
                保存基础信息
              </el-button>
            </div>
          </div>

          <el-form label-position="top">
            <el-row :gutter="14">
              <el-col :span="12">
                <el-form-item label="厂房编号">
                  <el-input v-model="detailUnitForm.code" placeholder="例如 A-01" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="位置">
                  <el-input v-model="detailUnitForm.location" placeholder="例如 东区 1 号车间" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="14">
              <el-col :span="12">
                <el-form-item label="面积(平方米)">
                  <el-input-number
                    v-model="detailUnitForm.area"
                    :min="0"
                    :precision="2"
                    controls-position="right"
                    placeholder="例如 500"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </section>

        <section class="detail-section">
          <div class="page-header">
            <div>
              <h3>合同历史</h3>
              <p>营业执照和合同附件都挂在具体合同记录下。</p>
            </div>
            <div class="toolbar-row section-toolbar-row">
              <el-button type="primary" @click="openCreateContract">新增合同</el-button>
            </div>
          </div>

          <div class="table-shell">
            <el-table :data="selectedUnit.contracts">
            <el-table-column prop="tenantName" label="公司名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="contactName" label="负责人" min-width="110" show-overflow-tooltip />
            <el-table-column prop="tenantPhone" label="电话" min-width="130" show-overflow-tooltip />
            <el-table-column label="合同周期" min-width="210">
              <template #default="{ row }">
                {{ row.startDate }} 至 {{ row.endDate }}
              </template>
            </el-table-column>
            <el-table-column label="应收" min-width="118">
              <template #default="{ row }">
                {{ displayRentAmount(row.annualRent) }}
              </template>
            </el-table-column>
            <el-table-column label="已收" min-width="118">
              <template #default="{ row }">
                {{ displayRentAmount(row.paidAmount) }}
              </template>
            </el-table-column>
            <el-table-column label="欠费" min-width="118">
              <template #default="{ row }">
                {{ displayRentAmount(row.outstandingAmount) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="contractTagType(row.status)">
                  {{ contractStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="附件" min-width="220">
              <template #default="{ row }">
                <div class="file-chip-list">
                  <button
                    v-if="row.businessLicenseFile"
                    type="button"
                    class="file-chip"
                    @click="openFilePreview(row.businessLicenseFile, '营业执照')"
                  >
                    营业执照
                  </button>
                  <button
                    v-for="(file, index) in row.attachmentFiles"
                    :key="file.id"
                    type="button"
                    class="file-chip"
                    @click="openFilePreview(file, attachmentPreviewLabel(index, row.attachmentFiles.length))"
                  >
                    {{ attachmentPreviewLabel(index, row.attachmentFiles.length) }}
                  </button>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-space wrap>
                  <el-button text @click="openEditContract(row)">编辑</el-button>
                  <el-button text type="danger" @click="confirmRemoveContract(row.id)">删除</el-button>
                </el-space>
              </template>
            </el-table-column>
            </el-table>
          </div>
        </section>

        <section class="detail-section">
          <div class="page-header">
            <div>
              <h3>水电表配置</h3>
              <p>每个表计分别维护初始读数、倍率、单价和线损。</p>
            </div>
            <div class="toolbar-row section-toolbar-row">
              <el-button type="primary" @click="openCreateMeter">新增表计</el-button>
            </div>
          </div>

          <div class="table-shell">
            <el-table :data="selectedUnit.meterConfigs">
            <el-table-column label="类型" width="120">
              <template #default="{ row }">
                {{ row.type === "electric" ? "电表" : "水表" }}
              </template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="160" />
            <el-table-column prop="initialReading" label="初始读数" min-width="120" />
            <el-table-column prop="multiplier" label="倍率" min-width="110" />
            <el-table-column prop="unitPrice" label="单价" min-width="110" />
            <el-table-column prop="lineLossPercent" label="线损%" min-width="110" />
            <el-table-column label="启用" width="90">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'">
                  {{ row.enabled ? "是" : "否" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-space wrap>
                  <el-button text @click="openEditMeter(row)">编辑</el-button>
                  <el-button text type="danger" @click="confirmRemoveMeter(row.id)">删除</el-button>
                </el-space>
              </template>
            </el-table-column>
            </el-table>
          </div>
        </section>
      </div>
    </el-dialog>

    <el-dialog v-model="contractDialogVisible" :title="contractForm.id ? '编辑合同' : '新增合同'" width="760px">
        <el-form label-position="top">
          <el-row :gutter="14">
            <el-col :span="12">
            <el-form-item label="公司名称">
              <el-input v-model="contractForm.tenantName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="营业执照代码">
              <el-input v-model="contractForm.licenseCode" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-input v-model="contractForm.contactName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话">
              <el-input v-model="contractForm.tenantPhone" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="合同开始">
              <el-date-picker
                v-model="contractForm.startDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
                @change="handleContractStartDateChange"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同结束">
              <el-date-picker v-model="contractForm.endDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="年租金">
          <el-input-number v-model="contractForm.annualRent" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>

        <el-form-item label="营业执照">
          <div class="detail-grid">
            <div v-if="existingBusinessLicense" class="file-chip-list">
              <button
                type="button"
                class="file-chip"
                @click="openFilePreview(existingBusinessLicense, '营业执照')"
              >
                营业执照
              </button>
              <el-button text type="danger" @click="removeBusinessLicense">移除</el-button>
            </div>
            <input type="file" accept=".pdf,image/*" @change="onBusinessLicenseChange" />
          </div>
        </el-form-item>

        <el-form-item label="合同附件">
          <div class="detail-grid">
            <div class="file-chip-list" v-if="existingAttachments.length">
              <span v-for="(file, index) in existingAttachments" :key="file.id" class="file-chip">
                <button
                  type="button"
                  class="file-chip-link"
                  @click="openFilePreview(file, attachmentPreviewLabel(index, existingAttachments.length))"
                >
                  {{ attachmentPreviewLabel(index, existingAttachments.length) }}
                </button>
                <el-button text type="danger" @click="removeAttachment(file.id)">移除</el-button>
              </span>
            </div>
            <input type="file" accept=".pdf,image/*" multiple @change="onAttachmentFilesChange" />
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="contractDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingContract" @click="saveContract">保存合同</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="meterDialogVisible" :title="meterForm.id ? '编辑表计' : '新增表计'" width="620px">
      <el-form label-position="top">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="类型">
              <el-select v-model="meterForm.type" style="width: 100%">
                <el-option label="电表" value="electric" />
                <el-option label="水表" value="water" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="表计名称">
              <el-input v-model="meterForm.name" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="初始读数">
              <el-input-number v-model="meterForm.initialReading" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="倍率">
              <el-input-number v-model="meterForm.multiplier" :min="0" :precision="4" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="单价">
              <el-input-number v-model="meterForm.unitPrice" :min="0" :precision="4" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="线损(%)">
              <el-input-number v-model="meterForm.lineLossPercent" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="启用">
          <el-switch v-model="meterForm.enabled" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="meterDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingMeter" @click="saveMeter">保存表计</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="filePreviewVisible" :title="filePreviewTitle" width="72%" top="4vh">
      <div v-if="previewFile" class="file-preview-shell">
        <img
          v-if="isPreviewImage(previewFile)"
          class="file-preview-image"
          :src="apiFileUrl(previewFile.id)"
          :alt="filePreviewTitle"
        />
        <iframe
          v-else-if="isPreviewPdf(previewFile)"
          class="file-preview-frame"
          :src="apiFileUrl(previewFile.id)"
          :title="filePreviewTitle"
        />
        <div v-else class="file-preview-empty">
          <p>当前文件类型不支持页内预览。</p>
          <el-button type="primary" @click="downloadPreviewFile">下载文件</el-button>
        </div>
      </div>
    </el-dialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AppShell from "../components/AppShell.vue";
import { apiFileUrl } from "../api/client";
import { contractsApi, filesApi, unitsApi, utilitiesApi } from "../api";
import { useViewportWidth } from "../composables/useViewportWidth";
import type { Contract, MeterConfig, StoredFile, UnitSummary } from "../types/models";
import { formatCurrency } from "../utils/format";

const loading = ref(false);
const units = ref<UnitSummary[]>([]);
const selectedUnit = ref<UnitSummary | null>(null);
const detailDrawerVisible = ref(false);
const submittingDetailUnit = ref(false);
const detailUnitForm = reactive({
  id: "",
  code: "",
  location: "",
  area: null as number | null,
});

const unitDialogVisible = ref(false);
const submittingUnit = ref(false);
const unitForm = reactive({
  id: "",
  code: "",
  location: "",
  area: null as number | null,
});
const unitContractForm = reactive({
  tenantName: "",
  contactName: "",
  tenantPhone: "",
  licenseCode: "",
  startDate: "",
  endDate: "",
  annualRent: 0,
});
const unitBusinessLicenseUpload = ref<File | null>(null);
const unitAttachmentUploads = ref<File[]>([]);
const unitBusinessLicenseInput = ref<HTMLInputElement | null>(null);
const unitAttachmentInput = ref<HTMLInputElement | null>(null);

const contractDialogVisible = ref(false);
const submittingContract = ref(false);
const contractForm = reactive({
  id: "",
  tenantName: "",
  contactName: "",
  tenantPhone: "",
  licenseCode: "",
  startDate: "",
  endDate: "",
  annualRent: 0,
  businessLicenseFileId: "",
  attachmentFileIds: [] as string[],
});
const existingBusinessLicense = ref<StoredFile | null>(null);
const existingAttachments = ref<StoredFile[]>([]);
const businessLicenseUpload = ref<File | null>(null);
const attachmentUploads = ref<File[]>([]);

const meterDialogVisible = ref(false);
const submittingMeter = ref(false);
const meterForm = reactive({
  id: "",
  type: "electric" as "electric" | "water",
  name: "",
  initialReading: 0,
  multiplier: 1,
  unitPrice: 0,
  lineLossPercent: 0,
  enabled: true,
});
const filePreviewVisible = ref(false);
const previewFile = ref<StoredFile | null>(null);
const filePreviewTitle = ref("文件预览");
const viewportWidth = useViewportWidth();
const rentSumVisible = ref(false);

const occupiedCount = computed(() => units.value.filter((item) => item.status !== "vacant").length);
const vacantCount = computed(() => units.value.filter((item) => item.status === "vacant").length);
const expiringCount = computed(() => units.value.filter((item) => item.status === "expiring").length);
const activeRentSum = computed(() =>
  units.value.reduce((sum, item) => sum + Number(item.activeContract?.annualRent ?? 0), 0),
);
const actionColumnFixed = computed<false | "right">(() => (viewportWidth.value < 768 ? false : "right"));

onMounted(loadUnits);

async function loadUnits() {
  try {
    loading.value = true;
    units.value = await unitsApi.list();
    if (selectedUnit.value) {
      const found = units.value.find((item) => item.id === selectedUnit.value?.id);
      if (found && detailDrawerVisible.value) {
        await openDetail(found.id);
      }
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载厂房失败");
  } finally {
    loading.value = false;
  }
}

function resetUnitForm() {
  unitForm.id = "";
  unitForm.code = "";
  unitForm.location = "";
  unitForm.area = null;
  resetUnitContractForm();
}

function resetUnitContractForm() {
  unitContractForm.tenantName = "";
  unitContractForm.contactName = "";
  unitContractForm.tenantPhone = "";
  unitContractForm.licenseCode = "";
  unitContractForm.startDate = "";
  unitContractForm.endDate = "";
  unitContractForm.annualRent = 0;
  unitBusinessLicenseUpload.value = null;
  unitAttachmentUploads.value = [];
  if (unitBusinessLicenseInput.value) {
    unitBusinessLicenseInput.value.value = "";
  }
  if (unitAttachmentInput.value) {
    unitAttachmentInput.value.value = "";
  }
}

function openCreateUnit() {
  resetUnitForm();
  unitDialogVisible.value = true;
}

async function saveUnit() {
  try {
    submittingUnit.value = true;
    const payload = {
      code: unitForm.code.trim(),
      location: unitForm.location.trim(),
      area: normalizeArea(unitForm.area),
    };
    validateUnitForm(payload.code, payload.location, payload.area);
    if (unitForm.id) {
      await unitsApi.update(unitForm.id, payload);
      ElMessage.success("厂房已更新");
    } else {
      const shouldCreateInitialContract = hasInitialContractInput();
      if (shouldCreateInitialContract) {
        validateInitialContractForm();
      }

      const createdUnit = await unitsApi.create(payload);

      if (shouldCreateInitialContract) {
        try {
          const businessLicenseFileId = unitBusinessLicenseUpload.value
            ? (await filesApi.upload([unitBusinessLicenseUpload.value], "business-license"))[0].id
            : "";

          const attachmentFileIds = unitAttachmentUploads.value.length
            ? (await filesApi.upload(unitAttachmentUploads.value, "contract-attachment")).map((item) => item.id)
            : [];

          await contractsApi.create({
            unitId: createdUnit.id,
            tenantName: unitContractForm.tenantName.trim(),
            contactName: unitContractForm.contactName.trim(),
            tenantPhone: unitContractForm.tenantPhone.trim(),
            licenseCode: unitContractForm.licenseCode.trim(),
            startDate: unitContractForm.startDate,
            endDate: unitContractForm.endDate,
            annualRent: Number(unitContractForm.annualRent),
            businessLicenseFileId,
            attachmentFileIds,
          });
          ElMessage.success("厂房和初始合同已新增");
        } catch (contractError) {
          unitDialogVisible.value = false;
          ElMessage.warning(
            contractError instanceof Error
              ? `厂房已新增，但初始合同保存失败：${contractError.message}`
              : "厂房已新增，但初始合同保存失败，请在详情里补录合同",
          );
          try {
            await loadUnits();
          } catch {
            // Keep the original contract-save failure visible instead of masking it with a refresh error.
          }
          return;
        }
      } else {
        ElMessage.success("厂房已新增");
      }
    }
    unitDialogVisible.value = false;
    await loadUnits();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存厂房失败");
  } finally {
    submittingUnit.value = false;
  }
}

function onUnitBusinessLicenseChange(event: Event) {
  const target = event.target as HTMLInputElement;
  unitBusinessLicenseUpload.value = target.files?.[0] ?? null;
}

function onUnitAttachmentFilesChange(event: Event) {
  const target = event.target as HTMLInputElement;
  unitAttachmentUploads.value = Array.from(target.files ?? []);
}

function openFilePreview(file: StoredFile, title: string) {
  previewFile.value = file;
  filePreviewTitle.value = title;
  filePreviewVisible.value = true;
}

function attachmentPreviewLabel(index: number, total: number) {
  return total > 1 ? `合同附件 ${index + 1}` : "合同附件";
}

function isPreviewImage(file: StoredFile) {
  return file.mimeType.startsWith("image/");
}

function isPreviewPdf(file: StoredFile) {
  return file.mimeType.includes("pdf");
}

function downloadPreviewFile() {
  if (!previewFile.value) {
    return;
  }

  window.open(apiFileUrl(previewFile.value.id), "_self");
}

function handleUnitContractStartDateChange() {
  unitContractForm.endDate = deriveContractEndDate(unitContractForm.startDate);
}

function validateUnitForm(code: string, location: string, area: number | null) {
  if (!code) {
    throw new Error("厂房编号不能为空");
  }

  if (!location) {
    throw new Error("位置不能为空");
  }

  if (area !== null && Number(area) < 0) {
    throw new Error("面积不能小于 0");
  }

  const normalizedCode = code.toLowerCase();
  const duplicated = units.value.some(
    (item) => item.id !== unitForm.id && item.code.trim().toLowerCase() === normalizedCode,
  );

  if (duplicated) {
    throw new Error("厂房编号已存在");
  }
}

function hasInitialContractInput() {
  return Boolean(
    unitContractForm.tenantName.trim() ||
      unitContractForm.contactName.trim() ||
      unitContractForm.tenantPhone.trim() ||
      unitContractForm.licenseCode.trim() ||
      unitContractForm.startDate ||
      unitContractForm.endDate ||
      Number(unitContractForm.annualRent) > 0 ||
      unitBusinessLicenseUpload.value ||
      unitAttachmentUploads.value.length,
  );
}

function validateInitialContractForm() {
  if (!unitContractForm.tenantName.trim()) {
    throw new Error("新增初始合同时，公司名称不能为空");
  }
  if (!unitContractForm.contactName.trim()) {
    throw new Error("新增初始合同时，负责人不能为空");
  }
  if (!unitContractForm.tenantPhone.trim()) {
    throw new Error("新增初始合同时，电话不能为空");
  }
  if (!unitContractForm.startDate) {
    throw new Error("新增初始合同时，合同开始日期不能为空");
  }
  if (!unitContractForm.endDate) {
    throw new Error("新增初始合同时，合同结束日期不能为空");
  }
  if (Number(unitContractForm.annualRent) <= 0) {
    throw new Error("新增初始合同时，年租金必须大于 0");
  }
}

async function openDetail(unitId: string) {
  try {
    selectedUnit.value = await unitsApi.detail(unitId);
    syncDetailUnitForm(selectedUnit.value);
    detailDrawerVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载详情失败");
  }
}

async function refreshSelectedUnit() {
  if (!selectedUnit.value) {
    return;
  }
  selectedUnit.value = await unitsApi.detail(selectedUnit.value.id);
  syncDetailUnitForm(selectedUnit.value);
}

async function saveDetailUnit() {
  if (!selectedUnit.value) {
    return;
  }

  try {
    submittingDetailUnit.value = true;
    await unitsApi.update(selectedUnit.value.id, {
      code: detailUnitForm.code.trim(),
      location: detailUnitForm.location.trim(),
      area: normalizeArea(detailUnitForm.area),
    });
    ElMessage.success("厂房基础信息已更新");
    await Promise.all([refreshSelectedUnit(), loadUnits()]);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "更新厂房基础信息失败");
  } finally {
    submittingDetailUnit.value = false;
  }
}

async function confirmRemoveUnit(unitId: string) {
  try {
    await ElMessageBox.confirm("删除后将无法恢复，确定继续吗？", "删除厂房", { type: "warning" });
    await unitsApi.remove(unitId);
    ElMessage.success("厂房已删除");
    await loadUnits();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}

function resetContractForm() {
  contractForm.id = "";
  contractForm.tenantName = "";
  contractForm.contactName = "";
  contractForm.tenantPhone = "";
  contractForm.licenseCode = "";
  contractForm.startDate = "";
  contractForm.endDate = "";
  contractForm.annualRent = 0;
  contractForm.businessLicenseFileId = "";
  contractForm.attachmentFileIds = [];
  existingBusinessLicense.value = null;
  existingAttachments.value = [];
  businessLicenseUpload.value = null;
  attachmentUploads.value = [];
}

function openCreateContract() {
  resetContractForm();
  const latestContract = selectedUnit.value?.contracts?.[0];
  if (latestContract) {
    contractForm.tenantName = latestContract.tenantName;
    contractForm.contactName = latestContract.contactName;
    contractForm.tenantPhone = latestContract.tenantPhone;
    contractForm.licenseCode = latestContract.licenseCode;
    contractForm.startDate = deriveNextDate(latestContract.endDate);
    contractForm.endDate = deriveContractEndDate(contractForm.startDate);
  }
  contractDialogVisible.value = true;
}

function openEditContract(contract: Contract) {
  resetContractForm();
  contractForm.id = contract.id;
  contractForm.tenantName = contract.tenantName;
  contractForm.contactName = contract.contactName;
  contractForm.tenantPhone = contract.tenantPhone;
  contractForm.licenseCode = contract.licenseCode;
  contractForm.startDate = contract.startDate;
  contractForm.endDate = contract.endDate;
  contractForm.annualRent = contract.annualRent;
  contractForm.businessLicenseFileId = contract.businessLicenseFile?.id ?? "";
  contractForm.attachmentFileIds = contract.attachmentFiles.map((item) => item.id);
  existingBusinessLicense.value = contract.businessLicenseFile;
  existingAttachments.value = [...contract.attachmentFiles];
  contractDialogVisible.value = true;
}

function onBusinessLicenseChange(event: Event) {
  const target = event.target as HTMLInputElement;
  businessLicenseUpload.value = target.files?.[0] ?? null;
}

function onAttachmentFilesChange(event: Event) {
  const target = event.target as HTMLInputElement;
  attachmentUploads.value = Array.from(target.files ?? []);
}

function handleContractStartDateChange() {
  if (!contractForm.id) {
    contractForm.endDate = deriveContractEndDate(contractForm.startDate);
  }
}

function validateContractForm() {
  if (!contractForm.tenantName.trim()) {
    throw new Error("公司名称不能为空");
  }
  if (!contractForm.contactName.trim()) {
    throw new Error("负责人不能为空");
  }
  if (!contractForm.tenantPhone.trim()) {
    throw new Error("电话不能为空");
  }
  if (!contractForm.startDate) {
    throw new Error("合同开始日期不能为空");
  }
  if (!contractForm.endDate) {
    throw new Error("合同结束日期不能为空");
  }
  if (Number(contractForm.annualRent) <= 0) {
    throw new Error("年租金必须大于 0");
  }
}

function removeBusinessLicense() {
  existingBusinessLicense.value = null;
  contractForm.businessLicenseFileId = "";
}

function removeAttachment(fileId: string) {
  existingAttachments.value = existingAttachments.value.filter((item) => item.id !== fileId);
  contractForm.attachmentFileIds = contractForm.attachmentFileIds.filter((item) => item !== fileId);
}

async function saveContract() {
  if (!selectedUnit.value) {
    return;
  }

  try {
    submittingContract.value = true;
    validateContractForm();

    let businessLicenseFileId = contractForm.businessLicenseFileId || "";
    if (businessLicenseUpload.value) {
      const [uploaded] = await filesApi.upload([businessLicenseUpload.value], "business-license");
      businessLicenseFileId = uploaded.id;
    }

    let attachmentFileIds = [...contractForm.attachmentFileIds];
    if (attachmentUploads.value.length) {
      const uploaded = await filesApi.upload(attachmentUploads.value, "contract-attachment");
      attachmentFileIds = [...attachmentFileIds, ...uploaded.map((item) => item.id)];
    }

    const payload = {
      unitId: selectedUnit.value.id,
      tenantName: contractForm.tenantName.trim(),
      contactName: contractForm.contactName.trim(),
      tenantPhone: contractForm.tenantPhone.trim(),
      licenseCode: contractForm.licenseCode.trim(),
      startDate: contractForm.startDate,
      endDate: contractForm.endDate,
      annualRent: Number(contractForm.annualRent),
      businessLicenseFileId,
      attachmentFileIds,
    };

    if (contractForm.id) {
      await contractsApi.update(contractForm.id, payload);
      ElMessage.success("合同已更新");
    } else {
      await contractsApi.create(payload);
      ElMessage.success("合同已新增");
    }

    contractDialogVisible.value = false;
    await Promise.all([refreshSelectedUnit(), loadUnits()]);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存合同失败");
  } finally {
    submittingContract.value = false;
  }
}

async function confirmRemoveContract(contractId: string) {
  try {
    await ElMessageBox.confirm("确认删除这条合同记录吗？", "删除合同", { type: "warning" });
    await contractsApi.remove(contractId);
    ElMessage.success("合同已删除");
    await Promise.all([refreshSelectedUnit(), loadUnits()]);
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}

function resetMeterForm() {
  meterForm.id = "";
  meterForm.type = "electric";
  meterForm.name = "";
  meterForm.initialReading = 0;
  meterForm.multiplier = 1;
  meterForm.unitPrice = 0;
  meterForm.lineLossPercent = 0;
  meterForm.enabled = true;
}

function openCreateMeter() {
  resetMeterForm();
  meterDialogVisible.value = true;
}

function openEditMeter(meter: MeterConfig) {
  meterForm.id = meter.id;
  meterForm.type = meter.type;
  meterForm.name = meter.name;
  meterForm.initialReading = meter.initialReading;
  meterForm.multiplier = meter.multiplier;
  meterForm.unitPrice = meter.unitPrice;
  meterForm.lineLossPercent = meter.lineLossPercent;
  meterForm.enabled = meter.enabled;
  meterDialogVisible.value = true;
}

async function saveMeter() {
  if (!selectedUnit.value) {
    return;
  }

  try {
    submittingMeter.value = true;
    const payload = {
      unitId: selectedUnit.value.id,
      type: meterForm.type,
      name: meterForm.name.trim(),
      initialReading: Number(meterForm.initialReading),
      multiplier: Number(meterForm.multiplier),
      unitPrice: Number(meterForm.unitPrice),
      lineLossPercent: Number(meterForm.lineLossPercent),
      enabled: meterForm.enabled,
    };

    if (meterForm.id) {
      await utilitiesApi.updateMeterConfig(meterForm.id, payload);
      ElMessage.success("表计已更新");
    } else {
      await utilitiesApi.createMeterConfig(payload);
      ElMessage.success("表计已新增");
    }

    meterDialogVisible.value = false;
    await Promise.all([refreshSelectedUnit(), loadUnits()]);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存表计失败");
  } finally {
    submittingMeter.value = false;
  }
}

async function confirmRemoveMeter(meterId: string) {
  try {
    await ElMessageBox.confirm("确认删除这个表计配置吗？", "删除表计", { type: "warning" });
    await utilitiesApi.removeMeterConfig(meterId);
    ElMessage.success("表计已删除");
    await Promise.all([refreshSelectedUnit(), loadUnits()]);
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}

function contractStatusLabel(status: Contract["status"]) {
  if (status === "active") return "生效中";
  if (status === "future") return "待生效";
  return "已到期";
}

function contractTagType(status: Contract["status"]) {
  if (status === "active") return "success";
  if (status === "future") return "warning";
  return "info";
}

function unitStatusLabel(status: UnitSummary["status"]) {
  if (status === "occupied") return "在租";
  if (status === "expiring") return "即将到期";
  return "空置";
}

function unitStatusTagType(status: UnitSummary["status"]) {
  if (status === "occupied") return "success";
  if (status === "expiring") return "warning";
  return "info";
}

function syncDetailUnitForm(unit: UnitSummary) {
  detailUnitForm.id = unit.id;
  detailUnitForm.code = unit.code;
  detailUnitForm.location = unit.location;
  detailUnitForm.area = unit.area ?? null;
}

function normalizeArea(area: number | null) {
  return area === null || area === undefined ? null : Number(area);
}

function formatArea(area: number | null | undefined) {
  if (area === null || area === undefined) {
    return "--";
  }

  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(Number(area))} ㎡`;
}

function displayRentAmount(amount: number | null | undefined) {
  if (amount === null || amount === undefined) {
    return "--";
  }

  return rentSumVisible.value ? formatCurrency(Number(amount)) : "*****";
}

function deriveContractEndDate(startDate: string) {
  if (!startDate) {
    return "";
  }

  const [year, month, day] = startDate.split("-").map((value) => Number(value));
  if (!year || !month || !day) {
    return "";
  }

  const end = new Date(Date.UTC(year + 1, month - 1, day));
  end.setUTCDate(end.getUTCDate() - 1);

  const endYear = end.getUTCFullYear();
  const endMonth = String(end.getUTCMonth() + 1).padStart(2, "0");
  const endDay = String(end.getUTCDate()).padStart(2, "0");
  return `${endYear}-${endMonth}-${endDay}`;
}

function deriveNextDate(dateText: string) {
  if (!dateText) {
    return "";
  }

  const [year, month, day] = dateText.split("-").map((value) => Number(value));
  if (!year || !month || !day) {
    return "";
  }

  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);

  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(next.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}
</script>

<template>
  <AppShell>
    <template #top-actions>
      <div class="toolbar-row">
        <el-button type="primary" @click="openCreate">新增房租收费</el-button>
        <el-button @click="loadPageData">刷新</el-button>
      </div>
    </template>

    <section class="panel-card page-panel">
      <div class="page-header">
        <div>
          <h2>房租收费记录</h2>
          <p>房租收款按手工录入，不自动生成账期，收据可从已收款记录中开具。</p>
        </div>
      </div>

      <el-table :data="payments" v-loading="loading">
        <el-table-column label="厂房" min-width="120">
          <template #default="{ row }">
            {{ row.unit.code }}
          </template>
        </el-table-column>
        <el-table-column prop="tenantNameSnapshot" label="租户" min-width="180" />
        <el-table-column label="合同周期" min-width="220">
          <template #default="{ row }">
            {{ row.contract.startDate }} 至 {{ row.contract.endDate }}
          </template>
        </el-table-column>
        <el-table-column prop="paymentDate" label="付款日期" min-width="120" />
        <el-table-column label="金额" min-width="140">
          <template #default="{ row }">
            {{ formatCurrency(row.amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="method" label="方式" min-width="120" />
        <el-table-column label="备注" min-width="180">
          <template #default="{ row }">
            {{ row.note || "--" }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" :fixed="actionColumnFixed">
          <template #default="{ row }">
            <el-space wrap>
              <el-button text @click="openEdit(row)">编辑</el-button>
              <el-button text type="primary" @click="createReceipt(row.id)">开收据</el-button>
              <el-button text type="danger" @click="confirmRemove(row.id)">删除</el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑房租收费' : '新增房租收费'" width="620px">
      <el-form label-position="top">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="厂房">
              <el-select v-model="form.unitId" style="width: 100%" @change="handleUnitChange">
                <el-option
                  v-for="unit in units"
                  :key="unit.id"
                  :label="`${unit.code} / ${unit.location}`"
                  :value="unit.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="对应合同">
              <el-select v-model="form.contractId" style="width: 100%">
                <el-option
                  v-for="contract in selectedContracts"
                  :key="contract.id"
                  :label="`${contract.tenantName} (${contract.startDate}~${contract.endDate})`"
                  :value="contract.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="付款日期">
              <el-date-picker v-model="form.paymentDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="金额">
              <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="付款方式">
          <el-input v-model="form.method" placeholder="例如 转账、现金" />
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AppShell from "../components/AppShell.vue";
import { receiptsApi, rentPaymentsApi, unitsApi } from "../api";
import { useViewportWidth } from "../composables/useViewportWidth";
import type { Contract, RentPayment, UnitSummary } from "../types/models";
import { formatCurrency, todayIso } from "../utils/format";

const loading = ref(false);
const dialogVisible = ref(false);
const submitting = ref(false);
const units = ref<UnitSummary[]>([]);
const payments = ref<RentPayment[]>([]);
const viewportWidth = useViewportWidth();

const form = reactive({
  id: "",
  unitId: "",
  contractId: "",
  paymentDate: todayIso(),
  amount: 0,
  method: "转账",
  note: "",
});

const selectedUnit = computed(() => units.value.find((item) => item.id === form.unitId) || null);
const selectedContracts = computed<Contract[]>(() => selectedUnit.value?.contracts ?? []);
const actionColumnFixed = computed<false | "right">(() => (viewportWidth.value < 768 ? false : "right"));

onMounted(loadPageData);

async function loadPageData() {
  try {
    loading.value = true;
    const [unitList, paymentList] = await Promise.all([unitsApi.list(), rentPaymentsApi.list()]);
    units.value = unitList;
    payments.value = paymentList;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载房租记录失败");
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.id = "";
  form.unitId = units.value[0]?.id ?? "";
  form.contractId = "";
  form.paymentDate = todayIso();
  form.amount = 0;
  form.method = "转账";
  form.note = "";
}

function handleUnitChange() {
  form.contractId = selectedUnit.value?.activeContract?.id || selectedContracts.value[0]?.id || "";
}

function openCreate() {
  resetForm();
  handleUnitChange();
  dialogVisible.value = true;
}

function openEdit(record: RentPayment) {
  form.id = record.id;
  form.unitId = record.unitId;
  form.contractId = record.contractId;
  form.paymentDate = record.paymentDate;
  form.amount = record.amount;
  form.method = record.method;
  form.note = record.note || "";
  dialogVisible.value = true;
}

async function save() {
  try {
    submitting.value = true;
    const payload = {
      contractId: form.contractId,
      paymentDate: form.paymentDate,
      amount: Number(form.amount),
      method: form.method.trim(),
      note: form.note.trim(),
    };

    if (form.id) {
      await rentPaymentsApi.update(form.id, payload);
      ElMessage.success("房租收费已更新");
    } else {
      await rentPaymentsApi.create(payload);
      ElMessage.success("房租收费已新增");
    }

    dialogVisible.value = false;
    await loadPageData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存房租收费失败");
  } finally {
    submitting.value = false;
  }
}

async function createReceipt(paymentId: string) {
  try {
    await receiptsApi.create({
      sourceType: "rent-payment",
      sourceId: paymentId,
      issueDate: todayIso(),
    });
    ElMessage.success("收据已生成");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "生成收据失败");
  }
}

async function confirmRemove(paymentId: string) {
  try {
    await ElMessageBox.confirm("确认删除这条房租收费记录吗？", "删除记录", { type: "warning" });
    await rentPaymentsApi.remove(paymentId);
    ElMessage.success("记录已删除");
    await loadPageData();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    }
  }
}
</script>

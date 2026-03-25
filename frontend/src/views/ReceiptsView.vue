<template>
  <AppShell>
    <section class="panel-card page-panel">
      <div class="page-header">
        <div>
          <h2>收据中心</h2>
          <p>查看已生成的收据、打开 PDF、作废历史收据。</p>
        </div>
        <div class="toolbar-row">
          <el-button @click="loadReceipts">刷新</el-button>
        </div>
      </div>

      <el-table :data="receipts" v-loading="loading">
        <el-table-column prop="receiptNo" label="收据编号" min-width="180" />
        <el-table-column prop="tenantNameSnapshot" label="租户" min-width="180" />
        <el-table-column prop="unitCodeSnapshot" label="厂房" min-width="120" />
        <el-table-column label="来源" min-width="140">
          <template #default="{ row }">
            {{ row.sourceType === "utility" ? "水电缴费" : "房租收款" }}
          </template>
        </el-table-column>
        <el-table-column prop="issueDate" label="开具日期" min-width="120" />
        <el-table-column label="金额" min-width="150">
          <template #default="{ row }">
            {{ formatCurrency(row.amountSnapshot) }}
          </template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="240" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === "active" ? "有效" : "已作废" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190">
          <template #default="{ row }">
            <el-space wrap>
              <el-button v-if="row.pdfFile" text type="primary" @click="previewReceipt(row.pdfFile.id)">查看 PDF</el-button>
              <el-button v-if="row.status === 'active'" text type="danger" @click="voidReceipt(row.id)">
                作废
              </el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AppShell from "../components/AppShell.vue";
import { receiptsApi } from "../api";
import { apiFileUrl } from "../api/client";
import type { Receipt } from "../types/models";
import { formatCurrency } from "../utils/format";

const loading = ref(false);
const receipts = ref<Receipt[]>([]);

onMounted(loadReceipts);

async function loadReceipts() {
  try {
    loading.value = true;
    receipts.value = await receiptsApi.list();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载收据失败");
  } finally {
    loading.value = false;
  }
}

function previewReceipt(fileId: string) {
  window.open(apiFileUrl(fileId), "_blank");
}

async function voidReceipt(receiptId: string) {
  try {
    await ElMessageBox.confirm("确认作废这张收据吗？", "作废收据", { type: "warning" });
    await receiptsApi.voidReceipt(receiptId);
    ElMessage.success("收据已作废");
    await loadReceipts();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "作废失败");
    }
  }
}
</script>

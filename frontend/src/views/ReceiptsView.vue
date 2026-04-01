<template>
  <AppShell>
    <template #top-actions>
      <div class="toolbar-row">
        <el-button @click="loadReceipts">刷新</el-button>
      </div>
    </template>

    <section class="panel-card page-panel">
      <div class="page-header">
        <div>
          <h2>收据中心</h2>
          <p>查看已生成的收据、预览 PDF、作废历史收据。</p>
        </div>
      </div>

      <div class="table-shell">
        <el-table :data="receipts" v-loading="loading" class="receipts-table" size="small">
          <el-table-column prop="receiptNo" label="收据编号" min-width="138" />
          <el-table-column prop="tenantNameSnapshot" label="租户" min-width="132" show-overflow-tooltip />
          <el-table-column prop="unitCodeSnapshot" label="厂房" width="58" />
          <el-table-column label="来源" width="86">
            <template #default="{ row }">
              {{ row.sourceType === "utility" ? "水电" : "房租" }}
            </template>
          </el-table-column>
          <el-table-column prop="issueDate" label="开具日期" width="102" />
          <el-table-column label="金额" width="104">
            <template #default="{ row }">
              {{ formatCurrency(row.amountSnapshot) }}
            </template>
          </el-table-column>
          <el-table-column prop="summary" label="摘要" min-width="168" show-overflow-tooltip />
          <el-table-column label="状态" width="74">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ row.status === "active" ? "有效" : "作废" }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="126">
            <template #default="{ row }">
              <el-space wrap size="small">
                <el-button v-if="row.pdfFile" text type="primary" @click="previewReceipt(row.pdfFile.id)">查看</el-button>
                <el-button v-if="row.status === 'active'" text type="danger" @click="voidReceipt(row.id)">
                  作废
                </el-button>
              </el-space>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <el-dialog v-model="previewVisible" title="收据 PDF" width="960px">
      <iframe v-if="previewFileId" class="file-preview-frame" :src="apiFileUrl(previewFileId)" />
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>
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
const previewVisible = ref(false);
const previewFileId = ref("");

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
  previewFileId.value = fileId;
  previewVisible.value = true;
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

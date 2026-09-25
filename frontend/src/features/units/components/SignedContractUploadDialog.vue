<template>
  <el-dialog
    :model-value="true"
    title="上传已签合同"
    width="640px"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    @update:model-value="close"
  >
    <p class="signed-contract-period">{{ contract.tenantName }} · {{ contract.startDate }} 至 {{ contract.endDate }}</p>
    <div v-if="contract.attachmentFiles.length" class="file-chip-list">
      <el-button v-for="file in contract.attachmentFiles" :key="file.id" text :icon="View" @click="emit('preview', file)">
        {{ file.originalName }}
      </el-button>
    </div>
    <input ref="fileInput" class="signed-contract-input" type="file" :accept="accept" multiple :disabled="saving"
      tabindex="-1" aria-hidden="true" @change="selectFiles" />
    <div class="signed-contract-dropzone" :class="{ 'is-dragging': dragging, 'is-disabled': saving }"
      role="button" :tabindex="saving ? -1 : 0" :aria-disabled="saving" aria-label="选择已签合同文件"
      @click="chooseFiles" @keydown.enter.prevent="chooseFiles" @keydown.space.prevent="chooseFiles"
      @dragover.prevent="dragging = !saving" @dragleave.prevent="dragging = false" @drop.prevent="dropFiles">
      <UploadFilled width="28" height="28" aria-hidden="true" />
      <strong>已签合同</strong>
      <span>PDF / JPG / PNG / WebP · 每个文件最多 100 MB</span>
    </div>
    <ul v-if="uploads.length" class="signed-contract-files">
      <li v-for="(item, index) in uploads" :key="index">
        <span>{{ item.file.name }}</span>
        <el-button text :icon="Delete" type="danger" :disabled="saving" :aria-label="`移除 ${item.file.name}`"
          @click="uploads.splice(index, 1)">移除</el-button>
      </li>
    </ul>
    <template #footer>
      <el-button :disabled="saving" @click="close">取消</el-button>
      <el-button type="primary" :icon="Upload" :loading="saving" :disabled="!uploads.length" @click="save">保存附件</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Delete, Upload, UploadFilled, View } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { contractsApi, filesApi } from "../../../api";
import type { Contract, StoredFile } from "../../../types/models";

const props = defineProps<{ contract: Contract }>();
const emit = defineEmits<{ close: []; saved: []; preview: [file: StoredFile] }>();
const accept = "application/pdf,image/jpeg,image/png,image/webp";
const fileInput = ref<HTMLInputElement>();
const saving = ref(false);
const dragging = ref(false);
const uploads = ref<{ file: File; storedId?: string }[]>([]);

function chooseFiles() {
  if (!saving.value) fileInput.value?.click();
}

function appendFiles(files: FileList | File[]) {
  if (saving.value) return;
  const selected = Array.from(files);
  if (selected.some((file) => !accept.split(",").includes(file.type))) {
    ElMessage.error("已签合同仅支持 PDF、JPG、PNG 或 WebP");
    return;
  }
  if (selected.some((file) => file.size > 100 * 1024 * 1024)) {
    ElMessage.error("每个文件不能超过 100 MB");
    return;
  }
  const additions = selected.filter((file, index) => {
    const sameFile = (other: File) => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified;
    return !uploads.value.some((item) => sameFile(item.file)) && !selected.slice(0, index).some(sameFile);
  });
  if (uploads.value.length + additions.length > 10) {
    ElMessage.error("每次最多上传 10 个文件");
    return;
  }
  uploads.value.push(...additions.map((file) => ({ file })));
}

function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  appendFiles(input.files ?? []);
  input.value = "";
}

function dropFiles(event: DragEvent) {
  dragging.value = false;
  appendFiles(event.dataTransfer?.files ?? []);
}

function close() {
  if (!saving.value) emit("close");
}

async function save() {
  if (saving.value || !uploads.value.length) return;
  saving.value = true;
  try {
    const pending = uploads.value.filter((item) => !item.storedId);
    for (const item of pending) {
      const [file] = await filesApi.upload([item.file], "contract-attachment");
      item.storedId = file.id;
    }
    await contractsApi.addAttachments(props.contract.id, uploads.value.map((item) => item.storedId!));
    ElMessage.success("已签合同已保存");
    emit("saved");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存已签合同失败");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.signed-contract-period { overflow-wrap: anywhere; margin-top: 0; }
.signed-contract-input { display: none; }
.signed-contract-dropzone {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  min-height: 140px; margin-top: 16px; padding: 16px; border: 1px dashed var(--el-border-color);
  border-radius: 6px; cursor: pointer; text-align: center;
}
.signed-contract-dropzone:focus-visible, .signed-contract-dropzone.is-dragging { outline: 2px solid var(--el-color-primary); }
.signed-contract-dropzone.is-disabled { cursor: wait; opacity: 0.6; }
.signed-contract-dropzone span { font-size: 13px; color: var(--el-text-color-secondary); }
.signed-contract-files { list-style: none; padding: 0; }
.signed-contract-files li { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.signed-contract-files li span { min-width: 0; overflow-wrap: anywhere; }
.file-chip-list :deep(.el-button) { height: auto; white-space: normal; text-align: left; }
.file-chip-list :deep(.el-button span) { overflow-wrap: anywhere; min-width: 0; }
</style>

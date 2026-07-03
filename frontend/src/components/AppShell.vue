<template>
  <div
    class="app-shell"
    :class="{
      'has-pinned-sidebar': isSidebarPinned,
      'has-overlay-sidebar': showSidebarBackdrop,
    }"
  >
    <Transition name="shell-fade">
      <button
        v-if="showSidebarBackdrop"
        type="button"
        class="sidebar-backdrop"
        aria-label="关闭导航"
        @click="overlayOpen = false"
      />
    </Transition>

    <aside
      class="app-sidebar"
      :class="{
        'is-pinned': isSidebarPinned,
        'is-visible': showSidebar,
      }"
    >
      <div class="sidebar-brand">
        <div class="sidebar-brand-row">
          <div class="sidebar-brand-copy">
            <div class="brand-mark">Jincheng Estate</div>
            <h1 class="brand-title">厂房管理</h1>
          </div>

          <button
            type="button"
            class="topbar-icon-button sidebar-toggle-button"
            :aria-label="showSidebar ? '隐藏导航' : '显示导航'"
            @click="toggleSidebar"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <nav class="nav-stack">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: route.path === item.to }"
          @click="handleNavClick"
        >
          <span class="nav-link-badge">{{ item.badge }}</span>
          <span class="nav-link-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.caption }}</small>
          </span>
        </RouterLink>
      </nav>

      <div class="sidebar-user">
        <el-dropdown trigger="click" @command="handleUserCommand">
          <button type="button" class="user-trigger">
            <span class="user-avatar">{{ userInitial }}</span>
            <span class="user-copy">
              <small>当前登录</small>
              <strong>{{ currentUsername }}</strong>
            </span>
          </button>

          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>当前登录：{{ currentUsername }}</el-dropdown-item>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button type="button" class="app-version" @click="openVersionDialog">
          <span>版本 {{ APP_VERSION }}</span>
          <small>{{ APP_UPDATED_AT }}</small>
        </button>
      </div>
    </aside>

    <div class="app-shell-body">
      <header v-if="showTopbar" class="panel-card app-topbar">
        <div class="app-topbar-left">
          <button
            v-if="!showSidebar"
            type="button"
            class="topbar-icon-button sidebar-launcher"
            aria-label="显示导航"
            @click="toggleSidebar"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <div v-if="hasTopActions" class="app-topbar-actions">
          <slot name="top-actions" />
        </div>
      </header>

      <main class="app-main">
        <slot />
      </main>
    </div>

    <div v-if="versionDialogVisible" class="version-update-dialog-backdrop" @click.self="versionDialogVisible = false">
      <section class="version-update-dialog" role="dialog" aria-modal="true" aria-labelledby="version-update-title">
        <div class="version-update-dialog-header">
          <div>
            <small>系统更新</small>
            <h2 id="version-update-title">版本信息</h2>
          </div>
          <button type="button" class="version-update-close-button" aria-label="关闭" @click="versionDialogVisible = false">
            ×
          </button>
        </div>

        <dl class="version-update-grid">
          <div>
            <dt>当前版本</dt>
            <dd>{{ APP_VERSION }}</dd>
          </div>
          <div>
            <dt>线上版本</dt>
            <dd>{{ onlineVersionText }}</dd>
          </div>
        </dl>

        <p v-if="deploymentUpdateStatus?.onlineVersionError" class="version-update-error">
          {{ deploymentUpdateStatus.onlineVersionError }}
        </p>

        <p v-if="shouldReloadForOnlineVersion" class="version-update-hint">
          当前页面仍是旧版本，请刷新页面加载最新前端。
        </p>

        <div class="version-update-actions">
          <button
            type="button"
            class="version-update-refresh-button"
            :disabled="updateStatusRefreshing"
            @click="refreshDeploymentUpdateStatus"
          >
            {{ updateStatusRefreshing ? "查询中" : "刷新" }}
          </button>
          <button
            v-if="shouldReloadForOnlineVersion"
            type="button"
            class="version-update-reload-button"
            @click="reloadPage"
          >
            刷新页面
          </button>
          <button
            type="button"
            class="version-update-start-button"
            :disabled="!canStartDeploymentUpdate"
            @click="handleDeploymentUpdate"
          >
            {{ updateActionCaption }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onBeforeUnmount, onMounted, ref, useSlots, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { deploymentUpdateApi, type DeploymentUpdateStatus } from "../api";
import { APP_UPDATED_AT, APP_VERSION } from "../config/app-meta";
import { useAuthStore } from "../stores/auth";

type SidebarMode = "fixed" | "hidden" | "auto";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const slots = useSlots();

const navItems = [
  {
    label: "厂房管理",
    to: "/units",
    badge: "厂",
    caption: "基础资料与合同",
    description: "维护厂房基础资料、在租状态、合同历史和水电表配置。",
  },
  {
    label: "水电收费",
    to: "/utilities",
    badge: "水",
    caption: "抄表与收费记录",
    description: "管理水电抄表、计费金额、缴费状态和账单记录。",
  },
  {
    label: "房租收费",
    to: "/rent-payments",
    badge: "租",
    caption: "房租收款记录",
    description: "登记房租付款、合同归属和收款方式，保留完整收款台账。",
  },
  {
    label: "押金记录",
    to: "/deposits",
    badge: "押",
    caption: "押金收退明细",
    description: "维护押金收取与退还流水，确保和合同记录一一对应。",
  },
  {
    label: "收据中心",
    to: "/receipts",
    badge: "据",
    caption: "收据开具与查询",
    description: "按房租和水电缴费记录生成收据，支持查询、预览和管理。",
  },
];

const SIDEBAR_STORAGE_KEY = "factory-rental-sidebar-mode";
const FIXED_BREAKPOINT = 1024;
const AUTO_BREAKPOINT = 1260;

const sidebarMode = ref<SidebarMode>(readSidebarMode());
const lastExpandedMode = ref<Exclude<SidebarMode, "hidden">>(
  sidebarMode.value === "hidden" ? "auto" : sidebarMode.value,
);
const viewportWidth = ref(typeof window === "undefined" ? AUTO_BREAKPOINT : window.innerWidth);
const overlayOpen = ref(false);
const deploymentUpdateStatus = ref<DeploymentUpdateStatus | null>(null);
const updateStarting = ref(false);
const updateStatusRefreshing = ref(false);
const versionDialogVisible = ref(false);

const currentUsername = computed(() => authStore.state.user?.username || "管理员");
const userInitial = computed(() => currentUsername.value.slice(0, 1).toUpperCase());
const hasTopActions = computed(() => Boolean(slots["top-actions"]));
const showTopbar = computed(() => !showSidebar.value || hasTopActions.value);
const canStartDeploymentUpdate = computed(
  () =>
    Boolean(deploymentUpdateStatus.value?.enabled) &&
    !deploymentUpdateStatus.value?.onlineVersionError &&
    !deploymentUpdateStatus.value?.running &&
    !updateStarting.value,
);
const updateActionCaption = computed(() => {
  if (!deploymentUpdateStatus.value) {
    return "更新";
  }

  if (deploymentUpdateStatus.value.onlineVersionError) {
    return "刷新后重试";
  }

  if (!deploymentUpdateStatus.value.enabled) {
    return "未启用";
  }

  if (deploymentUpdateStatus.value.running) {
    return "执行中";
  }

  if (updateStarting.value) {
    return "启动中";
  }

  return "更新";
});
const onlineVersionText = computed(() => deploymentUpdateStatus.value?.onlineVersion || "未查询到");
const shouldReloadForOnlineVersion = computed(() => {
  const onlineVersion = deploymentUpdateStatus.value?.onlineVersion;
  return Boolean(onlineVersion && compareAppVersions(onlineVersion, APP_VERSION) > 0);
});

const isSidebarPinned = computed(() => {
  if (sidebarMode.value === "hidden") {
    return false;
  }

  if (sidebarMode.value === "fixed") {
    return viewportWidth.value >= FIXED_BREAKPOINT;
  }

  return viewportWidth.value >= AUTO_BREAKPOINT;
});

const showSidebar = computed(() => isSidebarPinned.value || overlayOpen.value);
const showSidebarBackdrop = computed(() => overlayOpen.value && !isSidebarPinned.value);

watch(
  () => route.fullPath,
  () => {
    overlayOpen.value = false;
  },
);

watch(isSidebarPinned, (pinned) => {
  if (pinned) {
    overlayOpen.value = false;
  }
});

onMounted(() => {
  syncViewport();
  window.addEventListener("resize", syncViewport);
  loadDeploymentUpdateStatus();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", syncViewport);
});

function readSidebarMode(): SidebarMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (stored === "fixed" || stored === "hidden" || stored === "auto") {
    return stored;
  }

  return "auto";
}

function syncViewport() {
  viewportWidth.value = window.innerWidth;
}

function setSidebarMode(mode: SidebarMode) {
  sidebarMode.value = mode;

  if (mode !== "hidden") {
    lastExpandedMode.value = mode;
  } else {
    overlayOpen.value = false;
  }

  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, mode);
}

function toggleSidebar() {
  if (isSidebarPinned.value) {
    setSidebarMode("hidden");
    return;
  }

  if (sidebarMode.value === "hidden" && viewportWidth.value >= FIXED_BREAKPOINT) {
    setSidebarMode(lastExpandedMode.value);
    if (!isSidebarPinned.value) {
      overlayOpen.value = true;
    }
    return;
  }

  overlayOpen.value = !overlayOpen.value;
}

function handleNavClick() {
  if (!isSidebarPinned.value) {
    overlayOpen.value = false;
  }
}

async function handleUserCommand(command: string | number | object) {
  if (command === "logout") {
    await handleLogout();
  }
}

async function handleLogout() {
  await authStore.logout();
  ElMessage.success("已退出登录");
  router.push("/login");
}

async function loadDeploymentUpdateStatus() {
  try {
    deploymentUpdateStatus.value = await deploymentUpdateApi.status();
  } catch {
    deploymentUpdateStatus.value = {
      enabled: true,
      running: false,
      services: [],
      composeFiles: [],
      onlineVersion: null,
      onlineVersionCheckedAt: null,
      onlineVersionError: "查询失败",
    };
  }
}

function openVersionDialog() {
  versionDialogVisible.value = true;
  refreshDeploymentUpdateStatus();
}

async function refreshDeploymentUpdateStatus() {
  updateStatusRefreshing.value = true;
  try {
    await loadDeploymentUpdateStatus();
  } finally {
    updateStatusRefreshing.value = false;
  }
}

async function handleDeploymentUpdate() {
  if (!canStartDeploymentUpdate.value) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      "系统会在后台拉取最新镜像并重建服务，页面可能短暂断开。确认现在更新？",
      "更新系统",
      {
        confirmButtonText: "开始更新",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
  } catch {
    return;
  }

  updateStarting.value = true;
  try {
    const result = await deploymentUpdateApi.start();
    ElMessage.success(result.message);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "启动系统更新失败");
  } finally {
    updateStarting.value = false;
  }
}

function reloadPage() {
  window.location.reload();
}

function compareAppVersions(left: string, right: string) {
  const leftParts = parseAppVersion(left);
  const rightParts = parseAppVersion(right);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function parseAppVersion(value: string) {
  return value
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isNaN(part) ? 0 : part));
}
</script>

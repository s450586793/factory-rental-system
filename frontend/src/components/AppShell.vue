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
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from "element-plus";
import { computed, onBeforeUnmount, onMounted, ref, useSlots, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
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

const currentUsername = computed(() => authStore.state.user?.username || "管理员");
const userInitial = computed(() => currentUsername.value.slice(0, 1).toUpperCase());
const hasTopActions = computed(() => Boolean(slots["top-actions"]));
const showTopbar = computed(() => !showSidebar.value || hasTopActions.value);

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
</script>

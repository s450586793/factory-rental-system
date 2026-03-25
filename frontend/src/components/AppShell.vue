<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <div>
        <div class="brand-mark">Jincheng Estate</div>
        <h1 class="brand-title">厂房出租管理系统</h1>
        <p class="brand-copy">围绕厂房、合同、水电、收款和收据的统一后台。</p>
      </div>

      <nav class="nav-stack">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: route.path === item.to }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="sidebar-card">
        <p>当前登录：{{ authStore.state.user?.username }}</p>
        <el-button text type="danger" @click="handleLogout">退出登录</el-button>
      </div>
    </aside>

    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from "element-plus";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const navItems = [
  { label: "厂房信息", to: "/units" },
  { label: "水电收费", to: "/utilities" },
  { label: "房租收费", to: "/rent-payments" },
  { label: "押金记录", to: "/deposits" },
  { label: "收据中心", to: "/receipts" },
];

async function handleLogout() {
  await authStore.logout();
  ElMessage.success("已退出登录");
  router.push("/login");
}
</script>

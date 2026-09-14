import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

const routes = [
  {
    path: "/login",
    name: "login",
    component: () => import("../features/auth/views/LoginView.vue"),
  },
  {
    path: "/",
    redirect: "/units",
  },
  {
    path: "/units",
    name: "units",
    component: () => import("../features/units/views/UnitsView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/utilities",
    name: "utilities",
    component: () => import("../features/utilities/views/UtilitiesView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/rent-payments",
    name: "rent-payments",
    component: () => import("../features/rent-payments/views/RentPaymentsView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/rent-reconciliation",
    name: "rent-reconciliation",
    component: () => import("../features/rent-reconciliation/views/RentReconciliationView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/deposits",
    name: "deposits",
    component: () => import("../features/deposits/views/DepositsView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/receipts",
    name: "receipts",
    component: () => import("../features/receipts/views/ReceiptsView.vue"),
    meta: { requiresAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  await authStore.initialize();

  if (to.meta.requiresAuth && !authStore.state.user) {
    return {
      name: "login",
      query: { redirect: to.fullPath },
    };
  }

  if (to.name === "login" && authStore.state.user) {
    return { name: "units" };
  }

  return true;
});

export default router;

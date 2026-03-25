import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import LoginView from "../views/LoginView.vue";
import UnitsView from "../views/UnitsView.vue";
import UtilitiesView from "../views/UtilitiesView.vue";
import RentPaymentsView from "../views/RentPaymentsView.vue";
import DepositsView from "../views/DepositsView.vue";
import ReceiptsView from "../views/ReceiptsView.vue";

const routes = [
  {
    path: "/login",
    name: "login",
    component: LoginView,
  },
  {
    path: "/",
    redirect: "/units",
  },
  {
    path: "/units",
    name: "units",
    component: UnitsView,
    meta: { requiresAuth: true },
  },
  {
    path: "/utilities",
    name: "utilities",
    component: UtilitiesView,
    meta: { requiresAuth: true },
  },
  {
    path: "/rent-payments",
    name: "rent-payments",
    component: RentPaymentsView,
    meta: { requiresAuth: true },
  },
  {
    path: "/deposits",
    name: "deposits",
    component: DepositsView,
    meta: { requiresAuth: true },
  },
  {
    path: "/receipts",
    name: "receipts",
    component: ReceiptsView,
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

import { reactive } from "vue";
import type { User } from "../types/models";
import { authApi } from "../api";

type AuthState = {
  user: User | null;
  initialized: boolean;
};

const state = reactive<AuthState>({
  user: null,
  initialized: false,
});

export function useAuthStore() {
  async function initialize() {
    if (state.initialized) {
      return;
    }
    try {
      const payload = await authApi.me();
      state.user = payload.user;
    } catch {
      state.user = null;
    } finally {
      state.initialized = true;
    }
  }

  async function login(username: string, password: string) {
    const payload = await authApi.login({ username, password });
    state.user = payload.user;
    state.initialized = true;
  }

  async function logout() {
    await authApi.logout();
    state.user = null;
    state.initialized = true;
  }

  return {
    state,
    initialize,
    login,
    logout,
  };
}

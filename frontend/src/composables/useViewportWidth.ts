import { onBeforeUnmount, onMounted, ref } from "vue";

export function useViewportWidth(fallback = 1280) {
  const viewportWidth = ref(typeof window === "undefined" ? fallback : window.innerWidth);

  function syncViewport() {
    viewportWidth.value = window.innerWidth;
  }

  onMounted(() => {
    syncViewport();
    window.addEventListener("resize", syncViewport);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", syncViewport);
  });

  return viewportWidth;
}

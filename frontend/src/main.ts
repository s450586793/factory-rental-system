import { createApp } from "vue";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "element-plus/dist/index.css";
import App from "./App.vue";
import router from "./router";
import "./styles/base.css";

dayjs.locale("zh-cn");

createApp(App).use(router).use(ElementPlus, { locale: zhCn }).mount("#app");

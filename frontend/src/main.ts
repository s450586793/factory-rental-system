import { createApp, h } from "vue";
import { ElConfigProvider } from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/message-box/style/css";
import App from "./App.vue";
import router from "./router";
import "./styles/base.css";

dayjs.locale("zh-cn");

createApp({
  render: () => h(ElConfigProvider, { locale: zhCn }, () => h(App)),
}).use(router).mount("#app");

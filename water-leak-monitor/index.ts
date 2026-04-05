import { registerRootComponent } from "expo";

import App from "./App";

/** Expo entry only. Leak emails: `tryInvokeLeakEmailAfterSubmit` / `sendLeakEmail` in src/lib/iot.ts. */
registerRootComponent(App);

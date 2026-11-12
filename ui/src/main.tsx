import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
// The one place styles are imported — styles/index.css defines the cascade order.
import "@/styles/index.css";
import App from "@/app/App";
import { store } from "@/app/store";
import { initTheme } from "@/shared/lib/theme";

initTheme();

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Provider store={store}>
      <App />
    </Provider>
  </BrowserRouter>
);

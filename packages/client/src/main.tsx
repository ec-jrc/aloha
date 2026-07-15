/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the “Licence”);
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./app/app";
import PlatformPluginsContextProvider from "./context/platform-plugins-context";
import UserContextProvider from "./context/user-context-provider";
import "./index.css";

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as sonner from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__aloha_shared = {
  React,
  ReactJsxRuntime,
  ReactDOM,
  sonner,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <UserContextProvider>
        <PlatformPluginsContextProvider>
          <App />
        </PlatformPluginsContextProvider>
      </UserContextProvider>
    </BrowserRouter>
    {/* <Toaster /> */}
  </StrictMode>
);

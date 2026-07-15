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

import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import Header from "../components/header";
import Menu from "../components/menu";
import Routing from "./routing";

export default function App() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, []);

  return (
    <div className="bg-slate-900 h-screen w-screen flex flex-col overflow-y-clip">
      <Header />
      <div className="grow flex min-h-0">
        {/* Hide sidebar menu on mobile */}
        {!isMobile && <Menu />}
        <div
          className={`grow-1 bg-slate-100 overflow-auto ${isMobile ? "" : "rounded-t-xl"}`}
        >
          <div className="mx-12 my-8 lg:mx-16 lg:my-12">
            <Routing />
          </div>
          <div className="h-16"></div>
        </div>
      </div>
      <Toaster position="bottom-right" theme="light" richColors />
    </div>
  );
}

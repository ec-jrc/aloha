/*
Copyright (C) 2025 European Union

Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the "Licence");
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/

const fs = require("fs");
const path = require("path");

const envTestPath = path.join(__dirname, ".env.test");

if (!fs.existsSync(envTestPath)) {
  const examplePath = path.join(__dirname, "env.test.example");
  fs.copyFileSync(examplePath, envTestPath);
  console.log("[pretest] created tests/.env.test from tests/.env.test.example");
}

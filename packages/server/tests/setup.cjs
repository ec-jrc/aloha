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

const Module = require("module");
const fs = require("fs");
const path = require("path");

// Mocha + ts-node load the .ts specs through require() (CJS transpilation,
// extensionless imports), so package.json must say "type": "commonjs" while
// the specs load. Flip it here and always restore on process exit, so a
// crashed run cannot leave the package broken for the dev server.
const pkgPath = path.join(__dirname, "..", "package.json");

function setPackageType(type) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.type !== type) {
    pkg.type = type;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }
}

setPackageType("commonjs");
process.on("exit", () => {
  try {
    setPackageType("module");
  } catch {
    // best effort only
  }
});

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.endsWith('.js') && !request.includes('node_modules')) {
    const tsRequest = request.replace(/\.js$/, '.ts');
    try {
      return originalResolveFilename.call(this, tsRequest, parent, isMain, options);
    } catch {
      // Fall back to original if .ts doesn't exist
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

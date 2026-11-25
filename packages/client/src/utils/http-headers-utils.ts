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

import { schemas } from "aloha-shared";

export type HeaderRow = { key: string; value: string; override: boolean };

export type AllowedHttpHeaders = Record<string, schemas.AllowedHttpHeader>;

export function headersObjectToRows(
  headers: AllowedHttpHeaders | undefined,
  overridesWhitelist: string[] = []
): HeaderRow[] {
  const whitelist = new Set(overridesWhitelist.map((h) => h.toLowerCase()));
  return Object.entries(headers ?? {}).map(([key, header]) => ({
    key,
    value: header.value,
    override: (header.override ?? false) && whitelist.has(key.toLowerCase()),
  }));
}

export function headerRowsToObject(
  rows: HeaderRow[] | undefined
): AllowedHttpHeaders {
  const headers: AllowedHttpHeaders = {};
  for (const { key, value, override } of rows ?? []) {
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey !== "") {
      headers[normalizedKey] = { value, override: override ?? false };
    }
  }
  return headers;
}

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

import { logger as slogger } from "aloha-shared";
import pino from "pino";
import { Injector } from "typed-inject";

const SENSITIVE_KEYS = new Set([
  "clientSecret",
  "client_secret",
  "password",
  "secret",
]);

function redactSensitive(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/:\/\/([^:]+):([^@]+)@/g, "://$1:xxxx@")
      .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "xxxx");
  }
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = SENSITIVE_KEYS.has(k) ? "xxxx" : redactSensitive(v);
    }
    return result;
  }
  return value;
}

const redactingDestination: pino.DestinationStream = {
  write(msg: string) {
    try {
      const redacted = JSON.stringify(redactSensitive(JSON.parse(msg)));
      process.stdout.write(redacted + "\n");
    } catch {
      process.stdout.write(msg);
    }
  },
};

const logger =
  process.env.SHOW_SENSITIVE_DATA === "true"
    ? pino({ level: process.env.LOG_LEVEL || "info", base: null })
    : pino(
        { level: process.env.LOG_LEVEL || "info", base: null },
        redactingDestination
      );

export function provideLogger<T>(injector: Injector<T>) {
  const l: slogger.Logger = logger;
  return injector.provideValue("rootLogger", l);
}

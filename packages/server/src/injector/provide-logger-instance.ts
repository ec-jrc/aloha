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
import { createHash } from "crypto";
import pino from "pino";
import { Injector } from "typed-inject";

import { Cache } from "../cache/cache-nodecache";

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

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

const DEDUP_TTL_SECONDS = Number(process.env.LOG_DEDUP_TTL_SECONDS) || 300;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k]
        )}`
    )
    .join(",")}}`;
}

class DedupLogger implements slogger.Logger {
  private readonly contextHash: string;

  constructor(
    private readonly inner: pino.Logger,
    private readonly cache: Cache<true>,
    private readonly context: Record<string, unknown> = {}
  ) {
    this.contextHash = createHash("sha1")
      .update(stableStringify(context))
      .digest("base64");
  }

  child(context: unknown): slogger.Logger {
    const childInner = this.inner.child((context ?? {}));
    const mergedContext =
      context && typeof context === "object"
        ? { ...this.context, ...(context as Record<string, unknown>) }
        : this.context;
    return new DedupLogger(childInner, this.cache, mergedContext);
  }

  private emit(level: LogLevel, msg: unknown, args: unknown[]): void {
    if (!this.inner.isLevelEnabled(level)) {
      return;
    }

    const key = createHash("sha1")
      .update(
        `${this.contextHash}\u0000${level}\u0000${stableStringify(
          msg
        )}\u0000${stableStringify(args)}`
      )
      .digest("base64");

    // Suppress if an identical record was logged within the TTL window. The
    // entry is written only on emit (never refreshed on suppression) so the
    // window counts from the first occurrence and the message re-surfaces once
    // it expires.
    if (this.cache.getSyncValue(key) !== undefined) {
      return;
    }

    this.cache.put(key, true, DEDUP_TTL_SECONDS);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const logFn = this.inner[level].bind(this.inner) as (
      msg: unknown,
      ...args: unknown[]
    ) => void;
    logFn(msg, ...args);
  }

  fatal(msg: unknown, ...args: unknown[]): void {
    this.emit("fatal", msg, args);
  }
  error(msg: unknown, ...args: unknown[]): void {
    this.emit("error", msg, args);
  }
  warn(msg: unknown, ...args: unknown[]): void {
    this.emit("warn", msg, args);
  }
  info(msg: unknown, ...args: unknown[]): void {
    this.emit("info", msg, args);
  }
  debug(msg: unknown, ...args: unknown[]): void {
    this.emit("debug", msg, args);
  }
  trace(msg: unknown, ...args: unknown[]): void {
    this.emit("trace", msg, args);
  }
}

export function provideLogger<T>(injector: Injector<T>) {
  const dedupCache = new Cache<true>();
  const l: slogger.Logger = new DedupLogger(logger, dedupCache);
  return injector.provideValue("rootLogger", l);
}

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

import { ApplicationCache } from "./cache";
import NodeCache from "node-cache";

export const CACHE_STD_TTL = 100;
export const CACHE_CHECK_PERIOD = 105;

export class Cache<T> implements ApplicationCache<T> {
  private _cache: NodeCache;
  constructor() {
    this._cache = new NodeCache({ stdTTL: 100, checkperiod: 105 }); // , maxKeys: 1000
  }
  async get(
    key: string,
    valueProvider?: () => Promise<T | null>,
    time?: number
  ): Promise<T | null> {
    const cached = this._cache.get(key) as T;
    if (cached !== undefined) return cached;
    if (valueProvider) {
      const value = await valueProvider();
      if (value !== null) {
        this.put(key, value, time);
        return value;
      }
    }
    return null;
  }
  put(key: string, value: T, time?: number): T {
    if (time !== undefined) {
      this._cache.set(key, value, time);
    } else {
      this._cache.set(key, value);
    }
    return value;
  }
  /**
   * Synchronous read of a cached value without a value provider. Returns
   * undefined when the key is absent or expired. The node-cache backing is
   * synchronous, so this is safe for callers that cannot await (e.g. code
   * that must take-and-delete an entry within a synchronous critical path).
   */
  getSyncValue(key: string): T | undefined {
    return this._cache.get<T>(key);
  }
  del(key: string): boolean {
    return this._cache.del(key) > 0;
  }
  clear(): void {
    this._cache.flushAll();
  }
  size(): number {
    const stats = this._cache.stats;
    return stats.ksize + stats.vsize;
  }
  hits(): number {
    return this._cache.stats.hits;
  }
  misses(): number {
    return this._cache.stats.misses;
  }
}

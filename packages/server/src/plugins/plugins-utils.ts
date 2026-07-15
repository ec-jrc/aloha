import { PluginBase, PluginExtraType } from "./definitions/plugins-types";

export function getPluginExtraWithDefault<
  T extends { extras?: PluginExtraType },
>(p: PluginBase, item: T, defaultValue: PluginExtraType = {}) {
  if (!item.extras) {
    item.extras = {};
  }
  const extra = item.extras[p.id] as PluginExtraType;
  if (!extra) {
    item.extras[p.id] = defaultValue;
    return defaultValue;
  }
  return extra;
}

export function setPluginExtra<T extends { extras?: PluginExtraType }>(
  p: PluginBase,
  item: T,
  extra: {
    [k: string]: unknown;
  }
) {
  if (!item.extras) {
    item.extras = {};
  }

  item.extras[p.id] = extra;
}

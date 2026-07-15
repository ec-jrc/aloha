import { Injector } from "typed-inject";
import type { AlohaInjector } from "../../injector/injector";
import type { authentication_strategy, logger, schemas } from "aloha-shared";
import { Router } from "express";

export type PluginExtraType = { [k: string]: unknown };

export type PluginUserInfo = {
  principal: authentication_strategy.UserPrincipal;
  loggedUser: schemas.User;
};

export type PluginRuntimeInjector = Injector<{
  getLogger: (module: string) => () => logger.Logger;
  alohaInjector: AlohaInjector;
  replaceAlohaInjector: (newInjector: AlohaInjector) => void;
  getUserInfo: () => Promise<PluginUserInfo | undefined>;
}>;

export interface PluginInitContext {
  runtimeInjector: PluginRuntimeInjector;
}

export interface PluginBase {
  type: string;
  version: string;
  id: string;
  init(context: PluginInitContext): Promise<void>;
  getRouter(): Promise<Router | undefined>;
}

export interface PluginWorkflow extends PluginBase {
  type: "workflow";
}

export function isPluginWorkflow(p: PluginBase): p is PluginWorkflow {
  return p.type === "workflow";
}

export function isPluginSample(p: PluginBase): p is PluginBase {
  return p.type === "sample";
}

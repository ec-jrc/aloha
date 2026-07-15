import { AsyncLocalStorage } from "node:async_hooks";
import { Request } from "express";

export const requestContext: AsyncLocalStorage<Request> =
  new AsyncLocalStorage<Request>();

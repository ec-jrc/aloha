import { Injector, INJECTOR_TOKEN } from "typed-inject";
import { RepositoryWrite } from "../repository-interfaces";
import { VisibilityRepositoryInterface } from "../visibility-repository-interface";
import { VisibilityInterface } from "../../../../../../aloha-shared/dist-module/schemas";

export type RepositoryWriteDecorator<T extends RepositoryWrite<U>, U> = (
  impl: T
) => T;

function isVisibilityRepositoryImplementation<
  R extends VisibilityRepositoryInterface<U>,
  U extends VisibilityInterface,
>(x: unknown): x is R {
  return (
    x !== null &&
    x !== undefined &&
    typeof x === "object" &&
    "setVisibility" in x
  );
}
function isRepositoryWriteImplementation<R extends RepositoryWrite<U>, U>(
  x: unknown
): x is R {
  return (
    x !== null &&
    x !== undefined &&
    typeof x === "object" &&
    "create" in x &&
    "updateById" in x &&
    "deleteById" in x
  );
}

export function repositoryWriteDecorate<T, R extends RepositoryWrite<U>, U>(
  key: keyof T,
  repositoryWriteDecorators: RepositoryWriteDecorator<R, U>[]
) {
  const c = (injector: Injector<T>) => {
    const impl = injector.resolve(key);
    if (isRepositoryWriteImplementation<R, U>(impl)) {
      return repositoryWriteDecorators.reduce((p, c) => {
        return c(p);
      }, impl as R) as T[keyof T];
    } else {
      throw new Error("Only RepositoryWrite implementation can be decorated");
    }
  };
  c.inject = [INJECTOR_TOKEN] as const;
  return c;
}

export function visibilityRepositoryDecorate<
  T,
  R extends VisibilityRepositoryInterface<U>,
  U extends VisibilityInterface,
>(key: keyof T, repositoryDecorators: RepositoryWriteDecorator<R, U>[]) {
  const c = (injector: Injector<T>) => {
    const impl = injector.resolve(key);
    if (isVisibilityRepositoryImplementation<R, U>(impl)) {
      return repositoryDecorators.reduce((p, c) => {
        return c(p);
      }, impl as R) as T[keyof T];
    } else {
      throw new Error(
        "Only VisibilityRepositoryInterface implementation can be decorated"
      );
    }
  };
  c.inject = [INJECTOR_TOKEN] as const;
  return c;
}

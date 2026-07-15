import { getLogger } from "../../../../injector/provide-logger";
import { RepositoryWrite } from "../repository-interfaces";

export function logUpdateCall<T extends RepositoryWrite<U>, U>(impl: T): T {
  const logger = getLogger("LOG-UPDATE-CALL");
  const originalCall = impl.updateById.bind(impl);
  impl.updateById = async (id: string, item: Partial<U>) => {
    const log = logger().child({ item });
    log.debug("Before update");
    const res = await originalCall(id, item);
    log.debug("After update");
    return res;
  };
  return impl;
}

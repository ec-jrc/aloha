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

import { getUserInfo } from "@/services/users";
import { isEqual } from "@ver0/deep-equal";
import { authentication_strategy } from "aloha-shared";
import React, { useCallback, useEffect, useState } from "react";
import {
  Subject,
  distinctUntilChanged,
  merge,
  switchMap,
  tap,
  timer,
} from "rxjs";
import { toast } from "sonner";
import { exceptionToMessage } from "../utils/type-utils";
import { UserContext } from "./contexes";

const forceRefreshUser: Subject<boolean> = new Subject();

// eslint-disable-next-line react-refresh/only-export-components
export function useForceRefreshUser() {
  return useCallback(() => {
    forceRefreshUser.next(true);
  }, []);
}
export default function UserContextProvider({
  children,
}: React.PropsWithChildren) {
  const [user, setUser] =
    useState<authentication_strategy.UserPrincipalWithProjects | null>(null);

  useEffect(() => {
    const refreshUser = async () => {
      try {
        return await getUserInfo();
      } catch (e) {
        console.error(e);
        toast.error(`Could not retrieve logged user: ${exceptionToMessage(e)}`);
      }
    };

    const timeout = import.meta.env.DEV ? 5_000 : 60_000;

    const subscription = merge(timer(0, timeout), forceRefreshUser)
      .pipe(
        switchMap(() => {
          return refreshUser();
        }),
        distinctUntilChanged(isEqual),
        tap((userInfo: authentication_strategy.UserPrincipalWithProjects) => {
          console.log("New user info loaded", userInfo);
          setUser(userInfo);
        })
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

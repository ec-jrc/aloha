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

/* eslint-disable react-hooks/exhaustive-deps */
import { exceptionToMessage } from "@/utils/type-utils";
import { isEqual } from "@ver0/deep-equal";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavigateFunction, useNavigate } from "react-router";
import {
  EMPTY,
  Subject,
  Subscription,
  catchError,
  exhaustMap,
  merge,
  timer,
} from "rxjs";
import { toast } from "sonner";
import { PATH_NOT_ALLOWED, PATH_NOT_AUTHORISED } from "../app/routing";
import { HTTPError } from "../services/utils";

export async function manageFetchError(e: unknown, navigate: NavigateFunction) {
  if (e instanceof HTTPError) {
    switch (e.status) {
      case 401:
        await navigate(PATH_NOT_AUTHORISED, {
          flushSync: true,
        });
        break;
      case 403:
        await navigate(PATH_NOT_ALLOWED, {
          flushSync: true,
        });
        break;
      default:
        toast.error(`Error while fetching item(s): ${e.message}`);
    }
  } else {
    console.error(e);
    toast.error(`Error while fetching item(s): ${exceptionToMessage(e)}`);
  }
}

export function useService<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceFunction: (...args: any[]) => Promise<T>,
  deps: React.DependencyList,
  defaultValue: T,
  conditionalCallDeps: React.DependencyList = [],
  refreshInterval?: number
): [boolean, T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<T>(defaultValue);
  const forceFetchRef = useRef<Subject<boolean> | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const isVisibleRef = useRef(!document.hidden);

  const internalServiceFunction = useCallback(
    async (currentDeps: React.DependencyList) => {
      try {
        const result = await serviceFunction(...currentDeps);
        setResult((prevResult) => {
          if (!isEqual(prevResult, result)) {
            return result;
          }
          return prevResult;
        });
      } catch (e) {
        await manageFetchError(e, navigate);
      } finally {
        setLoading(false);
      }
    },
    [serviceFunction]
  );

  useEffect(() => {
    if (conditionalCallDeps.some((e) => !e)) {
      setLoading(false);
      return;
    }

    // Handle visibility changes
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;

      // If page becomes visible and we have a subscription, trigger a fetch
      if (
        isVisibleRef.current &&
        subscriptionRef.current &&
        forceFetchRef.current
      ) {
        forceFetchRef.current.next(true);
      }
    };

    // If refreshInterval is provided, set up periodic fetching
    if (refreshInterval) {
      const forceFetch = new Subject<boolean>();
      forceFetchRef.current = forceFetch;

      const visibleTimer$ = merge(forceFetch, timer(0, refreshInterval)).pipe(
        exhaustMap(() => {
          // Only proceed if the document is visible
          if (isVisibleRef.current) {
            return internalServiceFunction(deps);
          }
          return EMPTY;
        }),
        catchError((e) => {
          console.error(e);
          toast.error(
            `Error during automatic refresh: ${exceptionToMessage(e)}`
          );
          return EMPTY;
        })
      );

      const subscription = visibleTimer$.subscribe();
      subscriptionRef.current = subscription;

      // Trigger initial fetch
      forceFetch.next(true);

      // Add visibility change listener
      document.addEventListener("visibilitychange", handleVisibilityChange);

      // Clean up on unmount
      return () => {
        subscription.unsubscribe();
        // forceFetch.unsubscribe();
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      };
    } else {
      setLoading(true);
      if (import.meta.env.DEV) {
        setTimeout(() => internalServiceFunction(deps), 2000);
      } else {
        internalServiceFunction(deps);
      }
    }
  }, [...deps, ...conditionalCallDeps, refreshInterval]);

  const forceFetchFunction = useCallback(() => {
    if (refreshInterval) {
      forceFetchRef.current?.next(true);
    } else {
      internalServiceFunction(deps);
    }
  }, [internalServiceFunction, forceFetchRef, deps]);

  return [loading, result, setResult, forceFetchFunction];
}

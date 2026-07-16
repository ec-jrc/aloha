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

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  ResourceReference,
  PromptReference,
} from "@modelcontextprotocol/sdk/types.js";

interface CompletionState {
  completions: Record<string, string[]>;
  loading: Record<string, boolean>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => PromiseLike<void>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      void func(...args);
    }, wait);
  };
}

export function useCompletionState(
  handleCompletion: (
    ref: ResourceReference | PromptReference,
    argName: string,
    value: string,
    signal?: AbortSignal
  ) => Promise<string[]>,
  completionsSupported: boolean = true,
  debounceMs: number = 300
) {
  const [state, setState] = useState<CompletionState>({
    completions: {},
    loading: {},
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const clearCompletions = useCallback(() => {
    cleanup();
    setState({
      completions: {},
      loading: {},
    });
  }, [cleanup]);

  const requestCompletions = useMemo(() => {
    return debounce(
      // eslint-disable-next-line react-hooks/refs
      async (
        ref: ResourceReference | PromptReference,
        argName: string,
        value: string
      ) => {
        if (!completionsSupported) {
          return;
        }

        cleanup();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setState((prev) => ({
          ...prev,
          loading: { ...prev.loading, [argName]: true },
        }));

        try {
          const values = await handleCompletion(
            ref,
            argName,
            value,
            abortController.signal
          );

          if (!abortController.signal.aborted) {
            setState((prev) => ({
              ...prev,
              completions: { ...prev.completions, [argName]: values },
              loading: { ...prev.loading, [argName]: false },
            }));
          }
        } catch {
          if (!abortController.signal.aborted) {
            setState((prev) => ({
              ...prev,
              loading: { ...prev.loading, [argName]: false },
            }));
          }
        } finally {
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null;
          }
        }
      },
      debounceMs
    );
  }, [handleCompletion, completionsSupported, cleanup, debounceMs]);

  // Clear completions when support status changes
  useEffect(() => {
    if (!completionsSupported) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      clearCompletions();
    }
  }, [completionsSupported, clearCompletions]);

  return {
    ...state,
    clearCompletions,
    requestCompletions,
    completionsSupported,
  };
}

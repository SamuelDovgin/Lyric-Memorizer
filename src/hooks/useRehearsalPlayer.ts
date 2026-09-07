import { useEffect, useMemo, useSyncExternalStore } from "react";
import { RehearsalTransport } from "../audio/transport";
export function useRehearsalPlayer(urls: string[], mix: boolean) {
  const key = urls.join("|");
  const owner = useMemo(
    () => ({
      transport: new RehearsalTransport(key ? key.split("|") : [], mix),
      disposal: undefined as ReturnType<typeof setTimeout> | undefined,
    }),
    [key, mix],
  );
  useEffect(() => {
    clearTimeout(owner.disposal);
    return () => {
      owner.disposal = setTimeout(() => owner.transport.dispose(), 0);
    };
  }, [owner]);
  const state = useSyncExternalStore(
    owner.transport.subscribe,
    owner.transport.getSnapshot,
  );
  return { transport: owner.transport, ...state };
}

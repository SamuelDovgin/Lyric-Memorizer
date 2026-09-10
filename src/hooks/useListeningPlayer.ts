import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ListeningTransport } from "../audio/listeningTransport";
export function useListeningPlayer(urls: string[]) {
  const key = urls.join("|");
  const owner = useMemo(
    () => ({
      transport: new ListeningTransport(key ? key.split("|") : []),
      disposal: undefined as ReturnType<typeof setTimeout> | undefined,
    }),
    [key],
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

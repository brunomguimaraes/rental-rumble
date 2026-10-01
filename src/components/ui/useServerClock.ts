import { useEffect, useState } from 'react';

/** The server's clock now, advanced locally each second from the last `serverNow` received. */
export function useServerClock(serverNow: number): number {
  const [clock, setClock] = useState(() => ({ serverNow, elapsed: 0 }));
  useEffect(() => {
    const at = performance.now();
    const timer = window.setInterval(() => setClock({ serverNow, elapsed: performance.now() - at }), 1000);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  return serverNow + (clock.serverNow === serverNow ? clock.elapsed : 0);
}

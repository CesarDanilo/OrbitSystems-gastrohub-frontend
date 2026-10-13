import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** Short two-tone chime made with Web Audio: no audio file to download. */
export function playNewOrderSound() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // Sound is a convenience; the list still updates.
  }
}

/**
 * Listens to the restaurant event stream (SSE). Every event refreshes the restaurant's cached
 * data; new orders also play a sound and show a browser notification when allowed.
 * EventSource reconnects by itself; polling in each screen remains the fallback.
 */
export function useRealtime(restaurantId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/admin/stream', { withCredentials: true });
    const refresh = () => {
      // Bursts of events (one per change) collapse into one refetch.
      const now = Date.now();
      if (now - lastRefresh.current < 300) return;
      lastRefresh.current = now;
      void queryClient.invalidateQueries({ queryKey: ['admin', restaurantId] });
    };
    source.addEventListener('changed', refresh);
    source.addEventListener('order.created', () => {
      refresh();
      playNewOrderSound();
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification('Novo pedido', { body: 'Um novo pedido chegou.', tag: 'new-order' });
      }
    });
    // After a reconnection, resync everything that may have changed while offline.
    source.addEventListener('open', refresh);
    return () => source.close();
  }, [enabled, queryClient, restaurantId]);
}

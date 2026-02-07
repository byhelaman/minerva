import { MatchingService } from '../services/matcher';
import type { WorkerMessage } from '../types';

let matcher: MatchingService | null = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const { type } = e.data;

    try {
        if (type === 'INIT') {
            const { meetings, users } = e.data;
            // Inicialización costosa (Fuse.js indexing) ocurre aquí
            matcher = new MatchingService(meetings, users);
            self.postMessage({ type: 'READY' });
        }
        else if (type === 'MATCH') {
            if (!matcher) {
                throw new Error("Matcher not initialized");
            }
            const { schedules } = e.data;

            // Ejecutar matching (síncrono o asíncrono, ya no importa porque estamos en un worker)
            // Usamos matchAll síncrono para máxima velocidad, el worker ya está en otro hilo
            const results = matcher.matchAll(schedules);

            self.postMessage({ type: 'MATCH_RESULT', results });
        }
    } catch (error: any) {
        self.postMessage({ type: 'ERROR', error: error.message });
    }
};

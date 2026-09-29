type EventCallback = (payload: any) => void;

class RealtimeStore {
  private listeners: Record<string, EventCallback[]> = {};

  subscribe(table: string, callback: EventCallback) {
    if (!this.listeners[table]) {
      this.listeners[table] = [];
    }
    this.listeners[table].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[table] = this.listeners[table].filter((cb) => cb !== callback);
    };
  }

  notify(table: string, payload: any) {
    if (this.listeners[table]) {
      this.listeners[table].forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`Error in realtime listener for ${table}:`, err);
        }
      });
    }
    
    // Also notify wildcard listeners if any
    if (this.listeners['*']) {
      this.listeners['*'].forEach((cb) => {
        try {
          cb({ table, ...payload });
        } catch (err) {
          console.error(`Error in realtime wildcard listener:`, err);
        }
      });
    }
  }
}

export const globalRealtimeStore = new RealtimeStore();

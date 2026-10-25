type EventCallback = (payload: any) => void;

class RealtimeStore {
  private listeners: Record<string, EventCallback[]> = {};
  private activeChannel: any = null;
  private locallySubmittedOrderKeys: Set<string> = new Set();

  setActiveChannel(channel: any) {
    this.activeChannel = channel;
  }

  markOrderSubmittedLocally(key?: string) {
    if (!key) return;
    const clean = String(key).trim().toUpperCase();
    if (clean) {
      this.locallySubmittedOrderKeys.add(clean);
    }
  }

  isOrderSubmittedLocally(key?: string): boolean {
    if (!key) return false;
    const clean = String(key).trim().toUpperCase();
    return clean ? this.locallySubmittedOrderKeys.has(clean) : false;
  }

  async broadcastEvent(event: string, payload: any) {
    try {
      if (this.activeChannel && typeof this.activeChannel.send === 'function') {
        await this.activeChannel.send({
          type: 'broadcast',
          event,
          payload,
        });
      }
    } catch (err) {
      console.warn(`Realtime broadcast warning (${event}):`, err);
    }
  }

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

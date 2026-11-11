"use client";

type WSEvent = {
  type: string;
  [key: string]: unknown;
};

type WSListener = (event: any) => void;

class MCWebSocket {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<WSListener>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private officeState: WSEvent | null = null;

  constructor() {
    // WS server via Traefik on /mcws/ path
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    const host = typeof window !== "undefined"
      ? (window.location.port === "3000" ? `${window.location.hostname}:3101` : window.location.host)
      : "localhost:3101";
    const stream=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('stream')==='1';
    this.url = `${proto}://${host}/mcws${stream?'?stream=1':''}`;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("🔌 MC WebSocket connected");
        this.emit("connected", { type: "connected" });
      };

      this.ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as WSEvent;
          if(event.type === 'office:state') this.officeState=event;
          this.emit(event.type, event);
          this.emit("*", event); // wildcard
        } catch { /* ignore */ }
      };

      this.ws.onclose = () => {
        console.log("🔌 MC WebSocket disconnected, reconnecting in 5s...");
        this.emit("disconnected", { type: "disconnected" });
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  send(event: WSEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  on(type: string, listener: WSListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  getOfficeState() { return this.officeState; }

  private emit(type: string, event: WSEvent) {
    this.listeners.get(type)?.forEach((fn) => fn(event));
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

// Singleton
let instance: MCWebSocket | null = null;

export function getMCWebSocket(): MCWebSocket {
  if (!instance) {
    instance = new MCWebSocket();
  }
  return instance;
}

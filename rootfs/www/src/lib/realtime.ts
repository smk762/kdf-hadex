export type KDFEventHandler = (payload: any) => void;

export class RealtimeClient {
    private panelBase: string;
    private sse: EventSource | null = null;
    private ws: WebSocket | null = null;
    private pollTimer: number | null = null;
    private pollInterval = 10000; // fallback polling interval
    private handlers: Map<string, Set<KDFEventHandler>> = new Map();
    private haUnsubscribe: any = null;

    constructor(panelBase = ''){
        this.panelBase = panelBase || '';
    }

    async start(){
        // Try Home Assistant in-page connection first
        try{
            const hass = (window as any).hass;
            if(hass && hass.connection && typeof hass.connection.subscribeMessage === 'function'){
                // subscribe to a custom event type 'kdf_update' if available
                this.haUnsubscribe = hass.connection.subscribeMessage((msg:any)=>{
                    try{ this.handleMessage(msg); }catch(e){}
                }, {type: 'kdf_update'} as any);
                return;
            }
        }catch(e){/* ignore */}

        // Try Server-Sent Events (SSE)
        try{
            // Compute an ingress-aware base if running behind Home Assistant ingress
            let computedBase = '';
            try{
                const locPath = (window.location && window.location.pathname) ? window.location.pathname : '';
                const m = locPath.match(/^(.*\/api\/hassio_ingress\/[^\/]+)\/?/);
                if(m && m[1]) computedBase = m[1];
            }catch(_e){}
            const sseBase = (this.panelBase && this.panelBase !== '/') ? this.panelBase : computedBase || '';
            const sseUrl = (sseBase || '') + '/api/kdf_sse';
            this.sse = new EventSource(sseUrl);
            this.sse.onmessage = (e) => {
                try{ const data = JSON.parse(e.data); this.handleMessage(data); }catch(err){}
            };
            this.sse.onerror = () => {
                this.stopSSE();
            };
            return;
        }catch(e){/* ignore */}

        // Try WebSocket to panel server
        try{
            const loc = window.location;
            // Compute an ingress-aware base for websocket similar to SSE.
            let computedBase = '';
            try{
                const locPath = (window.location && window.location.pathname) ? window.location.pathname : '';
                const m = locPath.match(/^(.*\/api\/hassio_ingress\/[^\/]+)\/?/);
                if(m && m[1]) computedBase = m[1];
            }catch(_e){}

            let base = this.panelBase && this.panelBase !== '/' ? this.panelBase : computedBase || '';
            // if panelBase looks like an absolute URL, convert to ws(s)
            let wsUrl = '';
            if(base.startsWith('http')){
                wsUrl = base.replace(/^http/, 'ws') + '/api/kdf_ws';
            } else {
                wsUrl = (loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host + (base || '') + '/api/kdf_ws';
            }
            this.ws = new WebSocket(wsUrl);
            this.ws.onmessage = (evt) => { try{ const d = JSON.parse(evt.data); this.handleMessage(d); }catch(e){} };
            this.ws.onclose = () => { this.stopWS(); };
            this.ws.onerror = () => { this.stopWS(); };
            return;
        }catch(e){/* ignore */}

        // Last resort: start REST polling
        this.startPolling();
    }

    stop(){
        this.stopSSE();
        this.stopWS();
        this.stopPolling();
        if(this.haUnsubscribe){ try{ this.haUnsubscribe(); }catch(e){} this.haUnsubscribe = null; }
    }

    private stopSSE(){ if(this.sse){ try{ this.sse.close(); }catch(e){} this.sse = null; } }
    private stopWS(){ if(this.ws){ try{ this.ws.close(); }catch(e){} this.ws = null; } }
    private startPolling(){ this.stopPolling(); this.pollTimer = window.setInterval(()=> this.pollOnce(), this.pollInterval); this.pollOnce(); }
    private stopPolling(){ if(this.pollTimer){ clearInterval(this.pollTimer); this.pollTimer = null; } }

    private async pollOnce(){
        try{
            // compute base for polling requests
            let pollBase = '';
            try{
                const locPath = (window.location && window.location.pathname) ? window.location.pathname : '';
                const m = locPath.match(/^(.*\/api\/hassio_ingress\/[^\/]+)\/?/);
                if(m && m[1]) pollBase = m[1];
            }catch(_e){}
            if(this.panelBase && this.panelBase !== '/') pollBase = this.panelBase;

            const statusReq = fetch((pollBase || '') + '/api/status');
            const activeReq = fetch((pollBase || '') + '/api/active_swaps_transformed');
            const myOrdersReq = fetch((pollBase || '') + '/api/my_orders_transformed');
            const recentReq = fetch((pollBase || '') + '/api/recent_swaps_transformed');
            const [sRes, aRes, mRes, rRes] = await Promise.all([statusReq, activeReq, myOrdersReq, recentReq]);
            if(sRes && sRes.ok){ const sj = await sRes.json(); this.emit('status', sj); }
            if(aRes && aRes.ok){ const aj = await aRes.json(); this.emit('active_swaps', aj); }
            if(mRes && mRes.ok){ const mj = await mRes.json(); this.emit('my_orders', mj); }
            if(rRes && rRes.ok){ const rj = await rRes.json(); this.emit('my_recent_swaps', rj); }
        }catch(e){}
    }

    private handleMessage(msg:any){
        // message might include a `type` field
        if(!msg) return;
        if(msg.type){
            this.emit(msg.type, msg);
            return;
        }
        // try to detect content
        if(msg.status || msg.status === 'connected' || msg.peer_count !== undefined){ this.emit('status', msg); }
        if(msg.active_swaps || msg.uuids || (msg.result && msg.result.uuids)){
            this.emit('active_swaps', msg);
        }
        if(msg.my_orders || msg.maker_orders || msg.taker_orders || (msg.result && (msg.result.maker_orders || msg.result.taker_orders))){ this.emit('my_orders', msg); }
        if(msg.recent_swaps || (msg.result && msg.result.swaps)) { this.emit('my_recent_swaps', msg); }
        // emit generic message too
        this.emit('message', msg);
    }

    subscribe(eventType: string, cb: KDFEventHandler){
        if(!this.handlers.has(eventType)) this.handlers.set(eventType, new Set());
        this.handlers.get(eventType)!.add(cb);
    }

    unsubscribe(eventType: string, cb?: KDFEventHandler){
        if(!this.handlers.has(eventType)) return;
        if(!cb){ this.handlers.delete(eventType); return; }
        this.handlers.get(eventType)!.delete(cb);
    }

    private emit(eventType: string, payload: any){
        const s = this.handlers.get(eventType);
        if(s){ s.forEach(fn => { try{ fn(payload); }catch(e){} }); }
    }
}

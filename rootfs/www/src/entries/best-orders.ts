import { round6 } from '../lib/utils';

const sendBtn = document.getElementById('send') as HTMLButtonElement | null;
const ordersBody = document.getElementById('orders-body') as HTMLElement | null;
const msgEl = document.getElementById('message') as HTMLElement | null;
const selectedFiatEl = document.getElementById('selected-fiat') as HTMLElement | null;

let selectedFiat: string | null = null;

async function loadOptions() {
    try {
        const r = await fetch('./api/options');
        if (!r.ok) return;
        const j = await r.json();
        const opts = (j && j.options) ? j.options : {};
        selectedFiat = opts.selected_fiat_currency || null;
        if (selectedFiatEl) selectedFiatEl.textContent = selectedFiat || 'N/A';
    } catch (e) {
        console.error('failed to load options', e);
    }
}

function clearTable() {
    if (ordersBody) ordersBody.innerHTML = '<tr><td colspan="7" class="hint">No data</td></tr>';
}

function showError(text: string) {
    if (msgEl) { msgEl.textContent = text; msgEl.className = 'error'; }
}

function showHint(text: string) {
    if (msgEl) { msgEl.textContent = text; msgEl.className = 'hint'; }
}

const actionSelect = document.getElementById('action') as HTMLSelectElement | null;
if (actionSelect) {
    actionSelect.addEventListener('change', (e) => {
        const action = (e.target as HTMLSelectElement).value;
        const lbl = document.getElementById('coin-label');
        if (lbl) lbl.textContent = (action === 'buy') ? 'Buy coin' : 'Sell coin';
    });
}

if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
        const coinEl = document.getElementById('coin-select') as HTMLSelectElement | null;
        const coin = (coinEl && coinEl.value) ? (coinEl.value || '').trim().toUpperCase() : '';
        const action = (document.getElementById('action') as HTMLSelectElement | null)?.value || '';
        const exclude_mine = (document.getElementById('exclude_mine') as HTMLInputElement | null)?.value === 'true';
        const req_type = (document.getElementById('req_type') as HTMLSelectElement | null)?.value || '';
        const req_value = parseFloat(((document.getElementById('req_value') as HTMLInputElement | null)?.value) || '0') || 0;

        if (!coin) { showError('Ticker required'); return; }

        showHint('Sending request...');
        clearTable();

        try {
            const url = './api/best_orders_transformed?coin=' + encodeURIComponent(coin) + '&action=' + encodeURIComponent(action) + '&max_orders=' + encodeURIComponent(req_value || 10);
            const res = await fetch(url);
            if (!res.ok) { showError(`HTTP ${res.status}`); return; }
            const j = await res.json();
            const ordersMap = j.raw && j.raw.orders ? j.raw.orders : (j.raw || {});
            renderOrders(ordersMap);
            showHint('Results loaded');
        } catch (e) {
            console.error(e);
            showError('Request failed: ' + ((e as Error).message || String(e)));
        }
    });
}

function tryDecimal(obj: any, path: string) {
    try {
        const parts = path.split('.');
        let cur = obj;
        for (const p of parts) {
            if (!cur) return null;
            cur = cur[p];
        }
        return cur && cur.decimal ? cur.decimal : (typeof cur === 'string' ? cur : null);
    } catch (e) { return null; }
}

function renderOrders(map: Record<string, any[]>) {
    if (!ordersBody) return;
    ordersBody.innerHTML = '';
    const rows: Array<any> = [];
    for (const [ticker, arr] of Object.entries(map || {})) {
        if (!Array.isArray(arr)) continue;
        for (const o of arr) {
            const price = tryDecimal(o, 'price') || (o.price && (o.price.decimal || o.price));
            const min_rel = tryDecimal(o, 'rel_min_volume') || null;
            const max_rel = tryDecimal(o, 'rel_max_volume') || null;
            const min_base = tryDecimal(o, 'base_min_volume') || null;
            const max_base = tryDecimal(o, 'base_max_volume') || null;

            const priceNum = price ? Number(price) : NaN;
            let priceFiat = 'N/A';
            const relTicker = o && o.rel ? o.rel : null;
            if (selectedFiat && relTicker && relTicker.toUpperCase() === selectedFiat.toUpperCase()) {
                priceFiat = isNaN(priceNum) ? 'N/A' : Number(priceNum).toString();
            }

            rows.push({ ticker, price, priceFiat, min_rel, max_rel, min_base, max_base });
        }
    }

    if (rows.length === 0) {
        ordersBody.innerHTML = '<tr><td colspan="7" class="hint">No orders returned</td></tr>';
        return;
    }

    for (const r of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="left">${r.ticker}</td>
            <td>${r.price ? round6(r.price) : '--'}</td>
            <td>${r.priceFiat && r.priceFiat!=='N/A' ? round6(r.priceFiat) : 'N/A'}</td>
            <td>${r.min_rel ? round6(r.min_rel) : '--'}</td>
            <td>${r.max_rel ? round6(r.max_rel) : '--'}</td>
            <td>${r.min_base ? round6(r.min_base) : '--'}</td>
            <td>${r.max_base ? round6(r.max_base) : '--'}</td>
        `;
        ordersBody.appendChild(tr);
    }
}

async function populateTickers(){
    try{
        const r = await fetch('./api/coins_config');
        if(!r.ok) return;
        const j = await r.json();
        const coins = j.supported_coins && Array.isArray(j.supported_coins) && j.supported_coins.length ? j.supported_coins : Object.keys(j.coins_config||{});
        const sel = document.getElementById('coin-select') as HTMLSelectElement | null;
        if (!sel) return;
        sel.innerHTML = '';
        coins.forEach((t: string) =>{
            const info = (j.coins_config||{})[t]||{};
            const label = info.name || t;
            const o = document.createElement('option'); o.value = t; o.text = `${t} — ${label}`; sel.appendChild(o);
        });
    }catch(e){console.error('failed to populate tickers',e)}
}

// init
(async function(){ await loadOptions(); await populateTickers(); })();

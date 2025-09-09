// Tabulator loader with local-first fallback and promise export
const LOCAL_CSS = '/local/kdf-hadex/tabulator.min.css';
const LOCAL_JS = '/local/kdf-hadex/tabulator.min.js';
const CDN_CSS = 'https://unpkg.com/tabulator-tables@6.3.0/dist/css/tabulator.min.css';
const CDN_JS = 'https://unpkg.com/tabulator-tables@6.3.0/dist/js/tabulator.min.js';

function loadCss(href){
    return new Promise((resolve, reject)=>{
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        l.onload = () => resolve(href);
        l.onerror = () => reject(new Error('CSS load error: '+href));
        document.head.appendChild(l);
    });
}

function loadScript(src){
    return new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve(src);
        s.onerror = () => reject(new Error('Script load error: '+src));
        document.head.appendChild(s);
    });
}

async function ensureTabulator(){
    if (window.Tabulator) return window.Tabulator;

    // try local first
    try{
        await loadCss(LOCAL_CSS);
        await loadScript(LOCAL_JS);
        if (window.Tabulator) return window.Tabulator;
    }catch(e){
        console.warn('Local Tabulator load failed, falling back to CDN:', e);
    }

    // fallback to CDN
    await loadCss(CDN_CSS);
    await loadScript(CDN_JS);
    return window.Tabulator;
}

// expose a ready promise
export const TabulatorReady = ensureTabulator();
// also attach to window for non-module pages
try{ if (typeof window !== 'undefined') window.TabulatorReady = window.TabulatorReady || TabulatorReady; }catch(e){}



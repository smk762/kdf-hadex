import '../panel/kdf-panel';

export function initPanel(){
    // If the page is minimal and expects the component to mount itself
    try{
        if (typeof window !== 'undefined' && window.document) {
            if (!window.document.querySelector('kdf-panel')) {
                const el = window.document.createElement('kdf-panel');
                window.document.body.appendChild(el);
            }
        }
    }catch(e){ console.error('panel init failed', e); }
}

initPanel();

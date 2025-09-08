class CoinsConfigEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this._selected = [];
  }

  connectedCallback() {
    this.render();
    this.fetchCoins();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .wrap{font-family:var(--paper-font-body1,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial);}
        .chip{display:inline-block;padding:6px 8px;margin:4px;border-radius:12px;background:#272727;color:#fff;border:1px solid #444;cursor:pointer}
        .chip.sel{background:#00d4aa;color:#000}
        input{padding:8px;border-radius:6px;border:1px solid #444;background:#1e1e1e;color:#fff}
        .hint{font-size:0.85rem;color:#aaa;margin-top:6px}
      </style>
      <div class="wrap">
        <div><input id="search" placeholder="Filter coins..." /></div>
        <div id="list" style="margin-top:8px;max-height:240px;overflow:auto;"></div>
        <div style="margin-top:8px;">Selected: <span id="selected"></span></div>
        <div class="hint">Pick the tickers to expose in the panel. Changes are saved to addon options.</div>
        <div style="margin-top:8px;"><button id="save">Save</button></div>
      </div>
    `;
    this.shadowRoot.getElementById('search').addEventListener('input', e=> this.filter(e.target.value));
    this.shadowRoot.getElementById('save').addEventListener('click', ()=> this.save());
  }

  async fetchCoins(){
    try{
      const r = await fetch('/api/coins_config');
      if(!r.ok) return;
      const j = await r.json();
      this.coins = j.coins_config||{};
      // also fetch supported fiats to show in editor (not used here but keeps UI consistent)
      try{
        const sf = await fetch('/api/supported_fiats');
        if(sf.ok){ this.supported_fiats = (await sf.json()).fiats || []; }
      }catch(e){}
      // fetch existing options to pre-select
      try{
        const o = await fetch('/api/options');
        if(o.ok){
          const oj = await o.json();
          this._selected = (oj.options && oj.options.supported_coins) ? oj.options.supported_coins.map(s=>s.toUpperCase()) : [];
        }
      }catch(e){}
      this.populateList();
    }catch(e){console.error(e)}
  }

  populateList(){
    const list = this.shadowRoot.getElementById('list');
    list.innerHTML='';
    Object.keys(this.coins).forEach(t => {
      const info = this.coins[t]||{};
      const label = info.name||t;
      const chip = document.createElement('div');
      chip.className = 'chip'+(this._selected.includes(t)?' sel':'');
      chip.textContent = `${t} — ${label}`;
      chip.dataset.t = t;
      chip.addEventListener('click', ()=>{
        const tt = chip.dataset.t;
        if(this._selected.includes(tt)) this._selected = this._selected.filter(x=>x!==tt);
        else this._selected.push(tt);
        chip.classList.toggle('sel');
        this.updateSelected();
      });
      list.appendChild(chip);
    });
    this.updateSelected();
  }

  updateSelected(){
    this.shadowRoot.getElementById('selected').textContent = this._selected.join(', ');
  }

  filter(q){
    q = (q||'').toLowerCase();
    const chips = Array.from(this.shadowRoot.querySelectorAll('.chip'));
    chips.forEach(c=>{
      if(!q) c.style.display='inline-block';
      else c.style.display = c.textContent.toLowerCase().indexOf(q) !== -1 ? 'inline-block' : 'none';
    });
  }

  async save(){
    // Validate and persist supported_coins via dedicated endpoint
    try{
      const r = await fetch('/api/set_supported_coins', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({supported_coins:this._selected})});
      if(r.ok){
        const j = await r.json();
        alert('Saved: '+(j.supported_coins || []).join(', '));
      } else {
        const text = await r.text();
        alert('Save failed: '+text);
      }
    }catch(e){console.error(e);alert('Save failed')}
  }
}

customElements.define('coins-config-editor', CoinsConfigEditor);



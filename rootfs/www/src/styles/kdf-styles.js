import { css } from 'lit';

export const kdfStyles = css`/* Consolidated shared styles for KDF panel pages */
:root{
  --primary-color:#00d4aa;
  --primary-color-dark:#00b894;
  --card-background-color:#1a1a1a;
  --secondary-background-color:#2a2a2a;
  --primary-text-color:#ffffff;
  --secondary-text-color:#aaa;
  --divider-color:#444;
}
html,body{height:100%;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;background:#111;color:var(--primary-text-color);padding:20px}
.container{max-width:1100px;margin:0 auto}
.card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:16px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{padding:8px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:left}
th{color:var(--secondary-text-color);font-weight:600}
.hint{font-size:0.9rem;color:#888}
.loading{color:#888}
.error{color:#ff6666;padding:12px;background:#2a1a1a;border-radius:6px}
button{background:var(--primary-color);color:#000;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
.refresh-btn{background:var(--primary-color);color:#000;border:none;padding:6px 10px;border-radius:6px}
.orderbook-table, .orders-table{font-size:12px}
.price{font-weight:600;font-family:'Courier New',monospace}
.volume{color:var(--secondary-text-color);font-family:'Courier New',monospace}
.last-updated{color:#666;font-size:0.9rem;margin-top:12px}

/* Utilities */
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
@media (max-width:600px){.container{padding:12px}}


`

export default kdfStyles;

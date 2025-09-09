export function formatSig(v: any): string {
    const n = Number(v);
    if (!isFinite(n)) return '0';
    let s = n.toPrecision(12);
    if (!s.includes('e')) s = s.replace(/\.?0+$/,'');
    return s;
}

export function round6(v: any): string {
    const n = Number(v);
    if (!isFinite(n)) return String(v);
    return n.toFixed(6);
}

export function extractDecimal(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (v && typeof v === 'object' && (v as any).decimal) return String((v as any).decimal);
    return '';
}

export function computeFiatForPrice(priceStr: string, coin: string, ctx: any): string {
    throw new Error('computeFiatForPrice removed from frontend; use /api/summary or /api/coingecko_prices');
}

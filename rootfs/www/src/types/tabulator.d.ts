declare module 'tabulator-tables' {
  export interface ColumnDefinition { title?: string; field?: string; hozAlign?: string; width?: number; formatter?: any; }
  export interface TabulatorOptions { layout?: string; placeholder?: string; columns?: ColumnDefinition[]; responsiveLayout?: string; rowFormatter?: (row:any)=>void; }
  export default class Tabulator {
    constructor(el: HTMLElement, opts?: TabulatorOptions);
    setData(data: any): void;
  }
}

declare global {
  interface Window { TabulatorReady?: any; }
}

export {};

declare module '/local/kdf-hadex/vendor/tabulator/tabulator-loader.js' {
  export const TabulatorReady: any;
  const _default: any;
  export default _default;
}

declare module 'lit' {
    export class LitElement extends HTMLElement {
        protected renderRoot: Element | ShadowRoot;
        static properties?: any;
        connectedCallback(): void;
        firstUpdated?(): void;
        [key: string]: any;
    }
    export const html: any;
    export const css: any;
    const _default: any;
    export default _default;
}

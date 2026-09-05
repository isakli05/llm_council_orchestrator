/**
 * Minimal DOM helpers for the no-framework client. `el` builds elements with
 * attributes, event listeners, and children in one call — everything the
 * screens need, nothing more.
 */
export type Child = Node | string | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | boolean | ((event: Event) => void)>,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs !== undefined) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2), value as EventListener);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else if (value !== false && value !== null && value !== undefined) {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Replace all children of `host` with `root`. */
export function mount(host: HTMLElement, root: HTMLElement): void {
  host.replaceChildren(root);
}

/**
 * Utility to move focus to the next focusable form field when pressing Enter key.
 */
export function handleEnterNavigation(e, customOrder = []) {
  if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented) return;
  const target = e.target;
  if (!target || !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
  if (target.type === 'submit' || target.tagName === 'BUTTON') return;

  // Custom ordered list of elements/refs if specified
  if (customOrder && customOrder.length > 0) {
    const elements = customOrder.map((item) => (item && 'current' in item ? item.current : item)).filter(Boolean);
    const index = elements.indexOf(target);
    if (index >= 0 && index < elements.length - 1) {
      e.preventDefault();
      const next = elements[index + 1];
      next.focus();
      if (next.tagName === 'INPUT' && typeof next.select === 'function' && next.type !== 'date') {
        next.select();
      }
      return;
    }
  }

  // Fallback: Query focusable fields inside container/form
  const container = target.form || target.closest('.card') || target.closest('form') || target.ownerDocument.body;
  if (!container) return;

  const focusables = Array.from(
    container.querySelectorAll(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button[type="submit"]:not([disabled])'
    )
  );
  const index = focusables.indexOf(target);
  if (index >= 0 && index < focusables.length - 1) {
    const next = focusables[index + 1];
    if (next.tagName !== 'BUTTON' || next.type !== 'submit') {
      e.preventDefault();
      next.focus();
      if (next.tagName === 'INPUT' && typeof next.select === 'function' && next.type !== 'date') {
        next.select();
      }
    }
  }
}

// jsdom lacks the browser APIs ui-sdk popups use (the ui-sdk skill's testing guide). Import this
// file in a test that opens a popup. Assigned, not `??=`: jsdom has some without what matters.

const noop = (): undefined => undefined

HTMLElement.prototype.showPopover = noop
HTMLElement.prototype.hidePopover = noop
Element.prototype.getAnimations = () => []
Element.prototype.scrollIntoView = noop
Element.prototype.checkVisibility = () => true
Element.prototype.getClientRects = () => [] as unknown as DOMRectList
document.elementFromPoint = () => null
document.elementsFromPoint = () => []
globalThis.ResizeObserver = class {
  observe = noop
  unobserve = noop
  disconnect = noop
}
document.head.append(
  Object.assign(document.createElement('style'), {
    textContent: '[popover] { display: block !important }',
  }),
)

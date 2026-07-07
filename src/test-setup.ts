// jsdom lacks layout/measurement APIs that CodeMirror's view uses.
// Stub just enough for the editor to mount in component tests.

const rect = () => ({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
});

if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      Object.assign([], { item: () => null }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = rect as unknown as () => DOMRect;
  }
}

if (typeof document !== 'undefined') {
  const proto = Object.getPrototypeOf(document.createRange());
  if (!proto.getClientRects) {
    proto.getClientRects = () =>
      Object.assign([], { item: () => null }) as unknown as DOMRectList;
  }
  if (!proto.getBoundingClientRect) {
    proto.getBoundingClientRect = rect;
  }
}

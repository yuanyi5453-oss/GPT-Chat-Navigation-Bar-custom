/** The usable chat area excludes native padding and the docked reading drawer. */
export function getThreadContentBounds(main: HTMLElement | null) {
  if (!main) return { left: 0, right: window.innerWidth, top: 0 };

  const rect = main.getBoundingClientRect();
  const style = window.getComputedStyle(main);
  const pixels = (value: string) => Number.parseFloat(value) || 0;
  const left = Math.min(window.innerWidth, Math.max(0,
    rect.left + pixels(style.borderLeftWidth) + pixels(style.paddingLeft)
  ));
  const right = Math.max(left, Math.min(window.innerWidth,
    rect.right - pixels(style.borderRightWidth) - pixels(style.paddingRight)
  ));
  return { left, right, top: rect.top };
}

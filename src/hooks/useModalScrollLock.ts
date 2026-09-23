import { useLayoutEffect } from 'react';

// Multiple stacked dialogs share one lock. Closing a child must not unlock
// the background while its parent is still visible.
let locks = 0;
let release: (() => void) | undefined;

export function acquireModalScrollLock(): () => void {
 if (locks++ === 0) {
  const body = document.body;
  const root = document.documentElement;
  const x = window.scrollX;
  const y = window.scrollY;
  const properties = ['position', 'top', 'left', 'width', 'overflow', 'padding-right'] as const;
  const saved = properties.map(name => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)]);
  const previousRootOverflow = root.style.overflow;
  const previousHeight = root.style.getPropertyValue('--app-viewport-height');
  const previousTop = root.style.getPropertyValue('--app-viewport-top');
  const scrollbar = Math.max(0, window.innerWidth - root.clientWidth);
  if (scrollbar) body.style.paddingRight = (parseFloat(getComputedStyle(body).paddingRight) + scrollbar) + 'px';
  body.style.position = 'fixed';
  body.style.top = -y + 'px';
  body.style.left = -x + 'px';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  root.style.overflow = 'hidden';
  const viewport = window.visualViewport;
  const updateViewport = () => {
   // Let deliberate pinch zoom behave normally instead of chasing its viewport.
   if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
   root.style.setProperty('--app-viewport-height', (viewport?.height ?? window.innerHeight) + 'px');
   root.style.setProperty('--app-viewport-top', (viewport?.offsetTop ?? 0) + 'px');
  };
  updateViewport();
  viewport?.addEventListener('resize', updateViewport);
  viewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
  release = () => {
   viewport?.removeEventListener('resize', updateViewport);
   viewport?.removeEventListener('scroll', updateViewport);
   window.removeEventListener('resize', updateViewport);
   for (const [name, value, priority] of saved) {
    if (value) body.style.setProperty(name, value, priority);
    else body.style.removeProperty(name);
   }
   root.style.overflow = previousRootOverflow;
   for (const [name, value] of [['--app-viewport-height', previousHeight], ['--app-viewport-top', previousTop]]) {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
   }
   const behavior = root.style.scrollBehavior;
   root.style.scrollBehavior = 'auto';
   window.scrollTo(x, y);
   root.style.scrollBehavior = behavior;
  };
 }
 let released = false;
 return () => {
  if (released) return;
  released = true;
  if (--locks === 0) { release?.(); release = undefined; }
 };
}

export function useModalScrollLock(open: boolean): void {
 useLayoutEffect(() => {
  if (open) return acquireModalScrollLock();
 }, [open]);
}

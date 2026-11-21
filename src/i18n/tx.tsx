import { Children, type ReactNode } from 'react';
import { Tx } from './client';

/**
 * Translate the plain-string parts of a ReactNode (e.g. a button label next to its icon); elements are left alone.
 * No 'use client' here on purpose: server and client components can both call it, and the lookup happens in <Tx>.
 */
export function tx(node: ReactNode): ReactNode {
  if (typeof node === 'string') return <Tx text={node} />;
  if (Array.isArray(node)) return Children.map(node, (child) => (typeof child === 'string' ? <Tx text={child} /> : child));
  return node;
}


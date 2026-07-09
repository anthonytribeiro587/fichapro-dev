import type { ReactNode } from 'react';

export function Notice({ type = 'neutral', children }: { type?: 'neutral' | 'success' | 'danger'; children: ReactNode }) {
  return <div className={`notice ${type === 'neutral' ? '' : type}`}>{children}</div>;
}

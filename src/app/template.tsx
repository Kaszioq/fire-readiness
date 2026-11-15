// Role B. Re-mounted on every navigation, so each page gets one short fade-in. Opacity only: a transform here
// would re-anchor the fixed progress line on the home page.
import type { ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}

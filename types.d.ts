/* eslint-disable @typescript-eslint/consistent-type-imports */

import type { WebContainer, FileSystemTree } from '@webcontainer/api';

/* ----------  virtual:webcontainer-files  ---------- */
declare module 'virtual:webcontainer-files' {
  export const files: FileSystemTree;
}

/* ----------  global augmentations  ----------------- */
declare global {
  interface Window {
    webcontainerInstance?: WebContainer;
  }
}
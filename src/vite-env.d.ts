/// <reference types="vite/client" />

declare module "virtual:webcontainer-files" {
  export interface FileNode {
    file: { contents: string };
  }
  export interface DirectoryNode {
    directory: FileSystemTree;
  }
  export type FileSystemTree = {
    [name: string]: FileNode | DirectoryNode;
  };
  export const files: FileSystemTree;
}

'use client';

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { markdownToHtml } from '@/lib/markdown-to-html';
import { tiptapJsonToMarkdown } from '@/lib/tiptap-to-markdown';

export interface EditorSelection {
  text: string;
  from: number;
  to: number;
}

interface EditorContextValue {
  /** SparkEditor calls this to register/unregister the live editor instance */
  setEditor: (editor: Editor | null) => void;
  /** Returns the live Editor instance (or null if not mounted) */
  getEditor: () => Editor | null;
  /** Returns the editor's current content as Markdown (empty string if not mounted) */
  getDocumentText: () => string;
  /** Set by the "Ask AI" bubble menu button; cleared after applying a proposal */
  selectedText: EditorSelection | null;
  setSelectedText: (sel: EditorSelection | null) => void;
  /**
   * Apply a text replacement at the stored selection range.
   * If there is no stored selection, inserts at the current cursor position.
   */
  applyProposal: (replacement: string) => void;
  /** Append markdown content to the end of the document (separated by HR) */
  appendContent: (markdown: string) => void;
  /** Replace the entire document with markdown content */
  replaceDocument: (markdown: string) => void;
  /** Insert markdown content after a specific heading. Falls back to append. */
  insertAfterHeading: (markdown: string, headingText: string) => void;
}

const CUSTOM_ATOM_TYPES = new Set(['groupBlock', 'drawing']);

interface SavedCustomNode {
  /** The full TipTap JSON for this atom node */
  json: JSONContent;
  /** The heading text immediately before this node (for position matching) */
  precedingHeading: string | null;
}

/**
 * Walk a TipTap JSON doc and extract custom atom nodes along with their
 * preceding heading context so they can be re-inserted after a full replace.
 */
function extractCustomNodes(doc: JSONContent): SavedCustomNode[] {
  const result: SavedCustomNode[] = [];
  if (!doc.content) return result;

  let lastHeading: string | null = null;

  for (const node of doc.content) {
    if (node.type === 'heading') {
      lastHeading = extractText(node);
    } else if (node.type && CUSTOM_ATOM_TYPES.has(node.type)) {
      result.push({ json: node, precedingHeading: lastHeading });
    }
  }

  return result;
}

/** Extract plain text from a TipTap JSON node tree */
function extractText(node: JSONContent): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractText).join('');
}

/**
 * Re-insert saved custom nodes into the editor after a content replacement.
 * Matches by preceding heading text; falls back to appending at the end.
 */
function reinsertCustomNodes(editor: Editor, nodes: SavedCustomNode[]) {
  for (const saved of nodes) {
    let insertPos: number | null = null;

    if (saved.precedingHeading) {
      const target = saved.precedingHeading.trim().toLowerCase();
      // Find the heading in the new doc and insert after the section
      // (after the heading node + any content until the next heading or end)
      let foundHeadingEnd: number | null = null;
      let nextNodeStart: number | null = null;

      editor.state.doc.descendants((node, pos) => {
        if (foundHeadingEnd !== null && nextNodeStart !== null) return false;

        if (node.type.name === 'heading' && node.textContent.trim().toLowerCase() === target) {
          foundHeadingEnd = pos + node.nodeSize;
          return false;
        }

        // If we found the heading, the next top-level node after it is our insert point
        if (foundHeadingEnd !== null && nextNodeStart === null && node.isBlock) {
          nextNodeStart = pos;
          return false;
        }
      });

      if (foundHeadingEnd !== null) {
        // Insert right after the heading
        insertPos = foundHeadingEnd;
      }
    }

    if (insertPos !== null) {
      editor.chain().insertContentAt(insertPos, saved.json).run();
    } else {
      // Fallback: append at end of document
      const endPos = editor.state.doc.content.size;
      editor.chain().insertContentAt(endPos, saved.json).run();
    }
  }
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorContextProvider({ children }: { children: React.ReactNode }) {
  const editorRef = useRef<Editor | null>(null);
  const [selectedText, setSelectedText] = useState<EditorSelection | null>(null);

  const setEditor = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
  }, []);

  const getEditor = useCallback(() => editorRef.current, []);

  const getDocumentText = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return '';
    return tiptapJsonToMarkdown(editor.getJSON());
  }, []);

  const applyProposal = useCallback(
    (replacement: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      if (selectedText) {
        // Replace the stored selection range
        editor
          .chain()
          .focus()
          .deleteRange({ from: selectedText.from, to: selectedText.to })
          .insertContentAt(selectedText.from, replacement)
          .run();
        setSelectedText(null);
      } else {
        // No selection stored — insert at current cursor
        editor.chain().focus().insertContent(replacement).run();
      }
    },
    [selectedText],
  );

  const appendContent = useCallback((markdown: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = markdownToHtml(markdown);
    editor
      .chain()
      .focus('end')
      .insertContent('<hr>')
      .insertContent(html)
      .run();
  }, []);

  const replaceDocument = useCallback((markdown: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    // Extract custom atom nodes from the current doc before replacing.
    // These nodes (groupBlock, drawing) can't be reproduced from markdown,
    // so we capture them and re-insert after setting the new content.
    const customNodes = extractCustomNodes(editor.getJSON());

    const html = markdownToHtml(markdown);
    editor.commands.setContent(html);

    // Re-insert custom nodes at their approximate positions
    if (customNodes.length > 0) {
      reinsertCustomNodes(editor, customNodes);
    }
  }, []);

  const insertAfterHeading = useCallback((markdown: string, headingText: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = markdownToHtml(markdown);
    const target = headingText.trim().toLowerCase();

    // Walk the document to find the heading node
    let insertPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (insertPos !== null) return false; // already found
      if (node.type.name === 'heading' && node.textContent.trim().toLowerCase() === target) {
        // Insert after this heading node
        insertPos = pos + node.nodeSize;
        return false;
      }
    });

    if (insertPos !== null) {
      editor.chain().focus(insertPos).insertContentAt(insertPos, html).run();
    } else {
      // Fallback: append to end
      appendContent(markdown);
    }
  }, [appendContent]);

  return (
    <EditorContext.Provider
      value={{
        setEditor, getEditor, getDocumentText, selectedText, setSelectedText,
        applyProposal, appendContent, replaceDocument, insertAfterHeading,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

/** Returns null when used outside the provider — handle gracefully in consumers */
export function useEditorContext() {
  return useContext(EditorContext);
}

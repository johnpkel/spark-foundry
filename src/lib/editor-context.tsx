'use client';

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/core';

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
  /** Returns the editor's current plain-text content (empty string if not mounted) */
  getDocumentText: () => string;
  /** Set by the "Ask AI" bubble menu button; cleared after applying a proposal */
  selectedText: EditorSelection | null;
  setSelectedText: (sel: EditorSelection | null) => void;
  /**
   * Apply a text replacement at the stored selection range.
   * If there is no stored selection, inserts at the current cursor position.
   */
  applyProposal: (replacement: string) => void;
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
    return editorRef.current?.getText() ?? '';
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

  return (
    <EditorContext.Provider
      value={{ setEditor, getEditor, getDocumentText, selectedText, setSelectedText, applyProposal }}
    >
      {children}
    </EditorContext.Provider>
  );
}

/** Returns null when used outside the provider — handle gracefully in consumers */
export function useEditorContext() {
  return useContext(EditorContext);
}

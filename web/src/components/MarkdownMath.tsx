import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownMathProps {
  text: string;
  className?: string;
  inline?: boolean;
}

/**
 * Normalize math delimiters: convert \( \) and \[ \] into $ and $$ 
 * so remark-math can parse them correctly
 */
function normalizeMath(s: string): string {
  return s
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$');
}

/**
 * MarkdownMath component that renders markdown with LaTeX math support
 * Uses KaTeX for rendering mathematical expressions
 */
export function MarkdownMath({ text, className = '', inline = false }: MarkdownMathProps) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const normalizedText = normalizeMath(text);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={
          inline
            ? {
                p: ({ children }) => <>{children}</>,
              }
            : undefined
        }
      >
        {normalizedText}
      </ReactMarkdown>
    </div>
  );
}


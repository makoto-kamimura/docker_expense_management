import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

/** リンクとして有効にする URL (それ以外は無効にする。javascript: などを防ぐ) */
function safeUrl(url: string): string {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url : '';
}

const components: Components = {
  // リンクは新しいタブで開く (無効な URL は文字だけにする)
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // 画像の埋め込みは外部への読み込みになるので、リンクとして出す
  img: ({ src, alt }) =>
    typeof src === 'string' && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer">
        {alt || src}
      </a>
    ) : null,
};

/**
 * Markdown (GFM) を整えて表示する (購入理由など)。
 * 1つの改行も改行として出す (GitHub のコメントと同じ)。HTML の直書きは HTML にせず文字のまま出す。
 */
export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`markdown${className ? ` ${className}` : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} urlTransform={safeUrl} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

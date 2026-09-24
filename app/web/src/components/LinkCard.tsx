import { hostOf } from '@/lib/format';
import { previewImagePath, type LinkPreview } from '@/lib/types';

/** リンク先のプレビューカード (SNS でリンクを貼ったときのカード風)。プレビューがなければ URL だけ表示する */
export default function LinkCard({ url, preview }: { url: string; preview?: LinkPreview }) {
  return (
    <a className="link-card" href={url} target="_blank" rel="noopener noreferrer">
      {preview?.has_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewImagePath(preview.id)} alt="" loading="lazy" />
      )}
      <span className="link-card-body">
        <span className="link-card-title">{preview?.title ?? url}</span>
        <span className="muted small">{preview?.site_name ? `${preview.site_name} · ` : ''}{hostOf(url)} ↗</span>
      </span>
    </a>
  );
}

/** 小さなサムネイル (一覧・比較表用) */
export function Thumb({ id, size = 40, alt = '' }: { id: string | null | undefined; size?: number; alt?: string }) {
  if (!id) return <span className="thumb thumb-empty" style={{ width: size, height: size }} aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="thumb" src={previewImagePath(id)} alt={alt} width={size} height={size} loading="lazy" />
  );
}

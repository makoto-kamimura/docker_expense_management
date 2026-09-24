import type { Attachment } from '@/lib/types';
import { isImage, isPdf } from '@/lib/format';
import { AttachmentDelete } from './AttachmentUpload';

/** 添付ファイル一覧。/attachments/:id は Cookie 認証付きのプロキシ。 */
export default function Attachments({
  files,
  requestId,
  canDelete,
}: {
  files: Attachment[];
  requestId: string;
  canDelete?: boolean;
}) {
  return (
    <div className="files">
      {files.map((f) => {
        const src = `/attachments/${f.id}`;
        return (
          <div key={f.id} className="file">
            <a href={src} target="_blank" rel="noreferrer" className="file-preview" aria-label={`${f.file_name} を開く`}>
              {isImage(f.content_type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={f.file_name} />
              ) : isPdf(f.content_type) ? (
                <object data={src} type="application/pdf" aria-label={f.file_name}>
                  <span className="file-icon" aria-hidden="true">📄</span>
                </object>
              ) : (
                <span className="file-icon" aria-hidden="true">🖼</span>
              )}
            </a>
            <div className="file-meta">
              <span>
                <span aria-hidden="true">{isPdf(f.content_type) ? '📄 ' : '🖼 '}</span>
                <a href={src} target="_blank" rel="noreferrer">{f.file_name}</a>
                <span className="muted"> · {Math.max(1, Math.round(f.byte_size / 1024))} KB</span>
              </span>
              {canDelete && <AttachmentDelete requestId={requestId} attachmentId={f.id} name={f.file_name} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import type { ChoresResp } from '@/lib/types';
import { choreScheduleLabel } from '@/lib/format';
import ChoreButton from '../chore-button';
import { ImageCaption, ImageUpload } from './chore-images';

/** 家事 1 つの詳細。見本画像で「きれいな状態 = 保つべき状態」を示す */
export default async function ChoreDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const d = await apiFetch<ChoresResp>('/chores');
  const chore = d.chores.find((c) => c.id === params.id);
  if (!chore) notFound();

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ margin: '0 0 8px' }}><Link href="/chores">← マイページ</Link></p>
      <h1>
        <span aria-hidden="true">{chore.icon}</span> {chore.name}
        {chore.archived && <> <span className="label label-muted">非表示</span></>}
      </h1>
      {chore.description && <p className="chore-detail-desc">{chore.description}</p>}
      {choreScheduleLabel(chore) && <p className="chore-detail-desc chore-schedule">{choreScheduleLabel(chore)}</p>}

      <div className="box">
        <div className="box-head">
          <h2>きれいな状態の見本 <span className="ja">この状態を保てたらコミット</span></h2>
          <span className="counter">{chore.images.length}</span>
        </div>
        <div className="box-body">
          {chore.images.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              まだ見本の画像はありません。{user.is_admin ? '下から追加できます。' : '管理者に追加してもらいましょう。'}
            </p>
          ) : (
            <div className="sample-grid">
              {chore.images.map((img, i) => (
                <figure key={img.id} className="sample">
                  <a href={`/chore-images/${img.id}`} target="_blank" rel="noreferrer" aria-label={`見本 ${i + 1} を拡大して開く`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/chore-images/${img.id}`} alt={img.caption || `${chore.name}の見本 ${i + 1}`} />
                  </a>
                  <figcaption>
                    {user.is_admin ? (
                      <ImageCaption image={img} />
                    ) : (
                      img.caption || <span className="muted">説明はありません</span>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {user.is_admin && <ImageUpload choreId={chore.id} full={chore.images.length >= 10} />}
        </div>
      </div>

      {!chore.archived && (
        <div className="box">
          <div className="box-head"><h2>今日のコミット <span className="ja">{d.today}</span></h2></div>
          <div className="box-body">
            <div style={{ maxWidth: 220 }}><ChoreButton chore={chore} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

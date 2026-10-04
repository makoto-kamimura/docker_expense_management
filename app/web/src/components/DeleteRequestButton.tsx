'use client';
import ConfirmButton from './ConfirmButton';
import { deleteRequestAction } from '@/lib/actions';

/** 稟議の削除 (申請者は自分の稟議、管理者はグループの稟議を、状態に関係なく消せる) */
export default function DeleteRequestButton({ id, finished }: { id: string; finished: boolean }) {
  return (
    <ConfirmButton
      label="この稟議を削除"
      className="btn-danger btn-sm"
      title="この稟議を削除しますか？"
      confirmLabel="削除する"
      confirmClassName="btn-danger"
      onConfirm={() => deleteRequestAction(id)}
    >
      <p>コメント・添付・履歴もすべて消え、取り消せません。</p>
      {finished && <p>ダッシュボードの支出の集計からも消えます。</p>}
    </ConfirmButton>
  );
}

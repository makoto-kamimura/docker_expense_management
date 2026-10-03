import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import Octicon from '@/components/Octicon';

/** トップ。ログイン中はマイページ (家事) を最初に出し、未ログインなら紹介ページを出す */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <Landing />;
  redirect(user.onboarded ? '/chores' : '/onboarding');
}

function Landing() {
  return (
    <div>
      <section className="hero">
        <div className="eyebrow">稟議をマージ</div>
        <h1>RingiWoMerge</h1>
        <p className="tagline">大きな買い物は、グループのレビューを通してから。</p>
        <div className="flow" aria-label="使い方の流れ">
          <b>申請</b>→<b>レビュー</b>→<b>コメント</b>→<b>承認</b>→<b>マージ</b>→<b>購入・お出かけ</b>
        </div>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" href="/register">グループを作成して始める</Link>
          <Link className="btn" href="/login">ログイン</Link>
        </div>
      </section>
      <div className="steps">
        <div className="step-card">
          <div className="n"><Octicon name="pencil" /></div>
          <h3>1. 稟議を作る</h3>
          <p className="muted">買いたいもの・行きたいところを、金額・理由・URLと一緒にグループに伝えます。</p>
        </div>
        <div className="step-card">
          <div className="n"><Octicon name="eye" /></div>
          <h3>2. レビュー</h3>
          <p className="muted">グループが金額・理由・リンク・資料を確認し、コメントで質問できます。</p>
        </div>
        <div className="step-card">
          <div className="n"><Octicon name="merge" /></div>
          <h3>3. 承認してマージ</h3>
          <p className="muted">みんなが納得したらマージ。稟議成立で、買いに行く・出かけるに進みます。</p>
        </div>
      </div>
    </div>
  );
}

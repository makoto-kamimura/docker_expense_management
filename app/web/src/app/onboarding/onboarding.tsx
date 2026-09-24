'use client';
import { useState, useTransition } from 'react';
import { completeOnboardingAction } from '@/lib/actions';

const STEPS = [
  { title: '1. 稟議を作る', body: '買いたいもの・金額・理由・商品URLをまとめて、家族に伝えます。' },
  { title: '2. レビュー', body: '家族が金額・理由・リンク・資料を確認し、コメントで質問できます。' },
  { title: '3. 承認してマージ', body: 'みんなが納得したら「マージ」します。マージ＝家族が購入に合意したこと。あとは購入するだけです。' },
];

/** 初回ログイン時の 3 ステップ説明 (memo.md §26) */
export default function Onboarding({ name, familyName }: { name: string; familyName: string }) {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const finish = (next: string) => start(() => completeOnboardingAction(next));

  return (
    <div className="center-card">
      <div className="box">
        <div className="box-body" style={{ padding: 32, textAlign: 'center' }}>
          <div className="eyebrow">{familyName} へようこそ</div>
          <p className="muted">{name} さん、RingiWoMerge の使い方を紹介します。</p>
          <div className="progress" aria-hidden="true">
            {STEPS.map((_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}
          </div>
          <h1 style={{ fontSize: 24 }}>{s.title}</h1>
          <p style={{ fontSize: 16 }}>{s.body}</p>
                    <div className="actions" style={{ justifyContent: 'center', marginTop: 24 }}>
            {step > 0 && <button type="button" onClick={() => setStep(step - 1)}>戻る</button>}
            {last ? (
              <button type="button" className="btn-primary" disabled={pending} onClick={() => finish('/requests/new')}>
                最初の稟議を作る
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>次へ</button>
            )}
          </div>
          <button type="button" className="btn-link small" style={{ marginTop: 16 }} disabled={pending} onClick={() => finish('/')}>
            あとで見る
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '@/api';
import { Button, C, s } from '@/components/ui';

const STEPS = [
  { title: '1. 稟議を作る', body: '買いたいもの・金額・理由・商品URLをまとめて、家族に伝えます。' },
  { title: '2. レビュー', body: '家族が金額・理由・リンク・資料を確認し、コメントで質問できます。' },
  { title: '3. 承認してマージ', body: 'みんなが納得したら「マージ」します。マージ＝家族が購入に合意したこと。あとは購入するだけです。' },
];

/** 初回ログイン時の 3 ステップ説明 (memo.md §26) */
export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const st = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = async (next: '/requests' | '/requests/new') => {
    setBusy(true);
    try {
      await apiFetch('/me/onboarded', { method: 'POST', body: '{}' });
      router.replace('/requests');
      if (next === '/requests/new') router.push('/requests/new');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.screen, { padding: 24, justifyContent: 'center' }]}>
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
        {STEPS.map((_, i) => (
          <View key={i} style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: i <= step ? C.green : C.border }} />
        ))}
      </View>
      <Text style={{ fontSize: 26, fontWeight: '700', textAlign: 'center', color: C.fg }}>{st.title}</Text>
      <Text style={{ fontSize: 17, textAlign: 'center', marginTop: 12, color: C.fg }}>{st.body}</Text>
      <View style={{ marginTop: 40, gap: 8 }}>
        {last ? (
          <Button title="最初の稟議を作る" variant="primary" onPress={() => finish('/requests/new')} busy={busy} />
        ) : (
          <Button title="次へ" variant="primary" onPress={() => setStep(step + 1)} />
        )}
        {step > 0 && <Button title="戻る" onPress={() => setStep(step - 1)} />}
        <Text style={[s.link, { textAlign: 'center', marginTop: 12 }]} onPress={() => finish('/requests')}>あとで見る</Text>
      </View>
    </View>
  );
}

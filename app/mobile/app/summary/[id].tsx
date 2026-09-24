import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { apiFetch, getToken } from '@/api';
import { checkpoints, dateRange, fmtDateTime, money } from '@/format';
import { AttachmentList } from '@/components/Attachments';
import { C, StatusBadge, s } from '@/components/ui';
import { DECISION_LABEL, KIND_TEXT, type RequestDetail } from '@/types';


/** 申請のまとめ資料。横スワイプでスライドを切り替える (Web の Summary と同じ構成)。 */
export default function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [d, setD] = useState<RequestDetail | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useFocusEffect(useCallback(() => {
    Promise.all([apiFetch<RequestDetail>(`/requests/${id}`), getToken()])
      .then(([detail, tk]) => { setD(detail); setToken(tk); })
      .catch((e) => Alert.alert('読み込めませんでした', (e as Error).message));
  }, [id]));

  if (!d) return <View style={s.center}><ActivityIndicator /></View>;
  const r = d.request;
  const t = KIND_TEXT[r.kind];
  const TITLES = ['表紙', t.reason, t.compare, '資料', '話し合い', '判定'];
  const comments = d.timeline.filter((e) => e.type === 'comment').slice(-4);
  const go = (i: number) => { pager.current?.scrollTo({ x: i * width, animated: true }); setPage(i); };
  const H = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 20, fontWeight: '700', borderBottomColor: '#fd8c73', borderBottomWidth: 3, alignSelf: 'flex-start', paddingBottom: 4, marginBottom: 14 }}>{children}</Text>
  );
  const Meta = ({ k, v }: { k: string; v: string }) => (
    <View style={{ borderLeftColor: C.border, borderLeftWidth: 3, paddingLeft: 10, marginTop: 10 }}>
      <Text style={s.muted}>{k}</Text>
      <Text style={{ fontWeight: '600', fontSize: 15 }}>{v}</Text>
    </View>
  );

  const slides = [
    <View key="cover">
      <Text style={{ color: C.muted, fontWeight: '600' }}>{t.eyebrow} · {d.family_name}</Text>
      <Text style={{ fontSize: 26, fontWeight: '700', marginTop: 8 }}>{r.title}</Text>
      <Text style={{ fontSize: 34, fontWeight: '800', marginVertical: 8 }}>{money(r.price, r.currency)}</Text>
      <StatusBadge status={r.status} kind={r.kind} hint />
      <Meta k="申請者" v={d.requester.name} />
      <Meta k="レビュアー" v={d.reviewers.map((x) => x.name).join('、') || '—'} />
      <Meta k={t.product} v={r.product_name || '—'} />
      <Meta k={t.seller} v={r.seller || '—'} />
      <Meta k={t.hasEndDate ? '日程' : t.date} v={dateRange(r.planned_date, r.end_date)} />
      <Meta k="ラベル" v={d.labels.map((l) => l.name).join('、') || '—'} />
      <Meta k="申請日時" v={fmtDateTime(r.submitted_at)} />
    </View>,
    <View key="reason">
      <H>{t.reason}</H>
      <Text style={{ fontSize: 17, lineHeight: 26 }}>{r.reason || '—'}</Text>
      {r.notes && <Text style={[s.muted, { marginTop: 16 }]}>メモ: {r.notes}</Text>}
    </View>,
    <View key="product">
      <H>{t.compare}</H>
      {[{ id: 'this', name: `${r.product_name ?? r.title}（この稟議）`, price: r.price, url: r.product_url, notes: r.seller }, ...d.alternatives].map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', paddingVertical: 10, borderBottomColor: C.borderMuted, borderBottomWidth: 1, gap: 8, backgroundColor: a.id === 'this' ? '#ddf4ff' : undefined }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }}>{a.name}</Text>
            {a.notes && <Text style={s.muted}>{a.notes}</Text>}
            {a.url && <Text style={s.link} onPress={() => Linking.openURL(a.url!)}>開く</Text>}
          </View>
          <Text style={{ fontWeight: '700' }}>{money(a.price, r.currency)}</Text>
        </View>
      ))}
    </View>,
    <View key="files">
      <H>資料</H>
      {d.attachments.length === 0 ? <Text style={s.muted}>添付された資料はありません。</Text> : <AttachmentList files={d.attachments} token={token} height={96} />}
    </View>,
    <View key="discussion">
      <H>話し合い</H>
      {comments.length === 0 && <Text style={s.muted}>コメントはまだありません。</Text>}
      {comments.map((c) => c.type === 'comment' && (
        <Text key={c.id} style={{ marginBottom: 10 }}><Text style={{ fontWeight: '700' }}>{c.user?.name}: </Text>{c.body}</Text>
      ))}
      <Text style={{ fontWeight: '700', marginTop: 12, marginBottom: 6 }}>レビューのチェックポイント</Text>
      {checkpoints(d).map((c) => (
        <Text key={c.label} style={{ color: c.ok ? C.green : C.yellow, marginBottom: 4 }}>{c.ok ? '✓' : '!'} <Text style={{ color: C.fg }}>{c.label}</Text></Text>
      ))}
    </View>,
    <View key="decision">
      <H>判定</H>
      <StatusBadge status={r.status} kind={r.kind} hint />
      {d.reviewers.map((x) => <Meta key={x.id} k={x.name} v={DECISION_LABEL[x.decision]} />)}
      {d.merged_by && <Meta k="マージした人" v={`${d.merged_by.name} · ${fmtDateTime(r.merged_at)}`} />}
      {r.status === 'purchased' && <Meta k={t.actualPrice} v={`${money(r.actual_price, r.currency)} · ${r.purchase_date}`} />}
    </View>,
  ];

  return (
    <View style={s.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10, gap: 6 }} style={{ flexGrow: 0 }}>
        {TITLES.map((t, i) => (
          <Pressable key={t} onPress={() => go(i)} style={[s.chip, i === page && { backgroundColor: C.fg, borderColor: C.fg }]}>
            <Text style={[s.chipText, i === page && { color: '#fff', fontWeight: '700' }]}>{i + 1}. {t}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {slides.map((slide, i) => (
          <ScrollView key={i} style={{ width }} contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, borderColor: C.border, borderWidth: 1, padding: 20, minHeight: 420 }}>{slide}</View>
            <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>{i + 1} / {slides.length}</Text>
          </ScrollView>
        ))}
      </ScrollView>
    </View>
  );
}

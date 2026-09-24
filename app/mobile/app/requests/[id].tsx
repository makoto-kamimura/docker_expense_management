import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { apiFetch, getToken, linkPreviewUrl } from '@/api';
import { checkpoints, dateRange, describeEvent, hostOf, money, timeAgo } from '@/format';
import { AttachmentList, pickAndUpload } from '@/components/Attachments';
import { Avatar, Button, C, Card, Fact, StatusBadge, s } from '@/components/ui';
import { ChoreBadges, ContributionGraph } from '@/components/Contributions';
import { LabelEditor } from '@/components/Labels';
import { DECISION_LABEL, KIND_TEXT, statusLabel, type Me, type RequestDetail } from '@/types';

type Action = 'submit' | 'approve' | 'request-changes' | 'reject' | 'merge' | 'close' | 'reopen';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<RequestDetail | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, self, tk] = await Promise.all([apiFetch<RequestDetail>(`/requests/${id}`), apiFetch<Me>('/me'), getToken()]);
      setD(detail);
      setMe(self);
      setTokenState(tk);
    } catch (e) {
      Alert.alert('読み込めませんでした', (e as Error).message);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!d || !me) return <View style={s.center}><ActivityIndicator /></View>;
  const { request: r, permissions: p } = d;
  const price = money(r.price, r.currency);
  const t = KIND_TEXT[r.kind];
  const evidence = d.attachments.filter((a) => a.kind === 'evidence');
  const productPreview = r.product_url ? d.previews.find((pv) => pv.url === r.product_url) : undefined;
  const receipts = d.attachments.filter((a) => a.kind === 'receipt');

  const run = async (action: Action, withComment = false) => {
    setBusy(true);
    try {
      const next = await apiFetch<RequestDetail>(`/requests/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ comment: withComment ? comment.trim() || null : null }),
      });
      setD(next);
      if (withComment) setComment('');
    } catch (e) {
      Alert.alert('更新できませんでした', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = (title: string, message: string, label: string, onOk: () => void, destructive = false) =>
    Alert.alert(title, message, [
      { text: 'キャンセル', style: 'cancel' },
      { text: label, style: destructive ? 'destructive' : 'default', onPress: onOk },
    ]);

  const postComment = async () => {
    setBusy(true);
    try {
      setD(await apiFetch<RequestDetail>(`/requests/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) }));
      setComment('');
    } catch (e) {
      Alert.alert('コメントできませんでした', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (kind: 'evidence' | 'receipt') => {
    if (await pickAndUpload(r.id, kind)) load();
  };

  const withdraw = () => confirm('この稟議を取り下げますか？', '稟議はクローズされます。', '取り下げる', () => run('close'), true);
  const reject = () => confirm('この稟議を却下しますか？', '稟議はクローズされます。', '却下する', () => run('reject', true), true);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 22, color: C.fg }}>{r.kind !== 'purchase' ? `${t.icon} ` : ''}{r.title}</Text>
      <Text style={{ fontSize: 24, fontWeight: '700', color: C.fg, marginVertical: 4 }}>{price}</Text>
      <StatusBadge status={r.status} kind={r.kind} hint />
      {d.parent && (
        <Text style={[s.link, { marginTop: 6 }]} onPress={() => router.push(`/requests/${d.parent!.id}`)}>
          ⑂ 「{d.parent.title}」#{d.parent.id.slice(0, 7)} から分岐
        </Text>
      )}
      <Text style={[s.muted, { marginTop: 6, marginBottom: 12 }]}>
        #{r.id.slice(0, 7)} · 申請者: {d.requester.name} · レビュアー: {d.reviewers.map((x) => `${x.name}（${DECISION_LABEL[x.decision]}）`).join('、') || '—'}
      </Text>

      <View style={{ backgroundColor: '#fff', borderColor: C.border, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <LabelEditor detail={d} onSaved={setD} />
      </View>

      <Card title={t.reason}>
        <Text style={{ fontSize: 15, lineHeight: 22, color: C.fg }}>{r.reason || '—'}</Text>
      </Card>

      <Card
        title={t.section}
        right={r.product_url ? <Text style={s.link} onPress={() => Linking.openURL(r.product_url!)}>ページを開く</Text> : undefined}
      >
        {productPreview && (
          <Pressable onPress={() => Linking.openURL(r.product_url!)} style={{ flexDirection: 'row', gap: 10, borderColor: C.border, borderWidth: 1, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
            {productPreview.has_image && (
              <Image
                source={{ uri: linkPreviewUrl(productPreview.id), headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                style={{ width: 96, height: 72, backgroundColor: C.bg }}
                resizeMode="cover"
              />
            )}
            <View style={{ flex: 1, paddingVertical: 8, paddingRight: 8, paddingLeft: productPreview.has_image ? 0 : 10, justifyContent: 'center' }}>
              <Text numberOfLines={2} style={{ fontWeight: '600', color: C.fg }}>{productPreview.title ?? r.product_url}</Text>
              <Text style={s.muted} numberOfLines={1}>{productPreview.site_name ? `${productPreview.site_name} · ` : ''}{hostOf(r.product_url!)} ↗</Text>
            </View>
          </Pressable>
        )}
        <Fact label={t.product} value={r.product_name ?? '—'} />
        <Fact label={t.seller} value={r.seller || '—'} />
        <Fact label={t.priceShort} value={price} />
        <Fact
          label={t.productUrl}
          value={r.product_url ? <Text style={s.link} onPress={() => Linking.openURL(r.product_url!)}>{hostOf(r.product_url)}</Text> : '—'}
        />
        <Fact label={t.hasEndDate ? '日程' : t.date} value={dateRange(r.planned_date, r.end_date)} last={!r.notes} />
        {r.notes && <Fact label="メモ" value={r.notes} last />}
      </Card>

      {d.alternatives.length > 0 && (
        <Card title={t.alternatives}>
          {d.alternatives.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomColor: C.borderMuted, borderBottomWidth: 1, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600' }}>{a.name}</Text>
                {a.notes && <Text style={s.muted}>{a.notes}</Text>}
                {a.url && <Text style={s.link} onPress={() => Linking.openURL(a.url!)}>開く</Text>}
              </View>
              <Text style={{ fontWeight: '600', color: a.price != null && a.price < r.price ? C.green : C.fg }}>{money(a.price, r.currency)}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card
        title="資料"
        right={p.can_upload_evidence ? <Text style={s.link} onPress={() => upload('evidence')}>＋ 添付</Text> : undefined}
      >
        {evidence.length === 0 ? <Text style={s.muted}>添付された資料はありません。</Text> : <AttachmentList files={evidence} token={token} />}
      </Card>

      {receipts.length > 0 && (
        <Card title={t.receipt}>
          <AttachmentList files={receipts} token={token} />
        </Card>
      )}

      <Card
        title="分岐"
        right={me.can_request ? <Text style={s.link} onPress={() => router.push(`/requests/new?parent=${r.id}`)}>⑂ この稟議から分岐</Text> : undefined}
      >
        {d.children.length === 0 ? (
          <Text style={s.muted}>「その後でやりたいこと」などを、この稟議に紐づけて作れます。</Text>
        ) : (
          d.children.map((c) => (
            <Pressable key={c.id} onPress={() => router.push(`/requests/${c.id}`)} style={{ paddingVertical: 6 }}>
              <Text style={[s.link, { fontWeight: '600' }]}>{KIND_TEXT[c.kind].icon} {c.title}</Text>
              <Text style={s.muted}>#{c.id.slice(0, 7)} · {c.requester_name} · {statusLabel(c.kind, c.status)}</Text>
            </Pressable>
          ))
        )}
      </Card>

      <Card
        title="申請者の家事コミット"
        right={<Text style={s.link} onPress={() => router.push('/chores')}>家族の実績</Text>}
      >
        <ContributionGraph days={d.requester_contributions.calendar} cell={8} />
        <ChoreBadges c={d.requester_contributions} compact />
      </Card>

      <Card title="レビューのチェックポイント">
        {checkpoints(d).map((c) => (
          <Text key={c.label} style={{ marginBottom: 4, color: c.ok ? C.green : C.yellow }}>
            {c.ok ? '✓' : '!'} <Text style={{ color: C.fg }}>{c.label}</Text>
          </Text>
        ))}
        <Button title="まとめ資料を見る" onPress={() => router.push(`/summary/${r.id}`)} style={{ marginTop: 8 }} />
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: C.fg }}>アクティビティ</Text>
        <Text style={s.link} onPress={() => router.push(`/history/${r.id}`)}>変更履歴を見る</Text>
      </View>
      {d.timeline.map((e) =>
        e.type === 'comment' ? (
          <View key={e.id} style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <Avatar name={e.user?.name ?? '?'} size={28} />
            <View style={{ flex: 1, backgroundColor: '#fff', borderColor: C.border, borderWidth: 1, borderRadius: 8 }}>
              <Text style={{ backgroundColor: C.bg, padding: 8, fontSize: 13 }}>
                <Text style={{ fontWeight: '700' }}>{e.user?.name ?? '退会したメンバー'}</Text> <Text style={s.muted}>{timeAgo(e.created_at)}にコメント</Text>
              </Text>
              <Text style={{ padding: 10, color: C.fg }}>{e.body}</Text>
            </View>
          </View>
        ) : (
          <Text key={e.id} style={[s.muted, { marginLeft: 36, marginBottom: 8 }]}>
            • {describeEvent(e, r.kind)}（{timeAgo(e.created_at)}）
          </Text>
        ),
      )}

      {/* 次にやること (Web の StatusPanel と同じ分岐) */}
      <View style={{ backgroundColor: '#fff', borderColor: C.border, borderWidth: 1, borderRadius: 8, padding: 14, marginVertical: 12, gap: 8 }}>
        {r.status === 'draft' && (
          <>
            <Text style={{ fontWeight: '700' }}>この稟議は下書きです</Text>
            {p.can_edit && <Button title="編集" onPress={() => router.push(`/requests/edit/${r.id}`)} />}
            {p.can_submit ? (
              <Button title="レビューを依頼する" variant="primary" busy={busy} onPress={() => run('submit')} />
            ) : (
              <Text style={s.muted}>レビューを依頼するには、レビュアーを1人以上選んでください。</Text>
            )}
            {p.can_delete && (
              <Button title="削除" variant="danger" onPress={() => confirm('この下書きを削除しますか？', 'この操作は取り消せません。', '削除する', async () => {
                await apiFetch(`/requests/${r.id}`, { method: 'DELETE' });
                router.back();
              }, true)} />
            )}
          </>
        )}

        {(r.status === 'submitted' || r.status === 'under_review') && (
          p.can_approve ? (
            <>
              <Text style={{ fontWeight: '700' }}>あなたのレビューが依頼されています</Text>
              <Text style={s.ja}>金額・理由・リンク・資料を確認してください。</Text>
              <TextInput style={[s.input, s.multi]} multiline value={comment} onChangeText={setComment} placeholder="コメント (修正依頼のときは必須)" />
              <Button title="承認する" variant="primary" busy={busy} onPress={() =>
                confirm('この稟議を承認しますか？', `${t.thing}の稟議を承認します。\n\n${t.priceShort}\n${price}`, '承認する', () => run('approve', true))} />
              <Button title="修正を依頼" disabled={!comment.trim()} onPress={() => run('request-changes', true)} />
              <Button title="コメントだけ送る" disabled={!comment.trim() || busy} onPress={postComment} />
              <Button title="却下" variant="danger" onPress={reject} />
            </>
          ) : (
            <>
              <Text style={{ fontWeight: '700' }}>{d.reviewers.map((x) => x.name).join('、')} のレビュー待ちです</Text>
              {p.can_close && <Button title="取り下げ" variant="danger" onPress={withdraw} />}
            </>
          )
        )}

        {r.status === 'changes_needed' && (
          <>
            <Text style={{ fontWeight: '700', color: C.red }}>修正が依頼されています</Text>
            {p.can_edit && <Button title="稟議を編集" onPress={() => router.push(`/requests/edit/${r.id}`)} />}
            {p.can_submit && <Button title="再度レビューを依頼" variant="primary" busy={busy} onPress={() => run('submit')} />}
            {p.can_close && <Button title="取り下げ" variant="danger" onPress={withdraw} />}
            {p.can_reject && <Button title="却下" variant="danger" onPress={reject} />}
          </>
        )}

        {r.status === 'approved' && (
          <>
            <Text style={{ fontWeight: '700', color: C.green }}>✓ 承認されました</Text>
            <Text style={{ fontWeight: '700', color: C.purple, marginTop: 4 }}> マージできます</Text>
            <Text style={s.muted}>
              マージすると、{t.thing}は家族に承認されたものとして扱われます (稟議成立)。
            </Text>
            {p.can_merge ? (
              <Button title="マージする" variant="merge" busy={busy} onPress={() =>
                confirm('この稟議をマージしますか？', `家族が${t.thing}に合意したことを確定します。`, 'マージする', () => run('merge'))} />
            ) : (
              <Text style={s.muted}>マージできるのは申請者かレビュアーです。</Text>
            )}
            {p.can_reject && <Button title="却下" variant="danger" onPress={reject} />}
          </>
        )}

        {r.status === 'merged' && (
          <>
            <Text style={{ fontWeight: '700', color: C.purple }}>マージ済み</Text>
            <Text style={s.muted}>{t.mergedSub}</Text>
            {p.can_mark_purchased && <Button title={t.markDone} variant="blue" onPress={() => router.push(`/requests/purchase/${r.id}`)} />}
          </>
        )}

        {r.status === 'purchased' && (
          <>
            <Text style={{ fontWeight: '700', color: C.accent }}>{t.done}</Text>
            <Fact label={t.actualPrice} value={money(r.actual_price, r.currency)} />
            <Fact label={t.doneDate} value={r.purchase_date ?? '—'} />
            {r.order_number && <Fact label={t.orderNo} value={r.order_number} />}
            {p.can_upload_receipt && <Button title={`${t.receipt}を添付`} onPress={() => upload('receipt')} />}
          </>
        )}

        {r.status === 'closed' && (
          <>
            <Text style={{ fontWeight: '700', color: C.red }}>
              {r.close_reason === 'withdrawn' ? '申請者が取り下げました' : '却下されました'}
            </Text>
            {p.can_reopen && (
              <Button
                title="再オープン"
                busy={busy}
                onPress={() =>
                  confirm('この稟議を再オープンしますか？', 'レビュー待ちに戻して、もう一度レビューしてもらいます。レビュアーの判定はリセットされます。', '再オープンする', () => run('reopen'))
                }
              />
            )}
          </>
        )}
      </View>

      {p.can_comment && r.status !== 'draft' && !p.can_approve && (
        <View style={{ gap: 8 }}>
          <TextInput style={[s.input, s.multi]} multiline value={comment} onChangeText={setComment} placeholder="質問や感想を書きましょう" />
          <Pressable disabled={!comment.trim() || busy} onPress={postComment}>
            <Text style={[s.link, { textAlign: 'right', fontWeight: '600', opacity: comment.trim() ? 1 : 0.4 }]}>コメントする</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

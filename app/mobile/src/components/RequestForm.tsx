import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api';
import {
  KINDS,
  KIND_TEXT,
  type Label,
  type Member,
  type RequestDetail,
  type RequestKind,
} from '@/types';
import { LabelChip } from './Labels';
import { Button, C, Card, s } from './ui';

interface AltDraft {
  name: string;
  price: string;
  url: string;
  notes: string;
}

/** API の RequestInput */
export interface RequestPayload {
  kind: RequestKind;
  parent_id: string | null;
  title: string;
  reason: string;
  price: number;
  seller: string;
  product_name: string | null;
  product_url: string | null;
  label_ids: string[];
  planned_date: string | null;
  end_date: string | null;
  notes: string | null;
  reviewer_ids: string[];
  alternatives: { name: string; price: number | null; url: string | null; notes: string | null }[];
}

const opt = (v: string) => v.trim() || null;

export default function RequestForm({
  initial,
  initialKind = 'purchase',
  parentId,
  members,
  selfId,
  currency,
  onSave,
}: {
  initial?: RequestDetail;
  /** 新規作成時の種類 */
  initialKind?: RequestKind;
  /** 分岐元の稟議 (新規作成時のみ) */
  parentId?: string;
  members: Member[];
  selfId: string;
  currency: string;
  /** submit=true なら保存後に申請する */
  onSave: (payload: RequestPayload, submit: boolean) => Promise<void>;
}) {
  const r = initial?.request;
  const [kind, setKind] = useState<RequestKind>(r?.kind ?? initialKind);
  const [endDate, setEndDate] = useState(r?.end_date ?? '');
  const t = KIND_TEXT[kind];
  const [title, setTitle] = useState(r?.title ?? '');
  const [price, setPrice] = useState(r ? String(r.price) : '');
  const [seller, setSeller] = useState(r?.seller ?? '');
  const [productName, setProductName] = useState(r?.product_name ?? '');
  const [productUrl, setProductUrl] = useState(r?.product_url ?? '');
  // 家族のラベル (付けるものをタップで選ぶ)
  const [labels, setLabels] = useState<Label[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>(initial?.labels.map((l) => l.id) ?? []);
  useEffect(() => {
    apiFetch<Label[]>('/labels').then(setLabels).catch(() => setLabels([]));
  }, []);
  const [plannedDate, setPlannedDate] = useState(r?.planned_date ?? '');
  const [reason, setReason] = useState(r?.reason ?? '');
  const [notes, setNotes] = useState(r?.notes ?? '');
  const [reviewers, setReviewers] = useState<string[]>(initial?.reviewers.map((x) => x.id) ?? []);
  const [alts, setAlts] = useState<AltDraft[]>(
    initial?.alternatives.map((a) => ({
      name: a.name,
      price: a.price == null ? '' : String(a.price),
      url: a.url ?? '',
      notes: a.notes ?? '',
    })) ?? [],
  );
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const candidates = members.filter((m) => m.id !== selfId && m.can_review);

  const setAlt = (i: number, patch: Partial<AltDraft>) =>
    setAlts((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'save');
    setError(null);
    try {
      await onSave(
        {
          kind,
          parent_id: parentId ?? null,
          title: title.trim(),
          reason: reason.trim(),
          price: Number(price) || 0,
          seller: seller.trim(),
          product_name: opt(productName),
          product_url: opt(productUrl),
          label_ids: labelIds,
          planned_date: opt(plannedDate),
          end_date: t.hasEndDate ? opt(endDate) : null,
          notes: opt(notes),
          reviewer_ids: reviewers,
          alternatives: alts
            .filter((a) => a.name.trim())
            .map((a) => ({ name: a.name.trim(), price: a.price === '' ? null : Number(a.price), url: opt(a.url), notes: opt(a.notes) })),
        },
        submit,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const canSubmit = !!title.trim() && reviewers.length > 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {error && <Text style={s.error}>{error}</Text>}

      <Card title="稟議の種類">
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[s.chip, kind === k && s.chipOn, { flex: 1, alignItems: 'center' }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: kind === k }}
            >
              <Text style={[s.chipText, kind === k && s.chipTextOn]}>{KIND_TEXT[k].icon} {KIND_TEXT[k].what}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card title={t.what}>
        <Text style={[s.label, { marginTop: 0 }]}>タイトル *</Text>
        <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={t.titleExample} />
        <Text style={s.label}>{t.price} * ({currency === 'JPY' ? '円' : currency})</Text>
        <TextInput style={s.input} value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="128000" />
        <Text style={s.label}>{t.product}{t.productRequired ? ' *' : ''}</Text>
        <TextInput style={s.input} value={productName} onChangeText={setProductName} placeholder={t.productExample} />
        <Text style={s.label}>{t.seller}{t.sellerRequired ? ' *' : ''}</Text>
        <TextInput style={s.input} value={seller} onChangeText={setSeller} placeholder={t.sellerExample} />
        <Text style={s.label}>{t.productUrl}</Text>
        <TextInput style={s.input} value={productUrl} onChangeText={setProductUrl} autoCapitalize="none" keyboardType="url" placeholder="https://..." />
        <Text style={s.label}>{t.date} (YYYY-MM-DD)</Text>
        <TextInput style={s.input} value={plannedDate} onChangeText={setPlannedDate} placeholder="2026-10-01" />
        {t.hasEndDate && (
          <>
            <Text style={s.label}>帰る日 (日帰りなら空欄)</Text>
            <TextInput style={s.input} value={endDate} onChangeText={setEndDate} placeholder="2026-10-02" />
          </>
        )}
        <Text style={s.label}>ラベル (いくつでも)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {labels.length === 0 && <Text style={s.muted}>ラベルがありません</Text>}
          {labels.map((l) => {
            const on = labelIds.includes(l.id);
            return (
              <Pressable
                key={l.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setLabelIds((c) => (on ? c.filter((x) => x !== l.id) : [...c, l.id]))}
              >
                <LabelChip label={{ ...l, name: `${on ? '✓ ' : ''}${l.name}` }} dim={!on} />
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card title={`${t.reason} *`}>
        <TextInput
          style={[s.input, s.multi, { minHeight: 120 }]}
          multiline
          value={reason}
          onChangeText={setReason}
          placeholder={t.reasonPlaceholder}
        />
      </Card>

      <Card
        title={t.alternatives}
        right={<Text style={s.link} onPress={() => setAlts((p) => [...p, { name: '', price: '', url: '', notes: '' }])}>＋ 追加</Text>}
      >
        {alts.length === 0 && <Text style={s.muted}>他の候補と比べると説得力が増します。</Text>}
        {alts.map((a, i) => (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: C.borderMuted, paddingTop: i ? 10 : 0, marginBottom: 10, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600' }}>{t.altName} {i + 1}</Text>
              <Text style={{ color: C.red }} onPress={() => setAlts((p) => p.filter((_, j) => j !== i))}>削除</Text>
            </View>
            <TextInput style={s.input} value={a.name} onChangeText={(t) => setAlt(i, { name: t })} placeholder={t.altName} />
            <TextInput style={s.input} value={a.price} onChangeText={(t) => setAlt(i, { price: t })} placeholder={t.priceShort} keyboardType="number-pad" />
            <TextInput style={s.input} value={a.url} onChangeText={(t) => setAlt(i, { url: t })} placeholder="https://..." autoCapitalize="none" keyboardType="url" />
            <TextInput style={s.input} value={a.notes} onChangeText={(t) => setAlt(i, { notes: t })} placeholder="メモ" />
          </View>
        ))}
      </Card>

      <Card title="レビュアー *" ja="確認・承認してもらう家族">
        {candidates.length === 0 ? (
          <Text style={s.muted}>レビューできる家族がまだいません。Web の設定画面から家族を招待してください。</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {candidates.map((m) => {
              const on = reviewers.includes(m.id);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setReviewers((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                  style={[s.chip, on && s.chipOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>{on ? '✓ ' : ''}{m.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <Card title="メモ" ja="任意">
        <TextInput style={[s.input, s.multi]} multiline value={notes} onChangeText={setNotes} />
        <Text style={[s.muted, { marginTop: 6 }]}>資料は保存後に添付できます。</Text>
      </Card>

      <View style={{ gap: 8 }}>
        <Button title="レビューを依頼する" variant="primary" onPress={() => save(true)} disabled={!canSubmit || !!busy} busy={busy === 'submit'} />
        <Button title="下書き保存" onPress={() => save(false)} disabled={!title.trim() || !!busy} busy={busy === 'save'} />
      </View>
    </ScrollView>
  );
}

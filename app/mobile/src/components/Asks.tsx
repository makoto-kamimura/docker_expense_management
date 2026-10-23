import { Pressable, Text, View } from 'react-native';
import type { Member, PendingReply, ReplyAsk } from '@/types';
import { C, s } from './ui';

/** 名前を重ねずに「、」でつなぐ */
const joinNames = (names: string[]) => Array.from(new Set(names)).join('、');

/** コメントで返事をお願いする相手を選ぶ。当事者 (申請者・レビュアー・担当者) を先に並べる */
export function AskPicker({ members, meId, partyIds, value, onChange }: {
  members: Member[];
  meId: string;
  partyIds: string[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const rank = (id: string) => (partyIds.includes(id) ? partyIds.indexOf(id) : partyIds.length);
  const candidates = members.filter((m) => m.id !== meId).sort((a, b) => rank(a.id) - rank(b.id));
  if (candidates.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <Text style={[s.muted, { fontSize: 12 }]}>↩ 返事をお願いする</Text>
      {candidates.map((m) => {
        const on = value.includes(m.id);
        return (
          <Pressable
            key={m.id}
            onPress={() => onChange(on ? value.filter((x) => x !== m.id) : [...value, m.id])}
            style={[s.chip, { paddingVertical: 4, paddingHorizontal: 10 }, on && s.chipOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Text style={[s.chipText, { fontSize: 12 }, on && s.chipTextOn]}>{on ? '✓ ' : ''}{m.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 自分宛ての返事のお願いと、自分が出した返事のお願いの返事待ち */
export function ReplyBanner({ waiting, meId }: { waiting: PendingReply[]; meId: string }) {
  const toMe = waiting.filter((w) => w.user.id === meId);
  const fromMe = waiting.filter((w) => w.asker?.id === meId);
  if (toMe.length === 0 && fromMe.length === 0) return null;
  return (
    <View style={{ gap: 6, marginBottom: 8 }}>
      {toMe.length > 0 && (
        <Text style={{ color: C.fg, backgroundColor: C.attentionSubtle, borderColor: C.attentionBorderMuted, borderWidth: 1, borderRadius: 6, padding: 10, overflow: 'hidden' }}>
          ↩ <Text style={{ fontWeight: '700' }}>{joinNames(toMe.map((w) => w.asker?.name ?? '退会したメンバー'))}</Text> から返事のお願いがあります。コメントすると返事済みになります。
        </Text>
      )}
      {fromMe.length > 0 && (
        <Text style={{ color: C.muted, backgroundColor: C.bg, borderColor: C.borderMuted, borderWidth: 1, borderRadius: 6, padding: 10, overflow: 'hidden' }}>
          <Text style={{ fontWeight: '700', color: C.fg }}>{joinNames(fromMe.map((w) => w.user.name))}</Text> の返事を待っています。
        </Text>
      )}
    </View>
  );
}

/** コメントの下に出す「○○ に返事をお願いしました (返事待ち / 返事済み)」 */
export function AskLine({ asked }: { asked: ReplyAsk[] }) {
  if (asked.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderTopColor: C.borderMuted, borderTopWidth: 1 }}>
      <Text style={[s.muted, { fontSize: 12 }]}>↩</Text>
      {asked.map((a) => (
        <Text
          key={a.user.id}
          style={{
            fontSize: 12, fontWeight: '600', borderRadius: 999, paddingHorizontal: 8, overflow: 'hidden',
            color: a.answered_at ? C.successFg : C.yellow,
            backgroundColor: a.answered_at ? C.successSubtle : C.attentionSubtle,
          }}
        >
          {a.user.name}{a.answered_at ? ' ✓ 返事済み' : ' · 返事待ち'}
        </Text>
      ))}
      <Text style={[s.muted, { fontSize: 12 }]}>に返事をお願いしました</Text>
    </View>
  );
}

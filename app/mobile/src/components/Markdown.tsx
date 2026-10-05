import { Linking, Platform, Text, View, type TextStyle } from 'react-native';
import { C } from './ui';

/**
 * Markdown を整えて表示する (購入理由など)。外部ライブラリを使わない小さな実装で、
 * 見出し・箇条書き / 番号付き・チェックリスト・引用・コードブロック・区切り線・段落と、
 * 太字・斜体・取り消し線・インラインコード・リンクに対応する。表などそれ以外は原文のまま出す。
 * Web (components/Markdown.tsx) と同じく、1つの改行も改行として出し、リンクは http / https / mailto だけを有効にする。
 */

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: { text: string; checked: boolean | null; indent: number; marker: string }[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string };

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', text: para.join('\n') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i].trim()); i++) code.push(lines[i]);
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: 'heading', level: h[1].length, text: h[2] });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
      i--;
      blocks.push({ type: 'quote', text: quote.join('\n') });
      continue;
    }
    const li = line.match(LIST_ITEM);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const items: Extract<Block, { type: 'list' }>['items'] = [];
      for (; i < lines.length; i++) {
        const m = lines[i].match(LIST_ITEM);
        if (!m) break;
        const task = m[3].match(TASK);
        items.push({
          text: task ? task[2] : m[3],
          checked: task ? task[1] !== ' ' : null,
          indent: Math.floor(m[1].replace(/\t/g, '  ').length / 2),
          marker: /\d/.test(m[2]) ? m[2].replace(')', '.') : '•',
        });
      }
      i--;
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** リンクとして有効にする URL か */
const safeUrl = (url: string) => /^(https?:|mailto:)/i.test(url.trim());

// インラインの書式。先に見つかったものから順に処理する
const INLINE: { re: RegExp; render: (m: RegExpExecArray, key: string, base: TextStyle) => React.ReactNode }[] = [
  {
    re: /`([^`]+)`/,
    render: (m, key) => (
      <Text key={key} style={{ fontFamily: MONO, backgroundColor: C.neutralSubtle, fontSize: 13 }}>{m[1]}</Text>
    ),
  },
  {
    re: /!?\[([^\]]*)\]\(([^)\s]+)\)/,
    render: (m, key, base) => {
      const url = m[2];
      const label = m[1] || url;
      return safeUrl(url) ? (
        <Text key={key} style={{ color: C.accent }} onPress={() => Linking.openURL(url)}>
          {renderInline(label, key, base)}
        </Text>
      ) : (
        <Text key={key}>{renderInline(label, key, base)}</Text>
      );
    },
  },
  {
    re: /https?:\/\/[^\s<>()]+/,
    render: (m, key) => (
      <Text key={key} style={{ color: C.accent }} onPress={() => Linking.openURL(m[0])}>{m[0]}</Text>
    ),
  },
  { re: /\*\*([^*]+)\*\*|__([^_]+)__/, render: (m, key, base) => <Text key={key} style={{ fontWeight: '700' }}>{renderInline(m[1] ?? m[2], key, base)}</Text> },
  { re: /~~([^~]+)~~/, render: (m, key, base) => <Text key={key} style={{ textDecorationLine: 'line-through', color: C.muted }}>{renderInline(m[1], key, base)}</Text> },
  { re: /\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/, render: (m, key, base) => <Text key={key} style={{ fontStyle: 'italic' }}>{renderInline(m[1] ?? m[2], key, base)}</Text> },
];

function renderInline(text: string, keyPrefix = 'i', base: TextStyle = {}): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    let best: { m: RegExpExecArray; idx: number } | null = null;
    INLINE.forEach((p, idx) => {
      const m = p.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { m, idx };
    });
    if (!best) {
      out.push(rest);
      break;
    }
    const { m, idx } = best as { m: RegExpExecArray; idx: number };
    if (m.index > 0) out.push(rest.slice(0, m.index));
    out.push(INLINE[idx].render(m, `${keyPrefix}-${n++}`, base));
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const HEADING_SIZE = [0, 22, 19, 17, 16, 15, 15];

export default function Markdown({ children, fontSize = 15 }: { children: string; fontSize?: number }) {
  const lineHeight = Math.round(fontSize * 1.5);
  const body: TextStyle = { fontSize, lineHeight, color: C.fg };
  return (
    <View style={{ gap: 10 }}>
      {parseBlocks(children).map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case 'heading':
            return (
              <Text key={key} style={{ fontSize: HEADING_SIZE[b.level], fontWeight: '700', color: C.fg, marginTop: i ? 6 : 0 }}>
                {renderInline(b.text, key)}
              </Text>
            );
          case 'list':
            return (
              <View key={key} style={{ gap: 4 }}>
                {b.items.map((it, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 6, paddingLeft: 4 + it.indent * 16 }}>
                    <Text style={[body, { minWidth: 16, color: C.muted }]}>
                      {it.checked === null ? it.marker : it.checked ? '☑' : '☐'}
                    </Text>
                    <Text style={[body, { flex: 1 }]}>{renderInline(it.text, `${key}-${j}`)}</Text>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: C.border, paddingLeft: 10 }}>
                <Text style={[body, { color: C.muted }]}>{renderInline(b.text, key)}</Text>
              </View>
            );
          case 'code':
            return (
              <Text key={key} style={{ fontFamily: MONO, fontSize: 13, lineHeight: 19, color: C.fg, backgroundColor: C.bg, padding: 10, borderRadius: 6, overflow: 'hidden' }}>
                {b.text}
              </Text>
            );
          case 'hr':
            return <View key={key} style={{ height: 1, backgroundColor: C.border }} />;
          default:
            return <Text key={key} style={body}>{renderInline(b.text, key)}</Text>;
        }
      })}
    </View>
  );
}

import Link from 'next/link';
import { labelTextColor, type Label } from '@/lib/types';

/** GitHub のラベルと同じ、色付きの丸いラベル。href を渡すとリンク (一覧の絞り込み) にする */
export default function LabelChip({ label, href }: { label: Label; href?: string }) {
  const style = { background: label.color, color: labelTextColor(label.color) };
  const title = label.description || undefined;
  return href ? (
    <Link href={href} className="label-chip" style={style} title={title}>{label.name}</Link>
  ) : (
    <span className="label-chip" style={style} title={title}>{label.name}</span>
  );
}

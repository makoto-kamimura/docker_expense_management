/** 名前の頭文字を丸く表示する (画像アバターは未対応) */
export default function Avatar({ name, large }: { name: string; large?: boolean }) {
  return (
    <span className={`avatar${large ? ' avatar-lg' : ''}`} aria-hidden="true" title={name}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

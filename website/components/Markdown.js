// A small, safe Markdown renderer for release notes: headings, paragraphs,
// lists, bold, inline code and links become React elements (no raw HTML).

function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2]) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3]) out.push(<code key={key}>{m[3]}</code>);
    else out.push(<a key={key} href={m[5]} rel="noopener noreferrer">{m[4]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ source, headingOffset = 2 }) {
  const blocks = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { blocks.push({ type: 'ul', items: list }); list = null; } };
  for (const raw of String(source || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); blocks.push({ type: 'h', level: Math.min(6, h[1].length + headingOffset - 1), text: h[2] }); }
    else if (li) { flushPara(); (list = list || []).push(li[1]); }
    else if (!line.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.type === 'h') { const H = `h${b.level}`; return <H key={i}>{inline(b.text, i)}</H>; }
        if (b.type === 'ul') return <ul key={i}>{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ul>;
        return <p key={i}>{inline(b.text, i)}</p>;
      })}
    </div>
  );
}

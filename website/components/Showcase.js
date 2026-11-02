'use client';

import { useRef, useState } from 'react';
import Icon from './Icon';
import Shot from './Shot';

/** Tabs that switch between real screenshots of each part of the app (arrow keys move between tabs). */
export default function Showcase({ items }) {
  const [index, setIndex] = useState(0);
  const tabs = useRef([]);
  const item = items[index];
  const onKey = e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (index + d + items.length) % items.length;
    setIndex(next);
    tabs.current[next] && tabs.current[next].focus();
  };
  return (
    <div className="showcase">
      <div className="showcase-tabs" role="tablist" aria-label="Cursora's tools" onKeyDown={onKey}>
        {items.map((it, i) => (
          <button
            key={it.id}
            ref={el => { tabs.current[i] = el; }}
            role="tab"
            id={`tab-${it.id}`}
            aria-selected={i === index}
            aria-controls={`panel-${it.id}`}
            tabIndex={i === index ? 0 : -1}
            className={i === index ? 'on' : ''}
            onClick={() => setIndex(i)}
          >
            <Icon name={it.icon} size={18} />{it.label}
          </button>
        ))}
      </div>
      <div className="showcase-body" role="tabpanel" id={`panel-${item.id}`} aria-labelledby={`tab-${item.id}`}>
        <div className="showcase-copy" key={`copy-${item.id}`}>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
          <ul className="ticks">{item.points.map(p => <li key={p}><Icon name="check" size={17} />{p}</li>)}</ul>
        </div>
        <div className="showcase-shot" key={`shot-${item.id}`}>
          <Shot name={item.shot} alt={item.alt} />
        </div>
      </div>
    </div>
  );
}

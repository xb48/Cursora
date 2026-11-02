import { asset } from '../lib/site';

/**
 * A real app screenshot in a window frame. Always loading="lazy": browsers load
 * on-screen lazy images at once, and eager images would make React emit preload
 * hints that other pages pick up when they prefetch this one.
 */
export default function Shot({ name, alt, className = '' }) {
  return (
    <figure className={`window ${className}`}>
      <div className="window-bar" aria-hidden="true"><i /><i /><i /><span>Cursora</span></div>
      <img src={asset(`generated/screenshots/${name}.png`)} alt={alt} width="1600" height="1000" loading="lazy" decoding="async" />
    </figure>
  );
}

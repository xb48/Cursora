/**
 * Content that fades in as it scrolls into view. Pure CSS (a scroll-driven
 * animation): it is visible by default, so nothing can stay hidden, and only
 * browsers that support view timelines, with motion allowed, animate it.
 */
export default function Reveal({ as: Tag = 'div', className = '', delay, children, ...rest }) {
  return <Tag className={`reveal ${className}`} {...rest}>{children}</Tag>;
}

import info from '../lib/generated.json';

/** An icon from the app's own set (app/icons.js), drawn the same way the app draws it. */
export default function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: info.icons[name] || '' }}
    />
  );
}

/** The heading block at the top of an inner page. */
export default function PageHeader({ kicker, title, children }) {
  return (
    <section className="page-header">
      <div className="hero-glow" aria-hidden="true" />
      <div className="container page-header-inner">
        {kicker && <span className="kicker">{kicker}</span>}
        <h1>{title}</h1>
        {children && <p className="lead">{children}</p>}
      </div>
    </section>
  );
}

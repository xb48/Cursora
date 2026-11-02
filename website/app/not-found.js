import Link from 'next/link';
import Icon from '../components/Icon';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <section className="not-found">
      <div className="hero-glow" aria-hidden="true" />
      <div className="container center">
        <p className="nf-code">404</p>
        <h1>This page wandered off</h1>
        <p className="lead">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <div className="hero-cta">
          <Link className="btn btn-primary btn-lg" href="/">Back to home</Link>
          <Link className="btn btn-ghost btn-lg" href="/download/"><Icon name="download" />Download Cursora</Link>
        </div>
      </div>
    </section>
  );
}

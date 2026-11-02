import { LINKS, RELEASES, assetOf, formatBytes, formatDate } from '../../lib/site';
import PageHeader from '../../components/PageHeader';
import Markdown from '../../components/Markdown';
import Reveal from '../../components/Reveal';
import Icon from '../../components/Icon';

export const metadata = {
  title: 'Changelog',
  description: 'Every Cursora release and what changed, straight from GitHub Releases.',
};

export default function ChangelogPage() {
  return (
    <>
      <PageHeader kicker="Changelog" title="What's new in Cursora">
        Every release, newest first. The installed app updates itself and shows these notes after each update.
      </PageHeader>
      <section className="section tight">
        <div className="container narrow">
          {RELEASES.length === 0 && (
            <div className="notice"><Icon name="info" size={18} /><span>The release history couldn&apos;t be loaded for this build. See every release on <a href={LINKS.releases}>GitHub Releases</a>.</span></div>
          )}
          <ol className="timeline">
            {RELEASES.map((r, i) => {
              const installer = assetOf(r, 'installer');
              return (
                <Reveal as="li" key={r.tag} className="release" id={r.tag}>
                  <div className="release-head">
                    <h2>{r.name}</h2>
                    {i === 0 && <span className="badge">Latest</span>}
                    <time dateTime={r.date}>{formatDate(r.date)}</time>
                  </div>
                  <Markdown source={r.notes} headingOffset={3} />
                  <div className="release-links">
                    {installer && <a href={installer.url}><Icon name="download" size={15} />Installer · {formatBytes(installer.size)}</a>}
                    <a href={r.url}><Icon name="github" size={15} />Release on GitHub</a>
                  </div>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </section>
    </>
  );
}

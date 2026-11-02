import Link from 'next/link';
import { LINKS } from '../../lib/site';
import PageHeader from '../../components/PageHeader';
import Icon from '../../components/Icon';

export const metadata = {
  title: 'Privacy',
  description: 'What Cursora does with your data: it runs on your PC, has no analytics, and only connects to GitHub for updates and, if you choose, Discord.',
};

const SUMMARY = [
  { icon: 'monitor', title: 'Runs on your PC', text: 'Your settings and designs stay on your computer.' },
  { icon: 'x', title: 'No analytics', text: 'Cursora has no tracking, telemetry or ads.' },
  { icon: 'discord', title: 'Discord is optional', text: 'Only if you link it, and it stays encrypted.' },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHeader kicker="Privacy" title="Your data stays yours">
        A plain-language account of what Cursora does with your data.
      </PageHeader>
      <section className="section tight">
        <div className="container narrow">
          <div className="summary-cards">
            {SUMMARY.map(s => (
              <div key={s.title} className="card"><span className="card-icon"><Icon name={s.icon} /></span><h2>{s.title}</h2><p>{s.text}</p></div>
            ))}
          </div>
          <article className="prose">
            <p className="muted">Last updated 2 November 2026</p>

            <h2>What stays on your PC</h2>
            <p>Cursora runs locally. Your settings, crosshair designs, cursor design, hotkeys and crack history are stored in <code>%APPDATA%\Cursora</code> on your computer and are never uploaded. Cursora has no user accounts, analytics, telemetry or advertising.</p>

            <h2>When Cursora uses the internet</h2>
            <ul>
              <li><strong>Updates.</strong> The installed app checks Cursora&apos;s GitHub Releases for new versions shortly after it starts and then every 6 hours, and downloads updates from GitHub. GitHub receives these requests like any other download; see <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">GitHub&apos;s privacy statement</a>. You can turn automatic updates off in Settings → Updates. The portable app does not check for updates.</li>
              <li><strong>Discord, only if you link it.</strong> If you choose Link Discord, you sign in on Discord&apos;s own page in your browser, so Cursora never sees your Discord password. Cursora then reads your Discord user ID, username, display name, avatar, email address and whether it is verified, to show them in Settings.</li>
            </ul>

            <h2>Your Discord details</h2>
            <p>Your Discord profile and access tokens are stored only on your PC, encrypted with Windows&apos; built-in data protection for your user account. They are not sent anywhere except to Discord itself, to refresh your profile. When you choose Unlink, Cursora asks Discord to revoke its access and deletes the stored details. Discord&apos;s handling of your account is covered by <a href="https://discord.com/privacy">Discord&apos;s privacy policy</a>.</p>

            <h2>This website</h2>
            <p>This website has no cookies, analytics or trackers. Its fonts are served with the site. The download page asks GitHub&apos;s public API for the latest release from your browser, so the version shown is always current. The downloads themselves come from GitHub Releases.</p>

            <h2>Removing your data</h2>
            <p>Unlink Discord in Settings to remove your Discord details. To remove everything else, uninstall Cursora from Windows Settings → Apps and delete the <code>%APPDATA%\Cursora</code> folder.</p>

            <h2>Questions</h2>
            <p>Ask on the <a href={LINKS.discord}>Cursora Discord server</a> or see <Link href="/support/">Support</Link>. Cursora&apos;s source code is public on <a href={LINKS.github}>GitHub</a>, so anyone can check how it handles data.</p>
          </article>
        </div>
      </section>
    </>
  );
}

// Copy shared between pages. Every claim here matches the app's code.
import info from './generated.json';

export const TOOLS = [
  {
    id: 'animations', icon: 'grid', label: 'Animations', shot: 'animations',
    title: 'Animations that follow every move',
    text: `${info.animations.length} hand-crafted animations, each with its own trigger, sound and effect. Flick the mouse to crack a whip, circle to feed a black hole, or let a 3D frog hop after your pointer.`,
    points: ['Six whips, from The Whip to Inferno', 'Props like Singularity, Tesseract and Stormcloud', 'Companions, including a realistic 3D frog'],
    alt: 'The Animations page with the Inferno whip in the live preview',
  },
  {
    id: 'studio', icon: 'sliders', label: 'Studio', shot: 'studio',
    title: 'A live playground for every animation',
    text: 'Change the physics, look and sound of any animation and try it before taking it to your desktop.',
    points: ['Physics, look and sound settings', 'A live preview that follows your mouse', 'Restore the defaults at any time'],
    alt: 'The Studio playground with the Neon Lash whip',
  },
  {
    id: 'cursors', icon: 'mouse', label: 'Cursors', shot: 'cursors',
    title: 'Restyle your Windows pointer',
    text: 'Change all 14 Windows cursors at once with a themed pack, a designer preset or a design of your own.',
    points: ['11 themed packs, some animated', '12 shapes, 6 finishes, any colour, 9 patterns and 38 flags', 'Windows gets its own cursors back when you quit'],
    alt: 'The Cursors page with themed cursor packs',
  },
  {
    id: 'crosshairs', icon: 'target', label: 'Crosshairs', shot: 'crosshairs',
    title: 'Pixel-perfect crosshairs over any game',
    text: `${info.presetCount} presets in 12 categories, on a click-through overlay that stays on top of windowed and borderless games.`,
    points: ['Always centred on your main display', 'Fine-tune the position with offsets', 'Its own hotkey: Ctrl+Alt+X'],
    alt: 'The Crosshairs gallery with category filters',
  },
  {
    id: 'editor', icon: 'pencil', label: 'Crosshair Editor', shot: 'editor',
    title: 'Build the crosshair you want',
    text: 'Start from scratch or from any preset, preview it at actual size or zoomed in, and share it with a single code.',
    points: ['Solid, two-tone, gradient and spectrum colours', 'Pulse, breathe, spin and rainbow animations', 'Outlines, glow, drop shadows and chevrons'],
    alt: 'The Crosshair Editor building a two-tone crosshair',
  },
];

export const CAPABILITIES = [
  { icon: 'mouse', title: 'Click-through overlays', text: 'Animations and crosshairs never get in the way. Every click goes straight to your apps and games.' },
  { icon: 'keyboard', title: 'Global hotkeys', text: 'Summon the animation and toggle the crosshair from anywhere, even while a game has focus.' },
  { icon: 'refresh', title: 'Automatic updates', text: 'New versions download in the background, are checked against their SHA-512, and install on restart.' },
  { icon: 'moon', title: 'Dark and light themes', text: 'A modern interface that follows your Windows theme, with optional interface sounds.' },
  { icon: 'tray', title: 'Lives in the tray', text: 'Starts with Windows if you like, stays out of your way, and is one click away.' },
  { icon: 'discord', title: 'Optional Discord link', text: 'Show your Discord profile in Settings. You sign in on Discord itself, and the details stay encrypted on your PC.' },
];

export const REQUIREMENTS = [
  ['Operating system', 'Windows 10 or Windows 11, 64-bit'],
  ['Disk space', 'About 280 MB once installed'],
  ['Permissions', 'None: installs for your user account, no admin prompt'],
  ['Internet', 'Only to download, check for updates and (optionally) link Discord'],
];

export const FAQ = [
  { q: 'Is Cursora free?', a: 'Yes. Cursora is free to download and use, and its source code is public on GitHub.' },
  { q: 'Which versions of Windows does it support?', a: 'Windows 10 and Windows 11, 64-bit.' },
  { q: 'Will the crosshair show in my games?', a: 'It shows over windowed and borderless-fullscreen games. Games in exclusive fullscreen cover every other window, so switch them to borderless.' },
  { q: 'Why does Windows show a SmartScreen warning?', a: 'Cursora is new and not yet code-signed, so Windows may warn on the first install. Choose More info, then Run anyway. You can verify the file with its SHA-256 on the download page.' },
  { q: 'Does it change my cursors permanently?', a: 'No. Your Cursora cursors apply while the app runs, and Windows gets its own cursors back when you quit.' },
  { q: 'How do updates work?', a: 'The installed app checks GitHub for new versions, downloads them in the background and installs them when it restarts. The portable version does not update itself.' },
];

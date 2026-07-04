/* Shared demo roster — the React port of the handoff chrome.js TTD.P.
   Twelve consistent names/faces so the presentational storyboard surfaces
   (cold-join, first-run, notify, present demos) speak the same roster.
   Production surfaces use the real tournament roster instead. */

export interface DemoPlayer {
  id: string;
  name: string;
  short: string;
  img: string;
}

const AV = (id: string) => `/design-handoff/avatars/${id}.png`;

export const DEMO_ROSTER: Record<string, DemoPlayer> = {
  me: { id: 'me', name: 'Maya Chen', short: 'Maya', img: AV('me') },
  p2: { id: 'p2', name: 'Jordan Reyes', short: 'Jordan', img: AV('p2') },
  p3: { id: 'p3', name: 'Theo Kim', short: 'Theo', img: AV('p3') },
  p4: { id: 'p4', name: 'Alex Park', short: 'Alex', img: AV('p4') },
  p5: { id: 'p5', name: 'Marcus Webb', short: 'Marcus', img: AV('p5') },
  p6: { id: 'p6', name: 'Eli Brooks', short: 'Eli', img: AV('p6') },
  p7: { id: 'p7', name: 'Nadia Haq', short: 'Nadia', img: AV('p7') },
  p8: { id: 'p8', name: 'Noah Frost', short: 'Noah', img: AV('p8') },
  p9: { id: 'p9', name: 'Priya Shah', short: 'Priya', img: AV('p9') },
  p10: { id: 'p10', name: 'Sana Iyer', short: 'Sana', img: AV('p10') },
  p11: { id: 'p11', name: 'Lila Novak', short: 'Lila', img: AV('p11') },
  p12: { id: 'p12', name: 'Zara Ali', short: 'Zara', img: AV('p12') },
};

export const DEMO_IDS = Object.keys(DEMO_ROSTER);

/** Mascot pose path helper. */
export const dink = (
  pose:
    | 'idle'
    | 'coach'
    | 'sad'
    | 'happy-bust'
    | 'hat-bust'
    | 'liberty'
    | 'sparkler'
    | 'flag'
    | 'uncle-sam',
) => `/design-handoff/dink/${pose}.png`;

export const GALAXY_BG = '/design-handoff/scenes/galaxy-bg.png';

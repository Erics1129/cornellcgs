/**
 * Every word on the site lives here so copy can be edited without touching
 * components. Placeholders that need real information are marked TODO.
 */

export const site = {
  name: 'Cornell CGS',
  fullName: 'Cornell Computational Game Society',
  domain: 'cornellcgs.org',
  /** the last line of every page */
  credit: 'Website developed by Eric Shi',
  eyebrow: 'Cornell University · Registered student organization',
  // TODO official registration line
  footerLine: (year: number) => `© ${year} Cornell CGS · cornellcgs.org`,
}

export const nav = [
  { id: 'who-we-are', label: 'Who we are', rank: 'K' },
  { id: 'what-we-do', label: 'What we do', rank: 'Q' },
  { id: 'ml-process', label: 'ML', rank: 'J' },
  { id: 'events', label: 'Events', rank: '10' },
  { id: 'world', label: 'World', rank: '9' },
  { id: 'people', label: 'Our Team', rank: '8' },
  { id: 'join', label: 'Join', rank: '★' },
]

/** Hero title, broken over three lines per the design. */
export const heroTitle = ['Cornell', 'Computational', 'Game Society']

/** Hero typing line — the lead changes too. */
export const typing = {
  pairs: [
    { lead: 'We do research in', tail: 'computational game theory' },
    { lead: 'We study', tail: 'imperfect information games' },
    { lead: 'We build', tail: 'poker solvers' },
    { lead: 'We train', tail: 'reinforcement learning agents' },
    { lead: 'We compute', tail: 'equilibria' },
    { lead: 'We work on', tail: 'multi-agent learning' },
    { lead: 'We build', tail: 'AlphaGo style agents' },
    { lead: 'We are training', tail: 'a Guandan agent' },
    { lead: 'We play', tail: 'anything with payoffs' },
  ],
}

export const hero = {
  ctaPrimary: { label: 'Join CGS', href: '#join' },
  ctaSecondary: { label: 'See what we do', href: '#what-we-do' },
  /** the mini games are real pages at /minigames/, so this one navigates instead of scrolling */
  ctaGames: { label: 'Play mini games', href: '/minigames/' },
  scrollHint: 'Scroll',
}

export const whoWeAre = {
  heading: 'Game *AI*',
  paragraphs: ['A Cornell student club. We write game solvers and train agents that learn to play.'],
  photoPlaceholder: 'TODO team photo',
  // TODO real numbers — null shows as "TBA" until they exist
  counters: [
    { label: 'Members', value: null as number | null },
    { label: 'Countries', value: null as number | null },
    { label: 'Projects', value: null as number | null },
    { label: 'Founded', value: null as number | null, noSeparator: true },
  ],
}

export const whatWeDo = {
  heading: 'At *Play*',
  // TODO real threads
  threads: [
    {
      rank: 'A',
      suit: '♠',
      title: 'Study nights',
      text: 'Every week: game theory, ranges, equilibria.',
    },
    {
      rank: 'K',
      suit: '♠',
      title: 'Research',
      text: 'Solvers, learning agents, and equity math.',
    },
    {
      rank: 'Q',
      suit: '♠',
      title: 'Build',
      text: 'We write our own agents and tools.',
    },
    {
      rank: 'J',
      suit: '♠',
      title: 'Tournaments',
      text: 'Run like the real thing, with no buy-in.',
    },
    {
      rank: '10',
      suit: '♠',
      title: 'Talks',
      text: 'On quant, poker, and academic research.',
    },
  ],
}

export const mlProcess = {
  heading: 'Self-play',
  // TODO real steps
  steps: [
    {
      n: '01',
      title: 'Frame',
      text: 'Write the game down as states, actions, and payoffs.',
    },
    {
      n: '02',
      title: 'Simulate',
      text: 'Build a simulator so agents can play themselves.',
    },
    {
      n: '03',
      title: 'Train',
      text: 'Counterfactual regret minimization or deep reinforcement learning.',
    },
    {
      n: '04',
      title: 'Evaluate',
      text: 'Measure exploitability and play agents head to head.',
    },
    {
      n: '05',
      title: 'Ship',
      text: 'Release the agents and tools once they hold up.',
    },
  ],
}

export const events = {
  heading: 'Coming *Up*',
  // TODO real events
  items: [
    {
      title: 'Fall Kickoff',
      date: 'Date TBA', // TODO date
      blurb: 'Our first meeting of the year.',
    },
    {
      title: 'Solver Workshop',
      date: 'Date TBA', // TODO date
      blurb: 'Write a small CFR solver with us.',
    },
    {
      title: 'Alumni Night',
      date: 'Date TBA', // TODO date
      blurb: 'Alumni talk about working in quant and research.',
    },
    {
      title: 'Charity Tournament',
      date: 'Date TBA', // TODO date
      blurb: 'A club tournament played for charity.',
    },
    {
      title: 'Spring Banquet',
      date: 'Date TBA', // TODO date
      blurb: 'End-of-year dinner.',
    },
  ],
}

export const world = {
  heading: 'One *Table*',
  // TODO real country count
  text: 'Cornell students from around the world.',
}

export const people = {
  heading: 'Our *Team*',
  /** One card per person. Roles and bios are filled in as they come; a card without them shows the name only. */
  leaders: [
    {
      name: 'Elsie Lu',
      role: 'President',
      major: 'Statistics',
      photo: '/assets/team/elsie-lu.jpg',
      skills: ['VC', 'Medical devices', 'Management', 'Financial modeling'],
    },
    {
      name: 'Evan Jiang',
      role: 'Recruitment Chair',
      major: 'Biometry & Statistics + Information Science',
      photo: '/assets/team/evan-jiang.jpg',
      experience: [
        'Faircaribe LLC: financial and data analysis',
        'Handshake AI: intern',
        'Noon AI: operations intern',
        'Personal website development',
      ],
      skills: ['Statistical modeling', 'Mathematical modeling', 'Python', 'AI reasoning & research'],
    },
    // TODO(club): roles, majors, photos and bios. Every field is present so the
    // admin shows a photo drop zone, major, experience and skills for each person.
    ...['Yicheng', 'Michael', 'Henrique', 'Eric', 'Selina', 'Christina', 'Daniel'].map((name) => ({
      name,
      role: '',
      major: '',
      photo: '',
      experience: [] as string[],
      skills: [] as string[],
    })),
  ] as Array<{
    name: string
    role: string
    major?: string
    photo?: string
    experience?: string[]
    skills?: string[]
  }>,
}

/** The Our Team page — name and major only, so the whole club fits on one screen. */
export const team: Array<{ label: string; alt: string; people: Array<{ name: string; major: string }> }> = [
  {
    label: 'Board',
    alt: 'Leadership',
    people: [
      { name: 'Elsie Lu', major: 'Statistics' },
      { name: 'Evan Jiang', major: 'Biometry & Statistics + Information Science' },
    ],
  },
  // TODO(club): majors for the rest of the team
  {
    label: 'Members',
    alt: 'The Team',
    people: ['Yicheng', 'Michael', 'Henrique', 'Eric', 'Selina', 'Christina', 'Daniel'].map((name) => ({ name, major: '' })),
  },
]

export const join = {
  heading: 'Join *CGS*',
  text: 'New members every semester.',
  cta: { label: 'Apply to CGS', href: 'mailto:recruitment@cornellcgs.org' }, // TODO form url when one exists
}

/** Facts row under the Join card — one threshold per column, big value in the middle. */
export const contact = {
  email: 'recruitment@cornellcgs.org',
  instagram: 'To be added', // TODO real instagram
  instagramUrl: '', // TODO real instagram url
  wechat: 'To be added', // TODO real wechat
  /** Forward inboxes at cornellcgs.org — one per door. */
  inboxes: [
    { label: 'Recruitment', address: 'recruitment@cornellcgs.org' },
    { label: 'Tech', address: 'tech@cornellcgs.org' },
    { label: 'Finance & Sponsors', address: 'finance@cornellcgs.org' },
    { label: 'Marketing', address: 'marketing@cornellcgs.org' },
    { label: 'Social', address: 'social@cornellcgs.org' },
  ],
}

/** The last chapter: what the club plans to do next. TODO(club): make these your own. */
export const vision = {
  title: 'Next',
  next: [
    'Make our agents stronger.',
    'Let anyone play against them.',
    'Share what we find.',
  ],
}

/** Advisors — name, title and research line as published on their own pages. */
export const advisors = [
  {
    name: 'Robert D. Kleinberg',
    role: 'Faculty Advisor',
    title: 'Professor of Computer Science, Cornell University',
    bio: 'Algorithms and theoretical computer science: economic aspects of algorithms, online learning and its applications, random processes in networks.',
    photo: '/assets/advisors/kleinberg.jpg',
    url: 'https://www.cs.cornell.edu/~rdk/',
  },
]

/** Country markers for the World section. TODO real member country list. */
export const memberCountries = [
  'China',
  'India',
  'South Korea',
  'Singapore',
  'United Kingdom',
  'Germany',
  'Nigeria',
  'Brazil',
  'Canada',
  'Mexico',
  'Japan',
  'Australia',
  'Turkey',
  'Vietnam',
]

/**
 * Standalone pages — one per dropdown item. Keep these object shapes stable
 * for the admin; dates and unfilled roster entries remain explicitly TBA.
 */
export type SubPageDef = {
  title: string
  lead: string
  /** `alt` is the second line the heading moves between — the page keeps talking; `link` is an optional button under the body. */
  sections: Array<{ heading: string; body: string; alt?: string; link?: { label: string; href: string } }>
}

/** Public URL slug for each page id — camelCase paths, e.g. /whoWeAre/. */
export const pageSlugs: Record<string, string> = {
  'who-we-are': 'whoWeAre',
  'what-we-do': 'whatWeDo',
  'ml-process': 'mlProcess',
  events: 'events',
  world: 'world',
  people: 'ourTeam',
  advisors: 'advisors',
  join: 'join',
  contact: 'contact',
  privacy: 'privacy',
  terms: 'terms',
  /** the mini games live under /minigames/; they are pages of their own, not info pages (no entry in `pages`) */
  minigames: 'minigames',
  'ink-maze': 'minigames/inkMaze',
  'forge-or-fold': 'minigames/forgeOrFold',
  'carrot-defense': 'minigames/carrotDefense',
}

/** The mini games: the list at /minigames/, each game's page, and the card on What We Do. */
export const minigames = {
  title: 'Mini games',
  eyebrow: 'Play',
  lead: 'Strategy, craft, and puzzles. Play on your computer or phone.',
  card: {
    eyebrow: 'Play',
    title: 'Mini games',
    body: 'Play Carrot Defense 3D, Forge or Fold, and Ink Maze in your browser.',
    cta: 'See the games',
  },
  inkMaze: {
    title: 'Ink Maze',
    eyebrow: 'Mini game',
    lead: 'Roll the ball to color every floor block before you run out of ink.',
    /**
     * The card on /minigames/. The numbers come from levels.ts (MinigamesPage
     * works them out), so they stay right when levels change: `first`,
     * `largest` and `last` are board sizes like '4 × 4' (the last level can be
     * smaller than the largest), `exact` counts the levels whose ink is
     * exactly their par.
     */
    summary: ({ levels, first, largest, last, exact }: { levels: number; first: string; largest: string; last: string; exact: number }) =>
      `Roll a ball to color every floor block before the ink runs out. ` +
      (last === largest
        ? `Boards go from ${first} on level 1 to ${last} on level ${levels}. `
        : `Boards grow from ${first} on level 1 to ${largest}, and the last board, level ${levels}, is a small ${last} that takes the most planning. `) +
      (exact ? `Each level gives you a set amount of ink, and on ${exact === levels ? 'all of them' : `${exact} of them`} there is none to spare.` : 'Each level gives you a set amount of ink.'),
    cta: 'Play Ink Maze',
    /** must stay true to engine.ts */
    rules: [
      'Pick a direction and the ball rolls in a straight line until a wall or the edge of the board stops it.',
      'Every block the ball rolls onto costs one ink, even if it is already colored.',
      'If the ink runs out partway through a roll, the ball stops on the block where it ran out.',
      'Color every floor block to clear the level, even if that takes your last drop of ink.',
      'If the ink runs out while some blocks are still uncolored, you lose the level. You can still undo or restart.',
    ],
  },
}

export const pages: Record<string, SubPageDef> = {
  'who-we-are': {
    title: 'About',
    lead: 'A Cornell club for people who like games and the math behind them.',
    sections: [
      { heading: 'How we work', alt: 'Culture', body: 'Beginners are welcome, and we still check each other\u2019s math.' },
      { heading: 'Game AI', alt: 'Focus', body: 'Solvers, learning agents, and the math behind them.' },
      { heading: 'Ithaca', alt: 'Home', body: 'We meet at Cornell. Our members come from all over the world.' },
    ],
  },
  'what-we-do': {
    title: 'Our Work',
    lead: 'What we are building, and what the club does each week.',
    sections: [
      {
        // TODO(club): add numbers once benchmarks exist
        heading: 'Guandan agent', alt: 'In training',
        body: 'Four agents play the card game Guandan against each other and learn from self-play. No benchmarks published yet.',
      },
      {
        heading: 'Poker equity', alt: 'Calculator',
        body: 'A Monte Carlo equity calculator for Texas hold\u2019em. You can run it on our home page.',
      },
      { heading: 'Study nights', alt: 'Every week', body: 'A weekly session on game theory, ranges, and equilibria.' },
      { heading: 'Club events', alt: 'Off the laptop', body: 'Tournaments with real structure and no buy-in, plus talks on quant, poker, and academia.' },
    ],
  },
  'ml-process': {
    title: 'Machine Learning',
    lead: 'How we turn a game\u2019s rules into an agent that plays it.',
    sections: [
      { heading: 'Frame', alt: 'The rules', body: 'Write the game down as states, actions, and payoffs.' },
      { heading: 'Simulate', alt: 'Simulator', body: 'Build a simulator fast enough for agents to play themselves.' },
      { heading: 'Train', alt: 'Self-play', body: 'Counterfactual regret minimization or deep reinforcement learning.' },
      { heading: 'Evaluate', alt: 'Testing', body: 'Measure exploitability and play agents head to head.' },
      { heading: 'Share', alt: 'Release', body: 'We plan to release agents, tools, and write-ups. Nothing is out yet.' },
    ],
  },
  events: {
    title: 'Events',
    lead: 'Dates go up here once they are set.',
    sections: [
      { heading: 'Fall Kickoff', alt: 'First meeting', body: 'Our first meeting of the year. Date TBA.' },
      { heading: 'Solver Workshop', alt: 'Hands-on', body: 'Write a small CFR solver with us. Date TBA.' },
      { heading: 'Alumni Night', alt: 'Q&A', body: 'Alumni talk about working in quant and research. Date TBA.' },
      { heading: 'Charity Tournament', alt: 'For charity', body: 'A club tournament played for charity. Date TBA.' },
      { heading: 'Spring Banquet', alt: 'Dinner', body: 'End-of-year dinner. Date TBA.' },
    ],
  },
  world: {
    title: 'World',
    lead: 'Where our members come from.',
    sections: [
      { heading: 'Our members', alt: 'Hometowns', body: 'Cornell students from around the world.' },
      { heading: 'Countries', alt: 'How many', body: 'Count TBA.' },
    ],
  },
  people: {
    title: 'Our Team',
    lead: 'Board and members of Cornell CGS.',
    sections: [
      { heading: 'Advisors', alt: 'Faculty', body: 'See the Advisors page.' },
    ],
  },
  advisors: {
    title: 'Advisors',
    // TODO(club): advisor + member roster (names, roles, photos)
    lead: 'Faculty who advise Cornell CGS.',
    sections: [
      {
        heading: 'Our team', alt: 'Board and members',
        body: 'The board and the rest of the club are listed on the Our Team page.',
        link: { label: 'Our Team', href: '/ourTeam/' },
      },
    ],
  },
  join: {
    title: 'Join CGS',
    lead: 'We take new members every semester.',
    sections: [
      { heading: 'Everyone', alt: 'All majors', body: 'Every school, major, and background is welcome to apply.' },
      { heading: 'Helpful math', alt: 'Recommended', body: 'MATH 1110 or higher, or similar experience. Recommended, not required.' },
      { heading: 'Helpful CS', alt: 'Recommended', body: 'CS 1110 or 1112, or experience reading and writing code. Recommended, not required.' },
      { heading: 'Apply', alt: 'Email us', body: 'Email recruitment@cornellcgs.org.' },
      {
        heading: 'Coffee chat',
        alt: 'Say hello',
        body: 'A twenty-minute chat with a member. You don\u2019t have to apply afterward.',
        link: {
          label: 'Book a coffee chat',
          href: 'https://docs.google.com/forms/d/e/1FAIpQLSfCJEW9kdTEYV41YZZCt4MQRg8c9KdNSbrw9IGmSgCRF9eglw/viewform',
        },
      },
    ],
  },
  contact: {
    title: 'Contact Us',
    lead: 'Email the team that fits your question.',
    sections: [
      { heading: 'Recruitment', alt: 'Join CGS', body: 'recruitment@cornellcgs.org' },
      { heading: 'Tech', alt: 'Code', body: 'tech@cornellcgs.org' },
      { heading: 'Finance', alt: 'Sponsors', body: 'finance@cornellcgs.org' },
      { heading: 'Marketing', alt: 'Outreach', body: 'marketing@cornellcgs.org' },
      { heading: 'Social', alt: 'Say hello', body: 'social@cornellcgs.org' },
    ],
  },
  privacy: {
    title: 'Privacy',
    lead: 'What the site keeps when you sign in to a game, and how to remove it.',
    sections: [
      { heading: 'Signed out', alt: 'Default', body: 'Every game works without an account. Progress stays in your browser and nothing is sent anywhere.' },
      { heading: 'Signed in', alt: 'With Google', body: 'Signing in with Google adds a server copy of that same progress so it follows you to other devices. We store a hash of your Google account id, your display name, your profile picture link, and your game saves. No email address, no password, no token from Google.' },
      { heading: 'Signing out', alt: 'All devices', body: 'Sign out on any device and every other device is signed out too. Handy on a shared computer.' },
      { heading: 'Deleting', alt: 'Your call', body: 'Open the sign-in menu in any game and choose Delete account. Your server data is removed at once. What is in your browser stays, and you keep playing signed out.' },
      { heading: 'Google', alt: 'Their side', body: 'Google records that you used Sign in with Google here. You can review or remove that in your Google account under connections.', link: { label: 'Google account connections', href: 'https://myaccount.google.com/connections' } },
      { heading: 'Questions', alt: 'Contact', body: 'Write to the club and we will answer or delete on request.', link: { label: 'Contact', href: '/contact/' } },
    ],
  },
  terms: {
    title: 'Terms',
    lead: 'The short version of using this site and its games.',
    sections: [
      { heading: 'Free to use', alt: 'No cost', body: 'The site and the games are free. No purchases, no ads, no paid tiers.' },
      { heading: 'Accounts', alt: 'Optional', body: 'An account only carries game progress between devices. Keep your Google account secure; we cannot recover a sign-in for you.' },
      { heading: 'Fair play', alt: 'Scores', body: 'Leaderboards are for play by hand. Scripted or forged scores may be removed without notice.' },
      { heading: 'Availability', alt: 'Best effort', body: 'A student club runs this site. Games and sign-in can be down or change at any time, and saved progress can be lost. Nothing here is a warranty.' },
      { heading: 'Content', alt: 'Ownership', body: 'Game code and artwork belong to the club or their listed authors. Third-party assets are used under their own licenses.' },
      { heading: 'Changes', alt: 'This page', body: 'We may update these terms. The date of the last change is in the site repository history.' },
    ],
  },
}

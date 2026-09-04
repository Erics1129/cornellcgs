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

/** Hero typing line — the lead changes too. TODO real topics. */
export const typing = {
  pairs: [
    { lead: 'We do research in', tail: 'computational game theory' },
    { lead: 'We study', tail: 'imperfect information games' },
    { lead: 'We build', tail: 'poker solvers' },
    { lead: 'We train', tail: 'reinforcement learning agents' },
    { lead: 'We compute', tail: 'equilibria' },
    { lead: 'We collaborate on', tail: 'multi agent learning' },
    { lead: 'We build', tail: 'AlphaGo style agents' },
    { lead: 'We are training', tail: 'a Throwing Eggs AI' },
    { lead: 'We play', tail: 'anything with payoffs' },
  ],
}

export const hero = {
  ctaPrimary: { label: 'Join CGS', href: '#join' },
  ctaSecondary: { label: 'See what we do', href: '#what-we-do' },
  scrollHint: 'Scroll',
}

export const whoWeAre = {
  heading: 'Games, *solved* with computers.',
  paragraphs: ['We build game AI — the AlphaGo kind. Solvers, agents, and the math.'],
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
  heading: 'How we *play*.',
  // TODO real threads
  threads: [
    {
      rank: 'A',
      suit: '♠',
      title: 'Study nights',
      text: 'Game theory, ranges, equilibrium.',
    },
    {
      rank: 'K',
      suit: '♠',
      title: 'Research',
      text: 'Solvers, agents, equity math.',
    },
    {
      rank: 'Q',
      suit: '♠',
      title: 'Build',
      text: 'Bots that play. Right now: Throwing Eggs.',
    },
    {
      rank: 'J',
      suit: '♠',
      title: 'Tournaments',
      text: 'Real structure, zero buy in.',
    },
    {
      rank: '10',
      suit: '♠',
      title: 'Talks',
      text: 'Quant, poker, academia.',
    },
  ],
}

export const mlProcess = {
  heading: 'Our Machine Learning process',
  // TODO real steps
  steps: [
    {
      n: '01',
      title: 'Frame the game',
      text: 'States, actions, payoffs.',
    },
    {
      n: '02',
      title: 'Build the environment',
      text: 'A simulator and self play.',
    },
    {
      n: '03',
      title: 'Train',
      text: 'Counterfactual regret minimization and deep reinforcement learning.',
    },
    {
      n: '04',
      title: 'Evaluate',
      text: 'Exploitability and head to head matches.',
    },
    {
      n: '05',
      title: 'Ship',
      text: 'Bots that play, tools people use, papers.',
    },
  ],
}

export const events = {
  heading: 'On the *table* this year.',
  // TODO real events
  items: [
    {
      title: 'Fall Kickoff',
      date: 'Date TBA', // TODO date
      blurb: 'First deal of the year.',
    },
    {
      title: 'Solver Workshop',
      date: 'Date TBA', // TODO date
      blurb: 'Hands on with CFR.',
    },
    {
      title: 'Alumni Night',
      date: 'Date TBA', // TODO date
      blurb: 'The truth about quant and research.',
    },
    {
      title: 'Charity Tournament',
      date: 'Date TBA', // TODO date
      blurb: 'Every chip for a good cause.',
    },
    {
      title: 'Spring Banquet',
      date: 'Date TBA', // TODO date
      blurb: 'The year in review.',
    },
  ],
}

export const world = {
  heading: 'Wherever you are from, you have a seat at this *table*.',
  // TODO real country count
  text: 'Every country. One common language: expected value.',
}

export const people = {
  heading: 'The *hands* behind CGS.',
  /** A card is a leadership seat — the rest of the club lives on the Our Team page. */
  leaders: [
    {
      name: 'Elsie Lu',
      role: 'President \u00b7 Statistics',
      bio: 'VC, medical devices, management, financial modeling.',
      photo: '/assets/team/elsie-lu.jpg',
    },
    // TODO(club): the rest of the board
    ...Array.from({ length: 5 }, () => ({
      name: 'To be added',
      role: 'Seat TBA',
      bio: 'Bio to be added.',
    })),
  ] as Array<{ name: string; role: string; bio: string; photo?: string }>,
}

/** The Our Team page — name and major only, so the whole club fits on one screen. */
export const team: Array<{ label: string; alt: string; people: Array<{ name: string; major: string }> }> = [
  {
    label: 'Board',
    alt: 'Leadership',
    people: [{ name: 'Elsie Lu', major: 'Statistics' }],
  },
  // TODO(club): the roster
  { label: 'Members', alt: 'The Table', people: [{ name: 'To be added', major: 'Major TBA' }] },
]

export const join = {
  heading: 'Pull up a *chair*.',
  text: 'New members every semester. The curious, any time.',
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

/** The last chapter — what we envision. TODO(club): make these your own. */
export const vision = {
  title: 'What we envision',
  next: [
    'A Throwing Eggs agent that beats its makers.',
    'Open tables: our bots against anyone who sits down.',
    'The tools and papers behind them, in the open.',
  ],
}

/** Advisors — name, title and research line as published on their own pages. */
export const advisors = [
  {
    name: 'Robert D. Kleinberg',
    role: 'Faculty Advisor',
    title: 'Professor of Computer Science, Cornell University',
    bio: 'Algorithms and theoretical computer science \u2014 economic aspects of algorithms, online learning and its applications, random processes in networks.',
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
 * Citadel-style sub-pages — one per dropdown item, opened at #p/<id>.
 * Every piece of information is TBD until the club fills it in. TODO all.
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
}

export const pages: Record<string, SubPageDef> = {
  'who-we-are': {
    title: 'Who We Are',
    lead: 'A Cornell student organization that solves games with code.',
    sections: [
      { heading: 'Our Culture', alt: 'How We Work', body: 'Open, rigorous, beginner-friendly. Any person, any study.' },
      { heading: 'What We Build', alt: 'Why We Build It', body: 'Game AI — the AlphaGo kind. Agents that learn a game and outgrow us.' },
      { heading: 'Where We Are', alt: 'Where We Come From', body: 'Ithaca, NY. Members from around the world.' },
    ],
  },
  'what-we-do': {
    title: 'What We Do',
    lead: 'We build game AI — the AlphaGo kind. Now playing: Throwing Eggs.',
    sections: [
      {
        heading: 'Throwing Eggs, In 20 Seconds', alt: 'The Rules, Fast',
        body: '4 players, 2 teams, partners across the table, 108 cards. Shed your hand first. Singles, pairs, straights, full houses — and bombs beat everything.',
      },
      {
        heading: 'How You Win', alt: 'Climb To Ace',
        body: 'Finish before the other team. Wins climb your team up card levels, 2 through Ace. First team past Ace takes the match.',
      },
      {
        // TODO(club): replace with real, current capabilities + numbers
        heading: 'Our Throwing Eggs AI', alt: 'The Bot In Training',
        body: 'In training. It learns by playing itself, and it gets better every run. Benchmarks when we have numbers worth bragging about.',
      },
      { heading: 'Study Nights', alt: 'Every Week', body: 'Game theory, ranges, equilibrium — weekly.' },
      { heading: 'Tournaments & Talks', alt: 'Play. Listen. Argue.', body: 'Real structure, zero buy-in. Speakers from quant, poker, academia.' },
    ],
  },
  'ml-process': {
    title: 'Our Machine Learning Process',
    lead: 'From rules to superhuman — the same loop AlphaGo ran.',
    sections: [
      { heading: '01 — Frame the game', alt: '01 — Define the state', body: 'States, actions, payoffs.' },
      { heading: '02 — Build the environment', alt: '02 — Simulate at scale', body: 'A simulator, and self-play.' },
      { heading: '03 — Train', alt: '03 — Self-play', body: 'Counterfactual regret minimization and deep RL.' },
      { heading: '04 — Evaluate', alt: '04 — Measure exploitability', body: 'Exploitability and head-to-head matches.' },
      { heading: '05 — Ship', alt: '05 — Release', body: 'Bots that play, tools people use, papers.' },
    ],
  },
  events: {
    title: 'Events',
    lead: 'This year\u2019s events. Dates TBA.',
    sections: [
      { heading: 'Fall Kickoff', alt: 'First Deal', body: 'First deal of the year. Date TBA.' },
      { heading: 'Solver Workshop', alt: 'Build A Solver', body: 'Hands-on with CFR. Date TBA.' },
      { heading: 'Alumni Night', alt: 'Ask Them Anything', body: 'The truth about quant and research. Date TBA.' },
      { heading: 'Charity Tournament', alt: 'Chips For Good', body: 'Every chip for a good cause. Date TBA.' },
      { heading: 'Spring Banquet', alt: 'The Year, Reviewed', body: 'The year in review. Date TBA.' },
    ],
  },
  world: {
    title: 'World',
    lead: 'Our members come from around the world.',
    sections: [
      { heading: 'Our Members', alt: 'Who Plays Here', body: 'Students from around the world.' },
      { heading: 'Countries', alt: 'How Far We Reach', body: 'Count TBA.' },
    ],
  },
  people: {
    title: 'Our Team',
    lead: 'Board and members of Cornell CGS.',
    sections: [
      { heading: 'Advisors', alt: 'Our Mentors', body: 'TBA \u2014 see Advisors.' },
    ],
  },
  advisors: {
    title: 'Advisors',
    // TODO(club): advisor + member roster (names, roles, photos)
    lead: 'Advisors and mentors of Cornell CGS.',
    sections: [
      { heading: 'Board', alt: 'Leadership', body: 'TBA.' },
      { heading: 'Members', alt: 'The Table', body: 'TBA.' },
    ],
  },
  join: {
    title: 'Join CGS',
    lead: '\u201CI would found an institution where any person can find instruction in any study.\u201D \u2014 Ezra Cornell. We take him at his word.',
    sections: [
      { heading: 'Who Can Join', alt: 'Any Person, Any Study', body: 'Any person, any study. Every school, every major, every background \u2014 all are welcome to apply.' },
      { heading: 'Helpful Math', alt: 'MATH 1110 Or Beyond', body: 'MATH 1110 or beyond \u2014 or relevant experience.' },
      { heading: 'Helpful CS', alt: 'CS 1110 / 1112', body: 'CS 1110 or 1112 \u2014 enough to read and write code.' },
      { heading: 'How to Apply', alt: 'Email Us', body: 'Email recruitment@cornellcgs.org. New members every semester.' },
      {
        heading: 'Coffee Chat',
        alt: 'Talk To Us First',
        body: 'Not sure yet? Grab a coffee with a member \u2014 twenty minutes, no commitment.',
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
      { heading: 'Recruitment', alt: 'Join The Table', body: 'recruitment@cornellcgs.org' },
      { heading: 'Tech', alt: 'Code And Infra', body: 'tech@cornellcgs.org' },
      { heading: 'Finance & Sponsors', alt: 'Back The Club', body: 'finance@cornellcgs.org' },
      { heading: 'Marketing', alt: 'Spread The Word', body: 'marketing@cornellcgs.org' },
      { heading: 'Social', alt: 'Say Hello', body: 'social@cornellcgs.org' },
    ],
  },
}

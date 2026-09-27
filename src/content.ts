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
  heading: 'Game *AI*',
  paragraphs: ['A Cornell student organization exploring game theory through solvers and learning agents.'],
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
  heading: 'Self-play',
  // TODO real steps
  steps: [
    {
      n: '01',
      title: 'Frame',
      text: 'States, actions, payoffs.',
    },
    {
      n: '02',
      title: 'Simulate',
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
      text: 'The goal: share agents, tools, and findings.',
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
  heading: 'One *Table*',
  // TODO real country count
  text: 'Cornell students from around the world.',
}

export const people = {
  heading: 'Our *Team*',
  /** A card is a board seat — the rest of the club lives on the Our Team page. */
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
        'Faircaribe LLC \u2014 financial and data analysis',
        'Handshake AI \u2014 intern',
        'Noon AI \u2014 operations intern',
        'Personal website development',
      ],
      skills: ['Statistical modeling', 'Mathematical modeling', 'Python', 'AI reasoning & research'],
    },
    // TODO(club): the rest of the board — empty seats carry every field so the
    // admin shows a photo drop zone, major, experience and skills for them
    ...Array.from({ length: 2 }, () => ({
      name: 'To be added',
      role: 'Seat TBA',
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
  // TODO(club): the roster
  { label: 'Members', alt: 'The Table', people: [{ name: 'To be added', major: 'Major TBA' }] },
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

/** The last chapter — what we envision. TODO(club): make these your own. */
export const vision = {
  title: 'Next',
  next: [
    'Stronger agents.',
    'Open play.',
    'Shared research.',
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
}

export const pages: Record<string, SubPageDef> = {
  'who-we-are': {
    title: 'About',
    lead: 'Game theory, explored together at Cornell.',
    sections: [
      { heading: 'Our Culture', alt: 'Together', body: 'Open, rigorous, beginner-friendly.' },
      { heading: 'Game AI', alt: 'Our Focus', body: 'Solvers, learning agents, and the mathematics behind them.' },
      { heading: 'Ithaca', alt: 'Our Home', body: 'Based at Cornell, with members from around the world.' },
    ],
  },
  'what-we-do': {
    title: 'Our Work',
    lead: 'Now playing: Throwing Eggs.',
    sections: [
      {
        heading: 'The Game', alt: 'Throwing Eggs',
        body: '4 players, 2 teams, 108 cards. Partners sit across the table. Shed your hand with singles, pairs, straights, full houses, and bombs.',
      },
      {
        heading: 'Level Up', alt: 'Winning',
        body: 'Finish before the other team. Wins climb your team up card levels, 2 through Ace. First team past Ace takes the match.',
      },
      {
        // TODO(club): replace with real, current capabilities + numbers
        heading: 'In Training', alt: 'Our Agent',
        body: 'Our Throwing Eggs agent learns through self-play. Benchmarks are not yet published.',
      },
      { heading: 'Study Nights', alt: 'Every Week', body: 'Game theory, ranges, equilibrium — weekly.' },
      { heading: 'Club Events', alt: 'Beyond Code', body: 'Structured tournaments with no buy-in. Talks on quant, poker, and academia.' },
    ],
  },
  'ml-process': {
    title: 'Machine Learning',
    lead: 'From game rules to a learning agent.',
    sections: [
      { heading: 'Frame', alt: 'Game State', body: 'States, actions, payoffs.' },
      { heading: 'Simulate', alt: 'The Environment', body: 'A simulator for self-play.' },
      { heading: 'Train', alt: 'Self-play', body: 'Counterfactual regret minimization and deep reinforcement learning.' },
      { heading: 'Evaluate', alt: 'Measure', body: 'Exploitability and head-to-head matches.' },
      { heading: 'Share', alt: 'The Goal', body: 'Agents, tools, and research findings. Releases to come.' },
    ],
  },
  events: {
    title: 'Events',
    lead: 'On the calendar. Dates TBA.',
    sections: [
      { heading: 'Fall Kickoff', alt: 'First Deal', body: 'First deal of the year. Date TBA.' },
      { heading: 'Solver Workshop', alt: 'Build Solvers', body: 'Hands-on with CFR. Date TBA.' },
      { heading: 'Alumni Night', alt: 'Ask Away', body: 'Conversations on quant and research. Date TBA.' },
      { heading: 'Charity Tournament', alt: 'Give Back', body: 'Every chip for a good cause. Date TBA.' },
      { heading: 'Spring Banquet', alt: 'Looking Back', body: 'The year in review. Date TBA.' },
    ],
  },
  world: {
    title: 'World',
    lead: 'Different places. A shared table.',
    sections: [
      { heading: 'Our Members', alt: 'Common Ground', body: 'Cornell students from around the world.' },
      { heading: 'Countries', alt: 'Our Reach', body: 'Count TBA.' },
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
    lead: 'Any person, any study.',
    sections: [
      { heading: 'Everyone', alt: 'All Majors', body: 'Every school, major, and background is welcome to apply.' },
      { heading: 'Helpful Math', alt: 'Recommended', body: 'MATH 1110 or beyond, or relevant experience. Recommended, not required.' },
      { heading: 'Helpful CS', alt: 'Recommended', body: 'CS 1110 or 1112, or experience reading and writing code. Recommended, not required.' },
      { heading: 'Apply', alt: 'Email Us', body: 'Email recruitment@cornellcgs.org. New members every semester.' },
      {
        heading: 'Coffee Chat',
        alt: 'Say Hello',
        body: 'Twenty minutes with a member. No commitment.',
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
      { heading: 'Social', alt: 'Say Hello', body: 'social@cornellcgs.org' },
    ],
  },
}

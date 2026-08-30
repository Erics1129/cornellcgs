/**
 * Every word on the site lives here so copy can be edited without touching
 * components. Placeholders that need real information are marked TODO.
 */

export const site = {
  name: 'Cornell CGS',
  fullName: 'Cornell Computational Game Society',
  domain: 'cornellcgs.org',
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
  // TODO real copy
  paragraphs: ['We solve games with code. Solvers, agents, and the math.'],
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
      text: 'Bots that play. Tools. Papers.',
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
  // TODO real people — every entry is a placeholder until the roster exists
  members: Array.from({ length: 6 }, () => ({
    name: 'To be added',
    role: 'Role TBA',
    bio: 'Bio to be added.',
  })),
}

export const join = {
  heading: 'Pull up a *chair*.',
  text: 'New members every semester. The curious, any time.',
  cta: { label: 'Apply to CGS', href: '#' }, // TODO form url
}

export const contact = {
  email: 'To be added', // TODO real email
  instagram: 'To be added', // TODO real instagram
  instagramUrl: '', // TODO real instagram url
  wechat: 'To be added', // TODO real wechat
}

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
  sections: Array<{ heading: string; body: string }>
}

export const pages: Record<string, SubPageDef> = {
  'who-we-are': {
    title: 'Who We Are',
    lead: 'TBD', // TODO
    sections: [
      { heading: 'Our Culture', body: 'TBD' },
      { heading: 'Leadership Team', body: 'TBD' },
      { heading: 'Where We Are', body: 'TBD' },
    ],
  },
  'what-we-do': {
    title: 'What We Do',
    lead: 'TBD', // TODO
    sections: [
      { heading: 'Study Nights', body: 'TBD' },
      { heading: 'Research', body: 'TBD' },
      { heading: 'Build', body: 'TBD' },
      { heading: 'Tournaments', body: 'TBD' },
      { heading: 'Talks', body: 'TBD' },
    ],
  },
  'ml-process': {
    title: 'Our Machine Learning Process',
    lead: 'TBD', // TODO
    sections: [
      { heading: '01 — Frame the game', body: 'TBD' },
      { heading: '02 — Build the environment', body: 'TBD' },
      { heading: '03 — Train', body: 'TBD' },
      { heading: '04 — Evaluate', body: 'TBD' },
      { heading: '05 — Ship', body: 'TBD' },
    ],
  },
  events: {
    title: 'Events',
    lead: 'TBD', // TODO
    sections: [
      { heading: 'Fall Kickoff', body: 'TBD' },
      { heading: 'Solver Workshop', body: 'TBD' },
      { heading: 'Alumni Night', body: 'TBD' },
      { heading: 'Charity Tournament', body: 'TBD' },
      { heading: 'Spring Banquet', body: 'TBD' },
    ],
  },
  world: {
    title: 'World',
    lead: 'TBD', // TODO
    sections: [
      { heading: 'Our Members', body: 'TBD' },
      { heading: 'Countries', body: 'TBD' },
    ],
  },
  people: {
    title: 'Our Team',
    lead: 'TBD', // TODO
    sections: [
      { heading: 'Board', body: 'TBD' },
      { heading: 'Members', body: 'TBD' },
    ],
  },
  join: {
    title: 'Join CGS',
    lead: 'TBD', // TODO
    sections: [
      { heading: 'How to Apply', body: 'TBD' },
      { heading: 'Who Can Join', body: 'TBD' },
    ],
  },
  contact: {
    title: 'Contact Us',
    lead: 'TBD', // TODO
    sections: [
      { heading: 'Email', body: 'TBD' },
      { heading: 'Instagram', body: 'TBD' },
      { heading: 'WeChat', body: 'TBD' },
    ],
  },
}

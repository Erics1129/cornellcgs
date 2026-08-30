/**
 * Every word on the site lives here so copy can be edited without touching
 * components. Placeholders that need real information are marked TODO.
 */

export const site = {
  name: 'Cornell CGS',
  fullName: 'Cornell Computational Game Society',
  domain: 'cornellcgs.org',
  eyebrow: 'Cornell University · Registered student organization',
  footerLine: (year: number) =>
    `This organization is a registered student organization of Cornell University. © ${year} Cornell CGS.`,
}

export const nav = [
  { id: 'who-we-are', label: 'Who we are', rank: 'K' },
  { id: 'what-we-do', label: 'What we do', rank: 'Q' },
  { id: 'ml-process', label: 'ML', rank: 'J' },
  { id: 'events', label: 'Events', rank: '10' },
  { id: 'world', label: 'World', rank: '9' },
  { id: 'people', label: 'People', rank: '8' },
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
  paragraphs: [
    'Cornell students who solve games with code — poker, board games, auctions. We build the solvers, train the agents, run the math.',
  ],
  photoPlaceholder: 'TODO team photo',
  counters: [
    { label: 'Members', value: 48, suffix: '' }, // TODO real member count
    { label: 'Countries', value: 14, suffix: '' }, // TODO real country count
    { label: 'Projects', value: 9, suffix: '' }, // TODO real project count
    { label: 'Founded', value: 2024, suffix: '', noSeparator: true }, // TODO real founding year
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
      date: 'September', // TODO date
      blurb: 'First deal of the year.',
    },
    {
      title: 'Solver Workshop',
      date: 'October', // TODO date
      blurb: 'Hands on with CFR.',
    },
    {
      title: 'Alumni Night',
      date: 'November', // TODO date
      blurb: 'The truth about quant and research.',
    },
    {
      title: 'Charity Tournament',
      date: 'February', // TODO date
      blurb: 'Every chip for a good cause.',
    },
    {
      title: 'Spring Banquet',
      date: 'April', // TODO date
      blurb: 'The year in review.',
    },
  ],
}

export const world = {
  heading: 'Wherever you are from, you have a seat at this *table*.',
  // TODO real country count
  text: 'Fourteen countries. One common language: expected value.',
}

export const people = {
  heading: 'The *hands* behind CGS.',
  // TODO real people
  members: [
    { name: 'Alex Chen', role: 'President', bio: 'CS ’26. Writes solvers by day, folds aces by night.' },
    { name: 'Priya Raman', role: 'VP Research', bio: 'ORIE ’27. Thinks in regret minimization.' },
    { name: 'Daniel Okafor', role: 'Treasurer', bio: 'Econ ’26. Keeps the bankroll strictly positive.' },
    { name: 'Sofia Martinez', role: 'Events', bio: 'InfoSci ’27. Deals every tournament in under a minute.' },
    { name: 'Kenji Watanabe', role: 'ML Lead', bio: 'CS ’25. Trains agents that bluff better than he does.' },
    { name: 'Emma Liu', role: 'Outreach', bio: 'AEM ’28. Recruited half the club over dinner.' },
  ],
}

export const join = {
  heading: 'Pull up a *chair*.',
  text: 'New members every semester. The curious, any time.',
  cta: { label: 'Apply to CGS', href: '#' }, // TODO form url
}

export const contact = {
  email: 'hello@cornellcgs.org', // TODO real email
  instagram: '@cornellcgs', // TODO real instagram
  instagramUrl: 'https://instagram.com/cornellcgs', // TODO real instagram url
  wechat: 'CornellCGS', // TODO real wechat
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

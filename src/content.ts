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
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'what-we-do', label: 'What we do' },
  { id: 'ml-process', label: 'ML' },
  { id: 'events', label: 'Events' },
  { id: 'world', label: 'World' },
  { id: 'people', label: 'People' },
  { id: 'join', label: 'Join' },
]

/** Hero title, broken over three lines per the design. */
export const heroTitle = ['Cornell', 'Computational', 'Game Society']

export const typing = {
  prefix: 'We do research in ',
  // TODO real research topics
  words: [
    'computational game theory',
    'poker solvers',
    'counterfactual regret minimization',
    'reinforcement learning for games',
    'imperfect information games',
    'multi agent learning',
    'equilibrium computation',
    'mechanism design',
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
    'We are Cornell students who study games with code. Poker, board games, auctions — anything with players and payoffs is fair game, and we treat every one of them as a problem worth solving properly.',
    'We build the solvers, train the agents and run the math. Some of us come for the game theory, some for the machine learning, some just to finally understand why that river call was wrong.',
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
      text: 'Weekly sessions on game theory, ranges and equilibrium.',
    },
    {
      rank: 'K',
      suit: '♠',
      title: 'Research',
      text: 'Projects on solvers, agents and equity math.',
    },
    {
      rank: 'Q',
      suit: '♠',
      title: 'Build',
      text: 'Bots that actually play, tools and papers.',
    },
    {
      rank: 'J',
      suit: '♠',
      title: 'Tournaments',
      text: 'Friendly events with real structure and zero buy in.',
    },
    {
      rank: '10',
      suit: '♠',
      title: 'Talks',
      text: 'Guests from quant, poker and academia.',
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
      blurb:
        'First deal of the year. Meet the club, see the projects, get a seat at the table.',
    },
    {
      title: 'Solver Workshop',
      date: 'October', // TODO date
      blurb:
        'Hands on with CFR. Bring a laptop, leave with a toy solver that actually converges.',
    },
    {
      title: 'Alumni Night',
      date: 'November', // TODO date
      blurb:
        'CGS alumni from quant desks and research labs come back and tell the truth about both.',
    },
    {
      title: 'Charity Tournament',
      date: 'February', // TODO date
      blurb:
        'Real structure, zero buy in, every chip counted for a good cause.',
    },
    {
      title: 'Spring Banquet',
      date: 'April', // TODO date
      blurb:
        'The year in review, awards for the boldest bluffs and the cleanest proofs.',
    },
  ],
}

export const world = {
  heading: 'Wherever you are from, you have a seat at this *table*.',
  // TODO real country count
  text: 'We welcome members from every country and every skill level. CGS speaks fourteen nationalities and one common language: expected value.',
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
  text: 'New members join at the start of each semester, and curious people are welcome any time.',
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

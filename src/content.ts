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
  eyebrow: 'TBD',
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
    { lead: 'TBD', tail: '' },
    { lead: 'TBD', tail: '' },
    { lead: 'TBD', tail: '' },
    { lead: 'TBD', tail: '' },
    { lead: 'TBD', tail: '' },
    { lead: 'TBD', tail: '' },
    { lead: 'TBD', tail: '' },
    { lead: 'TBD', tail: '' },
    { lead: 'TBD', tail: '' },
  ],
}

export const hero = {
  ctaPrimary: { label: 'Join CGS', href: '#join' },
  ctaSecondary: { label: 'See what we do', href: '#what-we-do' },
  scrollHint: 'Scroll',
}

export const whoWeAre = {
  heading: 'TBD',
  paragraphs: ['TBD'],
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
  heading: 'TBD',
  // TODO real threads
  threads: [
    {
      rank: 'A',
      suit: '♠',
      title: 'TBD',
      text: 'TBD',
    },
    {
      rank: 'K',
      suit: '♠',
      title: 'TBD',
      text: 'TBD',
    },
    {
      rank: 'Q',
      suit: '♠',
      title: 'TBD',
      text: 'TBD',
    },
    {
      rank: 'J',
      suit: '♠',
      title: 'TBD',
      text: 'TBD',
    },
    {
      rank: '10',
      suit: '♠',
      title: 'TBD',
      text: 'TBD',
    },
  ],
}

export const mlProcess = {
  heading: 'TBD',
  // TODO real steps
  steps: [
    {
      n: '01',
      title: 'TBD',
      text: 'TBD',
    },
    {
      n: '02',
      title: 'TBD',
      text: 'TBD',
    },
    {
      n: '03',
      title: 'TBD',
      text: 'TBD',
    },
    {
      n: '04',
      title: 'TBD',
      text: 'TBD',
    },
    {
      n: '05',
      title: 'TBD',
      text: 'TBD',
    },
  ],
}

export const events = {
  heading: 'TBD',
  // TODO real events
  items: [
    {
      title: 'TBD',
      date: 'TBD', // TODO date
      blurb: 'TBD',
    },
    {
      title: 'TBD',
      date: 'TBD', // TODO date
      blurb: 'TBD',
    },
    {
      title: 'TBD',
      date: 'TBD', // TODO date
      blurb: 'TBD',
    },
    {
      title: 'TBD',
      date: 'TBD', // TODO date
      blurb: 'TBD',
    },
    {
      title: 'TBD',
      date: 'TBD', // TODO date
      blurb: 'TBD',
    },
  ],
}

export const world = {
  heading: 'TBD',
  // TODO real country count
  text: 'TBD',
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
      skills: ['TBD', 'TBD', 'TBD', 'TBD'],
    },
    {
      name: 'Evan Jiang',
      role: 'Recruitment Chair',
      major: 'Biometry & Statistics + Information Science',
      photo: '/assets/team/evan-jiang.jpg',
      experience: [
        'TBD',
        'TBD',
        'TBD',
        'TBD',
      ],
      skills: ['TBD', 'TBD', 'TBD', 'TBD'],
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
    alt: 'TBD',
    people: [
      { name: 'Elsie Lu', major: 'Statistics' },
      { name: 'Evan Jiang', major: 'Biometry & Statistics + Information Science' },
    ],
  },
  // TODO(club): majors for the rest of the team
  {
    label: 'Members',
    alt: 'TBD',
    people: ['Yicheng', 'Michael', 'Henrique', 'Eric', 'Selina', 'Christina', 'Daniel'].map((name) => ({ name, major: '' })),
  },
]

export const join = {
  heading: 'Join *CGS*',
  text: 'TBD',
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
  title: 'TBD',
  next: [
    'TBD',
    'TBD',
    'TBD',
  ],
}

/** Advisors — name, title and research line as published on their own pages. */
export const advisors = [
  {
    name: 'Robert D. Kleinberg',
    role: 'Faculty Advisor',
    title: 'Professor of Computer Science, Cornell University',
    bio: 'TBD',
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
  /** the mini games live under /minigames/; they are pages of their own, not info pages (no entry in `pages`) */
  minigames: 'minigames',
  'ink-maze': 'minigames/inkMaze',
  'forge-or-fold': 'minigames/forgeOrFold',
}

/** The mini games: the list at /minigames/, each game's page, and the card on What We Do. */
export const minigames = {
  title: 'Mini Games',
  eyebrow: 'Play',
  lead: 'Small puzzles you can play in the browser, on a computer or a phone.',
  card: {
    eyebrow: 'Play',
    title: 'Mini Games',
    body: 'Puzzles you can play in the browser. The first one is Ink Maze.',
    cta: 'See the games',
  },
  inkMaze: {
    title: 'Ink Maze',
    eyebrow: 'Mini game',
    lead: 'Roll the ball to color every floor block before you run out of ink.',
    summary: 'Ten levels, from 4 × 4 to 7 × 7. Each level gives you a set amount of ink. On the last three, it is exactly the least you need.',
    cta: 'Play Ink Maze',
    rules: [
      'The ball rolls in a straight line until a wall or the edge of the board stops it.',
      'Each block the ball rolls onto uses one ink, even if it is already colored.',
      'Color every floor block to clear the level.',
      'If you run out of ink with blocks still uncolored, the level is lost. You can undo or restart.',
    ],
  },
}

export const pages: Record<string, SubPageDef> = {
  'who-we-are': {
    title: 'About',
    lead: 'TBD',
    sections: [
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
    ],
  },
  'what-we-do': {
    title: 'Our Work',
    lead: 'TBD',
    sections: [
      {
        // TODO(club): add numbers once benchmarks exist
        heading: 'TBD', alt: 'TBD',
        body: 'TBD',
      },
      {
        heading: 'TBD', alt: 'TBD',
        body: 'TBD',
      },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
    ],
  },
  'ml-process': {
    title: 'Machine Learning',
    lead: 'TBD',
    sections: [
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
    ],
  },
  events: {
    title: 'Events',
    lead: 'TBD',
    sections: [
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
    ],
  },
  world: {
    title: 'World',
    lead: 'TBD',
    sections: [
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
    ],
  },
  people: {
    title: 'Our Team',
    lead: 'TBD',
    sections: [
      { heading: 'Advisors', alt: 'TBD', body: 'TBD' },
    ],
  },
  advisors: {
    title: 'Advisors',
    // TODO(club): advisor + member roster (names, roles, photos)
    lead: 'TBD',
    sections: [
      {
        heading: 'Our team', alt: 'TBD',
        body: 'TBD',
        link: { label: 'Our Team', href: '/ourTeam/' },
      },
    ],
  },
  join: {
    title: 'Join CGS',
    lead: 'TBD',
    sections: [
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'TBD' },
      { heading: 'TBD', alt: 'TBD', body: 'recruitment@cornellcgs.org' },
      {
        heading: 'TBD',
        alt: 'TBD',
        body: 'TBD',
        link: {
          label: 'Book a coffee chat',
          href: 'https://docs.google.com/forms/d/e/1FAIpQLSfCJEW9kdTEYV41YZZCt4MQRg8c9KdNSbrw9IGmSgCRF9eglw/viewform',
        },
      },
    ],
  },
  contact: {
    title: 'Contact Us',
    lead: 'TBD',
    sections: [
      { heading: 'Recruitment', alt: 'TBD', body: 'recruitment@cornellcgs.org' },
      { heading: 'Tech', alt: 'TBD', body: 'tech@cornellcgs.org' },
      { heading: 'Finance', alt: 'TBD', body: 'finance@cornellcgs.org' },
      { heading: 'Marketing', alt: 'TBD', body: 'marketing@cornellcgs.org' },
      { heading: 'Social', alt: 'TBD', body: 'social@cornellcgs.org' },
    ],
  },
}

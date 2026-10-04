// Replaceable content and imagery. Swap these for approved Lincoln Financial assets and copy
// without touching layout code. Image paths are relative to /public.

export const images = {
  lincolnEmblem: '/images/lincoln-emblem.png',
  lincolnEmblemLarge: '/images/lincoln-emblem@4x.png',
};

// PLACEHOLDER tagline. Not a verified Lincoln Financial slogan. Replace with approved copy.
export const hero = {
  tagline: 'Plan for the life you are building.',
  valueProposition: 'Understand what your loved ones may need, and build a protection plan around the life you are creating.',
  learnPoints: ['How much coverage your family may need', 'How that need changes as your life changes', 'Which type of coverage fits your plan'],
  cta: 'Start Planning',
  duration: 'A short conversation. About 2 minutes.',
};

// Shown on the home page so people know what we ask and why, before they start.
export const askItems = [
  { title: 'Who depends on you', why: 'Tells us who would rely on your income, such as a partner or children, and for how long.' },
  { title: 'Your income', why: 'Helps estimate how much income your family would need replaced.' },
  { title: 'Your debts', why: 'A mortgage or loans can remain after a death. Coverage can pay them off.' },
  { title: 'Coverage you already have', why: 'So we never recommend insurance you already own, including coverage through work.' },
  { title: 'Life events', why: 'Marriage, a new child, a new home or retirement all change how much protection you need.' },
];

export interface Statistic {
  value: string;
  label: string;
  source: string;
  sourceUrl: string;
}

// Verified against LIMRA's 2025 Insurance Barometer Study news release (June 25, 2025).
export const statistics: Statistic[] = [
  {
    value: '51%',
    label: 'of Americans ages 18–75 say they own life insurance.',
    source: 'LIMRA, 2025 Insurance Barometer Study',
    sourceUrl: 'https://www.limra.com/en/newsroom/news-releases/2025/adults-age-30-and-younger-overestimate-life-insurance-cost-by-1012-times/',
  },
  {
    value: '40%',
    label: 'of consumers need life insurance or need more coverage than they have.',
    source: 'LIMRA, 2025 Insurance Barometer Study',
    sourceUrl: 'https://www.limra.com/en/newsroom/news-releases/2025/adults-age-30-and-younger-overestimate-life-insurance-cost-by-1012-times/',
  },
  {
    value: '10–12×',
    label: 'how much adults age 30 and younger overestimate the cost of a $250,000, 20-year term policy.',
    source: 'LIMRA, 2025 Insurance Barometer Study',
    sourceUrl: 'https://www.limra.com/en/newsroom/news-releases/2025/adults-age-30-and-younger-overestimate-life-insurance-cost-by-1012-times/',
  },
];

export interface Testimonial {
  name: string;
  descriptor: string;
  quote: string;
  portrait?: string;
}

// PLACEHOLDER testimonials. Not real Lincoln Financial customers. Replace with approved testimonials.
export const testimonials: Testimonial[] = [
  { name: 'Maria T.', descriptor: 'Parent of two', quote: 'Seeing how our needs change as the kids grow made the decision straightforward.' },
  { name: 'James R.', descriptor: 'New homeowner', quote: 'I finally understood how much coverage our mortgage actually required.' },
  { name: 'Priya K.', descriptor: 'Small business owner', quote: 'Comparing plans side by side helped us choose with confidence.' },
];

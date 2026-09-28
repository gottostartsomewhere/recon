// What the user is about to do decides what the investigation has to establish.
// Each section is a question the agent must answer from sources, with a seed
// query that gives it evidence to start from before it starts choosing its own.

const IDENTITY = {
  id: 'identity',
  title: 'Identity & Legitimacy',
  goal:
    'Establish that this is a real, registered organisation: legal name, where and when it was incorporated, ' +
    'registration numbers if public, official website, physical address, and who runs it. Note anything that ' +
    'does not add up, such as a very new domain, no address, or names that do not match.',
  seed: (n) => `${n} official website legal name incorporated headquarters address founders`,
};

const BUSINESS = {
  id: 'business',
  title: 'What They Do',
  goal: 'Products, customers, business model and scale.',
  seed: (n) => `${n} company overview products business model customers`,
};

const REPUTATION = {
  id: 'reputation',
  title: 'Reputation & Complaints',
  goal:
    'What customers, clients and former staff say: review sites, complaint boards, forum threads and scam ' +
    'reports. Separate isolated complaints from patterns.',
  seed: (n) => `${n} reviews complaints scam experience`,
};

const LEGAL = {
  id: 'legal',
  title: 'Legal & Regulatory',
  goal:
    'Lawsuits, court cases, regulator actions, fines, sanctions, licence problems, and insolvency or ' +
    'winding-up proceedings, with dates and outcomes.',
  seed: (n) => `${n} lawsuit court case regulator fine penalty`,
};

const FINANCIAL = {
  id: 'financial',
  title: 'Financial Health',
  goal:
    'Whether the organisation can pay its bills and will still exist in a year: funding, revenue, ' +
    'profitability, layoffs, missed payroll, down rounds, insolvency.',
  seed: (n) => `${n} funding revenue layoffs financial results`,
};

const RECENT = {
  id: 'recent',
  title: 'Recent Developments',
  goal:
    'News from the last twelve months that could change the decision: leadership changes, acquisitions, ' +
    'layoffs, shutdowns, investigations.',
  seed: (n) => `${n} latest news`,
  search: { topic: 'news', timeRange: 'year' },
};

const PAYMENT = {
  id: 'payment',
  title: 'Payment Behaviour',
  goal:
    'Whether they pay the people they hire: reports of late or unpaid invoices from freelancers, contractors ' +
    'or vendors, payment disputes, chargebacks, small-claims cases.',
  seed: (n) => `${n} unpaid invoices late payment freelancers contractors`,
};

const DELIVERY = {
  id: 'delivery',
  title: 'Delivery Track Record',
  goal:
    'Whether they deliver what they sell: named clients, case studies, reviews on Clutch, G2 or Capterra, ' +
    'missed deadlines, failed projects, disputes with customers.',
  seed: (n) => `${n} clients case studies reviews`,
};

const OWNERSHIP = {
  id: 'ownership',
  title: 'Ownership & Leadership',
  goal:
    'Who owns and controls it, the backgrounds of founders and directors, their past ventures and how those ' +
    'ended, and any conflicts of interest.',
  seed: (n) => `${n} founders directors owners background previous companies`,
};

const PARTNERS = {
  id: 'partners',
  title: 'Track Record with Partners',
  goal:
    'How past partnerships, joint ventures and integrations went: public disputes, terminated partnerships, ' +
    'IP or exclusivity fights.',
  seed: (n) => `${n} partnership dispute terminated partner`,
};

const HIRING = {
  id: 'hiring',
  title: 'Recruiting Legitimacy',
  goal:
    "Whether an offer from them is likely real: the official careers page and hiring channels, and any reports " +
    "of recruitment scams using this company's name (upfront fees, messaging-app interviews, crypto or cheque " +
    'payments, look-alike domains). Scammers impersonating a company are a warning about fake offers, not ' +
    'evidence against the company itself; keep the two apart.',
  seed: (n) => `${n} recruitment scam fake job offer`,
};

const WORKPLACE = {
  id: 'workplace',
  title: 'Life as an Employee',
  goal:
    'What employees report: pay on time, workload, management, layoffs and attrition, from Glassdoor, ' +
    'AmbitionBox, Blind, Reddit and news.',
  seed: (n) => `${n} employee reviews glassdoor ambitionbox layoffs salary`,
};

export const INTENTS = {
  client: {
    label: 'Take them on as a client',
    action: 'take on this organisation as a client and do work for them on credit',
    sections: [IDENTITY, PAYMENT, FINANCIAL, LEGAL, REPUTATION],
  },
  vendor: {
    label: 'Hire them as a vendor',
    action: 'hire this organisation as a vendor or contractor and pay them',
    sections: [IDENTITY, DELIVERY, REPUTATION, LEGAL, FINANCIAL],
  },
  partner: {
    label: 'Partner with them',
    action: 'enter a business partnership with this organisation',
    sections: [IDENTITY, OWNERSHIP, PARTNERS, LEGAL, FINANCIAL],
  },
  employer: {
    label: 'Accept their job offer',
    action: 'accept a job offer from this organisation',
    sections: [IDENTITY, HIRING, WORKPLACE, FINANCIAL, RECENT],
  },
  general: {
    label: 'Just look them up',
    action: 'form a general view of this organisation',
    sections: [IDENTITY, BUSINESS, FINANCIAL, LEGAL, REPUTATION, RECENT],
  },
};

export function resolveIntent(id) {
  const key = INTENTS[id] ? id : 'general';
  return { id: key, ...INTENTS[key] };
}

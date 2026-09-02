export const SKILL_AREAS = [
  'Gastronomia', 'Direito', 'Contabilidade', 'TI', 'Marketing', 'Saúde', 'Educação', 'Construção', 'Culinária',
];

export const PROFICIENCY_LEVELS = [
  { value: 'beginner', labelKey: 'editProfile.levelBeginner' },
  { value: 'intermediate', labelKey: 'editProfile.levelIntermediate' },
  { value: 'advanced', labelKey: 'editProfile.levelAdvanced' },
  { value: 'specialist', labelKey: 'editProfile.levelSpecialist' },
];

export const LANGUAGE_OPTIONS = [
  'Português', 'English', 'Español', 'Deutsch', 'Français', 'Italiano',
];

export const BR_STATES: Record<string, string[]> = {
  BA: ['Salvador', 'Feira de Santana', 'Ilhéus'],
  SP: ['São Paulo', 'Campinas', 'Santos'],
  RJ: ['Rio de Janeiro', 'Niterói'],
  MG: ['Belo Horizonte', 'Uberlândia'],
  RS: ['Porto Alegre', 'Caxias do Sul'],
  PE: ['Recife', 'Olinda'],
};

export const FOREIGN_REGIONS: Record<string, { states: string[]; cities: Record<string, string[]> }> = {
  DE: { states: ['Berlin', 'Bavaria', 'Hamburg'], cities: { Berlin: ['Berlin'], Bavaria: ['Munich'], Hamburg: ['Hamburg'] } },
  US: { states: ['New York', 'California', 'Florida'], cities: { 'New York': ['New York City'], California: ['Los Angeles', 'San Francisco'], Florida: ['Miami'] } },
  PT: { states: ['Lisboa', 'Porto'], cities: { Lisboa: ['Lisboa'], Porto: ['Porto'] } },
  UK: { states: ['England'], cities: { England: ['London', 'Manchester'] } },
  CA: { states: ['Ontario', 'Quebec'], cities: { Ontario: ['Toronto'], Quebec: ['Montreal'] } },
  BR: { states: Object.keys(BR_STATES), cities: BR_STATES },
};

export type SocialLinks = {
  instagram?: string;
  linkedin?: string;
  facebook?: string;
  website?: string;
  public_email?: string;
  whatsapp?: string;
};

export const INTEREST_OPTIONS = [
  'meet_people',
  'find_services',
  'promote_business',
  'find_job',
  'buy_sell',
  'events',
  'help_exchange',
] as const;

export type InterestOption = (typeof INTEREST_OPTIONS)[number];


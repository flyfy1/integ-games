/**
 * Geo Quiz (slug capital-quiz) question bank, shared by the capital, flag and outline modes. Static, offline, and limited to uncontested current capitals.
 * Skipped on purpose: countries with split/disputed/recently changed capitals (e.g. Bolivia, South Africa,
 * Israel, Indonesia, Côte d'Ivoire, Benin, Tanzania, Sri Lanka, Yemen, Eswatini, Netherlands, Kosovo, Taiwan).
 *
 * Difficulty: 1 = widely known, 2 = known to a keen traveller or geography fan, 3 = genuinely tricky.
 */
import { SHAPE_ROWS } from './shapes';

export type Region = 'Europe' | 'Asia' | 'Africa' | 'North America' | 'South America' | 'Oceania';
export type Difficulty = 1 | 2 | 3;
export type CountryEntry = { country: string; capital: string; region: Region; difficulty: Difficulty; iso: string };

const E: Region = 'Europe', A: Region = 'Asia', F: Region = 'Africa', N: Region = 'North America', S: Region = 'South America', O: Region = 'Oceania';
// [country, capital, region, difficulty, ISO 3166-1 alpha-2]
const rows: ReadonlyArray<readonly [string, string, Region, Difficulty, string]> = [
  ['France', 'Paris', E, 1, 'FR'], ['Germany', 'Berlin', E, 1, 'DE'], ['Italy', 'Rome', E, 1, 'IT'], ['Spain', 'Madrid', E, 1, 'ES'],
  ['Portugal', 'Lisbon', E, 1, 'PT'], ['United Kingdom', 'London', E, 1, 'GB'], ['Ireland', 'Dublin', E, 1, 'IE'], ['Norway', 'Oslo', E, 1, 'NO'],
  ['Sweden', 'Stockholm', E, 1, 'SE'], ['Finland', 'Helsinki', E, 2, 'FI'], ['Denmark', 'Copenhagen', E, 1, 'DK'], ['Iceland', 'Reykjavik', E, 2, 'IS'],
  ['Poland', 'Warsaw', E, 1, 'PL'], ['Czechia', 'Prague', E, 1, 'CZ'], ['Austria', 'Vienna', E, 1, 'AT'], ['Switzerland', 'Bern', E, 2, 'CH'],
  ['Belgium', 'Brussels', E, 1, 'BE'], ['Greece', 'Athens', E, 1, 'GR'], ['Hungary', 'Budapest', E, 1, 'HU'], ['Romania', 'Bucharest', E, 2, 'RO'],
  ['Bulgaria', 'Sofia', E, 2, 'BG'], ['Serbia', 'Belgrade', E, 2, 'RS'], ['Croatia', 'Zagreb', E, 2, 'HR'], ['Slovenia', 'Ljubljana', E, 2, 'SI'],
  ['Slovakia', 'Bratislava', E, 2, 'SK'], ['Lithuania', 'Vilnius', E, 2, 'LT'], ['Latvia', 'Riga', E, 2, 'LV'], ['Estonia', 'Tallinn', E, 2, 'EE'],
  ['Ukraine', 'Kyiv', E, 1, 'UA'], ['Albania', 'Tirana', E, 3, 'AL'], ['North Macedonia', 'Skopje', E, 3, 'MK'], ['Malta', 'Valletta', E, 3, 'MT'],
  ['Luxembourg', 'Luxembourg City', E, 3, 'LU'], ['Moldova', 'Chisinau', E, 3, 'MD'], ['Belarus', 'Minsk', E, 2, 'BY'], ['Montenegro', 'Podgorica', E, 3, 'ME'],
  ['Bosnia and Herzegovina', 'Sarajevo', E, 2, 'BA'], ['Russia', 'Moscow', E, 1, 'RU'],

  ['Japan', 'Tokyo', A, 1, 'JP'], ['China', 'Beijing', A, 1, 'CN'], ['South Korea', 'Seoul', A, 1, 'KR'], ['North Korea', 'Pyongyang', A, 2, 'KP'],
  ['Mongolia', 'Ulaanbaatar', A, 3, 'MN'], ['India', 'New Delhi', A, 1, 'IN'], ['Pakistan', 'Islamabad', A, 2, 'PK'], ['Bangladesh', 'Dhaka', A, 2, 'BD'],
  ['Nepal', 'Kathmandu', A, 2, 'NP'], ['Bhutan', 'Thimphu', A, 3, 'BT'], ['Thailand', 'Bangkok', A, 1, 'TH'], ['Vietnam', 'Hanoi', A, 2, 'VN'],
  ['Laos', 'Vientiane', A, 3, 'LA'], ['Cambodia', 'Phnom Penh', A, 2, 'KH'], ['Malaysia', 'Kuala Lumpur', A, 2, 'MY'], ['Singapore', 'Singapore', A, 1, 'SG'],
  ['Philippines', 'Manila', A, 1, 'PH'], ['Myanmar', 'Naypyidaw', A, 3, 'MM'], ['Kazakhstan', 'Astana', A, 2, 'KZ'], ['Uzbekistan', 'Tashkent', A, 2, 'UZ'],
  ['Kyrgyzstan', 'Bishkek', A, 3, 'KG'], ['Tajikistan', 'Dushanbe', A, 3, 'TJ'], ['Turkmenistan', 'Ashgabat', A, 3, 'TM'], ['Afghanistan', 'Kabul', A, 2, 'AF'],
  ['Iran', 'Tehran', A, 1, 'IR'], ['Iraq', 'Baghdad', A, 1, 'IQ'], ['Saudi Arabia', 'Riyadh', A, 2, 'SA'], ['Jordan', 'Amman', A, 2, 'JO'],
  ['Lebanon', 'Beirut', A, 2, 'LB'], ['Syria', 'Damascus', A, 2, 'SY'], ['Turkey', 'Ankara', A, 2, 'TR'], ['Georgia', 'Tbilisi', A, 3, 'GE'],
  ['Armenia', 'Yerevan', A, 3, 'AM'], ['Azerbaijan', 'Baku', A, 2, 'AZ'], ['Qatar', 'Doha', A, 2, 'QA'], ['United Arab Emirates', 'Abu Dhabi', A, 2, 'AE'],
  ['Oman', 'Muscat', A, 3, 'OM'], ['Kuwait', 'Kuwait City', A, 2, 'KW'], ['Brunei', 'Bandar Seri Begawan', A, 3, 'BN'], ['Maldives', 'Malé', A, 3, 'MV'],
  ['Cyprus', 'Nicosia', A, 3, 'CY'], ['Bahrain', 'Manama', A, 3, 'BH'],

  ['Egypt', 'Cairo', F, 1, 'EG'], ['Morocco', 'Rabat', F, 2, 'MA'], ['Algeria', 'Algiers', F, 2, 'DZ'], ['Tunisia', 'Tunis', F, 2, 'TN'],
  ['Libya', 'Tripoli', F, 2, 'LY'], ['Senegal', 'Dakar', F, 2, 'SN'], ['Mali', 'Bamako', F, 3, 'ML'], ['Ghana', 'Accra', F, 2, 'GH'],
  ['Nigeria', 'Abuja', F, 2, 'NG'], ['Cameroon', 'Yaoundé', F, 3, 'CM'], ['Ethiopia', 'Addis Ababa', F, 2, 'ET'], ['Kenya', 'Nairobi', F, 1, 'KE'],
  ['Uganda', 'Kampala', F, 2, 'UG'], ['Rwanda', 'Kigali', F, 2, 'RW'], ['Democratic Republic of the Congo', 'Kinshasa', F, 3, 'CD'], ['Angola', 'Luanda', F, 3, 'AO'],
  ['Zambia', 'Lusaka', F, 3, 'ZM'], ['Zimbabwe', 'Harare', F, 3, 'ZW'], ['Mozambique', 'Maputo', F, 3, 'MZ'], ['Namibia', 'Windhoek', F, 3, 'NA'],
  ['Botswana', 'Gaborone', F, 3, 'BW'], ['Madagascar', 'Antananarivo', F, 3, 'MG'], ['Sudan', 'Khartoum', F, 2, 'SD'], ['Somalia', 'Mogadishu', F, 2, 'SO'],
  ['Niger', 'Niamey', F, 3, 'NE'], ['Chad', "N'Djamena", F, 3, 'TD'], ['Gabon', 'Libreville', F, 3, 'GA'], ['Mauritania', 'Nouakchott', F, 3, 'MR'],
  ['Liberia', 'Monrovia', F, 3, 'LR'], ['Sierra Leone', 'Freetown', F, 3, 'SL'], ['Malawi', 'Lilongwe', F, 3, 'MW'], ['Burkina Faso', 'Ouagadougou', F, 3, 'BF'],
  ['Eritrea', 'Asmara', F, 3, 'ER'], ['Djibouti', 'Djibouti', F, 3, 'DJ'], ['Cape Verde', 'Praia', F, 3, 'CV'], ['Togo', 'Lomé', F, 3, 'TG'],
  ['Guinea', 'Conakry', F, 3, 'GN'], ['Gambia', 'Banjul', F, 3, 'GM'], ['Lesotho', 'Maseru', F, 3, 'LS'],

  ['United States', 'Washington, D.C.', N, 1, 'US'], ['Canada', 'Ottawa', N, 1, 'CA'], ['Mexico', 'Mexico City', N, 1, 'MX'], ['Cuba', 'Havana', N, 1, 'CU'],
  ['Jamaica', 'Kingston', N, 2, 'JM'], ['Haiti', 'Port-au-Prince', N, 3, 'HT'], ['Dominican Republic', 'Santo Domingo', N, 2, 'DO'], ['Guatemala', 'Guatemala City', N, 2, 'GT'],
  ['Costa Rica', 'San José', N, 2, 'CR'], ['Panama', 'Panama City', N, 2, 'PA'], ['Honduras', 'Tegucigalpa', N, 3, 'HN'], ['Nicaragua', 'Managua', N, 3, 'NI'],
  ['El Salvador', 'San Salvador', N, 2, 'SV'], ['Belize', 'Belmopan', N, 3, 'BZ'], ['Bahamas', 'Nassau', N, 2, 'BS'], ['Barbados', 'Bridgetown', N, 3, 'BB'],
  ['Trinidad and Tobago', 'Port of Spain', N, 3, 'TT'],

  ['Brazil', 'Brasília', S, 1, 'BR'], ['Argentina', 'Buenos Aires', S, 1, 'AR'], ['Chile', 'Santiago', S, 1, 'CL'], ['Peru', 'Lima', S, 1, 'PE'],
  ['Colombia', 'Bogotá', S, 1, 'CO'], ['Venezuela', 'Caracas', S, 2, 'VE'], ['Ecuador', 'Quito', S, 2, 'EC'], ['Paraguay', 'Asunción', S, 3, 'PY'],
  ['Uruguay', 'Montevideo', S, 2, 'UY'], ['Guyana', 'Georgetown', S, 3, 'GY'], ['Suriname', 'Paramaribo', S, 3, 'SR'],

  ['Australia', 'Canberra', O, 1, 'AU'], ['New Zealand', 'Wellington', O, 1, 'NZ'], ['Fiji', 'Suva', O, 3, 'FJ'], ['Papua New Guinea', 'Port Moresby', O, 3, 'PG'],
  ['Samoa', 'Apia', O, 3, 'WS'], ['Tonga', "Nuku'alofa", O, 3, 'TO'], ['Vanuatu', 'Port Vila', O, 3, 'VU'], ['Solomon Islands', 'Honiara', O, 3, 'SB'],
];

export const COUNTRIES: readonly CountryEntry[] = rows.map(([country, capital, region, difficulty, iso]) => ({ country, capital, region, difficulty, iso }));

/** Flag emoji from an ISO 3166-1 alpha-2 code (regional indicator symbols). */
export const flagEmoji = (iso: string): string => String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));

export const REGION_COLORS: Record<Region, string> = {
  Europe: '#59C9FF', Asia: '#FF9F6E', Africa: '#FFDA74', 'North America': '#70F0C2', 'South America': '#8EE58C', Oceania: '#B18CFF',
};

/** Countries that have a silhouette in shapes.ts, with the outline difficulty (not the capital difficulty). */
export type ShapeEntry = CountryEntry & { path: string };
const byIso = new Map(COUNTRIES.map((c) => [c.iso, c]));
export const SHAPE_COUNTRIES: readonly ShapeEntry[] = SHAPE_ROWS.map(([iso, difficulty, path]) => {
  const c = byIso.get(iso);
  if (!c) throw new Error(`Outline ${iso} has no matching country`);
  return { ...c, difficulty, path };
});

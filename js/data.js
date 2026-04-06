'use strict';

const TOTAL_EVENTS = 8;

// Pisteytystaulukko (sijoitus 1–15)
const POINTS_TABLE = [
  100, 90, 82, 74, 67, 60, 54, 48, 42, 36, 30, 24, 18, 12, 6
];

// Seuraava osakilpailu
const NEXT_COMPETITION = {
  id: 3560637,
  name: 'Meilahti',
  fullName: 'MP Pro Tour 2026 – Meilahti',
  course: 'Meilahti → 16',
  location: 'Helsinki, Uusimaa',
  par: 48,
  holes: 16,
  courseRatingValue: 13.49,
  registrationEnd: '2026-04-30',
  url: 'https://discgolfmetrix.com/3560637',
  registerUrl: 'https://discgolfmetrix.com/?u=register_add&ID=3560637',
  registered: [
    'Markus Kotiranta',
    'Erno Ekebom',
    'Viljami Julkunen',
    'Joonas Korpilaakso',
    'Tomi S',
    'Petri Haukka',
    'Antti Karjakin',
    'Jukka Vesa'
  ]
};

// Osakilpailut — lisää uusi kilpailu tähän listaan kauden edetessä.
// Jokainen result:
//   place    — HC-sijoitus (null = DNF)
//   name     — pelaajan nimi
//   rating   — Metrix-rating
//   throws   — raakaheittomäärä (null = DNF)
//   hc       — tasoitus (HC)
//   hcScore  — tasoitettu tulos throws − hc (null = DNF)
// Sijoitukset laskettu Metrix HC-tulosnäkymästä (pienin hcScore = 1.)
const COMPETITIONS = [
  {
    id: 3447716,
    name: 'Talma',
    fullName: 'MP Pro Tour 2025 – Talma',
    date: '2025-09-30',
    course: 'Talma Discgolfpark 2023',
    location: 'Sipoo, Uusimaa',
    par: 59,
    holes: 18,
    url: 'https://discgolfmetrix.com/3447716',
    results: [
      { place: 1,  name: 'Saku',               rating: 718, throws: 66, hc: 25.41, hcScore: 40.59 },
      { place: 2,  name: 'Tuomas Kotiranta',   rating: 719, throws: 70, hc: 25.32, hcScore: 44.68 },
      { place: 3,  name: 'Petteri Stedt',      rating: 647, throws: 79, hc: 31.80, hcScore: 47.20 },
      { place: 4,  name: 'Markus Kotiranta',   rating: 782, throws: 69, hc: 19.64, hcScore: 49.36 },
      { place: 5,  name: 'Joonas Korpilaakso', rating: 809, throws: 69, hc: 17.21, hcScore: 51.79 },
      { place: 6,  name: 'Otto Syvähuoko',     rating: 843, throws: 66, hc: 14.14, hcScore: 51.86 },
      { place: 6,  name: 'Erno Ekebom',        rating: 843, throws: 66, hc: 14.14, hcScore: 51.86 },
      { place: 8,  name: 'Tomi S',             rating: 755, throws: 74, hc: 22.07, hcScore: 51.93 },
      { place: 9,  name: 'Jukka Vesa',         rating: 935, throws: 60, hc:  5.86, hcScore: 54.14 },
      { place: 10, name: 'Kari Tauriainen',    rating: 681, throws: 83, hc: 28.74, hcScore: 54.26 },
      { place: 11, name: 'Petri Haukka',       rating: 749, throws: 78, hc: 22.61, hcScore: 55.39 },
      { place: 12, name: 'Antti Karjakin',     rating: 894, throws: 65, hc:  9.55, hcScore: 55.45 },
      { place: 13, name: 'Viljami Julkunen',   rating: 716, throws: 83, hc: 25.59, hcScore: 57.41 },
      { place: 14, name: 'Wili Vuorinen',      rating: 645, throws: 94, hc: 31.98, hcScore: 62.02 },
    ]
  },
  {
    id: 3480511,
    name: 'Nummelanharju',
    fullName: 'MP Pro Tour 2025 – Nummelanharju',
    date: '2025-11-09',
    course: 'Nummelanharjun Frisbeegolfrata',
    location: 'Vihti, Uusimaa',
    par: 57,
    holes: 18,
    url: 'https://discgolfmetrix.com/3480511',
    results: [
      { place: 1,    name: 'Tomi S',             rating: 753, throws: 67, hc: 20.58, hcScore: 46.42 },
      { place: 2,    name: 'Viljami Julkunen',   rating: 716, throws: 73, hc: 23.67, hcScore: 49.33 },
      { place: 3,    name: 'Tuomas Kotiranta',   rating: 722, throws: 73, hc: 23.17, hcScore: 49.83 },
      { place: 4,    name: 'Erno Ekebom',        rating: 841, throws: 64, hc: 13.25, hcScore: 50.75 },
      { place: 5,    name: 'Petri Haukka',       rating: 743, throws: 73, hc: 21.42, hcScore: 51.58 },
      { place: 6,    name: 'Joonas Korpilaakso', rating: 810, throws: 68, hc: 15.83, hcScore: 52.17 },
      { place: 6,    name: 'Kari Tauriainen',    rating: 678, throws: 79, hc: 26.83, hcScore: 52.17 },
      { place: 8,    name: 'Jukka Vesa',         rating: 932, throws: 60, hc:  5.67, hcScore: 54.33 },
      { place: 9,    name: 'Otto Syvähuoko',     rating: 843, throws: 68, hc: 13.08, hcScore: 54.92 },
      { place: 10,   name: 'Markus Kotiranta',   rating: 792, throws: 73, hc: 17.33, hcScore: 55.67 },
      { place: 11,   name: 'JB Poupon',          rating: 776, throws: 77, hc: 18.67, hcScore: 58.33 },
      { place: 11,   name: 'Antti Karjakin',     rating: 896, throws: 67, hc:  8.67, hcScore: 58.33 },
      { place: null, name: 'Wili Vuorinen',      rating: 645, throws: null, hc: null, hcScore: null },
      { place: null, name: 'Saku',               rating: 718, throws: null, hc: null, hcScore: null },
      { place: null, name: 'Petteri Stedt',      rating: 647, throws: null, hc: null, hcScore: null },
    ]
  }
];

// --- Kausi 2025 (arkisto) ---
const TOTAL_EVENTS_2025 = 8;

// Final 2025 standings (hardcoded — custom points system used that season)
const STANDINGS_2025_FINAL = [
  { rank: 1,  name: 'Maké',     points: 617 },
  { rank: 2,  name: 'Antti',    points: 567 },
  { rank: 3,  name: 'Tomi S',   points: 553 },
  { rank: 4,  name: 'Petteri',  points: 525 },
  { rank: 5,  name: 'Iker',     points: 519 },
  { rank: 6,  name: 'Jukka Vee',points: 519 },
  { rank: 7,  name: 'Erno',     points: 511 },
  { rank: 8,  name: 'Tume',     points: 450 },
  { rank: 9,  name: 'Joonas',   points: 385 },
  { rank: 10, name: 'Petri',    points: 383 },
  { rank: 11, name: 'Wili',     points: 204 },
  { rank: 12, name: 'Otto',     points: 145 },
  { rank: 13, name: 'JayBee',   points: 66  },
  { rank: 14, name: 'Saku',     points: 51  },
];

const COMPETITIONS_2025 = [
  {
    id: 3265280,
    name: 'Loviisa 21',
    fullName: 'MP Pro Tour 2025 – Loviisa 21',
    date: '2025-05-31',
    course: 'Loviisan Frisbeegolfrata – Loviisa 21',
    location: 'Loviisa',
    url: 'https://discgolfmetrix.com/3265280',
    results: [
      { place: 1,  name: 'Jukka Vesa',         rating: 935, throws: 65,  hcScore: 58.68 },
      { place: 2,  name: 'Joonas Korpilaakso', rating: 811, throws: 79,  hcScore: 60.61 },
      { place: 3,  name: 'Erno Ekebom',        rating: 835, throws: 81,  hcScore: 64.95 },
      { place: 3,  name: 'Antti Karjakin',     rating: 875, throws: 81,  hcScore: 68.84 },
      { place: 5,  name: 'Markus Kotiranta',   rating: 768, throws: 85,  hcScore: 62.43 },
      { place: 6,  name: 'Petri Haukka',       rating: 770, throws: 86,  hcScore: 63.63 },
      { place: 7,  name: 'Tuomas Kotiranta',   rating: 740, throws: 87,  hcScore: 61.71 },
      { place: 8,  name: 'Tomi S',             rating: 738, throws: 88,  hcScore: 62.51 },
      { place: 9,  name: 'Viljami Julkunen',   rating: 724, throws: 91,  hcScore: 64.15 },
      { place: 10, name: 'Petteri Stedt',      rating: 615, throws: 101, hcScore: 63.55 },
    ]
  },
  {
    id: 3265283,
    name: 'Paloheinä',
    fullName: 'MP Pro Tour 2025 – Paloheinä',
    date: '2025-05-31',
    course: 'Paloheinän Frisbeegolfrata 18',
    location: 'Helsinki',
    url: 'https://discgolfmetrix.com/3265283',
    results: [
      { place: 1,  name: 'Jukka Vesa',         rating: 935, throws: 50, hcScore: 44.58 },
      { place: 2,  name: 'Antti Karjakin',     rating: 875, throws: 52, hcScore: 41.58 },
      { place: 3,  name: 'Erno Ekebom',        rating: 835, throws: 55, hcScore: 41.25 },
      { place: 4,  name: 'Markus Kotiranta',   rating: 768, throws: 59, hcScore: 39.67 },
      { place: 5,  name: 'Joonas Korpilaakso', rating: 811, throws: 60, hcScore: 44.25 },
      { place: 6,  name: 'Viljami Julkunen',   rating: 724, throws: 64, hcScore: 41.00 },
      { place: 7,  name: 'JB Poupon',          rating: 778, throws: 65, hcScore: 46.50 },
      { place: 8,  name: 'Tomi S',             rating: 738, throws: 66, hcScore: 44.17 },
      { place: 8,  name: 'Tuomas Kotiranta',   rating: 740, throws: 66, hcScore: 44.33 },
      { place: 10, name: 'Petri Haukka',       rating: 770, throws: 70, hcScore: 50.83 },
      { place: 11, name: 'Petteri Stedt',      rating: 615, throws: 71, hcScore: 38.92 },
    ]
  },
  {
    id: 3351834,
    name: 'Tammela',
    fullName: 'MP Pro Tour 2025 – Tammela',
    date: '2025-06-30',
    course: 'Tammela Discgolfpark 18',
    location: 'Tammela',
    url: 'https://discgolfmetrix.com/3351834',
    results: [
      { place: 1,  name: 'Jukka Vesa',         rating: 935, throws: 53, hcScore: 47.59 },
      { place: 2,  name: 'Antti Karjakin',     rating: 866, throws: 58, hcScore: 46.84 },
      { place: 3,  name: 'Erno Ekebom',        rating: 837, throws: 65, hcScore: 51.43 },
      { place: 4,  name: 'Markus Kotiranta',   rating: 770, throws: 67, hcScore: 47.85 },
      { place: 5,  name: 'Tuomas Kotiranta',   rating: 739, throws: 70, hcScore: 48.27 },
      { place: 6,  name: 'Tomi S',             rating: 744, throws: 72, hcScore: 50.68 },
      { place: 7,  name: 'Petteri Stedt',      rating: 626, throws: 76, hcScore: 44.86 },
      { place: 8,  name: 'Petri Haukka',       rating: 748, throws: 77, hcScore: 56.02 },
      { place: 9,  name: 'Viljami Julkunen',   rating: 720, throws: 78, hcScore: 54.69 },
      { place: 10, name: 'Wili Vuorinen',      rating: 663, throws: 97, hcScore: 68.94 },
    ]
  },
  {
    id: 3359594,
    name: 'Loppi',
    fullName: 'MP Pro Tour 2025 – Loppi',
    date: '2025-07-28',
    course: 'Loppi Discgolfpark',
    location: 'Loppi',
    url: 'https://discgolfmetrix.com/3359594',
    results: [
      { place: 1,  name: 'Jukka Vesa',         rating: 937, throws: 60, hcScore: 54.75 },
      { place: 2,  name: 'Antti Karjakin',     rating: 887, throws: 62, hcScore: 52.58 },
      { place: 3,  name: 'Erno Ekebom',        rating: 839, throws: 66, hcScore: 52.58 },
      { place: 4,  name: 'Markus Kotiranta',   rating: 773, throws: 68, hcScore: 49.08 },
      { place: 5,  name: 'Viljami Julkunen',   rating: 718, throws: 72, hcScore: 48.50 },
      { place: 6,  name: 'Tuomas Kotiranta',   rating: 738, throws: 73, hcScore: 51.17 },
      { place: 7,  name: 'Joonas Korpilaakso', rating: 812, throws: 77, hcScore: 61.33 },
      { place: 8,  name: 'Tomi S',             rating: 742, throws: 78, hcScore: 56.50 },
      { place: 8,  name: 'Petri Haukka',       rating: 746, throws: 78, hcScore: 56.83 },
      { place: 10, name: 'Petteri Stedt',      rating: 639, throws: 85, hcScore: 54.92 },
      { place: 11, name: 'Wili Vuorinen',      rating: 656, throws: 91, hcScore: 62.33 },
    ]
  },
  {
    id: 3368566,
    name: 'Rock Valley Pro',
    fullName: 'MP Pro Tour 2025 – Rock Valley Pro',
    date: '2025-08-30',
    course: 'Rock Valley Premium Disc Golf Resort – Pro',
    location: 'Iitti',
    url: 'https://discgolfmetrix.com/3368566',
    results: [
      { place: 1,  name: 'Jukka Vesa',         rating: 936, throws: 78,  hcScore: 72.10 },
      { place: 2,  name: 'Antti Karjakin',     rating: 888, throws: 83,  hcScore: 72.68 },
      { place: 2,  name: 'Otto Syvähuoko',     rating: 833, throws: 83,  hcScore: 67.61 },
      { place: 4,  name: 'Markus Kotiranta',   rating: 779, throws: 84,  hcScore: 63.63 },
      { place: 5,  name: 'Joonas Korpilaakso', rating: 812, throws: 89,  hcScore: 71.67 },
      { place: 6,  name: 'Erno Ekebom',        rating: 840, throws: 90,  hcScore: 75.25 },
      { place: 7,  name: 'Tomi S',             rating: 744, throws: 91,  hcScore: 67.41 },
      { place: 8,  name: 'Saku',               rating: 830, throws: 98,  hcScore: 82.33 },
      { place: 8,  name: 'Tuomas Kotiranta',   rating: 736, throws: 98,  hcScore: 73.67 },
      { place: 10, name: 'Petteri Stedt',      rating: 637, throws: 101, hcScore: 67.54 },
      { place: 10, name: 'Viljami Julkunen',   rating: 721, throws: 101, hcScore: 75.29 },
      { place: 12, name: 'Petri Haukka',       rating: 745, throws: 105, hcScore: 81.50 },
      { place: 13, name: 'Wili Vuorinen',      rating: 649, throws: 132, hcScore: 99.65 },
    ]
  },
  {
    id: 3368568,
    name: 'Rock Valley Ama',
    fullName: 'MP Pro Tour 2025 – Rock Valley Amateur',
    date: '2025-08-30',
    course: 'Rock Valley Premium Disc Golf Resort – Amateur',
    location: 'Iitti',
    url: 'https://discgolfmetrix.com/3368568',
    results: [
      { place: 1,  name: 'Jukka Vesa',         rating: 935, throws: 64,  hcScore: 58.59 },
      { place: 2,  name: 'Antti Karjakin',     rating: 889, throws: 68,  hcScore: 58.76 },
      { place: 3,  name: 'Erno Ekebom',        rating: 837, throws: 69,  hcScore: 55.43 },
      { place: 4,  name: 'Otto Syvähuoko',     rating: 837, throws: 73,  hcScore: 59.43 },
      { place: 5,  name: 'Viljami Julkunen',   rating: 715, throws: 77,  hcScore: 53.27 },
      { place: 6,  name: 'Tomi S',             rating: 756, throws: 80,  hcScore: 59.68 },
      { place: 7,  name: 'Markus Kotiranta',   rating: 789, throws: 82,  hcScore: 64.43 },
      { place: 8,  name: 'Petri Haukka',       rating: 745, throws: 86,  hcScore: 64.77 },
      { place: 9,  name: 'Petteri Stedt',      rating: 640, throws: 87,  hcScore: 57.02 },
      { place: 10, name: 'Tuomas Kotiranta',   rating: 729, throws: 90,  hcScore: 67.44 },
      { place: 11, name: 'Saku',               rating: 830, throws: 93,  hcScore: 78.85 },
      { place: 12, name: 'Wili Vuorinen',      rating: 645, throws: 105, hcScore: 75.44 },
    ]
  },
  {
    id: 3447716,
    name: 'Talma',
    fullName: 'MP Pro Tour 2025 – Talma',
    date: '2025-09-30',
    course: 'Talma Discgolfpark 2023',
    location: 'Sipoo',
    url: 'https://discgolfmetrix.com/3447716',
    results: [
      { place: 1,  name: 'Jukka Vesa',         rating: 935, throws: 60, hcScore: 54.14 },
      { place: 2,  name: 'Antti Karjakin',     rating: 894, throws: 65, hcScore: 55.45 },
      { place: 3,  name: 'Erno Ekebom',        rating: 843, throws: 66, hcScore: 51.86 },
      { place: 3,  name: 'Otto Syvähuoko',     rating: 843, throws: 66, hcScore: 51.86 },
      { place: 3,  name: 'Saku',               rating: 718, throws: 66, hcScore: 40.59 },
      { place: 6,  name: 'Markus Kotiranta',   rating: 782, throws: 69, hcScore: 49.36 },
      { place: 6,  name: 'Joonas Korpilaakso', rating: 809, throws: 69, hcScore: 51.79 },
      { place: 8,  name: 'Tuomas Kotiranta',   rating: 719, throws: 70, hcScore: 44.68 },
      { place: 9,  name: 'Tomi S',             rating: 755, throws: 74, hcScore: 51.93 },
      { place: 10, name: 'Petri Haukka',       rating: 749, throws: 78, hcScore: 55.39 },
      { place: 11, name: 'Petteri Stedt',      rating: 647, throws: 79, hcScore: 47.20 },
      { place: 12, name: 'Kari Tauriainen',    rating: 681, throws: 83, hcScore: 54.26 },
      { place: 13, name: 'Viljami Julkunen',   rating: 716, throws: 83, hcScore: 57.41 },
      { place: 14, name: 'Wili Vuorinen',      rating: 645, throws: 94, hcScore: 62.02 },
    ]
  },
  {
    id: 3480511,
    name: 'Nummelanharju',
    fullName: 'MP Pro Tour 2025 – Nummelanharju',
    date: '2025-11-09',
    course: 'Nummelanharjun Frisbeegolfrata',
    location: 'Vihti',
    url: 'https://discgolfmetrix.com/3480511',
    results: [
      { place: 1,    name: 'Jukka Vesa',         rating: 932, throws: 60, hcScore: 54.33 },
      { place: 2,    name: 'Erno Ekebom',         rating: 841, throws: 64, hcScore: 50.75 },
      { place: 3,    name: 'Antti Karjakin',      rating: 896, throws: 67, hcScore: 58.33 },
      { place: 3,    name: 'Tomi S',              rating: 753, throws: 67, hcScore: 46.42 },
      { place: 5,    name: 'Joonas Korpilaakso',  rating: 810, throws: 68, hcScore: 52.17 },
      { place: 5,    name: 'Otto Syvähuoko',      rating: 843, throws: 68, hcScore: 54.92 },
      { place: 7,    name: 'Petri Haukka',        rating: 743, throws: 73, hcScore: 51.58 },
      { place: 7,    name: 'Tuomas Kotiranta',    rating: 722, throws: 73, hcScore: 49.83 },
      { place: 7,    name: 'Markus Kotiranta',    rating: 792, throws: 73, hcScore: 55.67 },
      { place: 7,    name: 'Viljami Julkunen',    rating: 716, throws: 73, hcScore: 49.33 },
      { place: 11,   name: 'JB Poupon',           rating: 776, throws: 77, hcScore: 58.33 },
      { place: 12,   name: 'Kari Tauriainen',     rating: 678, throws: 79, hcScore: 52.17 },
      { place: null, name: 'Wili Vuorinen',       rating: 645, throws: null, hcScore: null },
      { place: null, name: 'Saku',                rating: 718, throws: null, hcScore: null },
      { place: null, name: 'Petteri Stedt',       rating: 647, throws: null, hcScore: null },
    ]
  },
];

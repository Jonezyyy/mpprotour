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
  registrationEnd: '2026-04-30',
  url: 'https://discgolfmetrix.com/3560637',
  registerUrl: 'https://discgolfmetrix.com/?u=register_add&ID=3560637',
  registered: [
    'Jukka Vesa',
    'Antti Karjakin',
    'Petri Haukka',
    'Tomi S',
    'Joonas Korpilaakso'
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

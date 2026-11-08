import type { Game, GameSummary } from './types'

// Hardcoded games. PINs are fixed and reused every session; the host resets the room between runs.
// Hardcoded games. PINs are fixed and reused every session; the host resets the room between runs.
export const GAMES: Game[] = [
  {
    id: 'trida-3a',
    pin: '53186',
    title: 'Kvíz pro 3.A',
    questions: [
      {
        text: 'Na jakou stranu směřuje polopřímka ⟼KE?',
        image: '/img/poloprimka-ke.svg',
        answers: ['Doleva', 'Doprava', 'Nahoru', 'Dolů'],
        correctIndex: 1,
        timeLimitSec: 30,
      },
      {
        // Final consonant is devoiced in speech ([hrat]), so it cannot be heard.
        text: 'Doplň písmeno: HRA_',
        answers: ['T', 'D'],
        correctIndex: 1,
        timeLimitSec: 30,
      },
      {
        text: 'Ve kterém slově je chyba?',
        answers: ['hrad', 'mráz', 'zup', 'chléb'],
        correctIndex: 2,
        timeLimitSec: 30,
      },
      {
        text: 'Petřík dostal pod stromeček 19 dárků. Jeho mladší sestřička Anička dostala o 3 dárky více než Petřík. Kolik dárků dostala pod stromeček Anička?',
        answers: ['16', '19', '22', '3'],
        correctIndex: 2,
        timeLimitSec: 45,
      },
      {
        text: '5 + 42 : 6 =',
        answers: ['12', '7', '13', '47'],
        correctIndex: 0,
        timeLimitSec: 30,
      },
      {
        text: '3 + 15 − 10 + 3 =',
        answers: ['5', '10', '11', '21'],
        correctIndex: 2,
        timeLimitSec: 30,
      },
      {
        text: 'Kdo napsal a ilustroval knížku Dášeňka čili život štěněte?',
        answers: ['Josef Lada', 'Karel Čapek', 'Ondřej Sekora', 'Zdeněk Miler'],
        correctIndex: 1,
        timeLimitSec: 30,
      },
      {
        text: 'Olej se ve vodě rozpustí.',
        answers: ['Pravda', 'Lež'],
        correctIndex: 1,
        timeLimitSec: 20,
      },
      {
        text: 'Patří borůvka, třešeň a rybíz do stejného druhu plodů?',
        answers: ['Ano', 'Ne'],
        correctIndex: 1,
        timeLimitSec: 30,
      },
    ],
  },
]

export function findGameByPin(pin: string): Game | undefined {
  return GAMES.find((g) => g.pin === pin)
}

export function findGameById(id: string): Game | undefined {
  return GAMES.find((g) => g.id === id)
}

export function gameSummaries(): GameSummary[] {
  return GAMES.map((g) => ({ id: g.id, pin: g.pin, title: g.title, questionCount: g.questions.length }))
}

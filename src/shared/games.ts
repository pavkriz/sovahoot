import type { Game, GameSummary } from './types'

const DEFAULT_LIMIT = 20

// Hardcoded games. PINs are fixed and reused every session; the host resets the room between runs.
export const GAMES: Game[] = [
  {
    id: 'sovy',
    pin: '1234',
    title: 'Sovy a příroda',
    questions: [
      {
        text: 'Jak se jmenuje největší sova žijící v Česku?',
        answers: ['Výr velký', 'Puštík obecný', 'Kalous ušatý', 'Sýček obecný'],
        correctIndex: 0,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'Kolik krčních obratlů má sova?',
        answers: ['7', '14', '24', '33'],
        correctIndex: 1,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'Která sova byla atributem bohyně Athény a symbolem moudrosti?',
        answers: ['Výr velký', 'Sova pálená', 'Sýček obecný', 'Puštík obecný'],
        correctIndex: 2,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'Díky čemu sovy létají téměř neslyšně?',
        answers: ['Hřebínkům na okrajích letek', 'Létají jen ve větru', 'Velmi malým křídlům', 'Nelétají, skáčou'],
        correctIndex: 0,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'Co sovy po jídle vyvrhují?',
        answers: ['Peří', 'Vývržky z kostí a srsti', 'Skořápky', 'Nic'],
        correctIndex: 1,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'O kolik stupňů dokáže sova otočit hlavu?',
        answers: ['Asi 90°', 'Asi 180°', 'Asi 270°', 'Celých 360°'],
        correctIndex: 2,
        timeLimitSec: DEFAULT_LIMIT,
      },
    ],
  },
  {
    id: 'prehled',
    pin: '5678',
    title: 'Všeobecný přehled',
    questions: [
      {
        text: 'Jaké je hlavní město Austrálie?',
        answers: ['Sydney', 'Melbourne', 'Perth', 'Canberra'],
        correctIndex: 3,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'Kolik je 7 × 8?',
        answers: ['54', '64', '56', '58'],
        correctIndex: 2,
        timeLimitSec: 10,
      },
      {
        text: 'Která řeka je v Česku nejdelší?',
        answers: ['Labe', 'Morava', 'Vltava', 'Ohře'],
        correctIndex: 2,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'Jaká je chemická značka zlata?',
        answers: ['Au', 'Ag', 'Fe', 'Zn'],
        correctIndex: 0,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'Kdo napsal Babičku?',
        answers: ['Alois Jirásek', 'Karel Čapek', 'Jan Neruda', 'Božena Němcová'],
        correctIndex: 3,
        timeLimitSec: DEFAULT_LIMIT,
      },
      {
        text: 'Která planeta sluneční soustavy je největší?',
        answers: ['Saturn', 'Neptun', 'Jupiter', 'Země'],
        correctIndex: 2,
        timeLimitSec: DEFAULT_LIMIT,
      },
    ],
  },
  {
    id: 'trida-3a',
    pin: '3333',
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
  {
    id: 'test',
    pin: '0000',
    title: 'Rychlý test (2 otázky)',
    questions: [
      {
        text: 'Jakou barvu má nebe za jasného dne?',
        answers: ['Modrou', 'Zelenou'],
        correctIndex: 0,
        timeLimitSec: 15,
      },
      {
        text: 'Kolik nohou má pavouk?',
        answers: ['6', '8', '10'],
        correctIndex: 1,
        timeLimitSec: 15,
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

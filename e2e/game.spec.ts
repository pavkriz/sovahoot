import { expect, test, type Browser, type Page } from '@playwright/test'
import { GAMES } from '../src/shared/games'

// Data-driven: plays the first hardcoded game, whatever its questions are.
const GAME = GAMES[0]!
const PIN = GAME.pin
const LAST = GAME.questions.length - 1
const correct = (i: number) => GAME.questions[i]!.correctIndex
const wrong = (i: number) => (correct(i) + 1) % GAME.questions[i]!.answers.length
const PASSWORD = process.env.HOST_PASSWORD ?? 'sovahoot'

async function openHost(browser: Browser): Promise<Page> {
  const page = await browser.newPage()
  await page.goto('/host')
  await page.getByTestId('host-password').fill(PASSWORD)
  await page.getByTestId('host-login').click()
  await page.getByTestId(`game-${GAME.id}`).click()
  await expect(page.locator('main')).toHaveAttribute('data-phase', /lobby|question|reveal|leaderboard|podium/)
  // Local Durable Object storage survives between runs: always start from an empty lobby.
  const phase = await page.locator('main').getAttribute('data-phase')
  const count = await page.getByTestId('player-chip').count()
  if (phase !== 'lobby' || count > 0) {
    page.once('dialog', (d) => d.accept())
    await page.getByTestId('reset-button').click()
  }
  await expect(page.getByTestId('lobby-pin')).toHaveText(PIN)
  await expect(page.getByTestId('player-count')).toHaveText('Hráčů: 0')
  return page
}

async function joinAsPlayer(browser: Browser, nickname: string, avatar?: { character: number; hat: number }): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByTestId('pin-input').fill(PIN)
  await page.getByTestId('nickname-input').fill(nickname)
  if (avatar) {
    await page.getByTestId(`avatar-character-${avatar.character}`).click()
    await page.getByTestId(`avatar-hat-${avatar.hat}`).click()
  }
  await page.getByTestId('join-button').click()
  await expect(page.getByTestId('my-nickname')).toHaveText(nickname)
  return page
}

test('host and two players play a whole game, one player reloads mid-question', async ({ browser }) => {
  const host = await openHost(browser)
  const alice = await joinAsPlayer(browser, 'Alice', { character: 1, hat: 1 }) // 🦊 with 👑
  const bob = await joinAsPlayer(browser, 'Bob')
  await expect(host.getByTestId('player-count')).toHaveText('Hráčů: 2')
  const aliceChip = host.getByTestId('player-chip').filter({ hasText: 'Alice' })
  await expect(aliceChip).toContainText('🦊')
  await expect(aliceChip).toContainText('👑')

  await host.getByTestId('start-button').click()
  await expect(host.getByTestId('countdown')).toBeVisible()

  for (let i = 0; i <= LAST; i++) {
    const q = GAME.questions[i]!
    await expect(alice.getByTestId('question-text')).toHaveText(q.text)

    if (i === 1) {
      // Alice's phone "dies" mid-question: a reload must restore her seat and the running question.
      await alice.reload()
      await expect(alice.getByTestId('question-text')).toHaveText(q.text)
      await expect(alice.getByTestId('connection-status')).toHaveText('Připojeno')
      await expect(host.getByTestId('answered-count')).toHaveText('Odpovědělo 0 z 2')
    }

    await alice.getByTestId(`answer-${correct(i)}`).click()
    if (i === 0) {
      await expect(alice.getByTestId('answered')).toBeVisible()
      await expect(host.getByTestId('answered-count')).toHaveText('Odpovědělo 1 z 2')
    }
    await bob.getByTestId(`answer-${wrong(i)}`).click()
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'reveal')

    if (i === 0) {
      await expect(alice.getByTestId('result')).toContainText('Správně')
      await expect(bob.getByTestId('result')).toContainText('špatně')
      const aliceGain = Number((await alice.getByTestId('gain').textContent())?.replace('+', ''))
      expect(aliceGain).toBeGreaterThan(0)
      await host.getByTestId('next-button').click() // → leaderboard
      await expect(alice.getByTestId('my-rank')).toHaveText('1. místo')
      await expect(host.getByTestId('leaderboard')).toContainText('Alice')
      await host.getByTestId('next-button').click() // → next question
    } else if (i < LAST) {
      await expect(host.getByTestId('skip-button')).toContainText('Další otázka')
      await host.getByTestId('skip-button').click() // → next question, no leaderboard
    } else {
      await expect(host.getByTestId('skip-button')).toContainText('Vyhlásit výsledky')
      await host.getByTestId('skip-button').click() // → podium
    }
  }

  await expect(host.getByTestId('podium')).toContainText('Alice')
  await expect(host.getByTestId('podium')).toContainText('🦊')
  await expect(host.getByTestId('podium-slot')).toHaveCount(3) // three steps even with two players
  await expect(host.locator('[data-testid=podium-slot][data-empty]')).toHaveCount(1)
  await expect(alice.getByTestId('final-rank')).toContainText('1. místo')
  await expect(bob.getByTestId('final-rank')).toContainText('2. místo')
  await expect(alice.locator('main')).toContainText('Tvůj výsledek')
  await expect(alice.locator('main')).toContainText('Stupně vítězů')

  // Results landed in D1 and show up in the history page.
  const history = await browser.newPage()
  await history.goto('/history')
  const latest = history.getByTestId('history-session').first()
  await expect(latest).toContainText(GAME.title)
  await expect(latest).toContainText('Alice')
  await expect(latest).toContainText('Bob')

  // Reset for the next session.
  host.once('dialog', (d) => d.accept())
  await host.getByTestId('reset-button').click()
  await expect(host.getByTestId('player-count')).toHaveText('Hráčů: 0')
})

test('a taken nickname is rejected and the player is sent back to the join form', async ({ browser }) => {
  const host = await openHost(browser)
  const alice = await joinAsPlayer(browser, 'Alice')
  const context = await browser.newContext()
  const dup = await context.newPage()
  await dup.goto('/')
  await dup.getByTestId('pin-input').fill(PIN)
  await dup.getByTestId('nickname-input').fill('alice')
  await dup.getByTestId('join-button').click()
  await expect(dup.getByTestId('join-error')).toContainText('už někdo ve hře používá')
  await expect(host.getByTestId('player-count')).toHaveText('Hráčů: 1')

  host.once('dialog', (d) => d.accept())
  await host.getByTestId('reset-button').click()
  await expect(host.getByTestId('player-count')).toHaveText('Hráčů: 0')
  await alice.close()
})

test('a player can leave the lobby, and re-joining after Back applies the new avatar', async ({ browser }) => {
  const host = await openHost(browser)

  // Leave with the button: the seat is freed.
  const leaver = await joinAsPlayer(browser, 'Odcházím')
  await expect(host.getByTestId('player-count')).toHaveText('Hráčů: 1')
  await leaver.getByTestId('leave-button').click()
  await expect(leaver).toHaveURL(/\/$/)
  await expect(host.getByTestId('player-count')).toHaveText('Hráčů: 0')

  // Browser Back (no leave message), then the join form again with another avatar.
  const alice = await joinAsPlayer(browser, 'Alice', { character: 1, hat: 1 }) // 🦊
  await expect(host.getByTestId('player-chip').filter({ hasText: 'Alice' })).toContainText('🦊')
  await alice.goBack()
  await expect(alice.getByTestId('join-button')).toBeVisible()
  await alice.getByTestId('avatar-character-3').click() // 🐼
  await alice.getByTestId('join-button').click()
  await expect(alice.getByTestId('my-nickname')).toHaveText('Alice')
  const chip = host.getByTestId('player-chip').filter({ hasText: 'Alice' })
  await expect(chip).toContainText('🐼')
  await expect(chip).not.toContainText('🦊')
  await expect(host.getByTestId('player-count')).toHaveText('Hráčů: 1')

  host.once('dialog', (d) => d.accept())
  await host.getByTestId('reset-button').click()
  await expect(host.getByTestId('player-count')).toHaveText('Hráčů: 0')
})

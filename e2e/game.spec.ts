import { expect, test, type Browser, type Page } from '@playwright/test'

// Uses the hardcoded "Rychlý test" game: PIN 0000, two questions, correct answers 0 and 1.
const PIN = '0000'
const PASSWORD = process.env.HOST_PASSWORD ?? 'sovahoot'

async function openHost(browser: Browser): Promise<Page> {
  const page = await browser.newPage()
  await page.goto('/host')
  await page.getByTestId('host-password').fill(PASSWORD)
  await page.getByTestId('host-login').click()
  await page.getByTestId('game-test').click()
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

  // Question 1: Alice right, Bob wrong → closes as soon as both answered.
  await host.getByTestId('start-button').click()
  await expect(alice.getByTestId('question-text')).toBeVisible()
  await expect(host.getByTestId('countdown')).toBeVisible()
  await alice.getByTestId('answer-0').click()
  await expect(alice.getByTestId('answered')).toBeVisible()
  await expect(host.getByTestId('answered-count')).toHaveText('Odpovědělo 1 z 2')
  await bob.getByTestId('answer-1').click()

  await expect(alice.getByTestId('result')).toContainText('Správně')
  await expect(bob.getByTestId('result')).toContainText('špatně')
  await expect(host.locator('main')).toHaveAttribute('data-phase', 'reveal')
  const aliceGain = Number((await alice.getByTestId('gain').textContent())?.replace('+', ''))
  expect(aliceGain).toBeGreaterThan(0)

  await host.getByTestId('next-button').click() // → leaderboard
  await expect(alice.getByTestId('my-rank')).toHaveText('1. místo')
  await expect(host.getByTestId('leaderboard')).toContainText('Alice')
  await host.getByTestId('next-button').click() // → question 2
  await expect(alice.getByTestId('question-text')).toContainText('pavouk')

  // Alice's phone "dies" mid-question: a reload must restore her seat and the running question.
  await alice.reload()
  await expect(alice.getByTestId('question-text')).toContainText('pavouk')
  await expect(alice.getByTestId('connection-status')).toHaveText('Připojeno')
  await expect(host.getByTestId('answered-count')).toHaveText('Odpovědělo 0 z 2')

  await alice.getByTestId('answer-1').click()
  await bob.getByTestId('answer-0').click()
  await expect(host.locator('main')).toHaveAttribute('data-phase', 'reveal')
  // Last question: skip the leaderboard and announce the results directly.
  await expect(host.getByTestId('skip-button')).toContainText('Vyhlásit výsledky')
  await host.getByTestId('skip-button').click() // → podium

  await expect(host.getByTestId('podium')).toContainText('Alice')
  await expect(host.getByTestId('podium')).toContainText('🦊')
  await expect(alice.getByTestId('final-rank')).toContainText('1. místo')
  await expect(bob.getByTestId('final-rank')).toContainText('2. místo')

  // Results landed in D1 and show up in the history page.
  const history = await browser.newPage()
  await history.goto('/history')
  const latest = history.getByTestId('history-session').first()
  await expect(latest).toContainText('Rychlý test')
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

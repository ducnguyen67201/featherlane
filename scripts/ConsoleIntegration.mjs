import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

/** Exercise owner UI states against synthetic services; never load real credentials. */
export async function verifyConsoleStates(page, baseUrl, ownerToken, cli) {
  await page.getByLabel('Owner token', { exact: true }).fill('invalid-synthetic-owner');
  await page.getByRole('button', { name: 'Load requests' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('article').count(), 0);
  assert.ok(!(await page.getByRole('alert').innerText()).includes('invalid-synthetic-owner'));

  const purpose = '<img src=x onerror=alert(1)> ' + 'long-purpose-'.repeat(20);
  const pending = await cli(['request', '--connection', 'production', '--purpose', purpose]);

  await page.getByLabel('Owner token', { exact: true }).fill(ownerToken);
  await page.getByRole('button', { name: 'Load requests' }).click();
  const card = page.getByRole('article', { name: 'Request ' + pending.id, exact: true });

  await card.waitFor();
  assert.ok((await card.innerText()).includes(purpose));
  assert.equal(await card.locator('img').count(), 0);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/console-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });

  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    true,
  );

  await page.screenshot({ path: 'test-results/console-mobile.png', fullPage: true });
  await card.getByRole('button', { name: 'Deny', exact: true }).click();
  await card.getByText('denied', { exact: true }).waitFor();
  assert.equal((await cli(['status', pending.id])).status, 'denied');

  await page.reload();
  await page.getByLabel('Owner token', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Owner token', { exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('article').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Load requests' }).isDisabled(), true);

  /* Even an already received response must not repopulate the UI after lock/edit. */
  for (const changeToken of [false, true]) {
    await page.getByLabel('Owner token', { exact: true }).fill(ownerToken);
    const responseReceived = Promise.withResolvers();
    const releaseResponse = Promise.withResolvers();
    const responseDelivered = Promise.withResolvers();

    await page.route(baseUrl + '/v1/owner/access', async (route) => {
      const response = await route.fetch();

      responseReceived.resolve();
      await releaseResponse.promise;
      await route.fulfill({ response });
      responseDelivered.resolve();
    });

    await page.getByRole('button', { name: 'Load requests' }).click();
    await responseReceived.promise;
    assert.equal(await page.getByRole('button', { name: 'Load requests' }).isDisabled(), true);

    if (changeToken) {
      await page.getByLabel('Owner token', { exact: true }).fill('replacement-synthetic-owner');
    } else {
      await page.getByRole('button', { name: 'Lock console' }).click();
    }

    releaseResponse.resolve();
    await responseDelivered.promise;
    await page.unroute(baseUrl + '/v1/owner/access');
    assert.equal(await page.getByRole('article').count(), 0);
    assert.equal(await page.getByRole('alert').count(), 0);

    assert.equal(
      await page.getByLabel('Owner token', { exact: true }).inputValue(),
      changeToken ? 'replacement-synthetic-owner' : '',
    );
  }

  await page.getByRole('button', { name: 'Lock console' }).click();
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);

  console.log(
    'PASS: Mantine console errors, deny, mobile layout, safe text, reload and lock/token-change cancellation',
  );
}

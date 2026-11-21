'use strict';

const path = require('node:path');
const assert = require('node:assert');
const { tests } = require('@iobroker/testing');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test sendTo()', getHarness => {
            it('help should describe the adapter', () =>
                new Promise((resolve, reject) => {
                    const harness = getHarness();
                    harness
                        .startAdapterAndWait()
                        .then(() => {
                            harness.sendTo('chromecast.0', 'help', null, resp => {
                                try {
                                    assert.ok(typeof resp.help === 'string' && resp.help.includes('chromecast'));
                                    assert.ok(Array.isArray(resp.commands));
                                    assert.ok(resp.commands.some(c => c.command === 'help'));
                                    // the standard commands of the shared catalog are marked, with write for effects
                                    const standard = Object.fromEntries(
                                        resp.commands.filter(c => c.standard).map(c => [c.command, c]),
                                    );
                                    assert.deepStrictEqual(
                                        Object.keys(standard)
                                            .sort()
                                            .map(c => standard[c].standard),
                                        ['media.getPlayers', 'media.play', 'speech.playSound'],
                                    );
                                    assert.strictEqual(standard.getPlayers.write, false);
                                    assert.strictEqual(standard.play.write, true);
                                    assert.strictEqual(standard.playSound.write, true);
                                    resolve();
                                } catch (e) {
                                    reject(e);
                                }
                            });
                        })
                        .catch(reject);
                }));

            it('standard commands answer in the form of the shared catalog', async () => {
                const harness = getHarness();
                if (!harness.isAdapterRunning()) {
                    await harness.startAdapterAndWait();
                }
                const ask = (command, message) =>
                    new Promise(resolve => harness.sendTo('chromecast.0', command, message, resolve));

                // no Cast device in the test environment
                assert.deepStrictEqual(await ask('getPlayers', {}), { players: [] });
                const play = await ask('play', { uri: 'http://example.org/a.mp3', device: 'Kitchen' });
                assert.strictEqual(play.reason, 'NOT_FOUND');
                assert.deepStrictEqual(play.candidates, []);
                assert.strictEqual((await ask('playSound', { device: 'Kitchen' })).reason, 'BAD_REQUEST');
                assert.strictEqual((await ask('playSound', { file: 'iobfile://vis.0/a.mp3' })).reason, 'BAD_REQUEST');
                assert.strictEqual((await ask('playSound', { url: 'http://example.org/a.mp3' })).reason, 'NOT_FOUND');
                assert.strictEqual((await ask('unknownCommand', {})).reason, 'NOT_SUPPORTED');
            });
        });
    },
});

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
                                    resolve();
                                } catch (e) {
                                    reject(e);
                                }
                            });
                        })
                        .catch(reject);
                }));
        });
    },
});

# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

## Adapter-Specific Context
- **Adapter Name**: chromecast
- **Primary Function**: Google Home/Chromecast device control and media casting
- **Key Dependencies**: castv2-player (Chromecast protocol), youtube-remote (YouTube integration), node-arp (network device discovery)
- **Configuration Requirements**: Optional manual device configuration for different subnets
- **Target Devices**: Google Home devices, Chromecast devices, Nest speakers/displays

### Chromecast-Specific Development Context
This adapter handles:
- **Device Discovery**: Automatic discovery via mDNS/Zeroconf for devices on same subnet
- **Manual Configuration**: Support for devices on different subnets via IP/port configuration
- **Media Casting**: Streaming URLs, local files, and YouTube content to devices
- **State Management**: Device status (playing, paused, idle), volume control, media information
- **Multi-Protocol Support**: Cast v2 protocol via castv2-player library
- **Network Requirements**: May require web server instance for streaming local files

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Validate expected states were created
                        const connectionState = await harness.states.getStateAsync('your-adapter.0.info.connection');
                        if (!connectionState || connectionState.val !== true) {
                            return reject(new Error('Expected connection state to be true'));
                        }

                        console.log('✅ All tests passed!');
                        resolve();
                        
                    } catch (error) {
                        console.error('❌ Test failed:', error.message);
                        reject(error);
                    }
                });
            }).timeout(60000);
        });
    }
});
```

#### Network Device Integration Testing
For Chromecast adapter specifically, integration tests should handle network discovery and device simulation:

```javascript
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Chromecast Device Discovery and Control', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should discover and configure chromecast devices', async function () {
                // Configure adapter for test environment
                const obj = await harness.objects.getObjectAsync('system.adapter.chromecast.0');
                
                // Set test configuration
                Object.assign(obj.native, {
                    devices: [
                        {
                            name: 'TestDevice',
                            ip: '192.168.1.100',
                            port: 8009,
                            type: 'Chromecast'
                        }
                    ]
                });

                await harness.objects.setObjectAsync(obj._id, obj);
                await harness.startAdapterAndWait();
                
                // Wait for device discovery
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                // Check if device states were created
                const deviceStates = await harness.objects.getObjectViewAsync('system', 'state', {
                    startkey: 'chromecast.0.',
                    endkey: 'chromecast.0.\u9999'
                });
                
                expect(deviceStates.rows.length).toBeGreaterThan(0);
            }).timeout(30000);
        });
    }
});
```

### Chromecast-Specific Test Considerations
- **Network Isolation**: Tests should not depend on actual Chromecast devices being present
- **Protocol Simulation**: Mock castv2-client responses for device discovery and control
- **State Validation**: Verify correct state structure creation for discovered devices
- **Error Handling**: Test network timeouts, device unavailability, and protocol errors

## Error Handling Patterns

### Network and Device Error Handling
Chromecast adapters deal with network-dependent operations that can fail:

```javascript
// Proper error handling for device operations
async function connectToDevice(deviceInfo) {
  try {
    const client = new castv2.Client();
    
    client.on('error', (err) => {
      this.log.error(`Device connection error: ${err.message}`);
      this.setState('info.connection', false, true);
    });
    
    await client.connect({ host: deviceInfo.ip, port: deviceInfo.port || 8009 });
    this.log.info(`Connected to ${deviceInfo.name}`);
    
  } catch (error) {
    this.log.error(`Failed to connect to ${deviceInfo.name}: ${error.message}`);
    // Implement retry logic or device marking as offline
    this.scheduleReconnect(deviceInfo);
  }
}
```

### State Management Error Handling
```javascript
// Safe state updates with error handling
async function updateDeviceStates(deviceId, mediaInfo) {
  try {
    const statesToUpdate = {
      [`${deviceId}.player.title`]: mediaInfo.metadata.title || '',
      [`${deviceId}.player.artist`]: mediaInfo.metadata.artist || '',
      [`${deviceId}.player.duration`]: mediaInfo.duration || 0,
      [`${deviceId}.player.position`]: mediaInfo.currentTime || 0
    };

    for (const [stateId, value] of Object.entries(statesToUpdate)) {
      await this.setStateAsync(stateId, value, true);
    }
  } catch (error) {
    this.log.error(`Failed to update states for ${deviceId}: ${error.message}`);
  }
}
```

## ioBroker Adapter Patterns

### Adapter Lifecycle Management

```javascript
class ChromecastAdapter extends utils.Adapter {
  constructor(options) {
    super({
      ...options,
      name: 'chromecast',
    });
    
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  async onReady() {
    // Initialize adapter
    this.log.info('Chromecast adapter starting...');
    
    // Set connection state
    await this.setStateAsync('info.connection', false, true);
    
    // Subscribe to state changes
    this.subscribeStates('*');
    
    // Start device discovery
    await this.discoverDevices();
  }

  async onUnload(callback) {
    try {
      // Clean up resources
      if (this.discoveryTimeout) {
        clearTimeout(this.discoveryTimeout);
      }
      
      // Close all device connections
      if (this.devices) {
        for (const device of Object.values(this.devices)) {
          if (device.client && device.client.close) {
            device.client.close();
          }
        }
      }
      
      callback();
    } catch (e) {
      callback();
    }
  }
}
```

### State Structure and Management

```javascript
// Create device states structure
async function createDeviceStates(deviceId, deviceInfo) {
  const states = {
    [`${deviceId}`]: {
      type: 'device',
      common: {
        name: deviceInfo.name || deviceId
      }
    },
    [`${deviceId}.player`]: {
      type: 'channel',
      common: {
        name: 'Player controls'
      }
    },
    [`${deviceId}.player.url2play`]: {
      type: 'state',
      common: {
        name: 'URL to play',
        type: 'string',
        role: 'media.url',
        read: true,
        write: true
      }
    },
    [`${deviceId}.status`]: {
      type: 'channel',
      common: {
        name: 'Status information'
      }
    },
    [`${deviceId}.status.playing`]: {
      type: 'state',
      common: {
        name: 'Playing status',
        type: 'boolean',
        role: 'media.state',
        read: true,
        write: true
      }
    }
  };

  // Create all states
  for (const [id, obj] of Object.entries(states)) {
    await this.setObjectNotExistsAsync(id, obj);
  }
}
```

### Configuration Management

```javascript
// Handle adapter configuration
function validateAndProcessConfig() {
  const config = this.config;
  
  // Validate required settings
  if (config.devices) {
    for (const device of config.devices) {
      if (!device.name || !device.ip) {
        this.log.error('Invalid device configuration: name and IP required');
        continue;
      }
      
      // Ensure port is set
      device.port = device.port || 8009;
      
      // Validate IP format
      if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(device.ip)) {
        this.log.error(`Invalid IP address for device ${device.name}: ${device.ip}`);
        continue;
      }
    }
  }
  
  return config;
}
```

## Advanced Development Features

### JSON-Config Integration
Modern ioBroker adapters use JSON-Config for admin interface:

```javascript
// Handling JSON-Config changes
async function onMessage(obj) {
  if (typeof obj === 'object' && obj.message) {
    if (obj.command === 'discover') {
      // Handle device discovery request from admin
      const devices = await this.discoverNetworkDevices();
      this.sendTo(obj.from, obj.command, devices, obj.callback);
    }
    
    if (obj.command === 'test') {
      // Test device connection
      try {
        const result = await this.testDeviceConnection(obj.message);
        this.sendTo(obj.from, obj.command, { result: true, data: result }, obj.callback);
      } catch (error) {
        this.sendTo(obj.from, obj.command, { result: false, error: error.message }, obj.callback);
      }
    }
  }
}
```

### Device Discovery Implementation

```javascript
// Network device discovery for Chromecast
async function discoverDevices() {
  return new Promise((resolve, reject) => {
    const browser = mdns.createBrowser(mdns.tcp('googlecast'));
    const foundDevices = [];
    
    browser.on('serviceUp', (service) => {
      const device = {
        name: service.name,
        ip: service.addresses[0],
        port: service.port,
        type: 'Chromecast',
        txtRecord: service.txtRecord
      };
      
      foundDevices.push(device);
      this.log.info(`Discovered Chromecast device: ${device.name} at ${device.ip}:${device.port}`);
    });
    
    browser.on('error', (error) => {
      this.log.error(`Discovery error: ${error.message}`);
    });
    
    browser.start();
    
    // Stop discovery after timeout
    setTimeout(() => {
      browser.stop();
      resolve(foundDevices);
    }, 10000);
  });
}
```

## Performance and Resource Management

### Connection Pooling
```javascript
// Manage device connections efficiently
class DeviceConnectionManager {
  constructor(adapter) {
    this.adapter = adapter;
    this.connections = new Map();
    this.reconnectTimers = new Map();
  }
  
  async getConnection(deviceId) {
    if (this.connections.has(deviceId)) {
      return this.connections.get(deviceId);
    }
    
    const connection = await this.createConnection(deviceId);
    this.connections.set(deviceId, connection);
    return connection;
  }
  
  scheduleReconnect(deviceId, delay = 30000) {
    if (this.reconnectTimers.has(deviceId)) {
      clearTimeout(this.reconnectTimers.get(deviceId));
    }
    
    const timer = setTimeout(async () => {
      try {
        await this.reconnectDevice(deviceId);
      } catch (error) {
        this.adapter.log.error(`Reconnect failed for ${deviceId}: ${error.message}`);
        this.scheduleReconnect(deviceId, delay * 2); // Exponential backoff
      }
    }, delay);
    
    this.reconnectTimers.set(deviceId, timer);
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```
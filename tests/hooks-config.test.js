const { registerHooks, deregisterHooks, CCM_HOOK_MARKER } = require('../src/hooks-config/index.js');

describe('hooks-config', () => {
  test('registerHooks adds three hook entries with marker', () => {
    const settings = {};
    const result = registerHooks(settings, '/usr/local/bin/ccm-hook');
    expect(result.hooks.PreToolUse).toHaveLength(1);
    expect(result.hooks.PostToolUse).toHaveLength(1);
    expect(result.hooks.Stop).toHaveLength(1);
    expect(result.hooks.PreToolUse[0].hooks[0].command).toContain('ccm-hook');
    expect(result.hooks.PreToolUse[0][CCM_HOOK_MARKER]).toBe(true);
  });

  test('registerHooks preserves existing hooks', () => {
    const settings = {
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'other-hook' }] }],
      },
    };
    const result = registerHooks(settings, '/usr/local/bin/ccm-hook');
    expect(result.hooks.PreToolUse).toHaveLength(2);
    expect(result.hooks.PreToolUse[0].hooks[0].command).toBe('other-hook');
  });

  test('registerHooks is idempotent — does not duplicate', () => {
    const settings = {};
    const once = registerHooks(settings, '/usr/local/bin/ccm-hook');
    const twice = registerHooks(once, '/usr/local/bin/ccm-hook');
    expect(twice.hooks.PreToolUse).toHaveLength(1);
  });

  test('deregisterHooks removes only ccm-injected hooks', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          { [CCM_HOOK_MARKER]: true, hooks: [{ type: 'command', command: 'ccm-hook pre-tool' }] },
          { hooks: [{ type: 'command', command: 'other-hook' }] },
        ],
      },
    };
    const result = deregisterHooks(settings);
    expect(result.hooks.PreToolUse).toHaveLength(1);
    expect(result.hooks.PreToolUse[0].hooks[0].command).toBe('other-hook');
  });

  test('deregisterHooks handles settings with no hooks gracefully', () => {
    const result = deregisterHooks({});
    expect(result.hooks).toBeUndefined();
  });
});

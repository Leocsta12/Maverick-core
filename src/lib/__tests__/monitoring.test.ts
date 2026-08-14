// jest.setup.js não define EXPO_PUBLIC_SENTRY_DSN/EXPO_PUBLIC_POSTHOG_API_KEY
// — então por padrão aqui os dois estão "não configurados", o mesmo estado
// real de dev local/CI sem essas contas. isSentryConfigured/isPostHogConfigured
// e o resto da suíte "não configurado" cobrem esse caminho direto.
//
// Pra cobrir o caminho "configurado" (init/capture/identify chamam o SDK de
// verdade), cada teste isola o módulo com jest.isolateModules — necessário
// porque monitoring.ts lê as env vars uma vez, no topo do arquivo, na
// primeira importação.

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  wrap: jest.fn((c) => c),
  GlobalErrorBoundary: 'GlobalErrorBoundary',
}));

const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();
jest.mock('posthog-react-native', () => {
  return jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    identify: mockIdentify,
    reset: mockReset,
  }));
});

import * as Sentry from '@sentry/react-native';
import {
  captureError,
  identifyUser,
  initSentry,
  isPostHogConfigured,
  isSentryConfigured,
  resetUser,
  trackEvent,
  trackScreenView,
} from '../monitoring';

describe('monitoring (não configurado — estado padrão em dev/CI)', () => {
  it('isSentryConfigured/isPostHogConfigured são false sem as env vars', () => {
    expect(isSentryConfigured()).toBe(false);
    expect(isPostHogConfigured()).toBe(false);
  });

  it('initSentry não chama Sentry.init', () => {
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('captureError não chama Sentry.captureException', () => {
    captureError(new Error('x'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('trackEvent/trackScreenView não lançam erro e não capturam nada', () => {
    expect(() => trackEvent('teste')).not.toThrow();
    expect(() => trackScreenView('/dashboard')).not.toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('identifyUser/resetUser não lançam erro', () => {
    expect(() => identifyUser('u1')).not.toThrow();
    expect(() => resetUser()).not.toThrow();
  });
});

describe('monitoring (configurado)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_SENTRY_DSN: 'https://fake@sentry.example/1',
      EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_fake',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('isSentryConfigured/isPostHogConfigured são true com as env vars definidas', () => {
    jest.isolateModules(() => {
      const m = require('../monitoring');
      expect(m.isSentryConfigured()).toBe(true);
      expect(m.isPostHogConfigured()).toBe(true);
    });
  });

  it('initSentry chama Sentry.init com o DSN', () => {
    jest.isolateModules(() => {
      const m = require('../monitoring');
      m.initSentry();
      expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://fake@sentry.example/1' }));
    });
  });

  it('captureError chama Sentry.captureException', () => {
    jest.isolateModules(() => {
      const m = require('../monitoring');
      const err = new Error('deu ruim');
      m.captureError(err, { screen: 'nutrition' });
      expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: { screen: 'nutrition' } });
    });
  });

  it('trackEvent chama PostHog.capture com nome e propriedades', () => {
    jest.isolateModules(() => {
      const m = require('../monitoring');
      m.trackEvent('workout_completed', { dayLabel: 'Peito' });
      expect(mockCapture).toHaveBeenCalledWith('workout_completed', { dayLabel: 'Peito' });
    });
  });

  it('identifyUser chama PostHog.identify e Sentry.setUser', () => {
    jest.isolateModules(() => {
      const m = require('../monitoring');
      m.identifyUser('u1', { name: 'Ana' });
      expect(mockIdentify).toHaveBeenCalledWith('u1', { name: 'Ana' });
      expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'u1' });
    });
  });

  it('resetUser chama PostHog.reset e Sentry.setUser(null)', () => {
    jest.isolateModules(() => {
      const m = require('../monitoring');
      m.resetUser();
      expect(mockReset).toHaveBeenCalledTimes(1);
      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });
  });
});

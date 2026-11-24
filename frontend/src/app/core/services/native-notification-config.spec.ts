import { describe, expect, it } from 'vitest';
import capacitorConfig from '../../../../capacitor.config';

describe('Capacitor local notification branding', () => {
  it('uses the LocaMais Android drawable and suppresses duplicate foreground presentation', () => {
    expect(capacitorConfig.plugins?.['LocalNotifications']).toMatchObject({
      smallIcon: 'ic_stat_locamais',
      iconColor: '#f57c1f',
      presentationOptions: [],
    });
  });
});

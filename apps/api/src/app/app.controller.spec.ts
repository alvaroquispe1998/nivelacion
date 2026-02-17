import { AppController } from './app.controller';

describe('AppController', () => {
  it('should return ok=true', () => {
    const ctrl = new AppController();
    expect(ctrl.get()).toEqual({ ok: true });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { projectView } from '../../gui/rules/views.js';
import { EventPump, eventPumpFor, pumpUrlFrom } from '../../gui/host/event-pump.js';

const data = await loadData();
const SINK = 'ws://bot.test/mars';

/** A WebSocket that goes nowhere, and can be made to misbehave on purpose. */
class FakeSocket {
  static made = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;                 // CONNECTING
    this.sent = [];
    this.throwOnSend = false;
    FakeSocket.made.push(this);
  }

  open() { this.readyState = 1; this.onopen?.(); }

  send(frame) {
    if (this.throwOnSend) throw new Error('the socket is gone');
    this.sent.push(frame);
  }

  close() { this.readyState = 3; this.onclose?.(); }
}

const view = (mutate = () => {}) => {
  const state = createInitialState({ joinCode: 'PUMPED', seed: 1, data, playerCount: 8 });
  mutate(state);
  return projectView(state, data, { kind: 'spectator', roleId: null, teamId: null });
};

const pumped = (overrides = {}) => new EventPump({
  url: new URL(SINK),
  now: () => 1730000000000,
  data,
  WebSocketImpl: FakeSocket,
  onLog: () => {},
  ...overrides,
});

beforeEach(() => { FakeSocket.made = []; });

describe('the off switch', () => {
  it('builds nothing without the parameter, whatever else is wrong', () => {
    for (const search of [undefined, '', '?other=1', '?events=', '?events=not a url',
      '?events=ftp://old.test']) {
      expect(eventPumpFor({ location: { search }, data }), String(search)).toBe(null);
    }
    expect(FakeSocket.made).toHaveLength(0);
  });

  it('parses the two schemes it can speak and says it is on', () => {
    expect(pumpUrlFrom({ search: `?events=${SINK}` }).protocol).toBe('ws:');
    expect(pumpUrlFrom({ search: '?events=https://hook.test/x' }).protocol).toBe('https:');
    const lines = [];
    const pump = eventPumpFor({
      location: { search: `?events=${SINK}` },
      data,
      onLog: (line) => lines.push(line),
      WebSocketImpl: FakeSocket,
    });
    expect(pump).toBeInstanceOf(EventPump);
    expect(lines.join(' ')).toContain('streaming to');
  });
});

describe('observing', () => {
  it('dials lazily, then sends the batch as ndjson once the socket opens', () => {
    const pump = pumped();
    expect(FakeSocket.made).toHaveLength(0);

    expect(pump.observe(view())).toBe(1);         // game.opened
    const socket = FakeSocket.made[0];
    expect(socket.sent).toHaveLength(0);           // still connecting
    socket.open();
    expect(socket.sent).toHaveLength(1);
    const envelope = JSON.parse(socket.sent[0].trim());
    expect(envelope).toMatchObject({ type: 'game.opened', game: 'PUMPED', seq: 0 });
  });

  it('says nothing about a board that has not moved, and numbers what it does say', () => {
    const pump = pumped();
    pump.observe(view());
    FakeSocket.made[0].open();
    expect(pump.observe(view())).toBe(0);          // same digest: no events

    pump.observe(view((state) => { state.phase = { ...state.phase, name: 'team', turn: 1, paused: false }; }));
    const frames = FakeSocket.made[0].sent.map((frame) => JSON.parse(frame.trim()));
    expect(frames.map((f) => f.seq)).toEqual([0, 1]);
    expect(frames[1].type).toBe('game.phase');
  });

  it('swallows a throwing socket and keeps the game alive', () => {
    const lines = [];
    const pump = pumped({ onLog: (line) => lines.push(line) });
    pump.observe(view());
    const socket = FakeSocket.made[0];
    socket.throwOnSend = true;
    socket.open();                                  // flush throws inside
    expect(lines.join(' ')).toContain('sink unreachable');
    // And the pump is still standing for the next observation.
    expect(() => pump.observe(view((state) => {
      state.phase = { ...state.phase, name: 'team' };
    }))).not.toThrow();
  });

  it('drops everything after close, quietly', () => {
    const pump = pumped();
    pump.observe(view());
    pump.close();
    expect(pump.observe(view((state) => {
      state.phase = { ...state.phase, name: 'team' };
    }))).toBe(0);
  });

  it('POSTs the same bytes in http mode and survives a rejecting fetch', async () => {
    const calls = [];
    const pump = new EventPump({
      url: new URL('https://hook.test/x'),
      now: () => 1,
      data,
      onLog: () => {},
      fetchImpl: (url, options) => { calls.push({ url, options }); return Promise.reject(new Error('down')); },
    });
    pump.observe(view());
    expect(calls).toHaveLength(1);
    expect(calls[0].options.headers['content-type']).toBe('application/x-ndjson');
    expect(JSON.parse(calls[0].options.body.trim()).type).toBe('game.opened');
    await Promise.resolve();                        // the rejection lands nowhere
  });
});

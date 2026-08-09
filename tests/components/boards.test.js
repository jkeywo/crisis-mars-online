// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { projectView } from '../../gui/rules/views.js';
import '../../gui/components/cm-map-board.js';
import '../../gui/components/cm-war-progress.js';

const data = await loadData();

const mount = (tag, attrs = {}) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  document.body.append(element);
  return element;
};

/** A spectator's view of a fresh game — the boards are public, so it is whole. */
const freshView = () => projectView(
  createInitialState({ joinCode: 'MARS42X', seed: 1, data }),
  data, { kind: 'spectator', roleId: null, teamId: null });

beforeEach(() => { document.body.innerHTML = ''; });

describe('<cm-map-board>', () => {
  it('renders all nineteen printed tracks across the three boards', () => {
    // Data-driven: one instance per map, and between them every track with a
    // printed initial value appears exactly once, by name and value.
    const view = freshView();
    const seen = [];
    for (const mapId of Object.keys(data.maps.maps)) {
      const board = mount('cm-map-board', { map: mapId });
      board.data = data;
      board.view = view;
      for (const row of board.querySelectorAll('.cm-track')) {
        seen.push(row.dataset.track);
      }
    }
    const expected = Object.entries(data.maps.tracks)
      .filter(([, t]) => t.initial !== null).map(([id]) => id);
    expect(seen.sort()).toEqual(expected.sort());
    expect(seen).toHaveLength(19);
  });

  it('shows the printed name and the live value', () => {
    const board = mount('cm-map-board', { map: 'earth_map' });
    board.data = data;
    board.view = freshView();
    const row = board.querySelector('[data-track="war_support"]');
    expect(row.textContent).toContain('War Support');
    expect(row.querySelector('.cm-track-value').textContent).toBe('16');
    // A fresh board sits on its printed values, so nothing is marked moved.
    expect(board.querySelectorAll('[data-moved="true"]')).toHaveLength(0);
  });

  it('renders every location as a slot, and an empty action-card strip', () => {
    const board = mount('cm-map-board', { map: 'belt_map' });
    board.data = data;
    board.view = freshView();
    const names = [...board.querySelectorAll('.cm-location-name')].map((n) => n.textContent);
    expect(names).toEqual(['Ceres', 'Vesta', 'Pallas']);
    expect(board.querySelector('.cm-board-cards').dataset.empty).toBe('true');
  });

  it('flashes the delta when a value changes, and only on the row that moved', () => {
    const board = mount('cm-map-board', { map: 'earth_map' });
    board.data = data;
    board.view = freshView();

    const moved = freshView();
    moved.maps.earth_map.tracks.war_support = 14;
    board.view = moved;

    const row = board.querySelector('[data-track="war_support"]');
    expect(row.dataset.flash).toBe('down');
    expect(row.querySelector('.cm-track-delta').textContent).toBe('−2');
    // And the counter is off its printed value now, so it stays marked after
    // the flash would fade.
    expect(row.dataset.moved).toBe('true');
    expect(board.querySelectorAll('[data-flash]')).toHaveLength(1);
  });

  it('does not flash a value that merely rendered again', () => {
    const board = mount('cm-map-board', { map: 'earth_map' });
    board.data = data;
    board.view = freshView();
    board.view = freshView();
    expect(board.querySelectorAll('[data-flash]')).toHaveLength(0);
  });

  it('shows a placed action card as a faction-coloured token on its map', () => {
    const board = mount('cm-map-board', { map: 'earth_map' });
    board.data = data;
    const view = freshView();
    view.actionCards.C1 = { placed: 'earth_map', spent: false };
    view.actionCards.V1 = { placed: 'mars_map', spent: false };
    board.view = view;

    const strip = board.querySelector('.cm-board-cards');
    expect(strip.dataset.empty).toBe('false');
    const tokens = [...strip.querySelectorAll('.cm-action-token')];
    // C1's token, in Canopy's printed colour — and V1's is on another board.
    expect(tokens.map((t) => t.dataset.code)).toEqual(['C1']);
    expect(tokens[0].getAttribute('style'))
      .toContain(data.factions.factions.canopy_corp.colour);
    expect(tokens[0].title).toBe(data.roles.roles.C1.name);
  });

  it('flashes upward movement as up', () => {
    const board = mount('cm-map-board', { map: 'mars_map' });
    board.data = data;
    board.view = freshView();
    const moved = freshView();
    moved.maps.mars_map.tracks.senate_military = 3;
    board.view = moved;
    const row = board.querySelector('[data-track="senate_military"]');
    expect(row.dataset.flash).toBe('up');
    expect(row.querySelector('.cm-track-delta').textContent).toBe('+3');
  });
});

describe('<cm-war-progress>', () => {
  const railAt = (value) => {
    const rail = mount('cm-war-progress');
    rail.data = data;
    const view = freshView();
    view.warProgress = value;
    rail.view = view;
    return rail;
  };

  it('says the war has not begun while the value is null', () => {
    const rail = railAt(null);
    expect(rail.textContent).toContain('The war has not begun');
    expect(rail.querySelector('.cm-war-marker')).toBeNull();
  });

  it('draws every station on the route, with the surrender ends marked', () => {
    const rail = railAt(10);
    const stations = [...rail.querySelectorAll('.cm-war-station')];
    expect(stations).toHaveLength(data.maps.warProgress.locationBands.length);
    expect(stations[0].dataset.surrender).toBe('true');
    expect(stations.at(-1).dataset.surrender).toBe('true');
    // Stations carry the printed location names, not ids.
    expect(rail.textContent).toContain('Earth Gov Capital');
    expect(rail.textContent).toContain('Senate Building');
  });

  it.each([
    [0, 'earth_gov_capital'],
    [2, 'earth_space_port'],
    [5, 'earth_low_orbit'],
    [9, 'earth_upper_orbit'],
    [12, 'mars_upper_orbit'],
    [17, 'starport_m'],
    [19, 'capital_city'],
    [20, 'senate_building'],
    [27, 'senate_building'],   // the open band swallows everything past 20
  ])('stands the marker in the right band at %i', (value, locationId) => {
    const rail = railAt(value);
    const marked = rail.querySelectorAll('[data-marker="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].dataset.location).toBe(locationId);
  });

  it('flashes the move when the front line shifts', () => {
    const rail = railAt(9);
    const view = freshView();
    view.warProgress = 12;
    rail.view = view;
    expect(rail.querySelector('.cm-war-delta').textContent).toBe('+3');
    expect(rail.querySelector('.cm-war-delta').dataset.flash).toBe('up');
  });

  it('does not call the war starting a delta', () => {
    // Null to a number is an announcement the correspondence makes out loud;
    // a "+10" chip on top of it would be noise about nothing that moved.
    const rail = railAt(null);
    const view = freshView();
    view.warProgress = 10;
    rail.view = view;
    expect(rail.querySelector('.cm-war-delta')).toBeNull();
    expect(rail.querySelectorAll('[data-marker="true"]')).toHaveLength(1);
  });
});

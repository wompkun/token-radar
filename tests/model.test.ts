/**
 * Regression tests for the token-radar model (radar-2).
 *
 * Written after the model was built (exploration-first build in the prior
 * turn); they lock the gate rules and the documented formula so any later
 * change that breaks them is caught. See the plan:
 * docs/superpowers/plans/2026-11-17-token-radar-build.md
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MODEL,
  MODEL_VERSION,
  EARLY_ROWS,
  LIVE_ROWS,
  ageMultiplier,
  farmability,
  impliedValue,
  isPreToken,
  isRankable,
  buildBoard,
  buildRadar,
  farmSteps,
  boardIssue,
  dataScript,
  parseSnapshot,
  type Snapshot,
  type SnapshotProtocol,
} from '../lib/model.ts';

const SNAP_PATH =
  process.env.SNAPSHOT_PATH ??
  '/home/hatch/workspace/makefun-sponsor/token-radar-01-kit/input/snapshot.json';

const snapshot: Snapshot = parseSnapshot(readFileSync(SNAP_PATH, 'utf8'));

function proto(over: Partial<SnapshotProtocol> = {}): SnapshotProtocol {
  return {
    slug: 'test-protocol',
    name: 'Test Protocol',
    category: 'Lending',
    chains: ['Ethereum'],
    tvl_usd: 1_000_000_000,
    mcap_usd: null,
    gecko_id: null,
    symbol: null,
    change_7d: 0,
    change_1d: null,
    listed_at: '2025-01-01',
    ...over,
  };
}

describe('board gate', () => {
  it('includes all 40 watchlist slugs', () => {
    const board = buildBoard(snapshot);
    const slugs = new Set(board.map((r) => r.slug));
    for (const slug of snapshot.watchlist) {
      assert.ok(slugs.has(slug), `missing watchlist slug ${slug}`);
    }
  });

  it('has 200 rows (160 early + 40 watchlist, deduped) with ranks 1..200 exactly once', () => {
    const board = buildBoard(snapshot);
    assert.equal(board.length, EARLY_ROWS + snapshot.watchlist.length);
    assert.deepEqual(
      board.map((r) => r.rank),
      Array.from({ length: board.length }, (_, i) => i + 1),
    );
  });

  it('implied values are non-increasing with rank', () => {
    const board = buildBoard(snapshot);
    for (let i = 1; i < board.length; i++) {
      assert.ok(
        board[i].implied_value_usd <= board[i - 1].implied_value_usd,
        `rank ${i + 1} implied ${board[i].implied_value_usd} > rank ${i} ${board[i - 1].implied_value_usd}`,
      );
    }
  });

  it('passes the gate checker', () => {
    assert.equal(boardIssue(buildBoard(snapshot), snapshot), null);
  });

  it('live rows are set aside, not on the board', () => {
    const { board, radar } = buildRadar(snapshot);
    assert.equal(radar.live.length, LIVE_ROWS);
    const boardSlugs = new Set(board.map((r) => r.slug));
    for (const live of radar.live) assert.ok(!boardSlugs.has(live.slug));
  });
});

describe('farmability (category only, never by name)', () => {
  it('farmable categories score 1.00', () => {
    for (const c of ['Lending', 'Dexs', 'Yield', 'Liquid Staking', 'Restaking', 'Derivatives', 'CDP', 'RWA', 'Insurance']) {
      assert.equal(farmability(c), 1.0, c);
    }
  });
  it('curator / allocator / governance-incentive categories score 0.85', () => {
    for (const c of ['Risk Curators', 'Onchain Capital Allocator', 'Staking Pool', 'Governance Incentives', 'CeDeFi']) {
      assert.equal(farmability(c), 0.85, c);
    }
  });
  it('yield aggregators stay farmable at 1.00 — vault deposits are the farm', () => {
    assert.equal(farmability('Yield Aggregator'), 1.0);
    assert.equal(farmability('Yield'), 1.0);
  });
  it('bridges score 0.15 and CEX 0.10', () => {
    assert.equal(farmability('Bridge'), 0.15);
    assert.equal(farmability('Canonical Bridge'), 0.15);
    assert.equal(farmability('CEX'), 0.1);
  });
  it('a bridge with huge TVL implies less than the same TVL in Lending', () => {
    const bridge = impliedValue(proto({ category: 'Bridge', tvl_usd: 7_900_000_000 }), snapshot.as_of, MODEL);
    const lending = impliedValue(proto({ category: 'Lending', tvl_usd: 7_900_000_000 }), snapshot.as_of, MODEL);
    assert.ok(bridge.implied < lending.implied);
    assert.equal(bridge.farmMult, 0.15);
    assert.equal(lending.farmMult, 1.0);
  });
  it('no protocol-name special-casing: same fields, different name, same implied', () => {
    const a = impliedValue(proto({ slug: 'alpha', name: 'Alpha' }), snapshot.as_of, MODEL);
    const b = impliedValue(proto({ slug: 'beta', name: 'Beta' }), snapshot.as_of, MODEL);
    assert.equal(a.implied, b.implied);
  });
});

describe('age multiplier', () => {
  it('peaks at 1.00 between 90 and 540 days', () => {
    assert.equal(ageMultiplier(365, MODEL), 1.0);
    assert.equal(ageMultiplier(200, MODEL), 1.0);
  });
  it('is below peak for very young protocols', () => {
    const young = ageMultiplier(30, MODEL);
    assert.ok(young >= 0.7 && young < 1.0);
  });
  it('fades to 0.75 past 3 years', () => {
    assert.equal(ageMultiplier(2000, MODEL), 0.75);
  });
  it('unknown age scores 0.85', () => {
    assert.equal(ageMultiplier(null, MODEL), 0.85);
  });
});

describe('growth cap', () => {
  it('a +4448% week is capped, not believed', () => {
    const v = impliedValue(proto({ change_7d: 4448 }), snapshot.as_of, MODEL);
    assert.equal(v.growthPct, 100);
    assert.ok(Number.isFinite(v.implied));
  });
  it('a -60% week is floored at -50', () => {
    const v = impliedValue(proto({ change_7d: -80 }), snapshot.as_of, MODEL);
    assert.equal(v.growthPct, -50);
  });
  it('null change_7d is treated as 0', () => {
    const v = impliedValue(proto({ change_7d: null }), snapshot.as_of, MODEL);
    assert.equal(v.growthPct, 0);
    assert.equal(v.growthMult, 1.0);
  });
});

describe('farm steps', () => {
  it('every board row has 7 steps, each 20-600 chars', () => {
    const board = buildBoard(snapshot);
    for (const row of board) {
      assert.ok(row.farm_steps.length >= 3 && row.farm_steps.length <= 12, row.slug);
      for (const step of row.farm_steps) {
        assert.ok(step.length >= 20 && step.length <= 600, `${row.slug}: ${step.length} chars`);
      }
    }
  });
  it('steps are category-specific, not generic filler', () => {
    const lending = farmSteps(proto({ category: 'Lending' }), 365).map((s) => s.text);
    const bridge = farmSteps(proto({ category: 'Bridge' }), 365).map((s) => s.text);
    assert.notDeepEqual(lending, bridge);
    assert.ok(lending.some((t) => /borrow/i.test(t)), 'lending steps mention borrowing');
    assert.ok(bridge.some((t) => /bridge.{0,40}back/i.test(t)), 'bridge steps mention bridging back');
  });
  it('steps never ask the user to pay to claim', () => {
    const board = buildBoard(snapshot);
    for (const row of board) {
      for (const step of row.farm_steps) {
        // "never pay to claim" is the warning itself; anything else that
        // tells the user to pay to claim is a failure.
        assert.ok(!/(?<!never )pay to claim/i.test(step), `${row.slug}: ${step}`);
      }
    }
  });
});

describe('rankability', () => {
  it('a CEX is not rankable even pre-token', () => {
    assert.equal(isRankable(proto({ category: 'CEX' })), false);
  });
  it('a pre-token lending protocol above the floor is rankable', () => {
    assert.equal(isPreToken(proto()), true);
    assert.equal(isRankable(proto()), true);
  });
  it('a protocol with a live token is pre-token false', () => {
    assert.equal(isPreToken(proto({ mcap_usd: 100_000_000 })), false);
  });
});

describe('model metadata', () => {
  it('reports radar-2', () => {
    assert.equal(MODEL_VERSION, 'radar-2');
  });
  it('dataScript carries no network URL', () => {
    const { radar } = buildRadar(snapshot);
    const script = dataScript(radar);
    assert.ok(!/https?:\/\//.test(script), 'data.js must not contain http/https');
    assert.ok(!/keypair|private key/i.test(script), 'data.js must not leak key material');
  });
});

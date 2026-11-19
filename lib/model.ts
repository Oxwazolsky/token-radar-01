// Token Radar model, version radar-2: one snapshot in, one ranked board out.
//
// What changed from the starter's flat model, and why:
//
// 1. No flat multiple. The starter priced every pre-token protocol at 0.25 x TVL, as if a lending
//    market, a DEX and a bridge all tokenise at the same value per dollar of TVL. This snapshot
//    itself says otherwise: it also carries the live-token protocols, and for each category the
//    median market-cap / TVL of the protocols whose token already trades is a peer multiple
//    measured from the snapshot's own figures. A pre-token protocol is priced at its own
//    category's peer multiple (the global peer median when a category has too few live peers),
//    clamped so one thin category cannot dominate the board. Nothing is hand-set per protocol
//    and no name is special-cased: re-run this on a future snapshot and the multiples move with it.
//
// 2. Growth is asymmetric. A 7-day TVL fall is a stronger signal than the same rise: capital
//    leaving is observable behaviour, capital arriving in a week can be rented. Positive growth
//    is weighted 0.45, negative growth 0.65, both clamped before use.
//
// 3. Maturity saturates. Running a long time while recording no token raises the value of the
//    record, but with diminishing returns: 0.65 + 0.35 x (1 - exp(-age / 730 days)), not a
//    straight line that pays forever for age alone.
//
// 4. Breadth is a small bonus only: each doubling of the chain count adds 4%, capped at three
//    doublings. Distribution helps; it never carries a ranking.
//
//    implied = round( tvl x peer_multiple(category) x growth_multiplier
//                     x maturity_multiplier x breadth_multiplier ), at least 1.
//
// 5. A separate launch score (0-100) answers the different question "how launch-like is this
//    record?", from five snapshot-only parts: how often this category's protocols in the
//    snapshot already record a token, how long this one has run recording none, its scale,
//    its 7-day momentum, and its chain breadth. It is shown beside the value, never multiplied
//    into it, so a reader can tell "worth a lot if it launches" from "looks close to launching".
//
// Wording rule the board keeps: a protocol "records no token" (its gecko_id, symbol and market
// cap are all null in this snapshot). The board never claims it has no token, and an implied
// value is a conditional estimate - what a token could be worth if one were issued against
// today's record - not a prediction that one will be issued.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  peer_min: number;
  peer_floor: number;
  peer_cap: number;
  fallback_multiple: number;
  growth_weight_pos: number;
  growth_weight_neg: number;
  growth_floor: number;
  growth_cap: number;
  maturity_base: number;
  maturity_range: number;
  maturity_tau_days: number;
  breadth_per_doubling: number;
  breadth_max_doublings: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  peer_min: 4,
  peer_floor: 0.08,
  peer_cap: 1.5,
  fallback_multiple: 0.3,
  growth_weight_pos: 0.45,
  growth_weight_neg: 0.65,
  growth_floor: -60,
  growth_cap: 120,
  maturity_base: 0.65,
  maturity_range: 0.35,
  maturity_tau_days: 730,
  breadth_per_doubling: 0.04,
  breadth_max_doublings: 3,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by implied value. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Per-category peer evidence measured from the snapshot's live-token protocols. */
export interface PeerStat {
  category: string;
  live_count: number;
  ratio_count: number;
  pre_count: number;
  median_multiple: number | null;
  tokenized_share: number;
}

/** The five parts of the launch score, each 0..1 before weighting. */
export interface LaunchParts {
  category: number;
  age: number;
  scale: number;
  momentum: number;
  breadth: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  launch_score: number;
  launch_band: string;
  launch_parts: LaunchParts;
  risks: string[];
  model: {
    peer_multiple: number;
    peer_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  launch_score: number;
  launch_band: string;
  launch_parts: LaunchParts;
  risks: string[];
  peer_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the peer evidence and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  high_launch_size: number;
  global_peer_multiple: number;
  peers: PeerStat[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list, or null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Peer evidence per category, measured from this snapshot alone: for every category, the live
 * protocols' market-cap / TVL ratios (their median is the peer multiple), how many protocols
 * record a token against how many record none, and the share that already record one.
 */
export function peerStats(snapshot: Snapshot): { byCategory: Map<string, PeerStat>; globalMultiple: number; globalShare: number } {
  const ratios = new Map<string, number[]>();
  const counts = new Map<string, { live: number; pre: number }>();
  const allRatios: number[] = [];
  let liveTotal = 0;
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorised';
    const c = counts.get(key) ?? { live: 0, pre: 0 };
    if (isPreToken(p)) {
      c.pre += 1;
    } else {
      c.live += 1;
      liveTotal += 1;
      if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
        const r = p.mcap_usd / p.tvl_usd;
        if (!ratios.has(key)) ratios.set(key, []);
        ratios.get(key)!.push(r);
        allRatios.push(r);
      }
    }
    counts.set(key, c);
  }
  const globalMultiple = median(allRatios) ?? MODEL.fallback_multiple;
  const byCategory = new Map<string, PeerStat>();
  for (const [category, c] of counts) {
    const total = c.live + c.pre;
    byCategory.set(category, {
      category,
      live_count: c.live,
      ratio_count: (ratios.get(category) ?? []).length,
      pre_count: c.pre,
      median_multiple: median(ratios.get(category) ?? []),
      tokenized_share: total > 0 ? c.live / total : 0,
    });
  }
  return { byCategory, globalMultiple, globalShare: snapshot.protocols.length > 0 ? liveTotal / snapshot.protocols.length : 0 };
}

/** The peer multiple one protocol is priced at: its category's median when the evidence is thick enough. */
export function peerMultipleFor(p: SnapshotProtocol, peers: ReturnType<typeof peerStats>, model: ModelConstants): { multiple: number; peerCount: number } {
  const stat = peers.byCategory.get(p.category ?? 'Uncategorised');
  // The threshold counts priced peers - peers that carry both a market cap and a TVL - not
  // merely protocols that record a token: one priced peer is an anecdote, not a multiple.
  if (stat !== undefined && stat.median_multiple !== null && stat.ratio_count >= model.peer_min) {
    return { multiple: clamp(stat.median_multiple, model.peer_floor, model.peer_cap), peerCount: stat.ratio_count };
  }
  return { multiple: clamp(peers.globalMultiple, model.peer_floor, model.peer_cap), peerCount: stat?.ratio_count ?? 0 };
}

/** The growth multiplier: positive growth weighted less than the same fall. */
export function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; mult: number } {
  const pct = clamp(finite(change7d, 0), model.growth_floor, model.growth_cap);
  const weight = pct >= 0 ? model.growth_weight_pos : model.growth_weight_neg;
  return { pct, mult: Math.max(0.4, 1 + (pct / 100) * weight) };
}

/** The maturity multiplier: saturating in age, so age alone never pays forever. */
export function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const days = age ?? model.unknown_age_days;
  return model.maturity_base + model.maturity_range * (1 - Math.exp(-Math.max(0, days) / model.maturity_tau_days));
}

/** The breadth multiplier: 4% per doubling of the chain count, capped at three doublings. */
export function breadthMultiplier(chains: string[], model: ModelConstants): number {
  const doublings = Math.min(model.breadth_max_doublings, Math.log2(Math.max(1, chains.length)));
  return 1 + model.breadth_per_doubling * doublings;
}

/** Every multiplier and the implied value one protocol gets under `model` and the snapshot's peers. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  peers: ReturnType<typeof peerStats>,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; peerMultiple: number; peerCount: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, peerCount } = peerMultipleFor(protocol, peers, model);
  const { pct, mult: growthMult } = growthMultiplier(protocol.change_7d, model);
  const maturityMult = maturityMultiplier(age, model);
  const breadthMult = breadthMultiplier(protocol.chains, model);
  // The implied value is computed from the rounded multipliers the board publishes, so the
  // dashboard's recomputation from data.js (peer_multiple and the three multipliers, all
  // round4) lands on exactly the number board.json carries, at any TVL.
  const implied = Math.max(1, Math.round(protocol.tvl_usd * round4(multiple) * round4(growthMult) * round4(maturityMult) * round4(breadthMult)));
  return { implied, growthPct: pct, growthMult, maturityMult, breadthMult, peerMultiple: multiple, peerCount, age };
}

/** The launch score's five parts and its weighted 0..100 total, all from snapshot fields. */
export function launchScore(
  p: SnapshotProtocol,
  age: number | null,
  peers: ReturnType<typeof peerStats>,
  model: ModelConstants,
): { score: number; band: string; parts: LaunchParts } {
  const stat = peers.byCategory.get(p.category ?? 'Uncategorised');
  const days = age ?? model.unknown_age_days;
  const parts: LaunchParts = {
    category: stat !== undefined ? stat.tokenized_share : peers.globalShare,
    age: 1 - Math.exp(-Math.max(0, days) / 540),
    scale: clamp(Math.log10(Math.max(1, p.tvl_usd) / 5_000_000) / 2, 0, 1),
    momentum: clamp((finite(p.change_7d, 0) + 20) / 50, 0, 1),
    breadth: clamp(p.chains.length / 5, 0, 1),
  };
  const score = Math.round(100 * (0.3 * parts.category + 0.25 * parts.age + 0.2 * parts.scale + 0.15 * parts.momentum + 0.1 * parts.breadth));
  const band = score >= 65 ? 'High' : score >= 45 ? 'Elevated' : score >= 30 ? 'Watch' : 'Early';
  return { score, band, parts };
}

/** The risks a reader should price in, each derived from this protocol's own record. */
export function risksFor(p: SnapshotProtocol, age: number | null, floorUsd: number): string[] {
  const risks: string[] = ['A launch is not promised: this protocol records no token in the snapshot, and it may never issue one.'];
  if (p.change_7d === null) risks.push('DefiLlama reports no 7-day TVL change for it, so its momentum here is a neutral assumption, not a reading.');
  else if (p.change_7d < -10) risks.push(`Its TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in seven days: capital is leaving, and a launch into outflows usually prices worse.`);
  else if (p.change_7d > 40) risks.push(`Its TVL rose ${p.change_7d.toFixed(1)}% in seven days: growth that fast can be rented mercenary capital that leaves before any launch.`);
  if (age === null) risks.push('DefiLlama gives no first-tracked date for it, so its track record length here is assumed, not known.');
  else if (age < 180) risks.push(`It has been tracked for only ${age} days: a short record, with little evidence the TVL survives a market drawdown.`);
  if (p.chains.length <= 1) risks.push('Its activity sits on a single chain, so one chain outage or incentive ending touches the whole position.');
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('bridge')) risks.push('Bridge contracts are a frequent exploit target: keep the farmed amount small and move profits off the bridge regularly.');
  else if (c.includes('curator') || c.includes('allocator')) risks.push('A curator or allocator chooses the underlying strategies: the risk is theirs as well as the venues they pick.');
  else if (c.includes('restak') || c.includes('liquid staking')) risks.push('Staking and restaking carry slashing and unbonding risk: the receipt can be worth less, or locked, when you want out.');
  else if (c.includes('perpetual') || c.includes('derivative')) risks.push('Margin positions can be liquidated: farm with a hedge and a health buffer, never with the whole stack at risk.');
  if (p.tvl_usd < floorUsd) risks.push('It sits below the watchlist floor, so it is smaller and less proven than the watchlist rows: size the farm accordingly.');
  return risks.slice(0, 4);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const peers = peerStats(snapshot);
  const index = bySlug(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: below-floor pre-token protocols ranked by their own preliminary implied
  // value, not by raw TVL - a smaller protocol in a richly-priced category with real momentum
  // outranks a larger stagnant one. That is the radar's whole job.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, implied: impliedValue(p, snapshot.as_of, model, peers).implied }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, peers);
    const launch = launchScore(p, v.age, peers, model);
    return { p, ...v, launch };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    launch_score: s.launch.score,
    launch_band: s.launch.band,
    launch_parts: { category: round4(s.launch.parts.category), age: round4(s.launch.parts.age), scale: round4(s.launch.parts.scale), momentum: round4(s.launch.parts.momentum), breadth: round4(s.launch.parts.breadth) },
    risks: risksFor(s.p, s.age, snapshot.floor_usd),
    model: {
      peer_multiple: round4(s.peerMultiple),
      peer_count: s.peerCount,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow no more than $${Math.round(capital / 3)} against it so the health factor stays comfortably above liquidation, and keep both legs open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap half of $${capital} for the pool's second asset in ${name} on ${chain}, add the pair as liquidity to its main pool, and keep the LP position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in one app on the destination chain in the same session, so the trip counts as real usage.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain}, keep the staking receipt in the wallet, and note the unbonding period before you need the funds back.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade (long and short of near-equal size), so the farm is the trading activity, not price exposure.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and place one small position in each of two active markets, keeping the stakes small enough to repeat weekly.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into one ${name} vault on ${chain}, keep the vault shares, and read the vault's strategy page so you know which venues your deposit is routed to.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the stable position in the farming wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain} after reading its attestation page, and hold the asset in the farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for the longest term its page offers and keep the policy receipt.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s main yield position on ${chain} and keep the position open rather than rotating it weekly.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain}, complete its core action once (a deposit, a swap or a mint, whichever its app leads with), and keep the position open.`;
}

/** The category's weekly qualifying action: specific enough to repeat, cheap enough to sustain. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Repeat one real action on ${name} each week: add a small amount of collateral, repay a slice of the borrow, or borrow a slice more, keeping the health factor safe.`;
  if (c.includes('dex')) return `Make one swap a week through ${name} and, once a month, add a little liquidity to the same pool, so the wallet shows both trading and providing.`;
  if (c.includes('bridge')) return `Bridge a small amount (about $20) through ${name} once a week, alternating direction, and use a destination app after each trip.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open and close one small hedged trade a week on ${name}, so the wallet builds a trading history without carrying directional risk.`;
  return `Make one qualifying action on ${name} each week - a deposit, a swap, a vote or a claim of accrued rewards, whichever its app records - and vary the amount slightly.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * It includes the two steps slogan plans skip: a monthly risk check and a claim-safety step.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm ${p.name} with, keep its seed phrase offline, and never connect it to sites you have not checked.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one weekly snapshot, and check ${p.name}'s own points or rewards page once a week from the link its app publishes.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a month, review the position: check its health or value against what you put in, revoke token approvals you no longer use, and cut the position if TVL has fallen for four straight weeks.`,
      cost: 'under $2 of gas for revocations',
      time: '10 minutes a month',
    },
    {
      text: `When a claim or conversion is announced, claim only from the link ${p.name} itself publishes in its app or docs, and never pay a fee or connect a second wallet to claim.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates, the amounts and every transaction hash in a farm log, with your exit rule written down, so you can repeat the position or unwind it without guessing.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    launch_score: row.launch_score,
    launch_band: row.launch_band,
    launch_parts: row.launch_parts,
    risks: row.risks,
    peer_multiple: row.model.peer_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerStats(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    high_launch_size: board.filter((r) => r.launch_score >= 65).length,
    global_peer_multiple: round4(clamp(peers.globalMultiple, model.peer_floor, model.peer_cap)),
    peers: [...peers.byCategory.values()]
      .filter((s) => s.median_multiple !== null)
      .sort((a, b) => b.ratio_count - a.ratio_count)
      .slice(0, 14)
      .map((s) => ({ ...s, median_multiple: round4(clamp(s.median_multiple!, model.peer_floor, model.peer_cap)), tokenized_share: round4(s.tokenized_share) })),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

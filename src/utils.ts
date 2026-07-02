import { Groups, Entry, Knockout, TeamStanding, ScoreBreakdown, ParticipantScore } from "./types";
import { GD, FIFA_THIRD_PLACE_MATRIX, THIRD_PLACE_PLACEHOLDERS } from "./data";

export function calcGroupStandings(g: string, grupos: Groups): TeamStanding[] {
  const ms = GD[g] || [];
  const teams: Record<string, TeamStanding> = {};

  // Initialize teams
  ms.forEach((m) => {
    m.forEach((t) => {
      if (!teams[t]) {
        teams[t] = { name: t, pts: 0, gf: 0, gc: 0, gd: 0, pg: 0, pe: 0, pp: 0, pj: 0 };
      }
    });
  });

  // Accumulate scores
  ms.forEach((m, i) => {
    const sc = grupos[`${g}-${i}`];
    if (!sc || sc.h === "" || sc.h === undefined || sc.a === "" || sc.a === undefined) return;
    const h = parseInt(sc.h, 10);
    const a = parseInt(sc.a, 10);
    if (isNaN(h) || isNaN(a)) return;

    teams[m[0]].gf += h;
    teams[m[0]].gc += a;
    teams[m[0]].gd += h - a;
    teams[m[0]].pj = (teams[m[0]].pj || 0) + 1;

    teams[m[1]].gf += a;
    teams[m[1]].gc += h;
    teams[m[1]].gd += a - h;
    teams[m[1]].pj = (teams[m[1]].pj || 0) + 1;

    if (h > a) {
      teams[m[0]].pts += 3;
      teams[m[0]].pg = (teams[m[0]].pg || 0) + 1;
      teams[m[1]].pp = (teams[m[1]].pp || 0) + 1;
    } else if (h === a) {
      teams[m[0]].pts += 1;
      teams[m[1]].pts += 1;
      teams[m[0]].pe = (teams[m[0]].pe || 0) + 1;
      teams[m[1]].pe = (teams[m[1]].pe || 0) + 1;
    } else {
      teams[m[1]].pts += 3;
      teams[m[1]].pg = (teams[m[1]].pg || 0) + 1;
      teams[m[0]].pp = (teams[m[0]].pp || 0) + 1;
    }
  });

  return Object.values(teams).sort((a, b) => {
    return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name);
  });
}

export function getEntryQualifiers(grupos: Groups): { m: string; a: string; b: string }[] {
  const cl: Record<string, string | null> = {};
  const stCache: Record<string, TeamStanding[]> = {};

  Object.keys(GD).forEach((g) => {
    const st = calcGroupStandings(g, grupos);
    stCache[g] = st;
    cl[`1${g}`] = st[0] ? st[0].name : null;
    cl[`2${g}`] = st[1] ? st[1].name : null;
    cl[`3${g}`] = st[2] ? st[2].name : null;
  });

  const complete = (g: string) => {
    const ms = GD[g] || [];
    let c = 0;
    ms.forEach((_, i) => {
      const sc = grupos[`${g}-${i}`];
      if (sc && sc.h !== "" && sc.h !== undefined && sc.a !== "" && sc.a !== undefined) c++;
    });
    return c === 6;
  };

  const thirds = Object.keys(GD)
    .filter(complete)
    .map((g) => {
      const r = stCache[g][2];
      return r ? { g, name: r.name, pts: r.pts, gd: r.gd, gf: r.gf } : null;
    })
    .filter((t): t is { g: string; name: string; pts: number; gd: number; gf: number } => !!t && !!t.name)
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.g.localeCompare(b.g));

  const top8 = thirds.slice(0, 8);
  const key = top8.map((t) => t.g).sort().join("");
  const row = key.length === 8 ? FIFA_THIRD_PLACE_MATRIX[key] : null;
  const used: Record<string, boolean> = {};

  const th = (slot: string) => {
    if (!row || !row[slot]) return THIRD_PLACE_PLACEHOLDERS[slot] || `Best 3rd (${slot})`;
    const g = row[slot].replace("3", "");
    const name = cl[`3${g}`] || `3rd Group ${g}`;
    if (used[name]) {
      for (let i = 0; i < thirds.length; i++) {
        if (thirds[i].name && !used[thirds[i].name]) {
          used[thirds[i].name] = true;
          return thirds[i].name;
        }
      }
    }
    used[name] = true;
    return name;
  };

  const t = (g: string) => cl[`1${g}`] || `1 ${g}`;
  const r = (g: string) => cl[`2${g}`] || `2 ${g}`;

  return [
    { m: "M73", a: r("A"), b: r("B") },
    { m: "M74", a: t("E"), b: th("E") },
    { m: "M75", a: t("F"), b: r("C") },
    { m: "M76", a: t("C"), b: r("F") },
    { m: "M77", a: t("I"), b: th("I") },
    { m: "M78", a: r("E"), b: r("I") },
    { m: "M79", a: t("A"), b: th("A") },
    { m: "M80", a: t("L"), b: th("L") },
    { m: "M81", a: t("D"), b: th("D") },
    { m: "M82", a: t("G"), b: th("G") },
    { m: "M83", a: r("K"), b: r("L") },
    { m: "M84", a: t("H"), b: r("J") },
    { m: "M85", a: t("B"), b: th("B") },
    { m: "M86", a: t("J"), b: r("H") },
    { m: "M87", a: t("K"), b: th("K") },
    { m: "M88", a: r("D"), b: r("G") }
  ];
}

export function scorePublicEntry(entry: Entry, realKnockout: Knockout, realGrupos: Groups): { pts: number; bk: ScoreBreakdown } {
  let pts = 0;
  const bk: ScoreBreakdown = { grupos: 0, r16: 0, r8: 0, r4: 0, r2: 0, final: 0, pichi: 0 };

  // Group stage score
  const ug = entry.grupos || {};
  Object.keys(realGrupos).forEach((id) => {
    const rv = realGrupos[id];
    const uv = ug[id];
    if (!rv || rv.h === "" || rv.a === "" || !uv || uv.h === "" || uv.a === "") return;
    const rh = parseInt(rv.h, 10);
    const ra = parseInt(rv.a, 10);
    const uh = parseInt(uv.h, 10);
    const ua = parseInt(uv.a, 10);
    if (isNaN(rh) || isNaN(ra) || isNaN(uh) || isNaN(ua)) return;

    if (rh === uh && ra === ua) {
      pts += 5;
      bk.grupos += 5;
    } else {
      const rr = rh > ra ? "H" : rh < ra ? "A" : "E";
      const ur = uh > ua ? "H" : uh < ua ? "A" : "E";
      if (rr === ur) {
        pts += 2;
        bk.grupos += 2;
      }
    }
  });

  // Round of 32 (r16) scoring
  const realR16 = (realKnockout.r16 || []).filter(Boolean);
  if (realR16.length) {
    const quals = getEntryQualifiers(entry.grupos || {});
    const userR16: string[] = [];
    quals.forEach((p) => {
      if (p.a) userR16.push(p.a);
      if (p.b) userR16.push(p.b);
    });
    realR16.forEach((t) => {
      if (userR16.includes(t)) {
        pts += 5;
        bk.r16 += 5;
      }
    });
  }

  // Knockout stage helper
  const scoreStage = (rkoKey: keyof Knockout, ukoKey: "r16" | "r8" | "r4" | "r2", p: number, bkey: keyof ScoreBreakdown) => {
    const rList = (realKnockout[rkoKey] as string[]) || [];
    const uObj = entry.knockout[ukoKey] || {};
    const uArr = Array.isArray(uObj) ? uObj : Object.values(uObj);
    rList.forEach((t) => {
      if (t && uArr.includes(t)) {
        pts += p;
        (bk[bkey] as number) += p;
      }
    });
  };

  scoreStage("r8", "r16", 5, "r8");
  scoreStage("r4", "r8", 5, "r4");
  scoreStage("r2", "r4", 5, "r2");

  // Finals
  const rf = realKnockout.final || { champ: "", sub: "", third: "" };
  const uf = entry.knockout.final || { champ: "", sub: "", third: "" };

  if (rf.champ && [uf.champ, uf.sub].includes(rf.champ)) {
    pts += 10;
    bk.final += 10;
  }
  if (rf.sub && [uf.champ, uf.sub].includes(rf.sub)) {
    pts += 10;
    bk.final += 10;
  }
  if (rf.champ && uf.champ === rf.champ) {
    pts += 20;
    bk.final += 20;
  }
  if (rf.third && uf.third === rf.third) {
    pts += 5;
    bk.final += 5;
  }

  // Pichichi
  const rp = realKnockout.pichi || { world: "", esp: "" };
  const up = entry.pichichi || { world: "", esp: "" };

  if (rp.world && up.world && rp.world.toLowerCase().trim() === up.world.toLowerCase().trim()) {
    pts += 7;
    bk.pichi += 7;
  }
  if (rp.esp && up.esp && rp.esp.toLowerCase().trim() === up.esp.toLowerCase().trim()) {
    pts += 5;
    bk.pichi += 5;
  }

  return { pts, bk };
}
